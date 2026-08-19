# Qoder 模型调用能力迁移至 harness 可行性研究

> 子任务：评估"把 Qoder 调用模型的能力迁移到 `deepseek-harness-da`（TS 插件化 agent harness，vendored Cordis）"的干净路径。
> 包：`@qoder-ai/qoder-agent-sdk`。本文基于**包内 `.d.ts` 实测**（非推断），区分事实与推断。

## 0. 对象与方法

- 包：`@qoder-ai/qoder-agent-sdk`@**1.0.24**（latest；`1.0.0` 为 beta）。registry metadata：`dist-tags latest=1.0.24, beta=1.0.0`；maintainer `qoder-dev`<dev@qoder.com>；homepage https://docs.qoder.com/cli ；bugs https://forum.qoder.com 。
- 1.0.24 依赖：`@modelcontextprotocol/sdk ^1.27.1`；peerDep `zod ^3.25.0 || ^4.0.0`；engines `node>=18`；`qoderCliVersion:"1.1.25"`、`qoderSdkBrand:"global"`。
  - 对比 1.0.0：曾运行时依赖 `@anthropic-ai/sdk ^0.80.0`、devDep `@anthropic-ai/claude-agent-sdk ^0.2.104`；**1.0.24 已移除运行时 `@anthropic-ai/sdk`**。
- 方法：`curl https://registry.npmjs.org/@qoder-ai/qoder-agent-sdk` 取 metadata；下载 `qoder-agent-sdk-1.0.24.tgz` 解包；逐个 cat `dist/*.d.ts`、`README.md`、`package.json`。
- 协议版权头（`dist/protocol/messages.d.ts`、`dist/protocol/index.d.ts`）：`Copyright 2026 Google LLC / Apache-2.0`，注释称 "CLI-side zod schemas in `@google/gemini-cli-core`"。**事实**：Qoder SDK 的 wire 协议即 **Gemini CLI 协议**（fork/rebrand），其消息体 `BetaMessage`/`BetaRawMessageStreamEvent` 为 Anthropic Beta 形状，但在 `dist/protocol/common.d.ts` **本地内联定义**（1.0.24 不再 import `@anthropic-ai/sdk`）。

## 1. 完整公开 API 面（npm 包 .d.ts/exports）

### 1.1 exports map（`package.json`，1.0.24）
仅两个公开子路径：
- `.` → `dist/index.d.ts` / `dist/index.js`
- `./protocol` → `dist/protocol/index.d.ts` / `dist/protocol/index.js`

（1.0.0 曾暴露 `.`/`./embed`/`./bridge`/`./browser`/`./protocol`；1.0.24 **已收窄为仅 `.` 与 `./protocol`**，`dist` 下已无 embed/bridge/browser 目录。）

### 1.2 主入口 `.` 运行时导出（`dist/index.d.ts` 实测）
- **`query()`**——README 原文："query() is the only query entry point"。签名（`dist/query/query.d.ts`）：
  `query(params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }): Query`，`Query extends AsyncGenerator<SDKMessage, void>` 并带控制方法（`interrupt`/`setModel`/`getAvailableModels`/`streamInput`/`close` …）。
- `startup()` / `StartupParams` / `WarmQuery`——预热。
- 传输层：`ProcessTransport`、`WorkerTransport`、`resolveQoderWorkerRuntimePath`、`hasResolvableQoderWorkerRuntime`、`DEFAULT_RUNTIME_TRANSPORT`。
- 鉴权：`accessToken`/`accessTokenFromEnv`/`jobToken`/`qodercliAuth`/`serviceAccount`/`serviceAccountFromEnv`、`DEFAULT_ACCESS_TOKEN_ENV_VAR`/`DEFAULT_SERVICE_ACCOUNT_ENV_VAR`。
- MCP：`createSdkMcpServer`、`tool`（Claude Agent SDK 同款 in-process MCP server）。
- 会话：`listSessions`/`getSessionInfo`/`getSessionMessages`/`getSubagentMessages`/`listSubagents`/`renameSession`/`tagSession`/`deleteSession`/`forkSession`/`InMemorySessionStore`/`importSessionToStore`。
- 插件：`listPlugins`/`enablePlugin`/`disablePlugin`/`installPlugin`/`uninstallPlugin`/`validatePlugin`。
- 设置/反馈/常量/错误：`resolveSettings`、`submitFeedback`、`WIRE_PROTOCOL_VERSION`、`HOOK_EVENTS`、`EXIT_REASONS`、`AbortError`、`ModelPolicyTimeoutError`、`ProtocolVersionMismatchError`、`UnsupportedCliCapabilityError`、`AuthAccessTokenEnvVarError`、`AuthServiceAccountEnvVarError`、`isBashToolBackgroundLaunchResult`、`coreTypes`、`filterEscalatingDefaultMode`。
- `./protocol` 子路径：wire 协议类型（`SDKMessage` 全集、control 请求/响应、`CustomModel`、hooks、mcp、memory、permissions、`WIRE_PROTOCOL_VERSION` 字面量、`buildQoderCliFlagSettings`…）。runtime 仅发 `WIRE_PROTOCOL_VERSION`，余为 type-only。

