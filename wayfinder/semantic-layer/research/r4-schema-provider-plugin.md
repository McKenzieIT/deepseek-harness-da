# R4 — Schema Provider 插件化设计

## 1. 现有 Provider 模式分析

项目中已有两种成熟的 provider 注册模式，均基于 Cordis 服务框架：

### 1.1 LLM Provider 模式（`@deepseek-ai/dsh-llm` + `dsh-llm-dashscope`）

| 层级 | 角色 | 关键文件 |
|------|------|----------|
| Service Definition | `LlmRuntime extends Service`，声明 `ctx.llm` seam | `packages/llm/llm/src/index.ts` |
| Provider Plugin | `llm-dashscope`，Cordis 插件（`export const name/inject/Config/apply`） | `packages/llm/llm-dashscope/src/index.ts` |

**注册机制**：
- 插件 `export const inject = ['llm']`（声明对 `ctx.llm` 的依赖）
- `apply(ctx, config)` 中调用 `ctx.llm.registerAdapter([PROVIDER], adapter)` 注册路由
- `LlmRuntime` 持有一个 `Map<string, AdapterRegistration>`，通过 provider 路由名解析
- 支持 `registerConfigurableProviders` 声明可配置 provider 目录
- 支持 `registerModelDiscovery` 注册模型发现能力
- 注册返回 `AdapterRegistrationHandle`，包含 `replace()` 热替换 + disposer 析构
- 事件通知：每次注册/替换/析构后 emit `llm/adapters-updated`

**开发者最小步骤**：
1. 创建包，`export const name/inject/Config`
2. 实现 `LlmAdapter` 抽象类（核心：`stream()` + 可选 `listModels/resolveModel/providerInfo`）
3. `apply()` 中 `ctx.llm.registerAdapter([route], adapter)`
4. 在 `cordis.yml` 中启用插件

### 1.2 Query Provider 模式（`@deepseek-ai/dsh-query` + `dsh-query-maxcompute`）

| 层级 | 角色 | 关键文件 |
|------|------|----------|
| Service Definition | `QueryEngine extends Service`，声明 `ctx.query` seam | `packages/query/query/src/index.ts` |
| Provider Implementation | `MaxComputeQueryEngine extends QueryEngine` | `packages/query/query-maxcompute/src/index.ts` |

**注册机制**：
- `QueryEngine` 本身是抽象 Service（`super(ctx, 'query')`）
- Provider 直接继承 `QueryEngine`，自身就是 Service
- 通过 Cordis 插件系统加载后自动成为 `ctx.query` 实例
- 单 provider 独占（同一时刻只有一个 `ctx.query`），不需路由表
- 使用 `static inject = ['credentials']` 声明依赖
- 使用 `[Service.init]()` 生命周期钩子做 eager connect + dispose

**开发者最小步骤**：
1. 创建包，`export default class XxxQueryEngine extends QueryEngine`
2. 实现 4 个抽象方法：`execute/attach/cancel/getProgress`
3. 在 `cordis.yml` 中启用插件

### 1.3 共同 Pattern 总结

| Pattern | LLM | Query | 含义 |
|---------|-----|-------|------|
| Service Definition 独立包 | 是（`dsh-llm`） | 是（`dsh-query`） | 接口与实现分离 |
| `declare module '@deepseek-ai/cordis'` | `ctx.llm` | `ctx.query` | 全局 seam 声明 |
| 多 provider 路由 | 是（Map 路由表） | 否（单 provider 独占） | 取决于场景多样性 |
| 生命周期自动管理 | `ctx.effect` yield disposer | `[Service.init]` yield disposer | Cordis 统一 |
| Config 验证 | `schemastery` schema | `schemastery` schema | 统一校验 |
| 凭证解析 | `ctx.credentials.resolve(ref)` | `ctx.credentials.resolve(ref)` | PAT-not-in-env |

---

## 2. 当前 SchemaProvider 接口评估

```typescript
export interface SchemaProvider {
  discover(scopeId: string, kind?: string): Promise<readonly TableMeta[]>
  describe(tableName: string): Promise<TableMeta | null>
  sample(tableName: string, n?: number): Promise<string>
}
```

**当前注册方式**：`SemanticLayerService.setSchemaProvider(provider)` — 命令式注入，无生命周期管理。

