/**
 * Generate `docs/architecture-graph.md` from in-repo package structure,
 * cross-package imports, and the curated DSH modular-seam manifest. The
 * deterministic output renders a Host/Client-faced Mermaid flowchart plus a
 * dependency table; `--check` verifies freshness. Mirrors the gen/verify
 * pattern of `gen-module-graph.ts` and the hybrid source+manifest pattern of
 * `gen-doc-graphs.ts`.
 *
 * v1 scope: the dsh-wide architecture graph (all packages, Host/Client
 * faces, peerDep/import/@Remote edges + 6 seam markers + depmap). The curated
 * data-agent 4-phase flow diagram (design §2) is a separate concern (UM14
 * regen). Enumerable seam sides (bundles, @Remote emitters, assembly imports)
 * are scanned dynamically so the graph stays code-authoritative; SEAM_MANIFEST
 * curates only the non-enumerable seam roles. See
 * wayfinder/data-agent/research/um-arch-design-2026-09-08.md.
 *
 * v1 caveats: cross-package imports are scanned from the host-face program
 * only (a Client package enters when a host file imports it), so Client→Client
 * value-import edges are under-reported — the same posture as gen-doc-graphs.
 * @Remote emitters are matched by source-text scan (`@Remote(` /
 * `extends TypertRemoteService`) rather than full checker symbol resolution.
 * Package short names never come from the source-file path's directory leaf
 * (many packages have dir != short, e.g. packages/client/connection →
 * `client-connection`); every source file is mapped to its package via
 * `pkgsByRel` (keyed by `pkg.rel`). The undeclared-import check compares
 * against the union of peerDependencies + dependencies + devDependencies so
 * apps declaring workspace deps under `dependencies` are not false-flagged.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import {
  collectPackageGraph,
  escapeMermaidLabel as escLabel,
  graphNodeId as nodeId,
  type PackageGraphNode,
} from './package-graph.ts'
import { TypeScriptProject } from './ts-project.ts'

const root = resolve(import.meta.dirname, '..')
const OUT = 'docs/architecture-graph.md'
type Pkg = PackageGraphNode
const SCOPE = '@deepseek-ai/dsh-'

/** One curated modular seam role the source cannot infer. Enumerable sides
 *  (bundles, @Remote emitters, assembly imports) are scanned dynamically and
 *  left out of this manifest; only the non-enumerable membership + note lives
 *  here. Corrected from code. */
interface SeamEntry {
  key: string
  title: string
  mode: 'seam' | 'pending'
  /** Public subpath export that defines the seam boundary, if any. */
  exportPath?: string
  /** Packages that own/host the seam (curated, non-enumerable). */
  implementations: string[]
  /** Curated consumer hint (resolved further at render time). */
  consumers?: string[]
  note: string
}

const SEAM_MANIFEST: SeamEntry[] = [
  {
    key: 'seam-1', title: 'bundle-composition', mode: 'seam',
    implementations: [],
    note: 'cordis.patch.yml row-list overlay (id + disabled/config); dsh.bundle.patch manifest field. Bundles enumerated from packages/bundle/*.',
  },
  {
    key: 'seam-2', title: 'remote-api', mode: 'seam',
    implementations: ['api-gateway', 'api-remotes'],
    note: '@Remote markers + TypertRemoteService (defined in dsh-typert-protocol); emitters scanned from source; client assembly in seam-5.',
  },
  {
    key: 'seam-3', title: 'client-connection', mode: 'seam', exportPath: './client',
    implementations: ['client-connection'],
    note: 'public RPC carrier subpath consumed by the seam-5 assembly.',
  },
  {
    key: 'seam-4', title: 'client-modules', mode: 'seam', exportPath: './client',
    implementations: ['client-modules'],
    consumers: ['ui-*'],
    note: 'loader for client plugins; ui-* consumers enumerated from packages/client/ui-*.',
  },
  {
    key: 'seam-5', title: 'remote-assembly', mode: 'seam',
    implementations: ['api-remotes'],
    note: 'platform-neutral Host Remote contributions mounted in packages/api/remotes/src/client/index.ts; assembly imports scanned dynamically.',
  },
  {
    key: 'seam-6', title: 'remote-workspace-files', mode: 'seam',
    implementations: ['api-workspace-files'],
    note: 'workspace-files restored via UM14 re-sync; previously pending.',
  },
]

