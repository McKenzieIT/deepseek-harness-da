# R3 — Deepseek Harness 插件化设计

## 1. Cordis 框架核心概念

### Context（上下文）

- `Context` 是 Cordis 的核心容器，本质是一个 **Proxy 对象**——所有属性读取经过 `ReflectService.handler` 代理解析到已注册的 Service 实例。
- 根 Context 在构造时安装 4 个内置服务：`events`、`logger`、`reflect`、`registry`。
- 子 Context 通过 `extend(meta)`、`isolate(name)`、`intercept(name, config)` 创建；原型链继承，父不被修改。
- `isolate(name)` 为指定 service 创建独立 scope（隔离命名空间），两个 isolate 传相同 label 则共享作用域。
- `intercept(name, config)` 向子树中的插件注入 service 级的配置覆盖，祖先→子孙顺序合并。

### Service（服务基类）

- 通过 `super(ctx, name)` 注册：调用 `ctx.reflect.provide(name, this, check)`。
- 若声明了 `[Service.invoke]`，返回的实例是 **callable**（可当函数调用，如 `ctx.logger(name)`）。
- `[Service.resolveConfig]` 合并 intercept 链上所有配置片段（base → ancestor intercepts → head）。
- `[Service.check]` 可选可用性谓词——仅当返回 true 时，依赖该 service 的 fiber 才可激活。

### inject / provide

- **provide**：`ctx.reflect.provide(name, value, check?)` 注册服务实现，返回 disposer。
- **inject**：插件声明 `static inject = ['tools']` 或 `@Inject('tools')` 装饰器，Cordis 在 Fiber 激活前检查所有依赖是否已 provide。依赖缺失时 Fiber 停留在 PENDING 状态，服务到达时自动唤醒。

### Fiber 生命周期

| 状态 | 含义 |
|------|------|
| PENDING | 等待所需 service 到位 |
| LOADING | 插件 callback 正在执行 |
| ACTIVE | 已加载且正在提供服务 |
| FAILED | callback 或 config 验证抛错 |
| UNLOADING | disposer 正在运行 |
| DISPOSED | Fiber 已移除，不可重启 |

Fiber 维护一个 `DisposableList`：通过 `ctx.effect(execute, label)` 注册 cleanup-aware 的副作用，在 unload 时逆序执行 disposer。Fiber 还拥有 validated `config`、`store`（依赖快照）、`uid`（注册序号）。

---

## 2. 插件注册机制

### 三种插件形态

```ts
// 1. 函数插件（最常用）
export function apply(ctx: Context, config: Config): void { ... }

// 2. 类插件（Service 子类）
export class MyService extends Service { ... }
export default MyService

// 3. 对象插件
export default { apply(ctx, config) { ... } }
```

### Service 子类注册模式

```ts
export class SemanticLayerService extends Service {
  static Config = z.object({ semanticRoot: z.string().default('') })
  // static inject = ['audit']  ← 可选依赖声明
  // static provide = 'schema' ← 或在 super(ctx, 'schema') 中指定

  constructor(ctx: Context, config: SemanticLayerConfig) {
    super(ctx, 'schema')  // 注册到 ctx.schema
    ...
  }
}
export default SemanticLayerService
```

### 函数插件注册模式（工具类）

```ts
export const name = 'tool-search-data-sources'
export const inject = ['tools']       // 依赖声明
export const Config = z.object(...)   // standard-schema 验证
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({ ... }))
}
```

### 关键导出约定

| 导出字段 | 作用 |
|----------|------|
| `name` | 插件显示名（日志/诊断用） |
| `inject` | 数组或对象形式的依赖列表 |
| `provide` | 提供的 service 名 |
| `Config` | StandardSchemaV1 验证器（如 zod schema） |
| `apply` / `default` | 插件入口 |

### 依赖解析流程

1. `ctx.plugin(plugin, config)` → `RegistryService.plugin()` → 创建 `Plugin.Runtime` 和 `Fiber`。
2. Fiber 构造时：`Inject.resolve(plugin.inject)` 得到 `{ name: interceptConfig | null }`。
3. 对每个依赖调用 `_checkImpl(name)` 检查是否已 provide 且 check 通过。
4. `_refresh()` 计算 epoch：全部就绪则触发 `_reload()`，缺少任一则保持 PENDING。
5. `_reload()` 中执行 `resolveConfig(runtime, config)` 验证配置后调用 `runtime.callback(ctx, config)`。

---

## 3. Bundle 组合机制

### cordis.patch.yml 语法

Bundle 通过 YAML patch 文件组合插件树。base 定义共享插件列表，上层 bundle（如 data-agent）叠加修改。

```yaml
# ── 禁用某行（按 id 精确匹配） ─────────────
- id: tool-str-replace-editor
  disabled: true

# ── 插入新行 ───────────────────────────────
- insert:
    - id: semantic-layer
      name: '@deepseek-ai/dsh-semantic-layer'
      # config: { ... }   ← 可选配置覆盖

# ── 修改现有行的 config ─────────────────────
- id: agent-default-model
  config:
    provider: aga
    model: qwen3.7-max
```

### 语法要素

| 字段 | 说明 |
|------|------|
| `id` | 行标识（全局唯一） |
| `name` | npm 包名（Cordis 插件 specifier） |
| `disabled: true` | 停用而非删除（不影响上游 base 排序） |
| `config` | 覆盖整行 config（非 merge，全量替换） |
| `insert` | 新增行列表（与 disable 互斥） |

### 组合层次（从底到顶，后写覆盖）

