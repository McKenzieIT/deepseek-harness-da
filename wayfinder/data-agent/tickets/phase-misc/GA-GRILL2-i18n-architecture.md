# GA-GRILL2 — i18n / prompt-templating 架构（先 grilling 再开票）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open（grill 后转 G 票）
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) — C3+H7 / arch G2 · **critical**
**Grilling prompt**: [research/grill-2-i18n.md](../../research/grill-2-i18n.md)

**Question**: 如何让 prompt/judge/parser/tokenizer 脱离"中文+游戏域"硬编码、支持 zh/en/ja？候选 A（prompt-template registry + locale bundle + 插值）/ B（每个 prompt 抽 config 文件）/ C（词库 locale lexicon vs LLM intent 分类；marker 共享真值源）。

**Background**: 全仓无 i18n seam。prompt.ts:84 生成 prompt 全中文+游戏域；expand-query.ts:11 中文+游戏 few-shot；sql_semantic_judge.ts:70 中文 judge；granularity.ts:13 TREND_PATTERN 纯中文；metric-engine.ts:97 extractTimeParams 只认中文日期词；domain.ts:47 marker 【拆解】/【未完成】+ ROUTE_MARKER_REGEX 只配 CJK 全角括号（prompt 与 parser 无共享真值源→本地化只改一边就静默坏 decline 路由）；bm25-linking.ts:72 丢日文 kana；enrichment.ts:118 mergeRefs 用 '确定性' 前缀；types.ts:283 freshness enum 拒英文。

**Key files**: packages/data/nl2sql-engine/src/{prompt.ts:84,conventions.ts:33,granularity.ts:13,metric-engine.ts:97,bm25-linking.ts:72}; packages/data/tool-search-data-sources/src/{expand-query.ts:11,index.ts:303}; packages/eval/eval-runner/src/sql_semantic_judge.ts:70; packages/data/phase-gate/src/domain.ts:47; packages/data/semantic-layer/src/{enrichment.ts:118,types.ts:283}
