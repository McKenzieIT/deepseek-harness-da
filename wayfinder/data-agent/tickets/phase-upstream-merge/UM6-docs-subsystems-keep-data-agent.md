# UM6 — docs/subsystems：保 fork data-agent + 接受 upstream 其他

**Type**: docs
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM3, UM4, UM5（src 落定后重生成 cordis-surface docs）
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
