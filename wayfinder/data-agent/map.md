# wayfinder:map — deepseek-harness-data-agent

> 本地 markdown tracker（wayfinder skill 默认；未显式提供 GitHub issue tracker）。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储——决策详情在其 ticket / 研究笔记。

## Destination

把 `deepseek-harness-da`（`deepseek-ai/deepseek-harness` 的 fork——插件化 agent harness on vendored Cordis）改造成 **deepseek-harness-data-agent**（一个 data agent；正式名待定）。以 `reverse-bi`（上游 `track2data`，AI 原生游戏取数平台）为能力源，**通过插件化、additive-only、逐步迁移**其核心数据能力（四阶段 pipeline + retrieval + query + guard + eval + 语义层）到 harness 上；筛除 code-agent 特性（disable-only 保上游升级路径）；新增生产需求（DashScope + Qoder LLM 接入、内网穿透 + per-game 访问隔离）。reverse-bi 为只读源、重新实现不改。

## Notes

- **域**：agent harness → data agent（NL→SQL/取数）改造；reverse-bi 为能力源。
- **每会话应查 skills**：`dsh-plugin-development`（插件开发模型）、`grilling` + `domain-modeling`（决策）、`research`（调研）、`prototype`（原型）。
- **常设原则**：
  - **additive-only**：da 改动只叠加（preset overlay + data 插件 + persona），不改/不删 core → 保上游升级路径（core 不动 = Q4）。(c) npm-消费纯产品仓库留作后续低风险选项。
  - **reverse-bi 只读源**：重新实现，不修改 reverse-bi。
  - **intranet-security-first**：内网穿透暴露面 = 安全加固设计；信任边界单一在 RBI 门；业务用户问题不得触达 bash 等禁止命令（工具门禁）。
  - **PAT auth**：Qoder 集成走 Qoder 自身账号 PAT（`QODER_PERSONAL_ACCESS_TOKEN`，经 `credentials` seam 存 `~/.dsh/.credentials.yaml` file 层、doc 0600、**不**进 process.env——intranet-security-first；P3 用 `ctx.credentials.resolve` + SDK `accessToken(value)`，非 `accessTokenFromEnv()`）。〔T1 resolved 2026-08-19〕
  - **语义层一等公民**：NL2SQL 成败在语义层（MDL/指标层/Text2DSL），作 data-agent 插件内一等公民。
- **研究笔记**（`research/`，11 篇）：reverse-bi purpose/capability/data-behaviors；harness plugin-model/package-removal/agent-loop；synthesis；access-isolation；vectorization；frontier-fork-precedent；qoder-sdk-ts；qoder-model-migration。

## Decisions so far

<!-- 一行一 closed 决策的 gist；详情在 research/ 笔记或后续 ticket -->

