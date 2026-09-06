---
type: grilling
status: open
assignee: null
blocked_by: []
---

# CL-28: `contextPrefetched` 掐掉了 grounded 拒绝合成的入口 → DELIVERY 回吐 16pp

**Branch**: 未认领（认领时按 CLAUDE.md:64 声明 `<type>/cl28-<slug>`）

## Question

CL-23 的 grounded 三段式拒绝合成器（【点名缺失】/【列举可得】/【引导重问】）**只有两个入口条件**
（`packages/eval/eval-cli/src/context.ts:406`）：

```ts
result.decline && (result.declineKind === 'tool_call_emitted' || result.declineKind === 'beyond_single_query')
```

其中 `'tool_call_emitted'`（CL-23 建的那个）依赖**模型真的发射 tool-call**。
而 master 已落地的 `contextPrefetched`（GA-EVAL-SQLGEN-PROMPT-FIX）删掉了 engine responder
prompt 里可调用的 `# 工具集` 目录，把 tool-call 发射率从 16-22% 打到 **0%** ——
**入口条件永不成立，该通道事实上死掉了。**

需决策：这条合成通道该以什么条件进入？候选（互斥性待 grilling）：
1. **扩入口**：把「生成重试耗尽」（`engine.ts` 的 `自修 2 次仍失败`）也路由到 grounded 合成，
   而不是现在落到 judge 打 0 的 `Declined: ...` 诊断文本；
2. **改判据**：不看 `declineKind`，改看「引擎没能产出可执行 SQL」这一事实本身；
3. **回滚/条件化 `contextPrefetched`**：但它自身是为修 tool-call 污染而落的，回滚会还原那个问题；
4. **接受**：认定 tool-call 归零本身就是目标，DELIVERY 的分应由模型 §5 散文拒绝承担
   （E4 已证其能过 judge），则须解释为何 post-rebase 散文拒绝反而变少。

## 证据（2026-09-06 夜，`cl20-postrebase-n1`，n=1 导航用）

完整记录见 [experiment-audit-log 2026-09-06（夜）条目](../research/experiment-audit-log.md)。

同协议（k=1）、**代码运行时 diff 仅一个字符串改名**的两次全量 run：

| 口径 | `cl20-full-n1`（pre-rebase） | `cl20-postrebase-n1`（post-rebase） | delta |
|---|---|---|---|
| Overall | 77.4%（130/168） | 75.6%（127/168） | −1.8pp |
| Voice DELIVERY（18） | 94.4%（17/18） | 72.2%（13/18） | **−22.2pp** |
| DELIVERY 全 25 | 80.0%（20/25） | 64.0%（16/25） | **−16.0pp** |

→ 该 delta **只能归因于 rebase**（+78 commits，含 `contextPrefetched`）。

形态转移（`generated_sql` 分类，pre → post）：

| case | pre | post | verdict |
|---|---|---|---|
| `voice_039` 活动奖励发放是不是太多了 | PROSE(495) | NULL | correct → wrong |
| `voice_042` 帮我看看昨天的关键指标 | PROSE(293) | NULL | correct → wrong |
| `voice_013` 这个活动效果好不好 | PROSE(402) | PROSE(277) | correct → wrong |
| `voice_017` 玩家反馈怎么样 | NULL | NULL | correct → wrong |
| `voice_041` 最近数据有什么异常吗 | NULL | NULL | correct → wrong |
| `077` 玩家留存有什么问题吗 | SQL | PROSE(412) | correct → wrong |

**已排除 CL-20 门禁为原因**：逐 case 直接测量门禁触发率（读引擎 trace，
`packages/eval/eval-cli/bin/probe-triage.ts` 同款方法）——
`voice_013` 0/3、`voice_017` 1/3、`voice_039` 0/3、`voice_041` 0/3、`voice_042` 0/3、`077` 0/3。

**推断性部分（须本票确认）**：post-rebase 那些 NULL 的**确切路径**未持久化
（trace 不落产物）。推断是「生成重试耗尽 → `Declined: ...` → judge 打 0」，
因为 `voice_017`/`voice_041` 的 NULL 在 pre-rebase 走的是 tool-call → grounded 合成（judge 过）。
**第一步应是把 trace/declineKind 落到产物里**，否则本票也只能继续推断。

## 与既有票的关系

- **CL-26**（`eval-runner-service` 零 `declineKind` 处理）：同族第五例。CL-26 是「另一个 runner
  完全不处理 `declineKind`」，本票是「eval-cli 处理了，但入口条件被上游 prompt 改动掐死」。
  两者都指向同一个结构问题：**拒绝合成的触发条件绑在「模型产出的具体形态」上，而那个形态会被
  prompt 变更改掉**。可能应合并成一张「拒绝通道的触发判据」决策票。
- **CL-25**（case set 期望行为不自洽）：DELIVERY 目标值待 CL-25 定齐后重设；本票是另一条独立的
  压低因素，两者叠加。
- **CL-20**：本票从 CL-20 收尾时毕业。CL-20 交付的门禁本身零回归（vs 无门禁基线
  DELIVERY 全 25 52.0% → 64.0%）。

## 验收

- trace / `declineKind` 落进 eval 产物（使「哪条 decline 路径」可直接观测，不再推断）
- 合成通道入口判据定案 + 落地
- 全量 eval：DELIVERY 全 25 回到 ≥80%（或在 CL-25 重设目标后达成新目标），≥3 轮中位数
