# Benchmark Pack 在 DSH/Cordis 中的原生集成方式

日期：2026-09-11

审计基线：`7003527d410a50ba11a3e8d60f925a1ba87b3269`

## 结论先行

Benchmark Pack 不应被二选一地定义成“脱离 DSH 的数据文件”或“整个 Pack 就是 Cordis 插件”。最符合 DSH/Cordis 现有架构的做法是组合模式：**Pack 本体是 sealed、content-addressed 的数据 artifact；Pack 的发现、校验、授权、缓存和读取由 Cordis capability 提供；只有需要执行、注册、观察或持有生命周期的代码才是插件。**

“独立内容 artifact”不是让 Evaluation 绕开 Cordis。它表示 Benchmark 的测量内容以一个不可变 manifest closure 存在，其 identity 来自 canonical bytes 的 digest，而不是来自 Node module identity、Loader entry id、npm package version 或某次插件挂载。Evaluation Controller 仍通过 `ctx.benchmarkRepository` 解析这个 artifact；本地目录、npm package assets、对象存储和受限远端 repository 是可替换的 Provider。

推荐结构：

```text
Evaluation Protocol                    pure package, no Cordis registration
        ↑
BenchmarkRepository Definition         ctx.benchmarkRepository
        ↑
Repository Providers                   local CAS / packaged-public / remote-public
        ↑
EvaluationController                   Consumer; resolves public Pack by digest

GradingMaterialRepository Definition   grader-only service graph
        ↑
Private Repository Providers           restricted local / remote private
        ↑
GradingRuntime                         Consumer; Harness root cannot resolve it

Companion plugins                      optional executable behavior only
├── grading mechanisms
├── Environment fixtures/participants
├── external or legacy importers
└── generators that require live DSH services
```

公开 npm package 可以携带 Pack assets，并通过 Provider 暴露，就像 `dsh-skill-badge` 携带数据资源并注册到 `ctx.skills`。此时 npm package 是**分发载体**，不是 Pack 的权威 identity；正式 identity 仍是 Pack manifest 与完整内容 closure 的 digest。Private grading material 不应与 Harness-visible package 或 provider graph 共同安装。

## 问题与术语

- **Benchmark Pack**：case manifests、public task material、private-material references、具名 policy/requirement profiles、provenance、split/cohort 与 aggregation declarations 的集合。
- **Content artifact**：sealed 的目录、archive 或 object closure；canonical manifest 覆盖所有 required children，移动存储位置不改变 identity，修改任一受覆盖内容会产生新 identity。
- **Cordis plugin**：挂载到 Context、拥有 fiber 的可执行代码；它可以提供 service、消费 injected services、注册 listener/value、拥有 effects，并响应 config 或 code reload。
- **npm package**：代码和资源的发布、安装与 dependency unit；package 内的文件不会因为位于 npm package 中就自动成为 Cordis plugin。
- **Bundle**：通过 `dsh.bundle.patch` 向 profile 贡献 Cordis rows 的 npm package；它主要是 deployment composition，不是通用内容仓库。

## 范围与方法

本报告只使用当前 DSH worktree、vendored Cordis/Loader/Include/HMR 源码、package manifests、构建脚本与 G10 已记录决议。以下“事实”描述当前实现；“建议”是面向 G10 的设计推论。

## 一、事实：Cordis plugin 提供什么

### 1. 可执行入口与配置校验

Cordis plugin 是 function、constructor 或带 `apply()` 的 object；它可以声明 `Config`、`inject`、`provide` 和 intercept metadata。`vendor/cordis/src/registry.ts:L91-L145`。

Plugin config 在 fiber 启动前通过 Standard Schema 校验；校验失败会阻止启动。`vendor/cordis/src/fiber.ts:L42-L61`。

Loader row 是 plugin composition record，字段为稳定 row id、module specifier、plugin config、group、disabled 和 inject。`vendor/loader/src/config/entry.ts:L8-L22`。因此 Loader 原生管理的是可执行 plugin graph，不是任意内容 manifest。

### 2. Service 与 dependency injection

