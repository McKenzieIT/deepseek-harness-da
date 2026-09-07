# UM8 — 配置分歧（knip/lefthook/tsconfig/package.json/pnpm-workspace）+ 回退 churn

**Type**: chore
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM4, UM5（knip 死指针须先知 apiproxy/sqlite 去留）
**Related**: d5 line 55（config additive KEEP）；fork `knip.json`/`CHANGELOG.md`（fork-only，upstream 无）

## 背景

`knip.json` + `CHANGELOG.md` fork-only（upstream 顶层 ls-tree 确认皆无）。d5 line 55 列 config additive KEEP（knip new entries + stale-pointer cleanup、lefthook `no-production-src-on-master`、package.json 1 script、pnpm-workspace `@qoder-ai/qoder-agent-sdk: false` override、tsconfig path-mappings、`.gitignore` 32/0）。

## Scope

1. **knip.json**：UM4（删 apiproxy）+ UM5（删 sqlite）后，清指向这俩的死指针；保留 data-agent entries。
2. **tsconfig.{base,host,client}.json**：path-mappings for 新/改名包（upstream 重构后包图变）逐个对账。
3. **lefthook.yml**：保 `no-production-src-on-master` hook（fork-only）。
4. **package.json / pnpm-workspace.yaml**：1 script + `@qoder-ai/qoder-agent-sdk: false` override 核仍需。
5. **revert d5 12 churn 配置文件**（UNNECESSARY-DIVERGENCE）。
6. **CHANGELOG.md**：fork-only，保（upstream 无 CHANGELOG，用 `.agents/notes/implemented/` 替代——fork 双轨）。

## Resolution
（待落地后填：knip 死指针清理 + tsconfig 对账 + churn 回退清单）
