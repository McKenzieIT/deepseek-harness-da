# Agent Note: pwsh startup settles on verified prompt evidence

Status: implemented

English | [中文](2026-09-16-pwsh-startup-prompt-evidence.zh.md)

## Problem

The hosted `node 24 / coverage` job rejected a persistent pwsh spawn with `expected '' to contain 'dsh> '`: the published `motd` was empty ([job 104635347140](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34103061266/job/104635347140)).

Startup broke its pwsh setup loop on any `stdin_read` wait reason, and that reason has two independent producers in the session's readiness poll. One is the verified prompt — the private OSC `133;D;` marker followed by the exact printable prompt. The other is the Linux exact stdin-wait probe, which only observes that some process in the foreground group blocks on a terminal read. pwsh and PSReadLine emit a cursor-position query and block reading its reply before rendering anything, and the sanitizer strips that query, so the probe settled the first startup send with an empty viewport and startup published it.

The failing case died in 710 ms against an 8000 ms startup budget — faster than its passing sibling — and no line of that run logged `PTY shell did not reach readiness` or `PTY shell exited`, so the spawn resolved successfully instead of running out of time. Contention starvation is not the cause. PR #159's CI showed the opposite parameter (`hold command: false`) failing, so the barrier command is not causal either: the flag is first read after the `motd` assertion.

Two structural facts explain why only Linux saw it. `isStdinWaiting` returns false on macOS and Windows, so the probe exists only on Linux. `initializing` — the flag that makes startup wait for a first byte — is set only inside `initialize()`, which the backend calls for bash alone; the pwsh path calls `startSend` directly and had no gate.

Commit `4f3a47d792` introduced the regression: it replaced a `CONTROLLED_PROMPT` substring check over the viewport and scrollback with the bare wait reason. That substring check had a real false positive of its own, because `PWSH_PROMPT_SETUP` embeds the literal `dsh> ` and pwsh echoes its own setup source. The replacement traded that false positive for one that publishes an empty startup message.

## Decision

`LocalPtySession.promptReady` exposes the readiness evidence the session already tracks: the marker arrived and the printable text after it is exactly `CONTROLLED_PROMPT`. The readiness poll's prompt tier reads the same accessor, so the evidence has one definition.

The pwsh startup loop breaks only when a settlement is `stdin_read` **and** `promptReady` holds. Every other settlement keeps waiting, and the one absolute deadline around the whole loop remains the only bound: a pwsh that genuinely never prompts still rejects with `PTY shell did not reach readiness before startup timeout`.

Echoed input cannot forge the accepted signal. `PWSH_PROMPT_SETUP` builds the marker's ESC and BEL bytes from `[char]27` and `[char]7` at runtime, so the printable source pwsh echoes back never contains a real marker; only a rendered prompt produces one.

Two adjacent defects in the same loop are fixed with it. A settlement that carries no new bytes no longer discards startup text an earlier settlement already collected. Explicit state, not an empty viewport, records that the preamble was submitted, so the setup line is written exactly once however many settlements arrive without output.

## Testing

The fake pwsh sessions in `tests/index.spec.ts` express prompt readiness. New cases pin that a `stdin_read` settlement with an empty viewport and no evidence keeps the loop waiting, that the setup preamble is submitted once across repeated empty settlements, and that an echoed prompt literal without evidence is still not readiness. `tests/session.spec.ts` pins the accessor against a real session for both the probe-settled and marker-settled outcomes. The real-pwsh cases in `tests/local.spec.ts` are unchanged and remain the only evidence that the Linux path settles correctly; they self-skip on hosts without pwsh.

## Alternatives considered

**Carry prompt evidence in `TerminalWaitReason` or `TerminalSendResult`.** Rejected: both are exported types of the terminal seam with other implementors, including the E2B terminal, while `LocalPtySession` is internal to this package. An accessor keeps the change inside `terminal-bash` and leaves every other implementor untouched.

**Restore the `CONTROLLED_PROMPT` substring check.** Rejected: that is exactly the false positive `4f3a47d792` closed. The setup source contains the literal prompt and pwsh echoes it, so a substring test accepts the echo as a rendered prompt.

**Raise `timeoutMs` or retry the spawn.** Rejected: the failure resolved successfully after 710 ms of an 8000 ms budget. No timing change repairs a settlement that carries no prompt.

**Give the pwsh path bash's first-byte gate.** Rejected: scrollback content is not prompt evidence, and the echoed setup source is content. The gate would delay the same wrong answer rather than reject it.

**Accept `inferred_idle` with prompt evidence as startup readiness.** Rejected: silence is a bounded inference that serves later sends. Startup owns one deadline and can afford to wait for the exact signal.

## Consequences

A pwsh that reaches no prompt now rejects the spawn at the startup deadline instead of publishing an empty `motd`. The failure is loud and its message is unchanged; a caller that previously received a useless session now receives an error.

The fix is unobservable off Linux. The exact stdin-wait probe is Linux-only, and the real-pwsh cases skip without a pwsh executable, so a local run proves only that nothing else regressed.

One narrow window stays open. `startSend` discards readiness evidence for every send, including a follow-up that submits nothing. If a settlement lands between the marker write and the printable prompt of the same render, the next startup send clears that partial evidence and no later output completes it, so startup rejects at the deadline. Reaching the window needs a readiness poll to observe a blocked terminal read while pwsh sits between its two writes, and `acceptsStdinWait` additionally requires the foreground group to have left an earlier wait. Closing it means not discarding evidence for a send that never writes, which changes send semantics shared with bash and is left for evidence of its own.

Acceptance for the reported failure remains two consecutive green `node 24 / coverage` runs; a green local package run is not that evidence.
