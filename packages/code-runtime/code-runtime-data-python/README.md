# @deepseek-ai/dsh-code-runtime-data-python

English | [中文](README.zh.md)

CPython-subprocess implementation of the [`@deepseek-ai/dsh-code-runtime`](../code-runtime/README.md) seam for the data-agent. `DataPythonCodeRuntime` runs each program in ONE fresh `python3` subprocess with pandas/numpy available, talks the existing fd-3 JSON-lines wire protocol owned by [`@deepseek-ai/dsh-code-runtime-python`](../code-runtime-python/README.md), and returns `{ value, logs, error? }`. **Containment, not a security boundary**: the trust posture is binding-only I/O plus resource limits — the same posture as the [`worker-thread`](../code-runtime-worker-thread/README.md) backend, traded from a Node isolate to a fresh CPython process so model code is Python instead of TypeScript.

## Config

```yaml
- id: code-runtime
  name: '@deepseek-ai/dsh-code-runtime-data-python'
  config:
    cpuSeconds: 30                # RLIMIT_CPU seconds applied to the bootstrap before model code runs
    addressSpaceBytes: 2147483648  # RLIMIT_AS bytes capping the child address space (Linux-enforced; macOS ignores)
    maxWallMs: 600000             # wall-clock ceiling; the host SIGKILLs the child on expiry
    maxLogBytes: 1048576          # shared byte budget for captured log text (host + child ledgers) — 1 MiB
    maxValueBytes: 67108864       # byte cap for the serialized completion value — 64 MiB
    pythonPath: python3           # CPython interpreter invoked for the bootstrap
```

