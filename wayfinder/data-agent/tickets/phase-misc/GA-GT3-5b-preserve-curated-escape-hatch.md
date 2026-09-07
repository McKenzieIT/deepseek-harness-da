# GA-GT3-5b — preserveCurated 逃逸阀（opt-in 全量替换）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Parent**: [GA-GT3 item 5/6 Resolution](GA-GT3-enrichment-generalization.md)（Q4 deferred）
**Size**: S  ·  **Risk**: Low（additive toggle，默认行为不变）

## 问题

GA-GT3 item 5（origin-aware replace，已落地 PR #43）让 re-discovery 默认保住 `manual`/`undefined` ref、只丢 `deterministic`/`llm`。但**没有逃逸阀**：若要「一次性全量替换、连 manual 也丢」（如全推倒重建 curated 数据），工具做不了，只能手改 YAML。

加一个 `preserveCurated` toggle（默认 `true` = origin-aware replace，现状；`false` = raw `discovered` 全量替换）到 `enrichAllDwsTables`/`enrichAllEvents` + Service `discoverRelations`/`discoverEventRelations`（默认 `true`，opt-in `false`）。

## scope

- `packages/data/semantic-layer/src/enrichment.ts`：`enrichAllDwsTables`/`enrichAllEvents` 加 trailing 参数 `preserveCurated = true`；replace 分支改 `mergeExisting ? mergeRefs(existingRefs(...), discovered) : (preserveCurated ? originAwareReplaceRefs(existingRefs(...), discovered) : discovered)`。
- `packages/data/semantic-layer/src/index.ts`：`discoverRelations`/`discoverEventRelations` 透传 `preserveCurated`（默认 `true`，行为不变）。
- **TDD**：red test `preserveCurated=false` 丢 manual ref（全量替换，只剩 discovered）；green 接 toggle。`preserveCurated=true`（默认）行为不变（回归保护，PR #43 的测试继续过）。
- docstring 更新（`preserveCurated` 语义）。

## 不做

- 不改 origin-aware replace 默认行为（PR #43 的）。
- 不加 events on-write hook（仍 deferred）。
- **干净重写**，不 cherry-pick PR #15 的 `preserveCurated`（那份和重复 fix 纠缠）。

## 参考

PR #15（`fix/ga-gt3-mergeexisting-dataloss`，已 close）有 `preserveCurated` 实现，但和其重复的 origin-aware replace 纠缠；本票干净重写，行为参考即可。
