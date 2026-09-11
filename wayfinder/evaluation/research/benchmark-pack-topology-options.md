# Benchmark Pack 拓扑：DSH/Cordis、本地内容 Artifact 与发布机制

日期：2026-09-11

## 结论先行

Benchmark Pack 的 canonical form 应是**内容寻址的数据 bundle**，而不是每个 pack 一个 Cordis plugin。Cordis 应拥有加载、校验和解析 pack 的运行能力；pack 内容本身保持为不执行代码的 manifest 与 artifact closure。首版不需要远端 registry：外部 Evaluation CLI 显式选择一个本地 authoring directory 或已封口的本地 pack ref，`BenchmarkRepository` 的 local Provider 将其校验、计算 digest、解析成 canonical manifests，并把 immutable bytes 交给 Artifact Store。

推荐结构是一个 DSH-native hybrid：

```text
Cordis composition
├── BenchmarkRepository Definition
├── local BenchmarkRepository Provider
├── Evaluation Controller
├── Artifact Store Provider
└── domain companion plugins
    ├── grading mechanisms
    ├── legacy importers
    └── optional fixture builders

Benchmark Pack
├── pack manifest
├── case manifests
├── public task artifacts
├── policy and requirement declarations
└── opaque private-material references
```

“内容 Artifact”不表示远端服务，也不要求首版上传到对象存储。它可以是本机目录经过校验后形成的 immutable manifest closure，或一个本地 tar/zip/CAS object；关键性质是运行 identity 来自 canonical content digest，加载它不会执行代码，修改内容会产生新 identity。Cordis plugin 仍然重要，但它负责**能力与可执行逻辑**，不负责把每一批 case 数据都变成一个运行插件。

每个 pack 都做成 npm/Cordis package 在技术上可行，但不适合作为默认模型：它把内容更新绑定到全仓 npm release，把 private material 放进 Harness 可读取的安装树，并要求纯数据承担 package、invariant、bundle 和 publication gate 成本。插件注册 locator 可以作为公开内置 pack 的可选便利层，但若插件只注册一个路径，它本身是浅模块，真正的加载、digest、隔离和错误语义仍必须由 `BenchmarkRepository` 拥有。

## 范围与方法

本审计只使用当前 worktree 的仓库源码、manifest、构建脚本和 G10 已记录决议。核验范围包括 `packages/eval/`、profile/bundle boot、Cordis Provider registry 模式、npm payload policy、release family、NodeNext/hygiene gate、现有 content-addressed attachment/storage 能力，以及外部 CLI host 的 composition 方式。

按用户要求尝试并行启动三个只读 Codex 子代理，分别优化最小接口、发布机制和首版调用体验。第一次尝试被本机重复 Codex 配置键阻断；使用隔离配置重试后又因当前环境无法连接 OpenAI API 而失败。以下结论由主会话继续对相同一手源码完成，不包含未核验的子代理结论。

## 一、仓库已验证事实

### 1. DSH 的“everything is a plugin”约束运行能力，不要求每份数据都是插件

DSH 通过 profile 和 bundle 组合 Cordis plugin tree；bundle 是带 `dsh.bundle.patch` 的 npm package，profile 按顺序应用 bundle patch、用户 patch 和 CLI overlay。`docs/architecture.md:L5-L29`、`packages/boot/app-boot/src/profile.ts:L1-L21`。

一个 package 只有声明 `dsh.bundle` 才会作为 profile layer 激活。`dsh plugin` 安装普通 dependency 时会保留它，但明确提示它不是 profile layer；声明 bundle 的 dependency 才加入 `dsh.profile.bundles`。`apps/cli/src/plugin.ts:L30-L89`。

Bundle 中的 bare plugin specifier 必须能从 bundle 自己的 `dependencies` 解析；仓库 gate 会逐个 bundle 检查该关系。`scripts/verify-cordis-config.ts:L250-L277`。这意味着“每个 benchmark 一个自动注册 plugin”至少需要 package manifest、bundle patch、plugin entry 和依赖闭包，而不是只放一组 YAML。

