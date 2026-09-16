# T26 — 扫真实 workspace 的用例仍带低于 lane 预算的字面量（已并入 T20）

**Type**: task
**Phase**: post-discovery
**Status**: closed（2026-09-16 并入 [T20](T20-windows-codex-and-catalog-budget.md)）
**Assignee**: —
**Related**: [T20](T20-windows-codex-and-catalog-budget.md) 的「### 3. 同根因的其它扫描型用例」一节

## 为什么关掉

本票与 T20 part 2 是**同一个根因**——case/describe 上的 timeout 字面量**覆盖**而非让位于 lane 已授予的 `DSH_COVERAGE_TEST_TIMEOUT_MS: '90000'`（明文见 `scripts/run-gates.ts:613-615`：「Explicit fixture timeouts remain authoritative」）——只是换了文件。开成独立票会把同一个机制的收口分散到两处，各自还要维护同一套先例与「不能直接删字面量」的告警。

内容（`tools-catalog.spec.ts:20` 主项、`proxy-types.client.spec.ts:78` 待实测项、以及那份逐个实读的全仓审计结论：哪些在范围内、哪些确认在范围外、以及 `session-format-corpus.spec.ts` 这个正向对照）已完整并入 T20 的「### 3」一节与其 Scope 第 3、4 条。**没有信息丢失。**

后续一律在 T20 追踪；本文件仅作编号占位与指向，避免 map 与既有链接指到空处。