const GROUP_ORDER = [
  'util', 'attachment', 'llm', 'core', 'typert', 'goal', 'experimental',
  'process', 'bash', 'pty', 'sandbox', 'e2b', 'fs', 'skill', 'compact',
  'subagent', 'tasks', 'workflow', 'web', 'spill', 'todo', 'plan', 'cordis',
  'hooks', 'session-persistence', 'session-query', 'session-title', 'telemetry',
  'storage', 'workspace', 'support', 'acp', 'data', 'bundle', 'api', 'query',
  'retrieval', 'embedder', 'eval', 'guard', 'context', 'preset', 'identity',
  'credentials', 'host', 'client', 'extensions', 'settings', 'session',
  'interaction', 'feedback', 'mcp', 'lsp', 'shell', 'subprocess', 'terminal',
  'test-support', 'runtime-diagnostics', 'schedule', 'jobs', 'code-runtime',
  'sdk', 'boot',
]

interface ImportEdge {
  importer: string
  imported: string
  typeOnly: boolean
}

interface GraphData {
  pkgs: Pkg[]
  pkgsByShort: Map<string, Pkg>
  hostFace: Set<string>
  clientFace: Set<string>
  importEdges: ImportEdge[]
  emitters: Set<string>
  assembly: string[]
  bundles: string[]
  /** Per-package short → all declared dsh-* dep shorts (peer + dep + dev). */
  declaredDeps: Map<string, Set<string>>
}

/** Map a repo-relative source-file path to its package's `rel`
 *  (`packages/<group>/<pkg-dir>`), or undefined if it is not a package source. */
function pkgRelOf(rel: string): string | undefined {
  const segs = rel.split('/')
  // packages/<group>/<pkg-dir>/src/...ts
  if (segs.length >= 5 && segs[0] === 'packages' && segs[3] === 'src') {
    return `${segs[0]}/${segs[1]}/${segs[2]}`
  }
  return undefined
}

/** Declared Host/Client face membership from tsconfig references (no Program).
 *  `ts.readConfigFile` strips JSONC comments (the face tsconfigs use `//`
 *  annotations) without enumerating `include` files or resolving `extends`.
 *  Maps each reference path to a package short name via `pkgsByRel` so the
 *  dir != short packages resolve correctly. */