DSH 已有“内容由 Provider 发现和读取，Definition 负责合并与解析”的原生模式。`SkillProvider` 以 `list()` 和 `get()` 暴露 provider-owned locator，`SkillRegistry.registerProvider()` 的注册由 Cordis effect 生命周期拥有。`packages/skill/skill/src/index.ts:L247-L275`、`packages/skill/skill/src/index.ts:L346-L424`。`dsh-skill-badge` 则证明 package 可以携带 assets，并由一个小 plugin 把 package-relative locator 注册给 registry。`packages/skill/skill-badge/src/index.ts:L17-L59`。

这些事实支持 `BenchmarkRepository` 作为 Cordis capability；它们不支持“所有内容必须分别成为 Cordis plugin”。纯 pack 数据不注册 Service、event 或 effect，把它强制做成 plugin 不会获得额外 lifecycle 价值。

### 2. 当前 npm 发布规则对 package-per-pack 有真实成本

所有 `packages/*/*` 与 `apps/*` 属于同一个 DSH release family；该 family 要求所有成员共享一个版本。`scripts/release/families.ts:L319-L359`。因此在仓库内增加一个 benchmark package，会把该 pack 的内容发布纳入全仓 release sequence；修改 cases 不能获得独立于 DSH release 的自然版本线。

每个 DSH package 必须提供统一的 ESM root、types、Cordis peer/dev dependency 和严格 `files` 清单。`scripts/check-workspace-constraints.ts:L335-L378`。package-specific runtime assets 不是任意允许的；中央 `packageFileExtras` 当前只为少数包列出 CSS、Python source、SQLite SQL resources、skill assets 等例外。`scripts/check-workspace-constraints.ts:L143-L177`。新增一个携带 benchmark content 的 package 必须修改这项中央 publication policy，或者先扩展 gate 使 manifest 能声明一种新的受控 pack artifact 类别。

Published package 还要通过 `publint`、packed payload closure 和 NodeNext consumer 检查；根脚本将 `publint` 纳入 hygiene，并在 build 后验证 package exports。`package.json:L20-L31`、`package.json:L65-L69`、`docs/development.md:L80-L92`。这些 gate 对代码 package 很有价值，但把每次 case 内容更新都变成 package build/release 工作，没有增加 measurement validity。

Package assets 在 DSH 中是可行的。`dsh-session-persistence-sqlite` 发布 `resources/sql/**/*.sql`，`dsh-skill-badge` 发布 `assets`。`packages/session/session-persistence-sqlite/package.json:L28-L33`、`packages/skill/skill-badge/package.json:L27-L32`。因此结论不是“npm 不能装 pack”，而是“npm package 应用于需要安装和执行的能力，不能默认成为所有 benchmark 内容的 identity 与发布单元”。

### 3. 当前 cases 已证明代码 package 与内容发布不一致

`@deepseek-ai/dsh-eval` 的 `files` 只包含 bundled JavaScript、invariant 和 declarations，没有 `cases/`。`packages/eval/eval/package.json:L13-L32`。本地 `npm pack --dry-run --json` 核验的 23 个 tarball entries 同样没有 cases；当前 worktree 中 `cases/` 有 168 个 `k11-v2` 文件和 39 个 `rbi-10000251-exec` 文件，共约 1.4 MiB。

当前 loader 接受调用方提供的显式 YAML/JSON 文件路径；目录发现被留给 host。`packages/eval/eval/src/case_loader.ts:L1-L24`、`packages/eval/eval/src/case_loader.ts:L27-L40`。实际 CLI 又直接读取目录、按扩展名 glob，并把 K11 semantic root、ambient date 和 K11 scope 作为参数默认。`packages/eval/eval-cli/src/main.ts:L121-L140`、`packages/eval/eval-cli/src/main.ts:L148-L181`、`packages/eval/eval-cli/src/main.ts:L197-L212`。

