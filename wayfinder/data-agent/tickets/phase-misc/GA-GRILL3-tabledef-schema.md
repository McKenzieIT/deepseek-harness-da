# GA-GRILL3 — TableDefinition schema 去 K11/MaxCompute/中文默认（先 grilling 再开票）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: **Grilled**（2026-09-01）→ 产出 GA-EXP1 实验票
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) — H3 · **high**
**Grilling prompt**: [research/grill-3-schema.md](../../research/grill-3-schema.md)

**Question**: TableDefinition schema + sync-write 生成器如何去 K11/MaxCompute/中文默认？候选 A（kind enum 扩充 ods/entity/flat + engine 默认空 + freshness 加 locale-neutral token）/ B（kind 开放字符串 + freshness 自由文本）/ C（闭集 + connector 显式 PK/label hint + canonicalizeType）。

**Background**: types.ts:270 默认 engine='maxcompute'；:278 kind enum ['dws','dim'] 闭集默认 'dws'（无 ods）；:283 freshness enum ['静态参考','T+1',''] 拒英文；io.ts generateTableYaml/generateDimYaml 省略 engine→继承 maxcompute；_id/_name 后缀启发式；inferRole 只认 MaxCompute 大写类型（不认 PG text/Snowflake NUMBER）。裸 metastore 导入静默错。

## Grilling 决策记录（2026-09-01）

| ID | 决策 | 理由 |
|---|---|---|
| D1 | enrichment 解耦 kind——inventory 路由改用 `primary_key.length > 0` | kind 身兼分类+路由双职；解耦后 kind 退化为纯标签，enrichment 路由不再依赖 kind 值 |
| D2 | K11 是雪花模型——dim→dim 关系必须参与 enrichment | 代码证据：dim_charm_info 有 fragment_id 指向另一张 dim；当前 enrichment.ts:311 `kind==='dim'` continue 跳过全部 |
| D3 | enrichment-ontology 结合深度由实验决定（A 解耦/B 读图/C 图迭代） | 三层级理论都有价值，用 γ+α 混合实验方法验证 |
| D4 | 两层并行——kind 闭集 enum（校验+UI）+ toPromptContext 自动推断富文本摘要（LLM） | kind enum 不承载"给 LLM 足够信息"的压力；LLM 从结构推断获得更丰富上下文 |
| D5 | **架构转向**：LLM-driven 推断为主、启发式为 fallback | sync-write 只写最小骨架；PK/role/kind/label/freshness 全部由 enrichment 的 LLM+tool+guard 流程推断；与 G3 AI-native enrichment 路线一致 |

**产出**：[GA-EXP1 实验票](GA-EXP1-llm-driven-inference-experiment.md)（4 阶段：ground truth → 推断准确率 → ontology 结合 → 端到端 eval）

**Key files**: packages/data/semantic-layer/src/{types.ts:270,278,283,288,io.ts:498,525,545,559,655}; packages/data/schema-gateway/src/index.ts; packages/data/tool-load-table-definition/src/
