<!-- 英文源文件由 scripts/gen-tool-catalog.ts 生成；本中文文件是通过双语配对维护的经评审对侧。
     更新时先运行 `pnpm run gen-tool-catalog` 更新英文，再更新本文件并运行 `pnpm run verify-translation-pairing --write docs/tool-catalog.md` 重新记录配对。 -->

# 工具 Schema 目录

[English](tool-catalog.md) | 中文

已发布插件向 `ctx.tools` 提供的所有面向模型的工具：模型通过系统提示词组装获得的 `name`、`description` 和 JSON Schema `parameters`。本目录是[子系统页面](subsystems/core.md)（类型及每页生成的 `cordis-surface` 接线区域）的补充；本页列出的是向 agent（智能体）提供的*工具*。

英文源文件由系统**生成**，并通过 `pnpm run verify-tool-catalog`（`doc-sync`（文档同步门禁）的一部分）验证新鲜度；本中文文件作为经评审对侧通过双语配对维护。与 Cordis 目录（纯源码 AST 处理）不同，英文生成器会在真实上下文中**启动**每个工具插件并读取 `ctx.tools.schemas()`，因为工具 schema 无法通过静态分析完全确定，例如运行时展开的枚举、拼接的描述、由配置决定的名称以及使用原始 JSON Schema 的 MCP 工具。完整性守卫会 glob 匹配 `packages/*/tool-*`；如果生成器的启动 manifest（元数据清单）遗漏任何包，检查就会失败，因此新工具不会在无人察觉的情况下缺少文档。参见[工具 schema 目录 Agent Note](../.agents/notes/implemented/process/2026-07-02-tool-schema-catalog.md)。

范围：`packages/*/tool-*` 下已发布的产品工具，每个工具均使用其**默认**配置启动；但如果某个 Config 字段是**必填项**且没有默认值，生成器就必须作出选择，对应包的说明会记录本页展示的是哪个分支。注册的工具**名称**可以是加载时配置，例如 `tool-subagent` 的 `toolName`，因此部署可能以不同名称或额外名称提供某个包；如果存在随产品发布的别名，对应包的说明会予以记录。`examples/` 中的演示工具（例如 `echo`）不在范围内，这与 Cordis 目录仅涵盖包的范围一致。

## 工具包映射

下表将模型可见的工具名称与其背后的插件包和服务 seam 对应起来。各包章节随后给出确切的 JSON Schema。

