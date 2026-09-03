# PB-deferred: tool-search expandQuery fail-loud

**Type**: grilling (HITL)
**Phase**: misc
**Status**: ⏳ deferred (2026-09-03)
**Spawned from**: PB-COMPLY plugin-body audit, R8 finding `packages/data/tool-search-data-sources/src/index.ts:681-685`

## Question

`expandQuery` 的 try/catch 吞掉 `enrichment-llm-wiring` 缺配错 + `console.warn`（stderr，非 session event 非 load-time）+ 继续。因 `queryExpansion` 默认 `true` + `expansionProvider`/`expansionModel` 默认空 → 默认配的部署静默降级 expansion 为 no-op（BM25 召回受损但无人知）。

## 决策点（二选一，皆非纯加法）

- **A**：`queryExpansion` 默认改 `false`（`z.boolean().default(false)`）→ 默认部署不调 expandQuery → 无静默降级；显式 enable 但不配 = 部署方责任。**风险**：回退 P15a 召回默认 + 可能破依赖默认 expansion 的测试。
- **B**：保持默认 true，把 enabled-but-unconfigured 提为 **session event / load-time fail**（需声明一个 event + env-aware load-time 检查——provider/model 可从 `ENRICHMENT_LLM_*` env 解析，load-time 检查不完美）。

## 为何留后续

两选项都非纯加法（A 改行为/可能破测试；B 加 event 声明 + env 检查），属细致判断，grilling 后定方向。
