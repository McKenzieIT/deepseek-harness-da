# Next-session prompt — 2026-09-12 post-UM-UI-SETTINGS-apply + upstream-merge 重盘

> 承接 `next-session-2026-09-12-post-pr116-merge.md`。本 session 收口：UM-UI-SETTINGS-MODELS-RE-PORT apply 经 workflow 落地（3 commit on resync，unpushed）+ 全量重盘发现并修 3 doc-regen 红 + tsconfig-paths pre-existing 确认。下文是**下一步怎么做**。

## 一、状态（勿重做）

- **origin/master** = `be447fc1d0`（PR #116，未变）。
- **resync** tip `4c34ceabb1`（3 commit unpushed：`db0be3c426` 26-file ctx->operations façade re-port + `74f5886d2e` README.i18n.yaml regen + `4c34ceabb1` module/architecture/slot-catalog regen + pnpm-lock）。ahead 18 / behind 3 vs origin/master。
- **master** tip `e3d7710aaa`（tracker：UM-UI-SETTINGS apply LANDED + map byte-splice + 重盘）+ 早先 `066a3b3106`/`d3592a221c`/`62c09c1d5d` 等 unpushed。ahead origin 若干 / behind 2773。merge-tree 干净。gated（eval 永续）。
- **worktree**：7（master + 2 eval 不碰 + dsh-resync[PR 主体] + dsh-rda-admin[UM-ADAPT 待决] + dsh-p2-present-table + dsh-p2-uism-vitest[2 p2-keep]）。
- **门**（全量 `check:ci:static` 287s 实测）：~11 pre-existing known-red。本 session UM-UI-SETTINGS apply 引入的 3 新红（module-graph/architecture-graph/client-catalog stale）已在 `4c34ceabb1` 修。**tsconfig-paths RED = pre-existing**（UM-INVARIANT aftermath，非本 apply）。绿：lint 0/0 · verify-package-invariants 0 · application-entrypoints · gen-doc-graphs · verify-md-links 1730 · verify-module-graph · verify-client-catalog · verify-architecture-graph · tsc -b client · vitest ui-settings 222/222。红：A 类 4（runtime-closure/constraints/export-jsdoc/translation-pairing）+ B 类 1（type-equivalence 3 DRIFT->UM-QODER）+ C 类 6（client-ui-i18n 98/package-dependencies 68[本 apply 去 2 peerDep 或 -2]/config-catalog/subsystem-pages 5/doc-standard 2-of-12/translation-pairing 29[本 apply regen 1 pair 或 -2]）+ tsconfig-paths[pre-existing]。
- **票**：33 = 11 open + 15 resolved + 6 archived + 1 folded。UM-UI-SETTINGS apply 落地但票 OPEN（剩 tsconfig-paths 非本票 + PR）。

## 二、剩余 4 项

1. **PR 推送**（gated，UM11/PR）：resync 3 commit unpushed。铁律：不擅自 push。PR body 须注 ui-settings 整包 M1 回退已 re-port（durable 要求）。push 前核 lefthook pre-push 三门（no-prod/typecheck/upstream-sync-record）。
2. **tsconfig-paths**（pre-existing 红，UM-INVARIANT aftermath）：去 stale `dsh-*/invariant` aliases（UM-INVARIANT retire 了 src/invariant.ts 但没清 tsconfig.base.json 的 /invariant 别名）。修法：hand-edit 删 stale aliases + 验 gen-tsconfig-paths 输出 JSONC 有效性（post-10941436b5 explicit-alias 下，用 tsc parser 验，非 strict JSON.parse）。归 UM-INVARIANT trailing cleanup 或 UM-TSCONFIG-PATHS follow-up，非 UM-UI-SETTINGS。
3. **master sync**（gated，1 session）：master ahead origin / behind 2773，merge-tree 干净 -> `git merge origin/master`（merge commit no FF）trivial。gated eval——等 eval 收定 + 核 `[ -f .git/index.lock ]`。
4. **10 张 open 票推进**（推荐序）：UM-ADAPT（dsh-rda-admin land/rewrite，**需用户拍板**，倾向 land）-> UM-QODER-SUBAGENT-RETIRE（scopeId 半前提证伪：3 writer+6 live reader，**拆票 re-grilling**）-> UM-MERGE-INTEGRITY（近 done，knip/fake-api cleanup）-> UM11（PR+merge+后清；⚠ 5 个 refactor/p2-* 不可按 ancestry 判删）-> UM12（伞票 11 门裁决 + cron follow-up）-> UM15（PR 推送+未来自动化 slice）-> UM-C-GATES-UPSTREAM-NEW（C 类 4 门裁决）-> UM6（subsystem-pages 5）-> UM4 Scope 3 -> UM-LINT-B。

## 三、session 估算

- **档一「已落地 + 基线成文」**剩 ~5-9 session：UM-ADAPT 1-2 + UM11 2-3（含 1 eval-gated）+ UM12 1-2 + UM-MERGE-INTEGRITY 0.5-1 + UM15 1-2 + config-catalog/architecture-graph zh 0.5 + tsconfig-paths 0.5-1。
- **档二「全门真绿 + 全票关」**~14-24 session：档一 + UM-QODER 1-2 + UM6 1 + UM-C-GATES 1.5-5 + UM4 Scope 3 1-2 + UM-LINT-B 1 + A 类 4 门（归 GA-FORK-CI-green/parallel-dev-cleanup，不在本期）。
- **唯一环境卡住 = master-sync + push**（共用 1 gated session），其余 resync AFK 可推。

## 四、铁律（勿忘 + 本 session 新增）

- `mcp__local__*` only（built-in BLOCKED）；workflow agent 须 ToolSearch 加载 mcp__local__ schema。
- workflow `args` 不经 scriptPath/resumeFromRunId 传播 -> **mode 硬编码 inline**。
- MCP runner 会掉线（`runner_gone`）-> 重发 workflow（清半成品 + fresh run；探活 `echo PROBE_ALIVE; node -v` 先）。
- `map.md` 含 U+FFFD（13）-> byte-splice（Buffer+indexOf+concat，断言计数不变），禁 edit_file/cat >>；ticket .md 追加用 `cat >>` + quoted heredoc；tsconfig.base.json 是 JSONC（有 `//` 注释）——strict `JSON.parse` 本就报错，验有效性须用 tsc parser。
- node v24：`export PATH="/usr/local/bin:$PATH"`；sh 非 bash（勿 `PIPESTATUS` 等 bashism，用 temp 文件 + `$?`）；commit message 用 `-F` 文件。
- master 上 `git add` 只显式路径；不碰 .worktrees/ + wayfinder/evaluation/；不 push（除指示）；commit 前核 `[ -f .git/index.lock ]`（eval）。
- **改源码核 gen 文档：跑全量 `check:ci:static` 或至少 architecture/module/cordis/config-catalog --check，不只 gen-doc-graphs**（本 session 教训：5 道针对门绿 ≠ 全量绿，漏了 3 doc-regen stale）。
- analyze 提案会 stale（跨批 adopt 决定后）+ 交叉核验「字节同 HEAD」自报可能误判 -> apply 后用 tsc/vitest/全量 sweep 复核，勿信自报。
