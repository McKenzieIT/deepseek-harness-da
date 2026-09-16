# wayfinder:map — REPO BUILD & THEME INFRA

> 本地 markdown tracker。子 ticket 在 `tickets/`。本 map 是**索引**，非存储——决策详情在其 ticket。

## Destination

补齐 DSH repo 的 build/theme 基础设施缺口，让 fresh worktree 与 CI 行为一致、让被消费的 theme token 有定义：worktree-setup 自动 build workspace package（fresh worktree 不再因缺 `lib/` 假性「master break」）；`--dsw-alias-*` 被 consume 的 token 在 `design-platform.css` 有定义。

## Notes

- **域**：DSH repo-wide build/theme infra（pnpm workspace、worktree-setup、lefthook、ui-theme token）。
- **每会话应查 skills**：`grilling`、`domain-modeling`。
- **常设原则**：
  - 不改 production 行为（仅补 build 产物生成路径 + token 定义）。
  - 遵循 `packages/client/AGENTS.md` 全部纪律（如触 src）。
  - 与并发 session 协调（CB-4 zod 回归是独立 ticket，不并入——见 Out of scope）。

## Decisions so far

- [T1: worktree-setup 不 build workspace package](tickets/T1-worktree-builds.md) — fixed in PR #16（CLAUDE.md + session-prompt template worktree-setup 加 `pnpm install && pnpm -r run build`，method (a)）；verified `pnpm -r run build` 生成 8 个 data package 的 `lib/typert.remote-client.*`（pnpm install 不生成的）；note `pnpm -r run build` exit 1 on website（见 [T3](tickets/T3-website-build-failure.md)，separate，data/tsc 不受影响）——T3 已 fixed in PR #22（website build 绿，该 caveat 解除）；**T13 update（2026-09-07）**：`pnpm -r run build` 非 sanctioned entrypoint（fails on eval-runner-service per [T13](tickets/T13-eval-runner-service-build-failure.md)）；worktree-setup 改 `pnpm run build:official`（sanctioned 全量 build）。
- [T3: website (vitepress) build 失败](tickets/T3-website-build-failure.md) — fixed in PR #22：tool descriptions 里的 unescaped `<`（`<project>`/`<mode>`/`<value>`/`<response clipped>`）致 vitepress parse "Element is missing end tag"（tool-catalog.md:350）；fix = `gen-tool-catalog` 加 `escapeHtml`（renderTool description + tableCell note + per-tool note emit）+ ZH source sed-escape 同批 placeholders + i18n pairing re-record；verified `pnpm --filter @deepseek-ai/website run build` 绿（20.93s）；pre-commit translation-pairing hook bypassed（pre-existing code-block #82 en/zh drift，非本 fix 引入——diff 0 code-block changes；[T4](tickets/T4-zh-translation-lag.md) 后续 fix）
- [T6: CI checkout / Issue-policy 失败](tickets/T6-ci-checkout-issue-policy.md) — closed 2026-09-07（T2 frontier-verification 顺带确认，非本 effort session 驱动）: (a) checkout git exit 1 resolved（`actions/checkout@v6` 全 CI job 绿，run `34082364433`；原 `git submodule foreach` 假设已无）；(b) issue-policy/issue-lifecycle resolved via PR #52 `bf4e0dd577` skip-on-fork（fork 无 DSH issue GitHub App → neutral-skipped，**非**改 GH settings）。
- [T2: ui-theme 被 consume 的 --dsw-alias-* token 未定义](tickets/T2-theme-token-gap.md) — fixed 2026-09-07 via PR #66（merge `4dfcab9ed4`）：fork 自造非 canonical 名 align 到上游 canonical（`content-*`→`label-*`、`surface-*`→`bg-*`、`border-primary`→`border-l*`、`state-warning`→`state-warn`、`content-link`→`link`），Cat-1 上游既有债本地 define（`border-subtle`/`text-*`/`fill-*`/`separator-primary`），apply 上游 `8ffdee4fe5` 的 `--dsw-alias-link` hunk，`state-info-*` net-new。T2 引入 0 CI 回归（350 tests pass，typecheck 绿）；PR #66 红 = master pre-existing GA-FORK-CI backlog（非 T2）。详见 [research/T2-upstream-design-system-divergence.md](research/T2-upstream-design-system-divergence.md)。
- [T4: docs/tool-catalog.zh.md 翻译滞后](tickets/T4-zh-translation-lag.md) — fixed 2026-09-07 via PR #73（merge `2c8d796a5`）：synced 2 divergent JSON schema blocks（#82 present_table chart + #83 propose_relation）verbatim EN→ZH（language-neutral，mechanical sync 非翻译）；re-recorded pairing；gate 对 tool-catalog 零 divergence（78 其他文件 = [T5](tickets/T5-readme-bilingual-gaps.md) HITL 债，非 T4）。via subagent。
- [T5: README 双语缺口](tickets/T5-readme-bilingual-gaps.md) — resolved 2026-09-07 via sessions 2-6（PR #100/#102/#104/#106/#108）：全部 ~56 in-scope 文件已配对双语，corpus green（1069 pairs，0 missing，0 OOS，exit 0），gate 绿。
- [T13: pnpm -r run build 在 eval-runner-service 失败](tickets/T13-eval-runner-service-build-failure.md) — fixed 2026-09-07 via PR #80（merge `2802f3679`）：根因 = eval-runner-service 的 stray `build=tsdown`（无 per-package config → root config 向上解析 → fail），非 typert/generator（no-build-script **intentional** bootstrap-self-contained，`tsc -b` 经 project references 建 `lib/types/`）。fix = 2a（drop stray build script；eval-runner-service 经 `build:lib:host` 构建）+ doc（T1 worktree-setup `pnpm -r run build`→`pnpm run build:official`，sanctioned 全量 build）。CI 不 gate `pnpm -r run build`；fresh-worktree 体验修复。via subagent + research-gated。**注**：ticket 原 T7，rename T13 避免与并发 GA-FORK-CI 系列的 [T7-verify-export-jsdoc](tickets/T7-verify-export-jsdoc.md) 编号冲突。
- [T7: verify-export-jsdoc 历史红门](tickets/T7-verify-export-jsdoc.md) — current `origin/master` 的 `check:ci:static` 已验证 `export jsdoc` 通过，历史失败已由后续提交消除。
- [T8: package-README 内容门历史红门](tickets/T8-readme-gates.md) — model-experience 与 limitations 检查均已在 current `origin/master` 通过。
- [T9: built-package-invariants 历史红门](tickets/T9-built-package-invariants.md) — 完整 build 后 39 个 compiled companion 通过 plain-Node Loader 检查。
- [T15: doc-typecheck 语料与示例漂移](tickets/T15-doc-typecheck-plan-sketches.md) — 两个真实 fence 已修复，并将两个自足示例纳入编译以维持 opt-out 比率；`doc-typecheck` 为 86 compiled / 85 ignored，exit 0。
- [T10: publint 发布视图](tickets/T10-publint.md) — 源码平面 glob 保持提示级；`result-cache` 发布编译后的 types，两个动态加载 semantic-layer 的工具生成自足入口，完整 build 后 publint exit 0。
- [T17: NodeNext declarations 引用源码子路径](tickets/T17-node-next-types-source-subpaths.md) — 24 个公开 declaration import 改走 package root，并新增 built-declaration 守卫；343 个 workspace package declaration API 在 NodeNext consumer 下通过。
- [T19: Windows session-projection-cache 读回失败](tickets/T19-windows-projection-cache-durability.md) — resolved 2026-09-16 via PR #160（merge `051519b169`）：root cause 判定为**写失败**而非可见性延迟，判据是单测耗时的双峰分布（四项失败 5332 / 5148 / 5162 / 5061 ms，而同文件内相同 helper 的兄弟用例 141 / 147 ms——迟到的写入会落在中间，只有「抛出后不再重试」才产生全有全无的分布；job 104534944084 与 104635347170）。缺陷是 `storage-json` 的 `writeAtomic` 用裸 `rename`，缺少 `dsh-atomic-write` 那套对 `EACCES`/`EBUSY`/`EPERM` 的有界重试；fix = 公开导出 `renameAtomicTemp` 并在 `writeAtomic` 中改用它，另补 fail-soft 写路径此前完全缺失的 `ctx.logger.warn` 可观测性。顺带推翻一条归档结论：`.agents/notes/archived/process/2026-08-31-windows-coverage-flaky-test-budgets.md` 曾把同一批用例诊断为「未在 40ms 内排空」并放宽到 5 秒宣布修好，它们在 **125 倍**预算下依然失败。**尚欠第二次确认运行**。
- [T20 part 2: client-catalog 用例预算](tickets/T20-windows-codex-and-catalog-budget.md) — resolved 2026-09-16 via PR #162（merge `413b0681d5`）：`gen-client-catalog.spec.ts` 的 30 秒 case 字面量**主动收窄**了 lane 已授予的 `DSH_COVERAGE_TEST_TIMEOUT_MS: '90000'`（case 字面量覆盖而非让位于 `--testTimeout`，规则见 `scripts/run-gates.ts:613-615`「Explicit fixture timeouts remain authoritative」）。同时纠正本票两处原判：**不是 Windows-only**（Linux job 104542100296 报同一项，PR #155 的 Linux job 104534944130 是以 29536ms 擦线通过），且 **30 秒从来不是深思过的上限**（唯一引入提交 `a7d4cd8e1b "fix: ci"` 只是把它从 Vitest 默认 5 秒上调，当日 lane 仅授予 15 秒，此后从未复核）。实测成本 Linux 13.1–19.2s、Windows 24.3–37.4s，30 秒正好横穿该区间。fix = 按既有 idiom 把预算提到 `describe` 层并等于 lane 值。**part 1（codex 真实产品用例，8.3 短名路径嫌疑）仍未解决，票据保持 open**——见下方 Open tickets。同类收窄在别处复发，已另立 [T26](tickets/T26-workspace-scan-case-budgets.md)。

