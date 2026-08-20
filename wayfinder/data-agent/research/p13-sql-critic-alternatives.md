# P13 NL→SQL 引擎 — sqlglot AST critic 替代方案调研

> 调研对象：sqlglot AST critic 被 drop 后（无 TS 等价；RBI 用 `_DIALECT='hive'` 代理 MaxCompute），P13 填 P7 GENERATION `sql_syntax_gate` 槽的「真 critic」用什么形态。
> 一手源：RBI `libs/rbi-mcp/src/rbi_mcp/sql_critic.py` + `libs/rbi-semantic/src/rbi_semantic/sql_evaluator.py` + `libs/rbi-agent/src/rbi_agent/data_agent/gates.py` + `phases.py` + deepseek-harness-da `packages/query/query/` + node-sql-parser/Druid/BIRD SOTA/Genie 等 web。
> 约束：TS-only（生成期 critic 不引 Python runtime）· additive-only / reverse-bi 只读源 · G2 已判 eval 判分不用 sqlglot（EXECUTION+DELIVERY）· P13 明确 drop sqlglot critic · per-game 约束域（窄 schema + curated terminology + per-scope domains.yaml）· 执行反馈兜底已定（ODPS 报错→LLM 读错重写→近重复门防重发）。

---

## TL;DR + 推荐

**推荐 = 方案 1（薄 regex 守卫）+ 方案 4（轻量 JSON path 解析）合体**，作为方案 5（执行反馈 self-correction）之上的第一道静态防线；node-sql-parser（方案 3）作为可选 AST 二次校验增强层（不强制）；方案 2（Python sidecar sqlglot）与方案 5（纯执行反馈）**不推荐**（前者违 TS-only hard block，后者放弃 P13 任务目标）。

**一句话理由**：P13 五条约束（TS-only / additive-only / G2 判分不用 sqlglot / drop sqlglot critic / per-game 窄域）下，node-sql-parser 无 MaxCompute 方言、Python sidecar 违 TS-only、纯执行反馈放弃 P13 填 P7 槽职责 → **薄 regex + 轻量 JSON path 解析是 TS 生态下唯一不破约束、能覆盖「GET_JSON_OBJECT 字段∈params」+「表名∈候选」+「ds 分区必带」三项高价值检查**的形态；剩余静态不可见的覆盖缺口（动态拼接路径 / 静默 NULL SQL）交给 ODPS 报错→LLM 重写→近重复门防重发的执行反馈兜底，对齐 BIRD SOTA（R?-SQL / LitE-SQL / DIN-SQL）与 Databricks Genie /fix 路线。

---

## 各方案详析

### 方案 1：薄 regex 守卫 + 执行反馈兜底

**优缺点**
- 优：纯 TS、零依赖、与 RBI `SimpleEvaluator._check_*_regex` fallback 路径同构（`sql_evaluator.py:171-199`）；覆盖 P6 落码计划行（`p6-nl2sql-feasibility.md:185`）列出的全部薄 regex 守卫项（ds 分区必带 / SELECT \* 告警 / 表名∈检索候选 / GET_JSON_OBJECT 字段∈params 字符串匹配）；fail-open 与 RBI 同向。
- 缺：regex 无法理解子句边界（CTE/子查询里的 SELECT \* 也命中）；GET_JSON_OBJECT 字符串匹配对**动态拼接路径**（`'$.user_' || event_type`）**漏判**；case sensitivity 全靠手写正则。

**可行性（TS 生态）**：极高。JS `RegExp` 即 RBI `re` 的对等；RBI 已有完整 regex fallback 实现可作直译参考（`sql_evaluator.py:188-199` `_check_partition_filter_regex`）。无新依赖。

**与约束契合度**：完全契合 — TS-only / additive-only（不读 RBI 源码，重新实现守卫函数）/ G2 判分不用 sqlglot（regex 守卫不参与 EXECUTION+DELIVERY 判分）/ per-game 约束域（窄 schema 让候选表名集合小，regex 命中率高，且可用 `\b...\b` 词边界降低误判）。

**GET_JSON_OBJECT 嵌套($.a.b.c) / 动态拼接路径覆盖**
- 嵌套路径：regex `/GET_JSON_OBJECT\s*\(\s*([^,]+),\s*'([^']+)'\s*\)/gi` 捕获 path 字面量后 `'.'.split` 取**叶子段**（最后一段）作 params 字段校验，能覆盖 `$.a.b.c` → 取 `c` 校验，与 RBI 行为对齐（`sql_critic.py:481` 取 last key）。中间段不校验。
- 动态拼接路径：regex 无法可靠抽取 `'$.user_' || event_type` 的最终字段名 → 漏判；交给执行反馈兜底（ODPS 若字段不存在返回 NULL/报错 → LLM 读错重写）。

