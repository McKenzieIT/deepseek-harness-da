# Next Session Prompt — GT3 item 5 数据丢失 → SQLGEN-PROMPT-FIX

## 仓库状态（2026-09-04，截至本 prompt 写时）

- **pass^k 已落地**（`passKVerdict`，commit `52330a98fa`）；当前基线 **61.9%（104/168，`rebaseline-passk-168-clean`）**
- **judge 放过率已测**（GA-EVAL-REAL-EXEC resolved）：real-exec 12.8% vs judge ceiling 48.7% → **judge false-pass 35.9pp**；judge 的通过判定里 73.7% 是假的 → k11-v2 的 61.9% 很可能被大幅高估
- **Kind 1 已 won't-do**（GA-GRILL2，2026-09-03 grilled）；研究诉求转 GA-EXP5（2×2×2），功效前置为 GA-EVAL-EXPAND
- **GA-EXP2 / GA-GT2 已正式 Resolved**（本 session 补了 Resolution + 翻转 Status）
- GA-EXP4 的 `-3.0%` **不显著**（p=0.332）—— EXP2 的 -41.1% **显著**（p<0.001）
- 仓库常被多 session 并发改，**动文件前先 `git status` / 重读，绝不 `git add -A`**（见 CLAUDE.md「提交与引证纪律」段）

## 本次目标

**一件主线 + 一件可选**：先 grill 并修掉 GA-GT3 item 5 的真实数据丢失（map 上唯一「已确认 bug + 零测试护栏 + 未被阻塞」项），再看要不要接 SQLGEN-PROMPT-FIX。

---

## Prompt（直接粘贴到下一个 session）

