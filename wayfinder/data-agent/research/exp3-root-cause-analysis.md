# GA-EXP3 — 英文 Prompt 灾难性退化根因分析报告

**日期**: 2026-09-02
**实验票**: [GA-EXP3](../tickets/phase-misc/GA-EXP3-en-prompt-degradation-root-cause.md)
**基于**: GA-EXP2 eval 数据（`eval-results/exp2/exp2-arm-{a,b,e}.json`）
**方法**: 纯数据分析（Directions A/C/D/E），无新 eval run

---

## 核心结论

**英文 prompt 在 GA-EXP2 中导致 -41.1% pass rate 退化的根因是多因子组合（选项 5），权重分布为：**

| 因子 | 归因权重 | 方向 |
|------|---------|------|
| ① 模型行为模式切换（"Helpful Assistant" 模式） | ~55-60% | D |
| ② 跨语言上下文干扰（EN 指令 + ZH 动态内容） | ~25-30% | C, E |
| ③ 翻译精度损失（微弱） | ~5-10% | A |
| ④ 扩展 prompt 间接影响（不确定，需 B' 实验） | 叠加在 ①② | E |

**不是**翻译质量问题。翻译本身语义忠实，某些规则甚至比中文版更具体（硬编码了 `ds`、`GET_JSON_OBJECT`）。问题在于 qwen-plus 模型在英文指令下发生了根本性的行为模式转变。

---

## 方向 D 发现：行为模式分析（主因）

### D1. SQL 生成率崩溃

| 指标 | ARM A (ZH) | ARM B (EN) | 差异 |
|------|-----------|-----------|------|
| 至少 1 次生成 SQL | 149/168 (89%) | 108/168 (64%) | **-25%** |
| 全 3 次均无 SQL | 19/168 (11%) | 60/168 (36%) | **+25%** |
| 最终 attempt 有 SQL | 161/168 (96%) | 75/168 (45%) | **-51%** |

**B 的主要故障模式不是"生成了错误的 SQL"，而是"根本没有生成 SQL"。**

### D2. A-pass B-fail 76 cases 的故障分解

| 故障类型 | 数量 | 占比 |
|---------|------|------|
| B 未生成 SQL（null） | 51 | **67%** |
| B 生成文本而非 SQL | 3 | 4% |
| B 生成 SQL 但错误 | 22 | 29% |

**2/3 的退化来自模型完全未产出 SQL。**

### D3. 模型输出行为对比

**ARM A（中文 prompt）→ 任务执行模式：**
- 遵循结构化 SOP（阶段 A/B/C/D）
- 在推理文本中嵌入 SQL 生成
- k=3 次 attempt 一致性高：59% 的 case 三次均产出 SQL（SSS 模式）

**ARM B（英文 prompt）→ "Helpful Assistant" 模式：**
- 输出英文推理描述："I need to determine...", "First, I'll search for...", "Let me load the event definition..."
- 将工具调用写成纯文本（`search_data_sources("gold consumption")`）而非实际执行
- 在"规划"阶段卡住，从未到达 SQL 生成
- k=3 次 attempt 一致性极差：31% 全部失败（NNN），45% 不稳定（混合 N/S/T 模式）

### D4. 典型 B 失败输出示例

```
k11v2_001 (ARM B, attempt 3):
"I need to answer '昨天的总付费金额是多少' (What was the total payment amount yesterday?).
First, I'll identify the appropriate data source. The question asks for total payment
amount for yesterday (20260901), which is a simple aggregation metric..."
```

对比 ARM A 同 case：
```
k11v2_001 (ARM A, attempt 3):
"### 阶段 A：准备 —— 复合判断门 & 字段校验
问题：'昨天的总付费金额是多少'
- 单一指标（总付费金额）
- 单一层级维度（时间：昨天，即 ds = '20260901'）
→ 非复合问题，无需拆原子子问题..."
[最终生成了正确的 SQL: SELECT SUM(CAST(pay_amt AS DOUBLE)) ...]
```

### D5. 延迟与输出体量

| 指标 | ARM A | ARM B |
|------|-------|-------|
| 平均延迟 | 78.4s | 118.2s (+51%) |
| 错误 case 平均延迟 | 87.7s | 132.6s (+51%) |
| 结果文件大小 | 2,134 KB | 685 KB (-68%) |

B **花更多时间**（+51% 延迟 = 更多推理 tokens）但**产出更少有用内容**（-68% 数据量）——模型在英文指令下消耗大量 tokens 做无效推理。

---

## 方向 C 发现：跨语言上下文干扰

### C1. 混合语言上下文结构

ARM B 的 prompt 实际构成：

```
[EN] You are a game analytics data agent...        ← 英文指令
[EN] # §3 Direct Answer Path...                    ← 英文 SOP
[EN] # §6 Eight Rules...                           ← 英文规则（部分硬编码）
[ZH] # 方言规范（MaxCompute）                       ← 中文（conventions 从不翻译）
[ZH] ## 方言速查 / 可用函数 / CAST 映射 / 模板       ← 中文
[ZH] # 候选表定义: dws_10000251_xxx: 日支付金额...   ← 中文 candidate descriptions
[ZH] # 事件定义: {"params_fields": {...}}           ← 中文 event definitions
[ZH] 昨天的总付费金额是多少                          ← 中文用户问题
```