Cordis service 维护另一套目录发现：它默认指向 `packages/eval/eval/cases/k11-v2`，但只匹配 `^k11_\d+\.yaml$`；当前文件名是 `k11v2_*`。`packages/eval/eval-runner-service/src/index.ts:L372-L400`。data-agent bundle 又配置了不存在的 `packages/eval/eval/cases/k11`。`packages/bundle/data-agent/cordis.patch.yml:L196-L205`。这说明“host 直接持有 caseDir/glob”已经导致发布缺失和发现逻辑分叉。

当前 CLI 自己启动 mini Cordis context，并明确 fork service adapter；其 dependency list直接包含 Agent、LLM、MaxCompute、semantic-layer 和 eval runner 实现。`packages/eval/eval-cli/src/context.ts:L1-L20`、`packages/eval/eval-cli/package.json:L43-L70`。G10 已决定首版改为外部 CLI/SDK host 启动完整 production profile，并共享唯一 Evaluation Controller。`wayfinder/evaluation/tickets/G10-harness-bhe-split.md:L117-L121`。新的 pack resolution 因此不应继续绑在当前 CLI 的 `caseDir` 逻辑上。

### 4. 把 private material 放进同一个 npm package 不构成隔离

RBI source 文件包含 reference SQL、expected result、anchor 和 provenance。`packages/eval/eval/cases/rbi-10000251-exec/eval_10000251_037.yaml:L1-L34`。如果 public tasks 与这些字段一起发布到 Harness 安装目录，Node exports 不会形成文件系统安全边界；能使用 filesystem/shell 的 Agent 仍可能读取 package assets。

G10 已要求 Harness 只接收 `PublicPreparedTask` 和 opaque `GradingMaterialRef`；heldout/fresh 的 private material 默认由 Harness 无法读取的独立 grader process 或更强 sandbox 解析。`wayfinder/evaluation/tickets/G10-harness-bhe-split.md:L27-L31`。同一 ticket 还规定 Artifact 是 content-addressed immutable bytes，External Resource 不得伪装为 Artifact，并将 Evaluation Store、Artifact Store 与 Session Store 分离。`wayfinder/evaluation/tickets/G10-harness-bhe-split.md:L99-L109`、`wayfinder/evaluation/tickets/G10-harness-bhe-split.md:L147-L151`。

因此 package-per-pack 只有两种安全用法：只发布 public closure；或把 private package仅安装到 grader runtime。把 public/private 一起安装再依靠 `exports` 隐藏，不满足已经锁定的隔离要求。

### 5. 现有 content-addressed 能力可提供实现经验，但不是通用 Artifact Store

`ctx.attachments` 已经要求先持久化并验证 immutable image bytes，再返回 content-addressed reference；读取时再次校验 bytes 与 metadata。`packages/attachment/attachment/src/index.ts:L32-L92`。local Provider 将对象保存在 DSH home 下的 SHA-256 路径。`packages/attachment/attachment-local/README.md:L5-L7`。

该接口只服务 image attachment，并受 image admission policy 约束；README 明确把 generic files、audio 和 video 留给其他 lifecycle/provider contracts。`packages/attachment/attachment/README.md:L5-L9`、`packages/attachment/attachment/README.md:L19-L23`。现有 generic storage hub 又只提供 named backend 与 JSON/KV data forms，不提供 immutable byte artifact contract。`packages/storage/storage/src/index.ts:L1-L17`、`packages/storage/storage/src/backend.ts:L12-L26`。

首版 Benchmark Pack 可以复用 attachment 的原子提交、digest 验证和 orphan-GC经验，但不应把 pack 伪装成 image attachment，也不应把未实现的通用 Artifact Store 当作现成能力。

## 二、“独立内容 Artifact”到底是什么

它是**不执行代码、由内容确定身份的 benchmark 数据闭包**。最小 authoring 目录可以是：

```text
my-benchmark/
├── benchmark.yaml
├── cases/
├── public/
├── policies/
├── requirements/
└── private-refs/
```

运行前，repository implementation 执行以下工作：