**与执行反馈配合**：互补。薄守卫拦「字段名打错、表名编造、缺分区」这类**静态可见硬错**；执行反馈拦「SQL 语法合法但语义错、动态路径错、列类型不匹配」这类**静态不可见错**。

**与 P7 sql_syntax_gate 槽适配**：高。P7 笔记（`p7-four-phase-fit-to-da.md:286`）明确 GENERATION gate 放 `agent/turn-stopping`；本方案作为 P7 STUB 之外的 P13 真 critic 在同一 hook 点检查 phase 最终文本，返回 `GateResult(passed, reason)` 与 P7 接口同形（`phases.py:33` GateResult dataclass）。

**残余风险**
- regex 误判（关键字大小写、字符串字面量内含 SQL 关键字）→ 用 case-insensitive + 词边界（同 RBI `_check_partition_filter_regex` 的 `\b...\b`）。
- 漏判动态路径 → 执行反馈兜底，但首次重发消耗 ODPS 配额（`phases.py:124` `max_executions_per_turn=8` 上限）。

### 方案 2：Python sidecar sqlglot critic（hive 代理）

**优缺点**
- 优：直接复用 RBI `sql_critic.critique_sql` 全套 AST 检查（SELECT/WHERE/JOIN/GROUP_BY/ORDER_BY/JSON_PATH 六 clause），覆盖最完整（`sql_critic.py:73-96` + `_check_json_paths` 用 `exp.JSONExtractScalar` 原生支持嵌套 JSONPath AST，`sql_critic.py:429-490`）。判罚等级与 RBI 一致（列不在语义层=error；DSL↔SQL 分歧=warning；SELECT \*/缺分区=warning，`sql_critic.py:228-244, :311, :408-410`）。
- 缺：**违 TS-only 约束**（生成期 critic 引 Python runtime）；sidecar 进程管理 + IPC 序列化可靠性顾虑（参考 `g4-sidecar-reliability.md`）；hive 是 MaxCompute 代理（与 RBI 同等不精确，`sql_critic.py:19`）—— **不比方案 1 更准**，只多了 AST 子句级检查。

**可行性（TS 生态）**：低。需起 Python subprocess + jsonrpc/stdio 协议。deepseek-harness-da `packages/query/query-maxcompute` 已有 sidecar 模式（`types.ts:26-27` `mode='fast'|'slow'|'blocking'|'fail'`），可借同 sidecar 框架。但**生成期 critic 起独立 Python 子进程 ≠ 执行期 sidecar**：critic 须在 SQL 提交 ODPS 前同步完成（生成期 turn-stopping 串行），子进程冷启动延迟（百 ms 量级）影响 turn-stopping 检查点响应。

**与约束契合度**：违 TS-only（生成期）。G2 已判「eval 判分不用 sqlglot」即承认 sqlglot 不该出现在 EVAL/DELIVERY；但 P13 是 GENERATION 期 critic，约束明写「生成期 critic 不引 Python runtime」—— 直接矛盾。**不可用**。

**GET_JSON_OBJECT 嵌套 / 动态拼接路径覆盖**：完整（AST 级 JSONPathKey 遍历）；动态拼接路径仍漏判（sqlglot 也无法静态推断 `'$.user_' || event_type` 的运行时拼接值，`sql_critic.py:481` 只对 `exp.JSONPath` 字面量做检查）。

**与执行反馈配合**：与方案 1 同（critic fail-open + 执行反馈兜底）。

**与 P7 sql_syntax_gate 槽适配**：违约束不可入 P13 槽。

**残余风险**：约束矛盾是 hard block；若未来 harness 放宽允许 Python sidecar（`p6-nl2sql-feasibility.md:176` 已列为「演进余地」），可作 P14+ 升级项。

### 方案 3：node-sql-parser（TS）做 AST critic

