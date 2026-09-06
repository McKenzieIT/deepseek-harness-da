/**
 * GA-EVAL-EVENTDEF-PREFETCH — false-positive probe for the event detector.
 *
 * `src/event-detect.ts` ships on ONE safety property: it never routes a DWS
 * question to an event definition, and never routes an event question to the
 * wrong event. A false positive is worse than no detection at all — it points the
 * model at the event view for a question whose answer lives in a DWS summary
 * table, producing a plausible wrong value the semantic judge accepts (038
 * expects 552 from `act_fst=1`; the event view yields 510).
 *
 * That property cannot be unit-tested: it is a property of a live model's
 * judgement over the real semantic layer's `alt_labels`. So it lives here, as a
 * probe to re-run whenever the detection prompt, the detection model, or the
 * scope's `alt_labels` change. It exercises the REAL `src/event-detect.ts`, not
 * a copy, and exits non-zero on any false positive.
 *
 * Ground truth comes from each case's `dimensions.data_source` (event|dws) plus
 * the `event = '...'` literal in `expected.sql`. Note the stricter-than-the-
 * risk-gate FP definition: an event case routed to the WRONG event counts as a
 * false positive here, not a miss (the risk gate scored those as FN and so
 * reported FP=0 where this probe reports the 122 → `DungeonOnkeyPass` fault).
 *
 * Requires the curated case set at `packages/eval/eval/cases/rbi-10000251-exec`
 * (39 EXEC cases, not git-tracked) and a DashScope key via `~/.dsh/.credentials.yaml`.
 * Baseline as of 2026-09-06: TP=6, FP=0, TN=21, FN=12 (the 12 misses are all
 * lexical-stage: no `alt_label` matched — bounded recall, not precision).
 *
 * Run: node --import tsx/esm packages/eval/eval-cli/dev/event-detect-fp-probe.ts
 */
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as llmDashscope from '@deepseek-ai/dsh-llm-dashscope'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { SemanticLayerService } from '@deepseek-ai/dsh-semantic-layer'
import { detectEventName, type CorpusItemLike } from '../src/event-detect.ts'

const REPO_ROOT = join(import.meta.dirname, '../../../..')
const CASE_DIR = join(REPO_ROOT, 'packages/eval/eval/cases/rbi-10000251-exec')
const SCHEMA_DIR = join(REPO_ROOT, 'examples/k11-semantic-layer')
const CONCURRENCY = 3

interface Case {
  readonly id: string
  readonly question: string
  /** 'event' | 'dws' */
  readonly dataSource: string
  /** the expected event name for event cases, else null */
  readonly expectedEvent: string | null
}

function loadCases(): Case[] {
  const out: Case[] = []
  for (const f of readdirSync(CASE_DIR).filter(n => n.endsWith('.yaml')).sort()) {
    const raw = readFileSync(join(CASE_DIR, f), 'utf8')
    const id = f.replace(/^eval_10000251_/, '').replace(/\.yaml$/, '')
    const question = raw.match(/^\s*question:\s*(.+)$/m)?.[1]?.trim() ?? ''
    const dataSource = raw.match(/^\s*data_source:\s*(\S+)\s*$/m)?.[1] ?? '?'
    const expectedEvent = raw.match(/event\s*=\s*'([^']+)'/)?.[1] ?? null
    out.push({ id, question, dataSource, expectedEvent })
  }
  return out
}

async function boot(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LocalCredentialProvider, {
    path: join(homedir(), '.dsh', '.credentials.yaml'),
    dshHome: join(homedir(), '.dsh'),
  })
  await ctx.plugin(llmDashscope)
  await ctx.plugin(SemanticLayerService, { semanticRoot: SCHEMA_DIR, scopeId: '10000251' })
  return ctx
}

function makeComplete(ctx: Context): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const assembler = new BlockAssembler()
    const options = {
      provider: 'aga',
      model: 'qwen3.7-max',
      temperature: 0.1,
      maxTokens: 64,
      messages: [
        createUserMessage({
          content: [{ type: 'text' as const, text: prompt }],
          source: { kind: 'plugin' as const, plugin: 'eval-cli-probe' },
        }),
      ],
    }
    for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
    const blocks = assembler.blocks()
    const text = blocks.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map(b => b.text).join('').trim()
    if (text.length > 0) return text
    const reasoning = blocks.filter((b): b is { type: 'reasoning'; text: string } => b.type === 'reasoning').map(b => b.text).join('').trim()
    return reasoning
  }
}

async function main(): Promise<void> {
  const cases = loadCases()
  const ctx = await boot()
  const schema = ctx.get('schema') as { loadRetrievalCorpusAll?(): unknown[] } | undefined
  const corpus = (schema?.loadRetrievalCorpusAll?.() ?? []) as CorpusItemLike[]
  console.log(`corpus=${corpus.length} items, cases=${cases.length}`)
  const deps = { corpus, complete: makeComplete(ctx) }

  const results = new Map<string, { picked: string | null; cands: string[] }>()
  let cursor = 0
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = cursor++
      const c = cases[i]
      if (c === undefined) return
      const t0 = Date.now()
      const det = await detectEventName(deps, c.question)
      results.set(c.id, { picked: det.eventName, cands: det.candidates.map(x => x.name) })
      console.log(`[${c.id}] ${((Date.now() - t0) / 1000).toFixed(1)}s picked=${det.eventName ?? 'NONE'} cands=[${det.candidates.map(x => x.name).join(',')}]`)
    }
  })
  await Promise.all(workers)

  let tp = 0, fp = 0, tn = 0, fn = 0
  const rows: string[] = []
  for (const c of cases) {
    const r = results.get(c.id)
    const picked = r?.picked ?? null
    const isEventCase = c.dataSource === 'event'
    let verdict: string
    if (isEventCase) {
      if (picked === null) { fn++; verdict = 'FN' }
      else if (picked === c.expectedEvent) { tp++; verdict = 'TP' }
      else { fp++; verdict = 'FP(wrong-event)' }
    } else {
      if (picked === null) { tn++; verdict = 'TN' }
      else { fp++; verdict = 'FP' }
    }
    rows.push(`${verdict.padEnd(15)} ${c.id} ds=${c.dataSource.padEnd(5)} exp=${(c.expectedEvent ?? '—').padEnd(22)} got=${(picked ?? 'NONE').padEnd(22)} cands=[${(r?.cands ?? []).join(',')}] ${c.question}`)
  }
  console.log('\n=== per-case ===')
  for (const line of rows) console.log(line)
  console.log(`\n=== TOTALS === TP=${tp} FP=${fp} TN=${tn} FN=${fn}  (expected from risk gate: TP=7 FP=0 TN=21 FN=11)`)
  if (fp > 0) console.log('!!! FP > 0 — DO NOT SHIP: injecting an event definition for a DWS question returns a silently wrong value.')
  process.exit(fp > 0 ? 1 : 0)
}

void main()
