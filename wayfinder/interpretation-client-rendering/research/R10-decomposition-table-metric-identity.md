# R10: 查询理解卡「指标口径」网格 与 present_table `kpi_columns` 的数据层 metric 身份互认

> 配套 ticket 见 [../tickets/R10-decomposition-table-metric-identity.md](../tickets/R10-decomposition-table-metric-identity.md);上游卡终版见 [P1](../tickets/P1-decomposition-prototype.md)(焦点行/谱系 chips/常显指标网格/信任带);table 侧见 [T2](../tickets/T2-ui-present-table.md)/[T4](../tickets/T4-present-table-display-upgrade.md);result_id 数据通路见 [R6](./R6-result-store-server-side.md)。本票是 map「查询理解↔table KPI 互认」雾的**语义层**磨清;UX 层(低置信改口径 affordance)归 [P2](../tickets/P2-decomposition-revision-prototype.md)。
> 证据来源:`packages/data/tool-present-decomposition/`(src + README + tests)、`packages/data/tool-present-table/`(src + README + tests)、`packages/client/ui-present-decomposition/src/client/`(DecompositionCard + locales)、`packages/client/ui-present-table/src/client/`(TableCard + locales)。

## 0. 结论速览

1. **两卡 metric 不同源、不共享 `result_id`、无数据层身份对应。** decomposition 的 `metrics` 是纯 LLM 声明的自由文本 `{name, value, unit?}`(value 是"指标表达式/描述",不是计算结果),**无 `result_id` 字段**(全包 grep `result_id` 零命中)。present_table 的 `kpi_columns` 是 LLM 声明的 `{column, aggregation, label, format?}`(column 是数值列索引),但**经 `result_id` 绑定 `query_data` 结果**——KPI 数值由客户端从绑定的结果行实时计算。
2. **身份模型不同,不可映射。** decomposition metric 的身份是 `(name, value)` 自由文本对;table kpi 的身份是 `(result_id, column_index, aggregation)` 三元组。前者无 result_id、无列索引;后者无自由文本表达式。两者唯一的可能联系是 LLM 自撰 label 的字面巧合(都叫 "DAU"),但 label 各自独立生成、无契约保证一致。
3. **客户端无法建立 metric-identity 对应。** decomposition 工具不携带也不回显任何 `result_id`;table 工具携带 `result_id` 但不引用 decomposition。两包 `inject=['tools']` 纯展示,无共享 service seam、无共享 metric id、无交叉引用。
4. **不是"半共享"。** table 的 `kpi_columns` 选用哪些列/聚合是 LLM 声明(argsRaw),但**数值来自 result_id 绑定的 query_data 结果**(`computeKpi(rows, kpi)`,TableCard.tsx:106);decomposition 的 `metrics.value` 是纯文本,**不经任何结果、不计算**。一边数据绑定、一边纯声明——不是同一来源。
5. **结论:无需 metric-link affordance。** 数据层无共享 key 可连;建一座桥跨两份独立 LLM 声明(无 result_id、无 semantic id)脆弱且无依据。map 雾中"是否联动 metric"一问 → **答:不联动,雾关闭**。P2(改口径 affordance)独立存续,不受 R10 阻塞或绑定。

## 1. decomposition 卡的「指标口径」metric 来源

### 1.1 数据工具(`packages/data/tool-present-decomposition/src/index.ts`)

`present_decomposition` 是**纯展示工具**(`inject = ['tools']` 只读,src/index.ts:6),INTERPRETATION 阶段由模型调用,把"自然语言问题理解成什么了"记录为结构化 intent。

- **`Metric` 接口**(src/index.ts:11-15):
  ```typescript
  export interface Metric {
    name: string
    value: string
    unit?: string
  }
  ```
- **`metrics` 是 required 参数(argsRaw)**,定义在 tool parameters 块(src/index.ts:103-115):
  ```typescript
  metrics: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', required: true, description: 'Metric name.' },
        value: { type: 'string', required: true, description: 'Metric expression or description.' },
        unit: { type: 'string', description: 'Optional unit of measurement.' },
      },
    },
    required: true,
    description: 'The metrics (measures) identified in the query.',
  }
  ```
  `value` 的 schema 描述明写 **"Metric expression or description"**——自由文本,不是列引用、不是计算结果。
- **execute 纯透传**(src/index.ts:174-182):`presentDecompositionResult(args.summary, args.metrics as Metric[], ...)` 把 args 原样打包进 result,**无 cache 查询、无 query、无 value 校验**。`presentDecompositionResult`(src/index.ts:28-52)只校验 `summary`/`metrics` 非空与 `confidence` 范围,不碰任何数据源。
- **输出 schema 亦无 `result_id`**(src/index.ts:148-155):`{ presented, summary, metrics, dimensions, time_range, source?, filters?, confidence? }`——全包 grep `result_id` **零命中**(exit 1):
  ```
  $ grep -rn "result_id" packages/data/tool-present-decomposition/
  (no matches)
  ```
