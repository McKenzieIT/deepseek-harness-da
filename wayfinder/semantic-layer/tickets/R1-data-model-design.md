# R1 — 语义层数据模型设计调研

**Type**: research
**Status**: Resolved（2026-08-21）
**Blocked by**: —

## Resolution

推荐方案 B（类型化可插拔 + 统一检索层）。详见 `research/r1-data-model-design.md`。
核心结论：检索层已是类型无关的，per-kind plugin ~50 行，现有代码可包装为内置 plugin，TypeScript 类型安全保留。
