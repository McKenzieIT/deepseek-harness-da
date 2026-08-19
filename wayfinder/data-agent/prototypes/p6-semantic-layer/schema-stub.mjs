// PROTOTYPE (throwaway) — P6 semantic-layer substrate · ctx.schema seam STAND-IN.
// This is the ODPS-DECOUPLING seam (decision ⑤c / D4): the semantic layer requests schema via
// `ctx.schema` (discover/describe/sample), NOT by touching pyodps/ODPS. The real impl lives in the
// query-engine MaxCompute sidecar (P4 / ⑤a — same sidecar that implements ctx.query.execute, with its
// per-scope ODPS connection cache + credentials/updated -> invalidate). This stub returns FAKE TableMeta[]
// so the prototype can demo the decoupled sync flow (schema dicts -> generate/merge YAML) without ODPS.
// probe_pk_uniqueness is NOT here — it runs SQL, so it goes through ctx.query.execute (it's execution, not metadata).

// Fake schema (mirrors the TableMeta shape DataSourceConnector returns: {table_name, columns:[{name,type,comment}], partitions:[{name,type}], comment}).
const FAKE_TABLES = {
  // a new DWS fact table (to demo generate_table_yaml + role inference)
  dws_demo_pay_order_di: {
    table_name: 'dws_demo_pay_order_di',
    comment: '付费订单日表(假数据)',
    partitions: [{ name: 'ds', type: 'string' }],
    columns: [
      { name: 'order_id', type: 'string', comment: '订单号' },
      { name: 'account_id', type: 'string', comment: '账号ID' },
      { name: 'role_id', type: 'string', comment: '角色ID' },
      { name: 'pay_amt', type: 'double', comment: '订单金额/元' },
      { name: 'tm', type: 'datetime', comment: '行为时间' },
      { name: 'ds', type: 'string', comment: '分区' },
    ],
  },
  // a new DIM table (to demo generate_dim_yaml: pk from *_id, label_columns STRING+suffix)
  dim_demo_item_info: {
    table_name: 'dim_demo_item_info',
    comment: '道具配置维度表(假数据)',
    partitions: [],
    columns: [
      { name: 'item_id', type: 'string', comment: '道具id' },
      { name: 'item_name', type: 'string', comment: '道具名称' },
      { name: 'quality', type: 'string', comment: '品质' },
      { name: 'price', type: 'bigint', comment: '价格' },
    ],
  },
  // a CHANGED DWS table (to demo merge_changed_yaml preserving analyst role corrections) — same name as
  // the fixture written in scenario 2, but with a NEW column + type change, so merge preserves the
  // analyst-corrected role on the existing column and adds the new one.
  dws_demo_pay_order_di_changed: {
    table_name: 'dws_demo_pay_order_di',
    comment: '付费订单日表(假数据,变更:新增列+类型改)',
    partitions: [{ name: 'ds', type: 'string' }],
    columns: [
      { name: 'order_id', type: 'string', comment: '订单号' },
      { name: 'account_id', type: 'string', comment: '账号ID' },
      { name: 'role_id', type: 'string', comment: '角色ID' },
      { name: 'pay_amt', type: 'decimal', comment: '订单金额/元(类型改 double->decimal)' }, // type change
      { name: 'coupon_amt', type: 'double', comment: '优惠券抵扣(新增列)' },                 // new column
      { name: 'tm', type: 'datetime', comment: '行为时间' },
      { name: 'ds', type: 'string', comment: '分区' },
    ],
  },
}

export const ctxSchema = {
  source: 'maxcompute', // (stub) the real MaxCompute provider sidecar sets this
  // discover(scope_id, kind) -> TableMeta[] (real impl: maxc list-tables + per-table describe, N+1, each <=120s)
  discover(_scopeId, kind) {
    if (kind === 'dim') return [FAKE_TABLES.dim_demo_item_info]
    return [FAKE_TABLES.dws_demo_pay_order_di]
  },
  describe(tableName) {
    return FAKE_TABLES[tableName] || FAKE_TABLES[`${tableName}_changed`] || null
  },
  // sample(tableName, n) -> formatted text (real impl: a sampling query)
  sample(tableName, n = 5) {
    return `(stubbed sample of ${tableName}, ${n} rows)\norder_id,account_id,pay_amt\nORD001,ACC001,12.50\nORD002,ACC002,6.00`
  },
  // for scenario 2's "changed" case: return the changed-shape meta for an existing table
  describeChanged(tableName) { return FAKE_TABLES[`${tableName}_changed`] || null },
}
