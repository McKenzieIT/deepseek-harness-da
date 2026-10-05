# wayfinder:map — deepseek-harness-data-agent

> 本地 Markdown tracker（wayfinder skill 默认；未显式提供 GitHub issue tracker）。子 ticket 在 `tickets/`，研究笔记在 `research/`，session prompt 在 `prompts/`（已失效的在 `archive/prompts/`）。
>
> 本 map 是**索引，不是存储**：每条决策只记一行 gist + 票链接，详情在它自己的票或研究笔记里。**本 map 不镜像 open / blocked / frontier / assignee** —— 每张票的 `**Status**` 字段是其状态的唯一来源（查 frontier 的命令见 [tickets/README.md](tickets/README.md)）。

## Destination

把 `deepseek-harness-da`（`deepseek-ai/deepseek-harness` 的 fork —— 插件化 agent harness on vendored Cordis）改造成 **deepseek-harness-data-agent**（一个 data agent；正式名待定）。以 `reverse-bi`（上游 `track2data`，AI 原生游戏取数平台）为能力源，**通过插件化、additive-only、逐步迁移**其核心数据能力（四阶段 pipeline + retrieval + query + guard + eval + 语义层）到 harness 上；筛除 code-agent 特性（disable-only 保上游升级路径）；新增生产需求（DashScope + Qoder LLM 接入、内网穿透 + per-game 访问隔离）。reverse-bi 为只读源、重新实现不改。

## Notes

- **域**：agent harness → data agent（NL→SQL/取数）改造；reverse-bi 为能力源。
- **每会话应查 skills**：`dsh-plugin-development`（插件开发模型）、`grilling` + `domain-modeling`（决策）、`research`（调研）、`prototype`（原型）。
- **常设原则**
  - **additive-only**：da 改动只叠加（preset overlay + data 插件 + persona），不改/不删 core → 保上游升级路径。(c) npm-消费纯产品仓库留作后续低风险选项。
  - **reverse-bi 只读源**：重新实现，不修改 reverse-bi。
  - **intranet-security-first**：内网穿透暴露面 = 安全加固设计；信任边界单一在 RBI 门；业务用户问题不得触达 bash 等禁止命令（工具门禁）。
  - **凭证不过 transport**：PAT / ODPS 凭证走 `credentials` seam 的 file 层（`~/.dsh/.credentials.yaml`，0600），**不**进 `process.env`、不进 RPC。
  - **Context Layer 一等公民**：NL2SQL 成败在 Context Layer。语义层 = 资产内部结构（columns/metrics/granularity），知识图谱 = 资产间关系拓扑（joins/derived_from/+可扩展类型），两者合一作 data-agent 插件内一等公民；Ontology 参考 Palantir 四层模型。
  - **对话式管理**：用户通过可视化发现语义层/知识图谱问题，通过 LLM 对话 + tool 修正（非 UI 直接编辑）；图谱 UI 是观察工具不是编辑工具。
  - **upstream 内容不改**：上游最新是什么用什么；fork 自有部分按需重构（2026-09-15 用户确立）。
- **状态所有权**：票的 `**Status**` 是唯一状态来源；本 map 不记 open/blocked/frontier/assignee，也不记 session 进度、门禁计数、PR 账目或 worktree 清单 —— 那些属票、`prompts/` 的 handoff 或 git 历史。
- **实验结果审计**（`research/experiment-audit-log.md`）：任何用实验/探针支撑决策的（probe / 召回-歧义测量 / A-B），须把 setup + 数据（verbatim）+ verdict + fidelity caveat + ticket 指针持久化到此审计日志。
- **跨 effort 所有权**：Benchmark / EvaluationStore / ArtifactStore / ground truth / holdout / cutover 归 [`wayfinder/evaluation/`](../evaluation/map.md)（2026-09-06 起）；仓库级 CI、lint、覆盖率、doc catalog、测试隔离归 [`wayfinder/repo-infra/`](../repo-infra/map.md)；语义层/Ontology 的设计与管理面归 [`wayfinder/semantic-layer/`](../semantic-layer/map.md)。本 map 只保留 data-agent 侧消费者与跨 effort 指针。

## Decisions so far

<!-- 一行一 closed 决策的 gist；详情在它自己的票 / research 笔记 -->

### 拓扑与迁移范围（基线决策）

- [拓扑 Q4 — 选择性 fork、additive-only](research/frontier-fork-precedent.md): 保留 git fork，da 只叠加不改 core；(c) npm-消费纯产品仓库作后续低风险选项，spec 见 [product-split-package-rescope](tickets/phase-misc/product-split-package-rescope.md)。
- [去除 Q2 修正 — disable-only](research/harness-package-removal.md): code-agent 在 data-agent preset 不挂载，不物理删，保升级路径。
- [迁移范围 Q3](research/00-synthesis.md): 只迁核心能力集（四阶段 pipeline + retrieval + query + guard + eval）；裁 flywheels / query-acceleration / 前端 / 超结构，查数优先。
- [ODPS 解耦 Q5](tickets/phase-2/P4-query-engine.md): 引擎可插拔 —— `QueryEngine` 协议 + 每引擎 `conventions.yaml`，MaxCompute 为首引擎。
- [访问隔离](research/access-isolation-options.md): 复用 RBI `scope_id` + 每作用域凭证，admin 作 harness app；门覆盖 `X-RBI-Scope`，不退休 override。
- [rbi-agent core/ ②](research/harness-agent-loop.md): 退役其基础设施（用 harness agent-loop/session/mcp-client/llm），只保 per-turn 隔离纪律（`ToolResultCache`/`TurnBudget`/`tool_health`）为插件。
- [rbi-agent data_agent/ ③](tickets/phase-3/P7-four-phase-preset.md): 移植为一份 preset（四阶段工具/persona/段）+ phase-gate 插件；不自定义 agent-loop、不坍缩阶段。
- [per-phase 门控 Q7](research/harness-agent-loop.md): harness 无原生支持 → 必须加 phase-gate hook。
- [rbi-mcp 分解 ④⑤](research/rbi-capability-inventory.md): 轻量工具 / 语义层 / audit / admin 进程内置为 harness 插件；查询引擎混合（`ctx.query` seam 进程内 + MaxCompute Provider 外置 sidecar）。
- [goal/todo/plan Q8](tickets/phase-misc/G1-pipeline-vs-goal-todo.md): 保留不禁用，四阶段 pipeline 作默认编排；Pipeline vs goal/todo 的对比另立实验票。
- [变换执行 Q9](tickets/phase-misc/safe-compute-architecture-decisions.md): code-runtime 跑 pandas 变换 + bash 跑 shell；内网暴露面加工具门禁（业务用户不得触达 bash）。
- [python/ Q10](tickets/phase-4/G2-eval-ts-vs-python.md): 前期保留（additive），按 Python 消费者需求后 disable-only 裁。
- [product-split-package-rescope](tickets/phase-misc/product-split-package-rescope.md): Q4 (c) 的 spec 落定 —— 纯产品仓走 npm-consume（只发 da additions，不重发上游包）。

### Phase 0–1 — 脚手架与 LLM 接入

- [P1 dsh-data-agent 脚手架](tickets/phase-0/P1-data-agent-scaffold.md): patch-only bundle 叠 base，disable code-agent 面，bash/code-runtime 保留（门禁归 P10）。
- [R1 DashScope seam 调研](tickets/phase-1/R1-dashscope-seam.md): 原判「可干净镜像 `llm-deepseek`」**已被 P2 live 探针证伪** —— 实为 native AGA 协议，sse/translate 不可复用。
- [P2 llm-dashscope](tickets/phase-1/P2-llm-dashscope.md): native AGA 原生协议 adapter（非公网 OpenAI 兼容），6 条 live 探针兑现 wire 事实。
- [P2b dashscope 4xx 错误体 mis-parse](tickets/phase-misc/P2b-dashscope-200-error-body.md): 「200+error-body」假设证伪；真 bug 是 4xx 错误体为 SSE 框架却标 `application/json` → content-type 不可作判别器。
- [P2c dashscope queue keep-alive](tickets/phase-misc/P2c-dashscope-queue-keepalive.md): 实测 hold 368–498ms 远低于 300s 默认，keep-alive comment 首字节即 pulse，无需 fix。
- [T1 Qoder PAT](tickets/phase-1/T1-qoder-pat.md): PAT 存 credentials seam file 层（`QODER_PERSONAL_ACCESS_TOKEN`，doc 0600），不入 `.env`/`process.env`。
- [P3 subagent-qoder](tickets/phase-1/P3-subagent-qoder.md): Qoder 作 terminal-only 外部 one-shot subagent provider，drain `query()` 取终态，tool/reasoning 留 product-local 不进父 trace。
- [G3 per-user Qoder PAT provisioning](tickets/phase-1/G3-per-user-qoder-pat.md): per-individual-user 自带 PAT（非 per-scope），存 credentials seam 的 keychain provider，agent at-rest 不可读。
- [G3b per-user PAT stable 接线](tickets/phase-1/G3b-per-user-pat-stable-wiring.md): 落 Stratum A scaffolding（新 host package + file-shim fallback + `ctx.identity` stub），Stratum B 延后 P9b。
- [dashscope-default-llm-plugin](tickets/phase-misc/dashscope-default-llm-plugin.md): 路由重命名 `dashscope`→`aga` 解与 llm-pi-ai 的抢路由冲突；默认 profile 纯插件化用 DashScope，不靠 settings 外科手术。

### Phase 2 — capability seams

