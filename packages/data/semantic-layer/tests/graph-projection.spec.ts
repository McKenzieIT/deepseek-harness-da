/**
 * Registry-driven graph projection across MULTIPLE registered kinds — the
 * extensibility path W27 exists to enable. The built-in kinds alone cannot
 * expose these defects: they are the only kinds present, so registration
 * order, id-namespace collisions, and per-kind hardcoding stay invisible.
 *
 * Fixtures register their kinds AFTER the three built-ins, in the order that
 * previously misrouted edges (prefixed-id kind first), because registry
 * iteration follows insertion order.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { Context } from '@deepseek-ai/cordis'
import { SemanticLayerService } from '../src/index.ts'
import type { CorpusItem, DataSourceKindPlugin, GraphNodeProjection, RelationDef, SchemaLike } from '../src/registry.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A raw `{ name, target?, domains? }` definition, the shape every fixture kind stores. */
interface NamedDefinition {
  readonly name: string
  readonly target?: string
  readonly domains?: readonly string[]
}

/**
 * Accepts only objects carrying a string `name`, so a fixture kind sharing a
 * storage dir with a built-in kind can be observed rejecting the built-in's
 * own definitions (and vice versa).
 */
function namedSchema(): SchemaLike<NamedDefinition> & { readonly seen: unknown[] } {
  const seen: unknown[] = []
  const check = (raw: unknown): NamedDefinition | undefined => {
    if (typeof raw !== 'object' || raw === null) return undefined
    const record = raw as Record<string, unknown>
    if (typeof record.name !== 'string') return undefined
    return {
      name: record.name,
      ...(typeof record.target === 'string' ? { target: record.target } : {}),
      ...(Array.isArray(record.domains) ? { domains: record.domains.filter((d): d is string => typeof d === 'string') } : {}),
    }
  }
  return {
    seen,
    parse(raw) {
      const parsed = check(raw)
      if (parsed === undefined) throw new Error('namedSchema: not a named definition')
      return parsed
    },
    safeParse(raw) {
      seen.push(raw)
      const parsed = check(raw)
      return parsed === undefined ? { success: false, error: 'not a named definition' } : { success: true, data: parsed }
    },
  }
}

interface FixtureKind extends DataSourceKindPlugin<NamedDefinition> {
  /** Raw objects this kind's own schema was asked to validate. */
  readonly seen: unknown[]
}

/**
 * A fixture kind whose node ids carry `idPrefix` (empty keeps the bare name),
 * so two kinds can hold a node of the same name and reveal whether edge
 * resolution routes to the wrong one.
 */
function fixtureKind(options: {
  readonly kind: string
  readonly storageDir: string
  readonly idPrefix?: string
  readonly relationType?: string
}): FixtureKind {
  const schema = namedSchema()
  const prefix = options.idPrefix ?? ''
  return {
    kind: options.kind,
    storageDir: options.storageDir,
    schema,
    seen: schema.seen,
    getId: raw => (typeof raw.name === 'string' ? `${prefix}${raw.name}` : undefined),
    toCorpusItem: (def): CorpusItem => ({ id: `${prefix}${def.name}`, description: def.name }),
    toPromptContext: def => def.name,
    relations: (def): RelationDef[] => (def.target === undefined
      ? []
      : [{ type: options.relationType ?? 'related_to', target: def.target }]),
    toGraphNode: (def): GraphNodeProjection => ({
      id: `${prefix}${def.name}`,
      kind: options.kind,
      label: def.name,
      domains: [...(def.domains ?? [])],
    }),
  }
}

/** A semantic-layer root with the fixture directories the caller names. */
function seedRoot(dirs: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'w27-graph-projection-'))
  roots.push(root)
  writeFileSync(join(root, 'config.yaml'), yaml.dump({ project: { name: 'test', scope_id: 'test' } }))
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true })
  return root
}

describe('relation targets across two registered kinds (C1)', () => {
  it('routes an edge to the node that owns the target id, not to a prefixed id of another kind', () => {
    const root = seedRoot(['alpha', 'beta'])
    // `x` exists twice: as the bare-id `alpha` node and inside the `beta`
    // namespace (`beta:x`). `src` declares its target as the bare id `x`.
    writeFileSync(join(root, 'alpha', 'x.yaml'), yaml.dump({ name: 'x' }))
    writeFileSync(join(root, 'alpha', 'src.yaml'), yaml.dump({ name: 'src', target: 'x' }))
    writeFileSync(join(root, 'beta', 'x.yaml'), yaml.dump({ name: 'x' }))

    const svc = new SemanticLayerService(new Context(), { semanticRoot: root, scopeId: '' })
    // `beta` first: the prefixed-id kind is visited before the bare-id kind.
    svc.getRegistry().register(fixtureKind({ kind: 'beta', storageDir: 'beta', idPrefix: 'beta:' }))
    svc.getRegistry().register(fixtureKind({ kind: 'alpha', storageDir: 'alpha' }))

    const graph = svc.getRelationGraph()
    expect(graph.getRelated('src').map(edge => edge.targetId)).toEqual(['x'])
    expect(graph.getRelated('x').map(edge => edge.targetId)).toEqual(['src'])
    // `beta:x` is a different node of a different kind; it owns no edge here.
    expect(graph.getRelated('beta:x')).toEqual([])
  })

  it('leaves an unresolvable target as declared so the gateway drops the edge instead of guessing', () => {
    const root = seedRoot(['alpha', 'beta'])
    writeFileSync(join(root, 'alpha', 'src.yaml'), yaml.dump({ name: 'src', target: 'x' }))
    writeFileSync(join(root, 'beta', 'x.yaml'), yaml.dump({ name: 'x' }))

    const svc = new SemanticLayerService(new Context(), { semanticRoot: root, scopeId: '' })
    svc.getRegistry().register(fixtureKind({ kind: 'beta', storageDir: 'beta', idPrefix: 'beta:' }))
    svc.getRegistry().register(fixtureKind({ kind: 'alpha', storageDir: 'alpha' }))

    const graph = svc.getRelationGraph()
    expect(graph.getRelated('src').map(edge => edge.targetId)).toEqual(['x'])
    expect(graph.getRelated('beta:x')).toEqual([])
  })
})
