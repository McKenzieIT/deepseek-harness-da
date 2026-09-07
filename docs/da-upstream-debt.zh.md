# da 上游债务登记册

[English](da-upstream-debt.md) | 中文

> 来自 `da-plugin-development-guidelines` 合规审计（2026-08-22）的已跟踪债务。 > 每条记录都对应一个 da 当前修改 dsh 拥有源码、或带有 fork 内反模式的位置，记录 > da 需要该能力的原因、计划的解决方案，以及 > 避免与 `upstream` 合并冲突的临时应对方案 > （`deepseek-ai/deepseek-harness`）。
>
> 依据 `docs/da-plugin-development-guidelines.md` 的规则 4.1 / 4.4 / §3.2，da 不得 > 修改 dsh 拥有的 package 源码。以下条目是已知例外——将通过 upstream（或经由 §4.2 > wrapper seam）解决，而非在 fork 内回退。此处的所有 dsh 源码 > 修改均为 **additive / backward-compatible**（可选参数、新的可选 > 字段、新的 type/export）——均非破坏性——因此现有 upstream 调用方与 > provider 仍能通过类型检查。

---

## §1 Upstream-PR 债务（修改了 dsh 拥有的源码）

### D1 — Credentials 的 per-user/scope 寻址

**修改了什么：**

- `packages/credentials/credentials/src/index.ts` — dsh 的 `CredentialProvider` 抽象方法 `resolve` / `describe` / `set` / `unset` / `notifyUpdated` 各自新增了一个可选 `address?: CredentialAddress` 参数；`CredentialAddress` 从 `./types.ts` re-export。
- `packages/credentials/credentials/src/types.ts` — 新增 `CredentialAddress` interface；**修改了现有 `credentials/updated` `SessionEventMap` 成员签名**以新增 `address?`（§3.2 硬边界——修改 `SessionEventMap` 成员需要 declaration-merging = 代码）。
- `packages/credentials/credentials/src/brand.ts` — 在 dsh 的 `credentials/src/` 下新增 **NEW file**，含 `UserId` / `ScopeId` brand 类型 + 工厂函数。
- `packages/credentials/credentials-local/src/index.ts` — `assertOwnerOnly` / `renderDocument` 加上了 `export`（private→public）。

**原因（da 需要的能力）：** da 的每用户/多 scope data-agent 要求 credentials 按 *per user/scope*（一个 `CredentialAddress`）解析、描述和变更，而非仅全局进行。da 拥有的 keychain provider（`credentials-keychain-host`）替代 `credentials-local` 成为 `ctx.credentials`，且必须与 `.credentials.yaml` 保持字节兼容，因此复用了文件格式 helper（`assertOwnerOnly`、`renderDocument`、`parseCredentialsDocument`、`resolveSpec`）。

**违反的规则：** 4.1（修改 dsh 源码）；4.4（修改 dsh Service Definition interface 签名 + vocabulary / typed-event 类型）；§3.2（修改现有 `SessionEventMap` 成员）。

**Upstream PR 计划**（提交至 `deepseek-ai/deepseek-harness`）：

1. 为 `CredentialProvider` 抽象方法新增可选 `address?: CredentialAddress`（additive，非破坏性）——对任何多租户/多 scope 部署都有通用价值。
2. 将 `UserId` / `ScopeId` brand 原语移入 `@deepseek-ai/dsh-brand`（或 `credentials` Service Definition），而非新建一个 dsh 源码文件。
3. 从 `credentials-local` export `assertOwnerOnly` / `renderDocument` / `parseCredentialsDocument` / `resolveSpec`（通用文件格式 helper；`parseCredentialsDocument` / `resolveSpec` 已在 upstream 公开，`assertOwnerOnly` / `renderDocument` 是 da 新增的 export），或把它们抽取到抽象的 `credentials` Service Definition 中，使消费者依赖 seam 而非具体 provider。
4. `credentials/updated` 事件签名变更（§3.2）最难——作为 **单独的架构 PR** 提出（event-member 签名变更不属于 24h-SLA 机械合并范畴）。

**临时应对方案（避免合并冲突）：** 保留当前的 additive 修改。一次 upstream `git merge upstream/master` 只会在被改的方法签名和 `credentials/updated` 成员上冲突——机械解决：保留 da 的可选参数，并入任何 upstream 的函数体改动。新增的 `brand.ts` 文件不会冲突（additive 文件）。在 PR 落地前尽量减少对这些文件的进一步编辑。若 upstream 在 PR 落地前重命名/变更这些方法，将 da 的可选参数 rebase 到新签名上。

