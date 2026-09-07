# GA-FORK-CI: verify-translation-pairing debt (the 1 remaining red node-24 gate)

Branch: fix/ga-fork-ci-translation-pairing (claimed 2026-09-07 session 2; worktree ../dsh-translation-pairing, off master @ 356d0c9b3a). LOCAL — not pushed (gate red, push/PR decision pending). Prior dsh-ga-i18n worktree's 26 .zh.md + manifest excludes + Class B were uncommitted+removed = LOST; session 2 re-derived + re-applied. Progress + OOS drift analysis + next-session plan: `.tmp/audit/fix-translation-session2-status.md` (main tree).

## Question

`verify-translation-pairing` 是 7 个 node-24 meta-gate 中唯一仍红的。如何让它变绿？

## Context

- 本 session（2026-09-07）尝试：5 个 subagent 翻译 26 个 .zh.md + 28 个内部文档排除（manifest）+ Class B byte-align。结果：26 个 .zh.md 有 structural parity bug（heading 深度 / list / switcher / code-block 不一致，已回退）+ 并行 session 又新增 24 篇待译 + Class B 未完全解决。
- **本质问题**：moving-target——并行 session 持续新增文档（比翻译快），且 subagent 翻译难保证严格 structural parity（byte-identical code blocks + heading/list/table 对齐）。审计 d4 已记：U+FFFD 是历史 read-modify-write 静默损坏的同类问题。
- 54 篇缺失配对（28 内部 + 26 用户可见）：内部（`.agents/notes` 22 + `wayfinder` 3 + `docs/superpowers/plans` 3）应排除（不是用户可见）；用户可见（`docs/da-*` 5 + `packages/*/README` 21+）需翻译。
- 本 session 已验证：28 内部排除到 `scripts/translation-pairing.manifest.json` excluded[] 是 safe-auto（manifest 9→35；不能用 blanket glob——每个子目录已有配对文件会触发"excluded source must not have a counterpart"，需逐路径）；Class B byte-align（`docs/tool-catalog.zh.md:~2905` 的 `chart_type` description 对齐 EN）已修但 re-verify 未完全通过。

## Path to green（需要专门一轮，并行 session 暂停）

1. **并行 session 暂停**（让 master 停止新增文档）——否则 moving-target 永远追不上。
2. 排除 28 内部文档到 manifest `excluded[]`（22 `.agents/notes` 逐路径 + 3 `wayfinder` 逐路径 + `docs/superpowers/plans/` 目录排除——本 session 已验证）。
3. Class B byte-align：`docs/tool-catalog.zh.md:~2905` 的 `chart_type` description 对齐 EN，re-verify。
4. 逐篇翻译用户可见 .zh.md，**严格 structural parity**：相同 heading 深度/顺序、list kind/计数、table 行列、link target、**byte-identical code blocks（info string + content）**、switcher `[English](<name>.md) | 中文` 在 H1 后。每篇翻译后 `verify-translation-pairing` 检查 parity，逐个修（subagent 翻译易在 heading 深度/list 计数/code-block 上出错）。
5. `verify-translation-pairing --write --all` re-record 全部 pair。
6. `verify-translation-pairing` → exit 0 → PR + merge。

## Why not this session

- 并行 session 未暂停 → master 持续新增文档（24 篇新）。
- subagent 翻译 parity 质量不稳（26 个 .zh.md 多有 heading/list/switcher bug，已回退）。
- 在并发环境里是 losing battle；需要专门一轮 + 并行暂停 + 逐篇精修 parity。

## Options

- **A（推荐）**：专门一轮 session（并行暂停）+ 逐篇精修 + re-record → green。前置：先确认无其他 session 在跑，或协调暂停。
- B：admin-merge 容忍该门红（它是 i18n 文档债，不反映代码质量；GA-GT3 数据丢失修复已通过别的 PR 落地）。
- C：排除全部 fork 新增文档（pragmatic，fork 不维护新增文档中文化）——但用户选了"翻译用户可见"。

## Ticket Pointer

- 上游契约：[docs/i18n/README.md](../../../docs/i18n/README.md)
- 本 session 审计：`.tmp/audit/gate-translation-pairing.md`（54 篇详情 + Class B）
- map 索引：[wayfinder/data-agent/map.md § GA-FORK-CI](../map.md#ga-fork-ci-node-24-meta-gates-2026-09-07)