## Open tickets

- [T11: test:coverage 红](tickets/T11-test-coverage-failing.md) — deterministic expectation batch 已修并 focused 106 tests 通过；剩余 package-invariant README 迁移、runtime fixture、UI token 与 CI reliability 根因继续收口（**frontier**）
- [T12: windows native complete CI 红](tickets/T12-windows-native-complete.md) — investigate（疑 downstream of T7–T10 + T4/T5 + windows-specific）（**frontier — research**）

### T11 拆出的剩余根因（2026-09-16）

T11 已合并 12 个 focused PR（#142–#155）。剩下的四类根因彼此独立、且都需先定 root cause 才能下手，故拆为单独票据。其中 **T19 与 T20 part 2 已于 2026-09-16 resolved**（证据见 Decisions so far），余下：

- [T18: Python 宽值内存压力用例在 CI 上不可移植](tickets/T18-python-wide-value-stress-portability.md) — 「插桩税是根因」已被 draft PR #156 自身 CI 推翻；需按比例缩小 fixture 并重测 tracemalloc（**frontier**）
- [T20 part 1: Windows codex 真实产品用例](tickets/T20-windows-codex-and-catalog-budget.md) — **part 2（client-catalog 预算）已 resolved，part 1 仍 open**：codex 项待验证 8.3 短名路径嫌疑，且该项在 Windows 上表现为 flaky（**research**）
- [T21: snapshots lane 调度型断言](tickets/T21-snapshot-lane-scheduling-assertions.md) — 请求计数与并发 frame 计数断言；chat-scroll 的等待条件可能本身不可满足
- [T22: Linux pwsh terminal-bash motd 为空](tickets/T22-linux-pwsh-terminal-readiness.md) — **root cause 已确认、remedy 已被推翻**（2026-09-16）：确认是 readiness 竞态而非启动饿死（710ms 即失败，对 `timeoutMs: 8_000`，且无 readiness 诊断，job 104635347140），回归源 `4f3a47d792` 把跳出条件换成裸 `waitReason === 'stdin_read'`，而 `pollReadiness` 的两个 `stdin_read` 生产者只有一个带提示符证据、另一个是 Linux `/proc` 探针（故 Linux-only）。`holdCommand` 已证明不是成因（它在失败断言之后才被读到）。**PR #161（draft，head `cde9ef98c6`）的 remedy 被其自身 CI 推翻**：要求 `promptSeen && promptTextSeen` 后三个 pwsh 用例各烧满 8 秒 deadline 并牵连一个 120 秒组合用例（job 104659858116），即该证据在此 runner 上不可达。下一步的首要机制是 `startSend` 对每次发送无条件清空 readiness 证据（**research**）