- [R2 MaxCompute 凭证缓存](tickets/phase-2/R2-maxcompute-cred-cache.md): 正经接 tier-0 resolver；override 过渡保险不删，退休判据=生产验收绿。
- [R6 凭证热更](tickets/phase-2/R6-cred-hot-reload.md): 选 (b) per-call `set_credentials` + da 自持 raw SDK Client/stdio（不用 mcp-client plugin），sidecar 工具非 model-facing。
- [G4 query sidecar 控制信道 + 可靠性](tickets/phase-2/G4-query-sidecar-control-reliability.md): 按 raw name 程序化调 sidecar 工具、一个都不进 `ctx.tools` → 控制信道缺口消解；(ii) lazy re-spawn。
- [P4 query-engine trio](tickets/phase-2/P4-query-engine.md): A1-split —— `ctx.query.execute` 拥有 engine-wrapper 门（cost/timeout/retry/orphan），会话门留 `tool-query`。
- [P4b query-maxcompute 生产硬化](tickets/phase-2/P4b-query-maxcompute-hardening.md): 真 `packages/query/{query,query-maxcompute}/`，per-call 幂等 `set_credentials` + signal cancel + 控制工具非 model-callable。
- [P4c 真 ODPS 执行路径](tickets/phase-2/P4c-real-odps-execution-path.md): maxc-backed sidecar + `query_data` Consumer 打通真实 EXECUTION，是 G1b execution-match 的硬门。
- [P4e per-scope ODPS data-source 解析](tickets/phase-2/P4e-per-scope-odps-data-source-resolution.md): endpoint/project 取自 scope-registry metadata、access key 取自 credentials seam，按活跃 scope 解析。
- [P5 检索/向量化](tickets/phase-2/P5-retrieval-vectorization.md): `ctx.embedder` + `ctx.retrieval` 两 seam（hybrid BM25+vec+RRF 内部组合，reranker 作 peer-protocol 非顶层 seam）；D2 取 (c) guided agentic hybrid。
- [P5b 检索/向量化生产硬化](tickets/phase-2/P5b-retrieval-vectorization-hardening.md): 落 `packages/{embedder,retrieval}/` 5 包 + `search_data_sources` additive 软回退。
- [T2 AGA-embeddings live-probe](tickets/phase-2/T2-aga-embeddings-live-probe.md): AGA 不提供向量模型（4 端点全 404 + chat 200 作控制）→ 向量侧走用户自部署 sidecar，非 AGA relay。
- [P6 语义层 substrate](tickets/phase-2/P6-semantic-layer.md): TS zod 镜像 RBI pydantic（EventDefinition/TableDefinition）+ ODPS 解耦的 `ctx.schema` seam + write-tiers；NL→SQL 引擎毕业 P13。
- [P6b 语义层生产硬化](tickets/phase-2/P6b-semantic-layer-hardening.md): ship `packages/data/semantic-layer/` + `ctx.schema` seam；`load_*` tool 包与 live-ODPS provider 作 follow-up。
- [P8 audit](tickets/phase-2/P8-audit.md): RBI 忠实精简 —— 3 面持久化（tool 调用 tagged + session-event + guard 决策）+ 关系型 own-`node:sqlite`，append-only override。
- [P8b audit 生产硬化](tickets/phase-2/P8b-audit-prod-hardening.md): 真 `packages/data/audit/`（`ctx.audit` + 3 表 WAL/STRICT + ownership guard），审 call outcome 非 stream。
- [P9 admin + 访问隔离](tickets/phase-2/P9-admin-access-isolation.md): 单一 additive 插件 `dsh-admin`，服务端解析 scope（非客户端可供给）+ net-new AccessLink + fail-closed。
- [P9b admin + 访问隔离生产硬化](tickets/phase-2/P9b-admin-access-isolation-hardening.md): 真 IdentityService 覆盖 G3b stub，激活 per-user 寻址（登录 session → CallerIdentity）。
- [P10 内网穿透安全](tickets/phase-2/P10-intranet-tunneling.md): 前期单 host + Mac 内网直达 → Caddy 反代 + mTLS **无隧道**（非 frp/chisel）；mTLS 仅 transport，工具门禁作 defense-in-depth。
- [P12 credentials keychain + per-user 寻址](tickets/phase-2/P12-credentials-keychain.md): 后端收窄 macOS Keychain（`security` CLI spawn，非 keytar，免 native 构建污染）。
- [P12b credentials keychain 生产硬化](tickets/phase-2/P12b-credentials-keychain-hardening.md): `security`-CLI-only + locked-keychain + auto-lock 为最终态；seam 内 `UserId`/`ScopeId` 走 branded 类型。
- [P12c native keychain binding + code-signing](tickets/phase-2/P12c-native-keychain-binding-code-signing.md): **dropped as over-spec**（破开箱即用 + 非硬边 + 威胁已被 P12b/P10 覆盖）—— 见 Out of scope。
- [G3c credentials-keychain-host mount](tickets/phase-2/G3c-credentials-keychain-host-mount.md): global-writes gap 解法 = (A) writable fallback shim；(C) 经 Cordis `provide` 双注册 throw 证伪。bundle 接线 opt-in 文档化、非 active。
- [S1 MaxCompute config 脱离 bundle](tickets/phase-misc/S1-decouple-maxcompute-from-bundle.md): Config `args[]` → `sidecarPath` + `maxcConfigPath`，patch 不再硬编码机器路径。

### Phase 3 — 四阶段编排与 NL→SQL 引擎

- [P7 四阶段 preset + phase-gate](tickets/phase-3/P7-four-phase-preset.md): rbi `DataAgentPipeline` 重表达到 harness seam —— additive preset overlay + phase-gate 插件；persona option C、turn-stopping 转换、guard 硬白名单。
- [P7b phase-gate 生产硬化](tickets/phase-3/P7b-phase-gate-hardening.md): 真 `packages/data/phase-gate/`（7 个 Cordis hook）+ critic fold + phase_output 捕获；B10/B11/B13 与 test-gap lock-in 列为非阻塞 deferred。
- [P13 NL→SQL 引擎](tickets/phase-3/P13-nl2sql-engine.md): 取极简 (B) 路径（完整 (C) 单期不可行）—— BM25 schema-linking 经 `ctx.retrieval` + critic 方案 1+4 替 sqlglot。
- [P13b NL→SQL 引擎生产硬化](tickets/phase-3/P13b-nl2sql-engine-prod-hardening.md): 生产 `packages/data/nl2sql-engine/` + conventions 提到 query-maxcompute + critic gate-only fold（守 P7b 边界）。
- [D5b phase-scoped tool visibility](tickets/phase-misc/D5b-phase-scoped-tool-visibility.md): `onAssemble` 按 `PHASE_TOOLS[phase]` 过滤工具（Approach A），模型只看到当前阶段白名单；终态返空列表。
- [F7 EXECUTION→INTERPRETATION UX 泄漏](tickets/phase-misc/F7-execution-interpretation-ux-leakage.md): `advance()` 的 inject 在 claim 之后 → 改为 claim 前 advance，消除阶段间自由文本泄漏。
- [aga per-phase thinking control](tickets/phase-misc/aga-per-phase-thinking-control.md): Option B 够（phase-gate 对 aga 跳过 `reasoningEffort`）；B'（per-phase 选模型）deferred —— rbi 无 per-phase thinking 先例，成本未达实测痛点。
- [PG1 phase-gate session events 调研](research/phase-gate-session-events.md): phase-gate 零 session events、阶段状态全内存 ephemeral（Python rbi 移植遗留）—— 改造本身仍是 open 票 [PG1](tickets/phase-misc/PG1-phase-gate-session-events.md)。

### Phase 4 — eval harness

- [G2 eval TS vs Python](tickets/phase-4/G2-eval-ts-vs-python.md): 落 TS `packages/eval/` 重实现编排；判分 (ii) DELIVERY+EXECUTION 不进 sqlglot。R3 的「agentic 判分需 Python」因漏看 TS SDK client 而不成立。
- [R3 多轮 eval hook](tickets/phase-4/R3-multiturn-eval-hook.md): 响应正文在 session 事件流（非 agent 事件层）；多轮同 Session 多次 `run()`，pass_k 各 k 独立 session_id。
- [P11 eval harness](tickets/phase-4/P11-eval-harness.md): throwaway proto 定 D1–D6 六决策 + 9 条 finding 毕业生产。
- [P11b eval harness 生产硬化](tickets/phase-4/P11b-eval-harness-hardening.md): 生产 `packages/eval/eval/` 为 TS 纯库、zero-seam-dep、不注册 `ctx.eval`；CLI/persist/pass_at_k 毕业 P11c。
- [P11c eval CLI runner](tickets/phase-4/P11c-eval-cli-runner.md): 独立 CLI runner（不依赖完整 agent 会话），协作者注入走 mini Cordis context。
- [P11d eval LLM Judge SQL 语义](tickets/phase-4/P11d-eval-llm-judge-sql-semantics.md): 5 维度 0/1 评分 judge + schema context 注入 + 非 SQL 快速拒绝；executor 在时走 dual-score。
- [P11e eval case set v2](tickets/phase-4/P11e-eval-case-set-v2-realistic.md): 80 case / 30 核心表 / 9 intent 的真实场景集，暴露粒度混淆 + BM25 gap + 多表关联 → P14/P15。
- [G1b eval 基础设施 bug 修复](tickets/phase-misc/G1b-infra-bugs-resolved.md): 12 个阻塞 bug（value-only 匹配 / reasoning array / SQL 提取 fallback / `process.exit` 挂起 / sidecarPath config）；`execution_match=0%` 根因是分区无数据与期望值占位，非 SQL 方言。
- [G1b BM25 检索召回修复](tickets/phase-misc/G1b-retrieval-quality.md): tokenizer 不拆下划线是根因 → 下划线拆分 + hybrid name-match + 全 corpus 扫描，Recall@5 0%→86.7%。
- [G1b eval set 归档清理](tickets/phase-misc/G1b-eval-set-cleanup.md): k11-v1（161 case）归档，删 30/5-case 子集，`k11-v2`（80 case）成唯一 active 集。
- [G1b 实验执行](tickets/phase-misc/G1b-experiment-execution.md): execution_match 0%→25% 后瓶颈从 retrieval 移到 LLM SQL 生成质量；query-provider 层加确定性 SQL 方言修正（`normalizeForMaxCompute`：注释/围栏剥离 + MaxCompute 函数重写）。
- [G1c 实验变体 preset B/C/D](tickets/phase-misc/G1c-variant-presets-tool-roster.md): B/C/D preset 建成并复用 A 的 data-tool roster + honesty tagging，使 2×2 变体可测。
- [E-DA4 delegate_query 可行性](tickets/phase-misc/E-DA4-delegate-query-engine-probe.md): 直接实例化 `Nl2sqlEngine` 跨 scope 查询端到端可行（24/24 断言）。
- [E-DA5 eval 表可解析性覆盖](tickets/phase-misc/E-DA5-eval-table-resolvability-coverage.md): `stand-in-odps` 对任意 SQL 返固定值、不校验表可解析性 → eval 绿而 live 失败；加可解析性校验。

