# CL-20 收尾 session prompt —— 修门禁误伤 → rebase → 重跑全量 → 开 PR

> 从 [`wayfinder/_templates/session-prompt.md`](../../_templates/session-prompt.md) 实例化。
> 上游票：[CL-20](../tickets/CL20-delivery-agent-behavior-type2.md)（决策已定 D1-D5，实现有已知缺陷）。

## 1. 环境/分支契约（session 启动第一步）

**代码分支已存在，不要新建**——CL-20 的实现在 `fix/cl20-delivery-agent-behavior` 上（2 个代码 commit），
worktree 在 `../dsh-CL20`。

```sh
cd /Users/mckenzie/workspace/dsh-CL20
git log --oneline -2          # 应见 4c2a1c7764 + d6b376d296
node scripts/install-lefthook.mjs
```

- worktree：`../dsh-CL20`（已存在）
- 分支：`fix/cl20-delivery-agent-behavior`
- 基线：需 **rebase 到最新 `origin/master`**（落后约 60+ commits，见第 3 节步骤 2）
- **禁止直推 master。** 代码必须走 PR（CI 有 `No production src on master` guard，已实测会拦）。

## 2. 直推 master 白名单

本 session 会同时改代码和 wayfinder 文档。**文档可直推、代码必须 PR**，所以：

- 代码 commit（`packages/*/src`、`packages/*/tests`）→ 留在分支，走 PR
- 纯 wayfinder 文档 commit → 可用独立 worktree cherry-pick 后直推 master（本 session 前序已这样做过两次，方法见第 5 节）
- **两者不要混在同一个 commit 里**——前序 session 保持了这个分离，请延续

## 3. 任务正文

### 已完成（不要重做）

CL-20 的 5 项决策全部锁定并记录在票里，**决策部分不再变动**：

| ID | 决策 |
|---|---|
| D1 | 范围 = 让拒绝确定性触发（非「教模型拒绝」——模型已在拒绝，9 个散文 attempt 中 7 个过 judge） |
| D2 | 检测层 = `engine.ts` 前置门禁（`while` 循环之前，零 LLM 浪费、不碰 `prompt.ts`） |
| D3 | 检测逻辑 = LLM 分类器，**只判交付物类型**（report/forecast/recommendation vs 数据值）。**关键词规则已按普适性否决**——`TREND_PATTERN` 同构实现在 `GA-GRILL2` D3 实测 recall 85% 天花板，为突破它专门开了 `GA-I18N-R1` 转向 LLM intent 分类；词表随业务域线性增长且强制中英双语。**BM25 分数阈值亦否决**（CL-7：分数跨查询不可比）。 |
| D4 | 合成通道 = 复用 CL-23 grounded 三段式（`context.ts:397` 条件扩展） |
| D5 | 验收 = 三轮中位数 DELIVERY ≥80%，但**已判定引擎侧不可达** → 毕业 [CL-25](../tickets/CL25-open-ended-case-set-consistency.md) |

已落地代码（分支上，未合并）：
- `packages/data/nl2sql-engine/src/engine.ts` —— `declineKind` union 扩展 + `triageQuestion` 前置门禁
- `packages/eval/eval-cli/src/context.ts:397` —— 合成分支条件扩展
- `packages/data/nl2sql-engine/tests/open-ended-triage.spec.ts` —— 12 测试

### 步骤 1（必做，阻塞其余）：修 triage prompt 的样例冲突

**缺陷**：`k11v2_052`「最近7天**每天的**商店销售额」——明确的数据请求（`query_intent: trend`、
`match_mode: row_count_range`）——被门禁 **3/5 次误伤**。五次观测见票里 2026-09-06 晚更正段。

**根因（已定位，不需重新调查）**：`triageQuestion` 的 prompt 把
`a compiled/periodic report or summary ("weekly report", "summarise the month")`
列为 `beyond_single_query` 样例，**「7天每天的」与「周报」词法紧邻**，模型约 60% 判成后者。