```text
读取并校验 manifest
→ 解析受控相对引用
→ 拒绝逃出 pack root、循环、重复 identity 和未知 grading fields
→ 计算每个文件或 artifact 的 digest
→ 计算 canonical pack manifest 与 closure digest
→ 分离 public closure 和 opaque private references
→ 产出 ResolvedBenchmarkPack
```

正式 identity 是 digest，不是路径。`/Users/a/benchmarks/foo` 与 `/mnt/ci/foo` 只要 canonical closure 相同，就是同一 pack；同一路径下改了一个 case，则成为不同 pack。它既可以保存在普通本地目录，也可以被封装为 tar/zip 或写入 local CAS；“Artifact”描述 immutable/content-addressed 性质，不描述部署位置。

Authoring directory 与 sealed pack 应区分：作者可以修改目录；正式 Run 只能引用解析后已封口的 `BenchmarkPackRef`。这样首版无需建设远端 registry，也不会让可变路径冒充 benchmark identity。

## 三、实现选项

### A. 每个 Pack 一个 npm/Cordis Package

**接口。** Profile 安装 pack package；package bundle mount 一个 plugin；plugin 读取 package-relative assets 并向 evaluation registry 注册一个 pack。

**实现隐藏内容。** npm resolution、package-relative asset location、descriptor construction 和 mechanism registration。

**明确收益。** 公开、代码密集的 benchmark 可以一次安装齐全；依赖和 custom mechanisms 在 package manager 层 fail loud；package-relative assets 的模式已有 `dsh-skill-badge` 先例。

**主要问题。** 纯内容也进入全仓版本和 release family；每个 assets package 需要 publication gate 支持；case 更新触发 npm 发布；private bytes 若与 public content 同包则泄漏；profile 安装和 plugin activation 解决的是代码组合，不解决 content digest、closure、sealed identity 与 private resolver。

**深度判断。** 若 plugin 同时实现真正的 generator、compiler、fixture builder 或 Grading Mechanism，它是有价值的 module。若它只把 `new URL('../cases', import.meta.url)` 注册给另一个 loader，它几乎只是 locator glue，删除后复杂性只回到一行 profile config，属于浅模块。

**迁移影响。** 首次实现中等；长期每个 pack 的 package、README、invariant、build、release、asset allowlist 和 version maintenance 成本高。适合作为少数公开内置 demo/fixture 的可选分发方式，不适合作为 canonical pack model。

### B. Content-addressed Pack + `BenchmarkRepository` Provider

**接口。** Evaluation Host 显式提交一个 pack locator；Cordis composition 提供 `BenchmarkRepository`；repository resolve 后返回已校验、sealed、带 digest 的 `ResolvedBenchmarkPack`。

```ts
interface BenchmarkPackSelection {
  readonly locator: string
  readonly expectedDigest?: string
}

abstract class BenchmarkRepository {
  abstract resolve(selection: BenchmarkPackSelection, signal?: AbortSignal): Promise<ResolvedBenchmarkPack>
}
```

这里的 `locator` 是 host/provider configuration，不是持久化 identity；`ResolvedBenchmarkPack.identity` 才进入 Run Identity Graph。

**实现隐藏内容。** Manifest parsing、path confinement、schema validation、reference closure、digest canonicalization、public/private split、required mechanism collection、Artifact Store writes 和 error classification。

**明确收益。** 内容独立于 DSH release；private refs 可路由到 grader-only storage；CLI 可以直接选择本地路径；fresh/heldout/cohort 更新不创建 npm package；pack identity 与内容一致；旧 schema importer 可作为一次性编译步骤退出正常 runtime。

**主要问题。** 需要新增 pack format、repository Definition、local Provider、sealing tests 和 Artifact Store integration；若首版同时实现远端 discovery、上传、缓存和权限系统，会明显过建。

**深度判断。** `resolve()` 能隐藏足够多的校验、封口和隔离规则，是一个深 module。local directory 与后续 Artifact Store-backed implementation，加上 in-memory conformance adapter，使该 seam 不只是为了一个实现假设出来的包装。

