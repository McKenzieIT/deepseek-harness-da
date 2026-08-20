# @deepseek-ai/dsh-subagent-qoder

[English](README.md) | 中文

本包注册固定的 `qoder` subagent provider。每次接受的运行在委托 Session 的工作区中调用官方 Qoder Agent SDK，通过凭证接缝按操作解析 Qoder PAT，并仅通过共享的 [`dsh-subagent`](../subagent/README.md) result contract 返回终态结果。

## 设计（terminal-only，claude-code 先例）

provider 排空完整的 Qoder `query()` 消息流，仅接受成功的 `result` 消息——Qoder `SDKResultMessage` 是 Claude 形状的（`subtype`/`is_error`/`result`），因此从 [`subagent-claude-code`](../subagent-claude-code/README.md) 先例中提取 `successfulResult` 可逐字迁移。Assistant 推理、工具活动和中间消息保留在 Qoder 产品本地，不复制到父 Session：外部一次性运行不可 trace 枚举，与 `subagent-claude-code`/`-codex`/`-acp`/`-dsh-sdk` 一致。

审计用的工具/推理可见性**已延后**——仅在 P8/forensic 确认需要时开 follow-up。当前 P8 审计模型消费 harness 级别的 `tool/call` 事件（who/when/PAT-scope/Credits），而非 Qoder 内部 trace，因此 provider 侧日志与 P8 正交。若后续需要 traceability，则是核心接缝变更（第三种 "external-logged" 运行类型），不属 P3 范畴。

参见 [`wayfinder/data-agent/research/qoder-sdk-dts.md`](../../../wayfinder/data-agent/research/qoder-sdk-dts.md) 了解基于 `.d.ts` 的类型事实，以及 [`wayfinder/data-agent/tickets/phase-1/P3-subagent-qoder.md`](../../../wayfinder/data-agent/tickets/phase-1/P3-subagent-qoder.md) 了解决策。

## 启动与所有权

`start(request)` 接受非空文本块序列，从父 Session 派生子 cwd，通过 `ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))` 解析 PAT，并调用 SDK `query()`。运行在 `Query` 存在时发布；worker spawn、`system/init` 线协议握手（跨主版本不匹配时可能抛出 `ProtocolVersionMismatchError`）、以及 agent 循环都在迭代期间发生，通过 `settleRunResult` 以 `error` 或 `aborted` 结算，而非 reject `start()`。仅同步构造失败（罕见）通过 startup catch reject `start()`。`dispose()` 幂等：中止运行并调用 `Query.close()`。

## 认证与模型

- **PAT** 通过凭证接缝按操作解析，并经 `accessToken(value)` 显式传递给 `options.auth`——从不使用 `accessTokenFromEnv()`，后者要求 PAT 在 `process.env` 中，与内网安全优先冲突。MVP 无地址解析（通过凭证接缝 fallback 链落 T1 全局）；线程化 per-user `{ userId }` 是 P9 未来路径，无需 P3 核心变更。PAT 轮换是人工或 P9-admin 经 `ctx.credentials.set` 的操作；`credentials/updated` 热重载，下次 `resolve()` 直接获取新值，无需重启，P3 无需参与。
- **模型**：`options.model` 来自配置，选择 Qoder 平台模型（消费 PAT 持有者的 Qoder Credits）。`resolveModel` pull 模式和 BYOK（`CustomModel` → 将 Qoder 调用路由到 harness 拥有的 LLM）是文档化的未来扩展；回调接线延后至动态选择或 BYOK 实际需要时。

## 能力与上下文

provider 在启动时不声明任何能力，并报告 `inheritsParentContext: false`。Qoder 接收独立文本任务和父 Session cwd，但不接收父对话、persona、工具过滤器、深度策略或结构化输出 contract。

## 配置

| Key | Default | Meaning |
|---|---|---|
| `model` | — | 转发给 `options.model` 的 Qoder 平台模型 id（如 `'auto'`、`'performance'` 或具名模型）。省略则由 Qoder 选择。 |
| `disposeGraceMs` | `3000` | 正有限宽限毫秒数，不超过 [`MAX_TIMER_DELAY_MS`](../../util/timeout/README.md)。 |

生产 `dsh` 不安装或挂载此可选 provider。选择接入的 Profile 必须安装 `@deepseek-ai/dsh-subagent-qoder` **及 `@qoder-ai/qoder-agent-sdk`（peerDependency——部署方提供并负责其供应链审查；仓库不打包 Qoder 的混淆非许可 worker）**，并在 host plane 上挂载一次 provider；加载 provider 不会启动 Qoder worker，直到有工具调用。面向模型的工具行由 [`dsh-tool-subagent`](../tool-subagent/README.md) 以 `provider: qoder` 提供。