Every field is validated and defaulted; `cpuSeconds`, `addressSpaceBytes`, and `maxWallMs` are positive finite numbers, `maxWallMs` is additionally at most `MAX_TIMER_DELAY_MS` (Node's `setTimeout` clamp), `maxLogBytes` and `maxValueBytes` are safe integers of at least four bytes, `pythonPath` is a string, and there are no other tunables.

## Design

- **One fresh CPython process per run, no pooling** — a program's world dies with its subprocess: no cross-run state to log, state bleed unrepresentable, runs reconstructable from the session log alone.
- **fd-3 JSON-lines wire protocol, not stdout** — Node pins the channel positionally with `stdio: ['pipe','pipe','pipe','pipe']`; the Python bootstrap reads the same `PROTOCOL_FD` constant the protocol package owns, leaving stdout/stderr free for the program's own output (captured by the host as stray logs). JSON-lines framing.
- **The host treats every inbound frame as hostile** — model code has full access to fd 3 and can post anything through it, so `validateChildFrame` shape-validates and REBUILDS each frame before the host reads it (forged extra fields never ride along, a non-number call id can never be echoed into a reply, junk drops to `undefined` rather than throwing), `createCappedLineReader` drops a line whose UTF-8 byte length exceeds the frame cap wholesale before `JSON.parse` runs, `hasUnsafeIntegerToken` rejects beyond-safe-range integer tokens, and `hasNonLosslessNumber` rejects a non-finite or negative-zero number in unbounded `call.args`. The Python side trusts host replies (the host is not model-controlled).
- **Two SEPARATE budgets, because the peer is hostile** — `maxLogBytes` meters the shared captured-log byte ledger (host + child ledgers, JSON serialization of the `logs` array), and `maxValueBytes` meters the serialized completion value ALONE. They are independent: a value is checked against `maxValueBytes` only, not against the log budget's remainder. The host rechecks the completion against `maxValueBytes` via `checkDoneValue`; the bootstrap mirrors that with `_check_value_bytes(result, max_value_bytes)` so a moderate DataFrame summary (e.g. 5 MiB) completes under the documented 64 MiB value cap rather than failing at the 1 MiB log budget. A combined overflow is `output-limit`; a lossy completion (non-finite float, bytes, non-string key) is `invalid-output`. The shared `[dsh-code-runtime-python] log capture truncated at <maxLogBytes> bytes` marker is byte-identical on both sides, so a truncated log run reads the same however the cap was hit.
- **Binding-only I/O is the primary containment layer** — the subprocess spawns with `env: {}`: no ambient credentials or harness secrets reach model code. Bindings cross as lossless JSON over fd 3; the host resolves binding names as OWN properties only (a forged `constructor` cannot walk a prototype chain), answers each call id at most once, and validates every binding resolution as lossless JSON. An optional namespace descriptor names the error constructor global and the own property that receives the failed member name; the Python side materializes and injects that real class, so `instanceof` works without hardcoding `tools` or `ToolCallError`. Declarations with invalid or colliding globals fail before a process spawns.
- **Resource limits are POSIX-only resource protection, not a security boundary** — `RLIMIT_CPU` (`cpuSeconds`) and `RLIMIT_AS` (`addressSpaceBytes`) are applied by the bootstrap before model code runs; on Windows `_apply_rlimits` is a no-op. `isolation` reports `process-rlimit` off-Windows and `process` on Windows.
- **Wall-clock ceiling backstops busy time** — `maxWallMs` is a hard `setTimeout` that `SIGKILL`s the child on expiry, ending hot synchronous loops; `RLIMIT_CPU` additionally caps CPU seconds. A timeout surfaces as `kind: 'timeout'`; a binding-await that never resolves is caught by the wall clock, not by CPU time.
- **pandas and numpy in the program namespace** — the bootstrap imports `pandas` (as `pd`/`pandas`) and `numpy` (as `np`/`numpy`) into the program's globals when available, and installs a `print` shim that streams each entry into the log ledger eagerly (so a timed-out or killed program still shows what it printed).
- **Dispose to quiescence** — teardown sets disposed, settles each live run as `abort`, and AWAITS the child's actual death (`close`/`error`) before resolving, so the run promise no longer settles while the substrate may still be dying.

## Failure kinds

A `CodeRunResult.error.kind` is one of: `worker-exit` (spawn error or the process exited before a `done`), `timeout` (wall-clock ceiling), `abort` (caller signal or runtime disposal), `output-limit` (completion value over `maxValueBytes`), `exception` (program or binding-error traceback, or a bootstrap crash), `invalid-output` (completion is not lossless JSON).

## Model Experience

This sandboxed executor has no direct model, token, or KV-cache effect: it produces a `CodeRunResult` (`{ value, logs, error? }`) and never touches a request prefix, token stream, or cache itself. Its effect is indirect, through Code Mode in [`dsh-tools`](../../core/tools/README.md), which renders this backend's exact completion value when it fits (or an explicit `invalid-output` / `output-limit` failure), plus the exact `[dsh-code-runtime-python] log capture truncated at <maxLogBytes> bytes` log marker, into a retained `run_code` result. Only the outer `run_code` result enters model context and its ordinary spill policy; binding traffic and intermediate values remain execution-local.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **`RLIMIT_AS` is Linux-only and macOS ignores `addressSpaceBytes`** — `setrlimit(RLIMIT_AS, …)` is a no-op on macOS, so the address-space cap is enforced only on Linux; on macOS a runaway program is bounded by `RLIMIT_CPU` and the wall clock, not by address space.
- **win32 isolation degrades to plain `process` with no rlimits** — on Windows `_apply_rlimits` returns early and `isolation` reports `process`; there is no CPU-second or address-space cap, only the wall clock and the binding-only `env: {}` containment.
- **Per-run CPython process spawn cost** — each run spawns a fresh interpreter (no pooling), so the interpreter startup cost is paid every run; this is the cost of zero cross-run state and is intentional.
- **`pythonPath` should be an absolute path when the interpreter is outside the OS default search path** — the subprocess spawns with `env: {}`, so `PATH` is unset and a bare `python3` resolves only through the OS default execvp search path; on hosts where the interpreter lives only under `/opt/homebrew/bin` or `/usr/local/bin`, set `pythonPath` to an absolute path. A failure to resolve surfaces as a `worker-exit` 'spawn error' at the first run, not at load.
- **Log and value budgets are separate but a value's bytes never enter the log ledger** — intermediate binding resolutions have no byte cap (a program can exhaust process memory with a value that never becomes outer output); the `maxValueBytes` cap is a rejection boundary on the completion value, not recoverable storage, so outer spill can save only the bounded logs and diagnostic returned after `output-limit`.