**迁移影响。** 首次实现中等，长期内容维护最低。它与 G10 已锁定的 manifest、digest、Artifact Store 和 external host 决议最一致。

### C. Pack Plugin 注册 Descriptor/Locator

**接口。** 每个 pack plugin 在 `apply()` 中调用类似 `ctx.benchmarks.register(...)`，注册 pack id、locator、expected digest 和所需 mechanisms；Cordis effect 在 plugin unload 时撤销注册。

**实现隐藏内容。** Package-relative locator、pack alias 和可选 plugin-owned setup。

**明确收益。** 充分利用 profile/plugin install、effect-owned registration 和 Provider replacement；公开内置 pack 可随 DSH bundle 自动出现；pack 所需 companion code 能由 package dependencies保证已安装；HMR/unload 语义清楚。

**主要问题。** Locator 注册不能替代 B 的 repository implementation；仍需一个模块加载、校验、digest 和隔离内容。每个纯数据 pack 都增加 package与 plugin；profile 中是否安装某个 pack 会改变 composition identity；private pack 仍不能安全地与 Harness 同目录安装；动态 case/cohort 更新仍受 npm lifecycle约束。

**深度判断。** 作为独立 canonical 模型，它很浅；作为 B 上方的可选 alias/distribution adapter，它有合理价值。

**迁移影响。** 中等偏高，因为需要同时实现 registry 和 repository，且每个 pack 还要包化。适用于少数需要随 profile 提供的公开 pack，不适合作为首版唯一方式。

### D. DSH-native Hybrid：Cordis 管能力，Artifact 管内容

**接口。** `BenchmarkRepository` 是 Cordis Service Definition；首版 local Provider 接受显式 locator；pack 内容是 data artifact；只有 executable mechanisms 使用 companion plugins。可选的 pack-locator plugin 延后到确有“安装即发现”的需求时增加。

**明确收益。** 同时保留 Cordis 的 provider composition、dependency injection、effect lifecycle 和测试替换能力，以及内容 artifact 的 independent identity、private isolation 和快速迭代。它不需要远端 registry，也不要求普通 data-agent profile长期挂载 benchmark。

**主要问题。** 必须清楚区分 authoring directory、sealed pack、mechanism plugin 和 private-material provider；CLI 需要一个显式 selection syntax；首版要实现 local sealing，而不能继续把 path 当 identity。

**深度判断。** Pack repository 的一个 `resolve()` 隐藏完整 resolution pipeline；domain companion plugin 隐藏真正可执行的 grader/importer/fixture behavior。两种 module 都有清晰 interface 和足够 implementation，避免了“每个 YAML 目录一个 plugin”的浅层包装。

## 四、选项比较

| 维度 | A：每 Pack package/plugin | B：Artifact + Repository | C：Plugin locator | D：DSH-native hybrid |
| --- | --- | --- | --- | --- |
| 内容独立版本 | 弱；跟随 DSH/npm version | 强；digest 即 identity | 弱到中；locator 后仍需内容 identity | 强 |
| Cordis composition | 强 | Repository Provider 使用 Cordis | 强 | 强，且只用于能力 |
| Private material isolation | 同包时弱 | 强 | 同包时弱 | 强 |
| 本地首版 | package scaffolding 较重 | local Provider 即可 | registry + repository 双层 | local Provider + 显式 CLI ref |
| Fresh/cohort 更新 | 每次 npm release | 新 content digest | 通常仍需 package update | 新 content digest |
| Custom code | 自然 | 需 companion plugin | 自然 | companion plugin |
| 发布 gate 成本 | 每 pack 持续承担 | repository/runtime package承担一次 | 每 pack 持续承担 | 运行包承担一次 |
| 运行 identity | 仍需另算 content digest | 原生 | 仍需 repository 计算 | 原生 |
| Module depth | 代码密集 pack 可深；纯数据浅 | 深 | 单纯 locator 浅 | 深 |

