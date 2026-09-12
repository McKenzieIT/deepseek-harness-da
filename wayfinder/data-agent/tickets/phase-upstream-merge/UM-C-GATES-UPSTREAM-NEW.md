# UM-C-GATES-UPSTREAM-NEW — C 类「upstream 新门，fork 从未满足」的 4 门无主红：修、豁免、还是判 known-red

**Type**: grilling · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（可立即认领；证据已备齐，主要待拍板）
**Blocks**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 的收口裁决（「A4 + C4 + 2 known-red 是否算可接受基线」）+ [UM15](UM15-durable-upstream-sync-method.md) Decision #1 的 cron 半（其先决条件是绿基线，否则 `schedule:` 会持续告 known-red 噪声）
**Graduated from**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) —— 票里写「另开票（D3/D4）」但 **D3/D4 从未创建**，这 4 门因此一直无主；2026-09-11 实测重基线时补建。

## Question

`check:ci:static` 在 resync `5fe9b32e44` 实测 **37 passed / 11 failed**。11 门红里，A 类 4 门（`runtime closure`/`constraints`/`export jsdoc`/`translation pairing`）归 GA-FORK-CI-green 与 parallel-dev-cleanup，B 类 2 门（`package invariants`/`type equivalence`）已有专属票，`subsystem pages`(5) 归 [UM6](UM6-docs-subsystems-keep-data-agent.md)。**剩下 4 门没有任何归属**：

| 门 | 规模（2026-09-11 实测） | 性质 |
|---|---|---|
| `verify-client-ui-i18n` | **98** 条 hard-coded UI string | upstream 新门；fork 的 client 包从未做 i18n 抽取 |
| `verify-package-dependencies` | **75** 条 violation（票记 74，已 +1） | upstream 新门；fork 包的依赖声明策略与 upstream 不同 |
| `documentation standard tests`（`scripts/doc-standard.spec.ts`） | 12 个测试挂 **2** 个（`packageReadmeStructureErrors`：`maps package README kinds to their documentation standards` / `keeps every package README on the summary, contents, and Dev Note skeleton`） | upstream 新门；fork 新增包的 README 骨架不合规 |
| `verify-config-catalog` | `docs/config-catalog.md` stale | **本次新入账**（UM12 原 11 门里没有它） |

**要决的是：这 4 门各自走「修到绿」、「加带理由的豁免」、还是「判 known-red 并写进 GA-FORK-CI 总账」。** 三条路的取舍不同，且 `98` 和 `75` 这两个量级决定了它不可能一次做完——需要先定策略，再切片。

## 已测证据（勿重导）

复现：`cd /Users/mckenzie/workspace/dsh-resync && pnpm run check:ci:static`（221.86s，48 门；resync 无 eval，安全）。单门可直接 `pnpm run verify-client-ui-i18n` 等。

- `verify-client-ui-i18n`: `98 hard-coded UI string(s):`
- `verify-package-dependencies`: `75 violation(s):`
- `verify-config-catalog`: `gen-config-catalog: docs/config-catalog.md is stale. Run 'pnpm run gen-config-catalog' and commit docs/config-catalog.md.` —— 实测 `gen-config-catalog` 后 **diff 只有 1 行**。
- `documentation standard tests`: `Tests 2 failed | 10 passed (12)`。

## 各门的具体形状 / 候选解法

### 1. `verify-config-catalog`（最小，建议先做）
regen 只差 1 行，但 `docs/config-catalog.{md,zh.md}` + `docs/config-catalog.i18n.yaml` 是**成对的**，所以不能裸 regen：`verify-translation-pairing` 已经在报 `docs/config-catalog.md: out of sync — content no longer matches the pair's last confirmed-consistent state`。正确做法沿用 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 为 `gen-doc-graphs` 定下的那套：generator 同时发 zh region，或人工带上 zh 侧后对**你真的复核过的那一对**显式 `--write` 重记（⚠ 绝不 `--all`）。**做掉它同时消掉 translation-pairing 的一条子项。**

### 2. 同类的孤立缺口：`docs/architecture-graph.md` 没有 `.zh.md`
`gen-architecture-graph` 只发英文，所以 `verify-translation-pairing` 报它「in-scope documentation must merge bilingual」。这是 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 已为 `gen-doc-graphs` 解决过的**同一个 bug，换了一个 generator**。该票的 region-splice 方案可直接复用（`spliceRegion` 已泛化成 `(content, region, beginMarker?, endMarker?)`）。不属任何现有票 → 一并收在本票。

### 3. `documentation standard tests`（2 条，规模小）
挂在 `packageReadmeStructureErrors`。与 [UM6](UM6-docs-subsystems-keep-data-agent.md) 的 `subsystem-pages`(5) 高度相邻——**都是 fork 新增包组的 README 合规问题**，很可能同一批文件一起修更省。若决定并做，注意别在两票里重复计。

### 4. `verify-package-dependencies`（75）与 `verify-client-ui-i18n`（98）
这两门是真正的体量。共同特征：**upstream 立的新规矩，fork 侧几十个包从未满足**，不是回归。所以「修到绿」意味着一次跨几十个包的批量整改，性质接近 [UM-INVARIANT-COMPANION-CLEANUP](UM-INVARIANT-COMPANION-CLEANUP.md)（那张票实测是 268 处编辑）。
- 若选修：需先切片（按包组？按违规类型？）并确认**没有 96/103 那类「大部分是策略正确、只有少数违规」的陷阱**——`package-invariants` 就踩过这个坑（103 个包声明 peerDep，只有 7 个违规）。落地前务必先按违规类型分桶再报数。
- 若选 known-red：需写进 GA-FORK-CI 总账，并明确它会让 [UM15](UM15-durable-upstream-sync-method.md) 的 cron 半长期告噪 —— 这正是 UM15 Decision #1 的先决条件冲突点。

## 判据 / 产出

- 4 门各有一条明确裁决（修 / 豁免 / known-red），带理由。
- 选「修」的门给出切片计划 + 首片的精确清单（先按违规类型分桶报数，不要只报总数）。
- 选「known-red」的门写进 GA-FORK-CI 总账，并在 UM15 cron 半的先决条件里注明。
- `verify-config-catalog` 与 `architecture-graph` 的 zh 缺口建议本票直接做掉（都很小，且各自顺带消一条 translation-pairing 子项）。

## 估算

- `config-catalog` + `architecture-graph` zh：**~0.5 session**（AFK，两处都小）
- `documentation standard tests`（2 条）：**~0.5 session**，若与 UM6 的 `subsystem-pages` 并做则接近 0 增量
- `package-dependencies`(75) + `client-ui-i18n`(98)：**若判 known-red ~0.5 session（写账）；若要修到绿 2-4 session**（体量类比 UM-INVARIANT 的 268 处编辑）
- 合计：**~1.5 session（judged known-red 路线）** 到 **~5 session（全修到绿路线）**
