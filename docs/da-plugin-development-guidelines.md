# dsh-data-agent 插件化开发准则

> 本文档定义 dsh-data-agent 项目如何基于 dsh（DeepSeek Harness）的 Cordis 插件框架进行开发。所有功能开发必须遵循本准则。

## 1. Cordis 核心理念（Why）

### 1.1 没有特权核心

> "There is no privileged core to patch: you extend dsh by mounting a plugin beside the others, and registrations are effects that unwind when their plugin unloads."

含义：dsh 的每个部分——agent loop、LLM adapter、tool registry、session log——都是 cordis.yml 中的一行。没有任何代码具有"不可替换"的特权。扩展 = 在旁边挂一个插件，不是修改已有插件。

### 1.2 Inject 取代 Import

插件通过 `inject: ['serviceName']` 声明依赖，不通过 `import` 绑定到具体实现。这意味着：
- **Provider 可替换**：composition 选择谁提供 `ctx.shell`，Consumer 不知道也不关心
- **自动生命周期**：service 消失时，所有依赖它的 fiber 自动 unload
- **可测试性**：测试挂 mock provider 到同名 key，无需 module patching

### 1.3 Effect = 注册即清理

每个注册（event listener、tool、prompt section、service）都是一个 effect。Effect 在插件 unload 时自动逆序清理。这使得 HMR、provider 替换、graceful shutdown 都是框架级保证，不需要插件作者手动实现。

### 1.4 Typed Events = 解耦的交互

- **Service methods**：用于"需要返回值的直接能力调用"（`ctx.shell.run(spec)`）
- **Events**：用于"不知道/不关心谁在听的通知/拦截"（`tools/post-execute` 让 audit 观察所有工具调用）

Events 解耦了 producer 和 consumer：tool registry 不 import audit 插件，audit 不 import tool registry。

### 1.5 Composition 是选择，不是代码分叉

`cordis.yml` 决定 **什么被加载**；代码决定 **被加载的东西做什么**。所有环境差异（dev/prod/test、data-agent 模式 vs standard 模式）通过 composition layer 表达，不通过代码分支。

---

## 2. Capability Seam 三角色模型（What）

当一项能力需要可替换 provider 时，使用三角色拆分：

```
┌────────────────────┐
│  Service Definition │  owns ctx.<key> + vocabulary types (abstract class)
│  packages/<g>/<cap> │  declares: resolve(), run(), start() etc.
└────────┬───────────┘
         │ extends
         ▼
┌────────────────────┐
│  Service Provider   │  implements abstract methods
│  packages/<g>/<cap>-<impl> │  owns: config, connection, protocol
└────────────────────┘

┌────────────────────┐
│  Consumer (Tool)    │  inject: ['<cap>'] → ctx.<cap>.resolve/run
│  packages/<g>/tool-<cap> │  owns: model-facing schema, render, presentation
└────────────────────┘
```

### 2.1 Service Definition 的职责

- `declare module '@deepseek-ai/cordis' { interface Context { <cap>: <Cap>Service } }`
- Abstract class extending `Service`，constructor 中 `super(ctx, '<cap>')`
- 声明 abstract methods（operation vocabulary）
- 拥有 `types.ts`：Request / Spec / Result 纯数据类型
- 可拥有共享 registry 逻辑（adapter map、validation）
- **不拥有**：provider-specific I/O、连接管理、协议实现

### 2.2 Service Provider 的职责

- `extends <Cap>Service`，实现所有 abstract methods
- `static inject = ['hardDep']` 声明 provider 级依赖
- `static Config` 声明 deployment-specific tunables
- 拥有连接/sidecar/协议逻辑
- **不注册 model-facing tools**（那是 Consumer 的事）
- 可暴露 provider-specific diagnostics（不在 seam 合约上）

### 2.3 Consumer 的职责

- Plugin 形式（`name` / `inject` / `apply`），不是 Service subclass
- `inject: ['tools', '<cap>']`
- 调用 `ctx.<cap>.resolve(request)` → `ctx.<cap>.run(spec)`
- 通过 `defineTool()` 注册 model-facing 工具
- 拥有：tool schema、参数映射、result projection、presentation
- **仅 import Service Definition 包**，never import Provider

### 2.4 Request → Spec → Result 三阶段