**优缺点**
- 优：纯 TS、npm 包（`node-sql-parser`）、有 Hive 方言（GitHub README supported database list: Athena / BigQuery / DB2 / **Hive** / MariaDB / MySQL / PostgresQL / Redshift / Sqlite / TransactSQL / FlinkSQL / Snowflake(alpha) / Noql —— https://github.com/taozhi8833998/node-sql-parser）；**Hive 即 RBI 用的 MaxCompute 代理方言**（`sql_critic.py:19` `_DIALECT = "hive"`），方言对齐；AST + tableList + columnList 输出可直接做表名校验（同 RBI `_check_table_names` `sql_critic.py:118-141`）。
- 缺：**无 MaxCompute/ODPS 方言**（与 sqlglot 同等不精确，与方案 1 平级）；README 自述 "Parse **simple** SQL statements"（https://github.com/taozhi8833998/node-sql-parser）—— 复杂 SQL（多层 CTE / 窗口函数嵌套 / LATERAL VIEW JSON_TUPLE）解析失败率高于 sqlglot；**GET_JSON_OBJECT 在 node-sql-parser 里是 generic function call**，不是 sqlglot 那种 `exp.JSONExtractScalar + exp.JSONPath + exp.JSONPathKey` 专门 AST 节点（`sql_critic.py:431` `_check_json_paths` 依赖这三类节点）—— 须手写 walk function-call args + 字符串 path 二次解析，**等于在 node-sql-parser 之上再实现方案 4 的 JSON path 解析**，未能省工。

**可行性（TS 生态）**：中。包成熟、weekly downloads 大、维护活跃（README 标 2026-04-08 update）。但「simple SQL」自承限制 + 缺 MaxCompute 方言，让其在 P13 约束域内不比方案 1+4 合体强。可考虑作为方案 1 的增强层（regex 守卫 fail-open 后用 node-sql-parser 二次 AST 校验，类似 RBI `SimpleEvaluator` 的 AST+regex 双轨，`sql_evaluator.py:73-83`）。

**与约束契合度**：契合 TS-only / additive-only / G2 判分不用 sqlglot（node-sql-parser ≠ sqlglot）。但**新增重依赖**（750K UMD 全方言 / 150K 单方言），与 deepseek-harness-da 现有依赖结构（无 SQL parser dep，已查 `pnpm-lock.yaml` 零命中 `node-sql-parser|sql-parser-cst|@dataplastiq|druid`）不一致。

**GET_JSON_OBJECT 嵌套 / 动态拼接路径覆盖**：嵌套路径同方案 1（手写字符串 path 解析取叶子段）；动态拼接路径漏判同方案 1。**比方案 1 不强**。

**与执行反馈配合**：同方案 1（AST 校验 fail-open + 执行反馈兜底）。

**与 P7 sql_syntax_gate 槽适配**：可作 `agent/turn-stopping` 上 phase 输出检查。但 P7 笔记（`p7-four-phase-fit-to-da.md:493`）明确 P13 完整 critic 是「未解」STUB，方案 3 提供的 AST 能力介于方案 1 薄守卫与方案 2 全量 sqlglot 之间。

**残余风险**
- 「simple SQL」限制下复杂查询解析失败 → 须 fail-open（解析失败放行给执行反馈），但 fail-open 比例高时等于退化成方案 1。
- node-sql-parser 维护者单一（taozhi8833998），bus factor 风险。
- 包体积（750K 全方言 / 150K 单方言）影响 cold start。

### 方案 4：轻量 JSON path 解析（GET_JSON_OBJECT $.a.b.c 嵌套，纯 TS）

**优缺点**
- 优：纯 TS、零依赖、**精确解决 P6 笔记（`p6-nl2sql-feasibility.md:192`）点名的 GET_JSON_OBJECT 静态 critic drop 漏判风险**（"sqlglot 静态 critic 的 drop 意味着 GET_JSON_OBJECT 字段名校验从 AST 降为字符串匹配——漏判风险（嵌套/动态路径）；执行反馈兜底"）；解析 `'$.a.b.c'` 字面量取叶子段 `c` 与 RBI `_check_json_paths` 行为对齐（`sql_critic.py:481` 取 last key）。
- 缺：仍只能处理**字面量 path 参数**（`GET_JSON_OBJECT(params, '$.vip_level')`）；动态拼接路径（`'$.user_' || event_type`、子查询产出的 path）静态不可解。需识别字符串字面量边界（注意 SQL 字符串转义 `''` 双单引号、`\.` 转义点号，参考 Hive JSON 解析踩坑 https://blog.csdn.net/weixin_38166905/article/details/99919286）。

**可行性（TS 生态）**：极高。JSONPath 字面量解析是 ~30 行 TS 代码（正则抽 path 字面量 + split 取段）。可作方案 1 的子模块。