- **README 印证**(`packages/data/tool-present-decomposition/README.md`):
  - :5—"pure presentation tool (`inject=['tools']` only) ... NO service dependency and does not probe `ctx.schema` / `ctx.audit` / `ctx.identity`"。
  - :22—"Pure intent recording only — no downstream side effects or service interactions."
  - :24—"Metric `value` is a free-text expression, not validated SQL."

### 1.2 客户端渲染(`packages/client/ui-present-decomposition/src/client/DecompositionCard.tsx`)

- **metric 网格读自 `block.call.argsRaw`**(DecompositionCard.tsx:203):`const args = parseArgs(block.call.argsRaw)`,`parseArgs`(同文件:48-79)`JSON.parse(argsRaw)` 后从 `parsed.metrics`(argsRaw 字段)取 `{name, value, unit?}` 数组。
- **指标口径网格渲染**(DecompositionCard.tsx:263-272):
  ```tsx
  <div className={css.metricsCaption}>{interpolate(t('metricsCaption'), String(args.metrics.length))}</div>
  <div className={css.metricsGrid}>
    {args.metrics.map((m, i) => (
      <div key={`${m.name}-${i}`} className={css.metricCell}>
        <div className={css.metricTop}>
          <span className={css.metricName} title={m.name}>{m.name}</span>
          {m.unit !== undefined && <span className={css.metricUnit}>{m.unit}</span>}
        </div>
        {m.value !== '' && <div className={css.metricExpr} title={m.value}>{m.value}</div>}
      </div>
    ))}
  </div>
  ```
  `m.value` 作为**纯文本**渲染进 `.metricExpr`(title 属性同值)——不计算、不绑定结果、不查表。
- **locales 印证意图声明语义**(`packages/client/ui-present-decomposition/src/client/locales.ts`):
  - :12—`'metricsCaption': '将计算 · {count} 项'`
  - :30—`'metricsCaption': 'To compute · {count} metric(s)'`
  "将计算"(to compute)明确:这些是**意图声明**(将要算什么),不是答案。R9 笔记(:§1 数据面)已定调:"value 是指标表达式/描述,不是计算结果"。
- **折叠态 MiniLine 也只取 metric name**(DecompositionCard.tsx:168-173):`args.metrics.slice(0,3)` 取 `m.name` 做 chip——名称即身份,无值、无 id。

**小结**:decomposition 的 metric 全程活在 argsRaw 里——LLM 声明 → 工具透传 → 客户端从 argsRaw 解析 → 渲染文本。**无 `result_id`、无数据绑定、无计算值**。

## 2. present_table 的 `kpi_columns` 来源

### 2.1 数据工具(`packages/data/tool-present-table/src/index.ts`)

`present_table` 同为**纯展示工具**(`inject = ['tools']`,src/index.ts:6),但携带 `result_id` 把卡片绑定到 `query_data` 执行结果。

- **`KpiColumn` 接口**(src/index.ts:11-16):
  ```typescript
  export interface KpiColumn {
    column: number
    aggregation: string
    label: string
    format?: string
  }
  ```
  `column` 是**数值列索引**(number),不是文本表达式——指向 `result_id` 绑定结果集的某列。
- **`result_id` 是 required 参数**(src/index.ts:103-107):
  ```typescript
  result_id: {
    type: 'string',
    required: true,
    description: 'The ID of the query result to present (from query_data execution).',
  }
  ```
- **`kpi_columns` 是 optional 参数(argsRaw)**(src/index.ts:127-140):
  ```typescript
  kpi_columns: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        column: { type: 'number', required: true, description: 'Column index.' },
        aggregation: { type: 'string', required: true, description: 'Aggregation function (sum, avg, max, min, count).' },
        label: { type: 'string', required: true, description: 'Display label for the KPI.' },
        format: { type: 'string', description: 'Optional format string (e.g. ",.2f", "%").' },
      },
    },
    description: 'Columns to display as KPI summary cards above the table.',
  }
  ```
- **execute 纯透传**(src/index.ts:193-205):`presentTableResult(args.result_id, args.title, ..., args.kpi_columns, args.chart)`——`result_id` 回显进输出(src/index.ts:26、:158),**不校验**。
- **README 印证绑定但不校验**(`packages/data/tool-present-table/README.md`):
  - :10—"`result_id` (required): the query result ID from `query_data` execution"
  - :23—"`result_id` is not validated against any result store (the UI resolves it at display time)."
  - :22—"Pure intent recording only — the UI layer owns actual rendering; this tool only declares the intent."

