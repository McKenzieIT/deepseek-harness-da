/**
 * CLI entry point for the eval runner.
 *
 * Usage:
 *   dsh-eval --cases <dir> [--schema <dir>] [--output <dir>] [--pass-k <n>]
 *            [--case <id>] [--skip-health-gate] [--provider <name>]
 *            [--model <name>] [--today <YYYYMMDD>] [--run-id <id>]
 *            [--no-sql-judge]
 *            [--responder engine|harness] [--variant A|B|C|D]
 */
import { parseArgs } from 'node:util'
import { resolve, join, dirname } from 'node:path'
import { readdirSync, existsSync } from 'node:fs'

function findRepoRoot(): string {
  let dir = resolve('.')
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'packages')) && existsSync(join(dir, 'examples'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve('.')
}

const REPO_ROOT = findRepoRoot()
import { loadCases } from '@deepseek-ai/dsh-eval'
import { runBatch, writeRunResult, defaultOutputPath } from '@deepseek-ai/dsh-eval-runner'
import { boot } from './context.ts'
import { formatReport } from './report.ts'

interface CliArgs {
  cases: string
  schema: string
  output: string
  passK: number
  caseFilter: string | null
  skipHealthGate: boolean
  provider: string
  model: string
  today: string
  runId: string | null
  concurrency: number
  withQuery: boolean
  sidecarPath: string | null
  noSqlJudge: boolean
  queryExpansion: boolean
  responder: 'engine' | 'harness'
  variant: string | null
}

function str(v: string | boolean | undefined, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      cases: { type: 'string' },
      schema: { type: 'string' },
      output: { type: 'string', default: 'eval-results/' },
      'pass-k': { type: 'string', default: '3' },
      case: { type: 'string' },
      'skip-health-gate': { type: 'boolean', default: false },
      provider: { type: 'string', default: 'aga' },
      model: { type: 'string', default: 'qwen3.7-max' },
      today: { type: 'string' },
      'run-id': { type: 'string' },
      concurrency: { type: 'string', default: '1' },
      'with-query': { type: 'boolean', default: false },
      sidecar: { type: 'string' },
      'no-sql-judge': { type: 'boolean', default: false },
      'no-query-expansion': { type: 'boolean', default: false },
      responder: { type: 'string', default: 'engine' },
      variant: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: false,
  })

  if (values.help === true) {
    printUsage()
    process.exit(0)
  }

  const casesVal = values.cases
  if (typeof casesVal !== 'string') {
    console.error('Error: --cases <dir> is required\n')
    printUsage()
    process.exit(1)
  }

  const caseVal = values.case
  const runIdVal = values['run-id']
  const responderVal = str(values.responder, 'engine')
  const variantVal = values.variant

  if (responderVal !== 'engine' && responderVal !== 'harness') {
    console.error(`Error: --responder must be 'engine' or 'harness', got '${responderVal}'`)
    process.exit(1)
  }
  if (responderVal === 'harness') {
    const valid = ['A', 'B', 'C', 'D']
    if (typeof variantVal !== 'string' || !valid.includes(variantVal.toUpperCase())) {
      console.error('Error: --variant must be one of A, B, C, D when --responder harness')
      process.exit(1)
    }
  }

  return {
    cases: resolve(casesVal),
    schema: typeof values.schema === 'string' ? resolve(values.schema) : join(REPO_ROOT, 'examples/k11-semantic-layer'),
    output: resolve(str(values.output, 'eval-results/')),
    passK: Number.parseInt(str(values['pass-k'], '3'), 10),
    caseFilter: typeof caseVal === 'string' ? caseVal : null,
    skipHealthGate: values['skip-health-gate'] === true,
    provider: str(values.provider, 'aga'),
    model: str(values.model, 'qwen3.7-max'),
    today: str(values.today, formatToday()),
    runId: typeof runIdVal === 'string' ? runIdVal : null,
    concurrency: Number.parseInt(str(values.concurrency, '1'), 10),
    withQuery: values['with-query'] === true,
    sidecarPath: typeof values.sidecar === 'string' ? values.sidecar : null,
    noSqlJudge: values['no-sql-judge'] === true,
    queryExpansion: values['no-query-expansion'] !== true,
    responder: responderVal as 'engine' | 'harness',
    variant: typeof variantVal === 'string' ? variantVal.toUpperCase() : null,
  }
}