**与约束契合度**：完全契合（TS-only / additive-only / 不参与 G2 判分 / per-game 域内 params 字段集小，命中率高）。

**GET_JSON_OBJECT 嵌套 / 动态拼接路径覆盖**
- 嵌套路径覆盖：✅ `$.a.b.c` → 取 `c` 校验是否在 event_params 集合中（与 RBI `sql_critic.py:481` 取 last key 一致）；若 per-scope domains.yaml 提供完整嵌套 params schema（中间段也校验），可扩展取全段。
- 动态拼接路径覆盖：❌ 静态不可解；执行反馈兜底（ODPS 报 NULL 或字段不存在错 → LLM 重写）。

**与执行反馈配合**：与方案 1 同（静态前置 + 执行反馈兜底）。

**与 P7 sql_syntax_gate 槽适配**：高。作为方案 1 的子模块挂在同一 `agent/turn-stopping` hook 上。

**残余风险**
- 字面量识别边界错误（SQL 转义 `''` / `\.`）→ 解析出的 path 错 → 误判；用 fail-open（识别失败放行给执行反馈）。
- per-scope domains.yaml 的 params schema 若不维护嵌套结构，仍只能校验叶子段 → 中间段错字段漏判。

### 方案 5：纯执行反馈（drop 静态 critic，全靠 ODPS 报错→重写）

**优缺点**
- 优：极简、零依赖、零 TS 代码、与 BIRD SOTA 路线一致：R?-SQL 75.03% BIRD execution accuracy（https://www.163.com/dy/article/KSU27Q0T05118UGF.html）；LitE-SQL "向量查 schema + 执行反馈自修正直接封神" BIRD 72.10% / Spider 88.45%（https://blog.csdn.net/u013524655/article/details/153812478）；DIN-SQL Self-correction Module NeurIPS 2023, BIRD 55.9%（https://zhuanlan.zhihu.com/p/689157745）；思维SQL "动态错误修正" vs "仅依赖基于执行的静态修正" 对比（https://blog.csdn.net/u013524655/article/details/151952182）；与 Databricks Genie Code `/fix` "提議修復差異視圖中的任何程式錯誤"（https://learn.microsoft.com/zh-tw/azure/databricks/notebooks/code-assistant）形态对齐。
- 缺：**首次重发消耗 ODPS 配额**（`phases.py:124` `max_executions_per_turn=8` 限制下，每次动态路径错都吃一次预算）；**漏判无害但合法的 SQL**（如 `GET_JSON_OBJECT(params, '$.vip_level')` 实际字段是 `vipLevel`，ODPS 返回 NULL 不报错 → 静默错答案，self-correction 不触发）；**LLM 读错重写依赖 prompt 质量**（ReFoRCE 指出"自我改进能力弱"是 LLM 弱点，https://blog.csdn.net/u013524655/article/details/146107019）。

**可行性（TS 生态）**：极高（零代码）。

**与约束契合度**：完全契合 TS-only。但 P6 笔记（`p6-nl2sql-feasibility.md:158-159`）推荐路径是「执行反馈重试 loop + 薄 regex 守卫，**drop** sqlglot AST」—— 即**方案 1+5 合体**，而非纯方案 5。纯方案 5 = 放弃 P13 填 P7 sql_syntax_gate 槽的职责（P7 槽空着），与任务目标矛盾。

**GET_JSON_OBJECT 嵌套 / 动态拼接路径覆盖**：❌ 完全无静态覆盖；NULL 静默返回不触发 self-correction；动态拼接路径错也只在 ODPS 报错时触发。

**与执行反馈配合**：本身即执行反馈。

**与 P7 sql_syntax_gate 槽适配**：❌ P7 槽空置，违 P13 任务目标。

**残余风险**：ODPS 报错未触发 self-correction 的 SQL（静默 NULL）直接出错误答案给用户；`max_executions_per_turn=8` 耗尽后 honest_decline。

### 方案 6：其他 TS 生态 SQL parser/critic/lint