| 工具包 | 模型可见名称 | 依赖 | 写入／影响 | 随产品发布的别名 | 部署说明 |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | `ctx.tools`、`ctx.userQuestions` | `tool/call`、`tool/result after a UI/provider answers the question` | - | ask_user_question 会暂停工具调用，直到当前 UI 提供方返回人类答案。 |
| `@deepseek-ai/dsh-tools` | `run_code` | `ctx.tools`、`ctx.codeRuntime (execution time)`、`ctx.systemPrompt` | `tool/call`、`one tool/code-dispatch-start + tool/code-dispatch pair per bridged sub-call`、`tool/result` | - | 在 `mode: code`／`mode: both` 下，它由工具注册表所有，作为可过滤能力层之外的保留传输机制（参见 Code Mode Agent Note）。在 `code` 下，它是注册表对协议格式（wire format）的唯一贡献；其他可见能力在使用已加载运行时语言生成的 SDK 章节中声明。程序通过 binding 调用这些能力，调用按照原生并发约定调度：启动顺序和策略遵循提交顺序，并发安全的函数体最多重叠执行 `maxParallelSubCalls` 个。调用会重新进入完整且受守卫保护的工具流水线，并将每个嵌套执行关联到此外层结果。 |
| `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` | `ctx.tools`、`ctx.systemPrompt`、`ctx.userQuestions (execution time, opportunistic)` | `tool/call`、`plan/mode inactive on an approved review`、`tool/result` | - | 规划未激活时，exit_plan_mode 仍保留在面向模型的 schema 中，这样状态转换不会在规划策略变更之外额外造成工具目录变动。其执行路径会拒绝规划模式之外的调用；在规划模式下，它通过用户交互 seam 提交计划（批准／根据反馈继续规划），批准后会在步骤边界记录规划模式已停用。 |
| `@deepseek-ai/dsh-tool-bash` | `bash` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | bash 工具是 bash 执行器 seam 面向模型的消费方。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具（来自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；禁用 `enableRunInBackground` 配置（默认为 true）后，该参数会被完全移除。 |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | pwsh 工具是 Windows 组合中 bash 执行器 seam 的 PowerShell 方言消费方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 执行器为 `ctx.shell` 提供后端）；除沙箱接口外，它逐项对应 bash 工具调用。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具收集／停止；托管的 `DSH_*` 环境来自 `@deepseek-ai/dsh-shell-env`。每次调用都在新进程中运行，不使用持久 PTY 会话。路径采用原生 `C:\...` 形式，变量采用 `$env:NAME`。 |
| `@deepseek-ai/dsh-tool-cordis` | `cordis_define`、`cordis_inspect_list`、`cordis_inspect_query`、`cordis_inspect_self`、`cordis_run`、`cordis_stop`、`cordis_undefine` | `ctx.tools`、`ctx.dynamicCordisRunner` | `tool/call`、`tool/result`、`process-local dynamic package lifecycle` | - | 不在任何随产品发布的树中，需要显式选择启用；动态 Package 代码可以访问真实运行时，见 .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md。该工具集注入 `@deepseek-ai/dsh-cordis-host-runner` 提供的 `ctx.dynamicCordisRunner`，后者拥有定义注册表和 vm 沙箱；组合缺少它时这些工具不会激活。运行中的 Package 在停止、undefine 或 DSH 重启前可以注册**额外的**模型可见工具；发生这类工具集变化时，系统会记录完整且有变动的请求头。 |
| `@deepseek-ai/dsh-tool-bash-persistent` | `bash` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一个按所有者隔离的持久 bash 工具；部署组合提供 PTY 后端，并可覆盖面向模型的环境描述。 |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | `pwsh` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一个按所有者隔离的持久 pwsh 工具，持久 bash 工具的 Windows 对应物；部署组合提供 pwsh 方言的 PTY 后端，并可覆盖面向模型的环境描述。 |
| `@deepseek-ai/dsh-tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`、`ctx.fs` | `tool/call`、`fs/observed after view presence/absence, edit absence, or successful mutation`、`tool/result` | - | 基于文件系统 seam 的独立查看／创建／唯一字面量替换／按行插入工具；可与任何 shell 或终端接口组合。 |
| `@deepseek-ai/dsh-tool-fs` | `edit`、`read`、`read_image`、`write` | `ctx.tools`、`ctx.fs`、`ctx.systemPrompt`、`ctx.attachments (read_image registration)`、`ctx.llm + an image-capable route (read_image execution)` | `tool/call`、`fs/write-intent or fs/edit-intent for mutations`、`fs/observed after read presence/absence or successful file operation`、`durable attachment (read_image)`、`tool/result` | - | 先读后写／编辑策略由 `@deepseek-ai/dsh-fs-observation-policy` 添加；它是一个 `fs/*` 事件门禁插件，不会改变 schema。加载这些工具的部署按预期也应加载该插件。没有 `ctx.attachments` 时 `read_image` 不会注册；其 schema 与路由无关，执行时除非确切路由的模型声明图像输入，否则拒绝。 |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`、`grep` | `ctx.tools`、`ctx.subprocess`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | glob 和 grep 是无条件可用的发现工具，通过 ctx.subprocess spawn 随包提供的 ripgrep 二进制文件（`@vscode/ripgrep`），并作为普通前台调用运行，绝不作为后台任务；无需在宿主机安装 `rg`，也不经过 shell 层。本目录使用 `sampleOverCapGlobResults: true`；部署必须显式选择该行为。结果超过上限时，会通过可选的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公开本地路径，返回的定位信息可供后续读取／搜索。 |
| `@deepseek-ai/dsh-tool-terminal` | `terminal_close`、`terminal_list`、`terminal_open`、`terminal_read`、`terminal_send`、`terminal_signal` | `ctx.tools`、`ctx.terminals`、`ctx.systemPrompt`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | 这 6 个终端工具需要选择启用，用于补充一次性 bash／文件系统工具。`terminal_send(run_in_background: true)` 会注册到 `ctx.jobs`；schema 不包含 TUI、具名按键序列、BEL、调整尺寸、自动启动和跨 agent 共享。 |
| `@deepseek-ai/dsh-tool-goal` | `create_goal`、`get_goal`、`update_goal` | `ctx.tools`、`ctx.agents`、`ctx.goals`、`ctx.systemPrompt`、`a calling Agent in an authorized open turn` | `tool/call`、`goal/change for mutations`、`tool/result` | - | create、edit、pause 和 resume 要求直接来自人类的根权限；complete 和 blocked 也接受确切的当前 Goal Round。blocked 的默认下限是 3 个获准的 Round。 |
| `@deepseek-ai/dsh-schedule` | `schedule_create`、`schedule_delete`、`schedule_list` | `ctx.tools`、`ctx.sessions`、Session 持久化、未来创建的 live 根 Agent | `tool/call`、`schedule/change create or delete`、`tool/result` | - | 仅在选择启用的 Schedule 插件加载后创建的 live 根 Agent scope 内注册。版本 1 接受 after_seconds、显式绝对 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理读取与变更必须通过共享的 Session 持久化 barrier。 |
| `@deepseek-ai/dsh-tool-lsp` | `lsp` | `ctx.tools`、`ctx.lsp`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | lsp 工具将提供方选择和语言服务器子进程置于 ctx.lsp 之后，因此其模型可见 schema 在更换提供方时保持稳定。运行时要求已注册提供方，例如 `@deepseek-ai/dsh-lsp-stdio`；如果没有提供方，查询会返回结构化 `LSP_UNAVAILABLE` 错误，而不会改变 schema。 |
| `@deepseek-ai/dsh-tool-ralph` | `ralph` | `ctx.tools`、`ctx.workflowEngine`、`ctx.subagents`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents every fresh round)` | `tool/call`、`tool/result`、`workflow and child session events during execution` | - | 固定的前台工作流会在每个 Round 启动一个全新的结构化子级；模型只能选择不可变目标和可选的 Round 上限。 |
| `@deepseek-ai/dsh-tool-skill` | `skill` | `ctx.tools`、`ctx.agents`、`ctx.skills` | `tool/call`、`tool/result`、`user/message replacement catalogs via agent.inject()` | - | - |
| `@deepseek-ai/dsh-tool-session-query` | `session_event_read`、`session_event_search`、`session_event_trace`、`session_search`、`session_trace` | `ctx.tools`、`ctx.systemPrompt`、`ctx.sessionQuery`、`a calling Agent for workspace authority` | `tool/call`、`tool/result` | - | 这 5 个只读工具会隐藏提供方游标，并根据不可变的调用 agent 会话为每个结果授权。该包需要选择启用；需要强制截止时间或限制行内输出的组合还会挂载通用超时或 spill 策略。 |
| `@deepseek-ai/dsh-tool-subagent` | `subagent` | `ctx.tools`、`ctx.subagents`、`ctx.systemPrompt` | `tool/call`、`tool/result`、`child session events through the chosen provider` | `subagent`、`subagent_fork` | 注册的工具名称取决于加载时 `toolName` 配置（默认为 `subagent`）；上述 schema 对应默认值。随产品发布的组合会为每个 subagent 后端加载一次该包，因此模型还会看到绑定到 fork 后端的 `subagent_fork`。每个实例的描述、`run_in_background` 参数与 system prompt 策略取决于它自己的 `backgroundMode` 和 `enableRunInBackground`，因此两个随附 schema 并不相同：`subagent` 为 `continuable`，省略参数时默认后台运行，并由 runtime 自动投递结束结果；`subagent_fork` 保持 `one-shot`，省略参数时默认前台运行。详见 `packages/bundle/base/cordis.patch.yml` 和 `examples/acp-agent/cordis.yml`。 |
| `@deepseek-ai/dsh-tool-subagent-control` | `interrupt_agent`、`list_agents`、`send_message` | `ctx.tools`、`ctx.subagents`、`ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`、`tool/result`、`child session events through ctx.subagents` | - | 这些是控制可继续后台 subagent 的全局命名工具：绑定提供方的 `tool-subagent` 实例注册不同的委派工具；本包注册一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通过单独加载的 `/list-agents` 插件提供，其目录行使用 sessionProjections 和实时 Agent 注册表。 |
| `@deepseek-ai/dsh-tool-subagent-report` | `report` | `ctx.subagents`、`ctx.systemPrompt`、`a live continuable in-process child Agent` | `tool/call`、`tool/result`、`a user-role message in the direct parent session` | - | 按可继续的进程内子级注册，而非全局注册，因此该 schema 仅在这种子级内部可见，并且不受其全局 `toolFilter` 影响。同一份贡献还会安装子级作用域的 `tool:report` 系统提示词 section，本目录不渲染该 section。面向父级的 `send_message` 工具单独安装。 |
| `@deepseek-ai/dsh-tool-jobs` | `job_kill`、`job_list`、`job_output` | `ctx.tools`、`ctx.jobs`、`ctx.systemPrompt` | `tool/call`、`tool/result`、`user/message via agent.inject() for background completion notices` | - | 与任务种类无关的后台任务控制器：后台 bash 命令、PTY 发送和 subagent 都通过相同的 3 个工具读取、列出和终止。加载该插件会挂接控制器，从而启用生产方的 `ctx.jobs.start()`。 |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `followup_task`、`interrupt_agent`、`list_agents`、`send_message`、`spawn_teammate`、`team_task_create`、`team_task_get`、`team_task_list`、`team_task_update`、`wait_agent` | `ctx.tools`、`ctx.systemPrompt`、`ctx.agentTeams`、`an exact live Team member Agent` | `tool/call`、`team/member`、`team/message/queued`、`team/message/delivered`、`team/task`、`tool/result` | - | 这 10 个工具限定于隐式 Team Lead 与持久 teammate 作用域。随产品发布的 dsh-base bundle 默认禁用该包；文档中的 Agent Teams profile patch 会启用它，并禁用旧 continuable child 的同名控制工具。 |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` | `ctx.tools`、`owning Agent session` | `tool/call`、`todo/write`、`tool/result` | - | todo_write 是会话所有的状态；UI 将最新的 todo/write 事件渲染为检查清单。`allowParallelInProgress` 是没有默认值的必填项，因此本目录明确选择 `true`，对应描述允许同时存在多个 `in_progress` 项。选择 `false` 的部署会获得同一工具，但描述会要求只能有 1 个活动任务。 |
| `@deepseek-ai/dsh-tool-workflow` | `workflow` | `ctx.tools`、`ctx.workflowEngine`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents the script children)` | `tool/call`、`tool/result` | - | - |
| `@deepseek-ai/dsh-tool-web` | `web_fetch`、`web_search` | `ctx.tools`、`ctx.web`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | web_search 和 web_fetch 将提供方选择置于 ctx.web 之后，使模型可见 schema 在更换后端时保持稳定。 |
| `@deepseek-ai/dsh-tool-search-data-sources` | `search_data_sources` | `ctx.tools` | `tool/call`、`tool/result ranked data-source candidates` | - | search_data_sources 是 UNDERSTANDING 阶段 BM25 schema-linking 的入口：agent 调用它了解哪些数据源（DWS 表 / event ODS 表）匹配自然语言问题，然后再写 SQL。Q1 thin default 使用本地 Bm25Linker 对空语料库操作（可调用但未连线，直到 ctx.schema 发布）——空语料库返回无候选。P5b 在注册时切换到 ctx.retrieval，P6b 从 ctx.schema.discover 获取语料库；两种情况下 tool 契约不变。 |
| `@deepseek-ai/dsh-tool-critique-sql` | `critique_sql_tool` | `ctx.tools` | `tool/call`, `tool/result` | - | critique_sql_tool 是 GENERATION 阶段的 SQL 评审器(folded-regex:表 grounding、ds 分区、SELECT *、JSON-path 字段)。它通过 ctx.get 惰性探查 ctx.criticCtx 和 ctx.schema(schema 收集无需 provider 挂载);空的 critic 上下文 fail-open,使工具在未挂载 phase-gate 或语义层时仍能注册其 schema。 |
| `@deepseek-ai/dsh-tool-discover-relations` | `discover_relations` | `ctx.tools` | `tool/call`, `DWS table dimension_refs enrichment`, `tool/result` | - | discover_relations 是 ENRICHMENT 阶段的 AI-native DWS→DIM join 发现入口。它委托 ctx.schema.discoverRelations,经 ctx.get 惰性探查;schema 收集无需 schema provider(在 ctx.schema 发布前可调用但未接线)。 |
| `@deepseek-ai/dsh-tool-edit-definition` | `edit_definition` | `ctx.tools`, `ctx.schema`, `ctx.audit` | `tool/call`, `semantic-layer definition patch (Tier-2 audited)`, `tool/result` | - | edit_definition 对表或事件定义应用部分 patch(shallow-merge;列按 name 合并)并记录一次 Tier-2 audit 写,将该资产标记为 unreviewed。metric 是虚拟的,不能直接编辑。schema 收集挂载 inert ctx.schema + ctx.audit provider 使 Tier-2 inject 可达。 |
| `@deepseek-ai/dsh-tool-evaluate-sql-quality` | `evaluate_sql_quality` | `ctx.tools` | `tool/call`, `tool/result` | - | evaluate_sql_quality 根据 folded-regex critic 发现对 SQL 候选打 0-100 分。它惰性探查 ctx.criticCtx;schema 收集无需 provider 挂载(空 critic 上下文 fail-open)。 |
| `@deepseek-ai/dsh-tool-get-coverage` | `get_coverage` | `ctx.tools` | `tool/call`, `tool/result` | - | get_coverage 报告语义层覆盖统计(按 kind 的资产、确认状态、按域计数)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。 |
| `@deepseek-ai/dsh-tool-get-definition` | `get_definition` | `ctx.tools` | `tool/call`, `tool/result` | - | get_definition 按 name 加载统一的数据资产定义(表、事件或 metric)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。 |
| `@deepseek-ai/dsh-tool-list-domains` | `list_domains` | `ctx.tools` | `tool/call`, `tool/result` | - | list_domains 枚举语义层各域及按 kind 的资产计数(表、事件、metric)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。 |
| `@deepseek-ai/dsh-tool-load-event-definition` | `load_event_definition` | `ctx.tools` | `tool/call`, `tool/result` | - | load_event_definition 加载已校验的事件定义(params_fields、metrics、disambiguation、外部 dimension 引用)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线(空 semanticRoot 返回 not-found,不崩溃)。 |
| `@deepseek-ai/dsh-tool-load-table-definition` | `load_table_definition` | `ctx.tools` | `tool/call`, `tool/result` | - | load_table_definition 加载已校验的表定义(列、分区、主键、metrics、dimension 引用)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线(空 semanticRoot 返回 not-found,不崩溃)。 |
| `@deepseek-ai/dsh-tool-present-clarification` | `present_clarification` | `ctx.tools` | `tool/call`, `awaiting_clarification (phase-gate HALT)`, `tool/result` | - | present_clarification 是纯展示工具,为 UI 记录一个澄清问题并依赖 phase-gate HALT 该 turn。除 ctx.tools 外无服务依赖;真正的 HALT 是 phase-gate 的事(非该工具)。 |
| `@deepseek-ai/dsh-tool-retrieve` | `retrieve` | `ctx.tools` | `tool/call`, `tool/result ranked data-source candidates` | - | retrieve 是按需检索 escape-hatch,用于预取的 UNDERSTANDING 上下文有明显缺口时。它惰性探查 ctx.retrieval 和 ctx.schema;Q1 thin default 是空语料 Bm25Linker(可调用但未接线)。以 additive + dormant 形式发布;preset 必须挂载它。 |
| `@deepseek-ai/dsh-tool-search-schema` | `search_schema` | `ctx.tools` | `tool/call`, `tool/result ranked asset matches` | - | search_schema 是对语义层的 BM25 检索,供管理 agent 使用(返回带 kind 和域元数据的资产匹配)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。 |
| `@deepseek-ai/dsh-tool-trigger-eval` | `trigger_eval` | `ctx.tools` | `tool/call`, `eval run + persisted results`, `tool/result` | - | trigger_eval 触发一次语义层 eval run 并报告 before/after delta。它惰性探查 ctx.evalRunner 和 ctx.evidenceQuery;未挂载 runner 时报告 not_configured(host 组合须接线协作者)。 |
| `@deepseek-ai/dsh-tool-update-table-config` | `update_table_config` | `ctx.tools`, `ctx.schema`, `ctx.audit`, `ctx.identity` | `tool/call`, `table YAML project override (Tier-2 audited)`, `tool/result` | - | update_table_config 向表定义写一个按表的 ODPS project override(self-evolution #3b),使未来 qualifyTable 重试能解析 <project>.<table>。仅 admin(RBAC stub 读 ctx.identity)。经 ctx.audit 做 Tier-2 audit。schema 收集挂载 inert ctx.schema + ctx.audit + ctx.identity provider 使 Tier-2 inject 可达。 |
| `@deepseek-ai/dsh-tool-compute` | `compute` | `ctx.tools`, `ctx.codeRuntime`, `ctx.resultCache` | `tool/call`, `cr_ derived result via ctx.resultCache`, `tool/result` | - | compute 对一个源 result_id 跑代码绑定,经 ctx.resultCache 把派生结果存到 cr_ 前缀下。schema 收集挂载 inert codeRuntime + resultCache provider 使 inject 可达;工具仅在 execute 时读取它们。 |
| `@deepseek-ai/dsh-tool-discover-alt-labels` | `discover_alt_labels` | `ctx.tools` | `tool/call`, `tool/result alt-label candidates` | - | discover_alt_labels 镜像 discover_relations:它为表/列呈现替代标签(alias)以扩大召回。它惰性探查 ctx.schema;schema 收集无需 schema provider(在 ctx.schema 发布前可调用但未接线)。 |
| `@deepseek-ai/dsh-tool-present-decomposition` | `present_decomposition` | `ctx.tools` | `tool/call`, `tool/result decomposition cards` | - | present_decomposition 是纯展示工具,为 UI 渲染一个查询分解(breakdown)。除 ctx.tools 外无服务依赖。 |
| `@deepseek-ai/dsh-tool-present-table` | `present_table` | `ctx.tools` | `tool/call`, `tool/result rendered table/chart` | - | present_table 为 UI 渲染表或图表结果(line/bar)。除 ctx.tools 外无服务依赖;chart.type 在 tool-args 边界 fail-loud 校验。 |
| `@deepseek-ai/dsh-tool-reachability-delta` | `reachability_delta` | `ctx.tools` | `tool/call`, `tool/result reachability delta` | - | reachability_delta 报告两个资产之间的 join-reachability 差异。它惰性探查 ctx.schema;schema 收集无需 schema provider。 |
| `@deepseek-ai/dsh-tool-resolve-term` | `resolve_term` | `ctx.tools` | `tool/call`, `tool/result resolved asset` | - | resolve_term 把自然语言术语映射到数据资产(表/事件/metric)。它惰性探查 ctx.schema;schema 收集无需 schema provider。 |
| `@deepseek-ai/dsh-tool-revert-edit` | `revert_edit` | `ctx.tools`, `ctx.schema`, `ctx.audit` | `tool/call`, `Tier-2 audit revert event`, `tool/result` | - | revert_edit 回滚一次语义层编辑(concept/table/event)并经 ctx.audit 记录回滚(Tier-2)。schema 收集挂载 inert schema + audit provider 使 inject 可达;execute 惰性读取它们。 |
| `@deepseek-ai/dsh-tool-scope-routing` | `list_scopes`, `switch_scope` | `ctx.tools`, `ctx.systemPrompt` | `tool/call`, `active-scope switch`, `tool/result` | - | scope_routing 是按 scope 的路由面:list_scopes + switch_scope + 一个 alias-hint system-prompt 贡献。systemPrompt 由收集 base 挂载;工具惰性读取 active scope。 |
| `@deepseek-ai/dsh-tool-suggest-followups` | `suggest_followups` | `ctx.tools` | `tool/call`, `tool/result follow-up chips` | - | suggest_followups 在结果后呈现后续问题 chip。除 ctx.tools 外无服务依赖。 |

<a id="deepseek-aidsh-tool-ask-user"></a>

## `@deepseek-ai/dsh-tool-ask-user`

### `ask_user_question`

继续操作前，如果需要确认、选择或缺失的信息，请向用户提出简明问题。发送一个或多个问题，每个问题都带一个稳定 id，该 id 会在答案中原样返回。

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

来源：[`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question 会暂停工具调用，直到当前 UI 提供方返回人类答案。

<a id="deepseek-aidsh-tools"></a>

## `@deepseek-ai/dsh-tools`

### `run_code`

针对可用工具执行 TypeScript 程序。接受两个必填参数：`code`，即异步函数的**函数体**（仅使用可擦除语法；支持顶层 `await` 和 `return`）；以及 `description`，简要说明该程序做什么。请根据系统提示词中的声明，以 `await tools.name(args)` 形式调用工具。只有打印或返回的内容属于程序输出，请谨慎筛选。含图片的子工具结果会在运行结束后附加。

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    }
  },
  "required": [
    "code",
    "description"
  ]
}
```

来源：[`packages/core/tools/src/code-mode.ts`](../packages/core/tools/src/code-mode.ts)

在 `mode: code`／`mode: both` 下，它由工具注册表所有，作为可过滤能力层之外的保留传输机制（参见 Code Mode Agent Note）。在 `code` 下，它是注册表对协议格式的唯一贡献；其他可见能力在使用已加载运行时语言生成的 SDK 章节中声明。程序通过 binding 调用这些能力，调用按照原生并发约定调度：启动顺序和策略遵循提交顺序，并发安全的函数体最多重叠执行 `maxParallelSubCalls` 个。调用会重新进入完整且受守卫保护的工具流水线，并将每个嵌套执行关联到此外层结果。

<a id="deepseek-aidsh-plan-mode"></a>

## `@deepseek-ai/dsh-plan-mode`

### `exit_plan_mode`

仅在规划模式下使用。提交计划供用户评审，并在获批后退出规划模式。发送**完整的** Markdown 计划，以一个为计划命名的 # 标题开头。用户可以批准（从你的下一步骤起执行计划），也可以要求继续规划；其反馈会通过工具结果返回，请修改后再次提交。

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

来源：[`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

规划未激活时，exit_plan_mode 仍保留在面向模型的 schema 中，这样状态转换不会在规划策略变更之外额外造成工具目录变动。其执行路径会拒绝规划模式之外的调用；在规划模式下，它通过用户交互 seam 提交计划（批准／根据反馈继续规划），批准后会在步骤边界记录规划模式已停用。

<a id="deepseek-aidsh-tool-bash"></a>

## `@deepseek-ai/dsh-tool-bash`

### `bash`

执行 bash 命令（`bash -c`）并返回 stdout/stderr。每次调用都在新 shell 中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$DSH_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"npm install\" → \"Install package dependencies\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

bash 工具是 bash 执行器 seam 面向模型的消费方。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具（来自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；禁用 `enableRunInBackground` 配置（默认为 true）后，该参数会被完全移除。

<a id="deepseek-aidsh-tool-pwsh"></a>

## `@deepseek-ai/dsh-tool-pwsh`

### `pwsh`

执行 PowerShell 命令（`pwsh -Command`）并返回 stdout/stderr。每次调用都在新的 pwsh 进程中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。路径采用 Windows 原生形式（`C:\...`）；使用 `$env:NAME` 读取环境变量。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$env:DSH_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。在 Windows 上，被强制终止的命令会以 `[exit code: 1]` 结算且不带信号标记，请将其视为中断，而不是命令失败。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

pwsh 工具是 Windows 组合中 bash 执行器 seam 的 PowerShell 方言消费方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 执行器为 `ctx.shell` 提供后端）；除沙箱接口外，它逐项对应 bash 工具调用。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具收集／停止；托管的 `DSH_*` 环境来自 `@deepseek-ai/dsh-shell-env`。每次调用都在新进程中运行，不使用持久 PTY 会话。路径采用原生 `C:\...` 形式，变量采用 `$env:NAME`。

<a id="deepseek-aidsh-tool-cordis"></a>

## `@deepseek-ai/dsh-tool-cordis`

### `cordis_define`

定义一个不可变的 Cordis Package。新建 Plugin 时使用 kind:"new"，只提供 3 至 6 位小写英文字母组成的语义前缀；Host 返回最终 pluginId 和 packageId。修改现有 Plugin 时使用 kind:"existing" 并传入精确 pluginId，以追加 Package 而不覆盖旧版本。code.host 与 code.client 至少提供一个；每个值都是返回 Cordis Plugin 的 plain JavaScript 函数体，不经过 TypeScript、JSX 或 import 转换。依赖 Service、Event、Builtin、Slot 或 token 前先查询 Inspect。Define 只校验参数和语法并记录源码，不申请审批、不执行 apply，也不改变 currentPackageId。成功后用返回的 ID 调用 cordis_run。

```json
{
  "type": "object",
  "properties": {
    "plugin": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "new"
            },
            "idPrefix": {
              "type": "string",
              "description": "Suggested semantic prefix of 3–6 lowercase English letters; the Host adds a unique numeric suffix."
            }
          },
          "required": [
            "kind",
            "idPrefix"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "existing"
            },
            "pluginId": {
              "type": "string",
              "description": "Exact ID of an existing Plugin; the new Package is appended to that instance."
            }
          },
          "required": [
            "kind",
            "pluginId"
          ]
        }
      ]
    },
    "name": {
      "type": "string",
      "description": "Short, readable Package name."
    },
    "purpose": {
      "type": "string",
      "description": "One-sentence, user-facing description of the Package purpose."
    },
    "code": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "host": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the Host-half Cordis Plugin."
        },
        "client": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the browser Client-half Cordis Plugin."
        }
      }
    }
  },
  "required": [
    "plugin",
    "name",
    "purpose",
    "code"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_list`

列出 Host 当前已知的全部 Cordis Inspect Provider，包括本地 Host Provider 和 Client 最近同步的 manifest。每项包含所属平台、用途、只读方法及输入／输出 schema。创建或修改 Package 前先调用本 Tool，再从结果中选择 cordis_inspect_query 的 provider 和 method。不要猜测名称，也不要把 Inspect method 当作 Plugin 代码可调用的业务 Service。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

执行 Inspect Provider 显式声明的只读查询。platform、provider 和 method 必须来自 cordis_inspect_list，input 必须符合该方法的 schema。在 cordis_define 前用本 Tool 读取精确 Service 方法、Event mode、Builtin 签名、Tool schema、主题 token，或实时 Slot 树及 props。Host 查询在本地执行；Client 查询等待首个有效页面响应，在页面回答或 Tool 被取消前保持 pending。本 Tool 不能调用业务 Service 方法或修改运行时。查询 Service.listService 和 Event.listEvents 时，先不传 input 浏览紧凑签名目录，再查询精确 service 或 event 获取结构化约定和引用类型。查询 Slots.listSubTree 时，先不传 root 浏览紧凑树，再查询精确 root 获取完整注册约定和 props。

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_self`

按逐层增加的详细程度检查当前 Session 拥有的动态 Cordis 对象。不传 ID 时只列 Plugin 摘要；只传 pluginId 时返回版本指针、最新 Run 和全部 Package 摘要；只有同时传 pluginId 与 packageId 才返回该不可变 Package 的 Host/Client 源码和运行诊断。packageId 不能单独传入。处理 @pluginId、修复异步失败或定义更新版本前，先查询精确 Package。本 Tool 只读，不执行代码，也不改变版本指针。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define or injected by @pluginId; omit it to list every current Plugin."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID owned by pluginId; when specified, source and diagnostics are returned."
    }
  }
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_run`

激活动态 Plugin 的一个精确 Package。首次激活、重启 currentPackageId 或回退使用 mode:"run"；已有 current 时，即使 Plugin 当前已停止，切换到其他 Package 也使用 mode:"update"。未授权的 Client Package 创建审批请求并返回 awaiting-approval；已授权的 Package 返回 starting，并在浏览器中异步继续。两种结果都不会在 Tool 内等待最终结局。currentPackageId 只在完整成功后改变；失败时保留旧 current 和目标 next。异步成功、拒绝或技术失败通过状态与 steering 报告。技术失败后，用 cordis_inspect_self 读取诊断，修正同一 Plugin 并自主重试。用户拒绝后不要再次申请审批。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID to activate under that Plugin."
    },
    "mode": {
      "type": "string",
      "description": "Use run for the first activation, restarting current, or rollback; use update to switch from current to a different Package.",
      "enum": [
        "run",
        "update"
      ]
    }
  },
  "required": [
    "pluginId",
    "packageId",
    "mode"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_stop`

