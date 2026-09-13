# UM6 — docs/subsystems：保 fork data-agent + 接受 upstream 其他

**Type**: docs
**Phase**: upstream-merge
**Status**: resolved (2026-09-13 add-group-READMEs for embedder/query/retrieval + eval exemption; see [Resolution](#2026-09-13-resolution--add-group-readmes--eval-exemption-5-to-0-violations) below)
**Assignee**: unclaimed
**Blocked by**: ~~UM3, UM5~~（archived/done via re-sync）+ **UM4（仍开）** → 2026-09-10 重评：仅剩 UM4 一个前置
**Related**: d5 line 54（generated doc sync KEEP）；fork `docs/subsystems/data-agent.{md,zh.md,i18n.yaml}`

## 背景

upstream 无 data-agent 子系统文档（grep 命中 0）→ fork 的 `docs/subsystems/data-agent.{md,zh.md,i18n.yaml}` 是 fork-only。upstream 改了其他 subsystem docs（d5 line 54：cordis surface 重生成，`Source:` 行号位移 + 签名镜像——CORRECT，非 drift）。

## Scope

1. 保 fork 的 `docs/subsystems/data-agent.{md,zh.md,i18n.yaml}`（fork-only，无 upstream 对应）。
2. 接受 upstream 的其他 subsystem docs（`core/credentials/session/subagent/tools/typert .md` 等重生成位移）。
3. UM3–UM5 src 改动落定后，**重生成 fork 的 cordis-surface docs**（data-agent surface 反映新 src——apiproxy 删除/results-RPC 重落户/sqlite 删除后的签名位移）。
4. 跑 `doc-sync` 门，保 fork data-agent docs 与 src 一致。

## Resolution

**[2026-09-09 triage] → Status: leave-open (blocked-on-R-DA).** `docs/subsystems/data-agent.{md,zh.md,i18n.yaml}` preserved through re-sync（fork-only，upstream 无）；`data-agent.md` 带 `Source:` refs to `packages/data/*`（cordis-surface generated doc intact）；residual cordis-surface REGENERATION（反映 post-re-sync src：apiproxy 删/results-RPC re-home/sqlite 删/R-DA presenter 迁移）blocked by UM4 + R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2；doc-sync gate green-check folds into UM10。详 `.tmp/next-5-triage.md`。

---

### (original pre-triage)
（待落地后填：data-agent docs 保留确认 + cordis-surface 重生成结果 + doc-sync 绿）

### [2026-09-11 复核] 本票**已无阻塞**；Scope 3 其实已完成；Scope 4 里真正属于本票的只有 `subsystem-pages` 5 条

- **阻塞解除**：header 写「仅剩 UM4 一个前置」，但 [UM4](UM4-apiproxy-rehome-results-rpc-remote.md) 自己的结论是「**UM6 的前置（UM4）就是 Scope 2，已解除**」。本票现在可以直接认领。
- **Scope 3（重生成 fork 的 cordis-surface docs）已经是绿的**，票不知道：`gen-cordis-catalog --check` 99 up to date、`gen-doc-graphs --check` 6 up to date、`gen-architecture-graph --check` up to date、`verify-doc-refs` 3089 files 全通、`verify-md-links` 1730 files 干净；`docs/subsystems/data-agent.*` 在 `verify-translation-pairing` 的违规名单里出现 **0 次**。残留耦合只剩前向的一条：**若 UM4 Scope 3 改了 `packages/preset/agent-presets/src/index.ts`，需重跑 `gen-cordis-catalog`（+ 已发 zh 的 `gen-doc-graphs`）**。
- **Scope 4（doc-sync 全绿）不该整包记在本票头上**。doc-sync 组今天的红叶子共 5 门，其中 4 门有别的归属：`type-equivalence`→[UM-QODER-SUBAGENT-RETIRE](UM-QODER-SUBAGENT-RETIRE.md)、`translation-pairing`→A 类 pre-existing（parallel-dev-cleanup/R1）、`export-jsdoc`（3 条）→A 类、`documentation standard tests`（12 个测试里挂 2 个）→C 类无主。
- **真正属于本票的是 `verify-subsystem-pages` 的 5 条**，全是 fork 的 data-agent 包组：
  - `packages/data/README.md`、`packages/eval/README.md` —— 文件存在（16/11 行）但**没有直接指向 `docs/subsystems/*.md` 的链接**；各加一行，外加 `.zh.md` 侧与 `.i18n.yaml` 配对记录。
  - `packages/embedder/README.md`、`packages/query/README.md`、`packages/retrieval/README.md` —— **整个 group README 缺失**。双语规则下约需 **9 个新文件**（`README.md` + `.zh.md` + `.i18n.yaml` ×3）。
  - **或者**：给 `GROUPS_WITHOUT_SUBSYSTEM_PAGE`（`scripts/verify-subsystem-pages.ts:17-24`）加带理由的豁免条目 —— 这是**策略决定**，不是机械修，需要人拍板。
- 相邻的 fork 翻译债（不归本票，属 A 类）：`packages/data/README.zh.md:5`、`packages/eval/README.zh.md:9`、`packages/data/tool-{load-event-definition,load-table-definition,search-data-sources}/README.zh.md:40/46`、`packages/query/query-tool/README.zh.md:43` 均挂 wrong-locale link。
- **估算**：本票本体 **1 session**（2 处加链 + 3 个 group README 双语，或改走豁免；再复验 doc-sync 叶子）。**别把另外 4 门算进来。**
- ⚠ 本票是四张 UM 票里维护最差的：2026-09-09 之后零条目，而期间 `4b7e15e920`(doc-graphs)/`4d6bb8be8b`(inspect catalog)/`4d4f725748`(zh emission) 都已落地。

---

### [2026-09-13] Resolution — add-group-READMEs + eval exemption; 5→0 violations

**Applied (commit `10ab5f771f`, PR #125 merged `8ace277bce`):** add-group-READMEs (not exemption) for embedder/query/retrieval, plus 2 link edits + 1 exemption entry. Resolves all 5 `verify-subsystem-pages` violations.

1. **3 new group README triplets** (9 files: README.md + README.zh.md + README.i18n.yaml × 3):
   - `packages/embedder/` — links `docs/subsystems/data-agent.md#ctxembedder--embedderservice-abstract-seam` (the generated Cordis-surface contract for `ctx.embedder`, data-agent.md line 92).
   - `packages/query/` — links `docs/subsystems/data-agent.md#ctxquery--queryengine-abstract-seam` (`ctx.query`, data-agent.md line 378).
   - `packages/retrieval/` — links `docs/subsystems/data-agent.md` (via the embedder anchor; no dedicated `ctx.retrieval` Cordis-surface section exists — the seam is pipeline-internal, retrieval-inproc consumes `ctx.embedder` and feeds nl2sql schema-linking).
2. **2 link edits** (existing group READMEs that had content but no subsystems link): `packages/data/README.{md,zh.md}` — added a "Related documentation" line linking `docs/subsystems/data-agent.{md,zh.md}`. Also fixed one pre-existing wrong-locale link at `packages/data/README.zh.md:5` (`../bundle/data-agent/README.md` → `.zh.md`) since UM6 was already editing that file.
3. **1 exemption entry**: `packages/eval/` added to `GROUPS_WITHOUT_SUBSYSTEM_PAGE` in `scripts/verify-subsystem-pages.ts` — matches the existing sdk/util exemption rationale style (eval is a pure TS library that registers nothing on a Cordis context and consumes injected collaborators; the child `packages/eval/eval/README.md` self-describes as "pure library"; no `docs/subsystems/*eval*` page exists).
4. **3 + 3 pairing records refreshed** via `pnpm run verify-translation-pairing --write` (the 3 new triplets + the `packages/data` pair + the `docs/subsystems/{tools,core}` pairs touched by the SCOPEID commit).

**Why add-READMEs, not exemption (research `um6.json`, high-confidence):** exemption is reserved (per `verify-subsystem-pages.ts`'s own doc-comment) for groups that genuinely own NO standalone subsystem reference. `docs/subsystems/data-agent.md` documents `ctx.embedder` (line 92) + `ctx.query` (line 378) — real owning pages exist, so add-group-READMEs is the honest fix. retrieval is part of the same data-agent overlay pipeline (retrieval-inproc consumes `ctx.embedder`). eval is the ONE legitimate exemption candidate among the 5 (pure library, no ctx-key).

**Risk 3 (UM4 coupling) verification:** `gen-cordis-catalog.ts` SERVICE_PAGE (lines 125-137) maps embedder/query/audit/nl2sql/schema/scopes/evidenceQuery/etc. → `data-agent.md`, and `computeOutputs()` (~lines 1085-1113) rewrites `data-agent.{md,zh.md}` + `data-agent.i18n.yaml` between the generated cordis-surface markers. **But data-agent.md is CURRENTLY FRESH** (`verify-cordis-catalog` = "99 up to date"), so a regen today is a no-op. The coupling is forward-only: if UM4 Scope 3 lands src changes that project onto these SERVICE_PAGE keys, the next `gen-cordis-catalog` run will rewrite data-agent.md — this commit records that baseline as fresh so any future UM4 apply diff is unambiguous. `gen-doc-graphs` was also verified fresh ("6 graph doc(s) are up to date"); it does not emit data-agent.md by path.

**Acceptance verification:**
- `pnpm run verify-subsystem-pages` → **"55 group(s) checked (48 linked, 7 explicitly exempt), all conform"** (was 5 violations).
- `pnpm run verify-cordis-catalog` → "99 up to date" (unchanged; regen no-op).
- `pnpm run verify-doc-graphs` → "6 graph doc(s) are up to date".
- `pnpm run verify-translation-pairing packages/{embedder,query,retrieval,data}/README.md docs/subsystems/{tools,core}.md` → "6 named pair(s) consistent".

**Refs:** research `wayfinder/data-agent/research/next-session-2026-09-14/um6.json`; exemplars `packages/{guard,llm,credentials}/README.{md,zh.md,i18n.yaml}`.
