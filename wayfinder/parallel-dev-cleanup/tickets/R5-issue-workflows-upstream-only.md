# R5: `Issue lifecycle` / `Issue policy` 是上游专用，在本 fork 上永不可能绿

**Status**: resolved (2026-09-07, `2fa038f6e6`) —— 由 data-agent [UM2](../../data-agent/tickets/phase-upstream-merge/UM2-ci-conflicts-reland-48-52.md) 的 re-land 做掉，非本 effort 走的路；2026-10-06 本 session 实测复核（见下「实际落地」）
**Branch**: (none — 已在 master 上生效)

## Question

两个 issue-management workflow 在**每个** PR 上都红（实测 #30、#36、#37 全红且全部照常合并）。
根因不是 bug，而是这套机制是为上游 `deepseek-harness/deepseek-harness` 写的，随 fork 带过来
却没有重新指向、也没有配套凭据。

**需决策**：禁用 / 加守卫 / 复刻上游配置 / 重新指向？

## 实际落地：候选 1（加守卫），但不是本 effort 做的（2026-10-06 复核）

**答案 = 候选 1。** 守卫已在 master 上生效，由 data-agent 的
[UM2](../../data-agent/tickets/phase-upstream-merge/UM2-ci-conflicts-reland-48-52.md)
re-land 做掉（commit `2fa038f6e6 fix(ci): clear the merge-caused gate failures from the upstream sync`），
本票从未被认领。2026-10-06 本 session 实测复核：

- `.github/workflows/issue-policy.yml:19` → `if: ${{ github.repository_owner == 'deepseek-ai' }}`
- `.github/workflows/issue-lifecycle.yml:43` → `github.repository_owner == 'deepseek-ai' && …`
- `gh run list --workflow=issue-policy.yml -L 5` → **5 次全部 `conclusion: "skipped"`**
  （最近一次 2026-09-24，`docs/w27-session-closeout-polish`）

→ 本票验收「两个 job 在 fork 的 PR 上不再报 fail」**已达成**。

### ⚠️ 本票原文的候选 1 写错了 owner 字符串

原文建议 `github.repository_owner == 'deepseek-harness'`。**那是错的**，照它改会把上游一起 skip：

- `deepseek-harness` 是 issue-management 的**组织名**（`.github/issue-management/config.json:2-3`
  的 `organization` / `repository`，也是 `issue-lifecycle.yml:59-60` 的 App `owner`）。
- 真正的仓库 **owner** 是 `deepseek-ai`（upstream 为 `deepseek-ai/…`，fork 为 `McKenzieIT/…`）。

实际落地用的是 `'deepseek-ai'`，即「upstream 跑、fork 跳」；原文的 `'deepseek-harness'`
在**两边都不成立**，会让上游也失去 issue 自动化。本票的证据节把 config 里的 organization
误当成了 repository owner —— 这是原文唯一的实质错误，记在此处以免后人照抄。

## 证据（每条 file:line 均已打开核实，2026-09-06）

**硬编码上游 owner/repo 三处**：

- `.github/workflows/issue-lifecycle.yml:53-54` → `owner: deepseek-harness` / `repositories: deepseek-harness`
- `.github/issue-management/config.json:2-3` → `"organization": "deepseek-harness"` / `"repository": "deepseek-harness"`
- `.github/issue-management/policy.mjs:618` →
  `` api(`/repos/${config.organization}/${config.repository}/pulls/${number}/requested_reviewers`) ``

→ 实际请求 `deepseek-harness/deepseek-harness/pulls/37` → **404 Not Found**（PR #37 在 fork 上）。
`policy.mjs` 全文**零** `github.repository` / `GITHUB_REPOSITORY` 引用（即不是变量，是字面量）。

**凭据缺失**：

- `gh api repos/McKenzieIT/deepseek-harness-da/actions/variables` → `total_count: 0`
- secrets 只有 `DASHSCOPE_API_KEY`
- → `vars.DSH_ISSUE_APP_CLIENT_ID` 为空 → `actions/create-github-app-token` 报
  `The 'client-id' (or deprecated 'app-id') input must be set to a non-empty string.`

**结构上与任何 PR diff 无关**：两个 workflow 都 checkout `ref: default_branch`（master），
不读 PR 分支 —— 所以任何 PR 都改不动它们的结果，修复必须落在 master。

## 候选

1. **加 repo 守卫（推荐 → 已落地，但 owner 字符串应为 `'deepseek-ai'`，见上）**：
   两个 job 加 `if: github.repository_owner == 'deepseek-harness'` ← **原文此处写错，勿照抄**。
   代价最低、不删上游代码、fork 上变 skipped（GitHub 把 skipped 计为通过）。
   副作用：fork 失去 issue 自动化 —— 但它现在也没有。
2. **在 fork Settings → Actions 里禁用这两个 workflow**。等效但不留代码痕迹，
   新 clone / 新 fork 会再踩一次。
3. **重新指向 fork**：改 `config.json:2-3` → `McKenzieIT` / `deepseek-harness-da`。
   只能修好 `Issue policy` 的 404；`Issue lifecycle` 还要建 GitHub App（client-id + private-key）
   **并且**复刻上游的 ProjectV2（`config.projectNumber=1`、`projectTitle="DSH Issue Management"`，
   `policy.mjs` 会去读）。对 fork 而言代价不成比例。
4. **保持现状**，在 map/CLAUDE.md 记明「这两个红是预期的、可忽略」。
   最省事，但持续给每个 PR 制造噪声，且让「CI 红」这个信号继续失效。

## 与其他票的关系

- 曾被 [R4](R4-ci-red-gate-policy.md) 标为「里面最便宜、可独立先做的一块」——
  **该定位已失效**：本票已 resolved，不再是 R4 的一部分。R4 腾出的这个「最便宜可先做」的位置
  由 [R6](R6-master-direct-push-permission-set.md) 接。
- [R3](R3-branch-protection.md)：这两个 check 现为 `skipped`，GitHub 把 skipped 计为通过，
  故它们**不再是** required 集合的锁死点。R3 的前置是 R4 + R6。
- 归属：fork-only workflow 条件与 upstream 边界的**后续**决策属 repo-infra
  [T29](../../repo-infra/tickets/T29-da-ci-upstream-boundary.md)（CB-5 已迁入），不在本票。
- 同一事实的第四处记账：semantic-layer `CB5-da-ci-upstream-boundary.md:69-76` 也分析过这两个
  workflow，该票已 `status: migrated` → T29。repo-infra
  [T6](../../repo-infra/tickets/T6-ci-checkout-issue-policy.md) 是第三处（closed）。

## 验收

- ~~两个 job 在 fork 的 PR 上不再报 fail（skipped 或不再触发）。~~
  **已达成**（2026-10-06 实测：最近 5 次运行全部 `skipped`）。
- ~~决策与理由写进 map；若选候选 1/2，说明上游若要恢复该怎么做。~~
  **已达成**：决策 = 候选 1，记入 map 的 Decisions so far ⑥。
  **上游若要恢复**：无需动作——守卫条件是 `repository_owner == 'deepseek-ai'`，
  在上游恒真，两个 workflow 照常运行；fork 侧若将来要启用，需补
  `vars.DSH_ISSUE_APP_CLIENT_ID` + App private key + 复刻 ProjectV2（`config.projectNumber=1`），
  代价见候选 3。
