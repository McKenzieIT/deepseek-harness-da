# critic harvest — load_* return-shape nesting mismatch (captureToolData 捕不到 partition_cols/event_params)

**Type**: task
**Phase**: misc (surfaced 2026-08-21, load_* review-fix-2 subagent re-review A M-1)
**Assignee**: (next session / phase-gate owner)
**Status**: closed (resolved 2026-08-21, ticket A — Resolution (a) applied; see Resolved note below)
**Graduated from**: [data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md) aggregate (load_* review-fix-2 subagent re-review) + [P6b](../phase-2/P6b-semantic-layer-hardening.md) "load_* 接入" follow-up
**Blocked by**: — (unblocked; **coordinate w/ concurrent** — `phase-gate.ts` 是并发活跃域，`cd2b741409` reasoningEffort Option B landed，aga-per-phase-thinking-control grilling in progress；recheck git status before editing)

## Question

`captureToolData`（`packages/data/phase-gate/src/phase-gate.ts`）从 `load_table_definition`/`load_event_definition` 工具结果 harvest `partition_cols`/`event_params`，喂 GENERATION gate 的 critic（partition-filter ds/dt 检查 + GET_JSON_OBJECT event-param field 检查）。但它探 **top-level** 结果（`value.partitions`、`value.params_fields`），而 load_* 返 `{ found, table|event: { partitions, params_fields, … } }` **嵌套** → harvest 捕不到 → `s.partition_cols`/`s.event_params` 即使成功 load 后仍空 → critic 的 partition/param 检查缺 load_* 数据（**弱化非破坏**——SQL-text regex + json-path 检查仍跑）。

**决策：在哪修**（consumer-adapts 推荐）？
- (a) `captureToolData` 探 `value.table?.partitions` / `value.event?.params_fields`（phase-gate.ts——消费者适配生产者的自然 model-facing 形）。**推荐**——load_* 返回形 `{found, table|event}` 是对的 model-facing 形（模型读嵌套 definition）；消费者（phase-gate）应适配。
- (b) load_* 在 top-level 返 harvest 字段（如 `{found, table, partition_cols}`）。**否决**——重复数据 + 污染 model-facing 输出（模型见冗余 partition_cols top-level + 嵌套在 table）。

## Context

- Pre-existing since `540dbd155d`（load_* ship）——返回形 `{found, table|event:{…}}` 不匹配 `captureToolData` 的 top-level 探测（P7b `captureToolData` 写时 best-effort "adapt to real tool shapes when shipped"）。
- Grounding-relevant：`generationGate` 检 `partition_cols`（ds/dt partition-filter）+ `event_params`（GET_JSON_OBJECT field paths）；无 harvest 则这些检查缺 load_* 数据。
- `phase-gate.ts` = 并发活跃域（`cd2b741409` reasoningEffort Option B；aga-per-phase-thinking-control grilling in progress）。recheck git status before editing。
- load_*（`packages/data/tool-load-{table,event}-definition/src/index.ts`）= 本会话域（review-fix-2 `20e7bacd4b` + review-fix-3 `e6e28392a2`）。

## Resolution（建议——修 (a)）

在 `packages/data/phase-gate/src/phase-gate.ts` `captureToolData`，探嵌套 `value.table`/`value.event`：

```ts
} else if (name === 'load_event_definition') {
  collectFields((value as { event?: unknown } | undefined)?.event, s.event_params, 'params_fields', 'params')
} else if (name === 'load_table_definition') {
  collectFields((value as { table?: unknown } | undefined)?.table, s.partition_cols, 'partition_cols', 'partitions')
}
```

（即把 `value.table`/`value.event`（嵌套投影）传给 `collectFields`，而非 top-level `value`。）+ phase-gate 测试：一个带 partitions/params_fields 的 load_* 结果 → `s.partition_cols`/`s.event_params` 被填充。

验证：`pnpm tsc -b packages/data/phase-gate/tsconfig.json` + `pnpm vitest run packages/data/phase-gate` + `pnpm exec tsx scripts/run-oxlint.ts --config .oxlintrc.staged.json packages/data/phase-gate/src`（gate oxlint）。

---

**Resolved (2026-08-21, ticket A)** — Resolution (a) applied in `packages/data/phase-gate/src/phase-gate.ts` (+ test `tests/phase-gate.spec.ts`); TDD RED→GREEN. The concurrent phase-gate storm flagged at open (`cd2b741409` reasoningEffort + aga-per-phase-thinking-control grilling) has **subsided** (`aga-per-phase-thinking-control` resolved, `667ea89405`); `phase-gate.ts` source was clean when edited (rechecked `git status` before each shared-file edit).

**Two parts — the ticket's proposed snippet alone was insufficient.** TDD surfaced that `collectFields` could only harvest string-arrays / object-map keys, but load_* returns **projected arrays of `{name, type}` objects** (`TableModel.partitions` / `EventModel.params_fields`; the substrate maps project to `[{name, …}]`). The nesting-only fix left the test RED (array elements are objects, not strings → nothing extracted).

1. `captureToolData` probes nested `value.table` / `value.event` (not top-level `value`) — the ticket's proposed (a) snippet, verbatim.
2. `collectFields` gains an array-of-objects branch harvesting each element's `name` leaf (the substrate map key). Additive: the prior string-array + object-map branches are unchanged. The harvest crosses the model-facing projection boundary → it extracts `name` leaves, not substrate map keys.

**Verification (all green)**: `tsc -b` exit 0 · `vitest` 20/20 · gate oxlint `0 warnings 0 errors` · `verify-cordis-config` 135 passed.

**Commit note**: the commit also lands the orphaned uncommitted GENERATION-guard test (the MAJOR-1 whitelist test — its whitelist landed in `a127875845` but the test was never committed on master; same load_* thread; the `types.ts` MAJOR-1 comment cross-references this exact harvest gap).

## Map pointer

- Resolving：[P6b](../phase-2/P6b-semantic-layer-hardening.md)（load_* 接入）+ [data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md) aggregate。
- Related：[P7b](../phase-3/P7b-phase-gate-hardening.md)（phase-gate re-open deferred polish）。
- Map Decisions-so-far / frontier pointer：deferred（并发正改 map.md；并发平息后补一行）。