function formatToday(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

function printUsage(): void {
  console.log(`
  dsh-eval — standalone eval CLI runner

  Usage:
    dsh-eval --cases <dir> [options]

  Options:
    --cases <dir>          Case directory (required)
    --schema <dir>         Schema directory [default: <repo>/examples/k11-semantic-layer/]
    --output <dir>         Output directory for results [default: eval-results/]
    --pass-k <n>           Pass@K attempts per case [default: 3]
    --case <id>            Run only a single case by case_id
    --skip-health-gate     Skip the health gate pre-flight
    --provider <name>      LLM provider [default: aga]
    --model <name>         LLM model [default: qwen3.7-max]
    --today <YYYYMMDD>     Reference date for time-param extraction
    --run-id <id>          Explicit run ID (default: auto-generated UUID)
    --concurrency <n>      Parallel case execution [default: 1]
    --with-query           Mount query-maxcompute for real SQL execution
    --sidecar <path>       Path to MaxCompute sidecar script
    --no-sql-judge         Disable SQL semantic judge (auto-pass when no executor)
    --no-query-expansion   Disable LLM query expansion before BM25 retrieval
    --responder <mode>     Responder mode: 'engine' (NL2SQL pipeline) or 'harness'
                           (full agent with preset orchestration) [default: engine]
    --variant <A|B|C|D>    G1b experiment variant (required when --responder harness)
                           A = phase-gate, B = free ReAct + planning,
                           C = hybrid (phase-gate + planning), D = bare ReAct
    --help                 Show this help

  Environment:
    DASHSCOPE_API_KEY      API key for the DashScope LLM provider (required)
    ODPS_ACCESS_ID         MaxCompute access ID (when --with-query)
    ODPS_ACCESS_KEY        MaxCompute access key (when --with-query)
    ODPS_PROJECT           MaxCompute project name (when --with-query)
    ODPS_ENDPOINT          MaxCompute endpoint (when --with-query)
`)
}

function globCasePaths(caseDir: string, caseFilter: string | null): string[] {
  const files = readdirSync(caseDir)
    .filter(f => /\.(yaml|yml|json)$/.test(f))
    .filter(f => /^[a-z0-9]+(_[a-z0-9]+)*_\d+\./i.test(f))
    .sort()

  if (caseFilter !== null) {
    const matched = files.filter(f => f.includes(caseFilter))
    if (matched.length === 0) {
      console.error(`Error: no case file matching "${caseFilter}" in ${caseDir}`)
      process.exit(1)
    }
    return matched.map(f => join(caseDir, f))
  }

  return files.map(f => join(caseDir, f))
}

export async function main(): Promise<void> {
  const args = parseCliArgs()

  if (!process.env.DASHSCOPE_API_KEY) {
    console.error('Error: DASHSCOPE_API_KEY environment variable is not set')
    process.exit(1)
  }

  // Glob and load cases
  const casePaths = globCasePaths(args.cases, args.caseFilter)
  const cases = loadCases(casePaths)
  console.log(`  Loading ${casePaths.length} case(s) from ${args.cases}`)
  console.log(`  Schema: ${args.schema}`)
  console.log(`  Model: ${args.provider}/${args.model}`)
  console.log(`  Responder: ${args.responder}${args.variant ? ` (variant ${args.variant})` : ''}`)
  console.log(`  Pass@K: ${args.passK}  Concurrency: ${args.concurrency}`)
  if (!args.noSqlJudge && !args.withQuery) {
    console.log('  SQL Semantic Judge: enabled (use --no-sql-judge to disable)')
  }
  console.log('')

  // Build Collaborators based on responder mode
  let collaborators: import('@deepseek-ai/dsh-eval-runner').Collaborators
  if (args.responder === 'harness') {
    // G1b: full agent with variant preset orchestration
    const { HarnessAgentResponder } = await import('./harness-responder.ts')
    const { LlmSqlSemanticJudge } = await import('@deepseek-ai/dsh-eval-runner')
    const variant = args.variant as 'A' | 'B' | 'C' | 'D'
    const agent = new HarnessAgentResponder({
      schemaDir: args.schema,
      provider: args.provider,
      model: args.model,
      variant,
      withQuery: args.withQuery,
      ...(args.sidecarPath !== null ? { sidecarPath: args.sidecarPath } : {}),
      today: args.today,
    })

    // SQL Judge for harness mode (reuses the same LLM)
    let sqlJudge: import('@deepseek-ai/dsh-eval-runner').SqlSemanticJudge | null = null
    if (!args.noSqlJudge) {
      const { BlockAssembler, createUserMessage: createMsg } = await import('@deepseek-ai/dsh-llm')
      const { Context: Ctx } = await import('@deepseek-ai/cordis')
      const { LlmRuntime: LlmRt } = await import('@deepseek-ai/dsh-llm')
      const dashscope = await import('@deepseek-ai/dsh-llm-dashscope')
      // Boot a lightweight ctx just for the judge LLM
      const judgeCtx = new Ctx()
      await judgeCtx.plugin(LlmRt)
      await judgeCtx.plugin(dashscope)
      sqlJudge = new LlmSqlSemanticJudge(async (prompt: string) => {
        const assembler = new BlockAssembler()
        const options = {
          provider: args.provider,
          model: args.model,
          messages: [createMsg({
            content: [{ type: 'text' as const, text: prompt }],
            source: { kind: 'plugin' as const, plugin: 'eval-cli-judge' },
          })],
        }
        for await (const chunk of judgeCtx.llm.stream(options)) assembler.push(chunk)
        const blocks = assembler.blocks()
        const text = blocks
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
          .join('')
        if (text.length > 0) return text
        const reasoning = blocks
          .filter((b): b is { type: 'reasoning'; text: string } => b.type === 'reasoning')
          .map(b => b.text)
          .join('')
        return reasoning || ''
      })
    }

    collaborators = { agent, sqlJudge }
  } else {
    // Default: NL2SQL engine pipeline (existing behavior)
    const { collaborators: engineCollabs } = await boot({
      schemaDir: args.schema,
      provider: args.provider,
      model: args.model,
      today: args.today,
      withQuery: args.withQuery,
      noSqlJudge: args.noSqlJudge,
      queryExpansion: args.queryExpansion,
      ...(args.sidecarPath !== null ? { sidecarPath: args.sidecarPath } : {}),
    })
    collaborators = engineCollabs
  }

  // Run the batch via eval-runner's runBatch (explicit case paths)
  const started = Date.now()
  console.log('  Running eval batch...')

  const result = await runBatch(casePaths, collaborators, {
    pass_k: args.passK,
    skip_health_gate: args.skipHealthGate,
    ...(args.runId !== null ? { run_id: args.runId } : {}),
    concurrency: args.concurrency,
    on_progress: (completed, total, caseId) => {
      process.stdout.write(`\r  Progress: ${completed}/${total} (${caseId})`)
    },
  })

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n  Completed in ${elapsed}s`)

  // Persist result
  const outputPath = defaultOutputPath(result.run_id, args.output)
  writeRunResult(result, outputPath)
  console.log(`  Results written to: ${outputPath}`)

  // Print report
  console.log(formatReport(result, cases))
}
