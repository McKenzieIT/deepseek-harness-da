# UM6 — docs/subsystems：保 fork data-agent + 接受 upstream 其他

**Type**: docs
**Phase**: upstream-merge
**Status**: open
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
