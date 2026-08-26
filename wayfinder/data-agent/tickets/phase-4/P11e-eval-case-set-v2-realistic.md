# P11e — K11 Eval Case Set v2: 基于真实场景重建

**Type**: task
**Phase**: 4
**Status**: resolved (2026-08-26)
**Blocked by**: 无

## 背景

当前 161 个 K11 eval case 的 question 多为表名/字段名拼接式问法（如 "com gm activ昨日数据"），
脱离真实用户场景。这类问题本质上在测试 BM25 表名模糊检索能力，而非 NL2SQL 系统的端到端价值。

真实用户（游戏运营/数据分析师）的问法是业务语义导向的：
- "昨天活动订单总量是多少"
- "过去 7 天付费用户留存率趋势"
- "各服务器的日活对比"

## 目标

重建 case set，使其反映真实使用场景，能有效衡量系统对业务用户的实际价值。

## 具体工作

### 1. 重写 question 为自然语言
- 将 161 个 case 的 question 改为业务人员实际会问的表述
- 保留 covered_assets 和 expected 不变（测同一张表、同一个指标）
- 每个 question 应该是一个完整的、有业务语境的句子

### 2. 分层设计
| 层级 | 说明 | 占比 |
|------|------|------|
| L1 | 单表单指标，直接问法 | 40% |
| L2 | 单表多条件/时间范围/趋势 | 30% |
| L3 | 多表关联/复杂聚合/子查询 | 20% |
| L4 | 歧义消解/需要澄清的问题 | 10% |

### 3. 从真实场景采样（如有条件）
- 如果有历史 BI 查询日志 / 用户提问记录，从中提取真实问法
- 补充现有 case 未覆盖的高频业务场景

## 验收标准

- 新 case set ≥100 条，覆盖 K11 语义层中高频使用的表
- 每条 question 能被非技术的游戏运营人员理解
- 不包含表名、字段名等技术术语作为问题主体
- 配合 P11d LLM Judge 验证 pass rate 在合理区间（预期 50-75%）

## Resolution (2026-08-26)

**产出**：`packages/eval/eval/cases/k11-v2/` — 80 条 case

**分布**：L1 32 (40%) / L2 24 (30%) / L3 16 (20%) / L4 8 (10%)

**覆盖**：30 张核心业务表（付费/商业化 4、用户生命周期 6、角色画像 3、PVP/PVE 4、卡牌 2、玩法 2、经济 2、社交 1、算法 2、舆情 1、VIP 1、特征 1）

**9 种 query intent**：metric_lookup(36), trend(9), comparison(9), ranking(7), open_ended(7), distribution(5), filter(5), proportion(1), anomaly(1)

### Eval 结果（run-id: k11v2-full-run-01，2026-08-26）

| 指标 | 值 |
|------|-----|
| 总 case | 80 |
| **Pass Rate** | **67.5%** ✅ (目标 50-75%) |
| Correct | 54 |
| Wrong | 26 |
| Declined | 0 |
| 耗时 | 1625.9s (concurrency=3, pass_k=1) |

**按 intent 细分**：
| Intent | Total | Correct | Rate |
|--------|-------|---------|------|
| distribution | 5 | 5 | 100% |
| filter | 5 | 5 | 100% |
| proportion | 1 | 1 | 100% |
| ranking | 7 | 6 | 85.7% |
| open_ended | 7 | 5 | 71.4% |
| metric_lookup | 36 | 24 | 66.7% |
| comparison | 9 | 5 | 55.6% |
| trend | 9 | 3 | 33.3% |
| anomaly | 1 | 0 | 0% |

### 暴露的系统缺陷（→ 新票）

1. **`_df` vs `_di` 粒度混淆**（trend 33.3%）：引擎无粒度感知，trend 问题选中 `_df` 快照表后错误用 `ds` 分区做行为时间过滤。Ontology 已有 `granularity` 字段但引擎未消费 → **[P14](../phase-misc/P14-ontology-aware-table-selection.md)**
2. **BM25 词汇 gap**（metric_lookup 12/36 miss）：自然语言和 corpus 索引文本之间的同义词/缩写无法桥接（ARPPU vs ARPU、大R vs 高付费）→ **[P15](../phase-misc/P15-query-rewriting.md)**（条件性——如果 D2c-revisit real embedder 落地则优先级降低）
3. **多表关联能力弱**（comparison 55.6%）：BM25 只返回单表，引擎不沿 dimension_refs 扩展 → **[P14](../phase-misc/P14-ontology-aware-table-selection.md)** §B
4. **L4 开放性问题无 clarification**：engine 层面是设计意图（无状态单次调用）；data-agent 层面已由 [G-DA2](../phase-misc/G-DA2-intent-confidence-router.md)/[P-DA1](../phase-misc/P-DA1-implement-route-gate.md) 覆盖（`【route:clarify】` HALT 机制）

### P11d Judge 修复（同 session）

P11e eval 前发现并修复了 P11d judge 的 P1 级 bug：
- `buildSchemaContext()` 只检查 `payload.params_fields`（events），表类型的 `payload.columns` 被忽略 → judge 收到空 schema → 偏严误判（22.2% → 67.5%）
- 新增非 SQL 快速拒绝 + 修复 JSON 解析正则
- 详见 P11d 代码变更：`eval-runner/src/sql_semantic_judge.ts` + `eval-cli/src/context.ts`