### Model-facing 工具与交付链

- [data-agent 工具包 shipping 聚合](tickets/phase-misc/data-agent-tool-packages-shipping.md): 四阶段 model-facing 工具全部 ship（`query_data` / `load_*` / `present_*` / `compute`）；critique/evaluate 按 P13b Q4 保持 gate-only 不 ship。
- [data-agent 全对话就绪](tickets/phase-misc/data-agent-conversation-readiness.md): 2026-08-21 sweep 记录的 build + LLM-wiring + 工具占位三道缺口已全部关闭，全链路 NL→SQL→query→delivery 可跑。
- [search_data_sources 注册](tickets/phase-3/P13b-nl2sql-engine-prod-hardening.md): 首个 model-facing tool 走 `defineTool` + `ctx.tools.register`，确立后续 `load_*`/`query_data`/`present_*` 的 ship 模式。
- [query_data + EXECUTION via maxc](tickets/phase-2/P4c-real-odps-execution-path.md): 新包 `packages/query/query-tool/` 镜像 P13b 形态，agent 自己跑 SQL 经 `ctx.query.execute`。
- [load_* schema grounding](tickets/phase-2/P6b-semantic-layer-hardening.md): `tool-load-{table,event}-definition` 调 `ctx.schema` substrate；GENERATION 白名单补 `load_*`，substrate 错误裹 try/catch 不泄 stack。
- [critic harvest load 嵌套](tickets/phase-misc/critic-harvest-load-nesting.md): `captureToolData` 需探嵌套 `value.table`/`value.event` 并提 array-of-objects 的 `name` 叶，critic 的 `partition_cols`/`event_params` 才真被填。
- [present-delivery-tools](tickets/phase-misc/present-delivery-tools.md): INTERPRETATION 交付走四个独立 tool 包（非参数化单 tool）—— `present_decomposition` / `present_table` / `compute` / `suggest_followups`。
- [present_* delivery tools ship](tickets/phase-misc/present-delivery-tools.md): 四工具 preset 行解注释 + bundle deps 接线，INTERPRETATION 阶段全部可调用。
- [safe-compute-environment 调研](tickets/phase-misc/data-agent-safe-compute-environment.md): Python Provider 不存在（`code-runtime-python` 仅协议库），需新建 data-python Provider；seccomp/namespace/Landlock 被后续 grilling 降为部署加固参考。
- [safe-compute 架构决策](tickets/phase-misc/safe-compute-architecture-decisions.md): 6 决策 —— 数据注入走 resultCache 独立 SD + compute 薄 facade；存储内存 Map、session-scoped；信任姿态是 containment 而非 security boundary。
- [result-cache-service](tickets/phase-misc/result-cache-service.md): `ctx.resultCache` seam + 内存 Provider（`dsh-result-cache`），确定性缓存键。
- [P4d resultCache ↔ query_data 集成](tickets/phase-misc/P4d-resultcache-query-data-integration.md): `query_data` output schema 补 `result_id`，使 post-execute 值增强通过 `additionalProperties:false` 且模型可见缓存键。
- [code-runtime-data-python](tickets/phase-misc/code-runtime-data-python.md): CPython subprocess `CodeRuntime` Provider 落地（`dsh-code-runtime-data-python`）。
- [compute-tool](tickets/phase-misc/compute-tool.md): `dsh-tool-compute` ship —— LLM 生成 pandas 代码经 `ctx.codeRuntime` 跑在 cached results 上，返回新 `result_id` 供 `present_table`。
- [S7 data-python 日志计量重构](tickets/phase-misc/S7-refactor-data-python-log-metering.md): 手搓分配式 meter 换成 sibling `jsonStringBytesUpTo`。

### 检索质量与 corpus（D2 系列）

- [D2c retrieve-tool keep/regress](tickets/phase-misc/D2c-retrieve-tool-keep-regress.md): keep (b) escape-hatch；regress-to-(a) 延后到真 eval 数据（删能力需召回 ≥85-90% + 歧义 <15% 的强证据）。
- [D2c-impl retrieve-tool ship](tickets/phase-misc/D2c-impl-retrieve-tool-shipping.md): additive model-facing `retrieve(query, top_k?)` 落 `packages/data/tool-retrieve`。
- [D2d retrieval-quality re-frame](tickets/phase-misc/D2d-retrieval-quality-reframe.md): 问题非单因 —— 是 3 层 gap 栈 + mislabel；FakeHash-as-default 是 self-harm（全 6 corpus variant 严格劣于 BM25-only）。
- [D2e corpus enrichment](tickets/phase-misc/D2e-corpus-enrichment.md): pack `params_fields` + terminology slang 进 `description` ×1（加权 ×3 经探针证伪）。
- [D2f 激活 corpus enrichment](tickets/phase-misc/D2f-activate-corpus-enrichment.md): bundle 解注释 `semantic-layer` + dep 落地，dormant enrichment 转 active。
- [D2g corpus-recall 大样本复测](tickets/phase-misc/D2g-corpus-recall-larger-caseset-retest.md): 在 reverse-bi 全 5 scope（113 gold，3.6× D2e）复测 term-only / params+term / topK sweep，verdict (A)。
- [D2h corpus term-only + topK→20](tickets/phase-misc/D2h-corpus-term-only-selectable-topk.md): term-only 可配 + 默认 prefetch topK 5→20（113-gold：term-only 77.0% vs params+term 68.1%）。
- [S3 删 FakeReranker + fakeRecall](tickets/phase-misc/S3-delete-fakereranker-fakeRecall.md): D2d 实测有害且无生产消费者 → 从 embedder-fakehash 删除；Reranker peer protocol 与 InfinityReranker 保留。
- [S5 删 EmbedderService.dim getter](tickets/phase-misc/S5-delete-embedderservice-dim-getter.md): 无读取者的公开 getter 删除，私有 `_dim` 保留。
- [P15 query rewriting](tickets/phase-misc/P15-query-rewriting.md): 取方案 B（LLM query expansion via qwen-flash），原型 2/6→6/6 hit@5；根因是 corpus 的 token gap。
- [P15a query expansion 实现](tickets/phase-misc/P15a-query-expansion-impl.md): `expand-query.ts` 走 `ctx.llm` streaming + graceful degradation，生产所有检索路径前调用。
- [P14 ontology-aware 表选择](tickets/phase-misc/P14-ontology-aware-table-selection.md): engine pipeline step + soft prefer（不 hard filter、不走 BM25 boost）+ 确定性正则 trend 检测。
- [P14b ontology enrichment 实现](tickets/phase-misc/P14b-ontology-enrichment-implementation.md): `detectTrendIntent` + `rerankByGranularity`（`_di` ×1.5 soft boost，不删候选）+ `expandCandidates` + prompt Rule 9。

### 自进化、scope 路由与运行时缺陷