**要做的事**：重写判据，把「周期性汇总报告」与「多日明细数据」明确分开。方向建议（非强制）：
强调**逐日/逐项的数值明细 = `data_request`，即使跨多天**；`beyond_single_query` 限于
「要求把多个指标编排成一份叙述性产物」。注意别把 `voice_044`「帮我出个周报」误放行——
它和 052 的真正区别是**要不要叙述性编排**，不是**跨不跨多天**。

**验收**：
- `052` 连跑 ≥3 次，门禁**一次都不触发**
- 原 7 个应拦 case 仍全部拦住：`voice_033` `voice_036` `voice_041` `voice_044` `voice_045` `voice_047` `voice_048`
- `073` `076` `077` 仍放行
- 新增测试固定「N天每天的X」形态不被门禁碰（现有 12 测试里没有这一类，是它漏过去的原因）

### 步骤 2：rebase 到 `origin/master`

```sh
git fetch origin
git rebase origin/master
```

**已知需手工合的一处**：`packages/eval/eval-cli/src/context.ts` —— master 加了
`promptBuilder: (args) => buildPrompt({...args, contextPrefetched: true})`，本分支改的是
`:397` 的 `declineKind` 分支条件。**同文件不同位置，非同行冲突**，两边都要保留。

rebase 后 4 个纯文档 commit 会因已在 master 而自动 drop，只剩 2-3 个代码 commit——这是预期的。

**顺带做**（`declineKind` 命名）：门禁收窄为交付物类型判定后，`'open_ended_question'`
已名不符实，改为 `'beyond_single_query'`。调用点 3 处：`engine.ts` 的 union 定义 + 门禁返回、
`context.ts:397`、`tests/open-ended-triage.spec.ts`。（此项挂在 [CL-26](../tickets/CL26-eval-runner-service-decline-synthesis-gap.md) 附带项，在此一并做掉。）

### 步骤 3：重跑测试

```sh
npx tsc --noEmit
npx vitest run packages/data/nl2sql-engine/tests/    # 应 128+ 全绿
npx vitest run packages/eval/                        # 应 339 全绿
```

### 步骤 4：在 rebase 后代码上重跑全量（这才是验收数字）

```sh
nohup bash scripts/run-eval.sh --run-id cl20-postrebase-n1 --pass-k 1 > /tmp/cl20-postrebase.log 2>&1 &
grep -o "Progress: [0-9]*/168" /tmp/cl20-postrebase.log | tail -1   # 轮询，约 40-50 分钟
```

**为什么必须重跑**：`cl20-full-n1` 已失效。master 落地了 `contextPrefetched`
（GA-EVAL-SQLGEN-PROMPT-FIX），它删掉 engine responder 的可调用 `# 工具集` 目录、
把 tool-call 发射从 16-22% 打到 **0%**——而 tool-call 正是本票 9 个 fail case 中
**6/27 个 attempt** 的形态。**rebase 后模型行为已变，旧数字不成立。**

分析时**必须**：
- 用 `compare.ts` 与基线比，并注意**协议**：基线 `rebaseline-passk-168-clean` 是 `pass_k=3 pass^k`，
  本 run 是 `pass_k=1` → 守卫会 exit，需 `--allow-protocol-mismatch`，且**记录时必须标注
  Overall delta 中约 12pp 是纯协议差异**（CL-15/CL-22 为此专门加了守卫，别绕过它还当质量结论）
- **查 Lost 全集**，不要只查空 SQL 的 case ——前序 session 正是漏了这步才误报「误伤 0」
- 每个疑似门禁误伤的 case **跑 ≥3 次**再下结论（单次重跑不足以判定，前序踩过）
- 门禁触发的判别：trace 未持久化，只能靠**延迟**推断（门禁触发 ≈ 1 次 LLM 调用，
  实测中位 29.7s；正常出 SQL 中位 50.1s）。**如果本 session 有余力，考虑把 trace 落到产物里**，
  让后续判别不再靠推断

### 步骤 5：开 PR

```sh
gh pr create --base master --head fix/cl20-delivery-agent-behavior
```

