# T10 — Wire ui-present-table/ui-present-decomposition fetchResult consumer (T9 step 6)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [T12](T12-harden-result-cache-per-review.md)（HIGH 修补:epoch guard + single-flight + `ResultFetchError` value export + transport-throw folding;T10 接线前必须先修,否则 `invalidate` 失效 + 重复 RPC + transport 错未折叠）、[T9](T9-result-cache-package-impl.md)（`ctx.results` service 已 ship;本票接其 inject face）
**Related**: [R5](R5-object-layer-result-cache.md)（决策）、[T9](T9-result-cache-package-impl.md)（cache 包 + inject face 契约）、[T2](T2-ui-present-table.md)/[T4](T4-present-table-display-upgrade.md)（ui-present-table）、[T1](T1-ui-present-decomposition.md)/[T5](T5-present-decomposition-display-upgrade.md)（ui-present-decomposition）

## Question

T9 的 cache 包已 ship `ctx.results`（scope-addressed Service + `get(rid)`/`invalidate(rid)` API + inject face 契约），但两个消费方仍未接线（T9 pathspec 排除了 stable 消费方包,故 step 6 graduated 到本票）。接线两个 INTERPRETATION 渲染器的 result-row 获取路径到 `ctx.results`:

1. **`ui-present-table`**:`apply` inject 加 `fetchResult` + `invalidateResult`(参 ui-suggest-followups `submit` face 模式 + T9 README 契约):`inject: (sessionId) => ({ fetchResult: (rid) => sessions.scope(sessionId)?.get('results')?.get(rid), invalidateResult: (rid) => sessions.scope(sessionId)?.get('results')?.invalidate(rid), ... })`。`TableCard` 的 `args.result_id` → `props.fetchResult(rid)` 取全量 rows;T4 `parseQueryData` 同 turn TSV 扫描降级为 cache-miss fallback(无 `fetchResult` 或 not-found 时兜底)。fresh-`query_data`(同 turn 有 `result_id=R` 的 `query_data` tool_result)→ `props.invalidateResult(R)` 再 `fetchResult(R)`(R5 fresh-vs-folded:失效后新表 miss 重拉)。
2. **`ui-present-decomposition`**:同模式(`present_decomposition` 若引用 `result_id` 取 rows;若纯 argsRaw 无 `result_id` 则不接,参 [R10](R10-decomposition-table-metric-identity.md) 结论否——decomposition 纯 argsRaw 自由文本无 `result_id`)。
3. retry = 重发 `fetchResult(rid)`(G1 D2/D6 自然成立)。

## Scope

T9 step 6 的消费方接线(pathspec 当时排除 stable 消费方包,故 graduate)。无新决策——inject face 契约 + fresh-vs-folded 时序已由 [R5](R5-object-layer-result-cache.md) + T9 定。验证:`pnpm run test:gui` + 两包 owning vitest + tsc;改 visible assembled output → `DSH_SNAPSHOT=replay pnpm run test:web`。非 trivial 改动 → Agent Note。
