/**
 * CL-9: Batch LLM enrichment of DWS tables with pref_label + alt_labels.
 *
 * Phase 1 (default): call LLM for all uncovered DWS tables → review JSON
 * Phase 2 (--write):  read review JSON → write pref_label + alt_labels into YAML
 *
 * Usage:
 *   DASHSCOPE_API_KEY=xxx npx tsx packages/eval/retrieval-experiment/scripts/batch-enrich-alt-labels.ts
 *   npx tsx packages/eval/retrieval-experiment/scripts/batch-enrich-alt-labels.ts --write
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadTables } from '@deepseek-ai/dsh-semantic-layer/src/io.ts'
import { TableDefinitionSchema } from '@deepseek-ai/dsh-semantic-layer/src/types.ts'

const SEMANTIC_ROOT = join(import.meta.dirname!, '../../../../examples/k11-semantic-layer')
const REVIEW_DIR = join(import.meta.dirname!, '../../../../eval-results/cl9')
const REVIEW_FILE = join(REVIEW_DIR, 'enrichment-review.json')

const API_KEY = process.env.DASHSCOPE_API_KEY || ''
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = 'qwen-plus'
const CONCURRENCY = 5

interface EnrichmentSuggestion {
  table_name: string
  table_comment: string
  pref_label: string
  alt_labels: string[]
  status: 'ok' | 'error'
  error?: string
}

function buildPrompt(def: {
  table_name: string
  table_comment: string
  description: string
  domains: string[]
  columns: Array<{ name: string; comment?: string }>
}): string {
  const colSummary = def.columns
    .filter(c => c.comment)
    .slice(0, 25)
    .map(c => `  - ${c.name}: ${c.comment}`)
    .join('\n')

  return `你是一个游戏数据分析领域的语义标注专家。请为以下数据表生成搜索标签，帮助用户用自然语言找到这张表。

表名: ${def.table_name}
表注释: ${def.table_comment}
描述: ${def.description || '(无)'}
业务域: ${def.domains.join(', ') || '(无)'}
主要字段:
${colSummary || '(无)'}

请返回一个 JSON 对象，格式如下：
{
  "pref_label": "简短的中文表名（2-10字，去掉前缀如'商业化-'）",
  "alt_labels": ["标签1", "标签2", ...]
}

alt_labels 要求：
- 3-10 个标签
- 每个标签 2-6 个字符（中文或英文缩写）
- 必须是用户在自然语言提问中实际会用的词（游戏业务术语、缩写、口语化表达）
- 不是表名的翻译，而是业务概念词
- 包含：核心业务概念、常用缩写（如 ARPU/DAU/LTV）、口语化说法
- 不要包含太泛的词（如"数据"、"表"、"统计"）
- 不要重复 pref_label 中已有的词

示例：
- 付费订单总表 → ["付费", "充值", "订单", "金额", "ARPU", "ARPPU", "消费"]
- 新增用户表 → ["新增", "新注", "拉新", "注册"]
- PVP对战表 → ["PVP", "对战", "演武", "竞技"]

只返回 JSON，不要其他内容。`
}

async function callLlm(prompt: string): Promise<string> {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`DashScope ${resp.status}: ${text.slice(0, 300)}`)
  }
  const data = await resp.json() as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0]?.message?.content ?? ''
}

function parseResponse(text: string): { pref_label: string; alt_labels: string[] } | null {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  t = fence?.[1]?.trim() ?? t
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    const obj = JSON.parse(t.slice(start, end + 1))
    if (typeof obj.pref_label !== 'string') return null
    if (!Array.isArray(obj.alt_labels)) return null
    const alt_labels = obj.alt_labels
      .filter((x: unknown): x is string => typeof x === 'string')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length >= 2 && s.length <= 50)
    return { pref_label: obj.pref_label.trim(), alt_labels }
  } catch {
    return null
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, idx: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx]!, idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

async function phase1(): Promise<void> {
  if (!API_KEY) {
    console.error('DASHSCOPE_API_KEY not set')
    process.exit(1)
  }

  const allTables = loadTables(SEMANTIC_ROOT)
  const uncovered: Array<{ table_name: string; raw: Record<string, unknown> }> = []

  for (const t of allTables) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success) continue
    if (r.data.kind === 'dim') continue
    if (r.data.alt_labels.length > 0) continue
    uncovered.push({ table_name: t.table_name, raw: t.raw })
  }

  console.log(`Found ${uncovered.length} DWS tables without alt_labels`)

  const results = await runWithConcurrency(
    uncovered,
    async (item, idx) => {
      const parsed = TableDefinitionSchema.parse(item.raw)
      const prompt = buildPrompt({
        table_name: parsed.table_name,
        table_comment: parsed.table_comment,
        description: parsed.description || '',
        domains: parsed.domains,
        columns: parsed.columns.map(c => ({ name: c.name, comment: c.comment })),
      })

      try {
        const response = await callLlm(prompt)
        const result = parseResponse(response)
        if (!result) {
          console.log(`[${idx + 1}/${uncovered.length}] ERROR (parse): ${item.table_name}`)
          return {
            table_name: item.table_name,
            table_comment: parsed.table_comment,
            pref_label: '',
            alt_labels: [],
            status: 'error' as const,
            error: `Failed to parse LLM response: ${response.slice(0, 200)}`,
          }
        }
        console.log(`[${idx + 1}/${uncovered.length}] OK: ${item.table_name} → ${result.pref_label} [${result.alt_labels.join(', ')}]`)
        return {
          table_name: item.table_name,
          table_comment: parsed.table_comment,
          pref_label: result.pref_label,
          alt_labels: result.alt_labels,
          status: 'ok' as const,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.log(`[${idx + 1}/${uncovered.length}] ERROR (api): ${item.table_name}: ${msg.slice(0, 100)}`)
        return {
          table_name: item.table_name,
          table_comment: parsed.table_comment,
          pref_label: '',
          alt_labels: [],
          status: 'error' as const,
          error: msg,
        }
      }
    },
    CONCURRENCY,
  )

  if (!existsSync(REVIEW_DIR)) mkdirSync(REVIEW_DIR, { recursive: true })
  writeFileSync(REVIEW_FILE, JSON.stringify(results, null, 2))

  const ok = results.filter(r => r.status === 'ok').length
  const err = results.filter(r => r.status === 'error').length
  console.log(`\nDone: ${ok} ok, ${err} errors. Review file: ${REVIEW_FILE}`)
}

async function phase2(): Promise<void> {
  if (!existsSync(REVIEW_FILE)) {
    console.error(`Review file not found: ${REVIEW_FILE}`)
    process.exit(1)
  }

  const suggestions: EnrichmentSuggestion[] = JSON.parse(readFileSync(REVIEW_FILE, 'utf-8'))
  const tablesDir = join(SEMANTIC_ROOT, 'tables')

  let written = 0
  let skipped = 0
  for (const s of suggestions) {
    if (s.status !== 'ok' || !s.pref_label || s.alt_labels.length === 0) {
      skipped++
      continue
    }
    const filePath = join(tablesDir, `${s.table_name}.yaml`)
    if (!existsSync(filePath)) {
      console.log(`SKIP (not found): ${s.table_name}`)
      skipped++
      continue
    }
    const content = readFileSync(filePath, 'utf-8')
    if (content.includes('alt_labels:')) {
      console.log(`SKIP (already has): ${s.table_name}`)
      skipped++
      continue
    }

    const altLabelsYaml = `pref_label: ${s.pref_label}\nalt_labels:\n${s.alt_labels.map(a => `  - ${a}`).join('\n')}\n`
    const updated = content.trimEnd() + '\n' + altLabelsYaml
    writeFileSync(filePath, updated)
    console.log(`WRITE: ${s.table_name} → ${s.pref_label} [${s.alt_labels.join(', ')}]`)
    written++
  }

  console.log(`\nDone: ${written} written, ${skipped} skipped`)
}

const isWrite = process.argv.includes('--write')
if (isWrite) {
  await phase2()
} else {
  await phase1()
}
