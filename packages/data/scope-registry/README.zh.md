# `@deepseek-ai/dsh-scope-registry`

[English](README.md) | 中文

按 scope 的命名空间注册表（`ctx.scopes`）：数据 agent 的 scope 定义运行时可变存储。每个 scope 将一个 id 映射到文件系统 `semanticRoot` 路径及可选元数据（当前提供方、项目名、引擎类型等）。注册表持久化到磁盘上的 YAML 文件；Cordis 静态配置告诉服务该文件位于何处（`registryPath`），而文件本身是运行时可变状态，可由 CLI（命令行界面）、API、Web UI 读写。

这是 [`@deepseek-ai/dsh-semantic-layer`](../semantic-layer) 服务消费的 scope seam：active scope id 决定语义层扫描哪个 `semanticRoot` 来查找 `config.yaml`/`events/`/`tables/`，因此切换 scope 即重新确立模型推理所依赖的语料。

## 状态：已注册 + 可调用；在 bundle 挂载时配置

该服务由 data-agent bundle patch（`packages/bundle/data-agent/cordis.patch.yml`、`scope-registry`）注册，并在全局 Cordis 上下文上挂载 `ctx.scopes`。当 `registryPath` 为空（默认静态配置）时，该服务为 inert：返回空的 scope 列表，`active()` / `activeId()` 返回 `undefined`，且任何写 API 调用都会抛出 "registryPath not configured"，而非静默 no-op。真实的 profile 会配置 `registryPath` 指向某个 `scopes.yaml` 文件；YAML 缺失或为空时按“无 scope”处理（不会崩溃）。

## 设计

- **Cordis 配置 = WHERE** 注册表位于何处（静态，在 bundle 挂载时设定）。
- **注册表 YAML = WHAT** 存在哪些 scope 以及哪个为 active（运行时可变）。
- **Scope = 纯命名空间**；id 除作为键之外不承载任何语义。
- **active scope 是进程级单例**；切换时发出事件，使消费方（SemanticLayerService、审计、查询引擎）能够响应。
- **所有变更都是原子的**（通过 `withFileLock` + `writeFileAtomic` 实现跨进程安全）；每次调用都从磁盘重新加载（文件很小，无需缓存）。

## 配置

```ts ignore-check
export interface ScopeRegistryConfig {
  /** Path to the scopes.yaml registry file. Empty = service is inert (no scopes). */
  readonly registryPath: string
}
```

`registryPath` 是经过校验的 Cordis `z.string()` 配置字段（默认 `''`）。以 `~/` 为前缀的路径会相对于 `os.homedir()` 展开。不存在硬编码的可调参数：每个旋钮都是经过校验的 Config 字段。

## Cordis seam

该服务声明 `ctx.scopes` 属性与两个带类型的事件：

```ts ignore-check
declare module '@deepseek-ai/cordis' {
  interface Context {
    scopes: ScopeRegistryService
  }
  interface Events {
    /** Fired after register()/remove() changes the scope set (not on pure active switch). @mode emit */
    'scopes/changed': () => void
    /** Fired after the active scope id changes. @param scopeId - new active id, or undefined. @mode emit */
    'scopes/active-changed': (scopeId: string | undefined) => void
  }
}
```

`scopes/changed` 在已注册 scope 集合发生变更（register / remove）之后触发；纯粹的 active-scope 切换（`setActive` / `clearActive`）不会触发它。`scopes/active-changed` 在 active id 变更之后触发，途径包括 `setActive`、`clearActive`、`register()` 将首个 scope 设为 active、或 `remove()` 使原先 active 的 scope 不再 active。事件仅在 `mutate()` 写入提交之后才触发（状态在其提交点发布）。

## 验证

```sh
tsc -b packages/data/scope-registry/tsconfig.json
pnpm vitest run packages/data/scope-registry
pnpm verify-cordis-config
```

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

该包的贡献对可复用的请求前缀是仅追加的，不会使先前的缓存条目失效。

## 已知限制与延后事项

- **默认 inert（`registryPath` 为空）**：在默认空 `registryPath` 下，服务不加载任何文件，`list()` 返回 `[]`，`active()` / `activeId()` 返回 `undefined`；写 API 调用抛出 "registryPath not configured"。真实的 `scopes.yaml` 路径在 profile / 运行时层面（bundle patch）配置，而非作为默认值发布。
- **进程级 active-scope 单例**：active scope 是从 YAML 文件读取的进程级值，而非跨进程的分布式锁。注册表文件本身是跨进程安全的（文件锁 + 原子写），但两个进程若各自写入了一个 active scope，就可以持有不同的 active scope；`scopes/active-changed` 事件只在执行切换的那个进程中触发。跨进程的 active-scope 协调层推迟实现。
- **每次调用都从磁盘重新加载**：`load()` 在每次 `list` / `get` / `active` 调用时都重新读取 YAML（无内存缓存）。这是有意为之（文件很小，且使各进程的消费方保持一致），但这意味着读路径并非 zero-copy；缓存 + 失效钩子推迟到性能分析表明其有影响时再实现。
- **下游惰性检测 scope 切换**：`SemanticLayerService` 在 `corpusVersion()` 中惰性检测 scope 切换（无 `scopes/active-changed` 监听器），方式是将 active id 与上次见到的 id 比较；这是设计使然（无事件监听器，包括切回的情况在内均正确）。基于事件的即时失效连线是故意未添加的。
- **无包级运行时 invariant**：本包不附带 `src/invariant.ts`；D3 包的 invariants 是集中注册的，`verify-package-invariants` 在没有包级 invariant 文件时也能通过。添加包级运行时 invariant 并非必需。
