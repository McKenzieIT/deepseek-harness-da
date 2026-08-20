# P11b — eval harness 生产硬化

**Type**: prototype
**Phase**: 4
**Status**: Unblocked（P11 resolved 2026-08-20）
**Blocked by**: ~~P11~~（已解；proto 设计锁定 + 6 决策落地）
**Surfaced by**: [P11 eval harness](P11-eval-harness.md)（9 surfaced findings）

**Question**: P11 throwaway proto（`prototypes/p11-eval-harness/`，stub 掉 SDK/llm-replay/ODPS/llm-judge）落地为生产 `packages/eval/`（TS、真依赖）——解 P11 surfaced 9 finding + 接真 seam。Phase 4。

**Design (per P11 + G2)**：见 [P11](P11-eval-harness.md) Resolution + [`../../prototypes/p11-eval-harness/README.md`](../../prototypes/p11-eval-harness/README.md) Surfaced findings + [G2](G2-eval-ts-vs-python.md)。production `packages/eval/`（additive，镜像其余 da 包），重实现 P11 proto 验证的编排设计为真 TS + 接真 seam：

- **真 `@deepseek-ai/dsh-sdk-client`** `DeepSeekHarness.run()`（spawn runtime 子进程 + `await using`/`close()` reap）作 `AgentResponder`；`extractReply` 从 `RunResult.events` 的 `tool/call` 捞 generatedSql（TS SDK 无 generatedSql 字段）。
- **真 `dsh-llm-replay`**（runtime `cordis.yml`+`DSH_SNAPSHOT_FILE` env+snapshot JSONL，research Claim G 语言无关）作确定性——proto 用 canned-response map，P11b 接真 replay。
- **真 `ctx.query.execute`**（P4b `packages/query/query-maxcompute/` 3-state `QueryOutcome` done/failed/pending + per-scope 缓存）作 EXECUTION actual——proto in-process stub，P11b 接真 seam。
- **真 `llm-dashscope`**（P2 native AGA adapter）作注入式 LLMProvider（DELIVERY LLM-judge）；**judge 确定性**须单独冻（agent 的 dsh-llm-replay 不覆盖 judge）或接受 variance（temp 0 + 重试预算）——产品决策，P11b grilling。
- **environmental failure 分类**：接 `classify_execution_failure` 拆 `syntax_error`/`guard_rejected`（agent SQL 错=score）vs `infrastructure`/`timeout`/`patience`（warehouse 没答=refuse 不 score）。proto 简化（success/fail），P11b 补。
- **trigram fuzzy 短 token 过宽容**（P11 S6 surfaced）：阈值/路由 grilling——短答案走 `scalar_exact`/LLM-judge 或提 threshold / 加 min-token-length / fuzzy 仅作 derailment 非终止 DELIVERY。
- **H1 mitigation**（`validateRunResult` 区间 assistant/message 计数==1→`ProtocolError`）保留作生产断言。
- **`Promise.race` 超时+runtime close/respawn 真 wiring**：proto stub `close()`+`respawn()`；真 = `harness.close()` reap runtime 子进程 + 重 spawn。
- **session async**（da 适配保留：rbi sync `score_l1`→da async `scoreDa`，因 DELIVERY LLM-judge async）。
- **EvalCase da-fresh schema**（P11 `eval_case.mjs`）→ TS zod 或 plain；case loader（YAML/JSON parse）；run 管理+持久化+报告+CLI（完整 ~1500+ 行）。

**6 决策锁定**（P11 resolved，不重开）：D1 production=`packages/eval/`（本票）/ D2 expected=fixture / D3 真 `ctx.query.execute`（本票接）/ D4 真 llm-dashscope judge（本票接，judge 确定性 grilling）/ D5-D6 proto 已验。P11b 聚焦**生产化 + 真 seam 接线 + 9 finding**。

**关联**：解锁 map Not-yet-specified「D2 (c) keep/regress」（P11b 生产 eval 跑召回/歧义数据后可重访决策）。仿 P7b/P8b/P12b/P4b 生产硬化先例。