`Service` 把实现发布到稳定的 `ctx.<key>`，并让该注册由 owning fiber 管理。`vendor/cordis/src/service.ts:L5-L10`、`vendor/cordis/src/service.ts:L29-L58`。

`inject` 声明 service requirement；插件只在依赖可用时激活，依赖变化会重新评估 fiber。`vendor/cordis/src/registry.ts:L12-L19`、`vendor/cordis/src/registry.ts:L164-L186`。

这正是 repository implementation 适合采用 Cordis plugin 的原因：本地、远端、公开和私有实现可以依赖不同 credentials、Artifact Store、settings 或 network providers，而 Controller 只依赖一个 Definition。

### 3. Events、registrations 与 effects

Cordis event listener 由当前 fiber 拥有并在卸载时自动移除。`vendor/cordis/src/events.ts:L277-L302`。

`ctx.effect()` 为 watcher、connection、timer 和其他资源登记同步或异步 disposer；fiber unload 会执行这些 disposers。`vendor/cordis/src/fiber.ts:L68-L93`、`vendor/cordis/src/fiber.ts:L405-L418`。

DSH 因此要求 services、tools、prompt sections 和 listeners 以可撤销 effects 贡献到 composition，而不是修改一个特权 core。`docs/architecture.md:L9-L13`、`docs/cordis-primer.md:L7-L14`。

纯 Pack manifest 没有 listener、registration 或 acquired resource 需要 disposal。若一个 plugin 只返回静态 JSON 或注册一个目录字符串，删除该 wrapper 后复杂度不会扩散到多个调用者；按 deep-module deletion test，它是浅 module。负责 discovery、validation、sealing、authorization 和 caching 的 repository Provider 则有足够深度。

### 4. Loader lifecycle 与 HMR

Fiber 在 dependencies 出现或消失时 activate/unload，config update 会校验并 restart plugin；unload 会清理 owned effects。`vendor/cordis/src/fiber.ts:L625-L695`、`vendor/cordis/src/fiber.ts:L712-L752`。

Loader entry update 会根据差异更新 config 或 dispose/restart plugin，并在 replacement 失败时尝试 rollback。`vendor/loader/src/config/entry.ts:L141-L245`。

Cordis HMR 观察 Loader config 和 Node module graph。配置文件变化会刷新 Include tree；module graph 变化会替换受影响 fibers；不属于 module graph 的普通数据文件只产生 `hmr/change`，其含义由 consumer 决定。`vendor/hmr/src/index.ts:L244-L270`、`vendor/hmr/src/index.ts:L409-L520`。

因此 HMR 不是 Benchmark content-version protocol。它不会自动计算 Pack closure digest、保留 active Run 使用的旧 Pack generation、验证 private/public split，或把内容变化标记成新的 Benchmark identity。

## 二、事实：profiles、bundles 与 package assets 提供什么

### 1. Profiles 与 bundles 负责 composition

DSH runtime 是按 bundle、profile、home 与 invocation patch layers 组成的 Cordis plugin tree。`docs/architecture.md:L15-L35`。

Profile manifest 列出 ordered bundles；每个 bundle 的 `dsh.bundle.patch` 指向 patch 文件。Boot 代码解析 bundle package、读取 manifest、加载 patch 并在空 entry tree 上顺序组合。`packages/boot/app-boot/src/profile.ts:L41-L95`、`packages/boot/app-boot/src/profile.ts:L357-L419`。

Bundle 的主要内容是 patch list；部分 bundle 同时携带其 patch 会挂载的 runtime glue。`packages/bundle/README.md:L1-L16`。

`dsh plugin --profile` 使用 pnpm 安装 package，但只有声明 `dsh.bundle` 的 dependency 会加入 profile bundle list；普通 package 保持为 dependency，不会自动成为 composition layer。`apps/cli/src/plugin.ts:L1-L9`、`apps/cli/src/plugin.ts:L47-L90`。

Bundle membership 在当前进程启动后保持不变，普通 profile/home patch edits 才由 HMR 处理。`apps/cli/reference/README.md:L43-L55`。