**§4.2 备选方案（若 upstream 拒绝）：** 构建 `packages/credentials/credentials-addressed`——一个 da 拥有的 wrapper `Service`（`ctx.addressedCredentials`，`inject: ['credentials']`），在 **未修改的** `ctx.credentials` 之上叠加 address-aware 解析，并配一个 da 拥有的伴随事件（`credentials-addressed/updated`，一个普通 emitter——**不是** Cordis typed event，因为 §3.2 也禁止新增 *新的* `SessionEventMap` 成员）。da 的消费者 inject `'addressedCredentials'`。这会完整回退对 dsh 的修改。

---

### D2 — Subagent continuable-children + 成本遥测

**修改了什么：**

- `packages/subagent/subagent/src/index.ts` — 已提交 diff 仅 **1 line**（一个 `SubagentCosts` re-export）。`SubagentRuntime` 上约 9 个 continuable-children 方法（`startContinuable`、`followup`、`interrupt`、`reportFrom`、`registerContinuableSetup`、`drainContinuable*`、`listChildren`、`listDescendants`）是 **upstream 的**——在 merge-base 即存在，不在 da 的 diff 中——并非 da 的修改。（Phase-3 评审更正：这将 D2 真正的冲突面缩小到 cost-telemetry 子集。）
- `packages/subagent/subagent/src/types.ts` — 新增 `SubagentCosts` + 在 `SubagentResult` 上新增可选 `costs?`（**修改了 dsh 的 `SubagentResult` vocabulary 类型**），`ContinuableCreateRequest` / `ContinuableCreateSpec` / `ResolvedSubagentStartRequest` 类型，在 `SubagentProvider` 上新增可选 `prepareContinuable?`。
- `packages/subagent/tool-subagent/src/index.ts` — 修改了 dsh Consumer `tool-subagent`（规则 4.4 中点名禁止的例子）：`backgroundMode: 'one-shot' | 'continuable'` 配置、per-child `persona` / `toolFilter`、`ForegroundToolResult.costs?`、output-schema 的 `costs` 字段。

**原因（da 需要的能力）：** da 的 Qoder subagent provider（`subagent-qoder`，da 拥有）需要 (a) **continuable / background subagent**（spawn 一个长期运行的 Qoder 任务、follow up、interrupt）和 (b) **per-subagent 成本/credits 遥测**（per-user Qoder Credits 对账——"G3 driver"）。continuable-children 能力可论证是通用的；成本模型则是 da 特有的。

**违反的规则：** 4.1（修改 dsh 源码）；4.4（修改 dsh Service Definition interface + vocabulary 类型 + 点名的 Consumer `tool-subagent`）。

**Upstream PR 计划**——拆成两个 PR：

1. **Continuable subagent**（通用价值）：以 additive、非破坏性方式新增 `ContinuableCreate*` 类型 + `prepareContinuable?` + `SubagentRuntime` 的 continuable 方法。Provider 可选 opt-in（不实现 `prepareContinuable` 的 provider 保持 one-shot 行为）。
2. **成本遥测**：`SubagentResult.costs?` + `SubagentCosts`——以 additive 方式提出（不报告成本的 provider 将其留空）。`tool-subagent` Consumer 的改动（`backgroundMode`、成本暴露）仅在 (1) 落地 upstream 后才发布；否则 da 把它们保留在一个 da 拥有的姊妹 Consumer 中。

**临时应对方案（避免合并冲突）：** additive 可选字段/方法——upstream 合并只会在被改的 `SubagentResult` 类型和 `SubagentRuntime` / `tool-subagent` 方法面上冲突。机械解决：保留 da 的新增内容，并入任何 upstream 函数体改动。continuable / cost 面较大；在 PR 落地前避免进一步就地编辑。若 upstream 在 PR 落地前重构 `SubagentRuntime`，将 da 的 continuable 方法 rebase 到新结构上。

**§4.2 备选方案：** 构建 `packages/subagent/subagent-continuable`——一个 da 拥有的 wrapper（`ctx.continuableSubagents`，`inject: ['subagents', 'agents']`），在未修改的 one-shot `SubagentRuntime` 之上叠加 continuable 编排；定义 `DaSubagentResult = SubagentResult & { costs?: SubagentCosts }` 由 `subagent-qoder` 拥有；通过 `defineTool` 发布一个 da 拥有的姊妹 Consumer `tool-subagent-qoder`（inject `['subagents', 'tools']`），让 dsh 的 `tool-subagent` 保持不动。

---

### D3 — ProviderEditor 注册表驱动的 adapter-family UI

**修改了什么：**

