# Qoder Agent SDK — TypeScript 集成可行性研究

> 目标：核实 Qoder 是否有 TS SDK，以及 deepseek-harness-da（TS 插件式 agent harness，基于 vendored Cordis）能否经 TS（非 Python）集成 Qoder 的 LLM。同时判定 `python/` 是否仍需保留。
> 方法：官方站（qoder.com/agent-sdk 中英文版）、npm registry 元数据 + README、本地 harness 源码（packages/llm、python/sdk）。事实与推断已区分。
> 日期：2026-08-19

---

## 1. Qoder 是什么

Qoder（发音 /ˈkoʊdər/，谐音 "Coder"）是阿里巴巴于 2025-08-22 发布的 **Agentic Coding Platform**，由通义灵码（Lingma）演进而来（2026-05-20 更名为 Qoder）。三种形态：Qoder IDE、Qoder CLI（npm `@qoder-ai/qodercli`，对标 Claude Code）、JetBrains 插件；另有 **Cloud Agents**（全托管 Agent 运行时平台，2026-05-28 上线，经 API 定义 Agent / 启动 Session）。
- 官网：https://qoder.com/  ；中国站 https://qoder.com.cn/
- Agent SDK 页：https://qoder.com/agent-sdk（中：https://qoder.com/zh/agent-sdk）
- Cloud Agents：https://qoder.com/cloud-agents
- 底层模型：基于阿里 Qwen 编程大模型，但 Qoder 自身做"模型智能路由"。
- 公司实体：SDK 页脚 © 2026 **BRIGHT ZENITH PRIVATE LIMITED**（媒体报道多归因阿里；当前 SDK 运营实体为 Bright Zenith）。如实记录此差异，不影响技术结论。

## 2. Qoder 有 TypeScript SDK 吗 —— 有（已核实）

官方 Agent SDK 页（中英文版一致）明确：

> "TypeScript · Node.js 18+  `npm install @qoder-ai/qoder-agent-sdk`   Python · 3.10+  `pip install qoder-agent-sdk`"

npm registry（https://registry.npmjs.org/@qoder-ai/qoder-agent-sdk）核验：
- 包名 `@qoder-ai/qoder-agent-sdk`，最新版 **1.0.24**
- description: "TypeScript SDK for building Qoder-powered coding agents."
- engines: `node >=18`；homepage: https://docs.qoder.com/cli
- dependencies: `@modelcontextprotocol/sdk ^1.27.1`；peerDependencies: `zod ^3.25||^4`
- 仓库字段为 None（未在 npm manifest 公开 GitHub 仓库地址）；未发现独立 GitHub 仓库链接
- 安装时 postinstall 下载 Worker runtime（`dist/_worker/qoder-worker-runtime.obf.mjs`）；可 `QODER_SKIP_DOWNLOAD=1` 跳过

结论：**Qoder 官方 TS SDK 存在且活跃（1 天前更新至 1.0.24），人类判断正确。** 同时存在 Python 版（`pip install qoder-agent-sdk`），但与本题（TS 集成）无关。

## 3. Qoder 的 API 形态 —— 是 Agent Harness，不是 OpenAI 兼容 LLM API

这是最关键的发现，决定集成方式。npm README + 官网页一致表明：

- 入口是 **`query({ prompt, options })`**，返回 **agent 消息的异步迭代器**（`for await (const message of q)`），消息 `type: "assistant"`，内容为 `{type:"text", text}` 等块。形态接近 ACP / Claude Code 消息协议，**不是 OpenAI chat completions**。
- SDK 的工作方式：**替你启动 `qodercli`**（ProcessTransport）或 Worker runtime（WorkerTransport，默认），把 agent 消息流回 Node.js。提供与 Qoder CLI 相同的"任务规划 / 工具调用 / 上下文管理 / 权限管控 / 会话记忆"。
- 认证：PAT（`QODER_PERSONAL_ACCESS_TOKEN`）、Service Account（SAT，`serviceAccount({ fetchServiceAccountToken })`）、或本地 `qodercli` 会话（`qodercliAuth()`）。
- **模型层被 SDK 内部抽象**，原文：
  > "内置十余款最热门模型……配置层即可切换，**无需自行对接模型 API**；……亦可接入自有模型服务并使用自有账号计费。"

  即：模型路由是 SDK/CLI 内部管理的配置层，**SDK 不暴露原始 chat completions / token 流 / tool_calls / reasoning_content 的模型端点**。"接入自有模型服务"是反向的——你把自有模型接入 Qoder 的 harness，而非从外部调用 Qoder 的模型。