因此 profiles/bundles 适合选择 Benchmark Repository Provider、Grading Mechanism、Environment Provider、stores 和 Observer；它们不应定义 Pack content identity。

### 2. npm package 可以携带普通资源

`dsh-skill-badge` 在 `package.json.files` 中发布 `assets/`，通过 `import.meta.url` 取得 package-relative path，再把读取行为注册到 `ctx.skills`。`packages/skill/skill-badge/package.json:L27-L31`、`packages/skill/skill-badge/src/index.ts:L17-L22`、`packages/skill/skill-badge/src/index.ts:L36-L59`。

这说明 public Pack 可以通过 npm assets 分发，但真正的 plugin behavior 是 provider registration 与 lazy loading，Pack bytes 本身仍是数据。

当前 `@deepseek-ai/dsh-eval` 的 publication list 只包含 built JavaScript、invariant 与 declarations，不包含 `cases/`。`packages/eval/eval/package.json:L28-L31`。当前 case files 因此只在 source checkout 中存在，不是已发布 Benchmark artifact。

所有非 experimental DSH packages/apps 属于同一个 release family并共享 repository version。`scripts/release/families.ts:L319-L359`。Workspace constraints 还规定 DSH package 的固定 ESM/exports/files shape；额外 assets 由中央 package-specific allowlist 管理。`scripts/check-workspace-constraints.ts:L143-L190`、`scripts/check-workspace-constraints.ts:L335-L378`。

每 Pack 一个 repository package 会把普通 case revision 绑定到全仓 release 与 publication machinery。这个成本对 executable capability 有价值，对持续变化的纯 benchmark content 通常没有对应收益。

## 三、事实：DSH 当前如何加载和版本化数据资源

### 1. Skill registry：Provider 管行为，文件管内容

`SkillRegistry` 是 Cordis Service，接受 global 或 agent-scoped Provider registration；registration 由 effect 拥有，unload 会移除 Provider、abort 其生命周期并 invalidate catalog cache。`packages/skill/skill/src/index.ts:L346-L378`、`packages/skill/skill/src/index.ts:L380-L429`。

`SkillProvider` 提供异步 `list()` 和 `get()`，因此本地目录、package assets 与未来 remote registries 可以满足同一个 registry interface。`packages/skill/skill/src/index.ts:L247-L260`。

`dsh-skill-filesystem` 是带 validated discovery/watch config 的 Provider plugin；Markdown 与 resources 则保留为普通文件。`packages/skill/skill-filesystem/src/index.ts:L1-L8`、`packages/skill/skill-filesystem/src/index.ts:L45-L89`。

这是 Benchmark 最接近的现有模式：**数据 resources 位于 Provider 背后，而不是每个 resource 各自成为 plugin。**

### 2. Scope registry：Cordis config 指定 WHERE，文件保存 WHAT

`ScopeRegistryService` 明确区分 Cordis static config 中的 `registryPath` 与该路径下 YAML 所保存的 runtime data。`packages/data/scope-registry/src/index.ts:L1-L14`、`packages/data/scope-registry/src/index.ts:L43-L55`。

Service 提供 atomic mutation 与 typed events；YAML 只是被管理的数据。`packages/data/scope-registry/src/index.ts:L57-L93`。

这支持由 profile/plugin config 选择 Benchmark repository 的位置，但当前 scopes YAML 是 mutable state，不应照搬为 formal Benchmark 的 identity model。

### 3. Semantic layer snapshot：运行期 generation，不是 durable content identity

Semantic layer 可以从目录读取 YAML definitions，并创建 frozen in-memory snapshot。Snapshot 以 `semanticRoot + serviceVersion` 缓存；version 未变时复用已加载 arrays。`packages/data/semantic-layer/src/snapshot.ts:L1-L18`、`packages/data/semantic-layer/src/snapshot.ts:L182-L218`。

这个 monotonic process-local version 适合 cache invalidation，但它不是覆盖全部文件 bytes 的 digest。Benchmark Pack 需要可跨机器验证的 sealed content identity，不能只记录类似的 numeric generation。

### 4. Agent presets：executable composition 与 generation retention

