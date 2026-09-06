# CI 红状态审计（2026-09-06，PR #37 vs 已合并 PR #36）

> 方法：5 路并行只读 subagent，各查一个 job 家族；**每条数字与 `file:line` 由主 session 从
> 原始 CI 日志或源码机械重导一遍**（CLAUDE.md「提交与引证纪律」第 2 条：subagent 输出的
> 认识论地位 = 凭记忆的断言）。下文标注了哪些是核过的、哪些是 subagent 断言但我未逐项复核的。
> 原始日志留在 `.tmp/ci-audit/*.rawlog`（gitignore，会随清理消失）。

## 一句话结论

**PR 上有 6 个 check 恒红，全部是 master 既有欠债，与 PR diff 无关；且 master 根本没有分支保护，
所以 CI 红从来没有拦住任何东西 —— 它目前是纯装饰。**

## 0. 结构性事实：master 无分支保护（已核）

```
$ gh api repos/McKenzieIT/deepseek-harness-da/branches/master/protection
{"message":"Branch not protected", "status":"404"}
```

**这是 404「分支未受保护」，不是 403「无权限」。** 后果：

- 无 required status check → 6 个红 check 不阻塞任何 merge（PR #30、#36、#37 全部带红合并）。
- 也解释了为什么 CLAUDE.md 的「纯 wayfinder 文档可直推 master」在实践中一直可行。
- **直接影响 [R3](../tickets/R3-branch-protection.md)**：见该票新增的两条约束。

## 1. 六个红 check 的性质（PR #37 ↔ 已合并 PR #36 对比）

「逐项相同」= 我用 `cmp`/`comm` 比过两份日志的失败集合，不是看数量相等。

| check | 规模 | 与 PR #36 对比 | 判定 |
|---|---|---|---|
| `node 24 / static` | **17** 个 gate 失败 | 失败 gate 集合 `cmp` **逐字节相同**；jsdoc 门自报 **402** 条两边一致；runtime-closure **25** 行一致；config-catalog **6** 条一致 | 既有，确定性 |
| `node 24 / coverage` | **512** 条阈值 ERROR / **161** 个文件 | 两边 512/161；失败文件集合 `comm` **双向差集皆空** | 既有，确定性 |
| `node 24 / snapshots and artifacts` | **30** 个包缺 `./invariant` 导出 | 两边 30 个包集合相同；gate 汇总同为 `2 passed, 2 failed, 6 skipped` | 既有，确定性 |
| `python runtime / node24-linux-x64` | **25** 个 preset 插件未进 `python/sdk-runtime` deps | 两边 25 行，同一 verbatim 报错 | 既有，确定性 |
| `windows node 24 / native complete` | 14 个测试文件失败（PR#36 是 13） | **⚠️ 不相同**，见下方 §3 | 既有，**非**确定性 |
| `Issue lifecycle` / `Issue policy` | 2 个 job | 上游专用，见 §4 | 既有，确定性 |
| `all checks passed` | 派生 | 两边同为 `Needed job results: failure, failure, failure, success, success, failure, success` | 纯聚合器 |

`all checks passed` 是 `.github/workflows/ci.yml` 的 `all-checks-passed` job，`needs` 7 个 job，
任一非 success 即 exit 1。**它的红是派生的**，修任何单个 job 都不会让它变绿。

## 2. 本 PR 未新增任何失败（已核，这是最关键的一条）

- **coverage**：`ERROR: Coverage ... for <path>` 的 path 集合，PR#37 与 PR#36 **双向差集皆空**（各 161）。
  两个被本 PR 触及的 src 文件（`nl2sql-engine/src/engine.ts`、`eval-cli/src/context.ts`）
  **本来就各有 4 条**，两边一致 —— 即「同一集合、也没变差」。
- **新增的 `packages/eval/eval-cli/bin/probe-triage.ts` 完全不在 coverage 范围**：
  `vitest.config.ts:177` 的 `include` 是 `packages/*/*/src/**/*.{ts,tsx}`，`bin/` 不在其内；
  该路径在 coverage 日志里出现 **0** 次。
