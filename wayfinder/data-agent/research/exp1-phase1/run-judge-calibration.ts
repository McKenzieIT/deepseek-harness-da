#!/usr/bin/env npx tsx
/**
 * GA-EXP1 Phase 1 — Judge Calibration Runner
 *
 * Runs the LLM-as-judge prompt on the 20 ground-truth tables, comparing
 * judge verdicts against human annotations to measure judge accuracy.
 *
 * Usage:
 *   EVAL_LLM_PROVIDER=aga EVAL_LLM_MODEL=<model> npx tsx run-judge-calibration.ts
 *
 * Output: judge-calibration-results.json in the same directory.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '../../../..')
const TABLES_DIR = join(REPO_ROOT, 'examples/k11-semantic-layer/tables')
const GROUND_TRUTH_PATH = join(__dirname, 'ground-truth-20.yaml')

// ── LLM wiring (reuse the project's LLM infrastructure) ─────────────────

async function bootLlm() {
  const { Context } = await import('@deepseek-ai/cordis')
  const { LlmRuntime, BlockAssembler, createUserMessage } = await import('@deepseek-ai/dsh-llm')
  const llmDashscope = await import('@deepseek-ai/dsh-llm-dashscope')

  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(llmDashscope)

  const provider = process.env.EVAL_LLM_PROVIDER || 'aga'
  const model = process.env.EVAL_LLM_MODEL
  if (!model) {
    console.error('Error: EVAL_LLM_MODEL env var required')
    process.exit(1)
  }

  async function completeText(prompt: string): Promise<string> {
    const assembler = new BlockAssembler()
    const options = {
      provider,
      model,
      temperature: 0,
      messages: [
        createUserMessage({
          content: [{ type: 'text' as const, text: prompt }],
          source: { kind: 'plugin' as const, plugin: 'exp1-judge-calibration' },
        }),
      ],
    }
    for await (const chunk of (ctx as any).llm.stream(options)) assembler.push(chunk)
    const blocks = assembler.blocks()
    const text = blocks
      .filter((b: any): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
    if (text.length > 0) return text
    const reasoning = blocks
      .filter((b: any): b is { type: 'reasoning'; text: string } => b.type === 'reasoning')
      .map((b: any) => b.text)
      .join('')
    return reasoning || ''
  }

  return { completeText, provider, model }
}

// ── Judge prompt (from judge-calibration-report.md §2.2) ─────────────────

function buildCalibrationJudgePrompt(table: {
  table_name: string
  engine: string
  table_comment: string
  partitions: string
  columns_text: string
  proposed: {
    kind: string
    primary_key: string[]
    label_columns: string[]
    freshness: string
  }
}): string {
  return `You are a data modeling expert acting as a correctness judge. Given a table's schema and a proposed set of modeling attributes, evaluate whether each attribute is correct.

## Table Schema

Table name: ${table.table_name}
Engine: ${table.engine}
Table comment: ${table.table_comment}
Partitions: ${table.partitions}

Columns:
${table.columns_text}

## Proposed Attributes

kind: ${table.proposed.kind}
primary_key: ${JSON.stringify(table.proposed.primary_key)}
label_columns: ${JSON.stringify(table.proposed.label_columns)}
freshness: ${table.proposed.freshness}

## Evaluation Instructions

For each attribute, judge whether the proposed value is correct:

1. **kind**: Is this table correctly classified?
   - dim: static/slowly-changing reference table used for JOINs (lookup)
   - dws: wide/fact table with measures, typically partitioned by ds
   - Consider: table comment, column mix (dimensions vs measures), naming pattern, partition structure

2. **primary_key**: Do these columns uniquely identify each row?
   - Check: do the proposed PK columns exist? Are they plausible identifiers?
   - For daily-snapshot tables (_df), ds should typically be part of the PK
   - For dimension tables, the PK is the lookup key used in JOINs
   - An empty PK is wrong if the table has obvious identifier columns

3. **label_columns**: Are these human-readable name/description columns?
   - Label columns provide display text when the PK is an ID/code
   - Must exist in the column list; should be STRING type with descriptive content
   - An empty list is wrong if the table has obvious name/description columns

4. **freshness**: Does this match the table's update pattern?
   - static_reference: no partition, configuration/reference data
   - daily_snapshot (_df suffix): daily full snapshot, partitioned by ds
   - daily_incremental (_di suffix): daily increment/delta
   - Check: partition structure, table name suffix (_df/_di/_od), table comment

## Output Format

Return JSON only (no other text):
{
  "kind": {"correct": true/false, "reason": "..."},
  "primary_key": {"correct": true/false, "reason": "...", "suggested": [...]},
  "label_columns": {"correct": true/false, "reason": "...", "suggested": [...]},
  "freshness": {"correct": true/false, "reason": "...", "suggested": "..."},
  "overall_score": 0-4
}

Be strict. If the proposed value is partially correct (e.g., PK missing a column), mark incorrect and suggest the fix.`
}

// ── Main ─────────────────────────────────────────────────────────────────

interface GroundTruthEntry {
  table_name: string
  complexity: string
  col_count: number
  ground_truth: {
    kind: string
    primary_key: string[]
    label_columns: string[]
    freshness: string
  }
  heuristic_output: {
    kind: string | null
    primary_key: string[] | null
    label_columns: string[] | null
    freshness: string | null
  }
  heuristic_correct: Record<string, boolean>
}

function loadTableYaml(tableName: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(join(TABLES_DIR, `${tableName}.yaml`), 'utf-8')
    return parseYaml(raw) as Record<string, unknown>
  } catch { return null }
}

function formatColumns(yaml: Record<string, unknown>): string {
  const cols = yaml.columns as Array<{ name: string; type: string; comment?: string; role?: string }> | undefined
  if (!cols?.length) return '(no columns)'
  return cols.map(c => `- ${c.name} (${c.type}${c.comment ? ', ' + c.comment : ''}${c.role ? ', role=' + c.role : ''})`).join('\n')
}

function formatPartitions(yaml: Record<string, unknown>): string {
  const parts = yaml.partitions as Array<{ name: string; type: string }> | undefined
  if (!parts?.length) return '(none)'
  return parts.map(p => `${p.name} (${p.type})`).join(', ')
}

async function main() {
  console.log('GA-EXP1 Phase 1 — Judge Calibration Runner\n')

  // Load ground truth
  const gtRaw = readFileSync(GROUND_TRUTH_PATH, 'utf-8')
  const gtEntries = parseYaml(gtRaw) as GroundTruthEntry[]
  console.log(`Loaded ${gtEntries.length} ground truth entries\n`)

  // Boot LLM
  const { completeText, provider, model } = await bootLlm()
  console.log(`LLM: ${provider}/${model}\n`)

  const results: Array<{
    table_name: string
    heuristic_proposed: Record<string, unknown>
    judge_verdict: Record<string, unknown> | null
    ground_truth: Record<string, unknown>
    field_accuracy: Record<string, boolean>
    error?: string
  }> = []

  for (const entry of gtEntries) {
    const yaml = loadTableYaml(entry.table_name)
    if (!yaml) {
      console.log(`  SKIP ${entry.table_name} — YAML not found`)
      continue
    }

    // Build heuristic-proposed attributes (what we're asking the judge to evaluate)
    const heuristicKind = entry.heuristic_output.kind ?? (entry.table_name.startsWith('dim_') ? 'dim' : '')
    const heuristicPK = entry.heuristic_output.primary_key ?? []
    const heuristicLabels = entry.heuristic_output.label_columns ?? []
    const heuristicFreshness = entry.heuristic_output.freshness ?? ''

    const prompt = buildCalibrationJudgePrompt({
      table_name: entry.table_name,
      engine: (yaml.engine as string) ?? 'maxcompute',
      table_comment: (yaml.table_comment as string) ?? '',
      partitions: formatPartitions(yaml),
      columns_text: formatColumns(yaml),
      proposed: {
        kind: heuristicKind,
        primary_key: heuristicPK,
        label_columns: heuristicLabels,
        freshness: heuristicFreshness,
      },
    })

    process.stdout.write(`  ${entry.table_name}... `)
    try {
      const raw = await completeText(prompt)
      // Extract JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.log('FAIL (no JSON in response)')
        results.push({
          table_name: entry.table_name,
          heuristic_proposed: { kind: heuristicKind, primary_key: heuristicPK, label_columns: heuristicLabels, freshness: heuristicFreshness },
          judge_verdict: null,
          ground_truth: entry.ground_truth,
          field_accuracy: {},
          error: 'No JSON in response',
        })
        continue
      }

      const verdict = JSON.parse(jsonMatch[0])

      // Compare judge verdict with ground truth
      const fieldAccuracy: Record<string, boolean> = {}
      for (const field of ['kind', 'primary_key', 'label_columns', 'freshness'] as const) {
        const gtCorrect = entry.heuristic_correct[field]
        const judgeCorrect = verdict[field]?.correct
        // Judge agrees with ground truth if both say correct or both say incorrect
        fieldAccuracy[field] = gtCorrect === judgeCorrect
      }

      const agree = Object.values(fieldAccuracy).filter(Boolean).length
      const total = Object.values(fieldAccuracy).length
      console.log(`OK (${agree}/${total} agree with GT)`)

      results.push({
        table_name: entry.table_name,
        heuristic_proposed: { kind: heuristicKind, primary_key: heuristicPK, label_columns: heuristicLabels, freshness: heuristicFreshness },
        judge_verdict: verdict,
        ground_truth: entry.ground_truth,
        field_accuracy: fieldAccuracy,
      })
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
      results.push({
        table_name: entry.table_name,
        heuristic_proposed: { kind: heuristicKind, primary_key: heuristicPK, label_columns: heuristicLabels, freshness: heuristicFreshness },
        judge_verdict: null,
        ground_truth: entry.ground_truth,
        field_accuracy: {},
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Summary
  console.log('\n═══ Calibration Summary ═══\n')
  const successful = results.filter(r => r.judge_verdict !== null)
  const fieldTotals: Record<string, { agree: number; total: number }> = {}
  for (const r of successful) {
    for (const [field, agrees] of Object.entries(r.field_accuracy)) {
      if (!fieldTotals[field]) fieldTotals[field] = { agree: 0, total: 0 }
      fieldTotals[field].total++
      if (agrees) fieldTotals[field].agree++
    }
  }

  console.log('Field-level judge accuracy (agreement with ground truth):')
  let totalAgree = 0, totalFields = 0
  for (const [field, counts] of Object.entries(fieldTotals)) {
    const pct = ((counts.agree / counts.total) * 100).toFixed(1)
    console.log(`  ${field.padEnd(15)} ${counts.agree}/${counts.total} (${pct}%)`)
    totalAgree += counts.agree
    totalFields += counts.total
  }
  const overallPct = ((totalAgree / totalFields) * 100).toFixed(1)
  console.log(`  ${'OVERALL'.padEnd(15)} ${totalAgree}/${totalFields} (${overallPct}%)`)
  console.log(`\nSuccess criterion: ≥85%. Result: ${Number(overallPct) >= 85 ? 'PASS' : 'FAIL'}`)

  // Write results
  const outputPath = join(__dirname, 'judge-calibration-results.json')
  writeFileSync(outputPath, JSON.stringify({ model: `${provider}/${model}`, results, summary: { fieldTotals, overallPct } }, null, 2))
  console.log(`\nResults written to: ${outputPath}`)
}

main().catch(err => { console.error(err); process.exit(1) })
