/**
 * Direct engine trace: runs the NL2SQL engine for one case and prints
 * the full trace (BM25 candidates, SQL, ODPS result).
 *
 * Usage: DASHSCOPE_API_KEY=... npx tsx eval-results/g1b/diag-engine-direct.ts [case_id]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import * as llmDashscope from '@deepseek-ai/dsh-llm-dashscope'
import { Bm25Linker, type DataSourceDoc } from '../../packages/data/nl2sql-engine/src/bm25-linking.ts'
import { Nl2sqlEngine } from '../../packages/data/nl2sql-engine/src/engine.ts'
import type { Llm, LlmGenerateArgs, LlmGenerateResult, OdpsExecutor, QueryOutcome } from '../../packages/data/nl2sql-engine/src/types.ts'

const SCHEMA_DIR = join(import.meta.dirname, '../../examples/k11-semantic-layer/tables')
const CASES_DIR = join(import.meta.dirname, '../../packages/eval/eval/cases/k11-v2')
const CASE_ID = process.argv[2] ?? 'k11v2_001'

if (!process.env.DASHSCOPE_API_KEY) {
  const creds = readFileSync(join(process.env.HOME!, '.dsh/.credentials.yaml'), 'utf8')
  const m = creds.match(/DASHSCOPE_API_KEY:\s*(\S+)/)
  if (m) process.env.DASHSCOPE_API_KEY = m[1]
}

// Load corpus
const files = readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.yaml'))
const dataSources: DataSourceDoc[] = files.map(f => {
  const raw = jsYaml.load(readFileSync(join(SCHEMA_DIR, f), 'utf8')) as any
  return {
    id: raw.table_name,
    description: [raw.table_comment, raw.description].filter(Boolean).join(' '),
    metrics: raw.metrics ?? {},
    payload: raw,
  }
})

// Load case
const caseFile = join(CASES_DIR, `${CASE_ID}.yaml`)
const evalCase = jsYaml.load(readFileSync(caseFile, 'utf8')) as any
const question = evalCase.input.question

console.log(`Case: ${CASE_ID}`)
console.log(`Question: "${question}"`)
console.log(`Expected: ${JSON.stringify(evalCase.expected.result_value)} (${evalCase.expected.match_mode})`)
console.log()

// Boot context
const ctx = new Context()
await ctx.plugin(LlmRuntime)
await ctx.plugin(llmDashscope)

// LLM adapter
class DiagLlm implements Llm {
  async generate(args: LlmGenerateArgs): Promise<LlmGenerateResult> {
    const prompt = args.prompt!
    console.log(`[LLM] Prompt length: ${prompt.length} chars`)
    console.log(`[LLM] Prompt preview: ${prompt.slice(0, 300)}...`)
    console.log()

    const assembler = new BlockAssembler()
    const options = {
      provider: 'aga',
      model: 'qwen3.5-flash',
      messages: [createUserMessage({
        content: [{ type: 'text' as const, text: prompt }],
        source: { kind: 'plugin' as const, plugin: 'diag' },
      })],
    }
    for await (const chunk of (ctx as any).llm.stream(options)) assembler.push(chunk)
    const blocks = assembler.blocks()
    const text = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const reasoning = blocks.filter((b: any) => b.type === 'reasoning').map((b: any) => b.text).join('') || null

    // Try to detect SQL
    const upper = text.trim().toUpperCase()
    const isSql = /^\s*(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(upper)
    if (!isSql && reasoning) {
      const fenced = reasoning.match(/```sql\n([\s\S]*?)```/)
      if (fenced?.[1]) {
        console.log(`[LLM] SQL from reasoning: ${fenced[1].slice(0, 500)}`)
        return { sql: fenced[1], reasoning }
      }
    }

    console.log(`[LLM] Response: ${text.slice(0, 500)}`)
    return { sql: text, reasoning }
  }
  async completeText(prompt: string): Promise<string> {
    const r = await this.generate({ prompt })
    return r.sql
  }
}

// Fake ODPS that just prints what it receives
class DiagOdps implements OdpsExecutor {
  async execute(sql: string): Promise<QueryOutcome> {
    console.log(`\n[ODPS] Would execute: ${sql.slice(0, 500)}`)
    console.log(`[ODPS] (not executing — diagnostic only)`)
    return { state: 'done', rows: [{ placeholder: 'diag-mode' }] } as any
  }
  async attach(id: string): Promise<QueryOutcome> {
    return { state: 'done', rows: [] } as any
  }
}

// Run engine
const linker = new Bm25Linker(dataSources)
const llm = new DiagLlm()
const odps = new DiagOdps()

const lookupDoc = (id: string) => dataSources.find(d => d.id === id)
const engine = new Nl2sqlEngine({ llm, odps, conventions: null, retrieval: linker, lookupDoc })
const result = await engine.run({ question, today: '20260826', evalMode: true })

console.log(`\n=== Engine Result ===`)
console.log(`ok=${result.ok} decline=${result.decline} sql="${result.sql?.slice(0, 200)}"`)
console.log(`Trace steps: ${result.trace.map((t: any) => t.step).join(' → ')}`)
for (const t of result.trace) {
  const tr = t as any
  if (tr.step === 'bm25_linking') {
    console.log(`  BM25 candidates: ${(tr.candidates ?? []).map((c: any) => c.id).join(', ')}`)
  }
}

process.exit(0)