- [T14: ci.yml / ci-master.yml startup_failure](tickets/T14-ci-workflow-startup-failure.md) — **fix 已落地（2026-09-15），等首个真实 PR 运行确认**。三处 workflow 语法破损（`ci.yml` 重复顶层 `concurrency` 键；`ci-master.yml` 两个 job 级 `if:` 顶格 + 两处 `timeout-minutes` 粘在折叠标量末尾）让两个 workflow 长期 **0 秒 startup_failure**，`jobs: []` ⇒ **fork 的 `check:ci:static` / `check:ci:coverage` / Windows 门在 CI 里一次都没跑过**（此前所有「CI 绿」只覆盖 Release / Node Addon / Matrix 这几条独立 workflow）。actionlint 已零 syntax 报错。**预期修复后立刻暴露一批既有红门——那是第一次看见真相，不是回归**。
- **CI 首次真实运行的门清单（2026-09-15，run 34918859164）**：17 job = 12 success / 5 failure；`node 24 / static` **51 门全绿**。红的全部核为 pre-existing 并已映射到票——coverage 两 suite → [T11](tickets/T11-test-coverage-failing.md)、`publint` → [T10](tickets/T10-publint.md)、`doc-typecheck:contracts-ready` → [T15](tickets/T15-doc-typecheck-plan-sketches.md)；**尚无票的两条**（`duplication` 89 clones、`verify-upstream-sync-record` 浅 checkout 下 waiver 0 命中判定）连同证据与修法方向记在 [T14](tickets/T14-ci-workflow-startup-failure.md) 的「首次真实 CI 运行的完整清单」一节。
- [T16: duplication 门 89 clones](tickets/T16-duplication-gate-89-clones.md) — resolved 2026-09-15：排除所有 `*.spec.ts` / `*.spec.tsx`，生产 TypeScript、类型声明和 TSX 组件继续纳入；以排除 spec 后实测 0.337455% 为基线，将 jscpd 原生 threshold 设为 0.338%，保留完整报告与非零阻断，并用最小 clone 负向控制证明门禁仍会变红。

