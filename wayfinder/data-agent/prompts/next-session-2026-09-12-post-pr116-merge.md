# Next-session prompt — 2026-09-12 post-PR-#116-merge + worktree 清理 + 剩余决策

> 承接 `next-session-2026-09-11-workflow-ticket-sweep.md`。本 session 收口：PR #116 merged（origin/master `be447fc1d0`）、UM-INVARIANT resolved（74→0）、UM-LINT-A 根因修、worktree 清理 10 删 + 剩余 2 分析。下文是**下一步怎么做**。

## 一、状态（勿重做）

- **origin/master** = `be447fc1d0`（PR #116 merge；4 提交着陆：线D entrypoints[app-entrypoints 10→0] + gen-doc-graphs zh[UM-GEN-DOC-TRANSLATION-OBLIGATION impl] + UM-LINT-A[tsconfig.base.client.json disableSourceOfProjectReferenceRedirect, lint 0/0 零 disable] + UM-INVARIANT[companion retire 74→0]）。UM12「CI 真实 red set」解锁。del-3 内容安全 in origin/master。
- **resync** tip `7ad3242d97`（已 push，PR #116 已 merge；远端 resync 分支可删，本地 resync worktree 保留）。
- **master** tip `5b8fc6da5a`（2 tracker commit 未推：`a79ede0862` UM-INVARIANT resolution + `5b8fc6da5a` map/tickets 更新）。ahead 69 / behind 2773[origin/master `be447fc1d0`]，merge-tree 干净，gated（eval 永续）。
- **worktree**：剩 8（master + 2 eval 不碰 + resync + dsh-arch + dsh-rda-admin + 2 p2-keep）。
- **门**：`verify-package-invariants` 0[UM-INVARIANT] · `lint` 0/0[UM-LINT-A] · `application-entrypoints` 绿[线D] · `gen-doc-graphs` 绿[zh] · `config-catalog` 红[pre-existing] · `package-dependencies` 68[C 类 known-red，UM-INVARIANT 改善 75→68] · `type-equivalence` 3 DRIFT[known-red→UM-QODER]。
- **票**：33 = 11 open + 16 resolved + 6 archived + 1 folded。

## 二、剩余 worktree 决策（2 项，需用户拍板）

1. **`dsh-arch` 定向 rescue**（~3 行）→ 删分支：
   - 代码已 absorbed（via arch-regen `038d8b51ce` in origin/master）。
   - 3 处 doc/manifest 残留须 cherry-pick：`research/um-arch-design-2026-09-08.md` 的纠正注（4 bundles 非 7、9 remotes 非 3、lefthook 假前提——master line 63/65 仍带未纠正）+ `scripts/translation-pairing.manifest.json` 加 `docs/architecture-graph.md` excluded + 可选 UM-ARCH ticket 附 Cross-check。
   - 做 ~3 行 rescue（在 master 或 resync）→ `git branch -D chore/um-arch-impl-2026-09-08` + worktree remove。
2. **`dsh-rda-admin` → UM-ADAPT**：land 这条分支（`9ba8638eac`，完整 seam 3 lazy webServer）使 UM-ADAPT seam 3 真"已落地"，或改写 UM-ADAPT 为"已分析未合入"。HEAD 仍 eager-inject webServer（`packages/data/admin/src/index.ts:141`）。倾向 land。

## 三、UM-UI-SETTINGS-MODELS-RE-PORT（已解锁，re-port plan 见 workflow 输出）

- UM-INVARIANT（step 1）已落（PR #116）→ UM-UI-SETTINGS 从 step 2 起。
- workflow `um-ui-settings-models-report.wf.js`（analyze-only）已跑：Classify → Propose → Challenge。结果在 `/tmp/um-uism-classification.md` + `/tmp/um-uism/<file>` 提案 + workflow return（applyOrder + clean/blocked merges）。
- **分类（43 文件）**：12 already-equal / 5 adopt-upstream / **21 three-way-merge** / 2 restore[operations.ts+slot-contract.ts] / 0 delete[UM-INVARIANT done] / 3 owned-elsewhere；3 陷阱（UM-LINT-A `ctx as never` cast / apply.client.spec 双主 / ProviderEditor ours）；详见 [UM-UI-SETTINGS 票 2026-09-12](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md)。
- apply 拓扑序：2 store.ts(`ProviderDirectoryEntry`) → 3 operations.ts+slot-contract.ts(restore) → 4 README{,.zh}.md(同 commit) → 5 index.ts → 6 façade consumers(`ModelsSection`/`CustomProviderCard`/`DeepSeekOnboardingDialog`/`ModelListEditor`/`ProviderEditor`) → 7 specs(inject 5→8) → 8 机械桶 → 9 README.i18n.yaml(scoped --write)。
- apply 后：tsc -b client + lint:contracts-ready 0/0 + gen-doc-graphs --check + 恢复 README Extension-slots 段 + docs/subsystems/slots{,.zh}.md:126-127 决策。
- ~2-3 session。

## 四、master sync（gated，1 session）

master ahead 69 / behind 2773，`git merge-tree` 干净 → `git merge origin/master`（merge commit，no FF）trivial clean。master 是 eval 永续独占树——等 eval 收定 + 核 `[ -f .git/index.lock ]`。同 session 可顺带确认 PR #116 的 CI red set（UM12 最后大 open 项）。

## 五、剩余 open 票（11）+ 推荐顺序

UM-UI-SETTINGS（已解锁，~2-3 session）→ UM-QODER-SUBAGENT-RETIRE（scopeId 半拆票 re-grilling）→ UM-ADAPT（rda-admin land/rewrite）→ UM11（定向 rescue dsh-arch + 收尾）→ UM12（伞票裁决）→ UM4 Scope 3 → UM6 → UM-MERGE-INTEGRITY（近 done）→ UM15（仅剩 PR 推送+自动化 slice）→ UM-C-GATES-UPSTREAM-NEW（C 类 4 门裁决）→ UM-LINT-B。档一≈6-11 session，档二≈17-29 session。**唯一环境卡住=master-sync（gated），其余 resync AFK 可推**。

## 六、铁律（勿忘）

- `mcp__local__*` only（built-in BLOCKED）；workflow agent 须 ToolSearch 加载 mcp__local__ schema。
- workflow `args` 不经 scriptPath/resumeFromRunId 传播→**mode 硬编码 inline**（3 次 apply 尝试证伪）。
- MCP runner 会掉线（`runner_gone`，持续）→ session-only retry cron 容忍。
- `map.md` 含 U+FFFD（13）→ byte-splice（Buffer+indexOf+concat，断言计数不变），禁 edit_file/cat >>；ticket .md 追加用 `cat >>` + quoted heredoc。
- node v24：`export PATH="/usr/local/bin:$PATH"`；sh 非 bash；commit message 用 `-F` 文件。
- master 上 `git add` 只显式路径（wayfinder/evaluation/ 不是你的）；不碰 .worktrees/ + wayfinder/evaluation/；不 push（除指示）。
- 改源码核 gen 文档（architecture/module/cordis/doc-graphs/config-catalog --check + verify-md-links）。
