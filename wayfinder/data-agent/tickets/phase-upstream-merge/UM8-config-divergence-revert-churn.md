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

## Merge outcome (2026-09-07)

~21 config+scripts conflicts：`AGENTS.md`、`THIRD_PARTY_NOTICES.md`、`apps/cli/package.json`、`knip.json`(UD — upstream 删，fork 改；fork-only config)、`pnpm-lock.yaml`、`python/sdk-runtime/package.json`、`scripts/{ci-workflow.spec, doc-budgets.manifest, gen-cordis-catalog, gen-third-party-notices, install-lefthook.spec, package-invariants, verify-package-readme-model-experience}` 7、`tsconfig.{base,client,host}.json` 3。

跨 UM 重叠：`api/remotes/package.json` ∈ UM4∩UM8、`bundle/web-app/package.json` ∈ UM7∩UM8、`host/apiproxy/{package.json,tsconfig.json}` ∈ UM4∩UM8（归 UM4 处置）。`knip.json`(UD) 清 apiproxy/sqlite 死指针（UM4/UM5 删后）；revert d5 churn 配置。

### Cascade update（pnpm-install unblock 发现）
package.json 解 = A-merge（4 UU：upstream base + fork data-agent deps）+ 5 restructured 包临时 restore（`client-runtime`/`sqlite`/`code-runtime-python`/`agent-spine-demo`/`jsonrpc-demo`）+ apiproxy deps 移除（apps/cli+web-app）。**临时 deviation**：UM4/5/7 迁移后回来清（移 restore + 更新 deps）。+ `pnpm install` 须 `--ignore-scripts`（fs-ext postinstall fail 挡 `.bin` 链接）；`build:official` 延后到 UM2–9 解 39 .ts 冲突后（tsc parse marker 失败）。

## Resolution (2026-09-08)

`knip.json` (UD — upstream deleted): kept fork's (clear apiproxy/sqlite dead pointers post UM4/UM5). `tsconfig.{base,client,host}.json`: merged upstream's new package path-mappings + fork's data-agent + zombie mappings KEPT (zombie alive, no dead pointers). `THIRD_PARTY_NOTICES.md`: accept-upstream (regen at Final via `gen-third-party-notices.ts`). lefthook `no-production-src-on-master` + `@qoder-ai/qoder-agent-sdk: false` override retained.