- `packages/client/ui-settings-models/src/client/ProviderEditor.tsx` — 修改了 dsh 的 client 源码，新增一个 `'dashscope'` `EditorLayout` union 成员、在 `layoutOf` 中加入 `if (ns === 'llm-dashscope') return 'dashscope'` 字符串匹配、一个 `DASHSCOPE_PUBLIC_BASE_URL` 常量，以及在 placeholder + `DeepSeekModelsEditor` 路由中加入 `family === 'dashscope'` 分支。

**原因（da 需要的能力）：** da 的 `llm-dashscope` provider 需要在 `dsh web` 的 Models 页面有一个 settings-UI 布局（DashScope 专有字段 / base-URL）。dsh 的 `ProviderEditor` 没有 adapter-family 布局的 registry——布局是在共享组件里按 family 硬编码的。

**违反的规则：** 4.1（修改 dsh client 源码）；§1.5 / §3.1（在共享 dsh 逻辑中硬编码 product-specific 分支，而非使用 composition / registration）。

**Upstream PR 计划：** 提出一个 **registry-driven adapter-family UI**：每个 LLM adapter package 通过一次注册调用贡献自己的布局（字段集 + base-URL placeholder）（例如 `ctx.modelsUi.registerFamily({ ns, layout, fields })` 或 `defineModelEditorFamily()`），`ProviderEditor` 渲染已注册的 family 而非硬编码。`llm-dashscope` 随后注册自己的 `'dashscope'` 布局。通用改进——任何第三方 LLM adapter 都无需编辑 dsh 即可获得自定义 UI。

**临时应对方案（避免合并冲突）：** 保留当前 additive 的 `'dashscope'` 分支（非破坏性）。upstream 合并只会在 `EditorLayout` union 和 `layoutOf` / placeholder / editor 分支上冲突。机械解决：保留 da 的 family，并入任何 upstream 布局改动。若 upstream 在 PR 落地前重构 `ProviderEditor`，将 da 的 family rebase 到新结构上。

**§4.2 备选方案：** 有限——`ProviderEditor` 是 dsh UI，没有 injection seam，因此 da wrapper 无法在没有 registry 的情况下贡献布局。故此项为 **仅 upstream-PR**（无干净的 §4.2 wrapper）；在 registry PR 落地前，additive 分支是临时方案。

---

## §2 Fork 内推迟的反模式（非 upstream-PR）

> 这些是 **da 拥有**代码中的反模式（未修改任何 dsh 源码）。它们不需要 > upstream PR。此处记录它们是因为正确修复是一次结构性重构，团队已 > **明确推迟**（依据 in-code 注释）；它们被跟踪用于未来的 > follow-up，而非违背推迟意图强行修复。

### D4 — nl2sql-engine Service Definition 执行了 provider I/O（§6:io-in-definition）

**内容（da 拥有）：** `packages/data/nl2sql-engine/src/index.ts` — `Nl2sqlEngineService`（`ctx.nl2sql` 的 seam 拥有者 / Service Definition）从具体的 `@deepseek-ai/dsh-query-maxcompute/src/conventions.ts` Provider import 了 `loadConventions`，并在其构造函数中调用它（`this.conventions = loadConventions(config.conventionsEngine ?? 'maxcompute')`）。`loadConventions` 执行了 provider 专有的文件 I/O（`readFileSync` 读取 maxcompute 的 `conventions.yaml`），因此拥有 seam 的 Definition 耦合到了具体 Provider，并把 I/O 泄漏进抽象层。（同一 `loadConventions` import 在 5 个 `nl2sql-engine` 文件中重复出现——`index.ts`、`engine.ts`、`prompt.ts`、`conventions.ts`、`tests/scenarios.spec.ts`——均属同一 §6:io-in-definition 反模式；上面的 `index.ts` 是代表性位置。）

**原因：** 今天只有单一引擎（MaxCompute）；conventions loader 位于 maxcompute Provider 中，并被 nl2sql 和未来的 query-guard 消费者共享。

**违反的规则：** §6 第 2 行（io-in-definition——I/O 只能出现在 Provider 中）；§4.4（Definition import 了一个具体 Provider 的内部实现）。da 拥有→da 拥有，因此 **不是** dsh 源码违规；风险低于 §1。

**正确做法目标：** 将 nl2sql 重构为 3 角色 seam——一个抽象 `Nl2sqlEngineService` Definition（无 I/O；声明 `abstract getConventions(): EngineConventions`）、一个实现 `getConventions()`（拥有 `conventions.yaml` 读取）并 `static inject` 自身的 `MaxComputeNl2sqlProvider`，以及挂载该 provider 的 bundle patch。Definition 只负责 vocabulary；更换查询引擎时 nl2sql seam 保持 agnostic。