Agent preset 是包含 `agent.cordis.yml` 的目录；discovery 每次重读 roots，并将缺失或不可解析的 composition 报为 broken。`packages/preset/agent-presets/src/discovery.ts:L1-L14`、`packages/preset/agent-presets/src/discovery.ts:L140-L185`。

Preset 是 executable composition，与它引用的 plugins 具有同等 trust。`packages/preset/agent-presets/README.md:L127-L135`。

Preset generation 使用 composition file 的 `mtime + size` 检测后续 edits；已加入的 sessions 保留原 generation，新 session 使用新 generation。`packages/preset/agent-presets/src/index.ts:L490-L533`、`packages/preset/agent-presets/src/index.ts:L537-L559`。

这个机制证明 active work 需要 pin 自己开始时的 generation，但 `mtime + size` 不证明内容，也不覆盖引用 closure，因此不足以作为 Benchmark identity。

### 5. Attachments：已有 content-addressed Provider precedent

`AttachmentStore` 是 immutable binary content 的 Service Definition，保存操作先验证内容再返回 durable reference，读取时再次验证 reference。`packages/attachment/attachment/src/index.ts:L26-L36`、`packages/attachment/attachment/src/index.ts:L78-L92`。

Local Provider 计算 SHA-256、写入 versioned private root、同步目录后发布 reference，并在读取时重新计算 digest。`packages/attachment/attachment-local/src/store.ts:L130-L193`、`packages/attachment/attachment-local/src/store.ts:L196-L230`。

当前 Attachment contract 是 image-specific，不能直接假装成通用 Benchmark Artifact Store；但其 Definition/Provider 分工、atomic publication 和 digest verification 是直接可复用的实现经验。

### 6. 当前 eval：host path、schema 与发布彼此脱节

当前 case loader 接受显式 YAML/JSON paths并做 Zod validation，directory discovery 留给 host。`packages/eval/eval/src/case_loader.ts:L1-L24`、`packages/eval/eval/src/case_loader.ts:L27-L46`。

当前 schema 明确是 data-analysis-specific lean model，而不是 richer RBI schema mirror。`packages/eval/eval/src/eval_case.ts:L1-L8`。

Active Cordis service 直接持有 `caseDir`、K11-specific filename regex、provider/model/today 等配置，并在 service 内组装 Agent、Query 与 Judge collaborators。`packages/eval/eval-runner-service/src/index.ts:L364-L400`、`packages/eval/eval-runner-service/src/index.ts:L418-L445`。

Data-agent bundle 又把该 service 与 eval-control plugins 挂入普通 product composition。`packages/bundle/data-agent/cordis.patch.yml:L183-L212`。

这说明 formal Pack resolution 不能继续由 CLI/service 各自读取目录和推断文件名；需要一个 owner 统一 sealing、identity、access 与 errors。

## 四、“独立内容 Artifact”具体是什么

它可以先是一个本地 authoring directory，而不要求远端服务：

```text
my-benchmark/
├── benchmark.yaml
├── cases/
├── public/
├── policies/
├── requirements/
└── private-refs/
```

Repository 在正式 Run 前执行：

```text
读取并验证 manifest
→ 解析受控相对引用
→ 拒绝 path escape、循环、重复 identity 和未知 grading fields
→ 计算每个 child content digest
→ 构造 canonical manifest closure 与 root digest
→ 分离 public closure 和 opaque private references
→ 产出 ResolvedBenchmarkPack
```

正式 identity 是 digest，不是路径。两个目录只要 canonical closure 相同就是同一个 Pack；同一路径内任一受覆盖内容改变，就成为新的 Pack identity。Authoring directory 可以修改，正式 Run 只能 pin 已 sealed 的 `BenchmarkPackRef`。

“Artifact”描述的是 immutable、content-addressed 和可验证；它不限定 bytes 存在本地目录、archive、local CAS 还是对象存储。

## 五、架构选项

### A. 每个 Pack 一个 npm/Cordis package

**优势。** 公开且 code-heavy 的 benchmark 可以一次安装内容、custom grader、generator 和 fixture；package dependencies 可以让缺失 mechanism 在安装或 boot 时失败；package assets已有 DSH precedent。