```
/effort max

先读上下文。注意仓库常有其他 session 的在途改动——开工前先 git status --short
和 git log --oneline -8，本次只提交你自己触及的文件（按 CLAUDE.md「提交与引证
纪律」：改完一个逻辑单元立即 commit，绝不 git add -A，按路径 stage + git diff
--cached --name-only 核）。

必读：
- wayfinder/data-agent/map.md — 只读 Destination / Notes / Decisions so far 里
  GA-GT3、GA-EVAL-REAL-EXEC、GA-GRILL2 三条 + 推荐顺序
- wayfinder/data-agent/tickets/phase-misc/GA-GT3-enrichment-generalization.md —
  **重点读末尾「证据收集（2026-09-03）」章**
- wayfinder/data-agent/research/gt3-grilling-brief.md — 373 行完整证据，每条带
  file:line（行号经复核，唯一漂移 tool-search :98→:107 已更正）

## 主线：GA-GT3 item 5 — 修掉 dimension_refs 数据丢失

grilling 票（HITL），决策问我，不要自己拍。已确认的事实（无需重新调查）：

- `origin` 优先级逻辑在 `mergeRefs` 内部，而 `mergeRefs` 只在
  `mergeExisting === true` 分支被调用；replace 分支 enrichment.ts:348
  （`refs = discovered`）根本不调 `existingRefs()`，manual ref 被整体丢弃后
  :350 无条件写盘。
- 链路：tool-discover-relations/src/index.ts:166 → semantic-layer/src/index.ts:628
  （显式传 false）→ enrichment.ts:330（默认 false）→ :348。
- 「可先做这一行」是错的：只翻 enrichment.ts:330 默认值对 agent tool 无效，
  因为 index.ts:628 硬编码 false；events 路径（index.ts:649、
  scripts/seed-event-external-refs.ts:19）连参数都不传，没有 merge-mode 入口。
- 没有任何测试断言 replace 模式 → 改默认值挡不住任何测试（低摩擦，但也无护栏）。
- 真实张力：mergeRefs 是并集语义、从不删除，所以 replace 是唯一能清掉过期
  ref 的路径——CL-18 Phase 1 那次 23→5 噪声清理在纯 merge 下将无法进行。且
  auto=merge / explicit=replace 是一次 code-review 的刻意决定
  （.agents/notes/implemented/feature/2026-08-22-…:29）。

### 第一步：grill 我在三个方案里选一个

| 方案 | 内容 | 代价 |
|---|---|---|
| (a) | 默认翻 mergeExisting=true | 保住 curated ref，但失去清理过期 ref 的能力 |
| (b) | origin-aware replace——只替换 deterministic/llm，保留 manual | brief 推荐的调和方案 |
| (c) | 显式 opt-in replace flag | 调用方全改；语义最清楚 |

用 /grilling，一次一个问题。至少压这几点：CL-18 那类噪声清理在你选的方案下
还做得到吗？origin 为 undefined 的历史 ref（GA-I18N-1 之前写的）算 manual
还是 deterministic？events 路径要不要一并开 merge-mode 入口？

### 第二步：实施（TDD）

决策落定后按 /tdd：先写红测试闭合数据丢失（现在零覆盖），再改。必须同时处理
index.ts:628 的硬编码 false 和 events 路径缺失的入口，否则改动无效。
enrichment.spec.ts:222（'skips DIM tables'）是唯一编码星型假设的测试——本次
若不动 item 1 就别碰它。

### 第三步：只解 item 5 + item 6

GA-GT3 六项里只有 item 5、6 是 independent（未被 GA-EXP1 阻塞）。item 1、3
partially gated，item 2、4 EXP1-gated（item 2 就是 EXP1 Phase 2 Arm A 本身）。
别顺手做 item 1/2/3/4——它们等 GA-EXP1（Status: Open，Phase 1 只做了一半，
judge 校准从未执行）。票不整体 resolved，只勾掉 item 5、6 并记清剩余 gating。

## 可选（若主线还有余量）：GA-EVAL-SQLGEN-PROMPT-FIX

tickets/phase-misc/GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md — real-exec
基线里 34% 的 attempt 发射 RBI tool-call 格式而非 SQL（集中在 case 119-138），
怀疑 engine responder 的 SQL-gen prompt 漏了 RBI 工具目录给 LLM。修完会触发
real-exec re-baseline。纯工程活，不需要 grilling。

## 不要在本 session 做

- GA-EVAL-EXPAND / GA-EXP5 — 研究支线。EXPAND 含 57 个 case 逐个人工确定
  正确 SQL 的重活（注意循环性风险：参考 SQL 必须人工写，交给 LLM 会把系统
  当前错误固化为「正确答案」）。排在 GT3 之后。
- GA-EXP1 — 大实验，需 live LLM，独立 session。
- 别改 runner.ts 判分语义（pass^k 已落地并重基线两次，当前 61.9%）。

## 收尾

更新 GA-GT3 票 + map（Decisions so far 一行 + 推荐顺序），跑 pnpm typecheck
+ 相关包 vitest，subagent code review，只提交你触及的文件。

顺带留意两个悬空项（已在 map 标注，待原 session 处理，你不用管除非顺路）：
packages/eval/eval/cases/rbi-10000251-exec/（39 个 case，12.8% 真实执行基线
所依赖）未被 git 追踪，源文件在仓库外；仓库根目录有未追踪的
analyze-real-exec-gap.mjs。
```

---

## 为什么是这个顺序

1. **GT3 item 5** — map 上唯一「已确认 bug + 零测试护栏 + 未被阻塞」项，已定位到行。
2. **SQLGEN-PROMPT-FIX** — 便宜且解锁 re-baseline；34% 非 SQL 发射压低了真实执行基线，修完那个 12.8% 才有意义。
3. **EXPAND/EXP5 推后** — 研究支线；REAL-EXEC 已用便宜路径拿到 judge false-pass 的第一个数字（35.9pp），EXPAND 的剩余理由收窄为「k11-v3 与 168-case 历史谱系可比」+「EXP5 功效前置」。
4. **GA-EXP1** — 仍是 GT3 其余四项的真正瓶颈，独立 session。