**推迟原因：** 团队明确推迟了此项（“the shared query-package loader ideal is deferred until a second consumer / engine arrives — P13b grilling Q1/Q3”，依据 `conventions.ts`）。今天单引擎意味着 seam-swap 关注点只是理论上的；过早的 3 角色重构会增加一个 provider package + bundle-patch 变更 + 测试更新，却没有当前消费者受益。

**临时：** 无合并冲突风险（da 拥有的代码）。在第二个查询引擎或 query-guard 消费者出现时重新评估。若现在强制修复，重构内容为：新的 `MaxComputeNl2sqlProvider` class + 抽象 `getConventions()` + bundle patch `insert` 该 provider + 测试更新。

---

## 审计汇总

| ID | 集群 | 规则 | 严重度 | 解决方案 | 状态 |
|---|---|---|---|---|---|
| — | web-app bundle `llm-dashscope` insert | 4.3 | — | **当前非违规** — master tip（494839a98c）已验证干净：insert 在 `4104471fb1` 处加入，在 tip 前已移除；扫描发现的是一个 agent checkout 出来的 worktree 产物，不是已提交的违规 | N/A（误报 — 见审计准确性说明） |
| D1 | credentials addressing | 4.1 + 4.4 + §3.2 | HIGH | upstream PR（或 §4.2 `credentials-addressed` wrapper） | DEBT — 未回退 |
| D2 | subagent continuable + costs | 4.1 + 4.4 | HIGH | upstream PR（或 §4.2 `subagent-continuable` wrapper） | DEBT — 未回退 |
| D3 | ProviderEditor dashscope UI | 4.1 + §1.5 / §3.1 | HIGH / MED | upstream PR（registry-driven UI） | DEBT — 未回退 |
| D4 | nl2sql io-in-definition | §6 + 4.4 | HIGH | fork 内 3 角色重构（团队推迟） | DEBT — 推迟 |

**耦合的 catalog 条目（D1/D2 的下游）：** `packages/extensions/tool-cordis/src/api-catalog.ts` 中 additive 的 `SERVICE_API` / `TYPE_API` 行记录了 da 的新 seam（audit / embedder / identity / nl2sql / schema + 它们的类型）以及 D1/D2 变更后的签名。记录 da seam 文档的行是 additive registration（允许）。记录签名的行在 D1/D2 落地 upstream 或改走 §4.2 wrapper 时同步更新——不是独立债务。

**干净 / 无动作：** `bundle/headless`、`bundle/base`（零改动）；`bundle/data-agent`（已授权的 disable+insert+config-override）；所有 `scripts/gen-*` + manifest（additive registration）；agent preset（§4.5 da 拥有位置）；`packages/query/query-tool` 的 `setTimeout`（瞬时自解析定时器，非泄漏——仅可选 abort-aware 加固）；`packages/data/phase-gate/src/phase-gate.ts` + `packages/data/tool-load-event-definition/src/index.ts` 的 working-tree 编辑（da 拥有；`tool-load-event-definition` 新增一个 tool output 字段 + helper 类型，**不是** 新的 `SessionEventMap` 成员 → 不构成 §3.2 违规）。

---

## 审计准确性说明

Phase-1 dimension-3 扫描报告了一个 rule-4.3 违规：`packages/bundle/web-app/cordis.patch.yml` 追加了一个 `llm-dashscope` insert。**对照已提交的 master tip（494839a98c）验证表明这是误报。** 该 insert 由 commit `4104471fb1`（`feat(web-app): mount llm-dashscope provider`）加入，并在 tip 之前已被移除——master tip 的 `cordis.patch.yml` 以 `default: standard` 结尾，没有 insert 块，`git show 494839a98c:packages/bundle/web-app/cordis.patch.yml` 是干净的，且 `git diff upstream/master...HEAD -- packages/bundle/web-app/cordis.patch.yml`（已提交净 diff）为空。扫描的 `git diff` 显示出 insert，是因为一个 inspecting agent 在检查期间把 `4104471fb1` 的历史版本 checkout 进了 working tree，污染了 worktree；已提交状态本就是干净的。无需回退（也未做任何回退——修复分支的 PR diff 仅为此文档）。

Phase 3 的教训：评审者必须对照 **已提交的** 状态（`git show <tip>:<path>`、`git diff upstream/master...HEAD -- <path>`）核实发现，而非 working tree，因为扫描 agent 在检查期间可能 checkout 历史提交从而污染 worktree。

上文的 D1、D2、D3、D4 均已对照已提交的 master tip（内容计数 + 净 diff）重新验证，是 **真实的** 已提交违规/反模式。