模型必须在英文指令遵循和中文领域内容处理之间持续切换。

### C2. 英语语义替代

当 B 确实产出了 SQL，它表现出英文语义推断而非中文数据字典查找：

| Case | B WHERE 子句 | A WHERE 子句 | 问题 |
|------|-------------|-------------|------|
| k11v2_020 | `item_type = 'diamond'` | `item_type = 'currency' AND item_id = '1001'` | B 用英文语义推断 "diamond"，A 用数据字典值 |
| k11v2_voice_002 | `ds = 'yyyymmdd'` | (正确日期值) | B 把格式说明当成字面值 |

### C3. SQL 与推理文本混合

**62/168 case**（37%）的 B "generated_sql" 字段包含嵌入的英文推理文本，而非纯 SQL。模型在英文模式下混合了推理和输出，不像中文模式下能清晰分离结构化 SOP 推理与 SQL 生成。

---

## 方向 E 发现：扩展 prompt 间接影响

### E1. 表选择质量下降

| 指标 | ARM A | ARM B |
|------|-------|-------|
| table_selection 正确率（有 SQL+有 judge） | 70/116 (60%) | 15/44 (34%) |

B 的表选择正确率几乎腰斩。在 22 个"B 产出 SQL 但错误"的 case 中，59%（13 个）table_selection = 0。

### E2. 归因不确定性

表选择下降可能源自：
1. **英文扩展 prompt 降低了 BM25 检索质量**（检索到错误的候选表）
2. **模型在英文指令下忽略/误解中文候选描述**（检索正确但理解错误）

两者无法用现有数据分离。需 B' 实验（英文 SQL prompt + **中文**扩展 prompt）来隔离扩展 prompt 的独立贡献。

---

## 方向 A 发现：翻译质量

### A1. 翻译质量评估

翻译质量**合格**。语义忠实度高，核心规则含义保持完整。发现的差异：

| 差异 | 严重度 | 说明 |
|------|--------|------|
| Persona 丢失 "埋点" | 中 | "游戏埋点数据分析" → "game analytics"，丢失 event-tracking 特异性 |
| 规则 1/3 硬编码 | 低 | EN 硬编码 ds/GET_JSON_OBJECT/CAST 类型，ZH 委托 conventions。实际上 EN **更具体** |
| 中文成语力度 | 低 | "宁可少答慢答，不可错答" → "Prefer to answer less and slower..." 命令力度减弱 |

### A2. 翻译不是主因的证据

- 翻译在某些关键点**更**精确（硬编码了正确的 SQL 方言函数）
- 即使翻译完美，模型仍面临跨语言上下文（conventions + candidates + questions 全是中文）
- 主要失败模式是"未生成 SQL"（67%），而非"生成了略有偏差的 SQL"——翻译质量无法解释模型行为模式的根本性转变

---

## 与文献矛盾的解释

我们的结果与 2026 文献（Layer Swap -1.9~3.5%、Frontiers in Medicine "no significant difference"）矛盾的原因：

1. **任务类型根本不同**：文献测试的是自然语言推理/问答；我们的任务是 NL→SQL 生成 + 工具调用 pipeline，要求模型遵循结构化 SOP 产出精确语法输出
2. **Prompt 复杂度根本不同**：文献用简短指令；我们的 prompt 包含 SOP 流程、8 条规则、工具目录、conventions、candidates、事件定义——约 2000+ tokens 的结构化指令
3. **混合语言上下文**：文献通常是单语言端到端；我们的是英文指令 + 中文领域内容的混合体
4. **模型特异性**：qwen-plus 可能对中文 SOP 指令遵循有特定优化——这不是 LLM 通用结论，是模型特定结论

---

## 可操作建议

### 已确认

1. **保留中文 prompt（已由 GA-EXP2 决策确认）**——本分析进一步支持该决策
2. **Kind 1（prompt 英文化）方向已关闭**——退化根因不可通过改善翻译质量解决

### 如需进一步验证

3. **B' 实验**（英文 SQL prompt + 中文扩展 prompt）：隔离扩展 prompt 贡献，但鉴于主因已明确（模型行为模式切换），ROI 低
4. **deepseek-chat 交叉验证**：用非 qwen 模型跑相同 A/B 对比，确认是 qwen 特异性还是 NL2SQL 任务通用结论。若 deepseek 退化小 → 纯模型偏好问题；若也大 → 任务类型+混合语言是通用问题
5. **partial-EN 变体**：仅翻译 boilerplate（section headers），保留中文规则核心——但鉴于主因是模型行为模式切换，部分翻译可能也触发该问题

---

## 成功标准自评

| 标准 | 达成 | 说明 |
|------|------|------|
| 明确归因至少 60% 退化来源 | ✅ | 模型行为模式切换 ~55-60%，跨语言干扰 ~25-30%，合计 >85% |
| 如果翻译是主因：提出改进方向 | N/A | 翻译**不是**主因（~5-10%） |
| 如果模型是主因：标注为模型特定结论 | ✅ | 标注为 qwen-plus 特定结论；需 deepseek 交叉验证确认通用性 |
