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

## Open tickets

- [T11: test:coverage 红](tickets/T11-test-coverage-failing.md) — deterministic expectation batch 已修并 focused 106 tests 通过；剩余 package-invariant README 迁移、runtime fixture、UI token 与 CI reliability 根因继续收口（**frontier**）
- [T12: windows native complete CI 红](tickets/T12-windows-native-complete.md) — investigate（疑 downstream of T7–T10 + T4/T5 + windows-specific）（**frontier — research**）

### T11 拆出的剩余根因（2026-09-16）

T11 已合并 12 个 focused PR（#142–#155）。剩下的四类根因彼此独立、且都需先定 root cause 才能下手，故拆为单独票据：

- [T18: Python 宽值内存压力用例在 CI 上不可移植](tickets/T18-python-wide-value-stress-portability.md) — 「插桩税是根因」已被 draft PR #156 自身 CI 推翻；需按比例缩小 fixture 并重测 tracemalloc（**frontier**）
- [T19: Windows session-projection-cache 读回失败](tickets/T19-windows-projection-cache-durability.md) — 首要嫌疑是 `storage-json` 的 `writeAtomic` 缺少与 `dsh-atomic-write` 对称的 Windows rename 重试（**research**）
- [T20: Windows codex 真实产品用例与 client-catalog 预算](tickets/T20-windows-codex-and-catalog-budget.md) — codex 项待验证 8.3 短名路径嫌疑；catalog 项是 case 字面量收窄了 lane 预算（**research**）
- [T21: snapshots lane 调度型断言](tickets/T21-snapshot-lane-scheduling-assertions.md) — 请求计数与并发 frame 计数断言；chat-scroll 的等待条件可能本身不可满足

- [T14: ci.yml / ci-master.yml startup_failure](tickets/T14-ci-workflow-startup-failure.md) — **fix 已落地（2026-09-15），等首个真实 PR 运行确认**。三处 workflow 语法破损（`ci.yml` 重复顶层 `concurrency` 键；`ci-master.yml` 两个 job 级 `if:` 顶格 + 两处 `timeout-minutes` 粘在折叠标量末尾）让两个 workflow 长期 **0 秒 startup_failure**，`jobs: []` ⇒ **fork 的 `check:ci:static` / `check:ci:coverage` / Windows 门在 CI 里一次都没跑过**（此前所有「CI 绿」只覆盖 Release / Node Addon / Matrix 这几条独立 workflow）。actionlint 已零 syntax 报错。**预期修复后立刻暴露一批既有红门——那是第一次看见真相，不是回归**。
- **CI 首次真实运行的门清单（2026-09-15，run 34918859164）**：17 job = 12 success / 5 failure；`node 24 / static` **51 门全绿**。红的全部核为 pre-existing 并已映射到票——coverage 两 suite → [T11](tickets/T11-test-coverage-failing.md)、`publint` → [T10](tickets/T10-publint.md)、`doc-typecheck:contracts-ready` → [T15](tickets/T15-doc-typecheck-plan-sketches.md)；**尚无票的两条**（`duplication` 89 clones、`verify-upstream-sync-record` 浅 checkout 下 waiver 0 命中判定）连同证据与修法方向记在 [T14](tickets/T14-ci-workflow-startup-failure.md) 的「首次真实 CI 运行的完整清单」一节。
- [T16: duplication 门 89 clones](tickets/T16-duplication-gate-89-clones.md) — resolved 2026-09-15：排除所有 `*.spec.ts` / `*.spec.tsx`，生产 TypeScript、类型声明和 TSX 组件继续纳入；以排除 spec 后实测 0.337455% 为基线，将 jscpd 原生 threshold 设为 0.338%，保留完整报告与非零阻断，并用最小 clone 负向控制证明门禁仍会变红。

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
