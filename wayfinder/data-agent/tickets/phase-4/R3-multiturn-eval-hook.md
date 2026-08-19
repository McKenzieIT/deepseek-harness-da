# R3 — 多轮 eval AgentResponder hook（research, resolved）

**Type**: research
**Phase**: 4
**Status**: Resolved
**Blocks**: P11

**Question**: harness agent runner 是否暴露多轮脚本 eval 所需的 response hook（pass_k）？

**Research note**: → `../../research/r3-multiturn-eval-hook.md`（已解）。

**Finding**: harness 暴露 response hook（足以驱动多轮 pass_k），但响应正文在 **session 事件流**（非 agent 事件层，无 `agent/response`）。主路径 = Python JSON-RPC SDK `Session.run()`（同步驱动一轮+捕获响应→`RunResult(final_response,events)`，final_response 从最后 `assistant/message` 提取）；包成 `AgentResponder` 复用 rbi-eval `MultiTurnSession`/`run_multi_turn_case`；多轮同 Session 多次 run()（session 日志持久）；pass_k 用 k 独立 session_id；确定性 eval 用 `@deepseek-ai/dsh-llm-replay`；agentic 判分用 `RunResult.events` 的 tool/call+tool/result（ACP 路拿不到）。**harness 无 packages/eval**。**含 Python → 强化 Q10 keep + G2 偏保留 Python eval**。
