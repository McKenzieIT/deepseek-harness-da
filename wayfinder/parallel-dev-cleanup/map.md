# wayfinder:map — parallel-dev cleanup

> 本地 markdown tracker(wayfinder skill 默认)。子 ticket 在 `tickets/`。本 map 是**索引**,非存储——决策详情在其 ticket。

## Destination

清理"并行开发遗留项":gate 覆盖、CI 硬拦、结构偏离翻译对、旧分支、missing .zh.md。每项一个分支 + PR,gate 护着 master。

## Notes

- **域**:repo 治理 / i18n / 分支卫生(非 data-agent 功能改造)。
- **纪律**:CLAUDE.md 并行 session 分支纪律 + 提交/引证纪律(每 session 启动必读);docs/da-pr-workflow.md 分支契约;wayfinder/_templates/session-prompt.md。
- **gate**:`verify-no-production-src-on-master`(lefthook pre-push + CI workflow)拦直推 master 的生产 src(packages/apps/native/python `.../src/` + `scripts/`)。
- **i18n**:docs/i18n/README.md pairing 契约(EN + .zh.md + .i18n.yaml blob-hash);extended workflow `pnpm run gen-translation-brief <pair>` 用于大 generated 更新。

## Decisions so far

- **① gate 覆盖扩展 (resolved 2026-09-05, PR #5 merged)**:`PROD_SRC_PATTERN` → `^(?:(?:packages|apps|native|python)\/(?:[^/]+\/)+src\/|scripts\/)/`。src-style(与现有 packages scope 一致);scripts/ 整目录(无 src/ 子目录,文件即源)。spec +14 用例(27 tests)。集成自测 `GATE_BRANCH=master GATE_RANGE=c66e3beffc~1..c66e3beffc` → exit 1(gate 拦住创建它自己的 commit)。**已知缺口**(src-style by design):apps/native/python 非源文件(README/config/tests/hatch_build.py)不拦;顶层 examples/ 不在 scope(packages/examples/*/src/ 已被现有 pattern 覆盖)。
- **② CI gate (resolved 2026-09-05, PR #6 merged)**:`.github/workflows/no-production-src-on-master.yml`,`push:branches:[master]` 触发;head commit 是 "Merge pull request #N"(PR 合并)则跳,否则 `GATE_RANGE=before..after` 跑 gate。**reactive**(push 已发生,报警非预防);真预防=branch protection(admin,② PR 写明)。`--merge` 假设(若改 squash/rebase 需返工)。
- **③ 3 结构偏离翻译对 (resolved 2026-09-05, PR #8 merged)**:tickets/README(union:G-DA6 补进 EN,因 EN 缺这个真实 ticket)、eval/README(加 Batch Runner + Host wiring 节,删过时"无 CLI/persistence"bullet——P11c 已 ship 假声明)、tool-catalog(gen-translation-brief,23 新工具译中文,代码块 verbatim)。每对 pre-write 自查结构 + --write + scoped green;corpus 3 对缺席(绿)。
- **④ 旧分支清理 (resolved 2026-09-05, 无 PR,本地+报告)**:删 2 merged(phase2-ontology `2cdf784769`、rc8-merge-trial `489c95bf59`——0 unmerged,实测 ancestor of origin/master)。留 2 unmerged(有 unique commit,不弃):fix/da-compliance-audit(11 superseded + 1 unique `6d62764bda revert web-app dashscope insert forbidden by rule 4.3`)、fix/legacy-empty-callid(1 unique `ac0251360a tolerate legacy empty callId`)。cl23 没碰。
- **⑤ 55 missing .zh.md triage (resolved 2026-09-05, PR #10 merged)**:55 分类(22 .agents/notes 内部 + 33 用户可见[10 docs + 21 packages/README + 2 wayfinder])。译 2(adr-0001 EN→ZH 译、da-product-brief 中文撰写 copy),53 defer(triage + 优先级 + 建议)。scoped green。

## Not yet specified

- **⑤ 的 53 defer**——scheduled follow-up。下 3-5 key:da-upstream-debt(132L)、da-architecture(146L)、da-pr-workflow(153L)。〔tickets/R1-translation-defer-53.md〕
- **④ 的 2 unmerged 分支**——user/Lead 决策(开 PR 或留;两个都有 1 unique commit)。〔tickets/R2-unmerged-branches.md〕
- **branch protection**(origin/master:restrict pushes + require CI green)——GitHub admin 开。〔tickets/R3-branch-protection.md〕
- **重启在跑 session**(含 dsh-cl23)让新 CLAUDE.md 生效——ops(session 做不了)。
- **本地 master 发散**(并发 session 的 commit,含生产-src `c26eada21b fix(client): ui-context-layer`,推不上 gate 拦;origin/master 安全)——Lead 收敛。

## Out of scope

- 26 个 sunk feat/fix 已在 origin(历史债,gate 不溯及)。
- evidence-query typert-remote WIP(已废弃,W8 `989499712a` 早已用 EvidenceQueryGateway 做掉,分支已删)。
