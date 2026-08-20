# P11c — eval CLI runner + persistence + pass_at_k reporting

**Type**: prototype
**Phase**: 4
**Status**: Blocked by P11b（resolved 2026-08-20——eval core 库就绪）
**Blocked by**: P11b（`packages/eval/eval/` 核心库 ship）

**Question**: P11b DEFER 的 eval **CLI runner**（跑单 case / batch demo）+ **run-result 持久化** + **pass_at_k 报告聚合**。P11b ship 了核心库（编排 MultiTurnSession/driveSession/runMultiTurnCase + 判分 scoreDa + judge + match_modes + case loader），P11c 加外围让 eval 可独立跑 + 报告。G1b（实验执行）消费 P11b 库 + P11c runner/report。

**Scope (per P11b decision 7)**:
- CLI runner（跑 case batch，注入真 DeepSeekHarness responder + ctx.query.execute executor + llm-dashscope judge provider）—— owns runtime lifecycle（spawn cordis.yml+DSH_SNAPSHOT_FILE, close/respawn on timeout）。
- run-result 持久化（JSONL/SQLite，落盘 per-case MultiTurnCaseResult）。
- pass_at_k 聚合报告（case-level summary, pass rate, flakiness exposure）。
- ~800 行（P11b 核心之外的完整 eval；P11b ~700 行核心 + P11c ~800 = ~1500 完整 eval per G2 Claim E）。

**关联**: P11b resolved（核心库 + 7 决策 locked）；G1b（实验执行，blocked by P7b+P11b）消费 P11c runner/report 跑 G1 矩阵。仿 P11b→P11c 先例（P7→P7b/P8→P8b/P4→P4b 核心先行 + 外围延后）。