### 2.2 客户端渲染(`packages/client/ui-present-table/src/client/TableCard.tsx`)

关键在绑定:`result_id` → `query_data` 结果 → 用结果行计算 KPI 数值。

- **argsRaw 解析**(TableCard.tsx:521):`const args = parseArgs(block.call.argsRaw)`;`parseArgs`(:44-49)取 `result_id` + `kpi_columns`。
- **候选收集**(`collectQueryCandidates`,TableCard.tsx:170-182):扫会话快照里最近的(最多 6 个)`query_data` tool-result 节点,取其 render 文本 + call.argsRaw。
- **按 `result_id` 绑定**(`bindQuery`,TableCard.tsx:208-225):逐候选 `parseQueryData(candidate.text)` 解析 TSV(render 文本首行 `result_id: qr_xxx`),**精确匹配 `parsed.resultId === wantId` 胜出**;有 id 但都不匹配 → `'mismatch'`(显 `MismatchCard`);无 id 的旧格式 → 最近一个作 legacy fallback。绑定结果含 `parsed`(headers + rows)+ `sql`。
- **绑定调用点**(TableCard.tsx:553-554):
  ```tsx
  const candidates = useSession(s => collectQueryCandidates(s, blockSeq), candidatesEqual)
  const bound = useMemo(() => bindQuery(candidates, args.result_id), [candidates, args.result_id])
  ```
- **KPI 数值计算**(`computeKpi`,TableCard.tsx:106-127):取绑定结果行 `rows`、按 `kpi.column` 索引取列值 `parseFloat`、按 `kpi.aggregation`(sum/avg/max/min/count)聚合——**数值来自 result_id 绑定的 query_data 结果**,不是 argsRaw 里的字面量。
- **KpiCards 渲染**(TableCard.tsx:350-358 + 调用点 :637-639):
  ```tsx
  function KpiCards({ kpis, rows }: { kpis: KpiColumn[]; rows: string[][] }) {
    return (
      <div className={css.kpiRow}>
        {kpis.map(kpi => (
          <div key={kpi.label} className={css.kpiCard}>
            <span className={css.kpiValue}>{computeKpi(rows, kpi)}</span>
            <span className={css.kpiLabel}>{kpi.label}</span>
          </div>
        ))}
      </div>
    )
  }
  ...
  {args.kpi_columns !== undefined && args.kpi_columns.length > 0 && (
    <>
      <KpiCards kpis={args.kpi_columns} rows={sortedRows} />
      {incomplete && <div className={css.kpiNote}>{t('kpiSampleNote')}</div>}
    </>
  )}
  ```
  `kpis`(选哪些列/聚合/label)来自 argsRaw,**`rows`(实际数据)来自 `args.result_id` 绑定的 query_data 结果**——数值 `computeKpi(rows, kpi)` 实时算出。
- **locales 印证"算出来的"**(`packages/client/ui-present-table/src/client/locales.ts`):
  - :18—`'kpiSampleNote': 'KPI 基于截断样本计算,非全量结果'`
  - :41—`'kpiSampleNote': 'KPIs are computed on a truncated sample, not the full result'`

**小结**:table 的 `kpi_columns` 是**混合来源**——选用哪些列/聚合/label 是 LLM 声明(argsRaw),但**KPI 数值由 `result_id` 绑定的 `query_data` 结果行实时计算**。`result_id` 是数据层锚点。

## 3. 身份判定:是否同源、是否共享 `result_id`、可否互认

### 3.1 对比矩阵

| 维度 | decomposition `metrics` | present_table `kpi_columns` |
|---|---|---|
| **声明位置** | argsRaw(required) | argsRaw(optional) |
| **元素结构** | `{name, value, unit?}` | `{column, aggregation, label, format?}` |
| **value/列引用** | `value`:自由文本表达式/描述 | `column`:数值列索引(指向结果集列) |
| **`result_id` 字段** | **无**(全包 grep 零命中) | **有**(required 参数 + 输出回显) |
| **数值来源** | 无数值(value 是文本) | `computeKpi(rows, kpi)` 从 `result_id` 绑定结果行计算 |
| **数据绑定** | 无(纯 intent 声明) | 经 `result_id` 绑定 `query_data` 结果 |
| **身份模型** | `(name, value)` 自由文本对 | `(result_id, column_index, aggregation)` 三元组 |
| **工具 inject** | `['tools']` 纯展示,无 service | `['tools']` 纯展示,无 service |
| **客户端字段路径** | `block.call.argsRaw` → `parsed.metrics` → 渲染文本 | `block.call.argsRaw` → `parsed.kpi_columns`(选用)+ `bindQuery(candidates, parsed.result_id)` → `rows`(数值) |