## 传输

Qoder SDK 默认使用 `WorkerTransport`（安装时下载的混淆 `dist/_worker/qoder-worker-runtime.obf.mjs`，固定 `qoderCliVersion 1.1.25`）。与 `subagent-claude-code` 的 `ProcessTransport`（宿主 PATH `claude` 可执行文件）不同，无需解析或终止外部 CLI；`Query.close()` 即全部拆除。部署应注意 postinstall 下载、`QODERCLI_PATH`/`QODER_SKIP_DOWNLOAD` 覆盖项、以及混淆运行时无 semver 保证。本工作区的 `pnpm-workspace.yaml` 设置 `allowBuilds: '@qoder-ai/qoder-agent-sdk': false`，因此 worker 运行时**不在安装时下载**——活跃 `query()` 在 worker spawn 时失败，直到部署运行 `pnpm approve-builds @qoder-ai/qoder-agent-sdk`（或将 `QODERCLI_PATH` 指向现有 qodercli）。与 `subagent-claude-code` 的 `ProcessTransport`（清洗子进程，剥离含凭证的环境变量）不同，`WorkerTransport` 在进程内运行混淆 worker，**完全访问** `process.env`、文件系统（父 cwd——业务文件）和网络——更宽的信任边界。Qoder PAT 本身通过 T1 内网安全优先保持在 `process.env` 之外，但运行时存在的**其他** env/文件系统密钥暴露给混淆非许可 worker；受限环境中的部署应将 worker 视为信任边界。

## Model Experience

### Child request

#### What the model sees

Qoder 子级接收由 `textTask()` 组装的独立文本任务，作为一个全新 SDK `query()`。其工作区为经 `resolveChildCwd` 解析的父 Session cwd；其模型为经 `options.model` 转发的 Qoder 平台 id（消费 PAT 持有者的 Credits），其认证为经 `accessToken(value)` 显式传递的 PAT，其系统指令、工具和沙箱来自原生 Qoder 设置和混淆的进程内 `WorkerTransport`。provider 声明 `inheritsParentContext: false` 和 `NO_START_CAPABILITIES`，故子级不接收父对话、persona、工具过滤器、深度策略或结构化输出 contract；`persistSession: false` 和 `disallowedTools: ['AskUserQuestion']` 将运行锁定为 terminal-only。

#### Token effect

子级为独立的 Qoder 上下文和多步 agent 循环付费。子级 token 从不进入父级上下文。

#### KV Cache effect

独立于父级请求缓存。复用仅取决于 Qoder 自身的模型、原生设置、worker 运行时和全新 query。

### Parent tool result, indirectly

#### What the model sees

经 `dsh-tool-subagent`，前台调用给父级 `successfulResult` 提取的严格最终 Qoder 答案，或携带停止原因和可选安全诊断的非完成结果错误。`consumeQoderQuery` 排空完整 SDK 消息流，仅接受一条 strict-success `result` 消息；非 `result` 消息（assistant 推理、工具活动、status、`api_retry`、hooks 等）被跳过而不收窄其 delta，故 Qoder 内部 trace 保留在产品本地，不复制到父 Session。捕获到 `SubagentResult.costs` 的成本遥测执行本地到达审计 `tools/post-execute` 观察者（G3 Credits driver），从不持久化。本 provider 自身不添加父级 tool schema；面向模型的 tool 行为 `dsh-tool-subagent`，`provider: qoder`。

#### Token effect

父级输入仅因最终结果或错误增长，数据依赖并保留至 compaction。本 provider 自身不添加父级 schema。

#### KV Cache effect

仅追加；新可见内容跟随可复用请求前缀，不使既有 KV-cache 条目失效。

## Known Limitations and Deferred Work

- **每次运行一个全新 query**——无 continuation、resume、池化或产品会话持久化。
- **工具/推理不传播到父级**——terminal-only；Qoder 内部 trace 保留在产品本地。可追踪变体将是核心接缝变更（超出 P3 范围）。
- **`resolveModel`/BYOK 未接线**——MVP 使用 `options.model`；pull 模式回调 + BYOK-to-harness-LLM 是未来扩展。
- **实时 e2e 受密钥门控**——单元规范通过 mock fixture 固定适配；实时 Qoder e2e（消费 Credits）延后至 PAT + Credits 账号就绪。
- **无挂钟超时或副作用回滚**——调用方取消长时间工作；Qoder 在取消前已更改的文件或外部系统不会恢复。
