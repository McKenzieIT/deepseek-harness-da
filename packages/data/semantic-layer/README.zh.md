---
description: "@semantic-grounding/substrate 的 cordis 适配器：把 substrate 的 SemanticGroundingCore 作为 ctx.schema 提供，把 fiber 生命周期桥接到 core.dispose()，响应式接入可选的 audit 与 scopes 协作者，并提供把 ctx.llm 接入 enrichment seam 的 enrichment-llm-wiring 插件。"
kind: "package-reference"
---

# `@deepseek-ai/dsh-semantic-layer`

[English](README.md) | 中文

## 概述

`@semantic-grounding/substrate`（以 tarball 形式 vendored 在 `vendor-tarballs/` 下）之上的一层很薄的 cordis 适配器。语义层本身——定义 kind、别名与关系图、检索投影、enrichment、两级审计写路径——现在都住在 substrate 里，以 vendored tarball 的形式被消费。本包只是把它挂载进 dsh 的那个约 40 行的宿主外壳。

## 目录

- [开发备注](#dev-note)
- [提供了什么](#what-it-provides)
- [形态：`ctx.schema` 就是 core 本身](#shape-ctxschema-is-the-core)
- [可选协作者](#optional-collaborators)
- [结构](#structure)
- [验证](#verification)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-semantic-layer` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。

<a id="what-it-provides"></a>
## 提供了什么

两个 cordis 插件：

| 插件 | 入口 | 职责 |
| --- | --- | --- |
| `semantic-layer` | `src/index.ts`（default export） | 构造 `SemanticGroundingCore` 并作为 `ctx.schema` 提供。 |
| `enrichment-llm-wiring` | `src/llm-wiring-plugin.ts` | 把 `ctx.llm.stream()` 适配成 substrate 的 `TextLlm` 并调用 `wireEnrichmentLlm`，从而启用 LLM 语义轮。 |

两者由 `packages/bundle/data-agent/cordis.patch.yml` 作为两个独立的行分别挂载——第二个走的是本包 `exports["./src/*"]` 的深路径。

<a id="shape-ctxschema-is-the-core"></a>
## 形态：`ctx.schema` 就是 core 本身

`apply` 直接提供 `SemanticGroundingCore` 实例，不做任何转发。`SemanticGroundingCore` 声明了 24 个 `private` 成员，因此它是**名义**类型：一个转发式的 `class extends Service` 包装器无法赋值给它，绑定 tarball 的消费方也就永远无法用 substrate 自己的类来标注 `ctx.schema`。直接提供实例让每一处 `as SemanticGroundingCore` 断言都名副其实，可触达全部 32 个公开成员，也不留下任何会漂移的转发代码。

`ctx.effect(() => () => core.dispose())` 是 fiber↔core 的生命周期桥。`core.dispose()` 会释放 core 自己持有的数据源 kind 注册与关系图缓存失效监听；没有它，被撤销的 kind 的节点会在 fiber 重载后残留在缓存图中。

<a id="optional-collaborators"></a>
## 可选协作者

`audit` 与 `scopes` 被刻意排除在插件的 `inject` 列表之外——无论它们是否存在，`ctx.schema` 都必须能挂载。它们通过嵌套的 `ctx.inject(...)` 子 fiber 接入，而子 fiber 只约束自身。接入是响应式而非一次性的，因为宿主可能在语义层挂载**之后**才提供这两个服务；一次性的 apply 期探测会把 `undefined` 永久锁死。

在 `audit` 未挂载期间，Tier-2 recorder 保持 `undefined`，并且**任何可审计写入都会抛错**。这是刻意的（D5 / ADR-0001）：这里没有静默的 no-op recorder。关闭审计只有在显式传入一个 no-op recorder 时才成立，绝不能是接线事故的结果。

<a id="structure"></a>
## 结构

```
src/index.ts              the semantic-layer adapter plugin (ctx.schema)
src/llm-wiring-plugin.ts  the enrichment-llm-wiring plugin
tests/service-wiring.spec.ts   the lifetime bridge (1 test)
tests/llm-wiring-cl8.spec.ts   provider/model resolution (5 tests)
```

substrate 自己的领域测试套件在 substrate 仓库里是绿的；dsh 不重复测试自己的依赖。本包唯一自有的行为就是生命周期桥与 CL8 的 provider/model 解析，这正是 `tests/` 所覆盖的内容。

<a id="verification"></a>
## 验证

```bash
pnpm vitest run packages/data/semantic-layer/tests/
pnpm run verify-cordis-config
```

`apps/web/tests/semantic-graph-remote.e2e.ts` 是本适配器的契约测试：它跨真实 Remote 边界验证 default export、`ctx.schema` 的 Context 增强、`Config` schema 以及 `schema` 这个服务名。

<a id="model-experience"></a>
## Model Experience

### Discovered table descriptions

#### What the model sees

`ctx.schema.describe(tableName)` 返回一个 `TableMeta`，携带表的 `table_name`、`columns`（每个含 `name`、物理 `type` 和可选 `comment`，由连接器原样返回）、`partitions`（`name` / `type`）及可选的表 `comment`；`discover(scopeId, kind?)` 枚举一个 scope 中可用的表，`sample(tableName, n?)` 返回格式化的行样本。NL→SQL 引擎将这些发现的数据源描述渲染为候选表上下文送入模型 prompt。Live-engine `discover` / `describe` / `sample` 在 query provider 挂载前抛 "no provider"（见 Known Limitations）。

##### Sample discovered table description

```markdown
table_name: dws_trade_order_di
comment: trade order detail fact table
columns:
  - name: order_id
    type: string
    comment: order id
  - name: pay_amt
    type: decimal
    comment: payment amount
partitions:
  - name: ds
    type: string
```

#### Token effect

描述 token 随每个发现表的列和分区数扩展，`discover` 将此乘以 scope 中的表数；`sample` 添加一个有界额外块。该上下文在每个 NL→SQL turn 中包含。

#### KV Cache effect

表描述在相同表或 scope 上的 NL→SQL turn 间重复，故描述块位于可复用请求前缀中，可被缓存。`syncWrite` Tier-2 刷新覆盖 `columns` 或 `partitions` 时使受影响表的缓存上下文失效；不相关的表保持可缓存。

### Substrate definition params

#### What the model sees

`ctx.schema.loadEventDefinition(name)` 和 `loadTableDefinition(name)` 返回经验证的 substrate definitions，其列和参数 `type` 值经 `canonicalizeType` 规范化为一个小型 DB 无关词汇，使模型永不见方言噪声（bigint 和 int8 均变为 `int`）。event `params_fields` 和 table `partitions` 是 P13b `CriticGuardData` 切换到 `makeCriticCtx({ candidateTables, eventParams, partitionCols })` 的内容，为模型执行的 SQL critique 提供 grounding。

#### Token effect

参数和分区 token 随 event 或 table 字段数扩展，在每个 critique turn 中包含；`load_*` 为同步读取，故仅匹配的定义贡献 token。

#### KV Cache effect

Substrate definitions 在磁盘上稳定，故其渲染上下文作为可缓存前缀在相同定义的 critique 间重复。`syncWrite` 或 `updateTableMeta` Tier-2 写入更改定义时仅使该定义的缓存上下文失效。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **领域相关的限制随领域代码一起搬走了。** live-engine provider、写入时规范化、定义名路径穿越防护、`updateTableMeta` 并发锁现在都是 `@semantic-grounding/substrate` 的事，在那边跟踪，不在这里。
- **`ctx.schema` 不在本仓生成的 Cordis catalog 里。** adapter 提供的实例，其类随 tarball 发布，所以 catalog 那个只走源码的投影渲染不出来；改为在 `SERVICE_WALK_EXEMPTIONS` 里具名。这个接缝的 API 参考该住哪，仍是未决问题。
- **`SemanticLayerConfig` 在本地声明，需要人工跟住底座。** 插件的 config 类型必须住在自己的包里（`gen-config-catalog` 强制），所以这个 interface 和它的 `corpusVariant` 联合类型是对底座的有意复制；底座那边改了不会让这里编译失败，而是静默漂移。
- **底座不是 release member，所以它没发布之前 dsh 发不了版。** 本包**是** release member（`packages/*/*`），所以 `release:pack` 会打包它，而 `release:verify-packed-install` 会去 registry 解析 `@semantic-grounding/substrate` —— 那里目前是 E404，因为 `file:` override 只在本工作区内生效。**发布 `@semantic-grounding/substrate` 是下一次 dsh 发版的阻塞前置条件。** （该发布 lane 今天在 master 上本来就因为一个无关的 `koffi` 原生构建而红着，且发布只能由 `workflow_dispatch` 手动触发，所以这条没有阻塞本次切换。）
- **`setScopeRegistry(ctx.get('scopes') as never)` 是未检查的强制转换。** 底座没有导出 `ScopeRegistryLike`，所以 scope registry 的形状在这个边界上没有被校验。