### 2.1 优势

- 接口极简（3 个方法），职责清晰
- `TableMeta` 已涵盖 columns/partitions/comment，对关系型数据源足够
- `discover` 按 scopeId 隔离，支持多租户

### 2.2 不足/限制

| 问题 | 详情 |
|------|------|
| 无生命周期管理 | `setSchemaProvider` 不参与 Cordis dispose/init 周期；provider 死了无人知 |
| 单 provider 限制 | 当前 `private provider: SchemaProvider \| undefined` 只允许一个 |
| `describe` 无 scope 参数 | `describe(tableName)` 假设 tableName 全局唯一，多 scope 场景可能冲突 |
| `TableMeta` 只适用关系型 | 事件流（Kafka）、文档库（ES）、图数据库无法用 columns/partitions 描述 |
| 无错误分类 | 方法只 throw generic Error，无法区分 transport/auth/not-found |
| 无 cancel/abort | 长时间 discover/sample 无法取消 |

### 2.3 对非关系型数据源的适用性

- **事件流（Kafka/Flink）**：可将 topic 映射为 "table"，schema registry 字段映射为 columns；`sample` 可取最近 N 条。基本可适配，但语义有些牵强。
- **文档库（ES/MongoDB）**：字段数量动态、嵌套深，`TableMeta.columns` 的扁平 `{name, type, comment}` 无法表达嵌套结构。
- **图数据库（Neo4j）**：节点/边 schema 与 table 概念不同，需 `discoverNodes/discoverEdges`。
- **API 数据源**：无 "table" 概念，而是 endpoint + request/response schema。

**结论**：当前接口对关系型/伪关系型（宽表、分区表、Hive/MaxCompute）足够；对非关系型数据源需要 schema 抽象层的泛化（如引入 `DataSourceKind` 区分），但这属于后续扩展，不阻塞 P6b 的 MaxCompute 场景。

---

## 3. 多 Provider 场景

### 3.1 何时需要多 provider

| 场景 | 说明 |
|------|------|
| 同一 scope 多引擎 | MaxCompute + Hologres 同属一个分析 scope，前者做离线宽表、后者做实时维表 |
| 跨 scope 联合 | 用户在一个会话中跨 scope 查询（如 game_a 的事件表 + platform 的用户表） |
| 渐进迁移 | 老 provider 未下线、新 provider 已上线，并行运行 |

### 3.2 路由问题设计

参考 LLM 的 provider route 模式：

```
ctx.schema.discover(scopeId, kind)
  --> 按 scopeId 或 engine-type 路由到对应 SchemaProvider
```

**路由键选择**：
- **按 scopeId 前缀**：`maxcompute://project_a` -> MaxCompute provider，`hologres://db_b` -> Hologres provider。侵入性大，改变了 scopeId 的语义。
- **按 engine 名称注册**（推荐）：provider 注册时声明 `engineType: 'maxcompute'`，`SemanticLayerService` 内部维护 `Map<engineType, SchemaProvider>`。scope 的 config 声明 `engine: 'maxcompute'`，Service 据此路由。
- **按 scope config 显式绑定**：scope 的 `config.yaml` 中写 `schema_provider: 'maxcompute'`。最显式，但用户侧配置负担重。

### 3.3 推荐方案

短期（P6b）：维持单 provider，但将注册从 `setSchemaProvider` 改为 Cordis 插件式注册（生命周期安全）。
中期：引入 engine-type 路由表 `Map<string, SchemaProvider>`，scope config 声明 engine binding。

---

## 4. 推荐设计

### 4.1 接口演进

```typescript
/** 增强版 SchemaProvider：加入 signal + scope 传递 + 错误分类 */
export interface SchemaProvider {
  /** 该 provider 服务的 engine 类型标识（如 'maxcompute', 'hologres'）。 */
  readonly engineType: string

  /** 发现 scope 下的表/视图列表。 */
  discover(scopeId: string, opts?: { kind?: string; signal?: AbortSignal }): Promise<readonly TableMeta[]>

  /** 描述单表。tableName 在 scope 内唯一即可。 */
  describe(scopeId: string, tableName: string, signal?: AbortSignal): Promise<TableMeta | null>

  /** 采样 N 行。 */
  sample(scopeId: string, tableName: string, opts?: { n?: number; signal?: AbortSignal }): Promise<string>
}
```

