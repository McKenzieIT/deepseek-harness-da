# Session Prompt: Shell auto-flip evalRunCount — 验证 & 关闭

## 背景

`wayfinder/semantic-layer/map.md` "Not yet specified" 记录了此遗留项：

> Shell auto-flip 接入真实 evalRunCount：`sidebar.footer.action` 的 SemanticLayerShell inject factory 仍传 `evalRunCount: 0`（root-scope slot inject 是 memoize 的）。需改为 Shell 组件内部通过 useEvidenceMetrics 消费真实 run count，使 DashboardView 路由在 ≥3 次 eval 后自动激活。

## 当前状态（可能已解决）

W11 (commit range around c198421627) 做了以下改动：
1. `client/index.ts` 的 inject factory 现在传入 `evidenceClient`（而非 `evalRunCount: 0`）
2. `SemanticLayerShell.tsx` 内部使用 `useEvidenceMetrics(evidenceClient)` 获取真实 `evalRunCount`
3. 当 `evidenceClient` 可用时：`const evalRunCount = evidenceClient ? metrics.evalRunCount : evalRunCountProp`

## 验证任务

1. 确认代码路径：
   - `packages/client/ui-semantic-layer/src/client/index.ts` → injected() 返回 evidenceClient
   - `packages/client/ui-semantic-layer/src/client/SemanticLayerShell.tsx` → useEvidenceMetrics 消费
   - `packages/client/ui-semantic-layer/src/client/hooks/useEvidenceMetrics.ts` → 从 RPC 读 runCount
2. 确认 `evidenceClient` 在 data-agent web profile 下非 null：
   - `cordis.patch.yml` 挂载了 `evidence-query-gateway`（TypertRemoteService）
   - `scope.remote.evidenceQuery` 应非 undefined
3. 若已解决：
   - 从 map.md "Not yet specified" 移除此条
   - 记录为已通过 W11 evidence-query RPC bridge 解决
4. 若未解决（evidenceClient 仍为 null）：
   - 诊断 remote namespace 为何未注入 evidenceQuery
   - 检查 `dsh-evidence-query/src/gateway.ts` 的 @Remote 声明是否被 Typert 正确生成

## 相关文件

- `packages/client/ui-semantic-layer/src/client/index.ts` line ~95 (remoteNs)
- `packages/client/ui-semantic-layer/src/client/SemanticLayerShell.tsx` line ~58-60
- `packages/client/ui-semantic-layer/src/client/hooks/useEvidenceMetrics.ts`
- `packages/data/evidence-query/src/gateway.ts` — host-side TypertRemoteService
- `packages/bundle/data-agent/cordis.patch.yml` line ~172 (evidence-query-gateway)
- `wayfinder/semantic-layer/tickets/W11-evidence-query-client-rpc-bridge.md`

## 预期结论

根据代码审查，此项应已通过 W11 解决。本 session 的主要工作是验证并关闭 map 条目。