**代价。** 纯内容也进入全仓 version/release；每个 Pack 都承担 package、README、invariant、build、hygiene 和 asset allowlist；case 更新触发 package release；private bytes 与 Harness 同装会破坏隔离；npm version 仍不能替代 content digest。

**Module depth。** 如果 plugin 实现 generator、compiler、fixture builder 或 Grading Mechanism，它是有价值的深 module；如果只注册 `new URL('../cases', import.meta.url)`，它只是 locator wrapper，属于浅 module。

### B. Controller 直接读取 data directory

**优势。** 最少 package scaffolding；本地 authoring直观；内容可以独立修改。

**代价。** CLI、SDK 和未来 hosts 会分别拥有 path resolution、schema loading、digest、cache、credentials 和 private access；这只是把当前 `caseDir` 模式扩大，不产生可替换 seam。

**Module depth。** Controller interface 会被 repository concerns撑大，相关复杂性散落到每个 host，locality 最差。

### C. 每个 Pack plugin 注册 descriptor/locator

**优势。** 充分利用 profile install、effect-owned registration 和 HMR；公开内置 Pack 可以随安装出现；companion code dependencies明确。

**代价。** Locator registration 不会消除 repository loader；每个纯数据 Pack 仍增加 package/plugin；profile 是否安装 Pack 会改变 composition identity；private Pack 仍不能安全地进入 Harness package tree；content update 继续受 npm lifecycle约束。

**Module depth。** 作为 canonical model 很浅；作为少量公开 Pack 的可选 distribution adapter 有合理价值。

### D. Artifact Pack + Cordis repository/grading plugins

**优势。** Pack 独立版本化、content digest 即 identity、private/public 可分离；Cordis 继续拥有 Provider composition、DI、config、effect lifecycle 和测试替换；fresh/cohort 更新只生成新 Pack，不生成新 runtime package。

**代价。** 需要定义 canonical pack format、sealing protocol、BenchmarkRepository Definition、local Provider 与 Artifact Store integration；若首版同时建设 remote catalog、upload、signing 与 cache coherence 会过度扩大范围。

**Module depth。** Repository 的一个小 `resolve()` interface隐藏完整 loading、validation、sealing 与 access implementation；companion plugins只隐藏真正可执行的领域行为。两者都能通过 deletion test。

## 六、建议：采用 DSH-native hybrid

### 1. Evaluation Protocol：pure package

Protocol 定义跨角色和 persistence 所需的 schemas，例如：

```ts
interface BenchmarkPackSelection {
  readonly locator: string
  readonly expectedDigest?: Digest
}

interface BenchmarkPackRef {
  readonly repositoryId: BenchmarkRepositoryId
  readonly rootDigest: Digest
}

interface ResolvedBenchmarkPack {
  readonly ref: BenchmarkPackRef
  readonly manifest: BenchmarkPackManifest
  readonly publicMaterial: readonly PublicTaskMaterialRef[]
  readonly gradingMaterial: readonly GradingMaterialRef[]
}
```

Protocol 不提供 `apply()`，不创建 Context，不依赖 filesystem、network、credentials 或 Controller。

### 2. Public BenchmarkRepository：Definition / Provider / Consumer

首版 Definition 保持一个主要入口：

```ts
abstract class BenchmarkRepository extends Service {
  constructor(ctx: Context) {
    super(ctx, 'benchmarkRepository')
  }

  abstract resolve(
    selection: BenchmarkPackSelection,
    signal?: AbortSignal,
  ): Promise<ResolvedBenchmarkPack>
}
```

- **Service Definition**：拥有 `resolve()` interface、errors、selection/ref vocabulary 与 public closure validation contract。
- **Service Provider**：首版 local directory/CAS Provider；以后可增加 packaged-public、object-store 或 remote Provider。
- **Consumer**：`EvaluationController` 和 authoring/import host。

首版只有一个 selected repository Provider，不提前建设 multi-provider catalog。出现同一 composition 同时解析多个 repositories 的真实需求后，可以在不改变 Pack protocol 与 Controller call site 的前提下，把 Definition 深化成 effect-owned provider registry。