停止动态 Plugin 的当前 Run，并取消尚未完成的审批或激活请求。保留 Plugin、全部不可变 Package、授权、currentPackageId 和 nextPackageId，以便之后直接运行或更新。停止已处于停止状态的 Plugin 会幂等成功。临时禁用副作用使用本 Tool；永久移除使用 cordis_undefine。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to stop."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_undefine`

永久移除当前 Session 拥有的动态 Plugin。如果它正在运行或等待审批，先停止并取消请求，再删除全部 Package、授权和版本指针。返回后，其 pluginId、packageIds、@ 引用和 Package 业务视图均失效；历史卡片只保留“Plugin 已移除”记录。需要保留版本以便重启或回退时不要调用本 Tool，应改用 cordis_stop。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to remove permanently."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

不在任何随产品发布的树中，需要显式选择启用；动态 Package 代码可以访问真实运行时，见 .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md。该工具集注入 `@deepseek-ai/dsh-cordis-host-runner` 提供的 `ctx.dynamicCordisRunner`，后者拥有定义注册表和 vm 沙箱；组合缺少它时这些工具不会激活。运行中的 Package 在停止、undefine 或 DSH 重启前可以注册**额外的**模型可见工具；发生这类工具集变化时，系统会记录完整且有变动的请求头。

