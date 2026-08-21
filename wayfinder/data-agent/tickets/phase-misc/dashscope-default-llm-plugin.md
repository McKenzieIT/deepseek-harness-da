# DashScope 作为默认 profile 的 LLM —— 插件化方式（无 --profile / 无 settings 外科手术）

> 背景：2026-08-21 验证 sweep。dsh 主旨 = 一切接插件——DashScope 应经插件机制让默认 profile 开箱用，不靠 `--profile` 或 settings 改动。

## 背景

`pnpm dsh web`（默认 web profile = dsh-base + dsh-web-app）已挂 `llm-dashscope`（dsh-web-app patch L454），但 settings `agent-default-model: dashscope` 路由到 **llm-pi-ai 的 `dashscope` provider**（`api: openai-completions` 打 AGA native 网关 → 404；P2 live-probe 证伪 OpenAI 兼容）。harness 的 `ctx.llm.registerAdapter` 对**重复路由静默让先注册者保留、拒绝后注册者**（`packages/llm/llm-pi-ai/src/index.ts`：「a conflicting route leaves the previous routes serving」+ registerConfigurableProviders「a collision keeps the previous entries serving and only costs a diagnostic」）→ llm-dashscope（base 之后挂，后注册）的 `dashscope` 路由被拒 → 调用走 llm-pi-ai → 404（`PI_AI_ERROR`）。

**本次 in-env 解**（durable，备份 `*.bak-llmfix`，**未入 repo**）：headless `cordis.patch.yml` insert `llm-dashscope` + `~/.dsh/settings.yaml` 删 `llm-pi-ai.providers.dashscope`（外科式、留 `zai-coding-cn`）；web profile 靠 dsh-web-app 自带 `llm-dashscope` + 同一 settings 改动。**证**：headless `Reply with PONG`→`PONG`（da `llm-dashscope`，AGA native，key 经 credentials seam）；web HTTP 200 同套 wiring；AGA `/api/v1/models` 200 + 10 模型。

但：① 每次 `dsh --profile data-agent` 麻烦；② settings 外科手术非"一切接插件"原则；③ harness 对 refused 路由静默不告警 = robustness 漏洞（上游 dsh 行为）。

## Question

如何让**默认 profile**（`dsh web`/`dsh`，不加 `--profile`）经**插件机制**用上 DashScope（native AGA），且 **additive-only、不碰 dsh 源码**、不靠 settings 外科手术？核心 = 解 llm-pi-ai `dashscope`（broken，openai-completions）与 llm-dashscope `dashscope`（native AGA）的**路由名冲突**。

## Options（grilling）

- **(a) 重命名 llm-dashscope 的 provider 路由** `dashscope` → `aga`（或 `dashscope-native`）。da 代码改：`packages/llm/llm-dashscope/src/index.ts` 的 `PROVIDER` 常量 + `registerConfigurableProviders`/`registerAdapter` 用新名；data-agent bundle `agent-default-model: dashscope/qwen-plus` → `aga/qwen-plus`；用户 settings `agent-default-model: dashscope/...` → `aga/...`。**无冲突**（llm-pi-ai 的 `dashscope` 与 llm-dashscope 的 `aga` 不同名）→ 挂 llm-dashscope 插件即得 working DashScope provider，`dsh plugin --profile <p> add @deepseek-ai/dsh-llm-dashscope` 到任意 profile 即用，默认 profile 设 `agent-default-model: aga/...` 即 `dsh web` 开箱用 da-native。**最贴合"一切接插件"**：插件自包含（挂上即得 working provider，无冲突），不碰 dsh 源码、不靠 settings 外科手术、不需 `--profile`。Trade-off：broken 的 llm-pi-ai `dashscope` 仍留 Models UI（用户可经 UI——现已 work——删掉，或留着不选）；命名变化波及 settings/bundle/UI 显示，需 codemod/迁移说明。
- **(b) 一个 "DashScope-config" 插件/bundle**，用户 `dsh plugin add` 到默认 profile：挂 llm-dashscope + 设 agent-default-model + disable llm-pi-ai 的 `dashscope`。但 llm-pi-ai 的 providers 是 **settings-driven**（`installSettingsSection` 的 `setSource` 把 cordis 行 config 换成 settings 源）→ cordis patch **不能外科式删 settings 里的 `dashscope` provider**；只能 `- id: llm-pi-ai disabled: true`（丢 `zai-coding-cn`）。Trade-off：丢 zai-coding-cn（data-agent 用 AGA 故可接受，但 web profile 的 code-agent 可能要 zai-coding-cn）。
- **(c) data-agent bundle 作默认 profile 插件**（`dsh plugin --profile web add @deepseek-ai/dsh-data-agent`）→ bundle 已有 llm-dashscope + `agent-default-model: dashscope/qwen-plus`（committed）；仍需 (b) 的冲突处理（disable llm-pi-ai 或 (a) 重命名）。= 把整个 data-agent 能力（含 disable code-agent surface）塞进 web profile。重；但若用户就是要在 web 用 data-agent，这是正路。
- **(d) llm-dashscope 经 `installSettingsSection` ship 一个 settings 默认**覆盖 llm-pi-ai 的 `dashscope`？大概率不可行——settings namespace 隔离（llm-dashscope 的 `NS` ≠ llm-pi-ai 的 `NS`），一个插件的 settings section 不能覆盖另一 namespace 的 settings。需验。

## 推荐

**(a) 重命名** 最贴合"一切接插件"：llm-dashscope 插件自包含（挂上即得 working DashScope provider，无冲突），用户 `dsh plugin add` 到默认 profile + 设 `agent-default-model: aga/...` 即用，不碰 dsh 源码、不靠 settings 外科手术、不需 `--profile`。broken 的 llm-pi-ai `dashscope` 留作用户可选项（UI 现已可删）。grilling 须定：① 新路由名（`aga` vs `dashscope-native` vs `qwen-aga` ...）；② 是否同时让 harness 对 refused 路由 warn（上游 dsh——非本 ticket scope，但相关 robustness，可单开 ticket 指向 core）；③ 现有 settings/bundle 的 codemod 迁移路径。

## Resolution

未解——本 ticket 立 design 问题 + 4 选项（推荐 a）。in-env 解（删 settings `llm-pi-ai.providers.dashscope` + headless 挂 `llm-dashscope`）作过渡 working state 保留（durable，备份 `~/.dsh/{settings.yaml,profiles/headless/cordis.patch.yml}.bak-llmfix`）。〔相关：`data-agent-conversation-readiness.md`（剩余 wiring + 工具包）、`2026-08-21-verification-audit.md`〕
