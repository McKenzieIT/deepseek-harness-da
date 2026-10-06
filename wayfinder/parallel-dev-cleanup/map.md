# wayfinder:map — parallel-dev cleanup

> 本地 markdown tracker(wayfinder skill 默认)。子 ticket 在 `tickets/`。本 map 是**索引**,非存储——决策详情在其 ticket。

## Destination

清理"并行开发遗留项":gate 覆盖、CI 硬拦、结构偏离翻译对、旧分支、missing .zh.md。每项一个分支 + PR,gate 护着 master。

## Notes

- **域**:repo 治理 / i18n / 分支卫生(非 data-agent 功能改造)。
- **纪律**:CLAUDE.md 并行 session 分支纪律 + 提交/引证纪律(每 session 启动必读);docs/da-pr-workflow.md 分支契约;wayfinder/_templates/session-prompt.md。
- **gate**:`verify-no-production-src-on-master`(lefthook pre-push + CI workflow)拦直推 master 的生产源码。**2026-10-06 实测的实际覆盖**:`(packages|apps|native|python)/**/(src|bin)/` + `scripts/` —— `bin/` 已由 `34f8098a83` 加入(① 记的「bin/ 不拦」缺口**已补**);仍放行 `tests/`、`.github/`、任意 `*.md`、锁文件与配置。spec 32 个测试。许可集与措辞的对齐见 〔tickets/R6〕。
- **CI 红门归属(2026-10-06 定)**:本 map 持有门禁**策略**(〔R4〕required 集合 / 〔R3〕branch protection / 〔R6〕直推许可集);红门的**逐项修复**属 [repo-infra](../repo-infra/map.md)(T18–T30);**总账与合并期重基线**属 [data-agent](../data-agent/map.md) 的 `GA-FORK-CI-green` + UM 系列。**三方互不复制对方的数字** —— 本 map 不再本地保存红门规模快照(2026-09-06 那份一天即漂移、一个月后更含一个已不存在的 job 名)。
- **Status 词表**(封闭集;单行 `**Status**: <值>` 语法,可带 `(日期, PR #N)` 后缀):`open` 可取且无未闭前置 · `blocked` 有未闭前置,须列 `**Blocked by**:` · `ledger` 不再承接修复、仅留施工记录、**不进 frontier** · `resolved` 验收已达成 · `resolved-pending-verification` fix 已合并但本域验收未凑满 · `moot` 前提已蒸发(非范围判断) · `migrated` 归属已迁出,须给目标链接。**新值须先进本表。** 其余 wayfinder map 不在本次写权内,本表仅约束本 map。
- **i18n**:docs/i18n/README.md pairing 契约(EN + .zh.md + .i18n.yaml blob-hash);extended workflow `pnpm run gen-translation-brief <pair>` 用于大 generated 更新。

## Decisions so far

