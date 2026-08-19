// PROTOTYPE (throwaway) — P6 semantic-layer substrate · write-tiers (Tier-1 pending queue + Tier-2 audit).
// Mirrors reverse-bi/libs/rbi-mcp/src/rbi_mcp/{pending_writes,write_tiers}.py.
// Tier-1 (cross-scope self-modification loop = agent writes what IT reads next round, e.g. event YAML =
// source-of-truth) => suggest -> pending -> approve (the agent can SUGGEST, not directly write source-of-truth;
// approve-side registration is gated to P9 admin, disable_admin can disable the whole layer).
// Tier-2 (per-scope persistent write) => audit-logged (sha256 payload hash), NOT disableable.
// HARDENING §1 rationale: polluting source-of-truth >> polluting instructions (connects to intranet-security-first).

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

// suggestion_id = timestamp + content short-hash (mirrors pending_writes.submit).
// id-validated (path-traversal gate): ^[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$ (no '.' '/' '\' —封 .. / 绝对路径 / 穿越).
const ID_RE = /^[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}$/
export function isValidId(id) { return ID_RE.test(id || '') }

function pad(n) { return String(n).padStart(2, '0') }
function stamp(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}
function shortHash(text) { return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8) }

// ── Tier-1 pending queue (one JSON file per suggestion; lives in var/ — gitignored runtime data, NOT resources/) ──
export function submit(root, { kind, subject, content, scope_id = null, tenant_id = null, meta = {} }) {
  mkdirSync(root, { recursive: true })
  const suggestion_id = `${stamp()}_${shortHash(content)}`
  const rec = { suggestion_id, kind, subject, content, submitted_at: new Date().toISOString(), scope_id, tenant_id, meta }
  writeFileSync(join(root, `${suggestion_id}.json`), JSON.stringify(rec, null, 2), 'utf8')
  return rec
}
export function load(root, suggestion_id) {
  if (!isValidId(suggestion_id)) return null
  const p = join(root, `${suggestion_id}.json`)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } // invalid/missing/corrupt => null (等同不存在)
}
export function listing(root) {
  if (!existsSync(root)) return []
  return readdirSync(root).map(f => load(root, f.replace(/\.json$/, ''))).filter(Boolean)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
}
export function discard(root, suggestion_id) {
  if (!isValidId(suggestion_id)) return false
  const p = join(root, `${suggestion_id}.json`)
  if (!existsSync(p)) return false
  unlinkSync(p)
  return true
}

// ── Tier-2 audit (sha256 payload hash; 留痕, no switch — this is Tier-2's definition) ──
// Mirrors write_tiers.record_tier2_write (stores payload HASH, not body — answers "who/when/which scope/which version").
export function recordTier2Write(auditLog, toolName, payload, { scope_id = null } = {}) {
  const rec = {
    log_id: createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 8),
    timestamp: new Date().toISOString(),
    scope_id,
    tier: 'tier-2',
    tool_name: toolName,
    payload_hash: createHash('sha256').update(payload, 'utf8').digest('hex'),
    payload_bytes: Buffer.byteLength(payload, 'utf8'),
  }
  const arr = existsSync(auditLog) ? JSON.parse(readFileSync(auditLog, 'utf8')) : []
  arr.push(rec)
  writeFileSync(auditLog, JSON.stringify(arr, null, 2), 'utf8')
  return rec
}
