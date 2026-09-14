# Current session — upstream merge push/PR and residual closeout

> **Date correction:** this is the active task on 2026-09-14. The former filename `next-session-2026-09-22-unblock-push-and-residuals.md` incorrectly placed it in the future.

## Objective

Finish the upstream merge specialty on `upstream/resync-2026-09-18`: resolve every merge-introduced regression, preserve documented fork behavior, publish the final PR head, collect required GUI/HITL evidence, merge PR #130, and leave only explicitly owned follow-up work.

## Verified corrections

- The `dsh-root` failure came from ignored `node_modules` residue under the deleted `packages/client/runtime/` directory. `pnpm run clean` fixed it; no Typert bootstrap change is needed.
- Workspace-files Client calls correctly send `SessionId`; the Host gateway resolves `WorkspaceFileScope`. No seam-6 caller conversion is needed.
- The present-table fix uses `outputOptions.codeSplitting: false`, not the ignored top-level `splitting` option.
- README anchor threading is fence-aware and idempotent; Summary precedes the generated table of contents.
- eval-cli reads credentials through `resolveDshHome()` and the versioned credentials parser.
- The upstream sync record points to upstream `c291e7961a515f6d7af9304e7fd1d257929aef26` and merge `1f731901a76109fefa168fc9bbd785dbfdefc889`.

## Remaining execution order

1. Commit generated documentation alignment and tracker corrections with explicit paths.
2. Run the focused build/tests and final `check:ci:static`; accept only the documented constraints, Client UI i18n, and pre-existing translation-pairing baselines.
3. Push `upstream/resync-2026-09-18` without bypassing hooks and update PR #130 with the final verification evidence.
4. Record a GIF from PR #130's real web/model flow and inspect `preset-autojoin: pendingSwitch=in-flight|settled` plus `turn/end` for UM4.
5. Confirm CI failures match the two user-authorized release known-red checks, merge PR #130, then close UM15 and record cleanup.

## Deliberate follow-ups

- UM4 remains open unless the instrumented HITL capture reproduces `disposed`, `error`, or a missing terminal event. A completed turn with `pendingSwitch=settled` does not justify the speculative observer fix.
- A scheduled upstream-status workflow remains a separate decision because `upstream-status` intentionally exits 0; scheduling it without notification semantics would create no actionable alert.

## Safety rules

- Never use `--no-verify`, raw `--force`, or `git add -A`.
- Commit with `-F` and explicit paths.
- Do not touch the user's dirty primary worktree.
- Edit `wayfinder/data-agent/map.md` only with Node Buffer byte-splicing and preserve its 13 U+FFFD bytes.
- Re-check every SHA, PR state, and validation result from tools before recording it.
