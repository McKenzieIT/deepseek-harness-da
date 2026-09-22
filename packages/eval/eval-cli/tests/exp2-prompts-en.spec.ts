import { describe, it, expect } from 'vitest'
import { MAX_SQL_PER_TURN, MAX_FEEDBACK_RETRIES } from '@deepseek-ai/dsh-nl2sql-engine'
import type { BuildPromptArgs } from '@deepseek-ai/dsh-nl2sql-engine'
import { buildPromptEN, buildJudgePromptEN, EXPANSION_SYSTEM_PROMPT_EN } from '../src/exp2-prompts-en.ts'

/**
 * GA-EXP2: the English prompt variants are drop-in replacements for the Chinese
 * originals, so the only thing that can silently break them is a slot that
 * renders the wrong text — a granularity tag attached to the wrong suffix, an
 * optional section that leaks in when its argument is absent, a `today`
 * fallback that prints a date that was never passed, or the judge prompt
 * filling its three slots in the wrong order. Nothing downstream re-parses
 * these strings, so the prompt text IS the contract.
 *
 * These cases therefore pin the exact rendered text on both sides of every
 * conditional slot (candidates / joinConstraints / metricContext / isTrend /
 * today / eventDef / phase) rather than asserting that a marker is merely
 * present — a substring both arms satisfy would prove nothing.
 *
 * Run: npx vitest run packages/eval/eval-cli/tests/exp2-prompts-en.spec.ts
 */

type Candidate = BuildPromptArgs['candidates'][number]

function candidate(id: string, score: number, payload: Candidate['payload']): Candidate {
  return { id, score, payload, mode: 'bm25-only' }
}

const MAXCOMPUTE_CONVENTIONS: NonNullable<BuildPromptArgs['conventions']> = {
  engine: 'maxcompute',
  key_differences: ['ds is a yyyyMMdd string partition'],
  functions: [],
  cast_map: [],
  sql_templates: [],
}

/** The smallest legal argument set: every optional slot absent, both required
 *  nullable slots null. Used as the "nothing supplied" side of each pair. */
function bareArgs(overrides: Partial<BuildPromptArgs> = {}): BuildPromptArgs {
  return {
    question: 'unrelated question',
    candidates: [],
    eventDef: null,
    conventions: null,
    ...overrides,
  }
}

