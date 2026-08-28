# R8: Evidence-Query Push 订阅机制技术可行性研究

## 摘要

调研结论：**Typert 框架原生支持 Host→Client 事件推送**，且已有成熟的先例（6+ 个事件已在生产中使用）。将 `evidence/eval-run-completed` 加入转发允许名单是一行代码变更。整体工程成本低（估计 0.5–1 天），推荐直接实施 native push 方案。

---

## 1. Typert 事件转发能力现状

### 1.1 协议设计（代码证据）

`@deepseek-ai/dsh-typert-protocol/src/types.ts` 定义了完整的事件推送原语：

```typescript
// 哪些事件形状能被单向投递承载（排除 Scope-bound 和有返回值的事件）
export type TypertForwardableEvent = {
  [Event in keyof Events]: unknown extends ThisParameterType<Events[Event]>
    ? ReturnType<Events[Event]> extends void ? Event : never
    : never
}[keyof Events]

// Host 装配声明的转发选择集（merge-extensible）
export interface TypertRemoteEventSelection {}

// 合法的 $on 键：选择集与 Events 的交集
export type TypertRemoteEvent = Extract<keyof Events, keyof TypertRemoteEventSelection>
```

`TypertClientRemote` 接口定义了消费面：
```typescript
export interface TypertClientRemote {
  $on<Event extends TypertRemoteEvent>(event: Event, listener: Events[Event]): () => void
  $dispatch(event: string, args: readonly unknown[]): void
}
```

### 1.2 Host 端转发机制

`packages/host/apiproxy/src/api-proxy.ts` 第 3546 行附近：

```typescript
...API_REMOTE_FORWARDED_EVENTS.map(name => ctx.on(
  name,
  (...args) => {
    // 以 host/remote-event 帧格式推送到 client
    enqueue({ type: 'host/remote-event', event: name, args })
  }
))
```

机制：Host 对允许名单中的每个 Cordis 事件注册 listener，触发时自动将事件名 + 参数序列化为 `host/remote-event` 帧，通过已有连接通道下发。

### 1.3 Client 端接收机制

`packages/client/runtime/src/client/index.ts`：收到 `host/remote-event` 帧后调用 `ctx.remote.$dispatch(event, args)`，再由 Remote Service 的订阅表 fan-out 到所有 `$on` listener。

### 1.4 允许名单——唯一控制点

`packages/api/remotes/src/remote-events.ts`：

```typescript
export const API_REMOTE_FORWARDED_EVENTS = [
  'agent-preset/selected',
  'commands/change',
  'credentials/updated',
  'cordis/request-run',
  'cordis/request-run-resolved',
  'cordis/dynamic-package',
  'cordis/dynamic-retract',
  'cordis/inspect-query',
  'cordis/inspect-query-resolved',
  'llm/adapters-updated',
  'settings/document-updated',
] as const
```

**这是唯一需要修改的控制点**——添加一行 `'evidence/eval-run-completed'` 即完成 Host→Client 事件投递的通路。

---

## 2. 现有 Push 先例

| 事件名 | 消费方 | 模式 |
|--------|--------|------|
| `settings/document-updated` | ui-model-selection, ui-agent-preset, ui-settings-models | 收到通知后 re-fetch |
| `llm/adapters-updated` | ui-model-selection | 收到通知后 re-fetch |
| `credentials/updated` | ui-settings-plugins, ui-settings-models | 收到通知后 refresh |
| `commands/change` | ui-commands | 收到通知后 invalidateAll |
| `agent-preset/selected` | ui-commands, ui-skill | 收到通知后 refresh/invalidate |
| `cordis/*` 系列 | cordis-host-runner 调试 UI | inspect/dynamic-package 交互 |

**共同模式**：事件本身不携带完整数据——仅通知"X 变了"，client 收到后触发自身的 re-fetch 逻辑。这正是 Evidence push 的理想模式。

---

## 3. 触发点分析

### 3.1 EvalRunnerService 已有事件

`packages/eval/eval-runner-service/src/index.ts` 第 419 行：

```typescript
this.ctx.emit('evidence/eval-run-completed')
```

此事件在 `runBatch` 完成 JSONL 持久化后触发。

### 3.2 Cordis Events 声明

```typescript
// packages/data/evidence-query/src/index.ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'evidence/eval-run-completed'(): void
  }
}
```