### 3.2 判定

1. **是否同源?** 否。decomposition metrics 是纯 LLM 自由文本声明,不经任何数据源;table kpi 的数值经 `result_id` 来自 `query_data` 结果。一边纯声明、一边数据绑定——不同源。
2. **是否共享 `result_id`?** 否。decomposition **没有 `result_id` 字段**(src/index.ts 全包 grep `result_id` exit 1;parameters/output schema 均无)。table 有 `result_id` 但它锚定的是 `query_data`,不指向 decomposition。两卡间无 `result_id` 共享链路。
3. **能否建立 metric-identity 对应?** 否。两套身份模型不兼容:
   - decomposition metric 身份 = `(name: string, value: string)` 自由文本对——无列索引、无 result_id、无 semantic id。
   - table kpi 身份 = `(result_id: string, column: number, aggregation: string)` 三元组——无自由文本表达式。
   - 无共享 key、无共享 semantic id、无交叉引用。唯一可能的"联系"是 LLM 自撰 label 的字面巧合(decomposition 有个 `name: "DAU"`,table 有个 `label: "DAU"`),但 label 各自独立生成、**无契约保证一致**——不能作为数据层身份对应依据。

### 3.3 不是"半共享"的反驳

有人可能说"两者都是 argsRaw LLM 声明,算半共享"。**错**。关键差别在数值来源:
- decomposition metric 的 `value` 就是最终展示内容(文本),LLM 写什么就显什么——**无外部数据锚定**。
- table kpi 的 `column`/`aggregation`/`label` 是选用声明,但**展示数值 `computeKpi(rows, kpi)` 不在 argsRaw 里**,而是从 `args.result_id` 绑定的 `query_data` 结果行算出(TableCard.tsx:106-127、:639)。
- 一边"声明即数据",一边"声明 + 数据绑定 + 实时计算"——不是同一来源,不是半共享。

R6 已确立 `result_id` 是系统生成的确定性引用(`qr_<sha256(sql)[0:12]>`,post-execute hook 注入 query_data tool value)。decomposition 不参与这条链路——它既不读 `result_id`、也不产出 `result_id`、也不被 `result_id` 引用。

## 4. 结论与毕业

### 4.1 身份判定

**INDEPENDENT(独立,不共享身份)。** 两卡 metric 在数据层无任何链接:
- decomposition 无 `result_id`、无列索引、无 semantic id——纯 LLM 自由文本 intent 声明。
- table kpi 经 `result_id` 绑定 `query_data` 结果,数值由 `computeKpi(rows, kpi)` 实时计算;选用声明在 argsRaw,数据来源在 `query_data`。
- 无共享 key、无共享 semantic id、无交叉引用。客户端**无法**建立 metric-identity 对应。

### 4.2 毕业 grilling 票(map「查询理解↔table KPI 互认」雾的"是否联动 metric"一问)

map.md「Not yet specified」记:"剩余模糊=两者结论后的 grilling(是否联动 metric、选哪种 affordance),待 R10/P2 落地再成票。"

R10 结论回答"是否联动 metric"一问:**不联动,雾关闭。** 理由:
- 数据层无共享 key 可连——decomposition 无 `result_id`、无列索引;table 有 `result_id` 但锚定 `query_data`,不指 decomposition。
- 建一座 metric-link affordance 跨两份独立 LLM 声明(无 result_id、无 semantic id)= 跨空建桥,只能靠 label 字面巧合,脆弱且无契约依据。
- "互认"的前提是同源或共享 key;两者皆无,故无 metric 身份可互认。

**P2(改口径 affordance)独立存续。** P2 问的是"低置信时用户如何改口径并回流"——那是 decomposition 卡内部的用户纠错 UX,不依赖两卡 metric 联动。R10 不阻塞、不绑定 P2;P2 落地后,"选哪种 affordance"一问由 P2 自决。

### 4.3 对 destination 的含义

- **不新增 metric-link affordance**:无需在 decomposition 卡与 table KPI 卡之间建数据层或 UI 层 metric 链接。两卡各自独立渲染,互不引用。
- **decomposition metric 网格保持"意图声明"语义**(P1 终版"指标口径常显"已定):它是"将要算什么",与 table 的"算出来的 KPI"在视觉档次上应继续拉开(参 R9 §3"metrics 语义降级":decomposition 不用 16px KPI 大卡样式,避免误导用户以为看到了答案)。当前代码(DecompositionCard.tsx:265-272 `.metricCell` + `.metricExpr` 文本渲染)已符合此语义,无需改。
- **若未来真要联动**:需先在数据层引入共享 key(例如让 decomposition 也声明 `result_id` 或让两者共享 semantic metric id)——那是新的 server-side 设计决策,非本票范围,且目前无需求驱动。