- **① gate 覆盖扩展 (resolved 2026-09-05, PR #5 merged)**:`PROD_SRC_PATTERN` → `^(?:(?:packages|apps|native|python)\/(?:[^/]+\/)+src\/|scripts\/)/`。src-style(与现有 packages scope 一致);scripts/ 整目录(无 src/ 子目录,文件即源)。spec +14 用例(27 tests)。集成自测 `GATE_BRANCH=master GATE_RANGE=c66e3beffc~1..c66e3beffc` → exit 1(gate 拦住创建它自己的 commit)。**已知缺口**(src-style by design):apps/native/python 非源文件(README/config/tests/hatch_build.py)不拦;顶层 examples/ 不在 scope(packages/examples/*/src/ 已被现有 pattern 覆盖);**`packages/*/*/bin/*.ts` 不拦**(2026-09-06 实测:`PROD_SRC_PATTERN.test('packages/eval/eval-cli/bin/probe-triage.ts')` = false)——bin/ 是可执行代码却可直推 master,与 src/ 同类风险,是同一 family 的缺口。
- **② CI gate (resolved 2026-09-05, PR #6 merged)**:`.github/workflows/no-production-src-on-master.yml`,`push:branches:[master]` 触发;head commit 是 "Merge pull request #N"(PR 合并)则跳,否则 `GATE_RANGE=before..after` 跑 gate。**reactive**(push 已发生,报警非预防);真预防=branch protection(admin,② PR 写明)。`--merge` 假设(若改 squash/rebase 需返工)。
- **③ 3 结构偏离翻译对 (resolved 2026-09-05, PR #8 merged)**:tickets/README(union:G-DA6 补进 EN,因 EN 缺这个真实 ticket)、eval/README(加 Batch Runner + Host wiring 节,删过时"无 CLI/persistence"bullet——P11c 已 ship 假声明)、tool-catalog(gen-translation-brief,23 新工具译中文,代码块 verbatim)。每对 pre-write 自查结构 + --write + scoped green;corpus 3 对缺席(绿)。
- **④ 旧分支清理 (resolved 2026-09-05, 无 PR,本地+报告)**:删 2 merged(phase2-ontology `2cdf784769`、rc8-merge-trial `489c95bf59`——0 unmerged,实测 ancestor of origin/master)。留 2 unmerged(有 unique commit,不弃):fix/da-compliance-audit(11 superseded + 1 unique `6d62764bda revert web-app dashscope insert forbidden by rule 4.3`)、fix/legacy-empty-callid(1 unique `ac0251360a tolerate legacy empty callId`)。cl23 没碰。
- **⑤ 55 missing .zh.md triage (resolved 2026-09-05, PR #10 merged)**:55 分类(22 .agents/notes 内部 + 33 用户可见[10 docs + 21 packages/README + 2 wayfinder])。译 2(adr-0001 EN→ZH 译、da-product-brief 中文撰写 copy),53 defer(triage + 优先级 + 建议)。scoped green。
- **⑥ issue workflows 上游专用 (resolved 2026-09-07, `2fa038f6e6`)**〔[R5](tickets/R5-issue-workflows-upstream-only.md)〕:决策 = **加 repo 守卫**。`issue-policy.yml:19` + `issue-lifecycle.yml:43` 的 `github.repository_owner == 'deepseek-ai'` 让两个 job 在 fork 上 skipped(GitHub 计为通过)。**不是本 effort 走的路** —— 由 data-agent [UM2](../data-agent/tickets/phase-upstream-merge/UM2-ci-conflicts-reland-48-52.md) 的 re-land 顺带做掉,本票从未被认领;2026-10-06 本 map 实测复核(最近 5 次运行全 `skipped`)后补记。**订正**:R5 原文建议的 owner 字符串 `'deepseek-harness'` 是**错的**(那是 issue-management 的 organization,不是仓库 owner),照抄会把上游一起 skip。同一事实曾在四处记账(R5 / repo-infra T6 / semantic-layer CB-5 / data-agent UM2),后续归属统一 → repo-infra [T29](../repo-infra/tickets/T29-da-ci-upstream-boundary.md)。
- **⑦ 本地 master 发散已消解 (verified 2026-10-06)**:原 fog 记「并发 session 的生产-src commit `c26eada21b fix(client): ui-context-layer` 推不上、gate 拦住」。实测该 commit 现**不被任何分支引用**,本地 master 相对 origin/master 已无发散。无需 Lead 收敛,条目作废。

## Open tickets

<!-- 活票清单。磁盘上的 tickets/ 为准;本节是索引。 -->

- [R1: 53 missing .zh.md deferred](tickets/R1-translation-defer-53.md) — `open`。⑤ 的 53 defer follow-up;下 3-5 key:da-upstream-debt(132L)、da-architecture(146L)、da-pr-workflow(153L)（**frontier**）
- [R2: 2 unmerged August 分支 — PR 还是留](tickets/R2-unmerged-branches.md) — `open`,等 user/Lead 决策。两个分支各有 1 unique commit(`6d62764bda` dashscope revert、`ac0251360a` legacy empty callId),均不在 master（**frontier**）
- [R3: origin/master branch protection](tickets/R3-branch-protection.md) — `blocked` by R4 + R6。**不阻塞于红门归零** —— 2026-10-06 更正:它等的是两条决议。现状复测 `protection` = 404 未受保护
- [R4: 哪些 CI check 进 required](tickets/R4-ci-red-gate-policy.md) — `blocked` by repo-infra [T30](../repo-infra/tickets/T30-ci-red-gate-rebaseline.md)。四候选(先修再开 / 分级 required / 冻结已知基线 / 接受现状);规模数字已交回 repo-infra
- [R6: master 直推许可集](tickets/R6-master-direct-push-permission-set.md) — `open`,**零依赖红门、最便宜可先做**(接替 R5 腾出的位置)。措辞 / 正则 / GitHub 设置三者不一致,方向各不相同（**frontier — grilling**）

## Not yet specified

- **重启在跑 session**(含 dsh-cl23)让新 CLAUDE.md 生效——ops(session 做不了)。**⚠️ 2026-10-06:本条自 2026-09-06 起未复核**,当时那批 session 是否仍在跑无法从仓库侧判定,须 Lead 确认后再决定作废或成票。

> **2026-10-06 结构更正**:本节此前装着 R1–R5 五条，每条一对一对应一张**活票** —— 而 wayfinder 的
> `Not yet specified` 明文排除「已经是活票的」。fog 被当成票索引用，实际 fog 数为 0。
> 五条已迁入上方 `## Open tickets`（与 repo-infra 的 map 结构对齐），R3/R4 的实测约束
> 本就在各自票体内，故不再在此重复。「本地 master 发散」经实测已消解 → Decisions so far ⑦。

## Out of scope

- 26 个 sunk feat/fix 已在 origin(历史债,gate 不溯及)。
- evidence-query typert-remote WIP(已废弃,W8 `989499712a` 早已用 EvidenceQueryGateway 做掉,分支已删)。