**事件签名 `(): void`**——无参数、无返回值，完美满足 `TypertForwardableEvent` 的约束条件。

### 3.3 Host 端已有消费

`EvidenceQueryService` constructor：
```typescript
ctx.on('evidence/eval-run-completed', () => {
  if (this.evalStore instanceof FileBackedEvalResultStore) {
    this.evalStore.refresh()
  }
})
```

→ 事件触发时 Host 的 store 已经 refresh，Client 此时 re-fetch 保证拿到最新数据。

### 3.4 事件 Payload 建议

推荐保持 **无 payload**（`(): void`）策略：
- 与现有先例一致（`commands/change`, `credentials/updated` 均为空参）
- Client 已有 `getEvalRunCount` + `getRecentPassRates` RPC，re-fetch 时拿到完整类型安全数据
- 避免 wire 格式耦合——如果 payload 含 pass_rate，schema 变更需双端同步

---

## 4. Client 消费模式分析

### 4.1 `useEvidenceMetrics` 当前 Lifecycle

```
mount → refresh() → [getEvalRunCount RPC, getRecentPassRates RPC]
                       ↓                       ↓
                  setEvalRunCount        setEvalPassRates
unmount → cancelledRef = true (防止 post-unmount setState)
```

问题：mount 后无自动更新途径（仅暴露 `refresh()` 给外部手动调用）。

### 4.2 加入 Subscription 后的设计

```typescript
export function useEvidenceMetrics(client: EvidenceQueryClient | null): EvidenceMetrics {
  // ... 现有逻辑 ...

  useEffect(() => {
    // 订阅 Host 推送事件
    const dispose = ctx.remote.$on('evidence/eval-run-completed', () => {
      refresh()
    })
    return dispose
  }, [ctx, refresh])

  // ...
}
```

但注意：当前 `useEvidenceMetrics` 不持有 `ctx`（它只接收 `EvidenceQueryClient`）。需要：
- 方案 A：hook 增加 `ctx` 参数（或通过 React Context 获取）
- 方案 B：在 wiring 层（`SemanticLayerShell` 或 `wiring.tsx`）订阅事件并调用 `refresh`
- 方案 C：将订阅逻辑放入 `evidenceQueryBridge.ts`，bridge 初始化时注册 listener

**推荐方案 B**——与现有 `ui-model-selection/src/client/service.ts` 模式一致：在 plugin apply 层订阅事件，调用已有 refresh。

### 4.3 多 Tab / 多 Session 的 Event Dedup

- Typert 连接架构：每个 tab 持有独立的 connection generation，Host→Client 帧按 connection 投递
- 多 tab = 多 connection，每个 tab 独立收到事件 → 各自 refresh → 各自显示最新数据
- **无需应用层 dedup**：每个 tab 是独立 React tree，独立 state，独立 RPC response

### 4.4 高频触发的 Throttle/Debounce

当 goal-eval-policy 每 K=3 轮触发 eval 时：
- eval batch 运行耗时（数秒~数十秒），不会出现毫秒级连续触发
- 但快速连续编辑导致多次 eval 排队时，可能在短时间内连续完成 2-3 次

建议：在 `refresh()` 调用处添加 **debounce 300ms**（trailing）：
```typescript
const debouncedRefresh = useMemo(() => debounce(refresh, 300), [refresh])
```

这已足够——eval run 本身是秒级操作，300ms debounce 既能合并极端情况下的连续通知，又不影响 UX 感知。

---

## 5. 方案对比

| 维度 | Native Push | Client Polling | Hybrid |
|------|-------------|----------------|--------|
| **实现成本** | 极低（1 行允许名单 + hook 订阅） | 低（setInterval + refresh） | 中（需两种路径） |
| **延迟** | <50ms（帧投递） | 取决于间隔（≥1s） | <50ms |
| **资源开销** | 零额外（复用已有通道） | 有周期性 RPC 开销 | 零额外 |
| **可靠性** | 连接断开时丢失事件 | 始终能追赶 | 两者兼具 |
| **维护** | 利用既有架构，无新增模式 | 需管理 timer lifecycle | 增加复杂度 |
| **既有先例** | 6+ 个事件在生产使用 | 无先例 | 无先例 |

### 推荐：Native Push