- [M1 virtual-metric projection](tickets/phase-misc/M1-virtual-metric-projection.md): 去 3916 份独立 metric yaml，改运行时虚拟投影派生（单一数据源 = table/event yaml）。
- [M1-range-where-hint](tickets/phase-misc/M1-range-where-hint.md): `buildMetricContext` 追加时间范围 WHERE hint（快照表→`MAX_PT()`、日粒度→ds 过滤、无 ds→不追加）。
- [M1d 时间过滤 hint 引擎无关化](tickets/phase-misc/M1d-time-filter-hint-multi-engine.md): Ontology/Operational 分层 —— `TableDefinition.temporalPolicy` 是引擎无关语义事实，方言落 engine conventions；触发条件=引入第二引擎。
- [M1a YAML 结构未来支持](tickets/phase-misc/M1a-yaml-structure-future-support.md) / [M1c caliber variant 设计](tickets/phase-misc/M1c-caliber-variant-design.md): 两张 M1 衍生票 **closed 而非实施** —— YAML 结构缺口已由 M2 的 `qualifyTable` 路线覆盖，caliber variant 本身就是 M1 的虚拟投影，无独立工作。
- [M2 self-evolution 架构](tickets/phase-misc/M2-self-evolution-architecture.md): 表 project 未知时 agent 诊断→问用户→写 override→重试的闭环；`qualifyTable` 移到 query provider。
- [M3 self-evolution 前置阻碍](tickets/phase-misc/M3-self-evolution-blockers.md): `load` 返 qualified_name、F2 放宽 same-source ORDER BY/LIMIT 等 3+1 项前置修复。
- [M4 update_table_config 持久化](tickets/phase-misc/M4-update-table-config-persistence.md): prompt-only 的 inject/persona 教调会被 LLM 跳过 → 走 phase-gate 强制路径。
- [M5 GENERATION SQL candidate from tool-call](tickets/phase-misc/M5-generation-sql-candidate-from-toolcall.md): `extractSqlCandidate` 需同时看 `critique_sql_tool` 产出的 `last_sql`，否则 LLM 空转 retry。
- [G-DA4 event table name grounding](tickets/phase-misc/G-DA4-event-table-name-grounding.md): `event_view` 是 config-level / scope-level surface（所有 event 共享 `ods_{game_id}_all_view`），不改 EventDefinition schema。
- [G-DA5 per-question 自动 scope 路由](tickets/phase-misc/G-DA5-per-question-scope-routing.md): 7 决策 —— 原则是「提供工具让 LLM 编排、harness 兜底抹平模型差异」；路由时机 LLM 工具自决 + harness pre-step alias 检测 fallback。
- [G-DA6 多轮 candidate_tables 继承](tickets/phase-misc/G-DA6-multiturn-candidate-tables-inheritance.md): 方案 (a) 直接继承 —— `resetQuestionScoped` 从 `prior_turn_tables` 快照 seed，范围仅前 1 轮。
- [P-DA4 scope routing 工具](tickets/phase-misc/P-DA4-scope-routing-tools.md) → [P-DA4c ship](tickets/phase-misc/P-DA4c-scope-routing-ship.md): 探针正式打包为 `dsh-tool-scope-routing`（`list_scopes` + `switch_scope` + alias-hint system-prompt 注入）。
- [P-DA4b phase-gate scope 动态化](tickets/phase-misc/P-DA4b-phase-gate-scope-dynamic.md): 删硬编码 K11 view，`SQL_CONVENTIONS` 改由 active scope 的 config 组装。
- [B-DA2 scope routing 确认 + 按需加载](tickets/phase-misc/B-DA2-scope-routing-confirm-and-lazy-load.md): 静态全量注入 scope 详情使 `list_scopes` 形同虚设 → 改简短提示 + 引导调用。
- [B-DA3 K11 表定义错误 project override](tickets/phase-misc/B-DA3-k11-wrong-project-override.md): 321 个表定义里唯一的 `project:` 字段是 enrichment 误写 → 删除，不靠 per-table override 绕。
- [B-DA4 P-DA4b 未完成项收口](tickets/phase-misc/B-DA4-pda4b-incomplete-conventions-and-reset.md): 标 resolved 但两项改动未落地，经代码验证后补齐。
- [B-DA5 per-scope maxc config routing](tickets/phase-misc/B-DA5-per-scope-maxc-config-routing.md): 「表不存在」是假阳性 —— 根因在 sidecar-self 的 credMode 与 config 路由，表确实在 `ieu_cdm`。
- [B-DA6 qualifyTable live 接线](tickets/phase-misc/B-DA6-qualifytable-live-wiring.md): option B（prompt 渲染 qualified 候选名）real-LLM 验证 73.8%→6.5%，**已 revert**。
- [B-DA1 preset 切换 tool interrupt 竞态](tickets/phase-misc/B-DA1-preset-switch-tool-interrupt-race.md): partial-fix 原在已删的 apiproxy；收口判据 = session JSONL 的 `turn/end.reason.reason.kind === 'disposed'`，该判据需交互式会话 capture（2026-09-15 由 UM4 交回本票）。
- [B-DA7 phase-gate 基础设施故障无终止态](tickets/phase-misc/B-DA7-phase-gate-infrastructure-failure-terminal-state.md): 「恢复循环」定性为**有界的预期恢复**且非合并引入；暴露三个先存缺陷（transport 类失败无终止分支 / `honestDecline` 不落 session 记录 / 该路径零测试）。
- [DA1 preset.yml 展示元数据](tickets/phase-misc/DA1-preset-yml-display-metadata.md): preset 的展示元数据落 `preset.yml`。
- [R4 goals:false 抑制](tickets/phase-misc/R4-goals-false.md): `goals:false` 完全抑制 spine goal mount；shipped base+patch 走 `disabled:true` 等价零 code 改 → Q8 保留是选择非约束。
- [R5 acp 删除 fallout](tickets/phase-misc/R5-acp-fallout.md): 删 `packages/acp/` 会级联 acp-demo + acp-agent（~70 场景/57 配置/18 测试），da 零交集 —— 给 (c) 方案的代价基线。
- [S2 删 tool-scope-routing 探针](tickets/phase-misc/S2-delete-tool-scope-routing-probe.md): 删的是无 `src/` 的旧探针包；现存 `packages/data/tool-scope-routing` 是 P-DA4 的真实现，勿混淆。
- [S4 删 RequestDefaults seam](tickets/phase-misc/S4-delete-requestdefaults-seam.md): llm-dashscope 的空 speculative interface 删除。
- [S6 删 getLastTwoRuns](tickets/phase-misc/S6-delete-evalrunner-getlasttworuns.md): test-only method/field 删除，`trigger_eval` 改用内联 pair。
- [host-typecheck-wiring](tickets/phase-misc/host-typecheck-wiring.md): `tsconfig.host.json` 补 3 个 data 包 references 修 TS6307（build-hygiene wiring，非 wayfinder 决策）。

### 语义层管理 UI 与知识图谱（W 系列）

- [W8 Evidence RPC Gateway](tickets/phase-misc/W8-evidence-rpc-gateway.md): evidence-query → TypertRemoteService gateway（namespace `evidenceQuery`）+ FileBacked store 运行时注入 + eval-run-completed 热加载。
- [W9 Schema Browser UI](tickets/phase-misc/W9-schema-browser-ui.md): 消费 SchemaGateway 的 client 组件（SchemaExplorer + AssetDetail + `useSchemaGateway`），注册 `details.aux` slot（management-session gated）。
- [W10 知识图谱可视化](tickets/phase-misc/W10-knowledge-graph-visualization.md): `packages/client/ui-context-layer/`（g6 v5 + 三级 LOD + combo-force + minimap）+ `getGraphData` RPC + `ctx.reflect.provide('contextLayer')` → `shell.overlay` 全屏组装。
- [W11 图谱对话式管理与 enrichment 闭环](tickets/phase-misc/W11-graph-edit-enrichment.md): 新增 `tool-revert-edit`（audit before-snapshot + 版本回滚）、`management-session`、`patrol` 三包，图谱修正走对话 + tool 而非 UI 直接编辑。
- [W12 ContextLayerGraph 节点点击失效](tickets/phase-misc/W12-contextlayer-node-click-dead.md): G6 5.1.1 无 `evt.itemId` → 两个 handler 改读 `evt.target.id`。
- [W13 ContextLayer 动画层不重绘](tickets/phase-misc/W13-contextlayer-animations-no-repaint.md): 12 处 `update*Data` 零 `draw()` → 全部配对；G6 5.1.1 实测该调用不触发重绘（像素哈希不变）。需 W17 接通 `eventSource` 才可观测。
- [W14b ui-context-layer 挂载](tickets/phase-misc/W10-knowledge-graph-visualization.md): W10/W11 交付的包从未挂载（boot manifest 46→48）—— bundle dep + patch 行置于 `ui-semantic-layer` 之前 + `contextLayer` 改惰性解析；同批修 `duplicate loader entry id: result-cache` 冷启动整组失败。
- [GA-GRILL-wiring selectedAssetId 共享](tickets/phase-misc/GA-GRILL-wiring-selectedAsset.md): 取方向 D —— 框架 session-scoped slot store（`defineStore` + `store:`），非 projection。
- [GA-WIRING-impl session-scoped slot store](tickets/phase-misc/GA-WIRING-impl-session-scoped-slot-store.md): `createSelectionStore()` apply 期构造，两个 `details.aux` entry 声明同一 handle → 按 handle×sessionId per-session 隔离。
- 跨 map 指针：管理 session 的客户端桥接与可扩展 Semantic Graph 投影归 semantic-layer 的 [W17](../semantic-layer/tickets/W17-management-session-client-bridge.md) / [W27](../semantic-layer/tickets/W27-extensible-semantic-graph-projection.md)；冷启动 blocker 归 [CB-1](../semantic-layer/tickets/CB1-cold-boot-blockers.md)。

### Generalization audit（2026-08-31 起）

