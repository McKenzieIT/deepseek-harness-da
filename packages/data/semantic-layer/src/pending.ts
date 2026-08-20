/**
 * P6b semantic-layer substrate — Tier-1 pending queue (agent self-modification
 * loop: suggest -> pending -> approve). Mirrors reverse-bi
 * libs/rbi-mcp/src/rbi_mcp/pending_writes.py.
 *
 * Tier-1 = cross-scope self-modification: the agent SUGGESTS what IT reads next
 * round (e.g. event YAML = source-of-truth); it cannot directly write
 * source-of-truth. approve-side registration is gated to P9 admin
 * (`disable_admin` can disable the whole layer). The pending queue lives in
 * `var/` (gitignored runtime data), one JSON file per suggestion.
 *
 * Tier-2 (per-scope persistent write, audit-logged, non-disableable) is NOT
 * here — it routes through `ctx.audit.recordTier2Write` (P6b grilling Q4), via
 * the `Tier2Recorder` interface declared in `io.ts`.
 *
 * HARDENING §1: polluting source-of-truth >> polluting instructions
 * (connects to intranet-security-first).
 *
 * @module @deepseek-ai/dsh-semantic-layer/src/pending
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export interface PendingSuggestion {
  readonly suggestion_id: string
  readonly kind: string
  readonly subject: string
  readonly content: string
  readonly submitted_at: string
  readonly scope_id: string | null
  readonly tenant_id: string | null
  readonly meta: Record<string, unknown>
}

// suggestion_id = timestamp + content short-hash (mirrors pending_writes.submit).
// id-validated (path-traversal gate): ^[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$ — no '.'
// '/' '\' —封 .. / 绝对路径 / 穿越.
const ID_RE = /^[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$/
export function isValidId(id: string | undefined | null): boolean {
  return ID_RE.test(id ?? '')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function stamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T`
    + `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}
function shortHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8)
}

export interface SubmitArgs {
  readonly kind: string
  readonly subject: string
  readonly content: string
  readonly scope_id?: string | null
  readonly tenant_id?: string | null
  readonly meta?: Record<string, unknown>
}

/** Submit a Tier-1 suggestion to the pending queue (does NOT touch source-of-truth). */
export function submit(root: string, args: SubmitArgs): PendingSuggestion {
  mkdirSync(root, { recursive: true })
  const suggestion_id = `${stamp(new Date())}_${shortHash(args.content)}`
  const rec: PendingSuggestion = {
    suggestion_id,
    kind: args.kind,
    subject: args.subject,
    content: args.content,
    submitted_at: new Date().toISOString(),
    scope_id: args.scope_id ?? null,
    tenant_id: args.tenant_id ?? null,
    meta: args.meta ?? {},
  }
  writeFileSync(join(root, `${suggestion_id}.json`), JSON.stringify(rec, null, 2), 'utf8')
  return rec
}

/** Load a pending suggestion by id (invalid/missing/corrupt => null). */
export function load(root: string, suggestion_id: string): PendingSuggestion | null {
  if (!isValidId(suggestion_id)) return null
  const p = join(root, `${suggestion_id}.json`)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as PendingSuggestion
  } catch {
    return null
  }
}

/** List all pending suggestions, oldest first. */
export function listing(root: string): PendingSuggestion[] {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .map(f => load(root, f.replace(/\.json$/, '')))
    .filter((x): x is PendingSuggestion => x !== null)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
}

/** Discard a pending suggestion from the queue (approve consumes the queue). */
export function discard(root: string, suggestion_id: string): boolean {
  if (!isValidId(suggestion_id)) return false
  const p = join(root, `${suggestion_id}.json`)
  if (!existsSync(p)) return false
  unlinkSync(p)
  return true
}