| 阶段 | 职责 | 字段特征 |
|---|---|---|
| Request | 调用方意图 | 可选字段、caller-facing |
| Spec | Provider 解析后的执行规格 | 必填字段、defaults 已填、caps 已裁 |
| Result | 执行完毕的事实 | 不可变、无 provider 内部状态 |

`resolve(request): Spec` 是 Provider 的**唯一 defaulting 点**。`run(spec)` 只接受完整 Spec，不做 defaulting。

---

## 3. 扩展行为的正确机制（How）

### 3.1 dsh 提供的 Extension Points

| 你想做的 | 正确机制 |
|---|---|
| 加 model-facing 工具 | `ctx.tools.register(defineTool({...}))` |
| 加 LLM provider | `ctx.llm.registerAdapter(routes, adapter)` |
| 加 system prompt 段落 | `ctx.systemPrompt.section({ name, order, text })` |
| 拦截/审查工具调用 | `ctx.on('tools/pre-execute', ...)` → return allow/deny/ask |
| 观察工具结果（audit） | `ctx.on('tools/result', (exec, result) => {...})` |
| 改写 LLM 请求参数 | `ctx.on('agent/request', (config, next) => {...})` |
| 阻止 turn 结束 | `ctx.on('agent/turn-stopping', (agent) => { agent.steer(...) })` |
| 注入 model context | `agent.inject({ content, source })` |
| per-session 工具组合 | Agent preset + `isolate` realm |
| 选择性禁用功能 | Bundle patch `disabled: true` |
| 部署配置差异 | Profile overlay / `--patch` |

### 3.2 不可通过 extension point 实现的事

以下是 Cordis/dsh 的**硬边界**（不是 gap，是设计上的 invariant protection）：

- 改变 turn/step 状态机本身（并行 model call、重排 tool 执行）
- 定义新的 SessionEventMap 成员（需要 TS declaration merging = 需要代码）
- 绕过 tool schema validation（`defineTool` 的验证不可跳过）
- 修改 frozen model request 的 messages（reconstructability invariant）
- 跨 agent scope 泄漏（scope isolation 是框架保证）

---

## 4. dsh-data-agent 特有规则（Constraints）

### 4.1 绝不修改 dsh 源码

**da 的所有功能通过新增包 + composition 实现，不修改 dsh 已有包的 src/ 目录。**

唯一允许的例外：构建接线文件（tsconfig refs、generator manifests）的 additive 行。

### 4.2 当 dsh 缺 extension point

```
需要的能力 dsh 不提供 →
  ├─ 有通用价值 → 向 upstream 提 PR（merge 前用 wrapper 过渡）
  └─ da-specific → 新建 wrapper seam（inject 已有 seam，对外暴露增强接口）
```

**Wrapper seam 模式**：

```ts
// packages/data/credentials-addressed/src/index.ts
// da-specific wrapper: adds per-user addressing over ctx.credentials
export const inject = ['credentials'] as const

export class AddressedCredentialProvider extends Service {
  constructor(ctx: Context) { super(ctx, 'addressedCredentials') }

  async resolve(ref: CredentialRef, address: CredentialAddress) {
    // delegate to ctx.credentials.resolve(ref) + da-specific per-user logic
  }
}
```

da 的 Consumer 注入 `'addressedCredentials'`；upstream 的 `ctx.credentials` 不被修改。

### 4.3 da 不改 dsh 的 Bundle

- ❌ `packages/bundle/web-app/cordis.patch.yml`
- ❌ `packages/bundle/headless/cordis.patch.yml`
- ❌ `packages/bundle/base/cordis.patch.yml`
- ✅ `packages/bundle/data-agent/cordis.patch.yml`（da 自己的 bundle）
- ✅ Profile overlay（`~/.dsh/profiles/<name>/cordis.patch.yml`）

### 4.4 依赖方向铁律

```
✅ da 包 inject dsh Service Definition key
✅ da 包 listen dsh typed events
✅ da 包 extends dsh abstract Service class（做新 Provider）
❌ da 包 import dsh concrete Provider 的内部函数
❌ da 包修改 dsh Service Definition 的接口签名
❌ da 包修改 dsh vocabulary types（SubagentResult 等）
❌ da 包修改 dsh Consumer 的实现（tool-subagent 等）
```

### 4.5 da-owned 包的物理位置

