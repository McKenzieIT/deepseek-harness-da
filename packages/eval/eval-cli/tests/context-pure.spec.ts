/**
 * The four pure helpers in `src/context.ts`: no Cordis context, no plugins, no
 * LLM, no filesystem — each takes plain data and returns plain data, and each is
 * read by something that cannot defend itself against a wrong answer.
 *
 *  - `looksLikeSql` decides whether a thinking model's TEXT block or its
 *    REASONING block carries the statement
 *    (`CtxLlmAdapter.completeWithReasoning`). A false positive ships prose as
 *    SQL; a false negative ships the whole chain-of-thought as SQL. The word
 *    boundary is the load-bearing part — `SELECTED`/`WITHOUT` are prose.
 *  - `toEngineOutcome` is the fix for a defect named in its own doc comment: the
 *    `as unknown as EngineQueryOutcome` cast it replaced was a runtime no-op, so
 *    a provider `state:'completed'` never matched the engine's `'done'` and every
 *    completed query fell to the failed/decline path. Every arm is pinned
 *    key-by-key: each optional field is a conditional spread, so an ABSENT key
 *    and a present-but-undefined key are different outcomes — hence `Object.keys`
 *    is asserted next to the value.
 *  - `renderEventSchemaContext` is read by the SQL semantic judge, which scores
 *    `table_selection` / `field_selection` against these very lines. The wording
 *    IS the contract, so the exact rendered lines are asserted, never substrings.
 *  - `projectEventDefForPrompt` must keep `params_fields` a MAP: the critic
 *    derives its `json_field_not_in_params` guard from `Object.keys(eventParams)`,
 *    so an array projection would degrade the guard to the indices `0,1,2…`. Both
 *    the dropped fields (`confirmation`/`coverage`/`alt_labels`/`domains`) and the
 *    asymmetry between `params_fields` (kept when empty) and `metrics` (dropped
 *    when empty) are pinned.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/context-pure.spec.ts
 */
import { describe, expect, it } from 'vitest'
import {
  looksLikeSql,
  projectEventDefForPrompt,
  renderEventSchemaContext,
  toEngineOutcome,
  type EventContext,
  type ProviderQueryOutcome,
} from '../src/context.ts'

describe('looksLikeSql', () => {
  it('accepts each of the eight SQL verbs it lists, case-insensitively', () => {
    // The predicate upper-cases before matching, so lower-case replies from a
    // model that writes `select …` must land on the SQL side too.
    expect(looksLikeSql('SELECT COUNT(*) FROM dws_pay_day')).toBe(true)
    expect(looksLikeSql('select 1')).toBe(true)
    expect(looksLikeSql('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true)
    expect(looksLikeSql('with cte as (select 1) select * from cte')).toBe(true)
    expect(looksLikeSql('INSERT INTO t VALUES (1)')).toBe(true)
    expect(looksLikeSql('UPDATE t SET a = 1')).toBe(true)
    expect(looksLikeSql("DELETE FROM t WHERE dt = '2026-09-01'")).toBe(true)
    expect(looksLikeSql('CREATE TABLE t (a BIGINT)')).toBe(true)
    expect(looksLikeSql('ALTER TABLE t ADD COLUMNS (b STRING)')).toBe(true)
    expect(looksLikeSql('DROP TABLE t')).toBe(true)
  })

  it('tolerates leading whitespace and newlines, which a streamed reply carries', () => {
    expect(looksLikeSql('\n\n  \t SELECT 1')).toBe(true)
    // A bare verb still matches: \b holds between the final T and end-of-input.
    expect(looksLikeSql('  SELECT  ')).toBe(true)
  })

  it('rejects prose whose first word merely starts with a SQL verb', () => {
    // The \b is what separates the statement from the sentence. Without it
    // 「SELECTED」/「WITHOUT」/「DROPPED」 prose would be handed on as SQL.
    expect(looksLikeSql('SELECTED rows are shown below')).toBe(false)
    expect(looksLikeSql('Without a payment table this cannot be answered')).toBe(false)
    expect(looksLikeSql('Dropped the sandbox accounts first')).toBe(false)
    expect(looksLikeSql('Creates a daily summary')).toBe(false)
  })

  it('rejects conversational and fenced replies, which is what routes them to reasoning', () => {
    expect(looksLikeSql('好的，我先确认一下口径：你要的是角色数还是账号数？')).toBe(false)
    expect(looksLikeSql('Here is the query you asked for: SELECT 1')).toBe(false)
    // A fenced block starts with the fence, not the verb — `completeWithReasoning`
    // relies on this to reach its ```sql extraction path instead.
    expect(looksLikeSql('```sql\nSELECT 1\n```')).toBe(false)
    expect(looksLikeSql('')).toBe(false)
    expect(looksLikeSql('   \n\t  ')).toBe(false)
  })
})

describe('toEngineOutcome — the completed → done arm', () => {
  it('remaps state and renames instanceId to result_id, keeping rows and sql', () => {
    const out: ProviderQueryOutcome = {
      state: 'completed',
      rows: [{ dt: '2026-09-01', pay_amt: 1234 }],
      instanceId: '20260901123456789gabcdef',
      sql: 'SELECT dt, SUM(pay_amt) FROM dws_pay_day GROUP BY dt',
    }
    expect(toEngineOutcome(out)).toEqual({
      state: 'done',
      rows: [{ dt: '2026-09-01', pay_amt: 1234 }],
      result_id: '20260901123456789gabcdef',
      sql: 'SELECT dt, SUM(pay_amt) FROM dws_pay_day GROUP BY dt',
    })
    // `instance_id` is the RUNNING field name; a completed outcome must not carry
    // it, and `failureKind`/`error` must be absent entirely rather than undefined.
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'rows', 'result_id', 'sql'])
  })

  it('omits rows and result_id entirely when the provider sent neither, and defaults sql to empty', () => {
    const out: ProviderQueryOutcome = { state: 'completed' }
    expect(toEngineOutcome(out)).toEqual({ state: 'done', sql: '' })
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'sql'])
  })

  it('keeps an empty rows array, which is a successful zero-row answer rather than an absent one', () => {
    const out: ProviderQueryOutcome = { state: 'completed', rows: [], sql: 'SELECT 1 FROM t WHERE 1 = 0' }
    expect(toEngineOutcome(out)).toEqual({ state: 'done', rows: [], sql: 'SELECT 1 FROM t WHERE 1 = 0' })
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'rows', 'sql'])
  })
})

