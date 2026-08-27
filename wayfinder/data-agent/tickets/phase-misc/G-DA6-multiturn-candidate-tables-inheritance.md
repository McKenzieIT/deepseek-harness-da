# G-DA6 — 多轮 follow-up candidate_tables 继承

**Type**: grilling
**Phase**: misc (cross-phase)
**Status**: implemented (2026-08-27)
**Graduated from**: 2026-08-27 session `e078a87b` 诊断——G-DA4 symmetric fix（`load_table_definition` 加 `candidate_tables`）解决了死循环，但 follow-up 轮次仍需额外 retry（模型须主动调 `load_table_definition` 重新通过 gate）。

## Question

follow-up 问题复用前轮表时，`resetQuestionScoped`（phase-gate.ts:888）清空 `candidate_tables` 导致 understanding 必须重新召回该表。若 search 关键词不精准（如 `top_k=5` + 抽象词"周环比"未召回 `pay_order_di`），generation 需额外一次 `load_table_definition` retry。如何让 follow-up 轮次在 grounding 安全前提下减少这类冗余 retry？

## Resolution

**方案 (a)：直接继承**——`resetQuestionScoped` full-reset 路径从前轮快照 seed `candidate_tables` + `definition_loaded`，而非清空。

### 决策明细

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| 1 | 核心机制 | (a) 直接继承 | 确定性零 retry；~15 行变更；(b)(c) 概率性，(d) 过度设计 |
| 2 | 继承范围 | 仅前 1 轮 | 覆盖最常见 follow-up 模式；含可观测性日志支撑后续 N 扩展 |
| 3 | 验证条件 | EXECUTION 成功（`last_query_outcome === 'completed'`） | MaxCompute 引擎已验证表存在 + 字段匹配 + 权限通过 |
| 4 | Stale 保护 | 零额外保护 | 依赖现有 EXECUTION 报错 → fallback→UNDERSTANDING 链；同 session 内 stale 概率趋零 |
| 5 | Bias 风险 | gate-only，模型不可见 | 继承不注入 persona；模型独立 search + 选表；继承仅消除 gate 层机械浪费 |
| 6 | Scope-routing 交互 | scope 切换时清空 `prior_turn_tables` | 跨 scope 表继承语义错误；遵循 P-DA4b 已有 state reset 语义 |
| 7 | 继承字段集 | 仅 `candidate_tables` + `definition_loaded` | critic 对 `event_params`/`partition_cols` 采用 fail-open（size=0 时跳过检查）；最小继承表面积 |

### 实现规格

1. **新 state 字段**：`prior_turn_tables: Set<string>`（初始空）
2. **快照时机**：`onPostExecute` 当 `last_query_outcome === 'completed'` 时：`s.prior_turn_tables = new Set(s.candidate_tables)`
3. **继承注入**：`resetQuestionScoped` full-reset 路径：
   - `s.candidate_tables = new Set(s.prior_turn_tables)`（替代 `.clear()`）
   - `if (s.prior_turn_tables.size > 0) s.definition_loaded = true`
4. **Scope 切换清空**：`scopes/active-changed` handler 加 `s.prior_turn_tables.clear()`
5. **可观测性**：当 GENERATION 阶段模型调 `load_table_definition` 且该表名不在 `prior_turn_tables` 但存在于 session 更早历史中时，emit `[G-DA6] inheritance miss: table=${name}` structured log

### 独立审查结论

经 adversarial subagent 审查（2026-08-27），原标记的两个 BLOCKER 降级：

- **原 BLOCKER-1**（`definition_loaded=true` 阻断新表）→ **GAP**：模型始终执行 UNDERSTANDING search（gate-only 不可见 + backstop 强制），新表通过 search 正常加入 candidate_tables；search miss 时走现有 retry，不构成回退。
- **原 BLOCKER-2**（`last_search_empty` 误触发）→ **NON-ISSUE**：模型不感知继承，始终 search → `last_search_empty` 正常更新；route:proceed 跳过 search 时 backstop 正确拦截。

已知 GAP（接受）：
- `forcedLoad` 被继承抑制（candidate_tables 非空时不触发）——代价 ≤1 retry，与无继承持平
- INTERPRETATION 失败后快照已取——不影响下轮正确性（EXECUTION 兜底）
- 多表噪声（前轮 search 候选全部继承）——critic 正向检查，噪声无害

## 验收标准

- Follow-up 复用前轮表：zero retry（0 次额外 LLM 调用超出全新问题首次搜索命中的情况）
- Follow-up 需不同表：不 bias（model 正常 search + 选表，继承表不干扰）
- Stale 保护：表 drop/rename → EXECUTION 报错 → 已有 fallback 机制处理，不死循环
- 性能：无 measurable latency regression（继承逻辑 O(1)）
- 可观测性：inheritance miss 时有 structured log 可供分析 N 是否需要扩展

## 依据

- G-DA4 symmetric fix（2026-08-27）：closes dead-loop，surfaces 这个余留 inefficiency
- `resetQuestionScoped`（phase-gate.ts:851-907）：清空点
- `forcedLoad` backstop（phase-gate.ts:249）：现有的 understanding 空候选兜底
- generation gate（phase-gate.ts:760）：`definition_loaded` 检查
- critic fail-open（nl2sql-engine/src/critic.ts:194,220）：`partitionCols.size > 0` / `eventParams.size > 0` 条件
- session `e078a87b`：实测 follow-up search miss 导致 4 次 retry（fix 前）/ 1 次 retry（fix 后预期）
- rbi：multi-turn 设计无明确"表继承"规范（空白区域，需新设计）

## Out of scope

- Search 质量本身的改进（embedding、同义词扩展等 → D2e/D2f/D2g 系列）
- `forcedLoad` 触发条件精化（现仅 understanding 结束时候选空→触发；扩展触发可作独立 sub-item）
- 跨 session 的表记忆（不在 phase-gate 范围内）
- 继承范围扩展到 N > 1（待可观测性数据支撑后独立决策）

## 关联

- [G-DA4 symmetric fix](G-DA4-event-table-name-grounding.md)（resolved 2026-08-25；本 fix 的 `load_table_definition` 对称补丁=前置）
- [P-DA4b scope-routing](P-DA4b-phase-gate-scope-dynamic.md)（scope 切换与继承的交互——决策 #6 要求 scope 切换清空继承）
- [D2h corpus term-only selectable topk](D2h-corpus-term-only-selectable-topk.md)（search top_k 策略相关）
- [P7b phase-gate hardening](../phase-3/P7b-phase-gate-hardening.md)（phase-gate 整体生产硬化）