候选：
- **sql-parser-cst (juffle)**：现代 TS SQL parser，但方言覆盖窄（MySQL / PostgreSQL 为主），无 Hive / MaxCompute，比 node-sql-parser 弱。
- **@dataplastiq/sql-parser**：受限。
- **alibaba/druid**：Java（**非 TS**），唯一原生支持 ODPS SQL parser 的开源项目（GitHub releases "改进ODPS SQL parser" — https://github.com/alibaba/druid/releases ），但 Java 不可入 TS-only 生成期 critic。wenshao/sql-dialects maxcompute.md（https://github.com/wenshao/sql-dialects/blob/main/dml/insert/maxcompute.md）仅 markdown 方言对比文档，非 parser。
- **Prisma engine**：ORM 不是 SQL critic/lint，方言限定 PgSQL/MySQL/SQLServer/SQLite/MongoDB，无 MaxCompute。

**可行性**：均不优于方案 3 node-sql-parser（已有 Hive 方言）。alibaba/druid 是 TS-only 约束下的 hard block（Java）。

---

## 各方案优缺点对比表

| 方案 | 优 | 缺 | TS 可行 | 与约束契合 | GET_JSON 嵌套 | 动态路径 | 与执行反馈 | P7 槽适配 | 残余风险 |
|---|---|---|---|---|---|---|---|---|---|
| 1 薄 regex 守卫 | 纯 TS / 零依赖 / 与 RBI regex fallback 同构 | 子句边界弱 / 动态路径漏判 | 极高 | **完全** | ✅ 取叶子段 | ❌ → 反馈兜底 | 互补 | 高 | regex 误判 / 漏判吃 ODPS 配额 |
| 2 Python sidecar sqlglot | 全 AST 检查最完整 | **违 TS-only** / 子进程延迟 | 低 | ❌ 矛盾 | ✅ AST 级 | ❌ 同 sqlglot | 同 1 | ❌ 不可入 | 约束矛盾 hard block |
| 3 node-sql-parser | 纯 TS / 有 Hive 方言 / 包成熟 | 无 MaxCompute / simple SQL / GET_JSON_OBJECT 是 generic function call | 中 | 契合但重依赖 | 同方案 1 手写 | 同方案 1 | 同 1 | 中 | 解析失败率高退化方案 1 / 包大 |
| 4 轻量 JSON path 解析 | 精确解决 GET_JSON 嵌套漏判 / 零依赖 | 仅字面量 path / 转义边界 | 极高 | **完全** | ✅ | ❌ → 反馈兜底 | 同 1 | 高 | 字面量识别错 → fail-open |
| 5 纯执行反馈 | 极简 / 对齐 BIRD SOTA + Genie /fix | 漏判静默 NULL SQL / 吃 ODPS 配额 / P7 槽空置 | 极高 | 契合但放弃 P13 目标 | ❌ | ❌ | 本身即反馈 | ❌ 空置 | 静默错答 / 配额耗尽 honest_decline |
| 6 其他 TS parser | (无优于方案 3) | druid 是 Java / sql-parser-cst 无 Hive | 中-低 | 弱 | 视实现 | 视实现 | 同 1 | 低-中 | 均不优于方案 3 |

---

## 推荐方案 + 理由 + 残余风险声明 + 执行反馈如何兜底

### 推荐：方案 1（薄 regex 守卫）+ 方案 4（轻量 JSON path 解析）合体，作为方案 5（执行反馈 self-correction）之上的第一道静态防线

**架构**

```
GENERATION phase LLM 输出 SQL
  → agent/turn-stopping serial 检查点（p7-four-phase-fit-to-da.md:286）
    → P13 critic (TS, additive)：
        (a) extract_sql_candidate（剥围栏，复刻 RBI gates.py:53 extract_sql_candidate 语义）
        (b) 薄 regex 守卫：
            - _check_partition_filter（ds/dt 必带，复刻 sql_evaluator.py:188 _check_partition_filter_regex）
            - _check_select_star（SELECT * 告警，复刻 sql_evaluator.py:171 _check_select_star_regex）
            - _check_table_names_in_candidates（FROM/JOIN 表名 ∈ search_data_sources 候选，字符串匹配，复刻 sql_critic.py:118 _check_table_names 语义降级为 regex）
            - _check_get_json_object_paths（方案 4：GET_JSON_OBJECT 字面量 path 取叶子段 ∈ event_params，复刻 sql_critic.py:429 _check_json_paths 语义降级为字符串解析）
        (c) 判罚映射（与 RBI 同向）：
            - 表名∉候选 / 列∉语义层 = error → GateResult(passed=False)
            - SELECT * / 缺分区 / DSL↔SQL 分歧 = warning → GateResult(passed=True) + feedback 注入
            - 解析失败 / 识别失败 = fail-open → GateResult(passed=True)
    → GateResult(passed) → 推进 phase / retry 回 GENERATION / fallback UNDERSTANDING
  → EXECUTION phase ctx.query.execute(SQL) ← 同一份 SQL（F2 同源约束，p7-four-phase-fit-to-da.md:526-528）
    → ODPS 报错（执行反馈）→ LLM 读错重写 → 近重复门防重发 → 回 GENERATION
```

