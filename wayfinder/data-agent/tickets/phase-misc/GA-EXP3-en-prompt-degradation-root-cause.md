# GA-EXP3 — 英文 Prompt 灾难性退化根因分析

**Type**: research  ·  **Phase**: misc  ·  **Status**: Resolved
**Source**: [GA-EXP2 实验报告](../../research/exp2-results-report.md)（2026-09-02）
**Blocked by**: 无
**关联**: GA-EXP2（前置实验）、GA-GRILL2（i18n 架构）

---

## 背景

GA-EXP2 实验发现：将 prompt.ts 的结构性中文 prompt 翻译为英文后，SQL 生成 pass rate 从 **72.0% 暴跌至 31.0%**（-41.1%）。这与 2026 年多篇前沿研究的结论**严重矛盾**：

| 研究 | 结论 | 我们的发现 |
|------|------|-----------|
| Layer Swap (arxiv 2605.26735, 2026-08) | LLM 母语 prompt 的 reasoning gap 仅 1.9-3.5% | **-41.1%** |
| Frontiers in Medicine (2026-08) | "no significant language-related performance differences" | **灾难性差异** |
| Lower-Resource (arxiv 2607.14480, 2026-07) | LLM-as-judge 存在结构性语言偏差 | Judge 偏差几乎为零（+0.0%） |

**关键问题**：为什么 NL2SQL agent 场景下英文 prompt 退化如此严重？是翻译质量问题、模型偏好问题、还是任务特性决定的？

## Question

英文 prompt 在 GA-EXP2 中导致 -41.1% pass rate 退化的根因是什么？该退化是否可归因于：
1. 翻译质量/prompt engineering 丢失
2. 模型（qwen-plus）对中文的特定优化
3. 中文动态内容 + 英文指令的跨语言干扰
4. 任务类型特性（SQL 生成 + tool 调用 ≠ 一般推理）
5. 以上的组合

## 研究方向

### 方向 A：翻译质量归因

**假设**：退化主要来自翻译过程丢失了经过 eval 调优的微妙 prompt engineering，而非语言本身。

**验证方法**：
1. 逐 section 对比中英文 prompt，标注哪些术语/表达在翻译中可能丢失精度（如"诚实拒绝"→"honest decline"是否改变了模型行为？"宁可少答慢答，不可错答"→"prefer to answer less and slower rather than answer incorrectly"是否保持了相同的约束力？）
2. 设计 **partial-EN 变体**：保留关键中文 section（如 §6 八规则、§5 诚实拒绝），只翻译结构性 boilerplate（section headers、tool catalog），测试退化是否减轻
3. 用 GPT-4 做独立的 back-translation（EN→ZH），检查 round-trip 是否保持语义一致

### 方向 B：模型语言偏好归因

**假设**：qwen-plus 对中文有特定优化，换用以英文为主的模型（如 deepseek-v3、Claude）结果可能不同。

**验证方法**：
1. 用 **deepseek-chat**（DEEPSEEK_API_KEY 已就位）跑 A/B 两组，看退化是否同样严重
2. 如果 deepseek 退化小、qwen 退化大 → 模型偏好是主因
3. 如果两者都退化严重 → 语言本身不是问题，是翻译/任务特性

### 方向 C：跨语言上下文干扰归因

**假设**：英文指令 + 中文动态内容（候选表描述、事件定义、用户问题）造成 code-switching 开销，比纯中文上下文更差。

**验证方法**：
1. 分析 B 的 diff cases（76 个 A 通过 B 未通过），检查模型在英文 prompt 下的推理轨迹：
   - 是否理解了候选表的中文描述？
   - 是否正确提取了中文字段名/注释？
   - 是否在中文事件名/表名上出错（如用英文名替代中文表名）？
2. 关注 metric_lookup intent（-50.8%）——这是最简单的查询类型，退化最不应该如此严重

### 方向 D：Decline rate 与行为模式分析

**假设**：英文 prompt 可能改变了模型的拒答行为（decline）或工具调用模式。

