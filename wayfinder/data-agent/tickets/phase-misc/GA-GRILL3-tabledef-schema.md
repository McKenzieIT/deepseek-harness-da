# GA-GRILL3 — TableDefinition schema 去 K11/MaxCompute/中文默认（先 grilling 再开票）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open（grill 后转 G 票）
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) — H3 · **high**
**Grilling prompt**: [research/grill-3-schema.md](../../research/grill-3-schema.md)

**Question**: TableDefinition schema + sync-write 生成器如何去 K11/MaxCompute/中文默认？候选 A（kind enum 扩充 ods/entity/flat + engine 默认空 + freshness 加 locale-neutral token）/ B（kind 开放字符串 + freshness 自由文本）/ C（闭集 + connector 显式 PK/label hint + canonicalizeType）。

**Background**: types.ts:270 默认 engine='maxcompute'；:278 kind enum ['dws','dim'] 闭集默认 'dws'（无 ods）；:283 freshness enum ['静态参考','T+1',''] 拒英文；io.ts generateTableYaml/generateDimYaml 省略 engine→继承 maxcompute；_id/_name 后缀启发式；inferRole 只认 MaxCompute 大写类型（不认 PG text/Snowflake NUMBER）。裸 metastore 导入静默错。

**Key files**: packages/data/semantic-layer/src/{types.ts:270,278,283,288,io.ts:498,525,545,559,655}; packages/data/schema-gateway/src/index.ts; packages/data/tool-load-table-definition/src/