- [generalization audit 报告](research/generalization-audit-2026-08-31.md): 8 维度并行审计 → 95 finding → 29 action item + 7 条系统性架构缺陷；开票决策清单见 [tickets 清单](research/generalization-audit-tickets-2026-08-31.md)。
- [GA-GRILL1 persona 归属](tickets/phase-misc/GA-GRILL1-persona-ownership.md): 取 C-plus —— `ctx.domain` Cordis 服务 + `semanticRoot/domain-profile.yaml` 结构化存储 + 对话式按需生成，覆盖全部 5 处游戏硬编码；实现票 GA-GT5。
- [GA-GRILL2 i18n 架构](tickets/phase-misc/GA-GRILL2-i18n-architecture.md): 两阶段分层 —— Kind 2（逻辑层去中文）6 决策落 GA-I18N-1~5；Kind 1（prompt 模板化）转实验；scope 收窄为中英双语。
- [GA-GRILL2 Kind 1 重新评估](tickets/phase-misc/GA-GRILL2-i18n-architecture.md): Kind 1 作为**实施方向 won't-do**（无 seam、无诉求，是价值判断非「英文不可行」）；研究诉求转 GA-EXP5。
- [GA-GRILL3 TableDefinition schema](tickets/phase-misc/GA-GRILL3-tabledef-schema.md): 5 决策 —— enrichment 解耦 kind / 雪花模型 dim→dim / ontology 结合深度由实验定 / kind enum + 富文本双轨 / LLM-driven 推断为主启发式为 fallback；实验票 GA-EXP1。
- [GA-GT1 多租户隔离 / per-request scope](tickets/phase-misc/GA-GT1-multi-tenant-scope.md): per-request scope context + 移除全局 `active` 指针 + tenant 隔离 + 缓存 corpusVersion 校验（D1–D6 锁定）。
- [GA-GT1-impl Phase 1+2](tickets/phase-misc/GA-GT1-impl-multi-tenant-scope.md): 纯叠加的容量 + 调用方迁移（`ScopeRegistry.forTenant` / per-scope LRU / `ToolExecutionInput.scopeId` / per-request `getConventions`），`active` 保留作兼容回退。Phase 3+4 是 breaking，归 [GA-GT1-cleanup](tickets/phase-misc/GA-GT1-cleanup-multi-tenant-scope.md)。
- [GA-GT2 引擎抽象](tickets/phase-misc/GA-GT2-engine-abstraction.md): `EngineConventions` 迁入 `dsh-query` 抽象包 + `QueryEngine.getConventions()`（遵 Capability Seam 模式、不用 standalone registry）+ 未知引擎 fail-loud。
- [GA-GT2-impl 引擎抽象实施](tickets/phase-misc/GA-GT2-impl-engine-abstraction.md): B1–B5 全落（类型迁移 / prompt 引擎中性改写 / 删 PARTITION_COLUMNS / postgres 空壳 / bundle 描述）。
- [GA-GT2-nit-cleanup](tickets/phase-misc/GA-GT2-nit-cleanup.md): 6 个机械 NIT（deep-import 一致性、README、JSDoc/error、postgres metadata）。
- [GA-GT3 item 5+6 enrichment 数据丢失](tickets/phase-misc/GA-GT3-enrichment-generalization.md): 取 (b) origin-aware replace —— re-discovery 丢 `deterministic`/`llm` ref、保 `manual`/`undefined`；空 inventory short-circuit。
- [GA-GT3-5b preserveCurated 逃逸阀](tickets/phase-misc/GA-GT3-5b-preserve-curated-escape-hatch.md): opt-in 全量替换 toggle（additive）。
- [GA-GT3-5c backfill origin 字段](tickets/phase-misc/GA-GT3-5c-backfill-origin-field.md): 既有 ref 回填 `origin`，使 origin-aware replace 有判据。
- [GA-GT3-6b agent 可见的 discover_relations 报告](tickets/phase-misc/GA-GT3-6b-agent-visible-reporting.md): 返回 `note?` 让 agent 看到发现结果而非静默。
- [GA-GT4 eval 框架去 K11](tickets/phase-misc/GA-GT4-eval-de-k11.md): 架构由 evaluation G10 supersede；surviving work 路由到 evaluation 的 T13/T9/T14/T15/T12、R9/G9/T8、R25/R21/G15。
- [GA-I18N-1 DimensionRef origin 字段](tickets/phase-misc/GA-I18N-1-origin-field.md): `origin: 'deterministic'|'llm'|'manual'`，`mergeRefs` 改按 origin 优先级覆盖，删 `startsWith('确定性')`。
- [GA-I18N-2 freshness enum 迁移](tickets/phase-misc/GA-I18N-2-freshness-enum.md): `z.preprocess` shim 把 `'静态参考'` 映射为 `'static_reference'`。
- [GA-I18N-3 TREND_PATTERN 双语](tickets/phase-misc/GA-I18N-3-trend-pattern-bilingual.md): 双语数组 + `.some()`，英文关键词加 `\b` 防误匹配。
- [GA-I18N-4 extractTimeParams 双语](tickets/phase-misc/GA-I18N-4-time-params-bilingual.md): `TIME_RULES[]` 声明式映射，日期算术保真。
- [GA-I18N-5 内部标记英文化 + strip](tickets/phase-misc/GA-I18N-5-marker-english-strip.md): 内部标记改英文 + 跨 chunk 缓冲 `stripMarkersFromStream`；delivery 标记不 strip。
- [GA-CL8 eval-cli responder config](tickets/phase-misc/GA-CL8-eval-cli-responder-config.md): responder 选择与配置从硬编码改为 CLI/config 驱动。
- [GA-GRILL-eval-manifests constraints 偏离](tickets/phase-misc/GA-GRILL-eval-manifests.md): 取方向 A —— 三包全合规、不动 gate（`invariant.ts` 是全仓惯例非死代码）。
- [GA-EVAL-MANIFEST-impl](tickets/phase-misc/GA-EVAL-MANIFEST-impl-comply.md): eval-cli/eval-runner/retrieval-experiment 三包按方向 A 全合规，`check-workspace-constraints` git diff 空 = upstream-merge-safe。
- [GA-GRILL-query-postgres-compliance](tickets/phase-misc/GA-GRILL-query-postgres-compliance.md): query-postgres 的 src-only 形态与 verify-* 门的合规路线。
- [GA-QUERY-POSTGRES-impl](tickets/phase-misc/GA-QUERY-POSTGRES-impl-comply.md): query-postgres 从 src-only 转 build 合规（镜像 eval-cli 先例）。

### Eval 基线、实验与仪表（GA-EVAL / GA-EXP / GA-MODEL）

- [GA-EXP2 prompt 语言实验](tickets/phase-misc/GA-EXP2-prompt-language-experiment.md): 168 case × 3 variant —— 全英文 B vs 中文 A = **-41.1%** 灾难性退化，英文 judge 无影响 → **保留中文 prompt**。
- [GA-EXP3 英文 prompt 退化根因](tickets/phase-misc/GA-EXP3-en-prompt-degradation-root-cause.md): 主因是 qwen-plus 在英文指令下切换「Helpful Assistant」模式（~55-60%）+ 跨语言干扰（~25-30%）；翻译质量非主因。
- [GA-EXP4 qwen3.7-max 交叉验证](tickets/phase-misc/GA-EXP4-qwen37max-en-prompt-crossval.md): -3.0%（88.1%→85.1%）**不显著**（McNemar p=0.332）→ EXP2 的退化是 qwen-plus 的能力问题，Kind 1 重新打开。
- [GA-MODEL1 qwen3.7-max 默认化](tickets/phase-misc/GA-MODEL1-qwen37max-default.md): 同代码/协议/日期下 **+16.1% 零回归**（16 切片全升），延迟 +48.9%；正式否决 qwen-plus，并修正「76.8% 基线是 qwen-plus」的错误前提。
- [GA-EVAL-REBASELINE pass^k 语义](tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md): `passKVerdict` = all-must-pass（故意的 anti-flakiness 决策，非 bug）；`RunResult.config` 落 12 字段 config stamp —— 正是 63-case AGA-burst 污染此前无法从产物检出的缺口。
- [GA-EVAL-CLEAN-RERUN uniform clean 基线](tickets/phase-misc/GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md): 单一 config-stamped 基线 **61.9% (104/168)** 取代 52.4% 的 hybrid merge；executor real-exec 在 k11-v2 上不可行（expected 值非真实执行派生）。
- [GA-EVAL-REAL-EXEC 首个真实执行基线](tickets/phase-misc/GA-EVAL-REAL-EXEC-real-execution-baseline.md): RBI 39 EXEC case 上 real-exec **12.8%** vs judge **48.7%** → **judge 放过率 35.9pp**（judge 通过里 73.7% 是假的）；post-resolution 复核撤回 dual-score（`--with-query` 会改 SQL gen，非 standalone ceiling）。
- [GA-EVAL-SQLGEN-PROMPT-FIX 工具目录泄漏](tickets/phase-misc/GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md): `contextPrefetched` flag 落地（additive），非 SQL 发射双模式 0%；但 real-exec 未回升反降 → **「34% 非 SQL 是 real-exec 主因」假设证伪**，真瓶颈是 event schema 缺失。
- [GA-EVAL-SQLGEN-FOLLOWUP 分歧根因](tickets/phase-misc/GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md): 分歧 = judge-leniency + all-must-pass 脆弱性 × feedback-wiring gap + 未触及 event-case 瓶颈，**非系统性 prompt 退化** → 毕业 (a) eventDef pre-fetch + (d) retry feedback 两张实现票。
- [GA-EVAL-EVENTDEF-PREFETCH event_view grounding](tickets/phase-misc/GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md): 两段式事件检测 + `eventView` 同时进 promptBuilder 与 critic `candidateTables`（少了后者 critic 会拒掉自己注入的表）；(a)+(d) 组合首次测到最大收益（null-SQL −38%）。同时查出两处**仪表坏**：case expected 值已漂移（event 16/18 不符）、SQL judge 用 BM25 候选当 schema context 在惩罚正确答案。
- [GA-EVAL-RETRY-FEEDBACK retry feedback 接线](tickets/phase-misc/GA-EVAL-RETRY-FEEDBACK-wiring-gap.md): `BuildPromptArgs.feedback` + gated `renderFeedbackSection`（byte-stable）；wiring 修对但 **(d) 单独不动针** —— 必要非充分。
- [GA-CL-batch CL 清理](tickets/phase-misc/GA-CL-batch.md): 18 条机械 CL 里 9 条已清（OdpsExecutor 命名 / text_sim 阈值 / BM25 丢 kana / `autoFlipThreshold` 不可配 等）；CL5 的 `mergeRefs` '确定性' 前缀被 GA-I18N-1 吸收、CL7 被 GA-GT5 吸收，故不重复计。
- [GA-CL15 eval-cli context i18n](tickets/phase-misc/GA-CL15-eval-cli-context-i18n.md): 原 i18n scope 已由 EXP2/GRILL2 关闭，剩余只是 expansion prompt 去重（`context.ts` 的副本应 import 单一源）。
- 基线可复现性：`packages/eval/eval/cases/rbi-10000251-exec/` 39 个 case **现已入 git**（2026-09-04 记录的「未被追踪、源在仓库外」风险已消）；对应的 reference-SQL / snapshot 锚点保留由 evaluation 的 [T11](../evaluation/tickets/T11-loader-source-strip.md) 承接。