## 五、推荐的最小首版

### 1. 新增一个 `BenchmarkRepository` Cordis capability

首版 interface 保持一个主要入口：

```ts
abstract class BenchmarkRepository {
  abstract resolve(selection: BenchmarkPackSelection, signal?: AbortSignal): Promise<ResolvedBenchmarkPack>
}
```

如果 CLI 暂无交互式 catalog 需求，不增加 `list()`、search、publish、upload、delete 或 remote sync。显式 locator 比隐式 discovery 更符合当前“misconfiguration fails loud”和 frozen identity 要求。

### 2. 首版只实现 local directory Provider

外部 CLI 接收：

```text
dsh-eval --profile <production-profile> --benchmark <directory>
```

Host 使用现有 profile boot 规则启动 production composition，再叠加 evaluation overlay；`BenchmarkRepository` local Provider 读取目录，完成 validation/sealing，并返回 resolved identity。Profile boot 已能从 installation/profile 两个 anchor 解析 bundle，并按 bundle、profile、launcher overlay 顺序组合。`packages/boot/app-boot/src/profile.ts:L314-L396`、`apps/cli/src/bin.ts:L27-L48`。

首版不实现：

- 远端 pack registry；
- 自动发现所有 pack；
- package name 到 pack 的魔法推断；
- mutable “latest” alias；
- pack HMR；
- upload/publish protocol；
- 网络 cache coherence。

### 3. Authoring source 与 sealed identity 分开

Repository 中可以维护普通目录，方便 LLM 和人编辑；正式 Run 前必须：

```text
validate source
→ canonicalize manifest closure
→ write/verify required immutable artifacts
→ seal BenchmarkPackRef
→ freeze ResolvedGradingPlan and requirements
```

`--benchmark` 路径不进入 Run Identity；sealed `BenchmarkPackRef`、case digests 和 required mechanism identities进入 Run Identity Graph。

### 4. Public 与 private material 使用不同可达范围

Local development/train 可以让同一 host 配置两个 roots，但 Harness 只得到 public closure 和 `GradingMaterialRef`。Heldout/fresh 时，private root/provider 只安装到 Grading Runtime process；不把 private files 放进 production profile、pack plugin 或 Harness-visible package tree。

### 5. 可执行逻辑继续使用 Cordis plugins

Pack manifest 只能声明 mechanism identity，不能内嵌脚本。以下内容属于 companion plugin：

- namespaced Grading Mechanism；
- external benchmark importer/compiler；
- Environment fixture builder；
- deterministic generator；
- provider-specific snapshot verifier。

Composition preflight 验证 manifest 引用的 exact mechanism 已注册；缺失、版本不兼容或 digest 不符时，在启动 Agent 前失败。

### 6. Package-carried public pack 只作为可选分发 adapter

若首版必须随 npm 安装提供一个公开 smoke/demo pack，可以采用 `dsh-skill-badge` 的 package-assets 模式：package 发布 `assets/`，plugin 注册 package-relative locator。该 package 仍必须计算 pack content digest，并且只能携带 public material。它不是 canonical format，也不应成为 heldout pack 的模板。

在增加此方式前，应把 package asset policy从中央 per-package allowlist 改为一种明确、可验证的 benchmark asset declaration；否则每个 pack 都需要编辑 `scripts/check-workspace-constraints.ts:L143-L177`，扩展性较差。

## 六、对外部 CLI Host 的解析流程

```text
1. CLI 解析 --profile 与 --benchmark
2. app-boot 加载 production profile + evaluation overlay
3. overlay 装载 BenchmarkRepository local Provider、Evaluation Controller、stores 和 grader client
4. Controller 调用 ctx.benchmarkRepository.resolve(selection)
5. Repository 校验并 seal pack，返回 ResolvedBenchmarkPack
6. composition preflight 验证 required mechanisms、Environment 与 Context bindings
7. Run Identity Graph 引用 BenchmarkPackIdentity digest
8. Controller 才创建 attempts 和真实 Agent sessions
```