**理由**
1. **约束契合**：TS-only / additive-only（不读 RBI，重新实现 regex 守卫）/ G2 判分不用 sqlglot（regex 守卫不参与 EVAL/DELIVERY 判分）/ P13 明确 drop sqlglot（regex 是 sqlglot 的降级，非替代品，无 Python 依赖）/ per-game 约束域 —— 五条约束全满足。
2. **覆盖对齐 RBI 静态 critic 的核心检查**：P6 落码计划行（`p6-nl2sql-feasibility.md:185`）列出的全部薄 regex 守卫项均覆盖。
3. **GET_JSON_OBJECT 嵌套覆盖**：方案 4 的字符串 path 解析取叶子段，对齐 RBI `sql_critic.py:481` 的 last-key 行为。动态拼接路径漏判由执行反馈兜底。
4. **执行反馈兜底**：对齐 BIRD SOTA（R?-SQL 75.03% / LitE-SQL 72.10% / DIN-SQL 55.9% 全部依赖执行反馈 self-correction）+ Databricks Genie /fix（LLM 读错重写）+ 任务约束明写的「EXECUTION 期 ODPS 报错→LLM 读错重写→近重复门防重发」。
5. **F2 同源约束**：GENERATION gate 检查的 SQL = EXECUTION 期 ctx.query.execute 收到的 SQL（中间无 `tools/post-execute` 改写），同 RBI `gates.py:53` `extract_sql_candidate` docstring 的「被评审的 SQL 恒等于被执行的 SQL」原则。

**残余风险声明**
1. **动态拼接 GET_JSON_OBJECT 路径漏判**（`'$.user_' || event_type`）：静态不可解，首次重发吃 ODPS 配额（`max_executions_per_turn=8` 上限，`phases.py:124`）；缓解：执行反馈 + 近重复门防重发；若 per-scope domains.yaml 标记此事件 params 为动态字段集，可在 prompt 层禁用动态拼接（per-game 约束域允许此约束）。
2. **静默 NULL SQL 漏判**（`$.vip_level` 实际字段 `vipLevel`，ODPS 返回 NULL 不报错）：方案 4 的字面量 path 校验能拦住此例（`vip_level` ∉ event_params 集合 → error），但若 LLM 写出 params 集合内的错字段（`$.level` 实际想取 `$.vipLevel`，两者都在 params 集）→ 静默错答；缓解：执行反馈 + 用户反馈沉淀（`p6-nl2sql-feasibility.md:176` 演进余地）。
3. **regex 子句边界弱**（CTE/子查询内的 SELECT \* 也命中）：fail-open（warning 不阻塞）+ 执行反馈兜底；与 RBI `sql_evaluator.py` regex fallback 同向（RBI 也有此限制）。
4. **执行反馈 self-correction 上限**：`max_executions_per_turn=8` + `max_llm_calls_per_turn=60`（`phases.py:124,131`）耗尽后 honest_decline（宁拒不错，`phases.py:144` disambiguation_timeout 同向原则）。

**执行反馈如何兜底**
- GENERATION gate（方案 1+4）拦「静态可见硬错」（表名编造 / 字段名打错 / 缺分区 / SELECT \*），fail-open 放行「静态不可见错」；
- EXECUTION 期 `ctx.query.execute` 调 ODPS，ODPS 报错（语法 / 字段不存在 / 类型不匹配 / 资源超限）→ `QueryOutcome.state='failed'` + `error`/`failureKind`（`packages/query/query/src/types.ts:38-41`）→ LLM 读 `error` 文本重写 SQL → 近重复门防重发（同 SQL 哈希拒重试）→ 回 GENERATION；
- 对齐 BIRD-FIXER / Databricks Genie Inspect / DIN-SQL Self-correction / R?-SQL / LitE-SQL 的「执行反馈 self-correction」SOTA 路线（P6 笔记 §3.1/3.2 已 cite）。
- **静默 NULL SQL**（不报错但错答）：执行反馈不触发 → 用户反馈沉淀 + Tier1/2 answer RAG（`p6-nl2sql-feasibility.md:176` 演进余地）兜底，但 P13 scope 内不实现（drop 列入 P6 推荐路径）。

