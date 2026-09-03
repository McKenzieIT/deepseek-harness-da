# T9 — client result-cache 包实现(object layer 热缓存)

**Type**: task (AFK)
**Phase**: post-v1
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [T8](T8-result-get-rpc.md)（cache miss 通路依赖 `result.get` RPC;T8 完成本票可全链验证）
**Related**: [R5](R5-object-layer-result-cache.md)（决策:B 单包 / 事件驱动失效 / byte-bounded LRU / Config bound / gen-token v1 跳过）、[T8](T8-result-get-rpc.md)（miss 通路）、[T2](T2-ui-present-table.md)/[T4](T4-present-table-display-upgrade.md)（消费方 ui-present-table）

## Question

按 R5 Resolution 实现 client 侧 object-layer 热缓存包:

1. `packages/client/result-cache/`(Mode 3):`package.json`(`@deepseek-ai/dsh-client-result-cache`,`dsh.client` manifest,`lru-cache` 进 `dependencies`)+ `tsconfig.json`(references runtime)+ `src/client/{index.ts,service.ts,...}` + `README.md`(Model Experience + Known Limitations)。
2. 三个注册面:`tsconfig.client.json` references 行 + `packages/bundle/web-app/cordis.patch.yml` `dsh.client` 行 + `packages/bundle/web-app/package.json` dep 行。
3. service `ctx.results`(session-scoped):`get(rid)` 做 cache→miss→`result.get` RPC;`lru-cache` 实例(`maxSize`/`sizeCalculation`/`maxEntrySize`/`updateAgeOnGet`),`Config` 字段(`maxEntrySize ~8MB`/`maxSize ~64MB`/`max ~64`)从 `cordis.yml` 注入。
4. 失效订阅:inject `sessions`/`conversationEvents`,订阅 `query_data` tool_result 完成 → 提取 `result_id` → `cache.delete(rid)`(`cr_` 天然不触发)。
5. inject face(供 ui-present-table 消费):`inject: (sessionId) => ({ fetchResult: (rid) => ctx.results.get(rid) })`(参 ui-suggest-followups `submit` face)。
6. `ui-present-table` 改:inject 加 `fetchResult`;`args.result_id` → `fetchResult(rid)` → 全量 rows;T4 `parseQueryData` TSV 扫描降级为 cache-miss fallback。

## Scope

destination 实现(按 R5 已定 spec 机械构建,无新决策)。当前项目开发依赖票推进,故从 R5 的 destination handoff 拉进 ticket。Known Limitation:missed-event 竞态(gen-token v1 跳过,咬到再加)。dsh-plugin-development 全程合规(Mode 3 + Config + Agent Note)。
