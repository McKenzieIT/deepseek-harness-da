# P11 — eval harness 迁移

**Type**: prototype
**Phase**: 4
**Status**: Blocked by G2（R3 已解）
**Blocked by**: ~~R3~~（已解）→ 仍 blocked by G2

**Question**: `packages/eval/`（3 级评分 + 5 match mode + `EvalCase` v3 + 多轮）或保留 Python。Phase 4。

**Design (per R3)**: 包 Python JSON-RPC SDK `Session.run()` 作 `AgentResponder`（`respond(req)=AgentTurnReply(reply=session.run(req.message).final_response)`），复用 rbi-eval `MultiTurnSession`/`run_multi_turn_case`；多轮同 Session 多次 run()；pass_k 用 k 独立 session_id；确定性 eval 用 `dsh-llm-replay`；agentic 判分用 `RunResult.events` 的 tool/call+tool/result。R3 偏 Python（JSON-RPC SDK）→ 影响 G2/Q10。
