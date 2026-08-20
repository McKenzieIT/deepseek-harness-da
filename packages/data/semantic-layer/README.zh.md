# `@deepseek-ai/dsh-semantic-layer`

[English](README.md) | 中文

data agent 的 semantic-layer **substrate**：zod 镜像的 RBI pydantic `EventDefinition` / `TableDefinition` + reader/writer + `BasicIndex` + write-tiers + `ctx.schema` seam。P6b 生产硬化（移植一次性 `prototypes/p6-semantic-layer/`）。

Semantic layer 是 data agent 的 **一等公民** — NL→SQL 的成功依赖它（MDL / metric layer / Text2DSL）。substrate 保持与 RBI 531 条精选 tables/events/terminology 的交叉兼容（zod 镜像 pydantic `extra=allow` / `model_validator` / `canonicalize_type` / round-trip）。

## P6b grilling（5 个决策，全选 A）

- **Q1 包形态**：`packages/data/semantic-layer/` 单包（`@deepseek-ai/dsh-semantic-layer`），group=data（与 `audit` / `phase-gate` / `nl2sql-engine` 一致）。`load_*` model-facing tools 延期为独立 tool 包（镜像 `tool-search-data-sources`；preset 已命名为 `dsh-tool-load-table-definition` / `dsh-tool-load-event-definition`）。独立分析 grounded 此决策：data capability packages 为单包 Services；tools 始终与其 Service 包分离；独立 `semantic/` group 对单包属过度抽象。
- **Q2 seam 范围**：`ctx.schema` 覆盖 live-ODPS（`discover` / `describe` / `sample`）和 substrate definitions（`loadEventDefinition` / `loadTableDefinition`）。P13b `CriticGuardData` 切换到 `ctx.schema.load_*`（params_fields / partitions）。
- **Q3 live-ODPS 实现**：延期 — P6b 发布 Service Definition + substrate + 同步 demo/测试用 stand-in provider；真实 MaxCompute provider（query-maxcompute sidecar 添加 schema tools，或独立 `schema-maxcompute`）为后续工作。`discover` / `describe` / `sample` 在未挂载时抛 "no provider"；P13b swap 仅需 substrate definitions，故不受阻。
- **Q4 Tier-2 audit**：经 `ctx.audit.recordTier2Write`（P8b 真实 sqlite audit）路由，不用原型的 flat JSON log — 统一审计轨迹，内网安全优先。substrate `Tier2Recorder` 接口由 `ctx.audit` 满足；audit 未挂载时 Tier-2 写操作 fail-loud（D5 "不可关"）。
- **grounded**：`zod`（镜像 pydantic；`schemastery` 无 `.passthrough`）+ `js-yaml` substrate 依赖；复用 `@deepseek-ai/dsh-atomic-write`（`writeFileAtomic`：temp+wx+rename，mode 打戳）做原子写入。

## 结构

| 文件 | 职责 |
| --- | --- |
| `src/types.ts` | zod schemas 镜像 RBI pydantic（`EventDefinition` / `TableDefinition` + 子模型、`TableMeta`、`canonicalizeType`）。 |
| `src/io.ts` | reader（sync）/ writer（async via `writeFileAtomic`）/ sync-write / cache-invalidate（ADR-0011）/ `Tier2Recorder` 接口。 |
| `src/basic-index.ts` | `BasicIndex` — 无依赖查找加速器；失效时重建（非验证缓存）。 |
| `src/pending.ts` | Tier-1 pending 队列（suggest -> pending -> approve；approve 侧由 P9 门控）。Tier-2 是 `ctx.audit`（不在此处）。 |
| `src/index.ts` | `ctx.schema` Service Definition（`SemanticLayerService`）+ `SchemaProvider` 接口 + `StandInSchemaProvider` + substrate re-exports。 |

## `ctx.schema` seam

```ts
import type { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
declare module '@deepseek-ai/cordis' { interface Context { schema: SemanticLayerService } }
```

- `loadEventDefinition(name)` / `loadTableDefinition(name)` — substrate definitions（P13b swap 目标：`params_fields` / `partitions`）。
- `discover(scopeId, kind?)` / `describe(table)` / `sample(table, n?)` — live-ODPS（延期；`setSchemaProvider` 挂载真实 provider）。
- `syncWrite(metas, opts)` / `updateTableMeta(name, updates, opts)` — Tier-2 持久化写入经 `ctx.audit.recordTier2Write`。

## P13b swap

P13b 的本地 `CriticGuardData`（params_fields/partitions 来自精简 YAML reader）additive swap 到 `ctx.schema.load_*`。`CriticCtx{candidateTables, eventParams, partitionCols}` 契约不变；P13b engine 逻辑不变。`makeCriticCtx({ candidateTables, eventParams: EventDefinition.params_fields, partitionCols: TableDefinition.partitions.map(p => p.name) })`。

## 验证

```sh
tsc -b packages/data/semantic-layer/tsconfig.json   # typecheck
pnpm vitest run packages/data/semantic-layer        # 5 scenarios (4 prototype + P13b swap)
pnpm verify-cordis-config                            # bundle/preset mount resolves
```

Bundle 连线（`packages/bundle/data-agent/cordis.patch.yml` 中的 `semantic-layer` 行）在 live-ODPS provider + `load_*` tool 包就绪后作为后续工作添加。

## Model Experience

### Discovered table descriptions

#### What the model sees

`ctx.schema.describe(tableName)` 返回一个 `TableMeta`，携带表的 `table_name`、`columns`（每个含 `name`、物理 `type` 和可选 `comment`，由连接器原样返回）、`partitions`（`name` / `type`）及可选的表 `comment`；`discover(scopeId, kind?)` 枚举一个 scope 中可用的表，`sample(tableName, n?)` 返回格式化的行样本。NL→SQL 引擎将这些发现的数据源描述渲染为候选表上下文送入模型 prompt。Live-ODPS `discover` / `describe` / `sample` 在 MaxCompute provider 挂载前抛 "no provider"（见 Known Limitations）。

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

## Known Limitations and Deferred Work

- **Live-ODPS provider** — `discover` / `describe` / `sample` 在真实 MaxCompute provider（query-maxcompute sidecar 或独立 `schema-maxcompute`）挂载前抛 "no provider"。延期至后续票。
- **`load_*` model-facing tool 包** — `load_table_definition` / `load_event_definition` 延期为独立 tool 包（preset 中命名为 `dsh-tool-load-table-definition` / `dsh-tool-load-event-definition`）。
- **写入时规范化** — `writeTable` / `updateTableMeta` 写入原始数据；磁盘上对规范格式的忠实性延期（加载数据已为规范格式，P13b swap 不受影响）。
- **定义名路径穿越防护** — 拒绝定义名中的 `/` `\` `..` 延期（内网安全优先的纵深防御；当前无 model-facing tool 直接调用这些方法）。
- **`updateTableMeta` 并发锁** — read-merge-write 应包裹 `withFileLock`（`@deepseek-ai/dsh-atomic-write`）以保证并发安全。自原型延期。
- **Bundle 连线** — `cordis.patch.yml` 中的 `semantic-layer` 行待 live-ODPS provider + tool 包就绪后添加。
