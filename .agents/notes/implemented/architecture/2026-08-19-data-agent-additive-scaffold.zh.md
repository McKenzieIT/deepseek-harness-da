# Agent Note: data-agent additive scaffold over dsh-base

Status: implemented

[English](2026-08-19-data-agent-additive-scaffold.md) | 中文

## 问题

`deepseek-harness-da` 是 `deepseek-ai/deepseek-harness` 的 fork，正被改造成 data agent（自然语言转 SQL 与取数）。data-agent 的能力插件——query、retrieval/向量化、语义层、audit、admin，加上 phase-1 的 `llm-dashscope` 与 `subagent-qoder`——尚未构建，由后续 ticket 交付。此工程仍需一个挂载点，以及一种声明 data-agent 面（禁用的 code-agent 工具集、关掉 Code Mode、无 persona 的提示词基座）的方式，且**不**触碰共享的 `dsh-base` patch、`dsh-app-boot` profile 模板或任何已发布插件源码，以保 fork 干净的上游升级路径。在任一 data 包发布前须先定两件事：data 能力包放在哪、如何解析；data-agent profile 如何**叠加**在 `dsh-base` 之上组合其面。

## 决策

新增 patch-only bundle `@deepseek-ai/dsh-data-agent`，直接叠在 `dsh-base` 之上，镜像 `dsh-base` 的包形态：一份由 `dsh.bundle.patch` manifest 字段声明的 `cordis.patch.yml`、一个无运行时 API 的 `src/index.ts`、一个 noop 的 `src/invariant.ts` companion。它所扩展的 bundle/profile 组合机制归 [profile plugin bundles](2026-08-05-profile-plugin-bundles.md) 决策所有。其 patch 对 code-agent 面是**仅 disable**、对 data 插件是**注释占位**，故即便尚无任何 data 包，该 bundle 今天即可 install 与 load。

`cordis.patch.yml` 按 id 禁用三行 base 行：`tool-str-replace-editor` 与 `tool-ralph`（均 `disabled: true`）、以及 `tools` 行的 `mode: native`（关 Code Mode）——data agent 用不到的编码代理工具。disable 而非 delete，无论 `dsh-base` 日后行序如何重排都成立，与 `dsh-web-app` 把工具移到 preset 背后时用的同一纪律。`tool-pwsh` 不重述：`dsh-base` 自带 `disabled: !!js process.platform !== 'win32'` 已在 POSIX 上 gate off。`tool-bash` 与 `code-runtime` 刻意**不**在此禁用——它们是 data agent 自用的执行后端（shell、pandas 变换），而让业务用户触达不到它们是**内网暴露面**的关注，归后续 ticket，不在此 profile 层。data 插件行是一块注释的 `- insert:`，列出每个计划插件、其 ctx-key、交付它的 ticket；指向未发布包的 active `name:` specifier 会炸 `pnpm install` 与 `verify-cordis-config`，故每行在包发布前保持 inert。data-agent persona 不在此设——归按会话组合的四阶段 preset。

新增 `packages/data/` group 承载随发布而来的 data 能力包。group 注册是 `tsconfig.base.json` 源码路径映射对一个新 group 所需的叠加编辑：`./packages/data/*/src` 加入 `@deepseek-ai/dsh-*` wildcard、`./packages/data/*/src/invariant.ts` 加入 `@deepseek-ai/dsh-*/invariant` wildcard（把包名映射到其源码的通用 wildcard；已有 group 内加包无需编辑，新 group 需要）。新 bundle 加入 `tsconfig.host.json` 的显式 `references`——TS project references 无 wildcard 形式。`packages/README.md` 与 `packages/bundle/README.md` 的表加上其所需的 `data/` 与 `data-agent/` 行；`packages/data/README.md` 列计划包（TBD 名 + ctx key，各标其所属 ticket）。**不**加 `dsh-app-boot` profile 模板：`dsh --profile data-agent` 经 out-of-tree `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` 创建（待四阶段 preset 及其驱动就绪后），故不碰任何 shared boot glue。该 bundle 自身 `package.json` 不声明 `dependencies`（patch 尚不挂载任何东西），仅其 invariant companion 所 import 的 `cordis` 与 `dsh-invariants` peer。

