# T4 — docs/tool-catalog.zh.md 翻译滞后（code block #82 en/zh drift）

**Type**: task
**Phase**: post-discovery
**Status**: closed (merged 2026-09-07 via PR #73, merge commit `2c8d796a5`)
**Assignee**: unclaimed
**Related**: 2026-09-06 T3 fix 发现（pre-commit translation-pairing hook fail on code-block #82 en/zh drift；T3 fix 的 diff 0 code-block changes，drift 非 T3 引入——见 [T3](T3-website-build-failure.md) Resolution）

## Question

`verify-translation-pairing` fail：`docs/tool-catalog.md ↔ docs/tool-catalog.zh.md: code block #82 diverges` ——en/ + ZH 的 code block #82（一个 JSON schema，`"result_…"` 字段）不一致。ZH 滞后于 en/（en/ 更新了 schema，ZH 未跟）。

这是 pre-existing translation lag（T3 fix 未引入——T3 的 diff 0 code-block changes）。但它 block 了 T3 fix 的 pre-commit `translation-pairing` hook（T3 用 `--no-verify` bypass 绕过）。

**修法**：
- 更新 ZH（`docs/tool-catalog.zh.md`）的 code block #82（+ 其他 divergent code blocks，若有——`verify-translation-pairing` 报的）以匹配 en/（`docs/tool-catalog.md`）。JSON schema code blocks 是 language-neutral，应与 en/ 完全一致。
- re-run `pnpm run verify-translation-pairing --write docs/tool-catalog.md` 重新记录配对。
- 验 `verify-translation-pairing` gate 过（无 code-block divergence）。

## Scope

同步 ZH tool-catalog 的 divergent code blocks 到 en/，re-record pairing，验 translation-pairing gate 过。出 T3 范围（translation lag，非 HTML escape）。

## Findings（2026-09-07 T2 session 验证）

- **T4 实际 OPEN**（handoff 的「T4 closed」是错的）：PR #49 只是 scope-fix commit（把 T4 从 out-of-scope 重划为 in-scope），**真正的 ZH sync 未做**。`verify-translation-pairing` gate 仍报 `docs/tool-catalog.md ↔ docs/tool-catalog.zh.md: code block #82 diverges`。
- **code block #82 是 JSON schema（language-neutral）→ mechanical sync（agent-doable，非 HITL 翻译）**：直接把 en/ 的 code block #82 复制到 zh/ 即可。若 `verify-translation-pairing` 还报其他 divergent code blocks 且为 prose，则那部分需 ZH 翻译（HITL）。

## Resolution（2026-09-07 — merged PR #73 `2c8d796a5`）

**Fixed**: synced 2 divergent JSON schema code blocks in `docs/tool-catalog.zh.md` to match `docs/tool-catalog.md` (verbatim, language-neutral):
- Block #82 — `present_table` chart schema（ZH 缺 7/8 `chart_type` enum + `r_column`；EN verbatim 复制）。
- Block #83 — `propose_relation` schema（ZH 缺 `type` enum array；EN verbatim 复制）。
Re-recorded pairing（`docs/tool-catalog.i18n.yaml`）。`verify-translation-pairing` gate 对 tool-catalog **零 divergence**。78 个其他文件（READMEs / .agents/notes / docs）= T5 HITL 翻译债，非 T4 scope。via subagent + pre-commit/pre-push green。