PR 描述引用已在 master 的 ticket + audit-log（不要在 PR 里复述细节）。合并前过
[dsh-pre-push-checks](../../../.agents/skills/dsh-pre-push-checks/SKILL.md)。

## 4. 硬约束（前序 session 踩过的坑，务必看）

1. **eval 跑的是工作树，不是 HEAD。** `tsx` 执行工作树文件，所以**全量 run 期间绝不改
   `packages/*/src`**——否则结果对不上任何 commit（map Notes 已记录过这个坑，前序 session
   因此推迟了 `declineKind` 改名）。
2. **绝不 `git add -A`。** 树里常有其他 session 的在途文件（实测主树挂着别的票的编辑）。
   按路径显式 stage，提交前 `git diff --cached --name-only` 核一遍。
3. **主树 `/Users/mckenzie/workspace/deepseek-harness-da` 不要碰。** 它停在别的 session 的分支上、
   带着别人的未提交改动。要往 master 推文档就开独立 worktree。
4. **推 master 前必须 `git fetch` + rebase。** 前序 session 差点回退别人的工作——建 worktree 时
   `origin/master` 是一个 sha，cherry-pick 完它已前进 2 个 commit，diff 里冒出两个没碰过的
   `wayfinder/repo-infra/*` 文件且方向是**反的**。rebase 后消失。
5. **数字落笔那一刻自己机械重导一遍**（CLAUDE.md 提交与引证纪律）。前序 session 的
   「误伤 0」就是没查全 Lost 集 + 单次重跑就下结论造成的，已在三处更正。
6. **每次 eval run 必须记 audit-log**，用 CLAUDE.md 的标准模板，n=1 的必须标注
   「单 run，不可作决策依据」（CL-22 分层协议：迭代中用 n=1 导航，决策点须 ≥3 轮中位数）。

## 5. 文档直推 master 的做法（前序验证过）

```sh
cd /Users/mckenzie/workspace/deepseek-harness-da
git worktree add ../dsh-docs-push -b docs/<slug> origin/master
cd ../dsh-docs-push
git fetch origin && git rebase origin/master        # 关键：防回退别人的工作
git cherry-pick <纯文档 commit sha>...
git diff --name-only origin/master..HEAD | grep -E "^(packages|apps|examples|native|python|scripts)/"   # 必须无输出
git push origin HEAD:master
cd ../deepseek-harness-da && git worktree remove ../dsh-docs-push --force
```

## 6. 收尾

- [ ] `052` 及「N天每天的X」形态不再被误伤（≥3 次验证）
- [ ] 7 个应拦 case 仍全拦、`073/076/077` 仍放行
- [ ] `pnpm run typecheck` 绿 + nl2sql-engine / eval 测试绿
- [ ] 全量 `cl20-postrebase-n1` 记入 audit-log（含协议标注 + Lost 全集分析）
- [ ] CL-20 ticket 补入 post-rebase 数字；**此时才可考虑把 status 改 `closed`**
      （前序保持 `in_progress` 是因为门禁有已知未修缺陷）
- [ ] `gh pr create`，过 pre-push checks
- [ ] **下一并行批不得在本批 PR 未 merge / abandon 前启动**

## 7. 本 session 之后的 frontier（不在本 session 范围）

| 票 | 一句话 |
|---|---|
| [CL-25](../tickets/CL25-open-ended-case-set-consistency.md) | open_ended case set 期望行为不自洽（`076` vs `079` 同词根反例）+ 混合 ≥5 种拒绝理由；需定判据、重分类、重设 DELIVERY 目标 |
| [CL-26](../tickets/CL26-eval-runner-service-decline-synthesis-gap.md) | `eval-runner-service` 零 `declineKind` 处理 → ③ 自驱循环的 DELIVERY 证据被管道缺陷压低；W16/W17 同族第四例 |
| [CL-27](../tickets/CL27-triage-unconditional-call-cost.md) | 门禁对 96% 查询多调一次 LLM；且 pass^k 下同 case 重复调 3 次（每轮 336 次浪费） |