## 验证

`pnpm install` 重整新 workspace 包、无依赖错误——注释行纪律不引入任何 bare specifier。`dsh --profile headless --patch ./packages/bundle/data-agent/cordis.patch.yml --dump-config` 把该层叠在 `dsh-base` 与 `dsh-headless` 上组合、exit 0、无 absent-id 警告；dump 显示 `tool-ralph` 与 `tool-str-replace-editor` 为 `disabled: true`、`tools` 行为 `mode: native`——经 `--patch` 组合时该字面值覆盖 `dsh-headless` 的 `!!js process.env.DSH_TOOLS_MODE` seam。narrow `tsc --noEmit -p packages/bundle/data-agent/tsconfig.json` 对 `vendor/cordis` 与 `runtime-diagnostics/invariants` 引用做类型检查。pre-commit `verify-translation-pairing` 钩子对两份双语 README 通过；`gen-module-graph` 为新包刷新了 `docs/module-graph.md`。

## 备选方案

- **镜像 `dsh-headless` 的可运行一次性 bundle（startup provider + runner）。**驱动 data agent 的四阶段 preset 未建，runner 会固化一个 runtime 契约（`appExit`、agent 创建、task positional）而 preset 日后会重塑它——premature 且注定重写。可运行性是"与 driver 组合"，而非 `dsh-data-agent` 自持 runner。
- **在 `dsh-app-boot` 加 `data-agent` profile 模板（`PROFILE_TEMPLATES`）。**仅 `web` 与 `headless` 以模板发布，而叠在无 driver 的 patch-only bundle 上的 `data-agent` 模板只能 idle 启动。加它要改 shared boot glue 且与上游 merge 冲突；out-of-tree `dsh plugin --profile data-agent add` 路径不动安装即可建 profile。
- **现在就写 data 插件的 active `- insert:` 行 + 建 stub 包。**指向未发布包的 bare specifier 炸 `pnpm install` 与 `verify-cordis-config`，且 stub 包会固化后续 ticket 才拥有的契约。注释占位给每个所属 ticket 其挂载点，且不留 load-time 谎言。
- **在此 bundle 禁用 `tool-bash` 与 `code-runtime`。**data agent 用它们作执行后端（shell；pandas 变换，含报告/Excel 生成）；对业务用户的 gate 是内网暴露面工具门禁、归后续 ticket，不在此 profile 层。bundle 层禁用是在错层移除 agent 自用工具。
- **在 bundle 设 data-agent persona。**四阶段 preset 按会话拥有 persona；bundle 占位会被 preset 重写、且越界其归属。
- **按包配 tsconfig wildcard 而非 group wildcard。**无必要：通用 `./packages/data/*/src` wildcard 一加入即映射新 group 下每个包；唯 group 自身需叠加 wildcard 条目，`tsconfig.host.json` 的 TS project references 仍按包显式。

## 后果

- data-agent 面（code-agent 禁用、Code Mode 关、persona 延后）以**零改** base/core/app-boot/插件源码/profile 模板的方式叠加在 `dsh-base` 之上建立——fork 的上游升级路径保持干净。
- 后续 data 能力 ticket 取消其预留行的注释并填包 `name:` 即可挂载；group wildcard 已解析其源码，bundle 已在 host 聚合的 `references` 里。
- 该 bundle 今天可 load，且能与 driver 正确组合（经 `--patch` 叠 `headless`），故脚手架在任一 data 插件发布前即可观测。
- `tool-bash` 与 `code-runtime` 在 bundle 层保持启用；它们对业务用户的暴露是单独的、后续内网工具门禁决策。`code-runtime` 尚未挂载（base 不 insert 它）——待四阶段变换阶段落地时挂。
- 报告/Excel 产物交付作为单独设计项浮出：文本报告走 `tool-fs` `write`（mutation 工具，保留）；但二进制产物（Excel、PDF）不能用 `tool-fs` 或 `tool-str-replace-editor`（两者仅 UTF-8 文本），需 `code-runtime`（pandas）加交付机制（复用 `ctx.attachments` 或专用 export 工具），归后续 ticket。
