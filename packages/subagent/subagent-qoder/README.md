# @deepseek-ai/dsh-subagent-qoder

This package registers the fixed `qoder` subagent provider. Each accepted run invokes the official Qoder Agent SDK in the delegating Session's workspace, resolves the Qoder PAT through the credentials seam per operation, and returns only the terminal result through the shared [`dsh-subagent`](../subagent/README.md) result contract.

## Design (terminal-only, claude-code precedent)

The provider drains the complete Qoder `query()` message stream and accepts only a successful `result` message — the Qoder `SDKResultMessage` is Claude-shaped (`subtype`/`is_error`/`result`), so the `successfulResult` extraction from the [`subagent-claude-code`](../subagent-claude-code/README.md) precedent transfers verbatim. Assistant reasoning, tool activity, and intermediate messages remain Qoder-product-local and are not copied into the parent Session: an external one-shot run is not trace-enumerable, mirroring `subagent-claude-code`/`-codex`/`-acp`/`-dsh-sdk`.

Tool/reasoning visibility for audit is **deferred** — open a follow-up only if P8/forensic confirms a need. The current P8 audit model consumes harness-level `tool/call` events (who/when/PAT-scope/Credits), not Qoder-internal trace, so a provider side-log would be orthogonal to P8. If traceability is later required, it is a core seam change (a third "external-logged" run type), not a P3 concern.

See [`wayfinder/data-agent/research/qoder-sdk-dts.md`](../../../wayfinder/data-agent/research/qoder-sdk-dts.md) for the `.d.ts`-grounded type facts and [`wayfinder/data-agent/tickets/phase-1/P3-subagent-qoder.md`](../../../wayfinder/data-agent/tickets/phase-1/P3-subagent-qoder.md) for the decision.

## Start and ownership

`start(request)` accepts a non-empty sequence of text blocks, derives the child cwd from the parent Session, resolves the PAT via `ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))`, and calls the SDK `query()`. The run is published once the `Query` exists; the worker spawn, the `system/init` wire-protocol handshake (which may throw `ProtocolVersionMismatchError` on a cross-major mismatch), and the agent loop all happen during iteration and settle through `settleRunResult` as `error` or `aborted` rather than rejecting `start()`. Only a synchronous construction failure (rare) rejects `start()` through the startup catch. `dispose()` is idempotent: it aborts the run and calls `Query.close()`.

## Auth and model

- **PAT** is resolved per operation through the credentials seam and passed explicitly via `accessToken(value)` to `options.auth` — never `accessTokenFromEnv()`, which would require the PAT in `process.env` and conflicts with intranet-security-first. MVP resolves with no address (lands the T1 global via the credentials seam fallback chain); threading a per-user `{ userId }` is the P9-future path and needs no P3 core change. PAT rotation is a human or P9-admin action via `ctx.credentials.set`; `credentials/updated` hot-reloads and the next `resolve()` picks it up with no restart and no P3 participation.
- **Model**: `options.model` from config selects a Qoder platform model (consumes the PAT holder's Qoder Credits). `resolveModel` pull-mode and BYOK (`CustomModel` → route Qoder calls to a harness-owned LLM) are documented future extensions; wiring the callback is deferred until dynamic selection or BYOK is actually needed.

## Capabilities and context

The provider advertises no start-time capabilities and reports `inheritsParentContext: false`. Qoder receives the standalone text task and the parent Session cwd, but not the parent conversation, persona, tool filter, depth policy, or structured-output contract.

## Configuration

| Key | Default | Meaning |
|---|---|---|
| `model` | — | Qoder platform model id forwarded as `options.model` (e.g. `'auto'`, `'performance'`, or a named model). Omit to let Qoder choose. |
| `disposeGraceMs` | `3000` | Positive finite grace in milliseconds, no greater than [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md). |

Production `dsh` does not install or mount this optional provider. A Profile that opts in must install `@deepseek-ai/dsh-subagent-qoder` **and `@qoder-ai/qoder-agent-sdk` (a peerDependency — the deployment provides it and owns its supply-chain review; the repo does not bundle Qoder's obfuscated, non-permissive worker)**, and mount the provider once on the host plane; loading the provider starts no Qoder worker until a tool call. The model-facing tool row is provided by [`dsh-tool-subagent`](../tool-subagent/README.md) with `provider: qoder`.

## Transport

The Qoder SDK defaults to `WorkerTransport` (an obfuscated `dist/_worker/qoder-worker-runtime.obf.mjs` downloaded at install, pinning `qoderCliVersion 1.1.25`). Unlike `subagent-claude-code`'s `ProcessTransport` (a host PATH `claude` executable), there is no external CLI to resolve or terminate; `Query.close()` is the whole teardown. Deployments should be aware of the postinstall download, the `QODERCLI_PATH`/`QODER_SKIP_DOWNLOAD` overrides, and the lack of semver guarantees on the obfuscated runtime. This workspace's `pnpm-workspace.yaml` sets `allowBuilds: '@qoder-ai/qoder-agent-sdk': false`, so the worker runtime is **not downloaded on install** — a live `query()` fails at worker spawn until the deployment runs `pnpm approve-builds @qoder-ai/qoder-agent-sdk` (or sets `QODERCLI_PATH` to an existing qodercli). Unlike `subagent-claude-code`'s `ProcessTransport` (a scrubbed subprocess that strips credential-bearing env vars), `WorkerTransport` runs the obfuscated worker **in-process** with full access to `process.env`, the filesystem (the parent cwd — business files), and the network — a broader trust boundary. The Qoder PAT itself is kept out of `process.env` (T1, intranet-security-first), but **other** env/filesystem secrets present at runtime are exposed to the obfuscated, non-permissive worker; deployments in restricted environments should treat the worker as a trust boundary.

## Known Limitations and Deferred Work

- **One fresh query per run** — no continuation, resume, pooling, or product-session persistence.
- **Tool/reasoning not propagated to the parent** — terminal-only; Qoder-internal trace stays product-local. A traceable variant would be a core seam change (out of P3 scope).
- **`resolveModel`/BYOK not wired** — MVP uses `options.model`; the pull-mode callback + BYOK-to-harness-LLM are future extensions.
- **Live e2e key-gated** — unit specs pin the adaptation against mock fixtures; a live Qoder e2e (consuming Credits) is deferred until a PAT + Credits account is provisioned.
- **No wall-clock timeout or side-effect rollback** — the caller cancels long work; files or external systems Qoder changed before cancellation are not restored.