- **新增的 spec 在 Windows 上通过**：`✓ packages/data/nl2sql-engine/tests/open-ended-triage.spec.ts (14 tests) 65ms`。
- **static 的 jsdoc 门确实点到了 `context.ts`**（`BootOptions:42`、`BootResult:61`、`boot`），
  但**同三条在 PR#36 里逐字出现**；唯一差别是 `boot` 的行号 `503`→`504`，因为我加了一行注释。
  即：本 PR 让一条既有违规的行号平移了 1，没有新增违规。

## 3. Windows job 的失败集合**不**相同 —— 修正 subagent 的说法（已核）

subagent 报「identical signature」，但逐文件比对后不成立：

| | 失败测试文件数 | 总测试文件数 |
|---|---|---|
| PR #37 | **14** | 968 |
| PR #36 | **13** | 967 |

（968 vs 967 的差 = 本 PR 新增的那个 spec，它**通过**。）

对称差 3 个文件，全部在**两个 PR 都没碰**的包里：

- 只在 PR#37 失败：`code-runtime/code-runtime-worker-thread/tests/runtime.spec.ts`（`Test timed out in 60000ms`）、
  `credentials/credentials-local/tests/watcher.spec.ts`
- 只在 PR#36 失败：`data/semantic-layer/tests/scope-delegation.spec.ts`

**这个「不相同」本身就是结论**：worker-thread 超时 + 文件 watcher 是典型的 Windows 时序 flake，
集合会 run-to-run 抖动。所以 Windows job 的正确描述是「既有的**不稳定**」，
不是「既有的确定失败」—— 两者的处置方式不同（前者要先量化 flake 率，后者可直接修）。

## 4. `Issue lifecycle` / `Issue policy`：上游专用，在本 fork 上永不可能绿（已核）

三处硬编码，我逐条打开核过：

- `.github/workflows/issue-lifecycle.yml:53-54` → `owner: deepseek-harness` / `repositories: deepseek-harness`
- `.github/issue-management/config.json:2-3` → `"organization": "deepseek-harness"` / `"repository": "deepseek-harness"`
- `.github/issue-management/policy.mjs:618` →
  `` api(`/repos/${config.organization}/${config.repository}/pulls/${number}/requested_reviewers`) ``
  → 请求 `deepseek-harness/deepseek-harness/pulls/37` → **404**（PR #37 在 fork 上，不在上游）

外加凭据缺失（已核）：`gh api .../actions/variables` → `total_count: 0`；
secrets 只有 `DASHSCOPE_API_KEY` → `vars.DSH_ISSUE_APP_CLIENT_ID` 为空 →
`create-github-app-token` 报 `The 'client-id' ... must be set to a non-empty string`。

**且这两个 workflow 都 checkout `ref: default_branch`（master），不读 PR 分支** ——
即它们的结果**结构上**与任何 PR diff 无关（subagent 断言，我核了 `issue-policy.yml:16` 一侧）。

→ 决策票 [R5](../tickets/R5-issue-workflows-upstream-only.md)。

## 5. 未复核的 subagent 断言（诚实标注）

以下我采信但**没有**逐项机械重导，引用时需注意：

- static 17 个 gate 各自的根因细节（如 `gen-config-catalog.ts` 的 `findInject` 不解 `as const`
  导致 3/6 条 violation）—— 我只核了失败集合相同与总数，未逐条验证根因。
- `python/sdk-runtime/package.json` 缺的具体是哪 25 个包（我核了「25 行」与两边一致）。
- coverage exempt 机制（`scripts/coverage-exempt.ts`）的语义。
- PR #30 的两个 issuebot job 为 failure（我只核了 #36）。

## 6. 对 [R3](../tickets/R3-branch-protection.md) 的两条硬约束（本审计的主要产出）

见 R3 票体新增段。摘要：

1. **现在就开 "require status checks (+CI)" 会把 master 永久锁死** —— 6 个 check 恒红，
   且其中 coverage 需要补 161 个文件到 100%、static 需要修 17 个 gate。必须先定「红线基线」
   （哪些 gate 进 required、其余怎么办）→ [R4](../tickets/R4-ci-red-gate-policy.md)。
2. **"Restrict pushes" 会切断 CLAUDE.md 明文允许的 wayfinder 文档直推路径**，
   而该路径是当前 session prompt §5 的标准做法（本次 session 用了两次）。
   开之前要先决定文档怎么走（也走 PR？还是给 master 留 bypass 名单？）。