---

## 来源

### RBI 一手源（file:line）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-mcp/src/rbi_mcp/sql_critic.py`
  - :19 `_DIALECT = "hive"` ("MaxCompute closest dialect in sqlglot")
  - :73-96 `critique_sql(sql, dsl, semantic_fields, event_params, candidate_sources)` 主入口
  - :118-141 `_check_table_names`（D19 候选源校验）
  - :228-244 `_check_select`（SELECT \* = warning，列∉语义层 = error）
  - :311 `_check_select_metrics`（DSL↔SQL metric 分歧 = warning）
  - :408-410 `_check_where`（缺分区 = warning）
  - :429-490 `_check_json_paths`（GET_JSON_OBJECT 用 `exp.JSONExtractScalar`/`exp.JSONExtract` + `exp.JSONPath` + `exp.JSONPathKey` AST 节点；:481 取 last key）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-semantic/src/rbi_semantic/sql_evaluator.py`
  - :18 `PARTITION_COLUMNS = frozenset({"ds", "dt", "partition_date", "p_date"})`
  - :25-44 `ast_has_select_star` / `ast_has_partition_filter`（AST + regex 双轨，:36-43 regex fallback）
  - :73-83 `SimpleEvaluator.evaluate`（AST 优先 + regex fallback）
  - :171-199 `_check_*_regex` 系列（regex fallback 实现，方案 1 直译参考）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/gates.py`
  - :18 `_DIALECT = load_conventions(_DEFAULT_ENGINE).get("sqlglot_dialect", "hive")`
  - :53-62 `extract_sql_candidate`（剥围栏，"被评审的 SQL 恒等于被执行的 SQL" docstring）
  - :81-93 `sql_syntax_gate`（空文本拒 + `_looks_like_sql_attempt` 关键字检测 + `sqlglot.parse_one(read=_DIALECT)`）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/phases.py`
  - :33 `GateResult` dataclass（passed + reason）
  - :124 `max_executions_per_turn=8`（T-6 整 turn 执行硬上限）
  - :131 `max_llm_calls_per_turn=60`（T2 R6.1 LLM 调用数硬上限）
  - :144 `disambiguation_timeout_seconds=300.0`（G3 等用户消歧超时降级 honest_decline）
  - :162 `critique_confidence_floor=0.6`
  - :213-218 `GENERATION_TOOLS = {critique_sql_tool, evaluate_sql_quality} ∪ UNIVERSAL`

### deepseek-harness-da 一手源（file:line）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/query/query/src/types.ts`
  - :26-27 `QueryRequest.mode` (PROTOTYPE-ONLY knob, fast/slow/blocking/fail)
  - :38-41 `QueryOutcome.failed` (error + failureKind, semantic/transport)
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/query/query/src/index.ts`
  - :42 `abstract execute(request, signal?): Promise<QueryOutcome>`（EXECUTION 期 engine-wrapper guard chain 入口）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/bundle/data-agent/src/index.ts`（P13 seed，目前仅 `export {}` 占位）
- `/Users/mckenzie/workspace/deepseek-harness-da/pnpm-lock.yaml`（grep `node-sql-parser|sql-parser-cst|@dataplastiq|druid` 零命中 — 无 SQL parser 依赖）

### deepseek-harness-da research notes
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p6-nl2sql-feasibility.md`
  - :12 §1.3 "critique_sql = 预执行静态校验，sqlglot+hive 代理，fail-open，无执行反馈闭环"
  - :48 `sql_critic.py:19` `_DIALECT="hive"` MaxCompute 代理 cite
  - :107 §2 组件 6 SQL critic "sqlglot 无 TS 等价；node-sql-parser 无 MaxCompute 方言；选项：Python sidecar（违 TS-only）/ 薄 regex 守卫 / 弃静态靠执行反馈"
  - :158-159 §4 (B) ship "薄版 regex 守卫：ds 分区必带 / SELECT \* 告警 / 表名∈候选源 / 基本语法，**drop** sqlglot AST"
  - :176 §4 演进余地 "Python sidecar sqlglot critic（若 harness 放宽）"
  - :185 §5 落码组件 6 "薄 regex 守卫（替 sql_critic AST）"
  - :192 §5 风险 "sqlglot 静态 critic 的 drop 意味着 GET_JSON_OBJECT 字段名校验从 AST 降为字符串匹配——漏判风险（嵌套/动态路径）；执行反馈兜底"
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p7-four-phase-fit-to-da.md`
  - :24 GENERATION PhaseConfig table (gate=sql_syntax_gate, max_attempts=5, timeout=60s, fallback=UNDERSTANDING)
  - :31 GENERATION sql_syntax_gate load-bearing 历史 cite (RA-F85)
  - :277-279 §3(a) GENERATION sql_syntax_gate "P7 STUB：sqlglot 独立实现，P13 完整 critic 未就绪"
  - :286 §3(b) GENERATION sql_syntax_gate → `agent/turn-stopping`（phase 输出检查，非 `tools/post-execute`）
  - :493 §5 P13 NL→SQL 引擎未解 → sql_syntax_gate 用 sqlglot 独立实现；`critique_sql_tool`/`evaluate_sql_quality` 工具 STUB
  - :526-528 F2 surfaced：生成期 gate 与执行期 guard chain 须 SQL 同源；缓解 cite `extract_sql_candidate` docstring 「被评审的 SQL 恒等于被执行的 SQL」