关键变更：
1. **`describe/sample` 加入 `scopeId`** — 消除 tableName 全局唯一假设
2. **`signal` 参数** — 支持取消长时间操作
3. **`engineType` 只读属性** — 作为路由键
4. **保持 `TableMeta` 不变** — 对关系型足够；非关系型扩展留给后续

### 4.2 注册机制（对齐 LLM 模式）

```typescript
// packages/data/semantic-layer/src/index.ts 中新增：

export interface SchemaProviderRegistrationHandle {
  /** 析构：取消注册 + 触发生命周期清理 */
  (): void
}

export class SemanticLayerService extends Service {
  private providers = new Map<string, SchemaProvider>()

  /**
   * 注册一个 schema provider（按 engineType 路由）。
   * 同一 engineType 不可重复注册；disposed with the fiber。
   */
  registerSchemaProvider(provider: SchemaProvider): SchemaProviderRegistrationHandle {
    const engine = provider.engineType
    if (this.providers.has(engine)) {
      throw new Error(`schema provider for engine "${engine}" already registered`)
    }
    this.providers.set(engine, provider)
    // 返回 disposer
    return () => { this.providers.delete(engine) }
  }

  /** 按 scope config 的 engine binding 解析 provider */
  private resolveProvider(scopeId: string): SchemaProvider {
    // 短期：单 provider -> 取 Map 的唯一值
    // 中期：读 scope config 的 engine 字段 -> 按 engineType 查 Map
    const [first] = this.providers.values()
    if (!first) throw new Error('no schema provider registered')
    return first
  }
}
```

### 4.3 Provider 插件包结构（以 MaxCompute 为例）

```
packages/data/schema-maxcompute/
  package.json          # @deepseek-ai/dsh-schema-maxcompute
  src/
    index.ts            # Cordis plugin: name + inject + Config + apply
  tsconfig.json
```

```typescript
// packages/data/schema-maxcompute/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import type { SchemaProvider } from '@deepseek-ai/dsh-semantic-layer'

export const name = 'schema-maxcompute'
export const inject = ['schema']  // 声明对 ctx.schema 的依赖

export interface Config { /* maxcompute 连接配置 */ }
export const Config = z.object({ /* ... */ })

export function apply(ctx: Context, config: Config): void {
  const provider: SchemaProvider = new MaxComputeSchemaProvider(ctx, config)
  const handle = ctx.schema.registerSchemaProvider(provider)
  // Cordis 自动在 plugin dispose 时调用 handle()
  ctx.on('dispose', handle)
}
```

### 4.4 开发者最小步骤（新增一个 Schema Provider）

| 步骤 | 动作 |
|------|------|
| 1 | 创建包 `packages/data/schema-xxx/`，`package.json` 声明 `peerDependencies` 含 `@deepseek-ai/dsh-semantic-layer` |
| 2 | `src/index.ts` 导出 `name`, `inject: ['schema']`, `Config`, `apply` |
| 3 | 实现 `SchemaProvider` 接口的 3 个方法 + `engineType` 属性 |
| 4 | `apply()` 中调用 `ctx.schema.registerSchemaProvider(provider)` |
| 5 | 在 bundle 的 `cordis.yml` 中添加插件条目 |

**与现有模式的对齐度**：
- 注册 API 风格 = `ctx.llm.registerAdapter`（Map 路由 + disposer）
- 插件结构 = `llm-dashscope`（`name/inject/Config/apply` 四件套）
- 生命周期 = Cordis 标准（fiber dispose 自动析构）
- 配置验证 = `schemastery` schema

### 4.5 迁移路径（从当前 `setSchemaProvider` 到插件化）

1. **Phase 1**（P6b 收尾）：保留 `setSchemaProvider` 作为 deprecated 兼容，内部转发到 `registerSchemaProvider`
2. **Phase 2**（follow-up）：`schema-maxcompute` 插件包上线，`StandInSchemaProvider` 降级为 dev-only fixture
3. **Phase 3**（多引擎）：scope config 增加 `engine` 字段，`resolveProvider` 按 engineType 路由
