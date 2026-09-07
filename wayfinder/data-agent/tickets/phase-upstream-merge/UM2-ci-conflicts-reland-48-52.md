# UM2 — CI 冲突解决 + 针对新结构重落 fork #48/#52

**Type**: fix
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM1（需 staged merge）
**Blocks**: UM10（verify）
**Related**: [T6-ci-checkout-issue-policy](../../../repo-infra/tickets/T6-ci-checkout-issue-policy.md)、[GA-FORK-CI-green](../phase-misc/GA-FORK-CI-green.md)；fork PR #48（删 6 死 serial-* master-push job + sandbox macos 腿）、#52（issue-policy/lifecycle `if: github.repository_owner` skip）

## 背景

upstream `.github/workflows` 现 19 文件（fork 16）。ls-tree 确认 upstream **新增**：`ci-master.yml`、`build-preview-cloudflare.yml`、`release-publish.yml`、`release-vendor-publish.yml`；**保留**：`issue-lifecycle.yml`、`issue-policy.yml`、`sandbox.yml`（fork #48/#52 都动过）。upstream `61f910d ci: split master-only jobs into ci-master.yml` 把 master-only job 拆进新文件；`a33ed4d ci: stop PR gray checks from lifecycle and release publish jobs` 主动维护 issue-mgmt CI。

fork 的 #48（删 6 死 serial-* master-push job + sandbox macos 腿）是改**老 `ci.yml`** 结构；#52（`if: github.repository_owner == 'deepseek-ai'` 禁用 issue-policy/lifecycle）是 blunt skip。merge 带回 upstream 版（无 skip + 新 ci-master.yml 结构）→ GA-FORK-CI 重新变红。

## Scope

1. 先看 upstream 新 CI 结构：`ci.yml` + `ci-master.yml` + `issue-policy.yml` + `issue-lifecycle.yml` + `sandbox.yml` + 3 新 publish/preview workflow 的 runs-on/secret 依赖。
2. **重落 #48**：fork 缺 `dsh-ubuntu-24-04-16core`/`dsh-windows-2025-16core` larger runner + self-hosted（`gh api .../runners` 空）+ secret（`gh secret list` 空）。把"缺资源 job 跳过"逻辑从老 `ci.yml` 迁到新 `ci-master.yml` + `ci.yml`，**优先用 `vars.*` 驱动**（非硬编码 runner 名），保 `no-production-src-on-master.yml`（fork-only，无冲突）。
3. **重落 #52**：在 `issue-policy.yml` + `issue-lifecycle.yml` 重加 `if: github.repository_owner == 'deepseek-ai'`（fork 非 deepseek-ai owner → neutral-skip）。评估是否采 upstream `a33ed4d` 的 gray-check 守卫作补充。
4. **评估 3 新 workflow**（`build-preview-cloudflare.yml`/`release-publish.yml`/`release-vendor-publish.yml`）：是否引用 fork 没有的 Cloudflare/发布密钥/runner → 若红，加 owner 守卫或 skip。
5. GA-FORK-CI 非回归：6/7 绿（translation-pairing 本就红，不 regress 即可）。

## Resolution
（待落地后填：重落的 workflow 文件 + GA-FORK-CI 实跑结果）