describe('buildPromptEN', () => {
  it('renders every optional section when all of them are supplied', () => {
    const prompt = buildPromptEN({
      question: 'How many PVP battles happened yesterday?',
      candidates: [
        candidate('dws_pvp_battle_di', 12.3456, { id: 'dws_pvp_battle_di', description: 'daily PVP battle rollup' }),
        candidate('dws_role_snapshot_df', 3.1, undefined),
        candidate('dim_item', 0.5, { id: 'dim_item' }),
      ],
      eventDef: { name: 'pvp_battle_end', params_fields: { role_id: 'string' } },
      conventions: MAXCOMPUTE_CONVENTIONS,
      joinConstraints: ['dws_pvp_battle_di.role_id = dim_role.role_id', 'dws_pvp_battle_di.ds = dim_role.ds'],
      metricContext: 'ARPPU = pay_amt / paying_users',
      isTrend: true,
      today: '20260921',
      // `phase` deliberately omitted — the destructuring default must supply it.
    })

    // Candidate lines: granularity tag by id suffix, payload description when
    // present, id as the description fallback when it is not, score to 3dp.
    expect(prompt).toContain(
      '# Retrieval Candidates (search_data_sources BM25-only)\n'
      + '- dws_pvp_battle_di [daily-increment]: daily PVP battle rollup (score=12.346)\n'
      + '- dws_role_snapshot_df [snapshot]: dws_role_snapshot_df (score=3.100)\n'
      + '- dim_item: dim_item (score=0.500)\n',
    )

    // isTrend adds rule 9 directly after rule 8, before the dialect heading.
    expect(prompt).toContain(
      '8. Numbers above 1000 use thousands separator\n'
      + '9. For trend/time-series questions, prefer _di (daily increment) tables;'
      + ' use _df (snapshot) tables only when no _di candidate exists\n'
      + '\n# Dialect Conventions (engine conventions seam injection)\n',
    )

    // The conventions seam output is injected verbatim, not summarised.
    expect(prompt).toContain(
      '# Dialect Conventions (engine conventions seam injection)\n'
      + '# 方言规范（maxcompute）\n'
      + '## 方言速查\n'
      + '- ds is a yyyyMMdd string partition\n',
    )

    // JOIN section (one bullet per constraint) then metric section then date.
    expect(prompt).toContain(
      '\n# Known JOIN Relations (must use, do not infer JOIN keys yourself)\n'
      + '- dws_pvp_battle_di.role_id = dim_role.role_id\n'
      + '- dws_pvp_battle_di.ds = dim_role.ds\n'
      + '\n# Known Metric Definitions (build queries based on these rules)\n'
      + 'ARPPU = pay_amt / paying_users\n'
      + '\n# Current Date\n'
      + 'Today is 20260921 (yyyyMMdd format).',
    )

    expect(prompt).toContain('# Current Question\nHow many PVP battles happened yesterday?\n')

    // eventDef is pretty-printed at 2-space indent; phase defaults to generation.
    expect(prompt).toContain(
      '# Event Definition (load_event_definition)\n'
      + '{\n  "name": "pvp_battle_end",\n  "params_fields": {\n    "role_id": "string"\n  }\n}\n'
      + '\n# Current Phase (P7 four-phase adaptation: phase=generation)',
    )
  })

  it('omits every optional section and falls back when none of them are supplied', () => {
    const prompt = buildPromptEN(bareArgs({ phase: 'validation' }))

    expect(prompt).toContain('# Retrieval Candidates (search_data_sources BM25-only)\n(no candidates)\n')
    expect(prompt).not.toContain('score=')

    // No rule 9: rule 8 is the last rule before the dialect heading.
    expect(prompt).toContain(
      '8. Numbers above 1000 use thousands separator\n'
      + '\n# Dialect Conventions (engine conventions seam injection)\n',
    )
    expect(prompt).not.toContain('9. For trend/time-series questions')

    // null conventions → the engine placeholder; both optional sections collapse
    // to empty strings, so the date block follows the dialect directly; `today`
    // absent → the literal 'unknown', not a computed date.
    expect(prompt).toContain(
      '# Dialect Conventions (engine conventions seam injection)\n'
      + '（无 conventions）\n'
      + '\n\n# Current Date\n'
      + 'Today is unknown (yyyyMMdd format).',
    )
    expect(prompt).not.toContain('# Known JOIN Relations')
    expect(prompt).not.toContain('# Known Metric Definitions')

    expect(prompt).toContain(
      '# Event Definition (load_event_definition)\n'
      + '(not loaded)\n'
      + '\n# Current Phase (P7 four-phase adaptation: phase=validation)',
    )
  })

  it('anchors the granularity tag to the id suffix, not to a substring', () => {
    const prompt = buildPromptEN(bareArgs({
      candidates: [
        candidate('evt_di', 1, undefined),
        candidate('evt_dial', 1, undefined),
        candidate('evt_df', 1, undefined),
        candidate('evt_dfx', 1, undefined),
      ],
    }))

    expect(prompt).toContain('- evt_di [daily-increment]: evt_di (score=1.000)')
    expect(prompt).toContain('- evt_df [snapshot]: evt_df (score=1.000)')
    // `_di` / `_df` mid-id must produce no tag at all.
    expect(prompt).toContain('- evt_dial: evt_dial (score=1.000)')
    expect(prompt).toContain('- evt_dfx: evt_dfx (score=1.000)')
  })

  it('treats an empty joinConstraints array and an empty metricContext as absent', () => {
    const prompt = buildPromptEN(bareArgs({ joinConstraints: [], metricContext: '' }))

    // A present-but-empty array is truthy, so only the `.length > 0` guard keeps
    // the heading out; an empty metricContext is falsy on its own.
    expect(prompt).not.toContain('# Known JOIN Relations')
    expect(prompt).not.toContain('# Known Metric Definitions')
    expect(prompt).toContain('（无 conventions）\n\n\n# Current Date\n')
  })

  it('interpolates the engine budget constants into the tool catalog and the decline rule', () => {
    const prompt = buildPromptEN(bareArgs())

    expect(prompt).toContain(`built-in CostGuard + exploration budget (MAX_SQL_PER_TURN=${MAX_SQL_PER_TURN})`)
    expect(prompt).toContain(`self-fix ${MAX_FEEDBACK_RETRIES} times still failing`)
    // plan_query is catalogued as dropped, not as callable.
    expect(prompt).toContain('[drop] plan_query (LATENT, not in any phase allowlist, proven in research §1.2)')
  })
})