describe('toEngineOutcome — the pending → running arm', () => {
  it('renames instanceId to instance_id (not result_id) and carries the stage through', () => {
    const out: ProviderQueryOutcome = {
      state: 'pending',
      instanceId: '20260901999999999gzzzzzz',
      stage: 'Running',
      sql: 'SELECT COUNT(DISTINCT role_id) FROM ieu_ods.ods_10000251_all_view',
    }
    expect(toEngineOutcome(out)).toEqual({
      state: 'running',
      instance_id: '20260901999999999gzzzzzz',
      stage: 'Running',
      sql: 'SELECT COUNT(DISTINCT role_id) FROM ieu_ods.ods_10000251_all_view',
    })
    // The engine's attach loop reads `instance_id`; `result_id` here would make
    // every pending query un-attachable.
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'instance_id', 'stage', 'sql'])
  })

  it('omits instance_id and stage entirely when the provider sent neither', () => {
    const out: ProviderQueryOutcome = { state: 'pending', sql: 'SELECT 1' }
    expect(toEngineOutcome(out)).toEqual({ state: 'running', sql: 'SELECT 1' })
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'sql'])
  })

  it('drops rows on the pending arm, because a running instance has no result set', () => {
    const out: ProviderQueryOutcome = { state: 'pending', rows: [{ leaked: true }], instanceId: 'i-1' }
    expect(toEngineOutcome(out)).toEqual({ state: 'running', instance_id: 'i-1', sql: '' })
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'instance_id', 'sql'])
  })
})

describe('toEngineOutcome — the default → failed arm', () => {
  it('carries failureKind and error through for an explicit provider failure', () => {
    const out: ProviderQueryOutcome = {
      state: 'failed',
      failureKind: 'table_not_found',
      error: 'ODPS-0130131: Table not found - dws_pay_dayy',
      sql: 'SELECT 1 FROM dws_pay_dayy',
    }
    expect(toEngineOutcome(out)).toEqual({
      state: 'failed',
      failureKind: 'table_not_found',
      error: 'ODPS-0130131: Table not found - dws_pay_dayy',
      sql: 'SELECT 1 FROM dws_pay_dayy',
    })
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'failureKind', 'error', 'sql'])
  })

  it('omits failureKind and error entirely when the provider sent neither', () => {
    const out: ProviderQueryOutcome = { state: 'failed', sql: 'SELECT 1' }
    expect(toEngineOutcome(out)).toEqual({ state: 'failed', sql: 'SELECT 1' })
    expect(Object.keys(toEngineOutcome(out))).toEqual(['state', 'sql'])
  })

  it('treats an unrecognised state, and an absent state, as failed with an empty sql', () => {
    expect(toEngineOutcome({ state: 'cancelled' })).toEqual({ state: 'failed', sql: '' })
    expect(toEngineOutcome({ state: '' })).toEqual({ state: 'failed', sql: '' })
    expect(toEngineOutcome({})).toEqual({ state: 'failed', sql: '' })
  })

  it("does not accept the engine's own vocabulary from the provider side", () => {
    // The provider says 'completed'/'pending'; 'done'/'running' are the engine's
    // words. A provider that spoke them would fall here — which is exactly the
    // no-op-cast defect this function exists to prevent, seen from the other side.
    expect(toEngineOutcome({ state: 'done', rows: [{ a: 1 }], sql: 'SELECT 1' }))
      .toEqual({ state: 'failed', sql: 'SELECT 1' })
    expect(toEngineOutcome({ state: 'running', instanceId: 'i-9' }))
      .toEqual({ state: 'failed', sql: '' })
  })
})