### 3. Private GradingMaterialRepository：grader-only seam

Private material 使用独立 Definition：

```ts
abstract class GradingMaterialRepository extends Service {
  constructor(ctx: Context) {
    super(ctx, 'gradingMaterialRepository')
  }

  abstract resolve(
    ref: GradingMaterialRef,
    authorization: GradingAuthorization,
    signal?: AbortSignal,
  ): Promise<ResolvedPrivateGradingMaterial>
}
```

- **Service Definition**：拥有 authorization、not-found、digest mismatch 与 access failure semantics。
- **Service Providers**：restricted local store、private object store 或 remote verifier。
- **Consumer**：`GradingRuntime`。

该 service 不挂入 product Evaluation root；Harness 只收到 public task 与 opaque reference。

### 4. Companion plugins：只有 executable behavior

以下内容真正需要 plugin behavior：

- Grading Mechanism registration；
- Environment fixture/participant 的 provision、finality 与 cleanup；
- Context Projection Provider；
- 使用 live DSH services 的 generator；
- 需要 credentials、network、watcher 或 cache lifecycle 的 repository Provider；
- 需要 composed services 的 external/legacy importer。

Pack manifest只能引用已注册的 namespaced/versioned mechanism identity，不能携带任意 module path 或脚本。Composition preflight 在 Agent 启动前拒绝 missing、version-incompatible 或 digest-mismatched mechanism。

不需要 service、registration、config 或 resource lifecycle 的 parser/compiler 应保持普通 library 或 CLI module，不为满足“everything is a plugin”而增加 pass-through plugin。

### 5. Profile、bundle 与 optional package-carried Pack

Profile/bundle/overlay 安装并配置 Repository、Artifact Store、Evaluation Store、Grading Mechanisms、Environment Providers 与 Controller dependencies。它们不保存 active Pack identity；formal Run 的配置显式选择并 seal 一个 Pack ref。

若需要随 npm 安装提供公开 smoke/demo Pack，可以使用 package-assets Provider：package `files` 明确包含 public Pack assets，Provider 用 package-relative URL 读取并验证 root digest。此模式只能携带 public material；npm package/version 是 distribution provenance，Pack digest 是 Benchmark identity。

Private heldout/fresh material不得与 product Harness package 同装。它通过 grader-only repository Provider 分发；profile config只保存 credential reference、endpoint 或 repository root，不保存 secret 或 expected bytes。

### 6. Loader/HMR 规则

1. Cordis HMR 管 Repository Provider、Controller、Grading Mechanism 等代码与 config。
2. Local repository watcher 可以发现 authoring directory 变化，但只能为未来 Run 产生新 Pack digest。
3. Active `EvaluationRun` pin 已 resolved Pack digest，不跟随 mutable alias、path 或 `latest`。
4. supposedly immutable content missing/corrupt 时 Run invalid，不回退到更新版本。
5. Evaluation-relevant plugin code/config HMR 会改变 Component Identity，并按 D13 invalidates 当前 frozen Run。
6. Authoring directory edit先产生新 sealing result；它不直接改写已 sealed Pack。

### 7. 外部与私有分发

- **本地首版**：CLI 接收显式 local locator；local Provider校验目录并 seal 到 local Artifact Store/CAS。
- **公开外部 Pack**：remote Provider解析 exact digest，可把 bytes cache 到 Artifact Store。
- **公开 npm Pack**：只作为 optional carrier；built-artifact smoke验证 assets 被发布。
- **Private Pack**：只在 grader process安装或访问；禁止把 private directory挂进 Harness filesystem view。
- **Air-gapped Pack**：通过 archive移动后导入 local repository；导入验证完整 closure digest，transport path 不进入 identity。

## 七、首版调用流程