- Cloud Agents API 同理："定义 Agent、启动 Session、经 API 运行……SSE 流式返回每一步 reasoning / tool call / output"——是 **agent/session API**，不是裸模型 API。
- **未找到任何公开的、OpenAI 兼容的"Qoder 模型端点"**。多次检索（"Qoder model API OpenAI compatible chat completions reasoning_content"）只命中 DashScope（百炼）/ Qwen Cloud 的 OpenAI 兼容接口，与 Qoder 无直接关系。

事实小结：Qoder 把"模型"封装在 agent harness 内部；它**对外只有 Agent 级 API，没有 LLM 级 API**。

## 4. TS harness 能否经 TS 集成 Qoder —— 能，但不在 `llm-*` seam

### 4.1 本地 harness 的 LLM seam（事实，源码核验）

`packages/llm/llm/README.md` 确认 `ctx.llm`（`LlmRuntime`）的契约：
- `ctx.llm.registerAdapter(providers: string[], adapter: LlmAdapter)` + `ctx.llm.stream(options: GenerateOptions): AsyncIterable<StreamChunk>`
- 流式 chunk 协议：`block-start` / `text-delta` / **`reasoning-delta`** / **`tool-call-delta`** / `block-end` / `usage` / `finish`
- `GenerateOptions`：`provider`、`model`、`reasoningEffort`、`temperature`、`maxTokens`、`stop`、`purpose`
- 抽象基类 `LlmAdapter`，唯一必需方法 `stream()`；适配器发带 app attribution 头的 **HTTP 请求**、API key 走 HTTP header
- 两个真实适配器：`llm-deepseek`（直接 fetch + `eventsource-parser` SSE，`deepseek-official` 路由，wire 为 OpenAI 兼容，含 `reasoning_effort` / `thinking.type`）；`llm-pi-ai`（经 `@earendil-works/pi-ai` 动态解析 provider/model）
- 路由名约定：`llm-deepseek` 持有 `deepseek-official`，`llm-pi-ai` 持有 `deepseek`，可并存

即：`ctx.llm` 是 **chat-completions / token-streaming** seam，期望适配器从**模型端点**产出 `text-delta`/`reasoning-delta`/`tool-call-delta`。

### 4.2 匹配判定（推断，基于 4.1 + 第 3 节）

把 `@qoder-ai/qoder-agent-sdk` 套进 `llm-qoder`（`LlmAdapter.stream()`）**是错位**的：
- Qoder SDK 产出的是 **agent 消息流**（整段 agent loop 的输出：自带工具调用、自带权限、自带上下文管理），不是 token 级 delta。
- 硬适配成 `text-delta` 只能把 Qoder 的 agent 文本切块回灌，**丢失 harness 自己的 tool-call/reasoning 语义**，且等于在 harness 的 agent loop 里再嵌一个 Qoder agent loop（两个 harness 争夺工具/上下文/权限），架构上不连贯。
- Qoder SDK 不暴露裸模型端点，无法像 `llm-deepseek` 那样直接 fetch SSE。

### 4.3 两条可行路径

**路径 A —— 真正的"llm-qoder"模型 Provider（推荐用于模型访问）**
若目标是"用 Qoder 底层模型（Qwen 编程模型）"在 `ctx.llm` seam 产出 streaming tokens + tool_calls + reasoning：**不要用 Qoder SDK**，而是新建 `llm-dashscope`（或 `llm-qwen`）`LlmAdapter`，走阿里百炼（DashScope）的 **OpenAI 兼容端点**（`https://dashscope.aliyuncs.com/compatible-mode/v1`），完全镜像 `llm-deepseek` 的 fetch + `eventsource-parser` SSE 模式。百炼对 Qwen 深度思考模型支持 OpenAI 兼容 Chat Completions（含 reasoning / thinking）（https://help.aliyun.com/zh/model-studio/deep-thinking、https://help.aliyun.com/zh/model-studio/deepseek-api）。纯 TS，零 Python。**但这是"Qwen via DashScope"，不是"Qoder"，命名应澄清。**

**路径 B —— Qoder Agent 能力桥接（推荐用于 agent 委派）**
若目标是"把子任务整包委派给 Qoder 的 agent harness"：`pnpm add @qoder-ai/qoder-agent-sdk`，新建 `packages/subagent/subagent-qoder`（或 `packages/extensions/` 下的 agent-bridge，**不**放 `packages/llm/`），调用：
```ts
import { qodercliAuth, query } from "@qoder-ai/qoder-agent-sdk";
const q = query({ prompt, options: { auth: qodercliAuth(), cwd, systemPrompt, maxTurns, allowedTools, permissionMode } });
for await (const m of q) { /* 把 Qoder agent 消息翻译成 harness 自己的 subagent/ACP 协议 */ }
```
TS 原生、无需 Python。形态类似"subagent-qoder"，与现有 `llm-deepseek`/`llm-pi-ai` 同级但**不同层**（agent 桥，非 llm 适配器）。

