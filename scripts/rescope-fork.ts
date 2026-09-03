/**
 * Rescope the fork's OWN packages from the `@deepseek-ai` scope into a target
 * scope, and undo that with `--reverse`. This is the mirror of
 * {@link ./rescope-vendor.ts} for the product split: rescope-vendor moves the
 * vendored Cordis framework into `@deepseek-ai` (so the harness does not squat
 * upstream names); rescope-fork moves the fork's own additions OUT of
 * `@deepseek-ai` into the independent product's scope, at the product-split /
 * first-tag boundary (AGENTS.md Pre-release sanction).
 *
 * Scoped by the wayfinder decision `product-split-package-rescope` (2026-08-21):
 * D2 = c-ii (npm-consume), D3 = c (consume `@deepseek-ai/cordis` from npm, no
 * `vendor/`), D1 = structure confirmed + name parameterized. Under c-ii the
 * product repo carries ONLY the fork's own packages (the da additions); the
 * upstream `dsh-*` core and `vendor/` are dropped and consumed from npm. So
 * "local packages" discovered here = the fork's own packages, and the rename
 * mapping is keyed on LOCAL package names. References to NON-local
 * `@deepseek-ai/dsh-*` (upstream core deps, e.g. `@deepseek-ai/dsh-core`,
 * `@deepseek-ai/dsh-tools`) are NOT in the mapping and are therefore left
 * untouched — they stay `@deepseek-ai/` and resolve from the registry. This is
 * the same "RENAMES key set = processed set" discipline rescope-vendor uses:
 * the local set is the processed set, non-local references fall through.
 *
 * `@deepseek-ai/cordis` (the framework peer) is likewise non-local under D3=c
 * (consumed from npm), so it is NOT rescoped — only the fork's own packages are.
 *
 * rescope-vendor is IRRELEVANT to the product repo: D3=c drops `vendor/`, so
 * there is no vendored framework to rescope, and rescope-vendor's hardcoded
 * `@deepseek-ai` target does NOT need parameterizing (that was a D3=a concern;
 * a is ruled out under c-ii).
 *
 * The generic pass rewrites ONLY delimited, complete package-name tokens:
 * `'old'` / `"old"` / `` `old` `` / `'old/subpath'`, plus a YAML `name: old`
 * scalar — the same rule as rescope-vendor, generalized from its fixed
 * RENAMES table to the dynamically discovered local set. A match needs a
 * quote (or `name: `) immediately left and the matching quote — optionally
 * after a `/subpath` — immediately right, which makes the rewrite idempotent
 * because the scoped name's local part is preceded by `/`.
 *
 * Sites the token rule cannot safely express — `startsWith` gates, regex
 * literals, JSON `ignoreDependencies` entries, and the AGENTS.md convention
 * prose that names packages by a `<placeholder>` rather than a concrete name —
 * are listed in {@link exactEdits} with an exact hit count and a
 * pending/applied/invalid state classifier (reusing rescope-vendor's
 * {@link exactEditState}), so an upstream change to one of them fails loudly
 * instead of being silently skipped.
 *
 * `repository.url` is NOT rewritten here: rescope-vendor's token rule touches
 * only package-name tokens, and the target repo URL is a D1 trigger-time input
 * (still TBD). Repointing `repository.url` + README brand prose is migration
 * step 5 at trigger time.
 *
 * Usage: `pnpm run rescope-fork [--apply|--check] --target <scope> [--reverse]`.
 * `--target` is required for `--apply`; `--check` reads the post-state. Without
 * a mode it reports the discovered set and the planned changes. `--reverse`
 * returns local names to `@deepseek-ai/` (re-apply after an upstream sync, to
 * preserve the additive-only upgrade path).
 *
 * GUARD: `--apply` aborts if `vendor/` exists. The product repo (c-ii, post
 * step-2 drop) has no `vendor/`; the additive-only fork does. Running `--apply`
 * on the fork would rescope the upstream `dsh-*` core that is still local
 * there, which c-ii consumes from npm instead — so the guard refuses and points
 * at migration step 2.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exactEditState } from './rescope-vendor'

const root = resolve(import.meta.dirname, '..')
const UPSTREAM_SCOPE = '@deepseek-ai'

/** One local package's rescopable name (apply direction: `from` is the pre-state). */
interface Rename {
  readonly directory: string
  readonly from: string
  readonly to: string
}

