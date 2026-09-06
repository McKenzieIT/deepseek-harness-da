# R5: `Issue lifecycle` / `Issue policy` 是上游专用，在本 fork 上永不可能绿

Branch: 未认领（认领时按 CLAUDE.md 声明 `<type>/r5-<slug>`）

## Question

两个 issue-management workflow 在**每个** PR 上都红（实测 #30、#36、#37 全红且全部照常合并）。
根因不是 bug，而是这套机制是为上游 `deepseek-harness/deepseek-harness` 写的，随 fork 带过来
却没有重新指向、也没有配套凭据。

**需决策**：禁用 / 加守卫 / 复刻上游配置 / 重新指向？

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

1. **加 repo 守卫（推荐）**：两个 job 加 `if: github.repository_owner == 'deepseek-harness'`。
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

- 是 [R4](R4-ci-red-gate-policy.md)（CI 门禁策略）里**最便宜、可独立先做**的一块。
- 若 [R3](R3-branch-protection.md) 要把这两个 check 设为 required，必须先做本票（否则永久锁死）。

## 验收

- 两个 job 在 fork 的 PR 上不再报 fail（skipped 或不再触发）。
- 决策与理由写进 map；若选候选 1/2，说明上游若要恢复该怎么做。