- **拓扑 (Q4)**：选择性 fork、additive-only——da 即 data agent（名待定），保留 git fork，da 只叠加不改 core；(c) npm-消费纯产品仓库留作后续低风险选项。〔research/frontier-fork-precedent.md〕
- **去除 (Q2 修正)**：disable-only——code-agent 在 data-agent preset 不挂载（不物理删，保升级路径）。
- **迁移范围 (Q3)**：核心能力集（四阶段 pipeline + retrieval + query + guard + eval）；裁 flywheels/accel/frontend/超结构；查数优先。
- **ODPS 解耦 (Q5)**：引擎可插拔（`QueryEngine` 协议 + 每引擎 `conventions.yaml`；MaxCompute 为首引擎）。
- **访问隔离**：方案 1（复用 RBI `scope_id` + 每作用域凭证，admin 作 harness app）+ 2 约束（门覆盖 `X-RBI-Scope`；不退休 override）+ intranet-security-first。〔research/access-isolation-options.md〕
- **rbi-agent core/ (②)**：退役基础设施（用 harness agent-loop/session/mcp-client/llm），保留 per-turn 隔离纪律（`ToolResultCache`/`TurnBudget`/`tool_health`）为插件；reverse-bi 只读源。
- **rbi-agent data_agent/ (③)**：移植为一份 preset（四阶段全部工具/persona/段 + 压缩，保目录稳定）+ phase-gate 插件（`guard` + `turn-stopping` + `post-execute` + `request` waterfall）；不自定义 agent-loop、不坍缩阶段。〔research/harness-agent-loop.md〕
- **per-phase 门控 (Q7)**：harness 无原生支持 → 必须加 phase-gate hook。〔research/harness-agent-loop.md〕
- **LLM 接入 (P0)**：`llm-dashscope`（DashScope 百炼 OpenAI 兼容，da 直接 LLM）+ `subagent-qoder`（Qoder 作 harness subagent 插件，`query()` 委派，`SDKMessage`→harness 流式适配保 tool/reasoning，PAT auth，`resolveModel`/BYOK 控制 Qoder 用哪个模型）；"用 Qoder 内置模型当主 LLM"无干净路径。〔research/qoder-sdk-ts.md, qoder-model-migration.md〕
- **rbi-mcp 轻量工具 (④)**：进程内置为 harness tool 插件（`defineTool`）。
- **rbi-mcp 查询引擎 (⑤a)**：混合——`ctx.query` seam + `tool-query` + Guard 进程内（da 掌控可插拔点），MaxCompute Provider 外置 sidecar（rbi-mcp），保 ADR-0028 D3、ODPS 可插拔。
- **rbi-mcp 检索/向量化 (⑤b)**：`ctx.embedder` + `ctx.retrieval` 进程内 seam；默认轻量进程内 backend（sqlite-vec/in-mem + 轻量 embedder）；重模型（bge-m3/Qwen3-Embedding、Qwen3-Reranker）作可选外置插件；hybrid 作 retriever 组合插件。〔research/vectorization-frontier.md〕
- **rbi-mcp loaders/语义层 (⑤c)**：语义层（埋点 + 表）进程内核心能力；ODPS schema 读取解耦到查询引擎（⑤a）。
- **rbi-mcp audit (⑤d)**：进程内——audit 作 guard/session-event + `tool-audit` + `ctx.storage`（SQLite）。
- **rbi-mcp admin (⑤e)**：进程内 harness app（管理 per-game scope/credential/access-link + 系统配置）。
- **goal/todo/plan (Q8)**：保留（不禁用），四阶段 Pipeline 作默认编排；后期实验对比 Pipeline vs goal/todo/plan（不同模型可能不同搭配）——对比作 ticket。
- **变换执行 (Q9)**：code-runtime 跑 pandas 变换 + bash 跑 shell；内网穿透暴露面加工具门禁（业务用户不得触达 bash）。
- **python/ (Q10)**：前期保留（additive），按 Python 消费者需求后 disable-only 裁。
- **tracker**：本地 markdown（`.agents/wayfinder/`）。
- **MaxCompute 凭证缓存 (R2 research, resolved)**：目标态正经接 tier-0（`install_credential_resolver` 已接线 + `TestAcceptanceGate` 验证）；override 过渡保险不删（退休判据=生产验收绿；2026-08-05 五天停服红线）；不新建第二份 override-factory；query-maxcompute sidecar 设计（per-call `ctx.credentials.resolve` + `scope_id` 显式 + 凭证经 stdio env + sidecar 自有 per-scope缓存 + 监听 `credentials/updated`）。〔research/r2-maxcompute-cred-cache.md〕
- **多轮 eval hook (R3 research, resolved)**：harness 暴露 response hook 但响应正文在 session 事件流（非 agent 事件层）；主路径 Python JSON-RPC SDK `Session.run()` 包 `AgentResponder` 复用 rbi-eval；多轮同 Session 多次 run()；pass_k k 独立 session_id；确定性 `dsh-llm-replay`；agentic 判分用 `RunResult.events` tool/call+tool/result。〔research/r3-multiturn-eval-hook.md〕
- **DashScope LLM seam (R1 research, resolved)**：`llm-dashscope` 可干净镜像 `llm-deepseek`——百炼 OpenAI 兼容端点 wire 与 DeepSeek 同构，流解析层（sse.ts/translate.ts）原样可复用，仅序列化+身份层改（`enable_thinking`/`thinking_budget`/`tool_stream`/baseURL/env `DASHSCOPE_API_KEY`/provider dashscope/catalog qwen）。〔research/r1-dashscope-seam.md〕
- **query-engine trio (P4 prototype, resolved)**：A1-split——`ctx.query.execute` owns engine-wrapper 门（cost/timeout/retry/orphan，镜像 `pipeline.py:run_query_async`+`core/guards/*`），会话门（G1/G5/budget/near-dup/halt/cache）留 `tool-query`（镜像 `execution.py`），sidecar dumb raw executor+per-scope 缓存；C1 tool-query 吃 SQL（NL→SQL 归 P6）；B seam=`execute/attach/cancel/get_progress`+3-state、`estimate_cost` CostGuard 内部、不暴露 `getEngine`；D `packages/query/{query,query-maxcompute,query-tool}`；E `credentials/updated→invalidate_scope`（reconnect 兜底）；F2 sidecar 经 mcp-client（spawn-env 注入）；prototype surface 一条 tension（spawn-env cred 热更与 invalidate 不相容，待定）。〔research/p4-guard-chain-placement.md, p4-build-defaults.md, prototypes/p4-query-engine/〕
  - ⚠️ **R1 结论已被 P2 live 探针证伪（2026-08-19）**：实为 native AGA 原生协议（非 OpenAI 兼容镜像），sse/translate **不可**复用（无 `[DONE]`、incremental_output delta、payload `output.choices[].message`），无 thinking_budget/tool_stream/include_usage，requestId 在错误体非头。正源〔research/p2-dashscope-wire.md〕。