- [T23: run-gates 进程树枚举溢出](tickets/T23-gate-descendant-walk-overflow.md) — resolved 2026-09-16，**fix 已合并为 `d1f0fcad14`（PR #163）**，等真实 CI 确认：`collectDescendants` 把进程表快照当成树，队列别名了父索引里的子数组、且用 `push(...spread)` 追加；pid 复用造成的环让队列指数增长，实参溢出被 V8 报成 `RangeError: Maximum call stack size exceeded`。**该缺陷把测试全绿的 `windows node 24 / coverage` 报成红**（job 104648904870 日志零 `FAIL`，死在 gate 清理回调）。改为拷贝起步 + `queued` 集合定界 + 逐个 append，并导出以补上此前完全缺失的用例覆盖。

### 本次会话新开的票（2026-09-16）

- [T24: headless DeepSeek defaults 烧完 60 秒 smoke 预算](tickets/T24-headless-deepseek-idle-budget.md) — `node 24 / snapshots and artifacts` 的**第一项**失败，此前从未建票；fail-fast 下它遮蔽了后面 85+ 条 recorded-session replay。子进程始终不退出（60138ms / 60171ms，job 104648904893 与 104659731495），流内反复报 `DeepSeek stream idle timeout after 150ms` 并重试 5 次。需先判定 `streamIdleTimeoutMs: 150` 是刻意预算还是意外收窄——注意「让 comment 计为存活」这条产品修法**已经实现**，所以真正要解释的是它为何仍然 idle out（**research**）
- [T25: `withFileLock` 把 delete-pending 的 EPERM 当成权限拒绝](tickets/T25-atomic-write-lock-eperm.md) — `windows node 24 / coverage` job 104633154572 上 `credentials-local` 并发写用例报锁文件 `EPERM`；`isLockContention` 对 `EPERM` 要求 `lstat` 成功才判为争用，而 Windows 的 delete-pending 状态同时让 `open` 得 `EPERM` 且让 `lstat` 失败。**与 T19 不共调用路径**（T19 是 `storage-json` 的 rename，本票是 `util/atomic-write` 的锁获取），故 #160 的绿不构成本票证据。**目前只有一次观测**（**research**）
- [T26: 扫真实 workspace 的用例仍带低于 lane 预算的字面量](tickets/T26-workspace-scan-case-budgets.md) — T20 part 2 的模式在别处复发：`packages/typert/generator/tests/tools-catalog.spec.ts:20` 以 `{ timeout: 30_000 }` 对真实仓库根建 `WorkspaceAnalyzer`，在 job 104663283115 报 `Test timed out in 30000ms`。票内附本次实读的完整审计（含 `proxy-types.client.spec.ts:78` 一项待实测定夺，以及若干确认**不在**范围内的项）（**task**）

