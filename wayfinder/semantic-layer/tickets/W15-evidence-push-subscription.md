# W15 — Evidence-query push 订阅实现

**Type**: task
**Phase**: v1 收尾
**Status**: open
**Assignee**: unclaimed
**Blocked by**: 无
**Graduated from**: [R8](R8-evidence-query-push-subscription.md)（grilling 决策）

## Question

实现 R8 grilling 锁定的 evidence-query push 订阅方案。当 Host 端完成 eval run 后，Client UI（EvidenceSidebar sparkline / GoalDock / auto-flip）自动更新，无需手动刷新。

## 决策摘要（R8 grilling 2026-08-30）

| 决策 | 结论 |
|------|------|
| 机制 | Native push（`ctx.remote.$on`）+ `connection/reset` 恢复 |
| 注入点 | 方案 C：`EvidenceQueryClient` 增加 `subscribeInvalidation(cb): disposer`，apply scope 从 `ctx.remote.$on` 驱动 |
| Debounce | 无（eval batch 秒级操作，不可能亚秒连续触发） |
| Payload | `(): void`（notify-then-refetch，匹配 6+ 先例） |

## 实现清单

### Step 1: 允许名单 +1 行

`packages/api/remotes/src/remote-events.ts`：

```diff
 export const API_REMOTE_FORWARDED_EVENTS = [
   'agent-preset/selected',
   'commands/change',
   'credentials/updated',
+  'evidence/eval-run-completed',
   'cordis/request-run',
   ...
 ] as const
```

### Step 2: EvidenceQueryClient 接口增加 subscribeInvalidation

`packages/client/ui-semantic-layer/src/client/hooks/useEvidenceQuery.ts`（或相关 types）：

```typescript
export interface EvidenceQueryClient {
  // ... 现有方法 ...
  subscribeInvalidation?(cb: () => void): () => void
}
```

### Step 3: apply scope 创建 invalidation channel + $on + connection/reset

`packages/client/ui-semantic-layer/src/client/index.ts` 的 `ctx.inject(...)` scope 内：

```typescript
const invalidationListeners = new Set<() => void>()
ctx.remote.$on('evidence/eval-run-completed', () => {
  for (const cb of invalidationListeners) cb()
})
ctx.on('connection/reset', () => {
  for (const cb of invalidationListeners) cb()
})

const evidenceClient = rawEvidenceQuery
  ? {
      ...buildEvidenceQueryClient(rawEvidenceQuery as never),
      subscribeInvalidation(cb: () => void) {
        invalidationListeners.add(cb)
        return () => { invalidationListeners.delete(cb) }
      },
    }
  : null
```

### Step 4: useEvidenceMetrics 订阅 invalidation

`packages/client/ui-semantic-layer/src/client/hooks/useEvidenceMetrics.ts`：

```typescript
useEffect(() => {
  if (!client?.subscribeInvalidation) return
  return client.subscribeInvalidation(() => refresh())
}, [client, refresh])
```

## 验证

- `evidence/eval-run-completed` 出现在 `API_REMOTE_FORWARDED_EVENTS`
- tsc clean
- 现有 tests 不红（useEvidenceMetrics tests 中 client mock 无 subscribeInvalidation 时走 optional 路径）
- 如有 web 运行环境：触发 eval → sidebar sparkline 自动刷新（无需手动）

## 参考

- [R8 research](../research/r8-evidence-query-push-subscription.md)（完整技术可行性报告）
- `ui-model-selection/src/client/service.ts:59-60`（$on 先例）
- `packages/client/AGENTS.md`（inject 纪律）
