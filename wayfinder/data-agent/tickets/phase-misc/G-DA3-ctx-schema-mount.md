# G-DA3 — ctx.schema 挂载：data-agent profile vs web-app bundle patch vs preset-mount

**Type**: grilling
**Phase**: misc
**Status**: resolved (2026-08-21, 乙 landed + grounding verified — web-app bundle 挂 semantic-layer+query-engine+scope-registry；e2e K11 DAU search 返非空候选 + load_* 成功 + route:proceed；problem 2 FIXED。剩余 blocker = credentials（→P4d）+ present_*（deferred）。)
**Graduated from**: problem 2 修复（`search_data_sources` 恒空）——corpus 激活代码已落（data-agent bundle 解注释 semantic-layer，commit 433a9440d3），但 web profile 没用上。

## Question

`search_data_sources` 在 web 下恒返空（`ctx.schema` 未挂 → 空 `Bm25Linker` → "No matching data sources found."）。怎么让运行中的 profile 挂 `ctx.schema`（+ `ctx.query`）使 data-agent 模式有 grounding？

## 现状（事实，2026-08-21 e2e dump-config 确认）

- data-agent bundle（`packages/bundle/data-agent/cordis.patch.yml`）已解注释 `semantic-layer`+`query-engine`+`audit`+`nl2sql`+`identity`+`llm-dashscope`（commit 433a9440d3）。
- 但该 bundle 只在 **data-agent profile**（out-of-tree，`dsh plugin --profile data-agent add`）下生效。
- `dsh web` = web-app bundle（`packages/bundle/web-app/cordis.patch.yml`），**不挂** semantic-layer/query-engine（只挂 llm-dashscope + UI）→ `ctx.schema`/`ctx.query` undefined → search 空。
- 光在 web UI 选「取数模式」preset **不够**——preset 只挂 phase-gate+4 工具（agent-plane），不挂 ctx.schema（host-plane，来自 bundle）。
- 权威：`apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md`——「host capability the preset consumes」是 canonical pattern；llm-dashscope 即此范式（web-app bundle host 插件、agent 消费 `ctx.llm`）。

## 三方案

### 甲：data-agent profile（用户建）
- 一次性 `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` → 建独立 profile，套 data-agent bundle（已挂 semantic-layer+query-engine，commit 433a9440d3，**不改代码**）。
- 启动 `dsh --profile data-agent web`（带 -profile）；或 `~/.dsh/settings.yaml` 设默认 profile=data-agent（一次设、`dsh web` 默认 data-agent；但 coding 用 standard 要 `--profile web`）。
- **优**：干净隔离（data 插件只在该 profile，web standard/coding 不碰）；data-agent bundle 正路；不改代码。
- **缺**：-profile 摩擦（或设默认、工作流偏移）；`~/.dsh` agent 够不着、用户建；与 `dsh web` 不同 runtime。

### 乙：web-app bundle patch（agent 改）〔lean〕
- 改 `packages/bundle/web-app/cordis.patch.yml` 加 `semantic-layer`+`query-engine` 的 insert 行（**= llm-dashscope 范式**：host 插件、preset 经 `ctx.get` 消费）。
- `dsh web`（无需 -profile）即挂 → web 下 data-agent 模式 search 有 grounding。
- **优**：**canonical dsh 插件范式**（host capability + preset consumes，= llm-dashscope；**非「不纯」，是 THE pattern**）；不用 -profile；agent 可落（repo 2 行 insert）；简+稳（web + data-agent profile 都能用）。
- **缺**：data 插件对所有 web 会话**注册**（同 llm-dashscope）；但语料**懒加载**（仅 data-agent 工具调 `ctx.get('schema')` 时载、coding 不调）→ 代价≈llm-dashscope（轻）。

### 丙：preset-mount in isolate realm（更纯但更险）
- 把 semantic-layer+query-engine 挂进 **data-agent preset 自己**（`agent.cordis.yml`），与工具 consumer 一起包进一个 isolate realm group（像 standard 的 `delegation` group 把 workflow provider+consumer 包一起）→ 「取数模式」选中才挂、不污染 web、不用 -profile。
- **优**：preset 自包含、data 插件仅取数模式挂、不污染 web、不用 -profile。
- **缺**：① 要重构 preset（provider+工具 consumer 包进 isolate realm group，非小改）；② **与 data-agent profile 冲突**（其 bundle 已 host-side 挂 semantic-layer → 两实例/`ctx.get('schema')` 解析歧义）→ 丙只 web-profile 可用；③ 要 mount-validate（`standingKeyFor`）确认 `ctx.get('schema')` 在 realm 内解析（SKILL.md：「A consumer left outside the group resolves the host's registry, which the preset did not populate」——须 provider+consumer 同 group）。

## 我的 lean

**乙**（web-app bundle patch）——canonical 插件范式（= llm-dashscope）、不用 -profile、懒加载低代价、agent 即落、简+稳。**丙是「preset 自包含」更纯变体但需 spike**（重构+realm 验证+只 web 可用+与 data-agent profile 冲突）。**甲隔离最干净但要 -profile + 用户建**。

若用户：要最快 `dsh web` 测通 + 不改启动 → **乙**；要 preset 自包含纯度 + 可接受 spike/只-web → **丙**；要干净隔离 + 可接受 -profile → **甲**。

## 依据

- 根因：`../../research/2026-08-21-conversation-pipeline-root-causes.md` §2。
- bundle 现状：`packages/bundle/{data-agent,web-app}/cordis.patch.yml`。
- composition 权威：`apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md`（planes/realm/host-capability-preset-consumes）。
- e2e 确认 web 下 ctx.schema 未挂：2026-08-21 e2e（dump-config 506 行，semantic-layer/query-engine 均 NO）。

## Out of scope

- present_* 交付工具 ship（→ 既有 `present-delivery-tools.md` deferred）。
- critic 工具 ship（P-DA2 已放宽 generationGate，critic 未注册时靠 folded sqlSyntaxGate，非硬门）。
- 并发 test 文件 host-tsc 修复（scope-registry/semantic-layer/tool-load-*/tool-retrieve/query-tool/rescope-fork，并发会话）。