理由：
1. 框架原生支持，改动量最小
2. 与 6+ 个已有事件完全一致的模式，无新增架构负担
3. 延迟最优
4. 连接断线恢复时 `connection/reset` 事件已可触发全量 refresh（现有 pattern）

如果担心断连丢失，可作为增强在 `connection/reset` handler 中补一次 refresh（成本 +2 行代码）。

---

## 6. 推荐实现路径

### Step 1：允许名单 +1 行（Host 通路）

```diff
// packages/api/remotes/src/remote-events.ts
export const API_REMOTE_FORWARDED_EVENTS = [
  'agent-preset/selected',
  'commands/change',
  'credentials/updated',
+ 'evidence/eval-run-completed',
  'cordis/request-run',
  ...
] as const
```

### Step 2：Client 订阅（wiring 层）

在 `packages/client/ui-semantic-layer/src/client/wiring.tsx` 或 plugin apply 中：

```typescript
ctx.remote.$on('evidence/eval-run-completed', () => {
  evidenceMetricsRef.current?.refresh()
})
```

### Step 3：（可选）debounce 保护

```typescript
const debouncedRefresh = debounce(() => evidenceMetricsRef.current?.refresh(), 300)
ctx.remote.$on('evidence/eval-run-completed', debouncedRefresh)
```

### Step 4：（可选）断连恢复

```typescript
ctx.on('connection/reset', () => { evidenceMetricsRef.current?.refresh() })
```

**总代码变更量：3–8 行**

---

## 7. 与 ③ 自驱循环的关系

### 7.1 依赖分析

- goal-eval-policy 每 K=3 轮自动触发 eval → `EvalRunnerService.runBatch()` → `ctx.emit('evidence/eval-run-completed')`
- Agent 内部消费：Agent 直接读 `EvalRunnerService` 返回值或 `ctx.evidenceQuery` 服务，**不依赖 UI push**
- UI push 服务的是**人类用户**——让 sidebar/sparkline 实时反映 eval 结果变化

### 7.2 Push 是否是 ③ 的隐含前置？

**不是**。③ 自驱循环的 agent 数据流是 Host-local 的（Cordis service 直连），不经过 Typert RPC。Push 只影响观察者（UI），不影响执行者（Agent）。

### 7.3 但存在 UX 共振

- ③ 让 eval 自动运行 → 用户看到 UI 不动 → 困惑"eval 到底跑了吗"
- Push 解决"agent 做了什么但 UI 没反映"的信息不对称
- 因此：push 不阻塞 ③ 的实现，但 ③ 上线后 push 的 UX 价值显著提升

---

## 8. 紧迫性评估

| 因素 | 评估 |
|------|------|
| 技术风险 | 极低——框架原生支持，先例充分 |
| 工程成本 | 极低——3-8 行代码 |
| UX 影响 | 中等——当前需手动刷新，但语义层 UI 使用频率适中 |
| 与 ③ 联动 | ③ 上线后 push 的缺失感会急剧上升 |
| 阻塞项 | 不阻塞任何其他 workstream |

### 建议排期

- **若 ③ 即将实施**：与 ③ 同期交付（作为 ③ 的 UX 配套，0.5 天附带完成）
- **若 ③ 延后**：可延后至 ③ 之前的 polish sprint 再做（当前手动 refresh 可用，不构成功能缺失）
- **不建议**：独立排高优先级——收益在 ③ 缺席时有限

---

## 附录：关键文件路径

| 文件 | 角色 |
|------|------|
| `packages/api/remotes/src/remote-events.ts` | 事件允许名单（唯一改动点） |
| `packages/typert/protocol/src/types.ts` | TypertForwardableEvent / TypertRemoteEvent 定义 |
| `packages/typert/protocol/src/index.ts` | TypertRemoteService / Remote 装饰器 |
| `packages/host/apiproxy/src/api-proxy.ts` L3546 | Host→Client 帧转发循环 |
| `packages/client/runtime/src/client/index.ts` | Client 接收 + $dispatch |
| `packages/data/evidence-query/src/index.ts` | Events 声明 + Host 消费 |
| `packages/eval/eval-runner-service/src/index.ts` L419 | 事件触发点 |
| `packages/client/ui-semantic-layer/src/client/hooks/useEvidenceMetrics.ts` | Client 消费 hook |
| `packages/client/ui-semantic-layer/src/client/wiring.tsx` | 订阅注入点 |
