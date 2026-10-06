# R3: origin/master branch protection (admin action)

**Status**: blocked
**Blocked by**: [R4](R4-ci-red-gate-policy.md)（required 集合）、[R6](R6-master-direct-push-permission-set.md)（直推许可集）
**Branch**: (none — GitHub admin setting, session cannot enable)

## Question

Enable origin/master branch protection to close the `--no-verify` / no-lefthook bypass.

## Context

② added the CI gate (`.github/workflows/no-production-src-on-master.yml`, PR #6 merged) — reactive (alerts after a bypassed direct push). The REAL prevention is branch protection (GitHub admin setting the session cannot enable; called out in ②'s PR body).

## Action (admin, on github.com/McKenzieIT/deepseek-harness-da/settings/branches → master)

- "Restrict pushes" — block direct pushes to master (only PRs merge).
- "Require status checks to pass before merging" — require the `verify-no-production-src-on-master` check (+ CI).

Once on, `--no-verify` is fully closed (direct pushes blocked pre-push; the local pre-push gate + the CI gate become belt-and-suspenders).

---

## ⚠️ 审计：本票**不能按原文直接执行**

初次审计 2026-09-06，**2026-10-06 复测并重新归因**。

### 现状（2026-10-06 复测，与 2026-09-06 一致）

`gh api repos/McKenzieIT/deepseek-harness-da/branches/master/protection` → **404 "Branch not protected"**
（是 404 未受保护，不是 403 无权限）。即本票尚未执行，且当前**没有任何** required check。

### 本票等的是两条决议，**不是红门归零**

这是 2026-10-06 scoping 的核心更正。本票挂了一个月，此前读起来像是在等「6 个红 check 修完」——
**不是**。它等的是两个有限的决议：

1. **[R4](R4-ci-red-gate-policy.md) —— required 集合。**
   本票原文写 "require the `verify-no-production-src-on-master` check **(+ CI)**"，
   括号里的 "+ CI" 就是锁死点：只 required 前者是可行的，加上 CI 全量不可行。
   R4 定完「哪些进 required」，本票这一侧即解除——**即使其余红门仍然红**。
2. **[R6](R6-master-direct-push-permission-set.md) —— 直推许可集。**
   required status checks **对直推同样生效**（2026-10-06 已查实有文档支持，见
   [research note](../research/github-path-scoped-pr-exemption-2026-10-06.md) 的 ①：
   required checks 挂在 commit SHA 上，新建的本地 commit 无 status 故必被拒），
   所以「开 protection」会切断 CLAUDE.md 明文允许的 `wayfinder/**` 文档直推路径。
   这不只是 "Restrict pushes" 的问题——**即使只开 required checks，那条路径一样断**。
   且 R6 原先的候选 (c)「ruleset 按路径豁免 `wayfinder/**`」**已查实为 GitHub 不支持**，
   所以这条路径没有「配置一下就绕过去」的解法，必须真做决议。

**红门本身的归零/冻结属 [repo-infra](../../repo-infra/map.md)（T18–T30），不是本票的前置。**
本票不在此复制红门清单与规模数字（归属口径见 map 的 Notes）；
当前集合以 repo-infra map 的「当前真实红门清单」为准，该清单的重建见
repo-infra [T30](../../repo-infra/tickets/T30-ci-red-gate-rebaseline.md)。

### 原「约束 2」已迁出

「"Restrict pushes" 会切断 wayfinder 文档直推路径」整段（含 (a) 文档一律走 PR /
(b) bypass actors / (c) ruleset 按路径豁免 三个候选，以及「GitHub 是否支持按路径放行」这条未验证事实）
已于 2026-10-06 迁入 **[R6](R6-master-direct-push-permission-set.md)**，
与 R4 的「措辞 vs 正则」附带决策合并——两者是同一问题的两种表述。

### 执行前仍须同步的文档

开启后要更新 CLAUDE.md + `wayfinder/_templates/session-prompt.md`，否则文档与实际强制策略矛盾。
具体改成什么由 [R6](R6-master-direct-push-permission-set.md) 定。

## 验收

- master 的 `protection` 不再是 404，且 required 集合**等于** R4 的决议（不多不少）。
- R6 决议的文档路径在新设置下**实测可走通**（不是推断——要真推一次 wayfinder 文档）。
- CLAUDE.md 与 session-prompt 模板的措辞与实际设置一致。