### 审计、合规与简化

- [GA-AUDIT1 全仓对抗 code review](tickets/phase-misc/GA-AUDIT1-followup-findings.md): 四阶段审计 —— 14 维度对抗 review（126 confirmed finding）+ lint 524→0 + pass^k 重基线；剩余 findings 的逐条处置账在 [followup-residual](tickets/phase-misc/GA-AUDIT1-followup-residual.md)。
- [GA-AUDIT1-followup 逐条核验](tickets/phase-misc/GA-AUDIT1-followup-findings.md): ~120 条逐条读 `file:line` 验证 → 52 修 + 6 判已不适用；真则修、假则标，每文件 oxlint + spec 验。
- [PB-COMPLY 插件体合规](tickets/phase-misc/PB-deferred-admin-config-zod-clash.md): plugin-body audit 32 violations → 24 修 + 2 误报 + 6 延后（延后项各有自己的 `tickets/phase-misc/PB-deferred-*.md`，含 registrations-as-effects 等规则）。
- [GA-KNIP-cleanup](tickets/phase-misc/GA-KNIP-cleanup.md): `pnpm run knip --treat-config-hints-as-errors` 从 exit 1 清到 exit 0（16 config hint + unused deps）。
- [S 系列简化候选](tickets/phase-misc/S1-decouple-maxcompute-from-bundle.md): S1–S7 全部 resolved（2026-08-28）；核证提醒 —— S3/S4/S5 的目标名在 `git grep` 下仍有命中，那些是 JSDoc 提及或同名无关物，**别用一次粗 grep 推翻已完成的工作**。
- [GA-CORDIS-CATALOG-FIX](tickets/phase-misc/GA-CORDIS-CATALOG-FIX.md): 20 个测试失败 triage（3 fork-own + 7 stale + 5 upstream + 5 env）+ 修 6 道被掩盖的 catalog gate。
- [R-DA-UI-PRESENTER-COMPOSITION](tickets/phase-misc/R-DA-UI-PRESENTER-COMPOSITION.md): 取 Plan B —— 保留上游 `tool.call.toolview` slot + repoint imports + re-home `blockText`，不走 Plan A 的架构改造；snapshot 取用走 `ChatSnapshot.legacy` compat slice（ADR-0002 addendum）。
- [R-DA-CLIENT-RUNTIME-DECOMMISSION](tickets/phase-misc/R-DA-CLIENT-RUNTIME-DECOMMISSION.md): fork-only 僵尸包 `packages/client/runtime`（上游已删 monolith 的完整拷贝，131 ghost error 全在其内部）**删除**；对 boot wiring 为 no-op。
- [R-DA-UI-SETTINGS-MODELS-VITEST-DEBT](tickets/phase-misc/R-DA-UI-SETTINGS-MODELS-VITEST-DEBT.md): shard 2 的 vitest 债（D1 双调 fold 根因 + 6 个 full-build tsc error）。
- [COV1 逐文件 100% 覆盖率轨道](tickets/phase-coverage/COV1-per-file-coverage-100-track.md): 从 UM18 剥离为独立长期轨道（数千处位置、数百 PR，量级上不属一个同步专项）；排序口径 = `data/tool-*` 家族，补法三档分治（A 从零建套件 / B 只补契约外壳 / C 逐位置）。票内 8 条测量陷阱清单动手前必读。
- [plugin_manager 采用设计](tickets/phase-misc/plugin-manager-adoption.md): 方向=采用，但另起专票设计、不夹带进 coverage 轨道（2026-09-20 用户拍板）；`plugin_manager` 管的是跨重启持久的已装插件清单，挂上即让模型能跨 session 持久扩张能力面 → **HITL，agent 不得自答**。

### Fork CI 与 upstream sync

