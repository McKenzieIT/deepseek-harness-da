# GA-FORK-CI: verify-translation-pairing debt (the 1 remaining red node-24 gate)

Branch: fix/ga-fork-ci-translation-pairing (sessions 3-5; off origin/master @ `dd2f60fc4b` = PR #105 tracker-s4). **PR #102 (session 3) + PR #104 (session 4) + PR #106 (session 5) MERGED to master** (admin-merge Option B). Session 5 landed 15 packages/data+eval READMEs + recorded; corpus debt 21→6 (0 OOS). Local worktree + branches cleaned up after each session. Progress + method + remaining 6 + next-session plan: `.tmp/audit/fix-translation-session5-status.md` (main tree). Session 4's record: `.tmp/audit/fix-translation-session4-status.md`. Session 3's: `.tmp/audit/fix-translation-session3-status.md`. Session 2's: `.tmp/audit/fix-translation-session2-status.md`.

## Question

`verify-translation-pairing` 是 7 个 node-24 meta-gate 中唯一仍红的。如何让它变绿？

## Context

- **本质问题**：moving-target（并行 session 持续新增文档）+ subagent 翻译难保严格 structural parity（byte-identical code blocks + heading/list/table 对齐）。审计 d4 已记：U+FFFD 是历史 read-modify-write 静默损坏的同类问题。
- **sessions 3+4 验证了可行 method**（batch-by-batch，无需并行暂停）：并行 subagent（1/doc）+ verify-translation-pairing 工具门（非自报——session 1 的 26 篇翻车即因信自报）+ --write re-record + 显式路径 commit + md-wrap 一行一段。**0 structural divergence 首轮**（session 3 + 4 各 12 篇）。admin-merge Option B 容忍 corpus 红门逐批落地。
- 历史范围（session 2 baseline）：54 篇缺失配对（28 内部 + 26 用户可见）。28 内部已排除到 `scripts/translation-pairing.manifest.json` excluded[]（逐路径，非 blanket glob——每个子目录已有配对文件会触发 "excluded source must not have a counterpart"；manifest 9→35）。Class B byte-align 已修。

## Progress（sessions 3+4+5）

- Session 3（PR #102，merged 2026-09-07T10:49:58Z）：12 篇（packages/client 6 + packages/data 6）+ 5 OOS 全修（2 手写 minimal-patch + 3 auto-gen patch 直用，53 hunk 0 reject）+ md-wrap 修复。50→33。
- Session 4（PR #104，merged 2026-09-07T12:34:30Z）：12 篇（packages/data 12）。0 OOS（PR #103 无新增 in-scope 文档、无 regen drift）。33→21。
- Session 5（PR #106，merged 2026-09-07T15:07:51Z；merge `a095d66908`）：15 篇（packages/data 11 + packages/eval 4）。0 OOS（无 regen drift）。14/15 首轮 clean + 1 link-order byte-fix（tool-reachability-delta）。21→6。
- 剩余 6（packages/goal 2 + query 1 + docs/agents 3）。0 OOS。

## Path to green（batch-by-batch，已验证）

1. 每 session 开头 **re-verify**（master 持续涨——session 5 期间 dsh-G1 从 5d970f8743 涨到 65a94689bc；origin/master 经 #106 涨到 a095d66908；别信上 session 数字）取当前 missing + OOS。
2. 翻译一批用户可见 .zh.md（~12-15），**严格 structural parity**（heading 深度/顺序、list kind/计数、table 行列、link target、byte-identical code blocks、switcher 双侧 [authored reciprocate, generated omit]），用并行 subagent + verify-translation-pairing 工具门（非自报）+ --write re-record + 显式路径 commit（绝不 -A）。
3. 若有新 OOS（auto-gen regen drift：config-catalog/module-graph/event-producer-consumer）：`git cat-file -p <recorded-EN-blob> > /tmp/old.md; diff -u /tmp/old.md <current EN> > /tmp/en.patch; patch <name>.zh.md /tmp/en.patch`（0 reject，drift 在字节相同 code/table/mermaid 区域）+ rm .orig + --write re-record。手写 OOS = minimal-patch（合约 line 18，非重译）。
4. PR + admin-merge（Option B）。corpus 门在 6 篇全完成前保持红。
5. 全部 6 完成后：`verify-translation-pairing` → exit 0 → 绿 → GA-FORK-CI debt CLEARED。

## Why still red

- 6 篇未译（剩 packages/goal 2 + query 1 + docs/agents 3）。逐批翻译中。
- 并行 session 仍活跃（master 持续涨），但 sessions 3+4+5 证明 batch-by-batch admin-merge 能落地（moving-target 可追，非 losing battle）。

## Options

- **A（active，sessions 3+4 已采）**：batch-by-batch 翻译 + admin-merge Option B。每 session 一批 + 一 PR。method 可靠（0 divergence 首轮）。
- B：admin-merge 容忍该门红（i18n 文档债，不反映代码质量；GA-GT3 数据丢失修复已通过别的 PR 落地）——即 A 的每批机制。
- C：排除全部 fork 新增文档（pragmatic，fork 不维护新增文档中文化）——用户选了"翻译用户可见"，不用。

## Ticket Pointer

- 上游契约：[docs/i18n/README.md](../../../docs/i18n/README.md)
- session 5 交接：`.tmp/audit/fix-translation-session5-status.md`（main tree）
- session 4 交接：`.tmp/audit/fix-translation-session4-status.md`（main tree）
- map 索引：[wayfinder/data-agent/map.md § GA-FORK-CI](../map.md#ga-fork-ci-node-24-meta-gates-2026-09-07)
