# dsh-data-agent Changelog

记录 dsh-data-agent 的关键构建进度。不追踪每个 commit，只追踪里程碑。

## [Unreleased]

### Added
- route-gate 意图路由（乙′方案：文本令牌 + 检索回退 + 闲聊过滤）— P-DA1
- GENERATION 闸门 critic 放宽机制 — P-DA2
- preset.yml 展示元数据（取数模式 / order:5）— DA1
- D2f corpus enrichment 激活 — D2f
- D2h corpus term-only selectable + topK→20 — D2h

### Fixed
- LLM wiring 404（llm-dashscope 未挂 headless profile）— verification-audit
- query-maxcompute TS4113/TS2379 编译错误 — host-typecheck-wiring

## 2026-08-20 — Phase 1-4 Prototype Complete

### Added
- 四阶段 phase-gate 管道（P7/P7b）
- NL→SQL engine（P13/P13b）
- Query engine + MaxCompute sidecar（P4/P4b）
- Retrieval/向量化 seam + hybrid BM25+vec+RRF（P5/P5b）
- Semantic layer substrate + ctx.schema seam（P6/P6b）
- Eval harness 纯库（P11/P11b）
- Credentials keychain + per-user PAT（P12/P12b/G3b/G3c）
- Admin + 访问隔离 prototype（P9）
- Intranet tunneling mTLS security（P10）
- Audit service + SQLite store（P8/P8b）
- DashScope LLM adapter native protocol（P2）
- Subagent-Qoder delegation（P3）
- Identity seam stub（G3b）
- AGA-embeddings live-probe（T2：NO — 404，改走独立 sidecar）

## 2026-08-19 — Phase 0-1 Bootstrap

### Added
- data-agent scaffold + bundle patch（P1）
- Qoder PAT task complete（T1）
- DashScope seam research（R1）
- LLM-DashScope prototype（P2 initial）
- Per-user Qoder PAT design（G3）
- Credentials keychain prototype（P12）