1. `packages/bundle/base/cordis.patch.yml` — 共享核心（timer, hmr, llm, session, agent, settings…）
2. `packages/bundle/headless/cordis.patch.yml` — headless 模式
3. `packages/bundle/web-app/cordis.patch.yml` — web UI 模式
4. `packages/bundle/data-agent/cordis.patch.yml` — data-agent 叠加层

### 设计原则

- **disable-only, not delete**：禁用保留引用，防止上游重排时意外复活。
- **最后写入者胜（last-write-wins per row）**：相同 id 的 config 由最后一层完全覆盖。
- **行顺序无语义（activation is service-availability driven）**：Cordis 的依赖注入决定启动顺序，YAML 中的排列只为可读性。

---

## 4. Client UI Slot 系统

### 核心概念

`SlotCore`（`@deepseek-ai/dsh-client-ui-slots`）是一个纯注册中心，不依赖 React 运行时。

### SlotMap 声明合并

插件通过 TypeScript 的 `declare module` augmentation 向 `SlotMap` 接口追加 slot 定义：

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
  }
}
```

### Slot 种类（kind）

| Kind | 行为 |
|------|------|
| `single` | 单占位（只有一个 winner 渲染） |
| `list` | 有序列表（每项有 id, order, label） |
| `keyed` | key 分发（每 key 一个占位） |
| `chain` | 选择器路由链（selector 首个非 null 胜） |

### Slot 作用域（scope）

| Scope | 含义 |
|-------|------|
| `root` | 全局（无需 session） |
| `session` | 严格会话绑定（框架注入 sessionId） |
| `session-maybe` | 会话可选（sessionId 可能为 undefined） |

### register() 调用

```ts
ctx.slots.register({
  name: 'sidebar',             // 目标 slot key
  locale: 'sidebar',           // i18n namespace
  children: {                  // 声明子 slot
    'sidebar.brand.mark': { kind: 'single', scope: 'root' },
    'sidebar.workspaces': { kind: 'single', scope: 'root' },
  },
  inject: () => ({ ... }),     // 业务注入
  store: handle,               // zustand-style store seat
}, SidebarRoot)                // React 组件
```

返回 disposer：移除注册并级联折叠其声明的子 slot。

### 现有核心 Slot 树（layout 根声明）

```
root (single, root)
├── sidebar (single, root)
│   ├── sidebar.brand.mark (single, root)
│   ├── sidebar.brand.name (single, root)
│   ├── sidebar.workspaces (single, root)
│   ├── sidebar.settings (single, root)
│   └── sidebar.footer.action (list, root)
├── conversation (single, session-maybe)
├── details (single, session)
└── shell.overlay (list, root)
```

### 额外机制

- **priority 遮蔽**：同一 cell 注册不同 priority 时，最低 priority 渲染（高 priority 被遮蔽）。
- **abdication**：组件崩溃时可 abdicate（退出 cell），下一个 survivor 补位。
- **LocaleNamespaceMap**：与 SlotMap 相同的 declare-module 合并，用于 i18n namespace 注册。

---

## 5. 新增功能插件的完整步骤

### Host-side 插件（Service / Tool）

1. **创建 package**：`packages/data/<name>/` 或 `packages/host/<name>/`，在 `pnpm-workspace.yaml` 中确认 glob 覆盖。

2. **编写 package.json**：
   ```json
   {
     "name": "@deepseek-ai/dsh-<name>",
     "type": "module",
     "main": "src/index.ts",
     "peerDependencies": { "@deepseek-ai/cordis": "..." }
   }
   ```

3. **编写入口 `src/index.ts`**：
   - Service 形式：`export class XxxService extends Service { ... }; export default XxxService`
   - Tool 形式：`export const inject = ['tools']; export function apply(ctx, config) { ctx.tools.register(...) }`
   - 导出 `name`、`inject`、`Config`（zod schema）。

4. **declare module 扩展 Context 类型**（Service 形式）：
   ```ts
   declare module '@deepseek-ai/cordis' {
     interface Context { myService: MyService }
   }
   ```

5. **在 bundle patch 中挂载**：
   ```yaml
   - insert:
       - id: my-service
         name: '@deepseek-ai/dsh-<name>'
         # config: { ... }
   ```

6. **pnpm install** 并验证：`dsh --dump-config` 确认行出现。

7. **编写测试**：单元测试可直接 `new Context()` → `ctx.plugin(MyPlugin, config)` → `await fiber`。

### Client-side 插件（UI Slot 注册）

1. **创建 package**：`packages/client/ui-<name>/src/client/index.ts`。

2. **declare module 扩展 SlotMap**（若新增 slot）：
   ```ts
   declare module '@deepseek-ai/dsh-client-ui-slots' {
     interface SlotMap { 'my.slot': { kind: 'single'; scope: 'root' } }
   }
   ```

3. **注册到已有 slot** 或 **声明子 slot 并贡献组件**：
   ```ts
   export const inject = ['slots', 'locale']
   export function apply(ctx: ClientContext): void {
     ctx.effect(() => ctx.slots.register({
       name: '<parent-slot-key>',
       children: { ... },
       inject: () => ({ ... }),
     }, MyComponent), 'label')
   }
   ```

4. **i18n**：实现 `LocaleNamespaceMap` merge + `ctx.locale.register(ns, { zh, en })`。

5. **在 client bundle 或 host patch 中挂载**（client 侧 cordis 同理）。

### Checklist 总结

- [ ] 创建 package 并加入 workspace
- [ ] 编写入口（apply/Service + Config + inject + name）
- [ ] declare module 类型扩展
- [ ] 在目标 bundle 的 cordis.patch.yml 中 insert/enable
- [ ] pnpm install + verify-cordis-config
- [ ] 编写测试（host: vitest; client: vitest + client spec）
- [ ] 确认 `dsh --dump-config` 显示正确的行和 config