**结论 4**：Qoder TS SDK 存在、可经 TS 集成（路径 B 现成可用）；但**不能干净地落到 `llm-qoder` 这个 `ctx.llm` chat-completion Provider 槽位**——Qoder 不暴露模型流。若坚持要"llm-qoder"产出 token/tool_call/reasoning，实际应走路径 A（DashScope/Qwen，OpenAI 兼容），而非 Qoder SDK。

## 5. 对 `python/` 的影响

本地 `python/sdk/README.md`（事实）：`python/` 是 **DeepSeek Harness Python SDK**——一个 **Python 子进程客户端**，经 JSON-RPC stdio 驱动 TS harness（启动打包好的 `dsh-jsonrpc-agent` 可执行文件）。它**不是** Python 版 harness，**也不是** Qoder 的 Python SDK。`provider` 参数只是 Cordis 组合里注册的某条路由（默认 `deepseek-official`，可挂 `llm-pi-ai`）。

推论：
- Qoder 集成（无论路径 A 还是 B）**纯 TS 即可**，不依赖 `python/`，也不依赖 Qoder 的 Python SDK（`pip install qoder-agent-sdk` 是另一个东西，与本题无关）。
- 若 eval 迁 TS（`packages/eval/`）、harness 本体 TS、Qoder 经 TS 桥接，则仓库内唯一剩余的 Python 即 `python/` 客户端 SDK。**是否保留 `python/` 是产品策略问题**（有无 Python 生态消费者需从 Python 调 harness），**不**由 Qoder 决定推动。Qoder 决策本身**不强制**丢弃 `python/`；丢弃它应是独立、由消费者需求驱动的决定。
- 注意：路径 A（DashScope/Qwen）若落地，`python/` 消费者只需把 `provider` 指向新路由（如 `qwen-official`）即可受益，无需改 Python 侧。

## 推荐

1. **不要把 Qoder TS SDK 塞进 `llm-qoder` 作为 `LlmAdapter`**。它不是模型流，硬适配会丢 tool-call/reasoning 语义且产生双 harness 嵌套。
2. **若要"经 Qoder 底层模型"做 LLM 访问（P0 llm 通路）**：走路径 A，新建 `llm-dashscope`/`llm-qwen`（OpenAI 兼容，镜像 `llm-deepseek` 的 fetch+SSE）。命名别叫 `llm-qoder`，因为它不是 Qoder。
3. **若要"Qoder 的 agent 能力"**：走路径 B，`@qoder-ai/qoder-agent-sdk` 作 subagent/agent-bridge（非 `packages/llm`），TS 原生。
4. **`python/` 保留与否**与 Qoder 无关；按 Python 消费者需求单独决策。

## 引用

- Qoder Agent SDK（官方页，中）：https://qoder.com/zh/agent-sdk
- Qoder Agent SDK（官方页，英）：https://qoder.com/en/agent-sdk
- Qoder Agent SDK（npm registry 元数据 + README）：https://registry.npmjs.org/@qoder-ai/qoder-agent-sdk
- npm 包页：https://www.npmjs.com/package/@qoder-ai/qoder-agent-sdk
- Qoder CLI（npm）：https://www.npmjs.com/package/@qoder-ai/qodercli
- Qoder Cloud Agents：https://qoder.com/cloud-agents
- Qoder 官网：https://qoder.com/ ；中国站 https://qoder.com.cn/
- DashScope OpenAI 兼容（Qwen 深度思考）：https://help.aliyun.com/zh/model-studio/deep-thinking
- DashScope OpenAI 兼容（DeepSeek API）：https://help.aliyun.com/zh/model-studio/deepseek-api
- 阿里 Qoder 发布背景（腾讯云社区）：https://cloud.tencent.com/developer/article/2595927
- 本地 harness LLM seam：/Users/mckenzie/workspace/deepseek-harness-da/packages/llm/llm/README.md
- 本地 DeepSeek 适配器（provider 形态参考）：/Users/mckenzie/workspace/deepseek-harness-da/packages/llm/llm-deepseek/README.md
- 本地 Python 客户端 SDK：/Users/mckenzie/workspace/deepseek-harness-da/python/sdk/README.md 、 /Users/mckenzie/workspace/deepseek-harness-da/python/README.md

## 诚实声明

- Qoder 的 npm manifest 未公开 GitHub 仓库字段（`repository: None`）；未找到独立开源仓库。SDK 的 Worker runtime 是混淆 `.obf.mjs`，源码非完全开放。
- 未找到任何公开的 OpenAI 兼容"Qoder 模型端点"；基于官方营销文案（"无需自行对接模型 API"）与 SDK 实际形态判断其**不对外暴露裸模型 API**——此为基于证据的强推断，非官方否定声明。
- "Bright Zenith / 阿里"归属差异来自媒体与页脚版权，未深入核验公司架构，不影响技术结论。