### 1.3 模型级 API？——**不存在（事实）**
对 `dist/**/*.d.ts` 全量 grep `streamText|generateText|chat.completions|messages.create|createMessage|\.embed`：**0 命中**。
公开面里所有"模型"相关项都是**控制面（control-plane）**，非调用面（call-plane）：

| 表面 | 文件 | 作用 |
|---|---|---|
| `options.model?: string` | `types/options.d.ts` | 按名选模型（`'auto'`/`'performance'`…） |
| `options.resolveModel?: ModelPolicyProvider` | 同上 | **pull 模式**：CLI 每次调用前问 host 选模型 |
| `options.resolveModelTimeoutMs?`（默认 500） | 同上 | 超时抛 `ModelPolicyTimeoutError`，不静默回退 |
| `options.modelRequestPatches?: ModelPromptPatches` | 同上 | 转发给 model service 做模型感知提示选择 |
| `Query.setModel(model?)` | 同上 | 会话中改模型 |
| `Query.getAvailableModels({fetchStrategy})` | 同上 | 发 `get_models` 控制请求，返回 `ModelInfo[]` |
| `Query.listByokProviders()` / `validateByokModel(input)` | 同上 | BYOK 目录（5min 缓存）/key 校验 |

类型（type-only）：`ModelInfo`、`ModelSource`(`'system'|'user'`)、`ModelStrategy`、`ServerModelJson`、`ModelPromotion`、`ModelContextConfig`、`ModelThinkingConfig`、`ModelEffortEntry`、`ModelUsage`、`EffortLevel`、`ThinkingConfig`；`ModelPolicyProvider`/`ModelPolicyContext`/`ModelPolicyResult`/`SDKCapabilities.modelPolicy:'pull'`；BYOK：`CustomModel`、`BYOKProviderInfo`、`BYOKModelInfo`、`BYOKModelTypeInfo`、`BYOKModelValidationInput`；云：`BetaManagedAgentsModel`、`CloudAgentOptions`、`CloudAgentStreamOptions`。

**关键事实**：`resolveModel` 是"选模型"回调，不是"调模型"API。`dist/types/model-policy-provider.d.ts` 注释原文："the SDK invokes [it] whenever the CLI sends a `get_model_policy` control request **before an LLM call**"。`ModelPolicyResult.model` 可为平台模型 id 字符串，或 `CustomModel & { model: string }`（BYOK 凭据）——"The SDK extracts `model` as the identifier and forwards the rest as `custom_model` on the wire"。**真正的推理调用始终由 qodercli runtime 执行**，SDK 仅在调用前被问"用哪个模型"。

### 1.4 `CustomModel`（BYOK 凭据，`dist/protocol/control.d.ts` L506）
```
type CustomModel = {
  provider: string;   // "openai" | "deepseek" | "kimi" …
  api_key: string;    // 用户第三方 key
  model?: string;     // 第三方模型 id
  url?: string;       // provider base URL override
  style?: string;     // wire format，SDK 默认补 "openai"
};
```
即 host 可让 qodercli 把**某一次 LLM 调用**路由到 host 自己的 OpenAI/DeepSeek/Kimi 兼容端点。**方向是"host 模型灌进 Qoder"，不是"Qoder 模型调出来"。**

### 1.5 直连 Qoder 内置模型？——**无**
所有模型调用经 qodercli runtime（`ProcessTransport` spawn qodercli 子进程，或 `WorkerTransport` 跑 `dist/_worker/qoder-worker-runtime.obf.mjs`——**混淆**、install 时 postinstall 下载、pin `qoderCliVersion 1.1.25`），再转发到 Qoder 后端 model service（按 Credits 计费）或 BYOK 第三方。鉴权必填（PAT/ServiceAccount/qodercli 会话/jobToken），否则 `query()` 抛 `auth_not_configured`。无任何绕开 agent loop 直达模型的导出。

