# R8 — Evidence-query push 订阅机制调研

**Type**: research + grilling（先调研 → 后决策）
**Phase**: post-W14
**Status**: closed (resolved)
**Assignee**: current session (2026-08-30)
**Blocked by**: 无（T2 已解除）
**Related**: [W11](W11-evidence-query-client-rpc-bridge.md)（EvidenceQueryService Remote 接口）、[W4](W4-evidence-query-backend.md)（FileBackedEvalResultStore）

## Question

当前 v1 的 Evidence 组件（EvidenceSidebar / GoalDock sparkline）采用 mount-time 拉取 + 手动 `refresh()` 模式。当 host 端完成新 eval run 后，client 不会自动更新——管理者需手动刷新才能看到最新 pass_rate / delta。

需要调研：

1. **Typert 事件转发能力**：
   - `TypertRemoteService` 是否支持 `$on` 事件订阅？（server emit → client listen）
   - 现有 codebase 中是否有 `$on` / server-push 的使用先例？
   - 若不支持：替代方案（polling interval / WebSocket sideband / client-side timer）

2. **触发点**：
   - EvalRunnerService 的 `runBatch` 完成后应该 emit 什么事件？
   - 事件 payload 最小集（`{ runId, pass_rate, timestamp }` 还是只通知"有新数据"让 client 自行拉？）

3. **Client 消费模式**：
   - `useEvidenceMetrics` hook 当前是 mount-time fetch —— 加入 subscription 后的 lifecycle 管理
   - 多 tab / 多 session 场景下的 event dedup
   - ③ 自驱循环频繁触发 eval 时的 throttle / debounce 需求

4. **与 W13 ③ 自驱循环的关系**：
   - 当 goal-eval-policy 每 K=3 轮自动触发 eval，push 机制是否是 ③ 的隐含前置？
   - 若 ③ 不依赖实时 UI 反馈（agent 内部消费 eval 结果，不经 UI），push 订阅的紧迫性？

## Scope

Research 调研技术可行性 + 场景需求。若结论明确且实现方案清晰，可直接毕业为 task 票；若存在设计权衡（polling vs push / 事件粒度），开 grilling 票决策。

---

## Resolution (2026-08-30 grilling)

### 决策总览

| 问题 | 决策 | 依据 |
|------|------|------|
| 机制 | Native push (`ctx.remote.$on`) + `connection/reset` 恢复 | 框架原生支持，6+ 先例，0 新模式 |
| 注入点 | 方案 C（改良 bridge）：`EvidenceQueryClient` 增加 `subscribeInvalidation` 回调，apply scope 从 `ctx.remote.$on` 驱动 | 方案 B 有缺陷（`refresh()` 在 React hook 内部不可外部调用）；方案 C 符合 AGENTS.md inject 纪律（plain callbacks） |
| Debounce | 不加 | eval batch 秒级~分钟级操作，300ms 内连续完成两次物理上不可能；K=3 轮触发间隔 ≫ 任何合理 debounce 窗口 |
| 事件 payload | `(): void`（无 payload） | 6/6 先例全是 void；client 需 `getRecentPassRates(10)` 聚合数组，runId 无法帮助增量更新；notify-then-refetch 收敛且解耦 |
| 处置 | 毕业为 task 票 [W15](W15-evidence-push-subscription.md) | ~16 行跨 4 文件，机械跟随已有 pattern |

### D1: Native push，无 polling/hybrid

**推翻 research 的什么**：无——research 的推荐正确，验证通过。

**代码证据**：
- `remote-events.ts` 是唯一控制点（+1 行）
- `ui-model-selection/src/client/service.ts:59-60` 确认活模式：`ctx.remote.$on('llm/adapters-updated', refresh)` + `ctx.remote.$on('settings/document-updated', refresh)`
- `eval-runner-service/src/index.ts` L419 已 emit `evidence/eval-run-completed`
- `evidence-query/src/index.ts` Host 端已订阅并 refresh store——Client re-fetch 时数据保证最新

**connection/reset 恢复**：`ui-model-selection` 已有先例 `ctx.on('connection/reset', ...)` 补刷。+2 行覆盖断连场景。

### D2: 方案 C（改良 bridge），非方案 B

**Research 方案 B 的缺陷**：
- research 假设 wiring 层可以 `evidenceMetricsRef.current?.refresh()` 调用 hook 内部的 refresh
- 实际上 `useEvidenceMetrics` 的 `refresh()` 是 `useCallback` 内部产物，React hook state 外部不可达
- `wiring.tsx` 组件通过 `scope.slots.register` 注册，apply 层无 React ref 可引用

**正确路径**：
1. `index.ts` apply scope（有 `ctx.remote` 访问权）创建 invalidation channel（`Set<() => void>`）
2. `ctx.remote.$on('evidence/eval-run-completed', ...)` + `ctx.on('connection/reset', ...)` 驱动 channel
3. `EvidenceQueryClient` 接口增加 `subscribeInvalidation(cb: () => void): () => void`
4. `useEvidenceMetrics` 内部 `useEffect` 订阅 invalidation → 调用自身 `refresh()`

**合规性**：符合 AGENTS.md 第 7 条（inject 返回 plain data and callbacks）和 ctx 纪律（components 永不见 ctx）。

### D3: 无 debounce

**关键事实**（来自 `goal-eval-policy/src/index.ts`）：
- eval 触发 = 每 K=3 个 goal round（每 round 至少秒级）
- `runBatch()` 运行 80-161 case × NL2SQL + judge = 数十秒到分钟
- 300ms 内两次 `evidence/eval-run-completed` 触发的概率 ≈ 0
- `refresh()` 天然幂等——并发两次 fetch 产出相同最终状态

### D4: `(): void` 无 payload

**挑战"runId 增量更新"**：
- sparkline 需要 `getRecentPassRates(10)` = 最近 10 次 pass rate 数组
- 知道 runId 无法推导出新数组（缺少之前 9 次的数据）
- 仍需完整 re-fetch → payload 零收益
- wire 格式耦合：改签名需改 events 声明 + emit 站点 + allowlist type → 全成本无收益

### D5: 毕业为 task 票 W15

实现清单（~16 行）已写入 [W15](W15-evidence-push-subscription.md)，4 步机械跟随已有 pattern。