/** The scope's event view, exactly as `extractEventView` reads it out of `config.yaml`. */
const FULL_EVENT_CTX: EventContext = {
  eventDef: {
    name: 'game.recharge',
    event_filter: "event = 'game.recharge'",
    params_fields: { amount: { type: 'double' }, currency: { type: 'string' } },
  },
  eventView: {
    full_name: 'ieu_ods.ods_10000251_all_view',
    params_extract_template: "GET_JSON_OBJECT(params,'$.{field_name}')",
    base_columns: ['dt', 'event', 'role_id', 'params'],
  },
}

describe('renderEventSchemaContext', () => {
  it('renders the whole block the SQL judge reads, byte for byte', () => {
    // Whole-string equality, not substrings: the judge scores table_selection /
    // field_selection against this wording, and the leading blank line is what
    // lets the caller append the block straight onto the BM25 candidate list.
    expect(renderEventSchemaContext(FULL_EVENT_CTX)).toBe(
      '\n事件数据源（已 pre-fetch，属于本次可用 schema）：'
      + '\n- 事件视图表（合法 FROM 目标）: ieu_ods.ods_10000251_all_view'
      + "\n- params 字段提取模板: GET_JSON_OBJECT(params,'$.{field_name}')"
      + '\n- 视图基础列: dt, event, role_id, params'
      + '\n- 事件名: game.recharge'
      + "\n- 事件过滤: event = 'game.recharge'"
      + '\n- params 可用字段: amount, currency',
    )
  })

  it('drops only the 视图基础列 line when the view reports no base columns', () => {
    const ctx: EventContext = { ...FULL_EVENT_CTX, eventView: { ...FULL_EVENT_CTX.eventView!, base_columns: [] } }
    expect(renderEventSchemaContext(ctx).split('\n')).toEqual([
      '',
      '事件数据源（已 pre-fetch，属于本次可用 schema）：',
      '- 事件视图表（合法 FROM 目标）: ieu_ods.ods_10000251_all_view',
      "- params 字段提取模板: GET_JSON_OBJECT(params,'$.{field_name}')",
      '- 事件名: game.recharge',
      "- 事件过滤: event = 'game.recharge'",
      '- params 可用字段: amount, currency',
    ])
  })

  it('drops both view lines when no event view was extracted, keeping the definition lines', () => {
    // The common shape when `semanticRoot` is empty: the judge still learns the
    // event name/filter/params, it just gets no legal FROM target.
    const ctx: EventContext = { eventDef: FULL_EVENT_CTX.eventDef, eventView: undefined }
    expect(renderEventSchemaContext(ctx).split('\n')).toEqual([
      '',
      '事件数据源（已 pre-fetch，属于本次可用 schema）：',
      '- 事件名: game.recharge',
      "- 事件过滤: event = 'game.recharge'",
      '- params 可用字段: amount, currency',
    ])
  })

  it("drops the 事件名 line when the definition's name is not a string", () => {
    const ctx: EventContext = {
      eventDef: { name: 42, event_filter: "event = 'game.role.create'", params_fields: { role_id: {} } },
      eventView: undefined,
    }
    expect(renderEventSchemaContext(ctx).split('\n')).toEqual([
      '',
      '事件数据源（已 pre-fetch，属于本次可用 schema）：',
      "- 事件过滤: event = 'game.role.create'",
      '- params 可用字段: role_id',
    ])
  })

  it('drops the 事件过滤 line for an empty-string filter and for a non-string filter alike', () => {
    // An empty filter would render 「- 事件过滤: 」 and tell the judge a legal
    // predicate is the empty string; both guards on line 449 have to hold.
    const empty: EventContext = { eventDef: { name: 'game.recharge', event_filter: '' }, eventView: undefined }
    expect(renderEventSchemaContext(empty).split('\n')).toEqual([
      '',
      '事件数据源（已 pre-fetch，属于本次可用 schema）：',
      '- 事件名: game.recharge',
    ])
    const notAString: EventContext = { eventDef: { name: 'game.recharge', event_filter: null }, eventView: undefined }
    expect(renderEventSchemaContext(notAString).split('\n')).toEqual([
      '',
      '事件数据源（已 pre-fetch，属于本次可用 schema）：',
      '- 事件名: game.recharge',
    ])
  })

  it('drops the params line for an empty params map and for an absent one alike', () => {
    const emptyMap: EventContext = { eventDef: { name: 'game.login', params_fields: {} }, eventView: undefined }
    expect(renderEventSchemaContext(emptyMap).split('\n')).toEqual([
      '',
      '事件数据源（已 pre-fetch，属于本次可用 schema）：',
      '- 事件名: game.login',
    ])
    const absent: EventContext = { eventDef: { name: 'game.login' }, eventView: undefined }
    expect(renderEventSchemaContext(absent).split('\n')).toEqual([
      '',
      '事件数据源（已 pre-fetch，属于本次可用 schema）：',
      '- 事件名: game.login',
    ])
  })

  it('still renders the header alone for a wholly empty grounding', () => {
    // `projectEventDefForPrompt({})` legitimately yields `{}`, so this is the
    // degenerate-but-reachable input; the header must not be conditional on it.
    expect(renderEventSchemaContext({ eventDef: {}, eventView: undefined }))
      .toBe('\n事件数据源（已 pre-fetch，属于本次可用 schema）：')
  })
})