- **T1 Qoder PAT (task, resolved 2026-08-19)**：Qoder PAT 存 `~/.dsh/.credentials.yaml` 为 `QODER_PERSONAL_ACCESS_TOKEN`（seam file 层、doc 0600；**不**入 `.env`/process.env——intranet-security-first，PAT 不被 bash 等工具子进程继承）。P3 须 `ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))` 每操作解析 + Qoder SDK `accessToken(value)` 传值（**不**用 `accessTokenFromEnv()`）；前提账号有 Credits。〔tickets/phase-1/T1-qoder-pat.md〕
- **dsh-data-agent 脚手架 (P1 resolved)**：patch-only bundle 叠 base——disable code-agent 面（tool-str-replace-editor/ralph + `tools.mode:native`）；data 插件行注释 TODO（P4-P11 填）；persona 留 P7；bash/code-runtime 保留（Q9，gating 归 P10）；新建 packages/data group 壳（tsconfig.base wildcard + host ref）；不碰 app-boot/core，out-of-tree `dsh plugin` 建可运行 profile。〔tickets/phase-0/P1-data-agent-scaffold.md, packages/bundle/data-agent/〕
- **G3 per-user Qoder PAT provisioning (grilling, resolved 2026-08-19)**：业务用户自带 per-user Qoder PAT（per-individual-user，非 per-scope）。存 credentials seam 的 deferred keychain/KMS provider（agent at-rest 不可读、自助填、跨浏览器）；Qoder 侧强制权限+Credits；身份=web UI per-user 登录（复用 RBI `Tenant`）+P10 mTLS；fallback 分期（早期 T1 全局个人 PAT、稳定 per-user 必填）；P3 caller-parameterized `resolve(ref,{userId})`+fallback 层为留接口；per-user Qoder 用量进 P8 审计。per-user 存储基建=P12（keychain provider+per-user 寻址，per-user 维度与 R2 per-scope 正交）。〔tickets/phase-1/G3-per-user-qoder-pat.md〕

## Not yet specified

<!-- 雾：in-scope 但还太糊无法 ticket；随 frontier 推进毕业 -->

- 凭证热更机制（P4 prototype surface，sharp，待 ticket）：F2 spawn-env 下 cred 变更如何不重启 sidecar 即生效——`invalidate_scope` 单用留陈旧 spawn-env 凭据；须 (a) reconnect-for-cred-change（丢所有 scope，与 E surgical 冲突）或 (b) per-call `set_credentials` sidecar 通道（偏离 R2 §5.2c `StdioConfig.env`）；`invalidate_scope` 或仅适用非-cred 配置变更。生产硬化 `packages/query/*` 前须定。
- 语义层设计细节（埋点/表两类建模、MDL/指标层/Text2DSL 选型、与 rbi-semantic 映射）。
- eval 迁移细节（3 级评分/5 match mode/`EvalCase` v3 迁为 TS `packages/eval/` vs 保留 Python；多轮 eval `AgentResponder` hook）。
- 内网穿透技术选型（frp/chisel/...）+ 安全加固设计（TLS 终止、mTLS、token 轮换/吊销、信任边界）。
- Qoder subagent 流式适配边界（runtime narrow 松散类型、过滤非模型消息、`WIRE_PROTOCOL_VERSION` 错配处理、BYOK 策略）。
- 数据连接器扩展（mysql/hologres/未来后端）接入时机与形态（`QueryEngine` seam 已留，时机未定）。
- 报告/Excel 二进制产物交付机制（code-runtime pandas 生成 + `ctx.attachments` 复用 vs 专用 deliverable/export 工具；文本报告走 tool-fs write，二进制不走 str-replace-editor/tool-fs——两者仅 UTF-8）。
- per-user 登录（复用 `Tenant`）+ 端点→user→scope 绑定实现细节（P9 颁发表形态、与 `allowed_scope_ids` 关系）。

## Out of scope

<!-- 超出 destination；closed，不毕业 -->

- reverse-bi 两个 evolution flywheel（Prompt Evolution + Golden-Case Corpus Evolution）、query-acceleration、9 前端页面、prompts/format-templates/flows/context 版本化超结构——成熟期/UX，可后期回挂，当前不迁（Q3 裁剪）。
- rbi-agent core/ 的 ReAct loop/session/MCP-client/LLM——退役用 harness 等价物，不重新实现。
- 物理删除 code-agent 包——Q2 修正为 disable-only 不删（保升级路径）；实际"删除"留作 (c) 纯产品仓库重构时。
- "用 Qoder 内置模型当主 LLM"——无干净路径（Qoder SDK 无模型 API），不做。
- rbi-web（FastAPI+React 9 页）——不迁，harness apps + 新插件替代。
