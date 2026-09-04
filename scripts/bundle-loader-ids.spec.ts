/**
 * Bundle loader-entry-id collision gate (CB-1).
 *
 * A profile composes several bundle patches into one Loader tree. Two rows that
 * declare the SAME `id` with DIFFERENT `name` values are two different plugins
 * fighting for one entry, which makes `EntryGroup.update` throw
 * `duplicate loader entry id: <id>`. That throw propagates through
 * `Include._apply`, so the ENTIRE include group is dropped — every row in the
 * losing bundle silently disappears while the app still boots from base.
 *
 * This has bitten three times:
 *   - `code-runtime`   (P-DA4, headless + data-agent)
 *   - `result-cache`   (CB-1, web-app's client object cache vs data-agent's
 *                       server-side `ctx.resultCache` seam — cold boot dead)
 *   - `enrichment-llm-wiring` was the same *shape* of collateral damage from a
 *     different cause (a row throwing at construction time).
 *
 * The failure is invisible to "is the plugin registered?" checks: the plugin IS
 * registered in its own bundle, and the served client bundle is correct. Only
 * the composed tree is broken. Hence a static gate.
 *
 * Re-declaring an id with the SAME name is legitimate (config override), and so
 * is a bare `- id: X` + `disabled: true` (base's disable pattern) — neither is
 * flagged. Only conflicting DECLARATIONS are.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BUNDLES = 'packages/bundle'

interface Declaration {
  readonly bundle: string
  readonly id: string
  readonly name: string
  readonly line: number
}

/**
 * Collect `- id: X` rows that also carry a `name:` (i.e. declarations, not
 * config overrides or disables) from a bundle patch.
 *
 * The patches carry `!!js` custom tags, so a strict YAML parse is not an option
 * here; the row shape is regular enough to scan line-wise.
 */
function declarationsIn(bundle: string, text: string): Declaration[] {
  const out: Declaration[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const idMatch = /^\s*-\s+id:\s*([A-Za-z0-9._-]+)/.exec(lines[i] ?? '')
    if (idMatch === null) continue
    const id = idMatch[1]
    if (id === undefined) continue
    // A declaration's `name:` sits in the same block, before the next `- id:`.
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? ''
      if (/^\s*-\s+id:/.test(line)) break
      const nameMatch = /^\s*name:\s*['"]?([^'"\s#]+)/.exec(line)
      if (nameMatch?.[1] !== undefined) {
        out.push({ bundle, id, name: nameMatch[1], line: i + 1 })
        break
      }
    }
  }
  return out
}

describe('bundle loader entry ids (CB-1 regression gate)', () => {
  it('never declares one id for two different plugins across bundles', () => {
    expect(existsSync(BUNDLES)).toBe(true)

    const declarations: Declaration[] = []
    for (const bundle of readdirSync(BUNDLES)) {
      const patch = join(BUNDLES, bundle, 'cordis.patch.yml')
      if (!existsSync(patch)) continue
      declarations.push(...declarationsIn(bundle, readFileSync(patch, 'utf8')))
    }

    // Sanity: the scan must actually see rows, or the gate is vacuous.
    expect(declarations.length).toBeGreaterThan(20)

    const byId = new Map<string, Declaration[]>()
    for (const declaration of declarations) {
      const bucket = byId.get(declaration.id)
      if (bucket === undefined) byId.set(declaration.id, [declaration])
      else bucket.push(declaration)
    }

    const collisions: string[] = []
    for (const [id, rows] of byId) {
      const names = new Set(rows.map(r => r.name))
      if (names.size < 2) continue
      collisions.push(
        `  id "${id}" declares ${names.size} different plugins:\n`
        + rows.map(r => `    - ${r.bundle}/cordis.patch.yml:${r.line} -> ${r.name}`).join('\n'),
      )
    }

    expect(
      collisions.join('\n'),
      'Two bundles declare the same loader entry id for different plugins. Any '
      + 'profile composing both aborts the whole include group, silently dropping '
      + 'every row in it. Give one of them a distinct id.',
    ).toBe('')
  })
})
