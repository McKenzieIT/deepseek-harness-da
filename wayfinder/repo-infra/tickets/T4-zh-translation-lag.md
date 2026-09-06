# T4 — docs/tool-catalog.zh.md 翻译滞后（code block #82 en/zh drift）

**Type**: task
**Phase**: post-discovery
**Status**: open
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
