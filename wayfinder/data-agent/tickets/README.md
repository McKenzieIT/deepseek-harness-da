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
- [P3 subagent-qoder](phase-1/P3-subagent-qoder.md) — prototype, **resolved**（2026-08-20）, P0
- [G3 per-user Qoder PAT](phase-1/G3-per-user-qoder-pat.md) — grilling, **resolved** 2026-08-19, feeds P3/P9/P8/P10 (dep P12)

## phase-2（capability seams）
- [R2 MaxCompute 凭证缓存](phase-2/R2-maxcompute-cred-cache.md) — research, **resolved**, blocks P4
- [R6 凭证热更机制](phase-2/R6-cred-hot-reload.md) — research, **resolved** 2026-08-19（推荐 (b) per-call `set_credentials` + P1 da 自持 Client；E 精炼 cred→set_credentials / 非-cred→invalidate_scope / reconnect→崩溃兜底）
- [G4 query sidecar 控制信道+可靠性](phase-2/G4-query-sidecar-control-reliability.md) — grilling, **resolved** 2026-08-20（P1 自持 raw Client+stdio、(ii) lazy re-spawn、HOLE-A 强制 connect/C drop/D no-op polling；解锁 P4b）
- [P4 query-engine](phase-2/P4-query-engine.md) — prototype, **resolved**（A1-split + C1 + B/D/E/F2/G；prototype `../prototypes/p4-query-engine/`）
- [P4b query-maxcompute 生产硬化](phase-2/P4b-query-maxcompute-hardening.md) — prototype, **resolved** 2026-08-20（P1 落地：真 `packages/query/{query,query-maxcompute}/`、da 自持 raw SDK Client+StdioClientTransport+lazy re-spawn+per-call 幂等 set_credentials(drop)+cancel via signal+控制工具非 model-callable；stand-in sidecar 4/4 scenario 全绿；query-trio 剩余见 Not-yet-specified）
- [P5 检索/向量化](phase-2/P5-retrieval-vectorization.md) — prototype, **resolved** (2026-08-20; mirror rbi-retrieval/semantic, 6 决策 + prototype 验证)
- [P6 语义层](phase-2/P6-semantic-layer.md) — prototype, **resolved** 2026-08-19（substrate + ODPS 解耦 `ctx.schema` seam + write-tiers；NL→SQL 引擎毕业 P13；prototype `../prototypes/p6-semantic-layer/`）
- [P8 audit](phase-2/P8-audit.md) — prototype, **resolved** 2026-08-20
- [P9 admin+访问隔离](phase-2/P9-admin-access-isolation.md) — prototype, **resolved**（2026-08-20）（单一 additive 插件 `@deepseek-ai/dsh-admin` + 服务端解析 scope 非客户端可供给 + 忠实 RBI + net-new AccessLink + fail-closed；prototype `../prototypes/p9-admin-access-isolation/` 25/25 全绿；解锁 P10 门形态 + P4b 凭证寻址）
- [P10 内网穿透安全](phase-2/P10-intranet-tunneling.md) — prototype, **resolved**（2026-08-20）（Caddy 反代+mTLS 无隧道 + mTLS transport-only + 工具门禁 defense-in-depth；prototype `../prototypes/p10-intranet-tunneling/` 26/26 全绿；解锁 P12b）
- [P12 credentials keychain + per-user 寻址](phase-2/P12-credentials-keychain.md) — prototype, **resolved** 2026-08-19
- [P12b credentials keychain 生产硬化](phase-2/P12b-credentials-keychain-hardening.md) — prototype, **resolved**（2026-08-20）（security-CLI-only runtime-exfil ACL DEFER P12c + locked-keychain/auto-lock/teardown-lock + 真实 `packages/credentials/credentials-keychain` 包 + branding in seam `UserId`/`ScopeId` `Branded`；live macOS e2e 21/21 + per-file 100% 覆盖；解锁 G3 stable per-user PAT 必填）
- [P12c native keychain binding + code-signing](phase-2/P12c-native-keychain-binding-code-signing.md) — prototype, **blocked**（by harness 分发流程建立：Apple Developer Program + notarization + 打包可签名 binary；P12b DEFER 的 runtime-exfil ACL per-item Touch-ID）
- [T2 AGA-embeddings live-probe](phase-2/T2-aga-embeddings-live-probe.md) — task, **resolved**（2026-08-20；AGA-embeddings NO live-probe 实证——4 端点 404 + chat 200 控制；intranet 重 embedder 走独立 sidecar 非 AGA，落 P5 InfinityEmbedder）
- [P8b audit 生产包硬化](phase-2/P8b-audit-prod-hardening.md) — prototype, **resolved**（2026-08-20）（真 packages/data/audit + 真实 ctx.on + ①a verdict-only patch + ②c stats/correctedStats + additive P3 costs-surface；audit 11/11 spec + P3 26/26+117/117 + typecheck-clean）