function collectFaceMembership(projectRoot: string, pkgsByRel: Map<string, Pkg>): { host: Set<string>; client: Set<string> } {
  const extract = (face: 'host' | 'client'): Set<string> => {
    const cfgPath = resolve(projectRoot, `tsconfig.${face}.json`)
    const { config, error } = ts.readConfigFile(cfgPath, ts.sys.readFile)
    if (error) throw new Error(`gen-architecture-graph: cannot read ${cfgPath}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`)
    const set = new Set<string>()
    for (const ref of (config?.references ?? []) as { path: string }[]) {
      const rel = ref.path.replace(/^\.\//, '')
      const segs = rel.split('/')
      if (segs[0] !== 'packages' || segs.length < 3) continue
      const pkgRel = `${segs[0]}/${segs[1]}/${segs[2]}`
      const pkg = pkgsByRel.get(pkgRel)
      if (pkg) set.add(pkg.short)
    }
    return set
  }
  return { host: extract('host'), client: extract('client') }
}

/** Resolve a `@deepseek-ai/dsh-<short>` or `@deepseek-ai/dsh-<short>/<subpath>` specifier to the short name. */
function resolveDshSpecifier(specifier: string): string | undefined {
  if (!specifier.startsWith(SCOPE)) return undefined
  const rest = specifier.slice(SCOPE.length)
  const short = rest.split('/')[0]
  return short || undefined
}

/** Cross-package import edges from the host-face program. AST-only (no checker)
 *  so the cordis-Context collision does not apply. Importers are mapped to
 *  package short names via `pkgsByRel`. */
function collectImportEdges(
  project: TypeScriptProject,
  pkgsByShort: Map<string, Pkg>,
  pkgsByRel: Map<string, Pkg>,
): ImportEdge[] {
  const seen = new Set<string>()
  const edges: ImportEdge[] = []
  for (const sourceFile of project.sourceFiles()) {
    const rel = project.relativePath(sourceFile)
    const importerPkg = pkgsByRel.get(pkgRelOf(rel) ?? '')
    if (!importerPkg) continue
    const importer = importerPkg.short
    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        const spec = node.moduleSpecifier
        const specifier = ts.isStringLiteral(spec) ? spec.text : ''
        const imported = resolveDshSpecifier(specifier)
        if (imported && imported !== importer && pkgsByShort.has(imported)) {
          const typeOnly = node.importClause?.isTypeOnly === true
          const key = `${importer}->${imported}:${typeOnly ? 't' : 'v'}`
          if (!seen.has(key)) {
            seen.add(key)
            edges.push({ importer, imported, typeOnly })
          }
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(sourceFile)
  }
  return edges
}

/** Packages emitting @Remote (seam-2 enumerable side): source-text scan for
 *  `@Remote(` or `extends TypertRemoteService` across the host program's
 *  package sources. A superset of the seam-5 assembly — an emitter whose
 *  `/remote` is not wired into api-remotes/src/client is still a seam-2
 *  participant but gets no carriage edge. */
function collectRemoteEmitters(project: TypeScriptProject, pkgsByRel: Map<string, Pkg>): Set<string> {
  const emitters = new Set<string>()
  for (const sourceFile of project.sourceFiles()) {
    const rel = project.relativePath(sourceFile)
    const pkg = pkgsByRel.get(pkgRelOf(rel) ?? '')
    if (!pkg || emitters.has(pkg.short)) continue
    const text = sourceFile.text
    if (text.includes('@Remote(') || text.includes('extends TypertRemoteService')) emitters.add(pkg.short)
  }
  return emitters
}

/** Seam-5 assembly: `/remote` imports mounted in packages/api/remotes/src/client/index.ts. */
function collectRemoteAssembly(projectRoot: string): string[] {
  const path = 'packages/api/remotes/src/client/index.ts'
  const text = readFileSync(resolve(projectRoot, path), 'utf8')
  const remotes: string[] = []
  for (const line of text.split('\n')) {
    const m = /from\s+['"]@deepseek-ai\/dsh-([^'"/]+)\/remote['"]/.exec(line)
    if (m?.[1]) remotes.push(m[1])
  }
  return [...new Set(remotes)].sort()
}

/** Seam-1 bundles: packages whose group is `bundle`. */
function collectBundles(pkgs: readonly Pkg[]): string[] {
  return pkgs.filter(p => p.group === 'bundle').map(p => p.short).sort()
}

/** All declared dsh-* deps (peer + regular + dev) per package short name.
 *  Used for the undeclared-import check so apps declaring workspace deps
 *  under `dependencies` (not `peerDependencies`) are not false-flagged. */
function collectDeclaredDeps(pkgs: readonly Pkg[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const pkg of pkgs) {
    const json = JSON.parse(readFileSync(resolve(root, pkg.rel, 'package.json'), 'utf8')) as {
      peerDependencies?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const set = new Set<string>()
    for (const field of [json.peerDependencies, json.dependencies, json.devDependencies] as Record<string, string>[]) {
      for (const dep of Object.keys(field ?? {})) {
        if (dep.startsWith(SCOPE)) set.add(dep.slice(SCOPE.length))
      }
    }
    out.set(pkg.short, set)
  }
  return out
}

/** Package short name → owning seam keys (curated implementations + the
 *  dynamically-enumerated bundles/emitters). A package may belong to more
 *  than one seam (e.g. api-remotes is both seam-2 impl and seam-5 assembly). */
function buildSeamByPkg(data: GraphData): Map<string, string[]> {
  const byPkg = new Map<string, string[]>()
  const add = (pkg: string, seam: string): void => {
    const arr = byPkg.get(pkg) ?? []
    if (!arr.includes(seam)) arr.push(seam)
    byPkg.set(pkg, arr)
  }
  for (const entry of SEAM_MANIFEST) {
    for (const impl of entry.implementations) add(impl, entry.key)
  }
  for (const b of data.bundles) add(b, 'seam-1')
  for (const e of data.emitters) add(e, 'seam-2')
  return byPkg
}

function packageLink(pkg: Pkg | undefined, fallback: string): string {
  return pkg ? `[\`${pkg.short}\`](../${pkg.rel})` : `\`${fallback}\``
}

function render(data: GraphData): string {
  const { pkgs, pkgsByShort, hostFace, clientFace, importEdges, emitters, bundles, assembly, declaredDeps } = data
  const seamByPkg = buildSeamByPkg(data)
  const undeclaredEdges = importEdges.filter(e => !e.typeOnly && !(declaredDeps.get(e.importer)?.has(e.imported) ?? false))

  const faceOf = (short: string): string => {
    const h = hostFace.has(short)
    const c = clientFace.has(short)
    if (h && c) return 'Host+Client'
    if (h) return 'Host'
    if (c) return 'Client'
    return '—'
  }
  // Host bucket holds host-declared packages, shared packages, and any package
  // referenced by neither tsconfig (test/example leaves); Client bucket holds
  // client-only packages. Every package renders exactly once.
  const inHost = (short: string): boolean => hostFace.has(short) || !clientFace.has(short)
  const inClientOnly = (short: string): boolean => clientFace.has(short) && !hostFace.has(short)

  const groupOrderIndex = (g: string): number => {
    const i = GROUP_ORDER.indexOf(g)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const groupsOf = (predicate: (short: string) => boolean): string[] =>
    [...new Set(pkgs.filter(p => predicate(p.short)).map(p => p.group))]
      .sort((a, b) => groupOrderIndex(a) - groupOrderIndex(b) || a.localeCompare(b))

  const renderFace = (faceLabel: string, faceId: string, predicate: (short: string) => boolean, groupPrefix: string): string[] => {
    const out: string[] = [`  subgraph ${faceId}["${escLabel(faceLabel)}"]`]
    for (const group of groupsOf(predicate)) {
      const pkgsInGroup = pkgs.filter(p => p.group === group && predicate(p.short)).sort((a, b) => a.short.localeCompare(b.short))
      if (pkgsInGroup.length === 0) continue
      out.push(`    subgraph ${nodeId(groupPrefix, group)}["packages/${escLabel(group)}"]`)
      for (const pkg of pkgsInGroup) out.push(`      ${nodeId('pkg', pkg.short)}["${escLabel(pkg.short)}"]`)
      out.push('    end')
    }
    out.push('  end')
    return out
  }

  const edgeLines: string[] = []
  for (const p of pkgs) for (const d of p.deps) edgeLines.push(`  ${nodeId('pkg', p.short)} --> ${nodeId('pkg', d)}`)
  for (const e of undeclaredEdges) {
    edgeLines.push(`  ${nodeId('pkg', e.importer)} -.->|undeclared| ${nodeId('pkg', e.imported)}`)
  }
  // @Remote wire: each assembled /remote package -> api-remotes assembly ->
  // client-connection carrier (seam 2 -> 5 -> 3). Emitters not in the
  // assembly (e.g. tool-cordis) are seam-2 participants but not carried here.
  for (const em of [...assembly].sort()) {
    if (em === 'api-remotes' || !pkgsByShort.has(em) || !pkgsByShort.has('api-remotes')) continue
    edgeLines.push(`  ${nodeId('pkg', em)} ==> ${nodeId('pkg', 'api-remotes')}`)
  }
  if (pkgsByShort.has('api-remotes') && pkgsByShort.has('client-connection')) {
    edgeLines.push(`  ${nodeId('pkg', 'api-remotes')} ==> ${nodeId('pkg', 'client-connection')}`)
  }

  const seamPkgs = [...seamByPkg.keys()].filter(s => pkgsByShort.has(s)).sort()

  const lines: string[] = []
  lines.push('<!-- Generated by scripts/gen-architecture-graph.ts — do not edit by hand.')
  lines.push('     Run `pnpm run gen-architecture-graph` to regenerate. -->')
  lines.push('')
  lines.push('# Architecture graph')
  lines.push('')
  lines.push('Inter-package architecture of the `@deepseek-ai/dsh-*` harness packages, split by compiler face (Host = Node/server, Client = browser). Edges: solid `-->` = `peerDependencies` (manifest runtime edge); dashed `-.->` = cross-package value import declared in **no** deps field of the importer (undeclared, policy candidate); `==>` = `@Remote` wire (seam-2 emitter → seam-5 assembly → seam-3 client-connection). Type-only imports are omitted from the graph (covered by TS project refs) but listed in the dependency table (marked `*`). The 6 modular seams are marked via `classDef seam`. v1 scans imports from the host-face program, so Client→Client value imports are under-reported.')
  lines.push('')
  lines.push('```mermaid')
  lines.push('flowchart TB')
  lines.push(...renderFace('Host face', 'Host', inHost, 'hgroup'))
  lines.push(...renderFace('Client face', 'Client', inClientOnly, 'cgroup'))
  lines.push(...edgeLines)
  lines.push('  classDef seam fill:#fef3c7,stroke:#b45309,color:#1f2937;')
  for (const pkg of seamPkgs) lines.push(`  class ${nodeId('pkg', pkg)} seam`)
  lines.push('```')
  lines.push('')
  // depmap
  lines.push('| package | group | face | peer deps | cross-imports | seam role | undeclared? |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  const importsByImporter = new Map<string, { imported: string; typeOnly: boolean }[]>()
  for (const e of importEdges) {
    const arr = importsByImporter.get(e.importer) ?? []
    arr.push({ imported: e.imported, typeOnly: e.typeOnly })
    importsByImporter.set(e.importer, arr)
  }
  const undeclaredByImporter = new Map<string, Set<string>>()
  for (const e of undeclaredEdges) {
    const s = undeclaredByImporter.get(e.importer) ?? new Set<string>()
    s.add(e.imported)
    undeclaredByImporter.set(e.importer, s)
  }
  for (const p of pkgs) {
    const deps = p.deps.length ? p.deps.map(d => packageLink(pkgsByShort.get(d), d)).join(', ') : '—'
    const imps = importsByImporter.get(p.short) ?? []
    const impsStr = imps.length
      ? imps
        .sort((a, b) => a.imported.localeCompare(b.imported))
        .map(i => `${packageLink(pkgsByShort.get(i.imported), i.imported)}${i.typeOnly ? ' *' : ''}`)
        .join(', ')
      : '—'
    const undeclared = undeclaredByImporter.get(p.short)
    const undeclaredStr = undeclared && undeclared.size ? `⚠ ${undeclared.size}` : '—'
    const seamRole = (seamByPkg.get(p.short) ?? []).join(', ') || '—'
    lines.push(`| ${packageLink(p, p.short)} | \`${p.group}\` | ${faceOf(p.short)} | ${deps} | ${impsStr} | ${seamRole} | ${undeclaredStr} |`)
  }
  lines.push('')
  lines.push(`<!-- seam manifest: ${SEAM_MANIFEST.map(s => s.key).join(', ')}. Bundles: ${bundles.join(', ') || '—'}. @Remote emitters: ${[...emitters].sort().join(', ') || '—'}. Assembly remotes (api-remotes/src/client): ${assembly.join(', ') || '—'}. -->`)
  return lines.join('\n')
}

function collectGraphData(): GraphData {
  const pkgs = collectPackageGraph(root, GROUP_ORDER, 'gen-architecture-graph')
  const pkgsByShort = new Map(pkgs.map(p => [p.short, p]))
  const pkgsByRel = new Map(pkgs.map(p => [p.rel, p]))
  const { host, client } = collectFaceMembership(root, pkgsByRel)
  const project = new TypeScriptProject(root, 'host')
  return {
    pkgs,
    pkgsByShort,
    hostFace: host,
    clientFace: client,
    importEdges: collectImportEdges(project, pkgsByShort, pkgsByRel),
    emitters: collectRemoteEmitters(project, pkgsByRel),
    assembly: collectRemoteAssembly(root),
    bundles: collectBundles(pkgs),
    declaredDeps: collectDeclaredDeps(pkgs),
  }
}

function main(): void {
  const content = render(collectGraphData())
  if (process.argv.includes('--check')) {
    let committed: string | null = null
    try {
      committed = readFileSync(resolve(root, OUT), 'utf8')
    } catch {
      committed = null
    }
    if (committed === content) {
      console.log(`gen-architecture-graph: ${OUT} is up to date.`)
      return
    }
    console.error(`gen-architecture-graph: ${OUT} is stale. Run \`pnpm run gen-architecture-graph\` and commit ${OUT}.`)
    process.exit(1)
  }
  writeFileSync(resolve(root, OUT), content)
  console.log(`gen-architecture-graph: wrote ${OUT}.`)
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main()
}
