# Agent Note: Share the bounded Windows atomic replace with storage-json

Status: implemented

English | [中文](2026-09-16-storage-json-windows-atomic-replace-retry.zh.md)

## Problem

The JSON storage backend published every document with a bare `rename()`. On Windows that replacement can be rejected with `EACCES`, `EBUSY`, or `EPERM` while another component holds the target, and `@deepseek-ai/dsh-atomic-write` already retried exactly those three codes for its own replacement. `packages/storage/storage-json/src/atomic.ts` never received that retry: it has one commit (`1529be6fd4`, 2026-07-24) predating the retry's arrival in `3e56eaaa0f` (2026-08-29), whose archived [retry decision record](../../archived/bug-fix/2026-08-29-windows-atomic-replace-retry.md) states that `writeFileAtomic` owns replacement retry because every file-backed store needs the same guarantee. The JSON backend is a file-backed store that was never migrated, so the two atomic-replacement implementations disagreed on one step with no recorded reason.

Four `packages/session/session-projection-cache` assertions failed only on the `windows node 24 / coverage` lane — jobs 104534944084 (PR #155) and 104635347170 (PR #158) — while Linux stayed green on the same commits. Per-test durations were bimodal: identical helper invocations either finished in 141–147 ms or spent the full 5000 ms `vi.waitFor` budget, never anything between. A write that merely landed late would fall between. In every failure an earlier write had landed and a later replace-write had not, and the file left on disk was a complete, well-formed prior document rather than a partial one — the state a thrown `rename` leaves, because the publish protocol never touches the target before the rename. Every checkpoint write is fire-and-forget through `flushSoft`, which retries at no level, so one rejection is permanent.

The failures were also unattributable. `flushSoft` catches the error and reports it through `ctx.logger.warn`; `LoggerService` registers only its ring-buffer exporter and these compositions register none, so the errno reached no output. A read-back poll alone cannot separate a thrown write from a write that has not landed yet, which is how the archived [Windows coverage budget note](../../archived/process/2026-08-31-windows-coverage-flaky-test-budgets.md) read the same assertions as a drain outrunning a 40 ms settle and widened them to `vi.waitFor(…, { timeout: 5_000 })`. They still fail at 125 times that budget while sibling invocations of the same helper finish in 141 ms.

## Decision

`renameAtomicTemp` is a public export of [`@deepseek-ai/dsh-atomic-write`](../../../../packages/util/atomic-write/src/index.ts): the bounded-retry replacement step, published for file-backed stores that render and fsync their own temp sibling. [`writeAtomic`](../../../../packages/storage/storage-json/src/atomic.ts) commits through it instead of calling `rename` directly, so `EACCES`, `EBUSY`, and `EPERM` on Windows retry up to eight times with delays growing from 20 ms to 200 ms — at most about 1.1 seconds — while the same complete temp file stays the rename source. Other codes and other platforms still fail on the first attempt.

Only the rename step is shared. `writeFileAtomic` deliberately fsyncs neither the file nor the parent directory (`TODO(settings-atomic-durability)`), while `writeAtomic` does both as storage-json's crash-durability contract, so the JSON backend keeps its own temp write and fsyncs around the shared commit rather than adopting `writeFileAtomic` wholesale.

The four read-back sites now attribute a fail-soft write. [`tests/durable-write.ts`](../../../../packages/session/session-projection-cache/tests/durable-write.ts) installs a pass-through `ctx.logger.warn` spy and races the first report against the existing read-back poll, so a thrown durable write fails immediately with its errno instead of after five seconds with a stale-value difference. The read-back assertions and their five-second budget are unchanged; the two specs that deliberately provoke a write failure keep their own suppressing spies, and their blocking directory yields a non-transient code that still fails fast.

## Alternatives considered

**Widen the poll budget again.** Rejected by its own record: the previous widening from 40 ms to 5 s was justified by a drain-latency reading of these exact assertions, and they now fail at 125 times the budget while identical sibling calls finish in 141 ms. Any further widening trades a real lost write for a slower lane.

**Give the tests a deterministic read-back barrier derived from the write chain.** This is the correct fix for a visibility delay, which the bimodal durations rule out. A barrier would make the failing branch wait exactly as long and report the same stale value, because the write never completes.

**Replace `writeAtomic` with `writeFileAtomic`.** Rejected: `writeFileAtomic` omits both fsyncs by design, so adopting it would silently drop storage-json's crash-durability contract to reuse a step that can be shared on its own.

**Duplicate the retry inside storage-json.** Rejected: two copies of a Windows errno set and a backoff schedule drift, and the asymmetry that caused this defect was exactly one implementation missing what the other had. Publishing the step keeps one owner.

**Retry inside `flushSoft`.** Rejected: the projection cache would then replay a whole checkpoint render for a filesystem condition it cannot observe, and every other file-backed store would still be exposed. Replacement retry belongs to the replacement.

## Consequences

A Windows component briefly holding a unit or record document delays one JSON publish by at most about 1.1 seconds instead of dropping it, and the delay stays inside the 5 s read-back budget these specs already use. Readers see the complete previous document throughout, and success is still one atomic rename. Exhausting the budget rethrows the final filesystem error after removing the temp sibling, so a permanently blocked target still fails, and `flushSoft` still keeps that failure off the event path.

The `dsh-atomic-write` surface grows by one function, and `storage-json` gains it as a workspace peer plus a tsconfig project reference. Existing coverage is sufficient: [`atomic-write.spec.ts`](../../../../packages/util/atomic-write/tests/atomic-write.spec.ts) already pins the retried codes, retry exhaustion, a non-transient code, and non-Windows behavior against a mocked `platform` and fake timers, because a real transient rename rejection cannot be provoked on macOS or Linux.

Verification of the Windows branch itself is CI-only. The acceptance criterion for [T19](../../../../wayfinder/repo-infra/tickets/T19-windows-projection-cache-durability.md) is two consecutive real `windows node 24 / coverage` runs with both specs green and no Linux regression; local macOS runs can only show the absence of a regression.