describe('projectEventDefForPrompt', () => {
  it('keeps the five prompt fields and drops workflow-state and retrieval-only noise', () => {
    const raw = {
      name: 'game.recharge',
      event_filter: "event = 'game.recharge'",
      description: '充值成功事件（不含沙盒）',
      params_fields: { amount: { type: 'double' }, currency: { type: 'string' } },
      metrics: { total_amount: 'SUM(amount)' },
      // Dropped: workflow state …
      confirmation: 'confirmed',
      coverage: 0.93,
      // … and retrieval-only fields.
      alt_labels: ['充值', '氪金'],
      domains: ['pay'],
      disambiguation: [{ hint: 'not 付费' }],
    }
    const projected = projectEventDefForPrompt(raw)
    expect(projected).toEqual({
      name: 'game.recharge',
      event_filter: "event = 'game.recharge'",
      description: '充值成功事件（不含沙盒）',
      params_fields: { amount: { type: 'double' }, currency: { type: 'string' } },
      metrics: { total_amount: 'SUM(amount)' },
    })
    expect(Object.keys(projected)).toEqual(['name', 'event_filter', 'description', 'params_fields', 'metrics'])
  })

  it("keeps params_fields a keyed map, which is what the critic's json_field_not_in_params guard reads", () => {
    const projected = projectEventDefForPrompt({
      params_fields: { amount: { type: 'double' }, item_id: { type: 'string' } },
    })
    // An array projection here would degrade the guard to the indices 0,1.
    expect(Object.keys(projected.params_fields!)).toEqual(['amount', 'item_id'])
    expect(Array.isArray(projected.params_fields)).toBe(false)
  })

  it('projects an empty definition to an empty object rather than a shell of undefined keys', () => {
    const projected = projectEventDefForPrompt({})
    expect(projected).toEqual({})
    expect(Object.keys(projected)).toEqual([])
  })

  it('drops every field whose type fails its guard', () => {
    const projected = projectEventDefForPrompt({
      name: 42,
      event_filter: null,
      description: ['充值成功事件'],
      params_fields: 'amount',
      metrics: 7,
    })
    expect(projected).toEqual({})
    expect(Object.keys(projected)).toEqual([])
  })

  it('drops null params_fields and null metrics, which typeof alone would admit', () => {
    // `typeof null === 'object'`, so the explicit `!== null` operand is the only
    // thing stopping a null from reaching the prompt as a params map.
    const projected = projectEventDefForPrompt({ name: 'game.login', params_fields: null, metrics: null })
    expect(projected).toEqual({ name: 'game.login' })
    expect(Object.keys(projected)).toEqual(['name'])
  })

  it('keeps an empty params map but drops an empty metrics map', () => {
    // The asymmetry is deliberate: `params_fields` is the critic's key set (an
    // empty map is a real statement — this event has no params), while an empty
    // `metrics` is pure prompt noise.
    const projected = projectEventDefForPrompt({ params_fields: {}, metrics: {} })
    expect(projected).toEqual({ params_fields: {} })
    expect(Object.keys(projected)).toEqual(['params_fields'])
  })

  it('applies the non-empty metrics gate through Object.keys, so an empty array is dropped too', () => {
    // The guards are typeof-based, so an array reaches them as an object; the
    // `Object.keys(...).length > 0` gate is what still separates the two.
    expect(projectEventDefForPrompt({ metrics: [] })).toEqual({})
    expect(projectEventDefForPrompt({ metrics: ['SUM(amount)'] })).toEqual({ metrics: ['SUM(amount)'] })
  })
})