## phase-3（orchestration）
- [P7 四阶段 preset+phase-gate](phase-3/P7-four-phase-preset.md) — prototype, **resolved**（2026-08-20；grilling 8 决策 + prototype 8 场景全绿 + 6 finding→P7b；persona option C / turn-stopping 转换 / guard 硬白名单 / rbi budgets 初始默认）
- [P7b phase-gate 生产硬化](phase-3/P7b-phase-gate-hardening.md) — prototype, blocked by ~~P13~~ → **unblocked**（P13 resolved：critic 形态方案 1+4 已定，sqlglot stub 可替换）
- [P13b NL→SQL 引擎生产硬化](phase-3/P13b-nl2sql-engine-prod-hardening.md) — prototype, **unblocked**（P13 resolved；prototype→生产 `packages/nl2sql-engine/` + conventions 提到 query 包 + critic 接线 fold P7b）
- [P13 NL→SQL 引擎（极简 (B)）](phase-3/P13-nl2sql-engine.md) — prototype, **resolved**（2026-08-20；grilling 6 决策 + prototype 9 scenarios 全绿；critic 方案 1+4 替 sqlglot + eval gate 对齐 P11/G2；`../research/p13-sql-critic-alternatives.md`）

## phase-4（eval）
- [R3 多轮 eval hook](phase-4/R3-multiturn-eval-hook.md) — research, **resolved**, blocks P11
- [P11 eval harness](phase-4/P11-eval-harness.md) — prototype, **unblocked**（G2 resolved 2026-08-20；TS `packages/eval/` per G2 设计指针）
- [G2 eval TS vs Python](phase-4/G2-eval-ts-vs-python.md) — grilling, **resolved**（2026-08-20；TS `packages/eval/` 重实现编排 + 判分 (ii) DELIVERY/EXECUTION 不进 sqlglot + python/ 包不修订 Q10；解锁 P11）

## phase-misc（cross-phase / 低优先）
- [G1 Pipeline vs goal/todo](phase-misc/G1-pipeline-vs-goal-todo.md) — grilling, **resolved**（2026-08-20；实验设计 11 决策定稿——2×2 变体×2 模型配置 staged、execution-match 三分判分+决策规则；设计(不跑)→毕业 G1b 执行票）
- [G1b 实验执行](phase-misc/G1b-experiment-execution.md) — prototype, blocked by P7b+P11b（跑 G1 设计的 staged 矩阵+决策规则+报告）
- [R4 goals:false 抑制](phase-misc/R4-goals-false.md) — research, **resolved**（2026-08-20；goals:false 完全抑制 spine goal mount：agent-spine-demo/src/index.ts:239 守卫 + agent-core.spec.ts:210-214 钉死，README:82 fixed 指 core 非指 goal；shipped base+patch 走 disabled:true 等价零 code 改 → Q8 保留是选择非约束）
- [R5 acp 测试 fallout](phase-misc/R5-acp-fallout.md) — research, **resolved**（2026-08-20；删 acp/ 级联 acp-demo+acp-agent ~70 场景/57 配置/18 测试，acp-snapshot 零依赖存活，da 零交集——给 (c) 代价基线）
- [P2b dashscope 200+error-body](phase-misc/P2b-dashscope-200-error-body.md) — task, **resolved**（2026-08-20；200+err-body 证伪（4 case 全 4xx）；改 fix 同源 4xx SSE-框架错误体 mis-parse（adapter.parseErrorBody 先 JSON 再 parseSse drain）+7 测试，2xx/translate 不动）
- [P2c dashscope queue keep-alive](phase-misc/P2c-dashscope-queue-keepalive.md) — task, **resolved**（2026-08-20；hold 368-498ms 远<300s，keep-alive comment 首字节即 pulse，300s 默认安全无 fix）

## 当前可立即取（unblocked frontier）
P7b · P13b · P11（+ low: R4, R5）