| 包类型 | 位置 | 说明 |
|---|---|---|
| da 核心能力 | `packages/data/` | phase-gate, semantic-layer, audit, nl2sql, tool-* |
| da 查询能力 | `packages/query/` | query, query-maxcompute, query-tool |
| da 检索能力 | `packages/embedder/`, `packages/retrieval/` | embedder, retrieval seams + providers |
| da 评测 | `packages/eval/` | eval harness |
| da 身份 | `packages/identity/` | identity seam |
| da 凭证扩展 | `packages/credentials/credentials-keychain*` | keychain provider（README 标 [data-agent]）|
| da LLM | `packages/llm/llm-dashscope` | DashScope adapter（README 标 [data-agent]）|
| da 子代理 | `packages/subagent/subagent-qoder` | Qoder provider（README 标 [data-agent]）|
| da bundle | `packages/bundle/data-agent/` | bundle patch |
| da preset | `apps/cli/config/agent-presets/data-agent/` | agent composition |

跨界包（在 dsh group 中的 da-owned 包）通过 README 首行 `[data-agent]` 标记和 package.json `description` 前缀标识。

---

## 5. 新功能开发 Checklist

开发新的 data-agent 功能时，按以下顺序：

### Step 1: 分类

- [ ] 这是一个 model-facing 工具？→ §3.1 `ctx.tools.register`
- [ ] 这是一个新的 swappable 能力？→ §2 三角色 seam
- [ ] 这是行为拦截/策略？→ §3.1 event listener
- [ ] 这需要 dsh 不提供的能力？→ §4.2 decision tree

### Step 2: 设计

- [ ] Service Definition：abstract 合约 + vocabulary types
- [ ] Provider：实现 + config + inject 声明
- [ ] Consumer：defineTool + inject Service Definition key
- [ ] 确认不依赖 concrete Provider

### Step 3: 实现

- [ ] 新包在 da-owned 目录下
- [ ] package.json 遵循 dsh constraints（private, type:module, cordis peer+dev）
- [ ] tsconfig.json extends base face
- [ ] 声明 `declare module` 扩展 Context
- [ ] 所有注册通过 effects（ctx.on / ctx.effect / register() 返回的 disposer）

### Step 4: 挂载

- [ ] Bundle patch（`packages/bundle/data-agent/cordis.patch.yml`）中 insert 行
- [ ] 或 Agent preset（`agent.cordis.yml`）中加行（model-facing tools）
- [ ] 验证：`pnpm dsh --profile headless --dump-config | grep <id>`

### Step 5: 验证

```sh
pnpm install
pnpm run typecheck
pnpm run test:coverage  # per-file 100%
pnpm run build && pnpm run hygiene
```

---

## 6. Anti-patterns（禁止的做法）

| Anti-pattern | 为什么错 | 正确做法 |
|---|---|---|
| Consumer import Provider 包 | 破坏 seam 可替换性 | 只 import Service Definition |
| 在 Definition 里写 provider-specific I/O | 泄漏实现到抽象层 | I/O 只在 Provider |
| Provider 注册 model-facing tools | 违反职责分离 | tools 由 Consumer 注册 |
| 跳过 resolve() 直接 run() | 丢失 defaulting/capping | 始终 resolve → run |
| waterfall listener 不调 next() | 静默吞掉所有下游行为 | 除非有意 short-circuit |
| 改 dsh 的 abstract interface 签名 | 破坏 upstream 所有 provider | wrapper seam 或 upstream PR |
| 用 Node API（process.on）不包 ctx.effect | unload 后 listener 泄漏 | 包在 effect 里 |
| 依赖 cordis.yml 中的行顺序 | Cordis 靠 inject 决定启动顺序 | 声明 inject |
| hardcode tunables | 部署变更需要改代码 | Config schema + cordis.yml 可配 |

---

## 7. Upstream 同步策略

- **Remote**：`upstream` → `deepseek-ai/deepseek-harness`
- **频率**：daily automated merge（CI）；conflict → Issue，24h SLA
- **da-owned groups 不会冲突**（data/, query/, embedder/, retrieval/, eval/, identity/）
- **构建接线冲突**（tsconfig refs, pnpm-workspace）：机械解——保留双方
- **架构性变更**（ctx key 重命名 / Service 接口变更 / Cordis vendor 升级）：开 ticket，非 24h SLA
- **规则 4.1 保证**：因为 da 不改 dsh 源码，merge 冲突只发生在构建接线文件