```text
1. CLI 解析 --profile 与 --benchmark
2. app-boot 加载 production profile + evaluation overlay
3. overlay 装载 local BenchmarkRepository、stores、Controller 和 grader client
4. Controller 调用 ctx.benchmarkRepository.resolve(selection)
5. Repository validation + sealing → ResolvedBenchmarkPack
6. preflight 验证 required Grading/Environment/Context mechanisms
7. Run Identity Graph pin BenchmarkPackRef.rootDigest
8. Controller 创建真实 Agent attempts
9. Grading Runtime通过独立 private repository解析 opaque refs
```

CLI 不读取 case YAML、不 glob filename、不选择 grader、不解析 private material。Pack resolution 只有一个 owner。

## 八、选项比较

| 维度 | 每 Pack package/plugin | Controller 直接读目录 | Plugin locator | 推荐 hybrid |
| --- | --- | --- | --- | --- |
| 内容独立版本 | 弱 | 中 | 弱到中 | 强；digest 即 identity |
| Cordis composition | 强 | 弱 | 强 | 强，且只用于能力 |
| Private isolation | 同包时弱 | 取决于 host | 同包时弱 | 强 |
| 首版复杂度 | package scaffolding 较重 | 最低但债务高 | registry + loader 双层 | 中等；一个 Definition + local Provider |
| Future cohort | npm release | 新目录但 identity不稳 | package update | 新 digest |
| Custom code | 自然 | host-specific | 自然 | companion plugin |
| Module depth | code-heavy 可深；纯数据浅 | Controller 变浅 | locator 本身浅 | repository 与 mechanism 均可深 |
| External/private distribution | package manager主导 | host-specific | package manager主导 | Provider-specific |

## 九、验收约束

1. Pack root digest 覆盖 canonical manifest 与全部 required public children。
2. `BenchmarkPackRef` 不含 ambient path fallback；formal Run resolution 后不保留 mutable `latest` identity。
3. Controller 不能 import concrete repository Provider 或直接读取 Pack directory。
4. Product Evaluation root 不能 resolve `GradingMaterialRef`；只有 Grading Runtime service graph 可以。
5. Package-carried public Pack 若未进入 `package.json.files`，built-artifact smoke 必须失败。
6. npm package/version 仅作为 distribution provenance，不替代 Pack digest。
7. Repository registration、watcher 和 clients 由 Cordis effects 拥有并在 unload 时释放。
8. Active Run pin 一个 Pack digest；repository changes 只影响未来 Run。
9. Pack 不得指定待 import 的任意脚本/module path；只能引用 composition中已经注册的 mechanism identities。
10. Private material 不进入 Harness-visible npm assets、mounts、Artifact Store credentials 或 model tools。
11. Local、packaged-public 与 remote Providers 对相同 canonical bytes必须解析出相同 Pack identity。
12. Export/import 验证完整 closure，而不只验证 top-level manifest。
13. Legacy K11/RBI loaders仅用于 migration tooling，不可由 formal Controller选择。
14. 移除 evaluation overlay 后，普通 data-agent composition仍完整运行。

## 十、对 G10 的建议决议

> **Benchmark Pack 是 sealed、content-addressed 的数据 artifact，不天然是 Cordis plugin。DSH 通过 evaluation-owned `BenchmarkRepository` Service Definition 与可替换 Providers 解析 Pack；profiles/bundles只安装和配置这些 Providers及真正需要运行的 Grading Mechanism、Environment、Context 或 generator plugins，不定义 Pack identity。公开 npm package可以携带 Pack assets，但 package只提供 distribution provenance，权威 identity仍为 Pack root digest。Private grading material由 grader-only repository Provider分发，绝不安装或挂载到被测 Harness composition。**

## 十一、实现票仍需确定

- Canonical manifest encoding、digest algorithm 与 domain separation。
- Sealed Pack 是单 archive Artifact，还是 root manifest + ArtifactRefs closure。
- Local Provider 的 path confinement 与 symlink policy。
- Authoring directory 到 sealed Pack 的命令和失败状态。
- Repository alias 是否存在；formal Run 前如何解析为 exact digest。
- Signing/provenance attestation 是否需要进入首版。
- Public demo Pack 是否值得发布成 package assets。
- Private-material authorization 在独立 grader process中的具体协议。
- Legacy importer 是普通 CLI module 还是需要 composed services 的 Cordis plugin。
