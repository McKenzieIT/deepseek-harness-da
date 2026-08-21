# DashScope 作为默认 profile 的 LLM —— 插件化方式（无 --profile / 无 settings 外科手术）

**Status**: Resolved（2026-08-21，wayfinder grilling+task session）
**Type**: grilling + task
**Phase**: misc

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

**Resolved 2026-08-21 — option (a)：重命名 llm-dashscope 路由 `dashscope`→`aga`。** 给 llm-dashscope 一个不冲突的路由名 → 插件自包含（挂上即得 working DashScope provider，无与 llm-pi-ai broken `dashscope` 的路由冲突）→ 默认 profile 经插件 + `agent-default-model: aga/...` 即 da-native，不加 `--profile`、不 settings 外科手术、不碰 dsh 源码。

**4 grilled 决策**（grilling + domain-modeling，HITL）：
1. **路由名 = `aga`**（候选 aga / dashscope-native / dashscope-aga / qwen-aga → 取 aga：最短、路由名基本内部、UI 标签 displayName 'DashScope' 不变、无 pi-ai catalog 冲突）。
2. **坏 llm-pi-ai `dashscope` fate = 维持已删**（不回填 `.bak-llmfix`）：坏 dashscope 是 misconfiguration（openai-completions 打非 OpenAI 网关→404），回填=重新引入 footgun；改名（aga）后删除已非依赖（路由名不冲突→默认照常 work），UI 仅 1 个干净 'DashScope' 条目。
3. **默认模型 = `qwen3.7-max`**（settings + bundle agent-default-model）。
4. **harness 对 refused 路由静默不告警** = 真 robustness 漏洞，但超本 map additive-only（修复需改 dsh-llm registry core）→ 记 map **Out of scope**（非 route 票；改名后非阻塞）。

**实现**（additive，仅 da 包 + `~/.dsh`，不碰 dsh 源码）：
- `packages/llm/llm-dashscope/src/index.ts`：`PROVIDER='dashscope'`→`'aga'`（+ `:2` doc；displayName 'DashScope' 不变；`name`/`NS`/`@module`/`x-dashscope-harness-*` headers/`llm-dashscope:` 错误前缀/rbi `dashscope.py` 引用皆非路由，不动）。
- `packages/llm/llm-dashscope/tests/{serialize.spec,adapter.spec,adapter.e2e,assemble}.ts`：~15 处 quoted `'dashscope'`→`'aga'`（`name:'DashScope'` 断言不动）。
- `packages/bundle/data-agent/cordis.patch.yml`：`agent-default-model` → `aga`/`qwen3.7-max`（+ 注释）。
- `~/.dsh/settings.yaml`：`agent-default-model` → `aga`/`qwen3.7-max`（drop `reasoningEffort`——native AGA 无 per-request thinking knob；保留 llm-pi-ai 仅 `zai-coding-cn` 删除态；备份 `settings.yaml.bak-agafix`）。
- dsh-web-app bundle 按包名挂 llm-dashscope（L454，对改名透明）；Models UI 动态读 directory（无 UI 代码改动）。

**verify**：scoped `tsc -b` ✅ + `vitest` 75/75 ✅ + `tsdown --env.DSH_BUILD_FACE host` 绿（`lib/index.js` 重建 `PROVIDER="aga"`）+ `dsh web`（默认 profile）boot HTTP 200 + headless `Reply with exactly one word: PONG`→`PONG`（exit 0，via `aga`/qwen3.7-max，native AGA，key 经 credentials seam）+ AGA `GET /api/v1/models` 200 + 10 模型（含 qwen3.7-max、无 embeddings——印证 T2）。
- **注（诚实）**：全 `pnpm run build`（含 `.dsh-build` record）当前 RED，但**仅因并发会话 WIP**（`tool-load-table-definition`+`tool-load-event-definition` untracked/未完成 tsconfig.host 接线 + `rescope-fork.spec` TS2532），**非本改动**（build log llm-dashscope 0 错；scoped tsc + vitest 绿）；tsdown 打包半段绿→`aga` lib 已部署、dsh web/headless 验证通过。全 build 绿待并发会话收尾后自验（非本票 scope）。

**取代 in-env 过渡解**：本改名使 `*.bak-llmfix` 外科手术（删 llm-pi-ai `dashscope`）不再必需——改名后无路由冲突，默认 profile 纯插件化用 DashScope。`~/.dsh/{settings.yaml,profiles/{headless,web}/cordis.patch.yml}.bak-llmfix` 备份保留作历史。

〔map Decisions + Out-of-scope ② 已更新；相关：`data-agent-conversation-readiness.md`（LLM-wiring follow-up → 本票 resolved）、`2026-08-21-verification-audit.md`〕
