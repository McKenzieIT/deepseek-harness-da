# Grilling: TableDefinition schema 去 K11/MaxCompute/中文默认

## 决策待压力测试
TableDefinition schema + sync-write 生成器如何去掉 K11/MaxCompute/中文默认，让裸 metastore 导入不静默错？候选：
- **A**. `kind` enum 扩充（加 `ods`/`entity`/`flat`）+ `engine` 默认改空（从 connector 传入）+ `freshness` 加 locale-neutral token。
- **B**. `kind` 改开放字符串（非闭集），未标记导入默认 `ods`；`freshness` 改自由文本 + 呈现层 localize。
- **C**. 保留闭集但接受 connector 显式 PK/label hint（`information_schema.table_constraints`），松动 `_id`/`_name` 启发式；`inferRole` 加 `canonicalizeType`。

## 背景（根因）
`packages/data/semantic-layer/src/types.ts:270` `TableDefinitionSchema` 默认 `engine='maxcompute'`；`:278` `kind` enum `['dws','dim']` 闭集默认 `'dws'`（无 `ods`）；`:283` `freshness` enum `['静态参考','T+1','']` 拒英文；`:288` `superRefine` 要求 dim 表声明 `primary_key`+`label_columns`。`io.ts:498/525/545/548/551/559/560/655` `generateTableYaml`/`generateDimYaml` 省略 `engine` → 每个导入表继承 maxcompute；`_id`→`primary_key`、`_name`→`label_column` 后缀启发式；`inferRole` 只匹配 MaxCompute 大写类型（`BIGINT/INT/DOUBLE/STRING`），不认 PG `text/integer`、Snowflake `NUMBER/VARCHAR`。裸 PG/Hive/Snowflake/ClickHouse metastore 导入（仅表/列名、无 comment、无 kind tag、无 PK）→ 静默错（engine 标错、kind 强制 dws、role 塌成 attribute、freshness 被拒）。

## 影响面 / 约束
- 与 GA-GT2（engine 从 connector 来）、GA-GT3（enrichment inventory 泛化依赖 `kind`）、GA-GRILL2（freshness 中文 enum）耦合。
- 对外部消费者（preset/bundle config/YAML）无需向后兼容（map 常设原则）——可改 schema。
- 内部已验证代码（types.ts）重构扩展非推翻（map G1 决策）。

## 任务（对抗式 grill，不和稀泥）
逼问：A 闭集扩充（加 ods/entity/flat）够覆盖 event-sourced/denormalized OLTP 吗？B 开放字符串是否丢类型安全（检索层类型无关 per R1，但 `kind` 闭集驱动 enrichment 分流——开放后 enrichment 怎么分流）？C connector 显式 PK hint 是否把"裸 metastore"假设打破（information_schema 有 PK，但 Hive metastore 常 PK 缺失）？`_id`/`_name` 启发式去留——去掉会伤 K11 现有 321 表吗（已有数据靠启发式填的 PK）？`canonicalizeType` 的映射表谁维护（MaxCompute↔PG↔Snowflake↔ClickHouse 类型空间）？哪些假设最危险（"kind 二分 dws/dim 够"？"裸 metastore 一定无 PK"）？被忽略选项——**kind 拆成 role+model 双字段**：`role`（transactional/reference/event）+ `model`（star/flat/event-sourced），解耦"是事实表"和"是星型"？逼出可执行方向。

## 可读文件（mcp__local__read_file/grep，路径 /Users/mckenzie/workspace/deepseek-harness-da）
packages/data/semantic-layer/src/{types.ts,io.ts,enrichment.ts,index.ts,kinds/*.ts}; packages/data/schema-gateway/src/index.ts; packages/data/tool-load-table-definition/src/; wayfinder/semantic-layer/map.md（G1 数据模型决策、常设原则）