### 当前真实红门清单（2026-09-16，供下一会话直接接手）

记在这里是为了不必再从 CI 日志重新推导。**先看 T24：它决定了 snapshots lane 的清单可信度。**

- **`node 24 / coverage`**：[T18](tickets/T18-python-wide-value-stress-portability.md)（`code-runtime-python` 两个宽值用例；另见 `packages/code-runtime/code-runtime-data-python` 的 bindings 用例在 90 秒 lane 预算上超时）、[T22](tickets/T22-linux-pwsh-terminal-readiness.md)（pwsh，两个 `holdCommand` 分支都可能报红，取决于调度运气）
- **`windows node 24 / coverage`**：[T20 part 1](tickets/T20-windows-codex-and-catalog-budget.md)（codex，flaky）、[T25](tickets/T25-atomic-write-lock-eperm.md)（credentials-local 锁 EPERM）、[T26](tickets/T26-workspace-scan-case-budgets.md)（typert generator 扫描）、以及 T18 同族的 data-python 用例
- **`node 24 / snapshots and artifacts`**：[T24](tickets/T24-headless-deepseek-idle-budget.md) **排在最前且遮蔽其余**；其后是 [T21](tickets/T21-snapshot-lane-scheduling-assertions.md) 的第 2、3 项（chat-scroll 并发锚点、present-svg 连接告警）；`replays persistent-pwsh-tool-turn` 在**干净树上的状态未知**——它只在 PR #161 那次越过 T24 的运行里被观测过一次，而该分支带着已被推翻的改动
- **两项欠第二次确认运行**：T19 的四条断言与 T20 part 2 的那一项在 fix 后的运行里均**未再出现**，但**各只有一次确认运行**，第二次仍然欠着。按本域既定验收标准（连续两次真实运行），这两项尚不能算封板。

> T7–T12 均 pre-existing GA-FORK-CI gates on master（concurrent session 驱动，PR #67/#68/#69/#79 等逐步 fix；fix 前先 verify 仍红 on current master）。T2/T4/T5/T6/T13 已 closed（见 Decisions so far）。T14/T15 由 data-agent 的 upstream-merge 收口审计（UM17）发现后按域移交本 effort——**它们不是 data-agent 的票**。

## Not yet specified

（暂无）

## Upstream merge 2026-09-07

upstream CI 结构已变（`61f910d ci: split master-only jobs into ci-master.yml` + 新 `build-preview-cloudflare.yml`/`release-publish.yml`/`release-vendor-publish.yml`）。

**违反当前 upstream 的本域票据（re-violated，re-land 追踪）**：
- [T6-ci-checkout-issue-policy](tickets/T6-ci-checkout-issue-policy.md) — fork #52 的 `if: github.repository_owner` skip 落 issue-policy/lifecycle；merge 带回 upstream 版（无 skip）→ (b) 再破。重落 #52 → [UM2](../data-agent/tickets/phase-upstream-merge/UM2-ci-conflicts-reland-48-52.md)

Status 维持 closed（PR #52 历史），re-land 后以 UM2 为准。

## Out of scope

- `compute` 工具的客户端渲染（blocked on 安全计算环境 research，属 interpretation-client-rendering map 的 out-of-scope）
- CB-4 zod 回归（api-remotes client bundle 启动失败——并发 session 在 `semantic-layer` map 的 CB-4 票里追；根因是 dep 声明缺失/zod module-table，独立于本 map 的 build-产物 + token-定义关注点）