### Web URL
- node-sql-parser GitHub README: https://github.com/taozhi8833998/node-sql-parser （supported database list: Athena / BigQuery / DB2 / **Hive** / MariaDB / MySQL / PostgresQL / Redshift / Sqlite / TransactSQL / FlinkSQL / Snowflake(alpha) / Noql；无 MaxCompute/ODPS；README 自述 "Parse **simple** SQL statements"；npm: https://www.npmjs.com/package/node-sql-parser — fetch 时 403，信息以 GitHub README 为准）
- alibaba/druid releases: https://github.com/alibaba/druid/releases （"改进ODPS SQL parser" — Java，非 TS，唯一原生 ODPS SQL parser；release notes 1.2.28 cite 2026-03-10）
- wenshao/sql-dialects maxcompute.md: https://github.com/wenshao/sql-dialects/blob/main/dml/insert/maxcompute.md （方言对比文档，非 parser）
- BIRD SOTA R?-SQL: https://www.163.com/dy/article/KSU27Q0T05118UGF.html （75.03% BIRD execution accuracy，公开规模模型 SOTA）
- LitE-SQL: https://blog.csdn.net/u013524655/article/details/153812478 （"向量查 schema + 执行反馈自修正"，BIRD 72.10% / Spider 88.45%）
- DIN-SQL: https://zhuanlan.zhihu.com/p/689157745 （NeurIPS 2023, Self-correction Module, BIRD 55.9% / Spider 85.3%）
- 思维SQL (SQL-of-Thought): https://blog.csdn.net/u013524655/article/details/151952182 （"仅依赖基于执行的静态修正的系统" vs "动态错误修正机制" 对比）
- ReFoRCE: https://blog.csdn.net/u013524655/article/details/146107019 （"自我改进能力弱"+format restriction+column exploration, Spider 2.0-Snow 31.26 / Spider 2.0-Lite 30.35）
- Databricks Genie Code /fix: https://learn.microsoft.com/zh-tw/azure/databricks/notebooks/code-assistant （"/fix 提議修復差異視圖中的任何程式錯誤"；AI/BI Genie Agents release notes: https://learn.microsoft.com/en-us/azure/databricks/ai-bi/release-notes/2026 ）
- Hive GET_JSON_OBJECT JSONPath 语法: https://blog.csdn.net/m0_46786082/article/details/160372927 （有限 JSONPath：$ 根 / . 嵌套 / [n] 数组索引 / [*] 通配符）
- Hive JSON 解析踩坑（转义 / 动态路径）: https://blog.csdn.net/weixin_38166905/article/details/99919286

### fetch 限制声明
- `https://www.npmjs.com/package/node-sql-parser` 与 `https://github.com/taozhi8833998/node-sql-parser` 经 WebFetch 工具返回 HTTP 403（企业策略或站点拦截）；node-sql-parser 方言列表与「simple SQL」自述引自 WebSearch snippet 中所含 GitHub README 原文（搜索结果项 1 snippet 含完整 supported database list 与 "Parse simple SQL statements" 描述）。
- alibaba/druid ODPS parser 支持引自 GitHub releases notes snippet（搜索结果项 3 release 1.2.28 含 "改进ODPS SQL parser,修复ODPS output issues"）。
- BIRD SOTA 准确率数字引自搜索结果 snippet 中所含原文摘要（R?-SQL 75.03% / LitE-SQL 72.10% / DIN-SQL BIRD 55.9% / Spider 85.3%）。