- [GA-FORK-CI fork CI 不能绿](tickets/phase-misc/GA-FORK-CI-green.md): 三类根因 —— node-24 custom larger runner org-restricted 到 upstream、master 自身 gate 失败、fork 缺 token/secret。
- [GA-FORK-CI translation-pairing 债](tickets/phase-misc/GA-FORK-CI-translation-pairing-debt.md): corpus 全配对一致（1069 pairs，0 missing / 0 OOS）—— 可靠方法 = 并行 subagent + 工具门（非自报）+ `--write` re-record + 显式路径 commit + 一行一段。
- [CI-unmatched-dispositions-tally-drift](tickets/phase-misc/CI-unmatched-dispositions-tally-drift.md): oxlint unmatched 程序台账漂移，防线以 `status === 0` 为守卫 → lint 红时它静默 inert。
- [UM1–UM9 triage](tickets/phase-upstream-merge/UM1-pre-merge-branch-cleanup-and-merge.md): UM1/UM3/UM5/UM7/UM8/UM9 archived（done / resolved-by-upstream / superseded）、UM2 folded→UM12。
- [UM4 apiproxy 重落户](tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md): results-RPC 重落 `packages/api/remotes` 并补两条手写区声明（bundle `dependencies` + `tsconfig.base.json` 的 `/src/*` 映射，生成器永不产该 key）；对 merge 目标域判 out-of-scope 后关票，残留交回 B-DA1。
- [UM6 docs/subsystems](tickets/phase-upstream-merge/UM6-docs-subsystems-keep-data-agent.md): 保 fork 侧 data-agent doc + 接受 upstream 其余；3 组 README triplet + eval 入 exemption → `verify-subsystem-pages` 5→0。
- [UM10 全门 verify sweep](tickets/phase-upstream-merge/UM10-verify-typecheck-lint-ci-gates.md): full-gate 实跑取代估算；full lint 93 errors 判 pre-existing（oxlint typeAware 解不出 Cordis service handle，tsc=0 反证）。
- [UM11 PR + merge + 后清理](tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md): master-sync 与 worktree/分支逐条处置；⚠ 5 个 `refactor/p2-*` **不可按 ancestry 判删**（Phase-2 是按内容收编非 merge）。
- [UM12 post-merge GA-FORK-CI re-sweep](tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md): 18 门红分 **A 真 pre-existing / B merge 期回归 / C 随 upstream 新增**（第三类此前无人记录）；**CI real red-set ⊊ 本地红集** —— 多数 gate 在 GitHub 上没有对应 job，只看 CI 会系统性低估、CI 绿 ≠ 门绿。
- [UM13 / UM14 re-sync 到 upstream 最新](tickets/phase-upstream-merge/UM14-resync-to-upstream-latest.md): re-sync 可行性与 449-commit impact 核验，确立「先 re-sync 再解冲突」的路线。
- [UM15 durable upstream-sync 方法](tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md): 首片落地五件 —— staleness（pre-push 门 + `upstream-status` report）/ regen 清单（generator-inputs manifest）/ meta-gate（gate-coverage）/ **三道**完整性门（加「upstream 内容采纳检查」）/ impact report；cadence = 每周 + 150 commits / 14 天 / seam>0 任一硬触发。
- [UM16 build green on synced base](tickets/phase-upstream-merge/UM16-build-green-on-synced-base.md): `build:official` 绿；原记的 325 个 apiproxy-removal error 已被 Phase-2 消化。
- [UM17 监控真机验证](tickets/phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md): 监控从「报告」升级为**退出码门禁**（`upstream-monitor.ts` exit 0–4，`indeterminate` 永不算成功）+ 每日 cron；成功与失败路径均经真机 run 演练。
- [UM18 0d1f50007f 同步后的残余红门](tickets/phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md): 上游合并部分已无残余（behind 0 / owed 0 / consistent），唯一残余项 coverage 剥离为 [COV1](tickets/phase-coverage/COV1-per-file-coverage-100-track.md) 独立轨道 —— 这是**专项边界**判定，不是 map 级 out-of-scope。⚠ `UM18` **是复用过的编号**：2026-09-15 那次「UM18 → 归位为 B-DA7」指的是另一张更早的票，引用必须带文件名。
- [UM-ADAPT per-shift adaptive 分析](tickets/phase-upstream-merge/UM-ADAPT-per-shift-adaptive-analysis.md): 8 条移位逐条销账 —— 1 已 land（admin lazy-webServer carrier）/ 5 already-aligned 零缺口 / 1 out-of-scope（workspace-files，见 Out of scope）/ 2 归他票。
- [admin lazy-webServer](tickets/phase-upstream-merge/UM-ADAPT-per-shift-adaptive-analysis.md): `packages/data/admin` 从 eager webServer inject 改为嵌套 `ctx.inject(['webServer'],…)` carrier，disposal 绑 carrier fiber —— admin 是 da 唯一 eager-webServer 插件。
- [UM-ARCH 架构图/依赖图 regen](tickets/phase-upstream-merge/UM-ARCH-architecture-diagrams-depmap.md): 从 synced base regen `docs/architecture-graph.md`，workspace-files 作权威来源。
- [UM-CORDIS-REGEN](tickets/phase-upstream-merge/UM-CORDIS-REGEN.md): typert surface 修（`ResultEntry.rows` → `JsonValue[][]`）+ `gen-cordis-api` regen；子任务 3 经四重验证已被 UM10 与 Phase-2 顺带做掉。
- [UM-CLIENT-CONFIG-CLEANUP](tickets/phase-upstream-merge/UM-CLIENT-CONFIG-CLEANUP.md): client tsc surface config 收口 —— 给 `api/remotes/tsconfig.client.json` 补 composite references。
- [UM-CONNECTION-FIXTURE-DEAD-APICLIENT](tickets/phase-upstream-merge/UM-CONNECTION-FIXTURE-DEAD-APICLIENT.md): 删死 `FixtureApiClient` 子类，fixture 适配 Typert Remote。
- [UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS](tickets/phase-upstream-merge/UM-APIPROXY-REMOVAL-CLIENT-TYPE-ANALYSIS.md): `build:lib:client` 325 error 是 apiproxy 删包 fallout，按 surface / 真改造分层归因。
- [UM-DATA-SRC-DTS-POLLUTION](tickets/phase-upstream-merge/UM-DATA-SRC-DTS-POLLUTION.md): 首要嫌疑（37 个 tsconfig）**被证伪** —— 产出者是单次手发的裸 `tsc`（取证：`.d.ts.map` 的 `sources` 字段 + 共享 mtime + emit 集合是模块图闭包）；取**全面清理** + **移除 `.gitignore` 整块**（故意不为新位置加 ignore，`git status` 必须保持吵闹）。
- [UM-TSCONFIG-PATHS-POLICY](tickets/phase-upstream-merge/UM-TSCONFIG-PATHS-POLICY.md): 采纳 upstream 显式 alias（非通配）—— `gen-tsconfig-paths` 会把 `tsconfig.base.json` 写成无效 JSON，因 fork 通配块在生成区之后且生成器不写尾逗号。
- [UM-GEN-DOC-TRANSLATION-OBLIGATION](tickets/phase-upstream-merge/UM-GEN-DOC-TRANSLATION-OBLIGATION.md): 生成器须带 zh —— `gen-doc-graphs` 改按 region-splice 注入 `.zh.md`，否则任何 regen 都会打破 translation pairing。
- [UM-LINT-A oxlint 根因](tickets/phase-upstream-merge/UM-LINT-A-OXLINT-RESOLUTION.md): 92 条假阳性的根因是 tsgolint 不实现 project-reference 输出重定向，把 host+client 两侧 Cordis `Context` augmentation 合并进同一 program。
- [UM-LINT-TYPEAWARE-CORDIS](tickets/phase-upstream-merge/UM-LINT-TYPEAWARE-CORDIS-false-positives.md): 决策 = (A) 先诊断 + 预先约定兜底 (C)；92 条里 83 条是 oxlint typeAware 把 inject 的 `ctx` 解成 `error` 类型。
- [UM-LINT-B unmatched programs](tickets/phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md): 55 unmatched = 34 WAIVE + 15 KEEP + 6 pending；glob 为 root-anchored 经 `export var` 探针实证，recon 草案的 `globToRegex` 有真 bug（brace expansion 前转义 → 每个 glob 都编译成匹配不到任何东西的正则）。
- [UM-LINT-B eval-cli tsconfig tests](tickets/phase-upstream-merge/UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS.md): 取 sub-option b —— sibling `tsconfig.tests.json`（composite declaration-only emit）。
- [UM-MERGE-INTEGRITY 双向有损](tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md): 两方向均已穷举；**最大发现不在原框内** —— M1 把整个 `ui-settings-models` 包回退到 merge-base（~30 文件，`--cc` 结构上看不见、`tsc` 全绿）→ 需第三道完整性门。umbrella waiver 取 `keep`（drop 会暴露 27 文件的 per-child 发现）。
- [UM-UI-SETTINGS-MODELS-RE-PORT](tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md): 整包 re-port（43 文件分类 → 21 三方合并 + 5 adopt-upstream + 2 restore），中心轴 = `ctx` → `operations` façade；slot-catalog 跨包项判 MOOT（generated artifact）。
- [UM-QODER-SUBAGENT-RETIRE](tickets/phase-upstream-merge/UM-QODER-SUBAGENT-RETIRE.md): §A costs 半边完成（退 Qoder-as-subagent + 删 `SubagentCosts`/`SubagentResult.costs`，type-equiv 3→2 DRIFT）；§B scopeId 半边前提证伪 → 拆票。
- [UM-SCOPEID-RETIRE-REGRILL](tickets/phase-upstream-merge/UM-SCOPEID-RETIRE-REGRILL.md): 「write-never 死字段」**被证伪**（9 live reader 跨 5 包 + fail-closed dep）→ 取 keep-with-waiver：doc type-equiv block 记 fork-additive `scopeId?`，DRIFT 2→0。
- [UM-INVARIANT-COMPANION-CLEANUP](tickets/phase-upstream-merge/UM-INVARIANT-COMPANION-CLEANUP.md): 退 67 个空 invariant companion + 7 stale peerDep；关键是 **4-site apply 使包退出 gate owner 集**（`exports||src` 两皆假则三道 check 都不跑）→ `verify-package-invariants` 74→0。⚠ 切勿批量 strip peerDep（103 包声明、只有 7 个违规）。
- [UM-C-GATES 无主 C 类红门](tickets/phase-upstream-merge/UM-C-GATES-UPSTREAM-NEW.md): 5 门 hybrid 裁决 —— 2 FIX + wire CI / 2 架构 pattern 处置 / 1 permanent KNOWN-RED（`verify-client-ui-i18n`：内网中文用户无 i18n 用户）；`verify-package-dependencies` 65→0（fork 短期不发布 → peer 收敛到 upstream，FIX 优于 WAIVE）。
- [UM-FORK-README-SKELETON-RETROFIT](tickets/phase-upstream-merge/UM-FORK-README-SKELETON-RETROFIT.md): 67 个 fork 包缺 upstream doc-standard skeleton → 取工具化 retrofit（`gen-package-readme-skeleton.ts`），doc-standard 2/12→12/12。
- [UM-FORK-README-GENERATOR-RESIDUALS](tickets/phase-upstream-merge/UM-FORK-README-GENERATOR-RESIDUALS.md): 承接两个结转缺陷 —— `verify-package-readme-model-experience` 在 master 上转红（无人承接的 orphan-gate 模式）+ generator 的 anchor threading bug（会在围栏代码块内吐 anchor，当前只因 `planRetrofits` 跳过已 retrofit 文件而 inert）。
- [UM-DEFECT-PRESENT-TABLE-SPLIT](tickets/phase-upstream-merge/UM-DEFECT-PRESENT-TABLE-SPLIT.md): client bundle code-split 与 module table 不兼容 → tsdown 0.22 的 `outputOptions.codeSplitting: false`。
- [UM-DEFECT-PRESET-DEPS](tickets/phase-upstream-merge/UM-DEFECT-PRESET-DEPS.md): bundle/data-agent 漏声明 11 个 `tool-*` 依赖导致 preset mount 失败 → 补齐 live preset 的运行时依赖。
- [UM-DEFECT-PRESET-ROOTS](tickets/phase-upstream-merge/UM-DEFECT-PRESET-ROOTS.md): 无任何 bundle/profile 配 `agent-presets.roots` → 两个 preset 改由 data-agent bundle 发布，root 从已安装 bundle manifest 解析而非进程 cwd。
- [R-DA-TYPERT-REMOTE-REGISTRATION](tickets/phase-misc/R-DA-TYPERT-REMOTE-REGISTRATION.md): `TypertRemoteNamespaceMap` augmentation 在 full build 下 transitively loads，bounded 构建报的是假阳性。

### 跨 effort 移交（work 出本 map 的 destination，已交他域；此处只留指针）

- **results-RPC 落在已删的 apiproxy** → [interpretation-client-rendering 的 T8–T13 簇](../interpretation-client-rendering/map.md) 为被违反方，re-home 由 [UM4](tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md) 执行。
- **CI checkout / issue-policy**（#52 被 upstream 结构迁移 re-violate）→ [repo-infra T6](../repo-infra/tickets/T6-ci-checkout-issue-policy.md)，重评经 [UM2/UM10](tickets/phase-upstream-merge/UM10-verify-typecheck-lint-ci-gates.md)。
- **subagent tree 的 upstream 同步触发** → [task-orchestration-dag G10](../task-orchestration-dag/tickets/G10-subagent-tree-upstream-integration.md)。
- **CI workflow startup failure**（`ci.yml` 重复 `concurrency` 键 + `ci-master.yml` 折叠标量破损 ⇒ `check:ci:static` 在本 fork 的 CI 里**从未真正执行**）→ [repo-infra T14](../repo-infra/tickets/T14-ci-workflow-startup-failure.md)；由 [UM17](tickets/phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md) 收口时发现。
- **doc-typecheck 在 plan 草图上红**（继承红，非本轮引入）→ [repo-infra T15](../repo-infra/tickets/T15-doc-typecheck-plan-sketches.md)。
- **其余 pre-existing 红门**（duplication 89 clones / publint / coverage 两 suite）→ [repo-infra T16](../repo-infra/tickets/T16-duplication-gate-89-clones.md) / [T10](../repo-infra/tickets/T10-publint.md) / [T11](../repo-infra/tickets/T11-test-coverage-failing.md)，逐条核为非本轮引入。
- **A 类 4 条长期 pre-existing known-red** → [GA-FORK-CI-green](tickets/phase-misc/GA-FORK-CI-green.md) 与 [parallel-dev-cleanup](../parallel-dev-cleanup/map.md)，不在 upstream-merge 专项计。
- **master-sync 不是单方面的 git 操作** —— 2026-09-12 实测两侧各做了一遍 evaluation 的同一批工作（同 subject 不同 sha），盲取任一侧都会静默删除对方 effort 的票据内容；该 reconcile 需 evaluation 域知识，最终由 evaluation 侧的 reconcile merge 解决。「不碰 `wayfinder/evaluation/`」在此不只是纪律。见 [UM11](tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md)。
> **口径澄清**：以上是**专项/effort 边界**归位，**不是** map 级 out-of-scope —— 后者只放超出本 map 整个 destination、且永不毕业的工作（见 `## Out of scope`）。教训：把「票面自己都写明不属本域」的工作留在本域前沿并加一句免责声明，等于让专项永远不收敛；wayfinder 的规则是**出界即关票 + 一行指针交接**。

