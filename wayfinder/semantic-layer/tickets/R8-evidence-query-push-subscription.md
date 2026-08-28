# R8 — Evidence-query push 订阅机制调研

**Type**: research + grilling（先调研 → 后决策）
**Phase**: post-W14
**Status**: open (research done, grilling pending)
**Assignee**: unclaimed
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