**验证方法**：
1. 对比 A/B 的 per-case transcript：B 是否更倾向 decline？还是生成了错误的 SQL？
2. 检查 B 的 wrong cases：是 SQL 错误、还是根本没生成 SQL？
3. 检查 query expansion 的差异——B 使用英文 expansion prompt，可能导致 BM25 检索质量下降，从而上游候选错误

### 方向 E：Expansion prompt 的间接影响

**假设**：B 的退化部分来自英文 expansion prompt（`EXPANSION_SYSTEM_PROMPT_EN`），导致 BM25 检索质量下降，而非 SQL 生成 prompt 本身。

**验证方法**：
1. 设计 **B'** 变体：英文 SQL prompt + **中文** expansion prompt（只翻译 SQL 生成部分，不翻译检索扩展）
2. 对比 B 和 B'：如果 B' 恢复大部分性能 → expansion prompt 是关键因素

## 优先级排序

1. **方向 D**（最低成本）：直接分析现有 transcript，不需要新 eval run
2. **方向 E**（中等成本）：只需 1 次 eval run（B' 变体）
3. **方向 C**（中等成本）：人工分析 diff cases
4. **方向 B**（中等成本）：需 deepseek 模型 eval run
5. **方向 A**（高成本）：需 partial-EN 变体设计 + 多次 eval run

## 成功标准

1. 明确归因至少 60% 的退化来源（翻译 vs 模型 vs 跨语言 vs 检索）
2. 如果翻译是主因：提出可操作的改进方向（partial-EN 策略/prompt 调优指南）
3. 如果模型是主因：标注为 qwen-plus 特定结论，为模型切换决策提供数据

## 关键文件

- `eval-results/exp2/exp2-arm-{a,b,e}.json` — per-case 完整 transcript
- `packages/eval/eval-cli/src/exp2-prompts-en.ts` — 英文变体源
- `packages/data/nl2sql-engine/src/prompt.ts` — 中文原版
- `packages/eval/eval-cli/src/context.ts` — expansion prompt 和 variant 切换
- `wayfinder/data-agent/research/exp2-results-report.md` — 实验报告

---

## Resolution（2026-09-02）

**完整报告**: [exp3-root-cause-analysis.md](../../research/exp3-root-cause-analysis.md)

### 答案

退化根因是**多因子组合（选项 5）**，以模型行为模式切换为主因：

| 因子 | 归因权重 |
|------|---------|
| ① 模型行为模式切换 — qwen-plus 在英文指令下进入 "Helpful Assistant" 推理模式而非任务执行模式 | ~55-60% |
| ② 跨语言上下文干扰 — 英文指令 + 中文 conventions/candidates/questions 的 code-switching 开销 | ~25-30% |
| ③ 翻译精度损失 | ~5-10% |

### 关键证据

1. **67% 的退化 case（51/76）是 B 完全未生成 SQL**，而非生成了错误的 SQL。模型输出英文推理描述（"I need to determine..."）而非 SQL。
2. ARM B 的 k=3 跨 attempt SQL 生成一致性极差：31% 全部失败（NNN），45% 不稳定，仅 14% 一致成功（SSS）。ARM A 为 59% 一致成功。
3. 当 B 产出 SQL 时，表选择正确率从 60%（A）降至 34%（B）；WHERE 子句出现英语语义替代（如 `'diamond'` 替代数据字典值 `'currency'/'1001'`）。
4. B 的延迟 +51%、输出体量 -68% — 模型消耗更多 tokens 做无效推理。
5. 翻译质量本身合格：语义忠实，部分规则甚至更具体。问题不在翻译，在模型行为。

### 决策影响

- 进一步支持 GA-EXP2 "保留中文 prompt" 决策
- 标注为 **qwen-plus 特定结论** — 需 deepseek 交叉验证确认通用性（方向 B 可作为后续工作）
- B' 实验（隔离扩展 prompt 贡献）ROI 低，主因已明确
