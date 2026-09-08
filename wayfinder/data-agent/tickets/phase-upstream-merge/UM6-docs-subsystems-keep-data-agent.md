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

## Merge outcome (2026-09-07)

~44 docs conflicts：`docs/` 35（capability-seams/config-catalog/event-producer-consumer/module-graph/tool-catalog 各 .md/.zh.md/.i18n.yaml + `docs/subsystems/{README,core,credentials,session,subagent,tools,typert}`）+ `packages/{,bundle/,subagent/}README.{md,zh.md,i18n.yaml}` 9。

⚠️ **translation-pairing driver 跑不了**：fresh worktree 无 node_modules → `merge-translation-pairing` custom driver 失败，`.i18n.yaml` 留 ordinary text conflict。**解法**：`pnpm install && pnpm run resolve-translation-pairing-conflicts`（install 后 driver 可跑）。保 fork `docs/subsystems/data-agent.{md,zh.md,i18n.yaml}`（fork-only，无 upstream 对应——确认未在 conflict 列表 ✓）。

## Resolution (2026-09-08)

44 docs accept-upstream (`--theirs`). verify-translation-pairing run via tsx (bypassing broken `pnpm install`) — confirmed paired + clean. cordis-surface regen (`gen-doc-graphs`/`gen-tool-catalog`/`gen-cordis-catalog`) + doc-sync deferred to Final (after UM3–UM5 src landed). fork's `docs/subsystems/data-agent.{md,zh.md,i18n.yaml}` kept (fork-only, no upstream conflict).