## Not yet specified

<!-- 雾：in-scope 但还太糊无法 ticket；随 frontier 推进毕业。已成票的不留在此。 -->

- **ship-default-orchestration**（da 出厂默认取 A/B/C/D 哪个）与 **per-model 路由**（是否按模型分编排）—— 都 fed by [G1b](tickets/phase-misc/G1b-experiment-execution.md) 的真实执行数据；G1b 当前瓶颈在 LLM SQL 生成质量，ship 信号要等真执行基线稳定。per-model 另需「分歧 > 5pp」才触发毕业。
- **数据连接器扩展**（mysql / hologres / 未来后端）的接入时机与形态 —— `QueryEngine` seam 已留，时机未定；第二引擎到场才是 [M1d](tickets/phase-misc/M1d-time-filter-hint-multi-engine.md) 分层落地的触发点。
- **跨网 / 多 host 部署形态**（chisel overlay 到 edge、central backend KMS-Vault）—— 前期单 host + Mac 内网直达使 [P10](tickets/phase-2/P10-intranet-tunneling.md) 无隧道、[P12b](tickets/phase-2/P12b-credentials-keychain-hardening.md) macOS Keychain 够；central backend 自身凭证链同构 secret-to-protect 递归，真需求出现再 ticket。
- **cert-revocation / transport-secret lifecycle**（mTLS client-cert 立即吊销：Caddy native client_auth 不查 CRL/OCSP）—— 属 transport 层、与 keychain PAT 正交；短命 + rotation 前期够，立即吊销需 CRL 或 custom verifier。
- **per-user 登录硬化**（token 轮转 / expiry / CSRF / 限流 / 审计）—— net-new auth 子系统，待真实 per-user provisioning 上线后才问得出精确问题。
- **是否需审 Qoder internal tool/reasoning stream**（而非仅终态 call outcome）—— [P8b](tickets/phase-2/P8b-audit-prod-hardening.md) 当前只审终态 outcome + Credits；若 forensic 合规要求全 stream，则需开一张标的 core-seam 的票。
- **intranet 重 embedder 的 serving 框架与模型选型**（Infinity / TEI / Ollama × bge-m3 / Qwen3-Embedding）—— 走用户自部署经 [P5](tickets/phase-2/P5-retrieval-vectorization.md) 外置 embedder 插件已定；剩余是部署 ops，不是 map 上的架构决策。
- **query-time subagent enrichment** 的权限、预算、写回与 evidence 规则 —— 尚不足以形成单一 ticket。
- **检测器 few-shot 的 in-sample 污染怎么测** —— [GA-EVAL-EVENTDEF-PREFETCH](tickets/phase-misc/GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) 的 FP=0 是部分 in-sample 的（few-shot 取自 eval set 原句）；失败模式是漏检而非静默错值所以不阻塞，但「怎么测泛化」依赖 out-of-sample 集合，在 [GA-EVAL-EXPAND](tickets/phase-misc/GA-EVAL-EXPAND-case-set-power.md) 落地前问不出精确问题。
- **eval 流水线的 per-question LLM 调用成本** —— 每问题多两次调用（capability triage + 事件检测）；目前没有预算目标也没有延迟目标，所以问不出可判定的问题；case set 扩到 168+ 时需先定「每次 re-baseline 的可接受墙钟/调用预算」。
- **P7b deferred polish 与 lock-in 测试** —— B10（`LlmCallConfig` vs `GenerateOptions` 的 adapterDefaults nuance）/ B11（`step_count` 增量但无 `max_steps` enforce）/ B13（`options.purpose` 需核 llm types）+ 若干 test gap；非阻塞，核心路径已 landed + verified。见 [P7b](tickets/phase-3/P7b-phase-gate-hardening.md) 的 Finding/Design DEFERRED 节。
- **`verify-package-paths` 扩成复发护栏** —— 让「`src/` 下出现与 `X.ts` 同名的 `X.d.ts`/`X.js`」直接致红；该启发式对 [UM-DATA-SRC-DTS-POLLUTION](tickets/phase-upstream-merge/UM-DATA-SRC-DTS-POLLUTION.md) 的全部 4 次发生命中、对全仓 tracked `.d.ts` 零误报。归 UM15 的 meta-gate 片。
- **`.oxlintrc.staged.json` 的 `ignorePatterns` 字面拷贝未同步** —— 只被 `lint:fix:contracts-ready` 用、不影响 `pnpm run lint`；同类漂移，值得 UM15 的 coverage manifest 收编。
- **哪些本地 gate 该接上 CI** —— [UM12](tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 实测本地红集 ⊋ CI 红集（多数 `verify-*` 在 GitHub 上无对应 job）；接不接、接哪些是 UM15 §2 gate-coverage meta-gate 的后续裁决点，当前问不出单一 ticket。

## Out of scope

<!-- 超出 destination；closed，不毕业 -->

- **data-agent 采纳 `workspace-files` 一等 `@Remote` seam 作 file-ops 通道**（2026-09-12，[UM-ADAPT](tickets/phase-upstream-merge/UM-ADAPT-per-shift-adaptive-analysis.md) shift 3 判定）—— 该 seam 是只读、workspace-root 内、面向 web client 的 RPC 通道，而 fork 的 fs 用点全是写且全在任何 workspace root 之外；采纳需先给上游包加写侧再放松 containment，即削弱该 seam 仅有的两条保证来服务 fork，违 additive-only。逐组另有硬理由（凭证不过 transport、audit 需 `O_EXCL`、语义层需 temp+rename 原子性、eval/query/identity 无远端消费者）。
- **恢复 P12c 的 runtime-exfil per-item ACL（native keychain binding + Apple Developer code-signing）**（2026-08-21 dropped as over-spec）—— 破开箱即用（tsx/node 脚本无二进制可签）、非 intranet-security-first 的硬边、威胁已被 [P12b](tickets/phase-2/P12b-credentials-keychain-hardening.md) landed 与 [P10](tickets/phase-2/P10-intranet-tunneling.md) 工具门禁覆盖，native binding 本身也违 additive-only。见 [P12c](tickets/phase-2/P12c-native-keychain-binding-code-signing.md)。
- **修 harness 对重复/拒绝路由的静默**（`ctx.llm.registerAdapter` 对重复路由静默让先注册者保留、不告警）—— 修复须改 dsh-llm registry core，违 additive-only；改名 `aga` 后已非阻塞，属 robustness 打磨。记此待未来 scope-redraw 或上游 dsh effort 取。见 [dashscope-default-llm-plugin](tickets/phase-misc/dashscope-default-llm-plugin.md)。
- **本仓文档的 mojibake 修复** —— 本 map 原有 7 处 U+FFFD，已随 [DA-MAP1](tickets/phase-misc/DA-MAP1-map-hygiene.md) 的重写清零（7 处全在被删或被压缩的章节内）。2026-10-05 实测：整个 `wayfinder/**/*.md` 现只剩 **1 处**，在 `prompts/next-session-2026-09-12-post-pr117-merge.md`（旧 map 记的 `research/experiment-audit-log.md` 已不含，该指针是过期的）。定位命令 `LC_ALL=C grep -n $'\xef\xbf\xbd' <file>`——**本条故意只写转义不写损坏字节本身**，否则 `grep -c` 这个计数信号会被记录本身污染；也别记行号，会随任何编辑漂移。属跨 map 的仓库卫生，归 [parallel-dev-cleanup](../parallel-dev-cleanup/map.md)；该失败模式已记在 [CLAUDE.md](../../CLAUDE.md)（`tsc`/lint/whitespace hook/`--stat` **全部不会报** mojibake，防线是 push 前 `git diff | grep "^-"` 逐条给出删除理由）。**不要猜着改**——多数位置无法反推原字符，需从 git 历史找损坏前的版本。
- **reverse-bi 的两个 evolution flywheel（Prompt Evolution + Golden-Case Corpus Evolution）、query-acceleration、9 个前端页面、prompts/format-templates/flows/context 版本化超结构** —— 成熟期 / UX 性质，可后期回挂，当前不迁（Q3 裁剪）。
- **重新实现 rbi-agent `core/` 的 ReAct loop / session / MCP-client / LLM** —— 退役并用 harness 等价物。
- **物理删除 code-agent 包** —— Q2 修正为 disable-only 以保升级路径；实际删除留作 (c) 纯产品仓库重构时。
- **用 Qoder 内置模型当主 LLM** —— 无干净路径（Qoder SDK 无模型 API），不做。
- **迁 rbi-web（FastAPI + React 9 页）** —— 由 harness apps + 新插件替代。
- **在本 map 内修仓库级 CI / lint / 覆盖率 / doc catalog / 测试隔离** —— 归 [repo-infra](../repo-infra/map.md)；**在本 map 内定义 Benchmark lifecycle / ground truth / holdout / cutover** —— 归 [evaluation](../evaluation/map.md)。
