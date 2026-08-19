# tickets frontier — deepseek-harness-data-agent

> 按 phase/依赖层组织。每 ticket 一个文件（多 session 并行 claim 不冲突）。状态全 open（R1/R2/R3 已 resolved research）。blocking 在每文件内。已 resolved 的决策见 `../map.md` 的 Decisions so far；研究笔记在 `../research/`。

## 取 ticket 流程（多 session 并行）
- 每 session claim 一个 ticket（assign 给自己，先 claim 再做）。
- 从最低 unblocked phase 取；blocked ticket 等其 blocker 解。
- 一个 ticket 一个 session（grilling/prototype HITL；research/task AFK）。

## phase-0（scaffold）
- [P1 dsh-data-agent 脚手架](phase-0/P1-data-agent-scaffold.md) — prototype, **resolved (2026-08-19)**

## phase-1（P0 LLM）
- [T1 Qoder PAT](phase-1/T1-qoder-pat.md) — task, **resolved** 2026-08-19, was blocking P3
- [R1 DashScope seam](phase-1/R1-dashscope-seam.md) — research, **resolved**, blocks P2
- [P2 llm-dashscope](phase-1/P2-llm-dashscope.md) — prototype, **resolved**（2026-08-19）, P0
- [P3 subagent-qoder](phase-1/P3-subagent-qoder.md) — prototype, **unblocked**（T1 解 2026-08-19）, P0
- [G3 per-user Qoder PAT](phase-1/G3-per-user-qoder-pat.md) — grilling, **resolved** 2026-08-19, feeds P3/P9/P8/P10 (dep P12)

## phase-2（capability seams）
- [R2 MaxCompute 凭证缓存](phase-2/R2-maxcompute-cred-cache.md) — research, **resolved**, blocks P4
- [R6 凭证热更机制](phase-2/R6-cred-hot-reload.md) — research, **resolved** 2026-08-19（推荐 (b) per-call `set_credentials` + P1 da 自持 Client；E 精炼 cred→set_credentials / 非-cred→invalidate_scope / reconnect→崩溃兜底）
- [G4 query sidecar 控制信道+可靠性](phase-2/G4-query-sidecar-control-reliability.md) — grilling, **resolved** 2026-08-20（P1 自持 raw Client+stdio、(ii) lazy re-spawn、HOLE-A 强制 connect/C drop/D no-op polling；解锁 P4b）
- [P4 query-engine](phase-2/P4-query-engine.md) — prototype, **resolved**（A1-split + C1 + B/D/E/F2/G；prototype `../prototypes/p4-query-engine/`）
- [P4b query-maxcompute 生产硬化](phase-2/P4b-query-maxcompute-hardening.md) — prototype, **unblocked**（G4 解；P1 接线：da 自持 raw Client+stdio、lazy re-spawn、set_credentials 控制信道、drop/cancel via signal）
- [P5 检索/向量化](phase-2/P5-retrieval-vectorization.md) — prototype, **in-progress** (claimed 2026-08-19)
- [P6 语义层](phase-2/P6-semantic-layer.md) — prototype, **resolved** 2026-08-19（substrate + ODPS 解耦 `ctx.schema` seam + write-tiers；NL→SQL 引擎毕业 P13；prototype `../prototypes/p6-semantic-layer/`）
- [P8 audit](phase-2/P8-audit.md) — prototype, **in-progress** (claimed 2026-08-20)
- [P9 admin+访问隔离](phase-2/P9-admin-access-isolation.md) — prototype, **unblocked**
- [P10 内网穿透安全](phase-2/P10-intranet-tunneling.md) — prototype, **unblocked**
- [P12 credentials keychain + per-user 寻址](phase-2/P12-credentials-keychain.md) — prototype, **resolved** 2026-08-19
- [P12b credentials keychain 生产硬化](phase-2/P12b-credentials-keychain-hardening.md) — prototype, blocked by P10

## phase-3（orchestration）
- [P7 四阶段 preset+phase-gate](phase-3/P7-four-phase-preset.md) — prototype, blocked by ~~P4~~/P5/~~P6~~
- [P13 NL→SQL 引擎（极简 (B)）](phase-3/P13-nl2sql-engine.md) — prototype, blocked by ~~P4~~/P5/~~P6~~（从 map Not-yet-specified「Text2DSL 选型」毕业；`../research/p6-nl2sql-feasibility.md`）

## phase-4（eval）
- [R3 多轮 eval hook](phase-4/R3-multiturn-eval-hook.md) — research, **resolved**, blocks P11
- [P11 eval harness](phase-4/P11-eval-harness.md) — prototype, blocked by G2（R3 解）
- [G2 eval TS vs Python](phase-4/G2-eval-ts-vs-python.md) — grilling, **unblocked**

## phase-misc（cross-phase / 低优先）
- [G1 Pipeline vs goal/todo](phase-misc/G1-pipeline-vs-goal-todo.md) — grilling, blocked by P7
- [R4 goals:false 抑制](phase-misc/R4-goals-false.md) — research, low, unblocked
- [R5 acp 测试 fallout](phase-misc/R5-acp-fallout.md) — research, low, unblocked

## 当前可立即取（unblocked frontier）
P3 · P4b · P9 · P10 · G2（+ low: R4, R5）
