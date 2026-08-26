# P15 — Query Rewriting（查询侧语义扩展）

**Type**: grilling（需先讨论必要性和优先级——如果 real embedder 落地则可能不需要）
**Phase**: misc（retrieval 增强；D2 lineage）
**Status**: open
**Blocked by**: 无（可独立实现；但建议等 D2c-revisit real embedder 评估后再决定优先级）

## Question

当前 BM25 检索是 **query-as-is** 模式：用户原始问题直接作为 BM25 query 去匹配 corpus。当用户用业务口语（"ARPPU是多少"、"大R流失了多少"）而 corpus 索引中对应文本是技术描述（"累计付费账号ARPU"、"高付费标签角色流失预测"）时，BM25 的词汇匹配无法桥接。

D2e/D2f 做了**索引侧增强**（把 terminology slang 打包进 corpus description），但这是单向的：
- ✅ corpus 里有"充值" → 用户问"充值"能匹配
- ❌ 用户说"ARPPU" → corpus 里是"ARPU"/"人均付费" → 不匹配（slang 映射方向相反）

**Query rewriting** 是**查询侧增强**：在 BM25 检索前，将用户问题扩展/改写为包含更多匹配 token 的形式。

## P11e 暴露的具体 miss case

| 用户问题 | corpus 中的匹配词 | BM25 结果 |
|----------|-------------------|-----------|
| "ARPPU是多少" | "累计付费账号ARPU"、"arppu_std" | miss（ARPPU vs ARPU tokenize 不同） |
| "商店总购买次数" | "付费商店购买明细表"、"recharge_shop_buy" | miss（"购买次数" vs "购买明细"） |
| "大R玩家" | "大R付费账号数"、"big_r_user_cnt_acc" | miss（"大R玩家" vs "大R付费账号"） |
| "满级卡牌" | "卡牌培养状态总表"、"progression_card" | miss（"满级" 在 corpus 中无对应 token） |

## 与 real embedder 的关系（优先级讨论点）

D2c-revisit 明确说：BM25-only 的 cheap-fix ceiling 是 ~58%（enriched corpus），剩余 ~30pp gap 需要 semantic embedding 来桥接同义词。

**如果 real embedder 落地**：
- embedding 天然桥接 "ARPPU" ↔ "人均付费"、"大R" ↔ "高付费"
- query rewriting 变成冗余（embedding 已覆盖其 value）
- 优先级大幅降低

**如果 real embedder 短期无法落地**（user-ops-blocked、intranet 部署复杂）：
- query rewriting 是成本最低的止血方案
- 一次轻量 LLM 调用（小模型 / few-shot）做 query expansion
- 预估收益：在 P11e 的 12 个 metric_lookup miss 中，约 6-8 个可通过 query rewriting 修复

## 可能的实现形态（待 grill）

### A. 基于 terminology 的规则改写
- 读取 `terminology.yaml` 的 slang→event 映射，**反向**建立 alias→keywords 字典
- query time 检测用户问题中的 alias，扩展为对应的 corpus 友好 token
- 优点：零 LLM 调用，确定性
- 缺点：覆盖范围受限于 terminology 词条数（当前仅 15/1966 event 有映射）

### B. LLM query expansion
- 用小模型（如 qwen3-1.7b-instruct）将用户问题改写为"搜索友好"形式
- Prompt: "将以下业务问题改写为包含数据表/字段技术术语的搜索 query：{question}"
- 优点：覆盖范围广，能处理任意口语
- 缺点：额外一次 LLM 调用（~1-3s 延迟 + token 成本）

### C. 同义词字典 + BM25 query expansion
- 手工/自动构建业务同义词表（ARPPU→人均付费/ARPU，大R→高付费/高消费）
- BM25 query time 用同义词扩展 query tokens
- 优点：确定性 + 精准控制
- 缺点：维护成本高，覆盖有限

## 实现位置

- nl2sql-engine 的 BM25 linking 步骤之前（`engine.ts` 中 `Bm25Linker.link(question)` 调用前加 rewrite 步骤）
- 或 eval-cli 的 `Nl2sqlAgentResponder.respond()` 中 `new Bm25Linker(corpus)` → `linker.link(rewrittenQuestion)`

## 依据

- **P11e eval**（k11v2-full-run-01）：metric_lookup 36 case 中 12 个 fail（33%），其中约 6-8 个是 BM25 词汇 gap 导致
- **D2d 证据**：params+terminology enriched corpus BM25-only ceiling = 54.8%，剩余 gap 是 CJK synonym（人气≈活跃、消费≈付费）
- **D2e Resolution**：term-only variant 在真实 default 上 64.5%（noise）但跨 tokenizer 不稳健，说明 terminology 方向有潜力但实现需更 robust

## 关联

- [D2e](D2e-corpus-enrichment.md) / [D2f](D2f-activate-corpus-enrichment.md)：索引侧增强（已 shipped）；本票是查询侧增强
- [D2c-revisit](D2c-revisit-regress-reeval.md)：real embedder（被 user-ops blocked）；如果解锁则本票优先级降低
- [P14](P14-ontology-aware-table-selection.md)：post-retrieval 优化（选表 + 扩展）；本票是 pre-retrieval 优化（query 质量）
- [P11e](../phase-4/P11e-eval-case-set-v2-realistic.md)：eval 暴露此缺陷

## Out of scope

- Real embedder 部署（→ D2c-revisit）
- Ontology 消费 / 粒度感知（→ P14）
- Clarification（→ G-DA2/P-DA1 已 resolved）