### 1.6 Cloud Agent（备选入口，仍 agent 级）
`dist/cloud-agent/cloud-agent-query.d.ts`：`createCloudAgentQuery(params): Query`——agent loop 跑在 Qoder 云端，仍返回 `Query`（`AsyncGenerator<SDKMessage>`），**不是模型 API**。`experimentalCloudAgent` 标注 `@experimental @unstable`，无 semver 保证。

## 2. 迁移路径分析（前提：只有 `query()`）

"把 Qoder 调用模型的能力迁移到 harness"有两种解读，结论相反：

### 路径 A：包 `query()` 作 harness LLM provider（agent 消息→`ctx.llm` 适配）——**lossy / 不推荐**
- 可行：开 `includePartialMessages:true`、`maxTurns:1`、`disallowedTools`/`allowedTools:[]` 剥离工具、自定义 `systemPrompt`，把 `SDKMessage` 流适配成 harness LLM 流。
- lossy 点：
  1. `query()` 跑**完整 agent loop**（system prompt、tools、skills、hooks、permission、compaction 全在 qodercli 内），拿不到"纯模型 token"；即便 maxTurns=1，qodercli 仍叠加自身编排。
  2. 计费耦合 Qoder Credits（或 BYOK 转 host 自家模型，但那等于绕开 Qoder 模型）。
  3. 无原生 token 级控制（temperature/top_p/max_tokens 仅经 `ModelPolicyResult.parameters` 透传，语义由服务端解释）。
- 判定：名为"用 Qoder 模型当 LLM provider"，实为"用 Qoder 单轮 agent 当 LLM provider"。违背 SDK 设计，不推荐作主 LLM。

### 路径 B：Qoder 作 subagent（harness 委派）——**clean / 推荐**
- harness（`@deepseek-ai/dsh-root`，TS 插件化、vendored Cordis）注册一个 Qoder 插件，内部调 `query()` 委派**整块任务**，harness 自有模型层（DeepSeek 等）不变。
- 语义保真：`SDKMessage` 的 `assistant`/`stream_event` 直接对应 agent 消息（text/tool_use/thinking 块），适配器只做"Qoder agent 消息 → harness agent 消息"映射，不损失 tool-call/reasoning。
- 与 SDK 形态吻合（SDK 本就是 agent 级），风险最低、改动局部于一个插件。

### 路径 C（hybrid）：`resolveModel` pull 模式反转
- 把 Qoder 作 subagent 时同时注册 `resolveModel`，强制 qodercli 用 **harness 指定模型**（含 BYOK 到 harness 自有 OpenAI/DeepSeek 端点）。
- 注意方向：这是"**harness 控制 Qoder 用哪个模型**"，不是"harness 经 Qoder 调模型"。若目标只是借 Qoder agent loop 而 model 自给，此路径有价值；若目标是"调 Qoder 内置模型"，此路径无关。

## 3. tool-call / reasoning 语义能否保真？——**可，但类型松散**

### 3.1 最终消息层（clean，Anthropic 形状）
`SDKAssistantMessage.message: BetaMessage { role:'assistant', content: ContentBlock[] }`（`dist/protocol/messages.d.ts`；`common.d.ts` L53）。
`ContentBlock`（`common.d.ts` L19）字段：`type`(string)、`text?`、`id?`、`name?`、`input?`、`content?`、`source?`、`tool_use_id?`、`is_error?`、`[key:string]:unknown`。
→ `tool_use` 块带 `id`/`name`/`input`，`thinking` 块带 `thinking` 文本——Anthropic 兼容。**最终 tool 调用与 reasoning 作为离散块保真**。

### 3.2 流式增量层（faithful but loosely typed）
`SDKPartialAssistantMessage: { type:'stream_event', event: BetaRawMessageStreamEvent, ... }`（需 `Options.includePartialMessages=true` 才发）。
`BetaRawMessageStreamEvent`（`common.d.ts` L64）：`{ type: string; index?: number; delta?: unknown; content_block?: ContentBlock; message?: BetaMessage; usage?: BetaUsage; [key:string]:unknown }`。
→ 增量事件类型与 delta 形状**故意松散**（`type:string`、`delta:unknown`）。`text_delta`/`input_json_delta`(tool 参数)/`thinking_delta` 数据在 wire 上存在（Anthropic streaming 形状），但**编译期无判别**，适配器须运行时按 `event.type`/`delta.type` 窄化。