<a id="deepseek-aidsh-tool-bash-persistent"></a>

## `@deepseek-ai/dsh-tool-bash-persistent`

### `bash`

在持久 bash shell 中运行命令。包括当前目录和已导出环境变量在内的状态会在此 agent 的多次调用之间保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

来源：[`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

一个按所有者隔离的持久 bash 工具；部署组合提供 PTY 后端，并可覆盖面向模型的环境描述。

<a id="deepseek-aidsh-tool-pwsh-persistent"></a>

## `@deepseek-ai/dsh-tool-pwsh-persistent`

### `pwsh`

在持久 PowerShell shell 中运行命令。包括当前目录和已导出环境变量在内的状态会在此 agent 的多次调用之间保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

来源：[`packages/shell/tool-pwsh-persistent/src/index.ts`](../packages/shell/tool-pwsh-persistent/src/index.ts)

一个按所有者隔离的持久 pwsh 工具，持久 bash 工具的 Windows 对应物；部署组合提供 pwsh 方言的 PTY 后端，并可覆盖面向模型的环境描述。

<a id="deepseek-aidsh-tool-str-replace-editor"></a>

## `@deepseek-ai/dsh-tool-str-replace-editor`

### `str_replace_editor`

用于查看、创建和编辑文件的自定义编辑工具：

* 状态会在命令调用以及与用户的讨论之间持久保留
* 如果 `path` 是文件，`view` 会显示应用 `cat -n` 后的结果。如果 `path` 是目录，`view` 会列出最多向下 2 层的非隐藏文件和目录
* 如果指定的 `create` 命令目标 `path` 已作为文件存在，则不能使用该命令
* 如果 `command` 产生较长输出，输出会被截断并标记为 `<response clipped>`

使用 `str_replace` 命令时请注意：

* `old_str` 参数应与原文件中一行或多行连续内容**完全**匹配。请留意空白字符！
* 如果 `old_str` 参数在文件中不唯一，则不会执行替换。请确保在 `old_str` 中包含足够的上下文，使其唯一
* `new_str` 参数应包含用于替换 `old_str` 的已编辑行

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "type": "string",
      "description": "Required parameter of `create` command, with the content of the file to be created."
    },
    "insert_line": {
      "type": "integer",
      "description": "Required parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`."
    },
    "new_str": {
      "type": "string",
      "description": "Optional parameter of `str_replace` command containing the new string (if not given, no string will be added). Required parameter of `insert` command containing the string to insert."
    },
    "old_str": {
      "type": "string",
      "description": "Required parameter of `str_replace` command containing the string in `path` to replace."
    },
    "view_range": {
      "type": "array",
      "description": "Optional parameter of `view` command when `path` points to a file. If none is given, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.",
      "items": {
        "type": "integer"
      }
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

来源：[`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

基于文件系统 seam 的独立查看／创建／唯一字面量替换／按行插入工具；可与任何 shell 或终端接口组合。

<a id="deepseek-aidsh-tool-fs"></a>

## `@deepseek-ai/dsh-tool-fs`

### `edit`

通过替换字面量文本来编辑现有 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace. Must match exactly."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

读取 UTF-8 文本文件，并返回带行号的内容。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

读取 PNG/JPEG/WebP/GIF 文件并返回图像本身。要求当前模型接受图像输入。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

创建或完全替换 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

先读后写／编辑策略由 `@deepseek-ai/dsh-fs-observation-policy` 添加；它是一个 `fs/*` 事件门禁插件，不会改变 schema。加载这些工具的部署按预期也应加载该插件。没有 `ctx.attachments` 时 `read_image` 不会注册；其 schema 与路由无关，执行时除非确切路由的模型声明图像输入，否则拒绝。

<a id="deepseek-aidsh-tool-fs-search"></a>

## `@deepseek-ai/dsh-tool-fs-search`

### `glob`

查找路径匹配 glob 模式的文件。只返回匹配的文件路径，绝不返回目录；包括隐藏文件和被忽略的文件，但排除 VCS 元数据目录。最多按修改时间顺序返回 100 条路径；如果结果更多，则改为返回从顶层条目中抽样的 100 条路径，说明已抽样，并报告完整排序列表的保存位置。该工具不枚举目录条目。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

使用 ripgrep 正则表达式搜索文件内容。返回带行号的匹配行，并按文件分组。前 250 条匹配会直接返回；结果达到上限时会报告完整匹配列表的保存位置。如需周边上下文，请对匹配的文件使用 read。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob 和 grep 是无条件可用的发现工具，通过 ctx.subprocess spawn 随包提供的 ripgrep 二进制文件（`@vscode/ripgrep`），并作为普通前台调用运行，绝不作为后台任务；无需在宿主机安装 `rg`，也不经过 shell 层。本目录使用 `sampleOverCapGlobResults: true`；部署必须显式选择该行为。结果超过上限时，会通过可选的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公开本地路径，返回的定位信息可供后续读取／搜索。

<a id="deepseek-aidsh-tool-terminal"></a>

## `@deepseek-ai/dsh-tool-terminal`

### `terminal_close`

关闭一个持久终端，并等待其捕获且所有的进程树完全退出。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_list`

列出当前 agent 所有的持久终端会话。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_open`

通过已注册的后端类型创建按所有者隔离的持久终端会话。需要在多次工具调用之间保留 shell 或 REPL 状态时，请使用此工具。

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory. Defaults to the deployment workspace root."
    }
  },
  "required": [
    "type"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_read`

从持久终端读取一页有界的保留输出，不发送输入。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_send`

向持久终端发送文本。默认会提交 Enter，并等待提示符、stdin 等待、输出静默、超时或会话退出。后台模式会返回供 job_output／job_kill 使用的 job id。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_signal`

向持久终端当前的前台进程组发送允许的信号。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

这 6 个终端工具需要选择启用，用于补充一次性 bash／文件系统工具。`terminal_send(run_in_background: true)` 会注册到 `ctx.jobs`；schema 不包含 TUI、具名按键序列、BEL、调整尺寸、自动启动和跨 agent 共享。

<a id="deepseek-aidsh-tool-goal"></a>

## `@deepseek-ai/dsh-tool-goal`

### `create_goal`

当当前直接人类请求是需要跨自主 Goal Round 持续推进的长期目标时，创建一个持久化的同会话完成目标。即使用户没有明确说「创建目标」，你也可以推断其意图。不要用于简单的单轮工作。执行时会拒绝非人类权限和 subagent 权限。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

读取当前的同会话目标，包括确切的 id／revision、目标、阶段、已完成的延续 Round 数、Round 上限、存在时的阻塞原因，以及是否已准备下一次延续。更新目标前请先调用此工具。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

更新确切的当前目标 revision。edit、pause 和 resume 要求直接的顶层人类请求。在自动延续当前目标期间，也允许 complete 和 blocked。在达到配置的最小 Round 数之前会拒绝 blocked；模型仍须判断相同条件是否在这些 Round 中持续存在，并在 blocked_reason 中予以说明。

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit | pause | resume | complete | blocked",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Concrete blocking condition; required only with action blocked."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create、edit、pause 和 resume 要求直接来自人类的根权限；complete 和 blocked 也接受确切的当前 Goal Round。blocked 的默认下限是 3 个获准的 Round。

<a id="deepseek-aidsh-schedule"></a>

## `@deepseek-ai/dsh-schedule`

### `schedule_create`

在当前会话中创建一条提醒。请提供非空 prompt 和恰好一个 selector：正的安全整数 after_seconds 延时；作为严格带偏移日期时间或本地日期／时间对象的 at；或不小于 300 的安全整数 every_seconds。固定速率提醒始终与创建时刻对齐，会跳过错过的发生时点，并把每条逾期规则的最新一个发生时点合并到一个批次中。交付模式是 session-local：只有此会话处于 live 状态时，提醒才会准时运行；否则提醒会进入 overdue 状态，直至会话恢复。

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "after_seconds": {
      "type": "number",
      "description": "Positive safe-integer delay in seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate safe-integer interval in seconds, at least 300."
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target as strict offset RFC 3339 or local date/time with an explicit IANA zone."
    }
  },
  "required": [
    "prompt"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_delete`

使用 schedule_create 或 schedule_list 返回的确切 id，删除当前会话中的一条活动提醒。未知或已经结束的 id 会返回 deleted false。

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Exact session-local schedule id."
    }
  },
  "required": [
    "id"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_list`

按创建顺序列出当前会话中的所有活动提醒，包括确切 id、UTC 目标、scheduled 或 overdue 状态，以及 session-local 交付模式。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

仅在选择启用的 Schedule 插件加载后创建的 live 根 Agent scope 内注册。版本 1 接受 after_seconds、显式绝对 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理读取与变更必须通过共享的 Session 持久化 barrier。

<a id="deepseek-aidsh-tool-lsp"></a>

## `@deepseek-ai/dsh-tool-lsp`

### `lsp`

查询语言服务器，以精确导航代码。operation 可取 goToDefinition、findReferences、goToImplementation 或 hover。line 和 character 是从 1 开始的 UTF-16 光标坐标。findReferences 包含声明。

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

来源：[`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

lsp 工具将提供方选择和语言服务器子进程置于 ctx.lsp 之后，因此其模型可见 schema 在更换提供方时保持稳定。运行时要求已注册提供方，例如 `@deepseek-ai/dsh-lsp-stdio`；如果没有提供方，查询会返回结构化 `LSP_UNAVAILABLE` 错误，而不会改变 schema。

<a id="deepseek-aidsh-tool-ralph"></a>

## `@deepseek-ai/dsh-tool-ralph`

### `ralph`

围绕一个不可变目标运行使用全新 agent 的前台 Ralph 循环。仅当直接人类明确要求 Ralph 或使用全新 agent 迭代时使用。每个 Round 都会启动一个全新子级，该子级看不到父级对话或先前子会话；共享工作区充当长期记忆，Round 之间只传递有界的结构化报告。当工作进程报告完成、报告具体阻塞项或达到 Round 上限时，调用返回。普通的长期同会话工作应使用 goal 工具。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/workflow/tool-ralph/src/index.ts`](../packages/workflow/tool-ralph/src/index.ts)

固定的前台工作流会在每个 Round 启动一个全新的结构化子级；模型只能选择不可变目标和可选的 Round 上限。

<a id="deepseek-aidsh-tool-skill"></a>

## `@deepseek-ai/dsh-tool-skill`

### `skill`

加载可用 skill（技能）的完整说明。在执行点名某项 skill 或与其明确匹配的任务前，请使用会话 skill 目录中的确切名称调用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

来源：[`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="deepseek-aidsh-tool-session-query"></a>

## `@deepseek-ai/dsh-tool-session-query`

### `session_event_read`

从一个已获授权的会话中读取一个完整且未删节的事件，以及可选的相邻原始事件概述。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_search`

在一个已获授权的会话中搜索先前事件；如果搜索当前会话，则排除执行此次调用的步骤。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_trace`

读取已获授权会话中某个事件的所有直接替换关系，以及该事件与其引用的来源事件之间的关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_search`

搜索调用方工作区中的先前会话，并从每个会话返回匹配度最高的事件。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_trace`

读取围绕一个会话的已授权会话谱系，包括完整可见的祖先和后代关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

这 5 个只读工具会隐藏提供方游标，并根据不可变的调用 agent 会话为每个结果授权。该包需要选择启用；需要强制截止时间或限制行内输出的组合还会挂载通用超时或 spill 策略。

<a id="deepseek-aidsh-tool-subagent"></a>

## `@deepseek-ai/dsh-tool-subagent`

### `subagent`

将一项自包含任务委派给 subagent（在自身上下文中工作的独立 agent），用它卸载聚焦且独立的工作，例如研究、限定范围的实现或分析，以免消耗当前对话的上下文。subagent 会返回结果，但不会返回中间步骤。请提供完整、独立的提示词，因为它看不到当前对话。此调用默认等待结果。设置 `run_in_background: true` 可返回 job id；使用 `job_output` 收集结果，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

来源：[`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

注册的工具名称取决于加载时 `toolName` 配置（默认为 `subagent`）；上述 schema 对应默认值。随产品发布的组合会为每个 subagent 后端加载一次该包，因此模型还会看到绑定到 fork 后端的 `subagent_fork`。每个实例的描述、`run_in_background` 参数与 system prompt 策略取决于它自己的 `backgroundMode` 和 `enableRunInBackground`，因此两个随附 schema 并不相同：`subagent` 为 `continuable`，省略参数时默认后台运行，并由 runtime 自动投递结束结果；`subagent_fork` 保持 `one-shot`，省略参数时默认前台运行。详见 `packages/bundle/base/cordis.patch.yml` 和 `examples/acp-agent/cordis.yml`。

<a id="deepseek-aidsh-tool-subagent-control"></a>

## `@deepseek-ai/dsh-tool-subagent-control`

### `interrupt_agent`

根据 agent id 请求取消后台 agent 的当前轮次。目标可以是你的直接子级，也可以是在你下方创建的更深层 agent。只有当前轮次会停止：已经排队发给该 agent 的消息会一直搁置到后续的 send_message；它启动的 agent 会继续运行；该 agent 本身仍可接受后续操作。停止请求被接受后，此调用立即返回，因此目标可能还会短暂运行；中断一个已经完成的 agent 是可接受的空操作。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of the running agent to interrupt."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

按持久 id 和标签列出你的可继续后台 subagent。用它回忆你启动过哪些 subagent，而不是轮询完成情况——subagent 完成时你会被告知。状态来自实时注册表：running 表示 agent 此刻正在工作；idle 表示已加载但处于轮次之间，可能正在等待它启动的 agent；ready 表示它只存在于存储中——可恢复而非终态，也不表示有结果等待收集；`send_message` 会在同一对话上开启新的轮次，且无论处于哪种状态，直接子级都仍可作为 `send_message` 的目标。该快照并非投递承诺；`send_message` 会执行权威检查，仍可能失败。无法读取的子级会作为诊断信息报告，而不会被静默丢弃。`descendants` 作用域会按稳定的前序顺序遍历你下方的整棵树，并为每个条目标注其持久的直接父会话 id 和深度。只有深度为 1 的条目可以使用 `send_message`；更深的条目只能作为 `interrupt_agent` 的候选目标。

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children only; descendants walks the complete tree below you.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

来源：[`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

根据 subagent id 向后台 subagent 发送消息，继续同一段对话。该消息会成为 subagent 的下一轮次：如果它仍在工作，消息会等待当前轮次结束，因此无法改变已经开始的工作方向。此调用不会返回 subagent 的答案，只会确认消息已投递，因此请用它分派更多工作。调用失败表示消息**未**投递。

```json
{
  "type": "object",
  "properties": {
    "subagent_id": {
      "type": "string",
      "description": "The subagent id returned when the background subagent was started."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the subagent."
    }
  },
  "required": [
    "subagent_id",
    "message"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

这些是控制可继续后台 subagent 的全局命名工具：绑定提供方的 `tool-subagent` 实例注册不同的委派工具；本包注册一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通过单独加载的 `/list-agents` 插件提供，其目录行使用 sessionProjections 和实时 Agent 注册表。

<a id="deepseek-aidsh-tool-subagent-report"></a>

## `@deepseek-ai/dsh-tool-subagent-report`

### `report`

向启动你的 agent 报告选定内容。在你结束前调用一次，给出自包含的最终结果；当进度或发现会改变该 agent 接下来的行动时，也可以更早调用。该 agent 与你共享工作区，但不会自动收到你的 transcript（文本记录）、工具输出或推理，因此完成你的工作本身并不等于交出结果。报告不会结束你的轮次或完成你的工作，且只有直接父级会收到。失败的调用仍可能已经送达，因此不要盲目重复。

```json
{
  "type": "object",
  "properties": {
    "output": {
      "type": "string",
      "description": "Actionable content for your parent; summarize conclusions and reference relevant shared paths."
    }
  },
  "required": [
    "output"
  ]
}
```

来源：[`packages/subagent/tool-subagent-report/src/index.ts`](../packages/subagent/tool-subagent-report/src/index.ts)

按可继续的进程内子级注册，而非全局注册，因此该 schema 仅在这种子级内部可见，并且不受其全局 `toolFilter` 影响。同一份贡献还会安装子级作用域的 `tool:report` 系统提示词 section，本目录不渲染该 section。面向父级的 `send_message` 工具单独安装。

<a id="deepseek-aidsh-tool-jobs"></a>

## `@deepseek-ai/dsh-tool-jobs`

### `job_kill`

根据 job id 请求取消正在运行的后台任务。此调用立即返回；任务的工作真正停止后，会以 killed 状态结算。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

列出你的后台任务（包括正在运行和已完成的任务）及其 id、种类和状态。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

读取后台任务。流式任务只返回自上次读取以来的输出；最终输出任务会在结算后返回结果。每个响应都以 `[status: ...]` 结尾。读取默认不阻塞；设置 `wait: true` 后，最长等待到配置的上限。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds (only meaningful with wait: true). Defaults to the configured wait timeout; capped by the configured maximum."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

与任务种类无关的后台任务控制器：后台 bash 命令、PTY 发送和 subagent 都通过相同的 3 个工具读取、列出和终止。加载该插件会挂接控制器，从而启用生产方的 `ctx.jobs.start()`。

<a id="deepseek-aidsh-tool-todo"></a>

## `@deepseek-ai/dsh-experimental-tool-agent-team`

### `followup_task`

向另一名 Team member 发送持久 follow-up task，并在需要时启动一个 turn。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Team member name, or lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `interrupt_agent`

中断一名 teammate 的当前 turn，同时保留其待处理 inbox。仅 Team Lead 可用。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Teammate name."
    }
  },
  "required": [
    "target"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `list_agents`

列出 Lead 与所有持久 teammate，以及各自当前的运行时状态。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `send_message`

向另一名 Team member 发送持久信息，但不启动 idle member。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Team member name, or lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `spawn_teammate`

创建一名具名、持久的 teammate。只有 Team Lead 可以调用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique lower-kebab-case teammate name."
    },
    "description": {
      "type": "string",
      "description": "Short description of the delegated responsibility."
    },
    "prompt": {
      "type": "string",
      "description": "Complete initial task for the teammate."
    },
    "context": {
      "type": "string",
      "description": "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.",
      "enum": [
        "fresh",
        "fork"
      ]
    }
  },
  "required": [
    "name",
    "description",
    "prompt"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_create`

在共享 Team 任务板上创建一个无 owner 的 pending task。

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string",
      "description": "Concise task title."
    },
    "description": {
      "type": "string",
      "description": "Complete task details and acceptance criteria."
    },
    "blocked_by": {
      "type": "array",
      "description": "Task ids that must complete first.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Advisory workspace-relative file or directory prefixes this task expects to modify.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "subject",
    "description"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_get`

在修改或执行共享任务前，读取其完整的最新值。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    }
  },
  "required": [
    "task_id"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_list`

列出共享任务，包括 readiness、owner、revision、blocker 与 write-scope warning。

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "Optional exact status filter.",
      "enum": [
        "pending",
        "in_progress",
        "completed"
      ]
    },
    "owner": {
      "type": "string",
      "description": "Optional member-name filter; use unowned for tasks without an owner."
    },
    "ready": {
      "type": "boolean",
      "description": "Optional readiness filter."
    },
    "cursor": {
      "type": "integer",
      "description": "Zero-based result offset. Defaults to 0."
    },
    "limit": {
      "type": "integer",
      "description": "Number of rows, 1 through 100. Defaults to 50."
    }
  }
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_update`

使用 team_task_get 或 team_task_list 返回的最新 revision，对共享任务操作执行 compare-and-set。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    },
    "expected_revision": {
      "type": "integer",
      "description": "Current task revision used as the CAS precondition."
    },
    "action": {
      "type": "string",
      "description": "Task transition to apply.",
      "enum": [
        "claim",
        "release",
        "edit",
        "set_dependencies",
        "complete",
        "reopen",
        "reassign",
        "delete"
      ]
    },
    "subject": {
      "type": "string",
      "description": "Replacement title for edit."
    },
    "description": {
      "type": "string",
      "description": "Replacement details for edit."
    },
    "blocked_by": {
      "type": "array",
      "description": "Complete blocker list for set_dependencies.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Replacement advisory write scopes for edit.",
      "items": {
        "type": "string"
      }
    },
    "owner": {
      "type": "string",
      "description": "Member name for Lead-only reassign; omit to unassign."
    }
  },
  "required": [
    "task_id",
    "expected_revision",
    "action"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `wait_agent`

等待本次调用开始后下一次 teammate 状态、mailbox 或共享任务变更。它绝不会唤醒 inactive member；若没有其他 member 正在 running 或 provisioning，则立即返回 noProgress。唤醒或超时后应重新列出状态，而不是轮询。

```json
{
  "type": "object",
  "properties": {
    "timeout_ms": {
      "type": "integer",
      "description": "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
    }
  }
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

这 10 个工具限定于隐式 Team Lead 与持久 teammate 作用域。随产品发布的 dsh-base bundle 默认禁用该包；文档中的 Agent Teams profile patch 会启用它，并禁用旧 continuable child 的同名控制工具。


## `@deepseek-ai/dsh-tool-todo`

### `todo_write`

记录并更新当前工作的结构化任务列表。每次调用都要发送**完整列表**，它会**替换**之前的列表，不支持局部更新或逐项编辑。请用它规划多步骤工作并展示进度：开始前为每个具体步骤添加一项 todo。将当前正在处理的每项 todo 标记为 `in_progress`；确实并行运行时（例如并发 subagent 或后台命令）可同时标记多项，顺序工作则标记 1 项。只要工作尚未完成，就应至少有一项任务为 `in_progress`。某项 todo 完成后立即标记为 `completed`，不要批量标记完成；只有全部工作完成后，才可以没有 `in_progress` 项。简单的单步骤任务无需使用列表。状态：`pending`（未开始）、`in_progress`（正在处理）、`completed`（已完成）。

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

来源：[`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write 是会话所有的状态；UI 将最新的 todo/write 事件渲染为检查清单。`allowParallelInProgress` 是没有默认值的必填项，因此本目录明确选择 `true`，对应描述允许同时存在多个 `in_progress` 项。选择 `false` 的部署会获得同一工具，但描述会要求只能有 1 个活动任务。

<a id="deepseek-aidsh-tool-workflow"></a>

## `@deepseek-ai/dsh-tool-workflow`

### `workflow`

运行用于大规模编排 subagent 的 JavaScript 工作流脚本。当工作会分散到许多相互独立的部分时，请使用此工具，例如审查大量文件、执行迁移、开展多角度研究或对发现进行对抗式验证；此时应将编排写成脚本，而不是逐轮委派。

工作流的身份通过 `meta` 参数以 JSON 形式传入：必填的 `name`（简短 kebab-case）和 `description` 字符串，以及可选的 `whenToUse` 字符串和 `phases` 数组（`{title, detail?, provider?, model?}`）。`script` 参数只能是纯 JavaScript **函数体**，不能是 TypeScript，也不能包含 `export const meta` 语句；meta 是参数而非代码。脚本支持顶层 await；请以 `return <value>` 结尾，该值必须可以 JSON 序列化，并作为此工具的结果。

脚本函数体提供以下钩子：

- `agent(prompt, opts?): Promise<any>`：运行一个 subagent 直至完成。不提供 `opts.schema` 时，解析为子级最终文本；提供 `opts.schema` 时，它必须是以对象为根、且**只能**使用 type/properties/required/additionalProperties/items/enum/const/oneOf 的 JSON Schema，不支持 pattern/format/数值边界，此时解析为通过校验的对象。子级失败时解析为 `null`，可使用 `.filter(Boolean)` 过滤。其他选项包括 `label`（显示名称）、`phase`（进度组），以及相互独立的 `provider`／`model` LLM（大语言模型）目标覆盖项，两者可单独提供。其他任何选项（`effort`／`isolation`／`agentType`）都会明确报错。
- `pipeline(items, ...stages): Promise<any[]>`：让每个条目分别经过各阶段，阶段之间**没有**屏障；多阶段工作优先使用它。每个阶段接收 `(prev, item, index)`。普通的阶段异常会将该**条目**变为 `null`，并跳过它的剩余阶段。
- `parallel(thunks): Promise<any[]>`：并发运行零参数函数并等待**全部**完成。它会形成屏障，仅当某个阶段确实需要汇总全部先前结果时使用。抛出异常的 thunk 解析为 `null`。
- `phase(title)`：开始一个进度阶段；`log(message)`：说明进度；`args`：工具调用的 `args` 输入，原样提供。

如果误用钩子（参数错误、未知选项、不受支持的 schema、触发上限），抛出的错误**总会**终止脚本，绝不会退化为单个条目的 `null`。

约束：并发上限和 agent 总数上限均会生效；不提供文件系统、网络、定时器或 Node.js API。具体工作由 agent 完成，脚本只负责编排。该运行在前台执行：整个脚本完成后，调用才会返回。

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement; end with `return <json-value>`)."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity block (plain JSON — never code).",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

来源：[`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="deepseek-aidsh-tool-web"></a>

## `@deepseek-ai/dsh-tool-web`

### `web_fetch`

获取指定 HTTP(S) URL 的内容，并将其解码为文本后返回。

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

在 Web 上搜索最新信息。在必填的 `queries` 数组中提供 1–4 个查询。返回可选的摘要答案和来源 URL 列表。

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "description": "Required search queries; accepts 1–4 items and merges their results.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "queries"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search 和 web_fetch 将提供方选择置于 ctx.web 之后，使模型可见 schema 在更换后端时保持稳定。

<a id="deepseek-aidsh-tool-search-data-sources"></a>

## `@deepseek-ai/dsh-tool-search-data-sources`

### `search_data_sources`

查找与自然语言问题相关的数据源（DWS 表 / event ODS 表），通过语义层上的 BM25 schema-linking。在 UNDERSTANDING 阶段调用此工具，了解哪些表和事件可以回答问题，然后再写 SQL。返回带 id、score 和 description 的排序候选数据源。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The natural-language data question to link against the data-source corpus."
    },
    "top_k": {
      "type": "number",
      "description": "Maximum number of candidate data sources to return. Defaults to 20."
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/data/tool-search-data-sources/src/index.ts`](../packages/data/tool-search-data-sources/src/index.ts)

search_data_sources 是 UNDERSTANDING 阶段 BM25 schema-linking 的入口：agent 调用它了解哪些数据源（DWS 表 / event ODS 表）匹配自然语言问题，然后再写 SQL。Q1 thin default 使用本地 Bm25Linker 对空语料库操作（可调用但未连线，直到 ctx.schema 发布）——空语料库返回无候选。P5b 在注册时切换到 ctx.retrieval，P6b 从 ctx.schema.discover 获取语料库；两种情况下 tool 契约不变。

<a id="deepseek-aidsh-tool-critique-sql"></a>

## `@deepseek-ai/dsh-tool-critique-sql`

### `critique_sql_tool`

用 folded-regex SQL critic 评审一个 SQL 候选(表 ∈ candidates、ds 分区必填、无 SELECT *、GET_JSON_OBJECT 字段 ∈ event_params)。在 GENERATION 阶段、query_data 之前调用——turn-stopping gate 要求 confidence ≥ 0.6 才能进入 EXECUTION。TABLE_NOT_FOUND 或执行错误后,纠正 SQL 并 RE-call critique_sql_tool(重新评审)再 call query_data——gate 的 F2 same-source 检查要求 query_data 的 SQL 与评审过的 SQL 一致。返回 confidence、findings 和归一化后的 SQL。

```json
{
  "type": "object",
  "properties": {
    "sql": {
      "type": "string",
      "description": "The SQL to critique (raw SQL or a ```sql fenced block)."
    },
    "question": {
      "type": "string",
      "description": "The natural-language question the SQL answers (context for the critic)."
    }
  },
  "required": [
    "sql"
  ]
}
```

Source: [`packages/data/tool-critique-sql/src/index.ts`](../packages/data/tool-critique-sql/src/index.ts)

critique_sql_tool 是 GENERATION 阶段的 SQL 评审器(folded-regex:表 grounding、ds 分区、SELECT *、JSON-path 字段)。它通过 ctx.get 惰性探查 ctx.criticCtx 和 ctx.schema(schema 收集无需 provider 挂载);空的 critic 上下文 fail-open,使工具在未挂载 phase-gate 或语义层时仍能注册其 schema。

<a id="deepseek-aidsh-tool-discover-relations"></a>

## `@deepseek-ai/dsh-tool-discover-relations`

### `discover_relations`

在语义层上发现 DWS→DIM dimension join 关系(G3 AI-native enrichment:确定性 primary-key-name 轮 + 可选 LLM 语义轮)。把发现的 dimension_refs 写回每个 DWS 表。在 ENRICHMENT 阶段调用以 seed 或刷新某 scope 的关系图。可选限制到 `tables` 集合;省略则富化 active scope 的所有 DWS 表。

```json
{
  "type": "object",
  "properties": {
    "tables": {
      "type": "array",
      "description": "Optional list of table_name values to limit enrichment to. Omit to enrich all DWS tables in the active scope.",
      "items": {
        "type": "string"
      }
    }
  }
}
```

Source: [`packages/data/tool-discover-relations/src/index.ts`](../packages/data/tool-discover-relations/src/index.ts)

discover_relations 是 ENRICHMENT 阶段的 AI-native DWS→DIM join 发现入口。它委托 ctx.schema.discoverRelations,经 ctx.get 惰性探查;schema 收集无需 schema provider(在 ctx.schema 发布前可调用但未接线)。

<a id="deepseek-aidsh-tool-edit-definition"></a>

## `@deepseek-ai/dsh-tool-edit-definition`

### `edit_definition`

通过应用部分 patch 编辑数据资产定义(表、事件或 concept)。patch 在顶层 shallow-merge;对 `columns` 和 `dimension_refs`,按 identity 字段(name / dim_table)合并。`domains` 和 `alt_labels` 去重 union。所有对表/事件的编辑标记为 "unreviewed" 并审计。metric 是虚拟的,不能直接编辑——改宿主资产。

```json
{
  "type": "object",
  "properties": {
    "asset_name": {
      "type": "string",
      "description": "The asset to edit (table_name or event name)."
    },
    "patch": {
      "type": "object",
      "description": "Partial definition fields to merge. Supports: description, columns (array merged by name), dimension_refs (array merged by dim_table), domains (unioned with dedup), granularity, metrics, etc.",
      "additionalProperties": true
    }
  },
  "required": [
    "asset_name",
    "patch"
  ]
}
```

Source: [`packages/data/tool-edit-definition/src/index.ts`](../packages/data/tool-edit-definition/src/index.ts)

edit_definition 对表或事件定义应用部分 patch(shallow-merge;列按 name 合并)并记录一次 Tier-2 audit 写,将该资产标记为 unreviewed。metric 是虚拟的,不能直接编辑。schema 收集挂载 inert ctx.schema + ctx.audit provider 使 Tier-2 inject 可达。

<a id="deepseek-aidsh-tool-evaluate-sql-quality"></a>

## `@deepseek-ai/dsh-tool-evaluate-sql-quality`

### `evaluate_sql_quality`

根据 folded-regex critic 发现(表 grounding、ds 分区、SELECT *、JSON-path 字段)对 SQL 候选打质量分(0–100)。在 GENERATION 阶段、query_data 之前与 critique_sql_tool 一起调用——turn-stopping gate 要求 score ≥ 60 才能进入 EXECUTION。返回质量分。

```json
{
  "type": "object",
  "properties": {
    "sql": {
      "type": "string",
      "description": "The SQL to score (raw SQL or a ```sql fenced block)."
    }
  },
  "required": [
    "sql"
  ]
}
```

Source: [`packages/data/tool-evaluate-sql-quality/src/index.ts`](../packages/data/tool-evaluate-sql-quality/src/index.ts)

evaluate_sql_quality 根据 folded-regex critic 发现对 SQL 候选打 0-100 分。它惰性探查 ctx.criticCtx;schema 收集无需 provider 挂载(空 critic 上下文 fail-open)。

<a id="deepseek-aidsh-tool-get-coverage"></a>

## `@deepseek-ai/dsh-tool-get-coverage`

### `get_coverage`

获取语义层覆盖统计:按 kind 的资产总数(表、事件、metric)、确认状态分布(confirmed vs draft)、按域资产计数。可选按特定域(concept)过滤。用于评估语义层的整体健康度与完整度。

```json
{
  "type": "object",
  "properties": {
    "domain": {
      "type": "string",
      "description": "Optional domain name to scope statistics to (only assets belonging to this domain are counted)."
    }
  }
}
```

Source: [`packages/data/tool-get-coverage/src/index.ts`](../packages/data/tool-get-coverage/src/index.ts)

get_coverage 报告语义层覆盖统计(按 kind 的资产、确认状态、按域计数)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。

<a id="deepseek-aidsh-tool-get-definition"></a>

## `@deepseek-ai/dsh-tool-get-definition`

### `get_definition`

按 name 加载数据资产(表、事件、metric 或 concept)的完整定义。返回完整定义,含字段、关系、域、metric 和确认状态。在 search_schema 识别资产后用它检视。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The asset name (table_name, event name, or metric name) to look up."
    }
  },
  "required": [
    "name"
  ]
}
```

Source: [`packages/data/tool-get-definition/src/index.ts`](../packages/data/tool-get-definition/src/index.ts)

get_definition 按 name 加载统一的数据资产定义(表、事件或 metric)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。

<a id="deepseek-aidsh-tool-list-domains"></a>

## `@deepseek-ai/dsh-tool-list-domains`

### `list_domains`

列出语义层所有域(concept)及其描述、别名和按 kind 的资产计数(表、事件、metric)。用于了解域结构并识别需关注的方向。

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/data/tool-list-domains/src/index.ts`](../packages/data/tool-list-domains/src/index.ts)

list_domains 枚举语义层各域及按 kind 的资产计数(表、事件、metric)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。

<a id="deepseek-aidsh-tool-load-event-definition"></a>

## `@deepseek-ai/dsh-tool-load-event-definition`

### `load_event_definition`

从语义层加载已校验的 instrumented event 定义(params_fields、metrics、disambiguation、外部 dimension 引用)。在 UNDERSTANDING/GENERATION 阶段调用,在写或评审基于 event ODS 表的查询前把 SQL 接地到真实 event schema。找到时返回投影后的 event 定义,否则返回 not-found / not-mounted 消息。

```json
{
  "type": "object",
  "properties": {
    "event_name": {
      "type": "string",
      "description": "The event name (its `name` key in the semantic layer) to load."
    }
  },
  "required": [
    "event_name"
  ]
}
```

Source: [`packages/data/tool-load-event-definition/src/index.ts`](../packages/data/tool-load-event-definition/src/index.ts)

load_event_definition 加载已校验的事件定义(params_fields、metrics、disambiguation、外部 dimension 引用)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线(空 semanticRoot 返回 not-found,不崩溃)。

<a id="deepseek-aidsh-tool-load-table-definition"></a>

## `@deepseek-ai/dsh-tool-load-table-definition`

### `load_table_definition`

从语义层加载已校验的表定义(列、分区、主键、metrics、dimension 引用)。在 UNDERSTANDING/GENERATION 阶段调用,在写或评审查询前把 SQL 接地到真实 schema。找到时返回投影后的表定义,否则返回 not-found / not-mounted 消息。

```json
{
  "type": "object",
  "properties": {
    "table_name": {
      "type": "string",
      "description": "The table name (its `table_name` key in the semantic layer) to load."
    }
  },
  "required": [
    "table_name"
  ]
}
```

Source: [`packages/data/tool-load-table-definition/src/index.ts`](../packages/data/tool-load-table-definition/src/index.ts)

load_table_definition 加载已校验的表定义(列、分区、主键、metrics、dimension 引用)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线(空 semanticRoot 返回 not-found,不崩溃)。

<a id="deepseek-aidsh-tool-present-clarification"></a>

## `@deepseek-ai/dsh-tool-present-clarification`

### `present_clarification`

向用户呈现一个澄清问题并 HALT 该 turn 等待回答。当真实歧义或缺失知识(如表在哪个 engine project)阻塞推进时使用。emit 恰好一个具体问题;gate 在此调用 HALT(任意阶段)。

```json
{
  "type": "object",
  "properties": {
    "question": {
      "type": "string",
      "description": "One specific clarifying question for the user."
    },
    "options": {
      "type": "array",
      "description": "Optional multiple-choice options.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "question"
  ]
}
```

Source: [`packages/data/tool-present-clarification/src/index.ts`](../packages/data/tool-present-clarification/src/index.ts)

present_clarification 是纯展示工具,为 UI 记录一个澄清问题并依赖 phase-gate HALT 该 turn。除 ctx.tools 外无服务依赖;真正的 HALT 是 phase-gate 的事(非该工具)。

<a id="deepseek-aidsh-tool-retrieve"></a>

## `@deepseek-ai/dsh-tool-retrieve`

### `retrieve`

按需检索相关 data-source 上下文——预取的 UNDERSTANDING 上下文有明显缺口(歧义问题,或预取未桥接的业务同义词)时的 escape-hatch。优先用 search_data_sources 已呈现的上下文;仅当缺口明显时用精炼后的 query 调用。返回带 id、score、description 的排序候选 data source。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "The natural-language query to retrieve data-source context for. Refine the prefetch query when it missed (a synonym, a more specific phrasing)."
    },
    "top_k": {
      "type": "number",
      "description": "Maximum number of candidate data sources to return. Defaults to 20."
    }
  },
  "required": [
    "query"
  ]
}
```

Source: [`packages/data/tool-retrieve/src/index.ts`](../packages/data/tool-retrieve/src/index.ts)

retrieve 是按需检索 escape-hatch,用于预取的 UNDERSTANDING 上下文有明显缺口时。它惰性探查 ctx.retrieval 和 ctx.schema;Q1 thin default 是空语料 Bm25Linker(可调用但未接线)。以 additive + dormant 形式发布;preset 必须挂载它。

<a id="deepseek-aidsh-tool-search-schema"></a>

## `@deepseek-ai/dsh-tool-search-schema`

### `search_schema`

在语义层检索匹配自然语言 query 的数据资产(表、事件、metric)。返回带 kind 和域元数据的排序结果。在用 get_definition 检视前,用它发现有哪些资产。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural-language search query describing the assets to find."
    },
    "top_k": {
      "type": "number",
      "description": "Maximum number of results to return. Defaults to 20."
    }
  },
  "required": [
    "query"
  ]
}
```

Source: [`packages/data/tool-search-schema/src/index.ts`](../packages/data/tool-search-schema/src/index.ts)

search_schema 是对语义层的 BM25 检索,供管理 agent 使用(返回带 kind 和域元数据的资产匹配)。它惰性探查 ctx.schema;在 ctx.schema 挂载前可调用但未接线。

<a id="deepseek-aidsh-tool-trigger-eval"></a>

## `@deepseek-ai/dsh-tool-trigger-eval`

### `trigger_eval`

触发一次语义层 eval run 以衡量 data agent 质量。跑全量 case 集,报告 pass rate,并与上一次 run 对比(before/after delta 显示哪些 case improved 或 regressed)。改动后用它评估影响。

```json
{
  "type": "object",
  "properties": {
    "skip_health_gate": {
      "type": "boolean",
      "description": "Skip the pre-flight health check (use when debugging connectivity issues)"
    }
  }
}
```

Source: [`packages/data/tool-trigger-eval/src/index.ts`](../packages/data/tool-trigger-eval/src/index.ts)

trigger_eval 触发一次语义层 eval run 并报告 before/after delta。它惰性探查 ctx.evalRunner 和 ctx.evidenceQuery;未挂载 runner 时报告 not_configured(host 组合须接线协作者)。

<a id="deepseek-aidsh-tool-update-table-config"></a>

## `@deepseek-ai/dsh-tool-update-table-config`

### `update_table_config`

向表定义写一个按表的 engine project override(self-evolution:问用户某表在哪个 engine project 后持久化,使未来 qualifyTable 重试能解析 <project>.<table> 且 engine 找到该表)。仅 admin。成功返回 { ok, qualified_name },非 admin / name 无效 / 表不在磁盘时返回 { ok: false, error }。

```json
{
  "type": "object",
  "properties": {
    "table_name": {
      "type": "string",
      "description": "The table name (its `table_name` key in the semantic layer) to override."
    },
    "project": {
      "type": "string",
      "description": "The engine project the table lives in (written as the per-table `project` override)."
    }
  },
  "required": [
    "table_name",
    "project"
  ]
}
```

Source: [`packages/data/tool-update-table-config/src/index.ts`](../packages/data/tool-update-table-config/src/index.ts)

update_table_config 向表定义写一个按表的 ODPS project override(self-evolution #3b),使未来 qualifyTable 重试能解析 <project>.<table>。仅 admin(RBAC stub 读 ctx.identity)。经 ctx.audit 做 Tier-2 audit。schema 收集挂载 inert ctx.schema + ctx.audit + ctx.identity provider 使 Tier-2 inject 可达。

<a id="deepseek-aidsh-tool-compute"></a>

## `@deepseek-ai/dsh-tool-compute`

### `compute`

对查询结果执行 Python/pandas 代码以派生新数据。代码作为 async function body 运行,可用 pandas 和 numpy。通过 `await data.load_result({"result_id": "qr_..."})` 访问源数据,返回 {"columns": [...], "rows": [...]}。代码须返回同形对象:{"columns": [...], "rows": [...]}。在 INTERPRETATION 阶段用于 SQL 查询未覆盖的计算(比率、累计、pivot、统计检验等)。

```json
{
  "type": "object",
  "properties": {
    "result_id": {
      "type": "string",
      "description": "The result_id of the source data to compute against (from query_data execution)."
    },
    "code": {
      "type": "string",
      "description": "Python code to execute. Has pandas (pd) and numpy (np) available. Load data with `await data.load_result({\"result_id\": \"...\"})`. Must return {\"columns\": [...], \"rows\": [...]}."
    },
    "description": {
      "type": "string",
      "description": "Human-readable description of what this computation produces."
    }
  },
  "required": [
    "result_id",
    "code",
    "description"
  ]
}
```

Source: [`packages/data/tool-compute/src/index.ts`](../packages/data/tool-compute/src/index.ts)

compute 对一个源 result_id 跑代码绑定,经 ctx.resultCache 把派生结果存到 cr_ 前缀下。schema 收集挂载 inert codeRuntime + resultCache provider 使 inject 可达;工具仅在 execute 时读取它们。

<a id="deepseek-aidsh-tool-discover-alt-labels"></a>

## `@deepseek-ai/dsh-tool-discover-alt-labels`

### `discover_alt_labels`

为语义层定义发现替代检索标签(alt_labels / SKOS aliases)(CL-1 AI-native enrichment:从 description/columns/domains 确定性抽取 + 可选 LLM 语义轮)。把发现的标签写回每个定义。调用以通过加同义词、缩写、中英文变体来提升检索召回。可选限制到 `tables` 和/或 `events` 集合;都省略则富化所有定义。

```json
{
  "type": "object",
  "properties": {
    "tables": {
      "type": "array",
      "description": "Optional list of table_name values to limit enrichment to.",
      "items": {
        "type": "string"
      }
    },
    "events": {
      "type": "array",
      "description": "Optional list of event name values to limit enrichment to.",
      "items": {
        "type": "string"
      }
    }
  }
}
```

Source: [`packages/data/tool-discover-alt-labels/src/index.ts`](../packages/data/tool-discover-alt-labels/src/index.ts)

discover_alt_labels 镜像 discover_relations:它为表/列呈现替代标签(alias)以扩大召回。它惰性探查 ctx.schema;schema 收集无需 schema provider(在 ctx.schema 发布前可调用但未接线)。

<a id="deepseek-aidsh-tool-present-decomposition"></a>

## `@deepseek-ai/dsh-tool-present-decomposition`

### `present_decomposition`

向用户呈现结构化查询分解:从原问题抽取的 interpreted summary、metrics、dimensions 和时间范围。在 INTERPRETATION 阶段使用,执行前向用户展示其自然语言问题如何被理解。

```json
{
  "type": "object",
  "properties": {
    "summary": {
      "type": "string",
      "description": "A natural-language summary of the interpreted query intent."
    },
    "metrics": {
      "type": "array",
      "description": "The metrics (measures) identified in the query.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string",
            "description": "Metric name."
          },
          "value": {
            "type": "string",
            "description": "Metric expression or description."
          },
          "unit": {
            "type": "string",
            "description": "Optional unit of measurement."
          }
        },
        "required": [
          "name",
          "value"
        ]
      }
    },
    "dimensions": {
      "type": "array",
      "description": "The dimensions (group-by axes) identified in the query.",
      "items": {
        "type": "string"
      }
    },
    "time_range": {
      "type": "string",
      "description": "The time range the query covers (e.g. \"last 7 days\", \"2024-01 to 2024-03\")."
    },
    "source": {
      "type": "string",
      "description": "The primary data source or table used."
    },
    "filters": {
      "type": "array",
      "description": "Filter conditions applied to the query.",
      "items": {
        "type": "string"
      }
    },
    "confidence": {
      "type": "number",
      "description": "Confidence score between 0 and 1 for the interpretation."
    }
  },
  "required": [
    "summary",
    "metrics",
    "dimensions",
    "time_range"
  ]
}
```

Source: [`packages/data/tool-present-decomposition/src/index.ts`](../packages/data/tool-present-decomposition/src/index.ts)

present_decomposition 是纯展示工具,为 UI 渲染一个查询分解(breakdown)。除 ctx.tools 外无服务依赖。

<a id="deepseek-aidsh-tool-present-table"></a>

## `@deepseek-ai/dsh-tool-present-table`

### `present_table`

向用户呈现查询结果表及展示元数据:title、列布局、排序、KPI 聚合和可选 chart 配置。在 INTERPRETATION 阶段使用,指示 UI 如何渲染执行后的查询结果。

```json
{
  "type": "object",
  "properties": {
    "result_id": {
      "type": "string",
      "description": "The ID of the query result to present (from query_data execution)."
    },
    "title": {
      "type": "string",
      "description": "Human-readable title for the table display."
    },
    "columns": {
      "type": "array",
      "description": "Column names for display (overrides raw result headers).",
      "items": {
        "type": "string"
      }
    },
    "column_types": {
      "type": "array",
      "description": "Semantic type per column (e.g. \"number\", \"date\", \"string\").",
      "items": {
        "type": "string"
      }
    },
    "sort_column": {
      "type": "number",
      "description": "Index of the column to sort by (-1 for no sort)."
    },
    "kpi_columns": {
      "type": "array",
      "description": "Columns to display as KPI summary cards above the table.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "column": {
            "type": "number",
            "description": "Column index."
          },
          "aggregation": {
            "type": "string",
            "description": "Aggregation function (sum, avg, max, min, count)."
          },
          "label": {
            "type": "string",
            "description": "Display label for the KPI."
          },
          "format": {
            "type": "string",
            "description": "Optional format string (e.g. \",.2f\", \"%\")."
          }
        },
        "required": [
          "column",
          "aggregation",
          "label"
        ]
      }
    },
    "chart": {
      "type": "object",
      "description": "Optional chart visualization config.",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "description": "Chart type.",
          "enum": [
            "line",
            "bar"
          ]
        },
        "x_column": {
          "type": "number",
          "description": "Column index for the x-axis."
        },
        "y_columns": {
          "type": "array",
          "description": "Column indices for y-axis series.",
          "items": {
            "type": "number"
          }
        }
      },
      "required": [
        "type",
        "x_column",
        "y_columns"
      ]
    }
  },
  "required": [
    "result_id",
    "title"
  ]
}
```

Source: [`packages/data/tool-present-table/src/index.ts`](../packages/data/tool-present-table/src/index.ts)

present_table 为 UI 渲染表或图表结果(line/bar)。除 ctx.tools 外无服务依赖;chart.type 在 tool-args 边界 fail-loud 校验。

<a id="deepseek-aidsh-tool-reachability-delta"></a>

## `@deepseek-ai/dsh-tool-reachability-delta`

### `reachability_delta`

计算 reachability delta:若加入一个拟议关系,哪些资产对经 join 变为新可达?用于评估向知识图加新关系的影响。

```json
{
  "type": "object",
  "properties": {
    "source_id": {
      "type": "string",
      "description": "Source asset ID for the proposed relation"
    },
    "target_id": {
      "type": "string",
      "description": "Target asset ID for the proposed relation"
    },
    "type": {
      "type": "string",
      "description": "Relation type (joins | derived_from | related_to)"
    },
    "on": {
      "type": "string",
      "description": "Join condition expression (for joins type)"
    }
  },
  "required": [
    "source_id",
    "target_id",
    "type"
  ]
}
```

Source: [`packages/data/tool-reachability-delta/src/index.ts`](../packages/data/tool-reachability-delta/src/index.ts)

reachability_delta 报告两个资产之间的 join-reachability 差异。它惰性探查 ctx.schema;schema 收集无需 schema provider。

<a id="deepseek-aidsh-tool-resolve-term"></a>

## `@deepseek-ai/dsh-tool-resolve-term`

### `resolve_term`

将业务术语精确解析为数据资产（匹配 alt_labels/pref_label），返回命中节点及图上下文。用于消歧：当你不确定一个业务概念对应哪些表/事件/指标时调用此工具。

```json
{
  "type": "object",
  "properties": {
    "term": {
      "type": "string",
      "description": "要解析的业务术语（如 \"DAU\"、\"付费用户\"、\"活跃\"）"
    }
  },
  "required": [
    "term"
  ]
}
```

Source: [`packages/data/tool-resolve-term/src/index.ts`](../packages/data/tool-resolve-term/src/index.ts)

resolve_term 把自然语言术语映射到数据资产(表/事件/metric)。它惰性探查 ctx.schema;schema 收集无需 schema provider。

<a id="deepseek-aidsh-tool-revert-edit"></a>

## `@deepseek-ai/dsh-tool-revert-edit`

### `revert_edit`

把数据资产定义(表或事件)回滚到先前快照。每次 edit_definition 调用按资产记录一个 before-snapshot(递增版本号)。用此工具 revert 到特定版本来撤销编辑。revert 前当前状态也被快照(使 revert 本身可被撤销)。

```json
{
  "type": "object",
  "properties": {
    "asset_name": {
      "type": "string",
      "description": "The asset to revert (table_name or event name)."
    },
    "to_version": {
      "type": "integer",
      "description": "The snapshot version to restore (must be >= 1). Use list mode (omit to_version and set list_versions=true) to see available versions, or specify a version number to revert to that snapshot."
    },
    "list_versions": {
      "type": "boolean",
      "description": "If true, list available snapshot versions for the asset instead of reverting. Returns version metadata without modifying anything."
    }
  },
  "required": [
    "asset_name"
  ]
}
```

Source: [`packages/data/tool-revert-edit/src/index.ts`](../packages/data/tool-revert-edit/src/index.ts)

revert_edit 回滚一次语义层编辑(concept/table/event)并经 ctx.audit 记录回滚(Tier-2)。schema 收集挂载 inert schema + audit provider 使 inject 可达;execute 惰性读取它们。

<a id="deepseek-aidsh-tool-scope-routing"></a>

## `@deepseek-ai/dsh-tool-scope-routing`

### `list_scopes`

列出所有可用 data scope(game/product)及其描述。用于看你能 switch 到哪些 scope。每个 scope 有自己的语义层、event 定义和查询约定。

```json
{
  "type": "object",
  "properties": {}
}
```

Source: [`packages/data/tool-scope-routing/src/index.ts`](../packages/data/tool-scope-routing/src/index.ts)

### `switch_scope`

Switch the active data scope to a different game/product. After switching, all subsequent data operations (search, load definitions, generate SQL, execute queries) will use the new scope's semantic layer and conventions. Use list_scopes first if unsure which scope to switch to.

```json
{
  "type": "object",
  "properties": {
    "scope_id": {
      "type": "string",
      "description": "The scope id to switch to (from list_scopes)."
    }
  },
  "required": [
    "scope_id"
  ]
}
```

Source: [`packages/data/tool-scope-routing/src/index.ts`](../packages/data/tool-scope-routing/src/index.ts)

scope_routing 是按 scope 的路由面:list_scopes + switch_scope + 一个 alias-hint system-prompt 贡献。systemPrompt 由收集 base 挂载;工具惰性读取 active scope。

<a id="deepseek-aidsh-tool-suggest-followups"></a>

## `@deepseek-ai/dsh-tool-suggest-followups`

### `suggest_followups`

基于当前查询结果,建议用户接下来可能问的后续问题。在 INTERPRETATION 阶段使用,提供可执行的下一步(drill-down、对比、时间平移)。给 1-5 个建议,每个含完整 query 值和一个 ≤ ~20 字符 / ≤ 4 词、且从不重复该值的 label——UI 在第一行渲染 label、其下渲染完整值,故 label 是短标签、非预览。

```json
{
  "type": "object",
  "properties": {
    "suggestions": {
      "type": "array",
      "description": "Array of 1-5 follow-up suggestions, each with a label and value.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "label": {
            "type": "string",
            "description": "Short tag for the row (≤ ~20 characters / ≤ 4 words). Never repeat the value — the UI shows the full value under the label."
          },
          "value": {
            "type": "string",
            "description": "The full follow-up question/query to execute if the user selects this."
          }
        },
        "required": [
          "label",
          "value"
        ]
      }
    }
  },
  "required": [
    "suggestions"
  ]
}
```

Source: [`packages/data/tool-suggest-followups/src/index.ts`](../packages/data/tool-suggest-followups/src/index.ts)

suggest_followups 在结果后呈现后续问题 chip。除 ctx.tools 外无服务依赖。
