# R3: origin/master branch protection (admin action)

Branch: (none — GitHub admin setting, session cannot enable)

## Question

Enable origin/master branch protection to close the `--no-verify` / no-lefthook bypass.

## Context

② added the CI gate (`.github/workflows/no-production-src-on-master.yml`, PR #6 merged) — reactive (alerts after a bypassed direct push). The REAL prevention is branch protection (GitHub admin setting the session cannot enable; called out in ②'s PR body).

## Action (admin, on github.com/McKenzieIT/deepseek-harness-da/settings/branches → master)

- "Restrict pushes" — block direct pushes to master (only PRs merge).
- "Require status checks to pass before merging" — require the `verify-no-production-src-on-master` check (+ CI).

Once on, `--no-verify` is fully closed (direct pushes blocked pre-push; the local pre-push gate + the CI gate become belt-and-suspenders).

---

## ⚠️ 2026-09-06 审计：本票**不能按原文直接执行**，新增两条硬约束

证据见 [ci-red-audit-2026-09-06](../research/ci-red-audit-2026-09-06.md)（数字均已机械重导）。

### 约束 1：现在开 "Require status checks (+ CI)" 会把 master 永久锁死

先确认现状：`gh api repos/McKenzieIT/deepseek-harness-da/branches/master/protection` → **404
"Branch not protected"**（是 404 未受保护，不是 403 无权限）。即本票尚未执行，且当前**没有任何**
required check。

而 CI 在 PR 上有 **6 个 check 恒红**，全为 master 既有欠债，且经 `cmp`/`comm` 与已合并的
PR #36 逐项比对确认与 PR diff 无关：

- `node 24 / static` —— 17 个 gate 失败（含 402 条 jsdoc、25 个 python closure 依赖、6 条 config-catalog）
- `node 24 / coverage` —— 512 条阈值 ERROR / **161 个文件**（`vitest.config.ts:285-292` 是
  `perFile: true` + statements/branches/functions/lines 全 100%）
- `node 24 / snapshots and artifacts` —— 30 个包缺 `./invariant` 导出
- `python runtime / node24-linux-x64` —— 25 个 preset 插件未进 `python/sdk-runtime` deps
- `windows node 24 / native complete` —— **不稳定**（失败文件集合 run-to-run 抖 ±3 个）
- `Issue lifecycle` / `Issue policy` —— 上游专用，fork 上**永不可能**绿（见 [R5](R5-issue-workflows-upstream-only.md)）

→ **本票被 [R4](R4-ci-red-gate-policy.md) 阻塞**：必须先定「哪些 gate 进 required、其余怎么办」。
本票原文写的 "require the `verify-no-production-src-on-master` check **(+ CI)**"，
那个括号里的 "+ CI" 就是锁死点 —— 只 required 前者是可行的，加上 CI 全量不可行。

### 约束 2："Restrict pushes" 会切断 wayfinder 文档直推 master 的既定路径

CLAUDE.md 明文允许「diff 不触及 `packages/*/src` 的纯 `wayfinder/` 文档」直推 master，
且 `wayfinder/_templates/session-prompt.md` 与各 session prompt 的「文档直推」小节把它当标准做法
（2026-09-06 的 CL-20 收尾 session 就走了两次：独立 worktree → cherry-pick → `git push origin HEAD:master`）。

开 "Restrict pushes"（只允许 PR 合并）会让这条路径失效。**开之前必须先决定文档怎么走**：

- (a) 文档也一律走 PR —— 每次改 ticket/map 都开一个 PR，成本显著上升；
- (b) 给 master 留 bypass（GitHub 的 "Allow specified actors to bypass required pull requests"）；
- (c) 改用 ruleset 按路径豁免（`wayfinder/**` 免 PR）—— 需确认 GitHub 是否支持按路径放行
  （**未验证**，落笔时未查 GitHub 当前能力）。

同时要更新 CLAUDE.md + session-prompt 模板，否则文档与实际强制策略矛盾。
