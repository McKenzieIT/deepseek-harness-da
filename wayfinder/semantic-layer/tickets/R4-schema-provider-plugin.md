# R4 — Schema Provider 插件化设计调研

**Type**: research
**Status**: Resolved（2026-08-21）
**Blocked by**: —

## Resolution

推荐对齐 LLM pattern：registerSchemaProvider() 返回 disposer，按 engineType 路由，支持多 provider。详见 `research/r4-schema-provider-plugin.md`。