### 3.3 映射到 harness `tool-call-delta`/`reasoning-delta`
- text 块/delta → 文本流
- `tool_use` 块 → tool-call（`id`/`name`/`input`）
- `tool_use` 的 `input_json_delta` → tool-call-delta
- `thinking` 块 / `thinking_delta` → reasoning-delta
- 结论：**语义可保真**（数据为 Anthropic streaming 原形），**类型不保真**（SDK 用 `unknown`），适配器需 runtime narrow。远好于"纯文本 lossy 适配"，但非零成本。
- 噪声：`SDKMessage` 还含大量非模型消息（`system/init`、`status`、`api_retry`、`model_queue_status`、`hook_*`、`task_*`、`permission_denied`、`result`、`cloud_agent_event`）。适配器须只挑 `assistant`+`stream_event` 作模型输出，其余作元事件。

## 4. 推荐迁移路径 + 可行性 + 风险

**推荐：路径 B（Qoder 作 harness subagent）+ 流式消息适配器（`includePartialMessages:true`）。**
可行性：**clean**（语义保真、贴合 SDK 形态、改动局部于一个插件）。当前 harness 未依赖该包（实测 `node_modules/@qoder-ai` 不存在），需新增依赖与鉴权配置。

**若目标实为"用 Qoder 内置模型当 harness 主 LLM"：不可干净实现。** SDK 根本不暴露模型级 API；最接近的路径 A 是 lossy 的"单轮 agent 当 LLM"，不推荐作主 LLM。要拿 Qoder 模型 token 流只能跑 agent loop，无纯模型通道。

风险清单：
1. **混淆 Worker runtime**：`dist/_worker/qoder-worker-runtime.obf.mjs` 为混淆产物，install 时下载，pin `qoderCliVersion 1.1.25`；内部不可读，升级可能破坏行为且无 semver 兜底。
2. **计费/账号耦合**：每次模型调用经 Qoder 后端、消耗 Credits（除非 BYOK）。harness 须配 PAT/ServiceAccount，凭据与额度成新依赖项。
3. **协议版本耦合**：`WIRE_PROTOCOL_VERSION` 握手；SDK 与 qodercli 版本错配抛 `ProtocolVersionMismatchError`。
4. **agent-loop 不可剥离**：即便路径 A，qodercli 仍跑完整 agent（hooks/permission/compaction），无法取"纯模型输出"。
5. **流式类型松散**：`ContentBlock.type`/`BetaRawMessageStreamEvent.delta` 均为 `string`/`unknown`，适配器须 runtime 判别，无编译期保护。
6. **Cloud Agent experimental**：`createCloudAgentQuery`/`experimentalCloudAgent` 无 semver 保证。
7. **postinstall 下载**：Worker runtime 在 install 时拉取（需网络）；`QODER_SKIP_DOWNLOAD=1` 可跳过，但需自备 runtime 或 `QODERCLI_PATH` 指向已有 qodercli。
8. **`./protocol` 为唯一旁路**：若想绕 `query()` 直拼 wire 协议，仅有 `./protocol` 暴露类型与 `WIRE_PROTOCOL_VERSION` 字面量，无 runtime encoder，仍需自实现 transport 驱动 qodercli——等价于重写半个 SDK，不划算。

## 5. 一句话结论
SDK 只有 agent 级 `query()`，无模型级 API；模型调用封装在混淆 qodercli runtime + Qoder 后端之后。最干净迁移是**路径 B：把 Qoder 当 harness 的 subagent 插件**，用 `includePartialMessages` 流式适配 `SDKMessage`→harness agent 消息（tool/reasoning 语义可保真、类型需 runtime narrow）。"用 Qoder 模型当主 LLM"无干净路径，路径 A lossy 不推荐。

---
引文/来源：
- npm registry metadata: https://registry.npmjs.org/@qoder-ai/qoder-agent-sdk
- npm page: https://www.npmjs.com/package/@qoder-ai/qoder-agent-sdk
- docs: https://docs.qoder.com/cli
- 包内实测（v1.0.24 tarball）：`package.json`、`README.md`、`dist/index.d.ts`、`dist/query/query.d.ts`、`dist/types/options.d.ts`、`dist/types/messages.d.ts`、`dist/types/model-policy-provider.d.ts`、`dist/types/byok.d.ts`、`dist/protocol/index.d.ts`、`dist/protocol/messages.d.ts`、`dist/protocol/common.d.ts`、`dist/protocol/control.d.ts`、`dist/cloud-agent/cloud-agent-query.d.ts`