describe('EXPANSION_SYSTEM_PROMPT_EN', () => {
  it('joins its fragments into one instruction block followed by the four few-shot pairs', () => {
    // The value is assembled by string concatenation; a dropped trailing space
    // in any fragment would glue two sentences together right here.
    expect(EXPANSION_SYSTEM_PROMPT_EN).toContain(
      'You are a search query expander for a game analytics data warehouse. '
      + 'Rewrite the user question into a BM25-friendly expanded query for matching DWS wide table names and field names. ',
    )
    expect(EXPANSION_SYSTEM_PROMPT_EN).toContain(
      'Output only one line of space-separated keywords, no explanations.\n'
      + 'Examples:\n'
      + 'User: ARPPU是多少\n'
      + 'Output: ARPPU ARPU 人均付费 付费人均收入 累计付费账号 pay_amt acc_summary 付费金额 账号汇总 paying\n',
    )
    expect(EXPANSION_SYSTEM_PROMPT_EN).toContain(
      'User: 大R用户有多少\n'
      + 'Output: 大R 大R玩家 大R付费账号 高付费 重度付费 big_r pay_order 付费订单 累计付费 高消费',
    )
  })
})

describe('buildJudgePromptEN', () => {
  it('fills the question / schema / SQL slots in that order', () => {
    const judge = buildJudgePromptEN({
      question: '昨天有多少 DAU？',
      generated_sql: 'SELECT COUNT(DISTINCT uid) FROM dws_dau_di WHERE ds = 20260920',
      schema_context: 'dws_dau_di(ds STRING, uid STRING)',
    })

    // One assertion spanning all three slots: swapping any two goes red.
    expect(judge).toContain(
      '### User Question\n'
      + '昨天有多少 DAU？\n'
      + '\n### Data Table Schema Context\n'
      + 'dws_dau_di(ds STRING, uid STRING)\n'
      + '\n### Generated SQL\n'
      + '```sql\n'
      + 'SELECT COUNT(DISTINCT uid) FROM dws_dau_di WHERE ds = 20260920\n'
      + '```\n',
    )
  })

  it('demands a strict JSON verdict over the five scoring dimensions', () => {
    const judge = buildJudgePromptEN({ question: 'q', generated_sql: 'SELECT 1', schema_context: 's' })

    expect(judge).toContain(
      'Output strictly the following JSON (no other content):\n'
      + '```json\n'
      + '{\n'
      + '  "table_selection": 0 or 1,\n'
      + '  "field_selection": 0 or 1,\n'
      + '  "filter_conditions": 0 or 1,\n'
      + '  "aggregation_logic": 0 or 1,\n'
      + '  "overall_semantics": 0 or 1,\n'
      + '  "rationale": "one-sentence summary of the judgment reasoning"\n'
      + '}\n'
      + '```',
    )
    // The no-aggregation escape clause is what keeps simple lookups scorable.
    expect(judge).toContain(
      'If the question does not involve aggregation and the SQL does not use aggregation, score 1.',
    )
  })
})