CLI 不读取 case YAML、不 glob 文件名、不选择 grader、不解析 private material。这样 CLI 是薄 host，pack resolution 只有一个 owner。

## 七、迁移影响

| 工作项 | A：package-per-pack | B/D：local Repository + artifact pack | 说明 |
| --- | --- | --- | --- |
| Protocol schema | 中 | 中 | 两者都需要 canonical manifest、digest 和 public/private refs |
| Cordis runtime | 每 pack plugin + registry | 一个 Definition + local Provider | D 的运行能力更集中 |
| Publication tooling | 每 pack 持续修改/维护 | 仅新 runtime packages | 公开 demo package 是可选例外 |
| Legacy 207 cases | 拆入一个或多个 package | 一次性 compiler 生成 canonical pack | 两者都需要 parity；D 不保留旧 runtime loader |
| Private material | 需 public/private package split | grader-only repository/store | D 更直接满足 D2 |
| CLI migration | package name/discovery | `--benchmark <locator>` + repository resolve | 两者都应删除当前 glob/K11 defaults |
| Future cohort | npm release | 新 pack digest | D 的持续成本明显较低 |
| Remote registry | 非必需 | 首版非必需 | D 先用 local Provider |

建议实施顺序：

1. 在 Evaluation Protocol 中固定 `BenchmarkPackRef`、`BenchmarkPackIdentity`、manifest/case refs 和 resolution failures。
2. 增加 `BenchmarkRepository` Definition 与 local directory Provider；使用 in-memory test adapter完成 interface conformance。
3. 使用独立 Artifact Store 的 local Provider 完成 sealing；若 Artifact Store 尚未落地，可先实现同一工作切片中的 local CAS，不以 mutable source directory 作为正式 identity。
4. 将外部 CLI 改为显式 `--profile + --benchmark`，并由 production profile + evaluation overlay 启动唯一 Controller。
5. 通过一次性 importer 将 K11-v2/RBI 迁移到 canonical pack，记录字段保存、oracle validation、matched parity 和逐 case status。
6. 删除 `caseDir`、host-owned glob、旧 case loader normal path 和 service-side discovery。
7. 只有出现公开内置 pack 安装需求时，才增加 package-carried locator adapter；只有出现远端内容服务需求时，才增加 remote Repository Provider。

相对工作量判断：A 的初始代码可能略少，但持续发布和隔离成本最高；完整远端 B 首版过重；C 单独采用仍要补 B 的 loader；D 的首版新增一个 Definition、一个 local Provider、一套 seal/validation 和 CLI 接线，属于中等工作量，但把后续每个 pack 的增量降为数据与 validation，而不是新 package/runtime。

## 八、建议写入 G10 的决议

> Benchmark Pack 的 canonical form 是不执行代码、content-addressed、sealed 的数据 bundle；`BenchmarkRepository` 是负责解析、校验和封口 pack 的 Cordis capability。首版只提供 local directory/Artifact Store-backed Provider，并由外部 CLI 通过显式 locator 选择 pack，不建设远端 registry 或隐式 discovery。Grading Mechanism、importer、generator 和 Environment fixture 等可执行行为继续由 companion Cordis plugins 提供。每 pack 一个 plugin 不是默认要求；package-carried public pack 仅作为可选分发 adapter，private grading material 不得与 Harness-visible package 同装。

## 九、仍需在实现票中确定

以下是实现细节，不改变本报告的拓扑建议：

- authoring directory 的具体文件命名与 canonical serialization；
- sealed pack 是单一 archive Artifact，还是 root manifest 加多个 ArtifactRefs；
- local Provider 的 path confinement 和 symlink policy；
- Artifact Store 未完成时 local CAS 与 D22 最终接口的落包顺序；
- `BenchmarkRepository` 是否需要第二个 `inspect()` 方法，或由 `resolve()` 返回完整 diagnostics；
- public demo pack 是否值得作为 package asset 发布；
- private-material Provider 与 pack repository 是否共享 locator vocabulary。
