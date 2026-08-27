# G-DA6 — 多轮 follow-up candidate_tables 继承

**Type**: grilling
**Phase**: misc (cross-phase)
**Status**: open, unblocked
**Graduated from**: 2026-08-27 session `e078a87b` 诊断——G-DA4 symmetric fix（`load_table_definition` 加 `candidate_tables`）解决了死循环，但 follow-up 轮次仍需额外 retry（模型须主动调 `load_table_definition` 重新通过 gate）。

## Question

follow-up 问题复用前轮表时，`resetQuestionScoped`（phase-gate.ts:888）清空 `candidate_tables` 导致 understanding 必须重新召回该表。若 search 关键词不精准（如 `top_k=5` + 抽象词"周环比"未召回 `pay_order_di`），generation 需额外一次 `load_table_definition` retry。如何让 follow-up 轮次在 grounding 安全前提下减少这类冗余 retry？

## 现状

- `resetQuestionScoped`（phase-gate.ts:868-907）在每个新用户问题时执行 `candidate_tables.clear()` + `event_params.clear()` + `partition_cols.clear()` + `definition_loaded = false`。
- G-DA4 symmetric fix（2026-08-27）使 `load_table_definition` 的 captureToolData 加表名到 `candidate_tables` → 模型在 generation 重新 load 后可通过 gate（不再死循环）。
- 但 understanding search 未召回前轮表时，模型仍需：understanding（search miss）→ generation（写 SQL → gate fail "no definition loaded"）→ retry（load_table_definition → 通过）= 多一次 LLM 调用。

## 实际观测

**Session `e078a87b`**（2026-08-27, avatar-k11）：
- Turn 1: "过去 7 天的充值金额，按天看" → understanding search 召回 `pay_order_di` → generation → execution → interpretation ✓
- Turn 2: 推荐问题"过去7天充值金额与上7天（8月13日-19日）逐日对比" → understanding search `top_k=5` + "充值金额 周环比 8月13日 8月26日 逐日对比" **未召回** `dws_10000251_pay_order_di`（top 5 里没有）
- Generation 阶段：4 次 retry 死循环（G-DA4 symmetric fix 前）/ 1 次 retry（fix 后预期）
- Fallback → understanding（`top_k=10` + 更具体关键词）→ 召回 → 通过

## 设计空间（待 grill）

| 方案 | 机制 | 优 | 劣 |
|------|------|---|---|
| **(a) 前轮表注入 `candidate_tables`** | `resetQuestionScoped` 保留上一轮成功执行过的表（SQL 通过 EXECUTION 且无 TABLE_NOT_FOUND/FIELD_NOT_FOUND） | 零 retry；简单 | stale risk（表 schema 可能变）；可能 bias 模型复用旧表 |
| **(b) follow-up 轮自动扩 `top_k`** | turn > 1 时 `search_data_sources` 默认 `top_k` 从 5 → 10；或注入前轮表名为搜索关键词 | 不污染 candidate_tables；仍走完整 grounding 路径 | 依赖 search 质量；仍可能 miss |
| **(c) understanding persona 注入前轮表名** | 系统 prompt 加"前轮使用的表: X"；模型自行决定是否 `load_table_definition` | 无 state 污染；灵活 | 依赖 model-following；非确定性 |
| **(d) 带 TTL 的继承** | 保留前轮表标记为 `inherited`；若模型使用 inherited 表但未重新 load 则 log warning；超 N 轮或 schema change 后丢弃 | 平衡 | 状态管理复杂；TTL 策略待定 |

## 子决策（grill 时逐条确认）

1. **继承范围**：只继承前 1 轮？还是前 N 轮？还是当前 session 所有已验证表？
2. **验证条件**：什么条件下的表算"已验证可继承"？（EXECUTION 成功 + 无 TABLE_NOT_FOUND 是否足够？）
3. **stale 保护**：如何防止 inherited 表的 schema 已变（被 rename/drop）？（依赖 EXECUTION 错误检测 + 已有 fallback→understanding 机制是否够？）
4. **bias 风险**：继承是否应该只影响 gate 通过性，不影响 model 选表决策？（即：不在 persona 中提及继承表，只在 critic gate 放行？）
5. **与 scope-routing 交互**：P-DA4b 动态 scope routing 切换后，前轮表可能属于不同 scope —— 继承是否应该限定为同一 scope？

## 验收标准（待 grill 后精化）

- Follow-up 复用前轮表：zero retry（0 次额外 LLM 调用超出全新问题首次搜索命中的情况）
- Follow-up 需不同表：不 bias（model 正常 search + 选表，继承表不干扰）
- Stale 保护：表 drop/rename → EXECUTION 报错 → 已有 fallback 机制处理，不死循环
- 性能：无 measurable latency regression（继承逻辑 O(1)）

## 依据

- G-DA4 symmetric fix（2026-08-27）：closes dead-loop，surfaces 这个余留 inefficiency
- `resetQuestionScoped`（phase-gate.ts:868-907）：清空点
- `forcedLoad` backstop（phase-gate.ts:714-728）：现有的 understanding 空候选兜底
- session `e078a87b`：实测 follow-up search miss 导致 4 次 retry（fix 前）/ 1 次 retry（fix 后预期）
- rbi：multi-turn 设计无明确"表继承"规范（空白区域，需新设计）

## Out of scope

- Search 质量本身的改进（embedding、同义词扩展等 → D2e/D2f/D2g 系列）
- `forcedLoad` 触发条件精化（现仅 understanding 结束时候选空→触发；扩展触发可作独立 sub-item）
- 跨 session 的表记忆（不在 phase-gate 范围内）

## 关联

- [G-DA4 symmetric fix](G-DA4-event-table-name-grounding.md)（resolved 2026-08-25；本 fix 的 `load_table_definition` 对称补丁=前置）
- [P-DA4b scope-routing](P-DA4b-phase-gate-scope-dynamic.md)（scope 切换与继承的交互）
- [D2h corpus term-only selectable topk](D2h-corpus-term-only-selectable-topk.md)（search top_k 策略相关）
- [P7b phase-gate hardening](../phase-3/P7b-phase-gate-hardening.md)（phase-gate 整体生产硬化）