/** An exact-string edit the token rule cannot express, with its required hit count. */
interface ExactEdit {
  readonly id: string
  readonly file: string
  readonly find: string
  readonly replace: string
  readonly expect: number
}

/** A string that must appear exactly `count` times once the rescope has run. */
interface PostCondition {
  readonly file: string
  readonly text: string
  readonly count: number
}

/** A file where a bare local name is product data, not a package reference: the
 * generic pass is disabled for the listed names and an EXACT_EDIT handles the
 * real occurrence. Sparse for the fork's own names — unlike `cordis`, `dsh-*`
 * package names rarely moonlight as preset ids, event domains, or directory
 * names. Extend at trigger time if `--check` flags residue that is product data. */
interface GenericSkip {
  readonly file: string
  readonly upstream: readonly string[]
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.tpl', '.json', '.yml', '.yaml', '.md'] as const

/**
 * Discover the fork's own packages: every tracked `package.json` whose `name`
 * is in the `@deepseek-ai` scope. In the product repo (c-ii, post step-2 drop)
 * this is the da-addition set; in the additive-only fork it includes the
 * upstream `dsh-*` core too (which is why `--apply` guards on `vendor/`).
 * `to` carries a placeholder until `--target` substitutes it, so the dry run
 * can report the plan before a target is chosen.
 */
function discover(repoRoot: string = root): Rename[] {
  const files = execFileSync('git', ['ls-files', '-z', 'package.json', 'packages/**/package.json', 'apps/*/package.json', 'native/**/package.json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).split('\0').filter(file => file !== '' && file.endsWith('package.json'))

  const renames: Rename[] = []
  for (const file of files) {
    const parsed: unknown = JSON.parse(readFileSync(resolve(repoRoot, file), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
    const name = (parsed as { name?: unknown }).name
    if (typeof name !== 'string' || !name.startsWith(`${UPSTREAM_SCOPE}/`)) continue
    renames.push({ directory: file, from: name, to: name.replace(`${UPSTREAM_SCOPE}/`, '@__TARGET__/') })
  }
  // Longest first so a prefixed name (e.g. `dsh-eval` vs `dsh-eval-extra`) never shadows.
  return renames.sort((left, right) => right.from.length - left.from.length)
}

const GENERIC_SKIPS: readonly GenericSkip[] = []

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One name's rewrite, precompiled for both delimited forms. */
interface Pattern {
  readonly from: string
  readonly to: string
  readonly token: RegExp
  readonly yamlName: RegExp
}

function patterns(renames: readonly Rename[], reverse: boolean): Pattern[] {
  return renames
    .map(rename => ({
      from: reverse ? rename.to : rename.from,
      to: reverse ? rename.from : rename.to,
    }))
    .map(rename => ({
      ...rename,
      token: new RegExp(`(['"\`])${escapeRegExp(rename.from)}((?:/[^'"\`\\s]*)?)\\1`, 'g'),
      yamlName: new RegExp(`^(\\s*(?:-\\s*)?name:[ \\t]+)${escapeRegExp(rename.from)}([ \\t]*(?:#.*)?)$`, 'gm'),
    }))
}

function skipped(file: string, pattern: Pattern): boolean {
  return GENERIC_SKIPS.some(skip => skip.file === file && skip.upstream.includes(pattern.from))
}

function rewriteLine(line: string, file: string, all: readonly Pattern[]): string {
  let out = line
  for (const pattern of all) {
    if (skipped(file, pattern)) continue
    out = out.replace(pattern.token, (_match, quote: string, subpath: string) => `${quote}${pattern.to}${subpath}${quote}`)
    out = out.replace(pattern.yamlName, (_match, prefix: string, suffix: string) => `${prefix}${pattern.to}${suffix}`)
  }
  return out
}

/**
 * Rewrite a file's eligible lines. Markdown follows the rename inside every
 * fence, and in `docs/` prose too; prose elsewhere records what was true when
 * written, so it is left alone (mirrors rescope-vendor).
 */
function rewrite(text: string, file: string, all: readonly Pattern[]): { text: string; lines: number } {
  const markdown = file.endsWith('.md')
  const prose = markdown && file.startsWith('docs/')
  let insideFence = false
  let lines = 0
  const out = text.split('\n').map((line) => {
    if (markdown) {
      if (/^\s*```/.test(line)) {
        insideFence = !insideFence
        return line
      }
      if (!insideFence && !prose) return line
    }
    const next = rewriteLine(line, file, all)
    if (next !== line) lines += 1
    return next
  })
  return { text: out.join('\n'), lines }
}

function classify(file: string): string {
  if (file.endsWith('package.json')) return 'package.json names + dependencies'
  if (/\.(ts|tsx|js|mjs|cjs|tpl)$/.test(file)) return 'code specifiers'
  if (/\.(yml|yaml)$/.test(file)) return 'YAML plugin names'
  if (file.endsWith('.json')) return 'JSON configuration'
  return 'Markdown fences and docs prose'
}

/**
 * Exact edits the generic token rule cannot express, in the APPLY direction
 * (`find` is the pre-state `@deepseek-ai` form, `replace` is the post-state
 * `@<target>` form). `main` orients for `--reverse` by swapping find/replace,
 * the same uniform flip rescope-vendor uses — so a non-target-interpolated
 * edit (the verify-regex, which is scope-agnostic) reverses correctly too.
 *
 * Verify each `find` against the real tree at trigger time — gate files evolve
 * with the upstream, and a moved/partial site is `invalid` (the run fails
 * rather than silently skipping).
 */
function exactEdits(target: string): ExactEdit[] {
  const from = UPSTREAM_SCOPE // pre-state (apply reads this)
  const to = target // post-state (apply writes this)
  return [
    {
      id: 'families-startswith-gate',
      file: 'scripts/release/families.ts',
      find: 'if (!name.startsWith(\'' + from + '/\')) throw new Error(`' + '${normalized} must name an ' + from + ' package`)',
      replace: 'if (!name.startsWith(\'' + to + '/\')) throw new Error(`' + '${normalized} must name an ' + to + ' package`)',
      expect: 1,
    },
    {
      id: 'families-strip-scope',
      file: 'scripts/release/families.ts',
      find: `.replace('${from}/', '')`,
      replace: `.replace('${to}/', '')`,
      expect: 1,
    },
    {
      id: 'publish-npm-baseline-startswith-gate',
      file: 'scripts/publish-npm-baseline.ts',
      find: 'if (!name.startsWith(\'' + from + '/\')) {\n        throw new Error(`' + '${manifestPath} must name an ' + from + ' package`)',
      replace: 'if (!name.startsWith(\'' + to + '/\')) {\n        throw new Error(`' + '${manifestPath} must name an ' + to + ' package`)',
      expect: 1,
    },
    {
      id: 'publish-npm-baseline-dsh-root-gate',
      file: 'scripts/publish-npm-baseline.ts',
      find: `if (origin === 'harness' && (!name.startsWith('${from}/') || name === '${from}/dsh-root')) {`,
      replace: `if (origin === 'harness' && (!name.startsWith('${to}/') || name === '${to}/dsh-root')) {`,
      expect: 1,
    },
    {
      // Scope-agnostic: accept any scope's dsh-* so the MIT gate survives a rescope
      // without being re-keyed to the target. Same in both directions (reverse
      // restores the upstream literal via main's uniform find/replace flip).
      id: 'verify-dsh-package-licenses-regex',
      file: 'scripts/verify-dsh-package-licenses.ts',
      find: 'const DSH_PACKAGE_NAME = /^@deepseek-ai\\/dsh(?:-|$)/',
      replace: 'const DSH_PACKAGE_NAME = /^@[^/]+\\/dsh(?:-|$)/',
      expect: 1,
    },
    {
      id: 'knip-ignore-dependencies-pattern',
      file: 'knip.json',
      find: `"@${from.slice(1)}/.+"`,
      replace: `"@${to.slice(1)}/.+"`,
      expect: 4,
    },
    {
      id: 'agents-convention-line',
      file: 'AGENTS.md',
      find: `- Every npm package is \`${from}/dsh-<name>\``,
      replace: `- Every npm package is \`${to}/dsh-<name>\``,
      expect: 1,
    },
    {
      id: 'agents-file-tree-convention',
      file: 'AGENTS.md',
      find: `packages/    ${from}/dsh-<pkg> workspaces at packages/<group>/<pkg>/`,
      replace: `packages/    ${to}/dsh-<pkg> workspaces at packages/<group>/<pkg>/`,
      expect: 1,
    },
  ]
}

/**
 * Post-conditions for `--check`: every local package's manifest name starts
 * with the target scope. The upstream core dep references that must REMAIN
 * `@deepseek-ai/` (npm consume) are NOT asserted here — they are expected, so
 * asserting their absence would be wrong. The MIT gate regex is scope-agnostic
 * so the same literal is asserted in both directions.
 */
function postconditions(renames: readonly Rename[], target: string, reverse: boolean): PostCondition[] {
  const conds: PostCondition[] = []
  for (const rename of renames) {
    const expected = reverse ? rename.from : rename.to.replace('@__TARGET__/', `${target}/`)
    conds.push({ file: rename.directory, text: `"name": "${expected}"`, count: 1 })
  }
  conds.push({
    file: 'scripts/verify-dsh-package-licenses.ts',
    text: 'const DSH_PACKAGE_NAME = /^@[^/]+\\/dsh(?:-|$)/',
    count: 1,
  })
  return conds
}

/** Files the rescope must never rewrite. */
function excluded(file: string): boolean {
  if (file === 'scripts/rescope-fork.ts') return true // the mapping logic itself
  if (file === 'scripts/rescope-vendor.ts') return true // the vendor mapping (independent)
  if (file.startsWith('.agents/notes/')) return true // notes record what was true when written
  if (file.startsWith('scripts/snapshots/')) return true // recorded payloads quote docs verbatim
  if (file.endsWith('.i18n.yaml')) return true // blob-hash records, re-recorded by the pairing gate
  if (file === 'pnpm-lock.yaml') return true // regenerated by pnpm install
  if (/^vendor\/[^/]+\/(README\.md|LICENSE)$/.test(file)) return true // upstream files kept verbatim (absent in product repo anyway)
  return !EXTENSIONS.some(extension => file.endsWith(extension))
}

function main(): void {
  const args = process.argv.slice(2)
  const mode = args.includes('--apply') ? 'apply' : args.includes('--check') ? 'check' : 'dry'
  const reverse = args.includes('--reverse')
  const targetArg = args.find(arg => arg.startsWith('--target'))
  let target = targetArg ? targetArg.slice('--target='.length) : ''

  const renames = discover()
  if (renames.length === 0) {
    console.error('rescope-fork: no @deepseek-ai packages discovered; nothing to rescope.')
    if (mode === 'dry') return
    process.exitCode = 1
    return
  }

  if (mode === 'apply' && target === '') {
    console.error('rescope-fork: --apply requires --target <scope> (e.g. --target=@my-org).')
    process.exitCode = 1
    return
  }
  if (target.startsWith('@')) target = target.slice(1)

  // Substitute the discovered names' placeholder target with the real one.
  const targetRenames = renames.map(rename => ({
    directory: rename.directory,
    from: rename.from,
    to: rename.to.replace('@__TARGET__/', `@${target}/`),
  }))
  const allPatterns = patterns(targetRenames, reverse)
  const edits = exactEdits(`@${target}`)

  if (mode === 'apply' && existsSync(resolve(root, 'vendor'))) {
    console.error(
      'rescope-fork: --apply refused — vendor/ exists, so this is the additive-only fork, not the c-ii product repo. '
      + 'Drop vendor/ + upstream dsh-* core first (migration step 2), then run --apply --target <scope>.',
    )
    process.exitCode = 1
    return
  }

  const counts = new Map<string, { files: number; lines: number }>()
  const failures: string[] = []
  const outstanding: string[] = []

  // Classify every exact edit before writing anything: a single invalid site
  // means the mapping and the tree disagree, and a half-applied tree is worse
  // than an untouched one (mirrors rescope-vendor).
  const planned: { edit: ExactEdit; path: string; find: string; replace: string }[] = []
  for (const edit of edits) {
    const path = resolve(root, edit.file)
    if (!existsSync(path)) {
      failures.push(`exact edit ${edit.id}: ${edit.file} not found (gate moved or dropped upstream?)`)
      continue
    }
    const before = readFileSync(path, 'utf8')
    const find = reverse ? edit.replace : edit.find
    const replace = reverse ? edit.find : edit.replace
    const state = exactEditState(before, find, replace, edit.expect)
    if (state === 'invalid') {
      failures.push(`exact edit ${edit.id}: ${edit.file} is neither pending nor cleanly applied (duplicated, partial, or moved)`)
      continue
    }
    if (mode === 'check') {
      if (state !== 'applied') failures.push(`exact edit ${edit.id} did not land in ${edit.file}`)
      continue
    }
    if (state === 'pending') planned.push({ edit, path, find, replace })
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`rescope-fork: ${failure}`)
    console.error(`rescope-fork: ${String(failures.length)} problem(s); nothing was written.`)
    process.exitCode = 1
    return
  }
  if (mode === 'apply') {
    for (const { path, find, replace } of planned) {
      writeFileSync(path, readFileSync(path, 'utf8').split(find).join(replace))
    }
  }

  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(file => file !== '' && !excluded(file))

  for (const file of files) {
    const path = resolve(root, file)
    const before = readFileSync(path, 'utf8')
    const { text: after, lines } = rewrite(before, file, allPatterns)
    if (after === before) continue
    outstanding.push(file)
    const kind = classify(file)
    const current = counts.get(kind) ?? { files: 0, lines: 0 }
    counts.set(kind, { files: current.files + 1, lines: current.lines + lines })
    if (mode === 'apply') writeFileSync(path, after)
  }

  console.log(`rescope-fork: ${mode}${reverse ? ' --reverse' : ''}${target ? ` --target @${target}` : ''} over ${String(files.length)} tracked files; ${String(renames.length)} local package(s) discovered`)
  for (const kind of [...counts.keys()].sort()) {
    const { files: count, lines } = counts.get(kind) ?? { files: 0, lines: 0 }
    console.log(`  ${kind.padEnd(28)} ${String(count).padStart(4)} file(s), ${String(lines)} line(s)`)
  }

  if (mode !== 'dry') {
    for (const check of postconditions(targetRenames, `@${target}`, reverse)) {
      const path = resolve(root, check.file)
      const hits = existsSync(path) ? readFileSync(path, 'utf8').split(check.text).length - 1 : -1
      if (hits !== check.count) {
        failures.push(`postcondition: ${check.file} has ${String(hits)} occurrence(s) of ${JSON.stringify(check.text)}, expected ${String(check.count)}`)
      }
    }
    if (mode === 'check') {
      for (const file of outstanding) failures.push(`residue: ${file} still carries a pre-rescope name token`)
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`rescope-fork: ${failure}`)
    console.error(`rescope-fork: ${String(failures.length)} problem(s); the mapping or an upstream site moved.`)
    process.exitCode = 1
  } else if (mode === 'check') {
    console.log('rescope-fork: post-state verified — local names rescoped, every exact edit landed, idempotent.')
  } else if (mode === 'apply') {
    console.log('rescope-fork: applied. Run `pnpm install`, `pnpm run gen-third-party-notices`, and re-record the touched bilingual pairs.')
  } else {
    console.log('rescope-fork: dry run — no files written. Pass --apply --target <scope> to rewrite, or --check to assert the post-state.')
  }
}

// Importing this module for its discovery/classifier helpers must not run the codemod.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main()
}

export { discover, exactEdits, postconditions, patterns, rewrite, type Rename }
