/**
 * Scoped Vitest config for the G25a Stage 0 facility tests.
 *
 * The repository's root config includes `packages/*​/*​/tests`, `apps/*​/tests`, and
 * `scripts/**`, none of which reach an experiment living under `wayfinder/`.
 * Widening the root include would pull throwaway experiment tests into every
 * repo-wide run, so this config covers only this directory and the README pins
 * the command that uses it.
 *
 * Resolution needs explicit aliases rather than `vite-tsconfig-paths`. This
 * experiment is not a pnpm workspace package, so it has no `node_modules`, and
 * pnpm's isolated layout links `@deepseek-ai/*` only inside each consuming
 * package — an upward walk from here finds nothing. `vite-tsconfig-paths` does
 * not help either, because it applies a tsconfig's `paths` only to files inside
 * that tsconfig's own include scope, and `wayfinder/` is outside it. So the
 * config reads `tsconfig.base.json`'s mappings directly and turns all of them
 * into Vite aliases, which apply unconditionally.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin } from '../../../../vitest.shared.ts'

const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const HERE = 'wayfinder/task-orchestration-dag/experiments/g25a-phase-gate'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Turn `tsconfig.base.json`'s `paths` into Vite aliases.
 *
 * Two forms are needed. The bare specifier (`@deepseek-ai/dsh-tools`) maps to the
 * package's `src` directory. Deep specifiers (`@deepseek-ai/dsh-query-maxcompute/src/conventions.ts`,
 * which `nl2sql-engine` uses) must map onto that same directory WITHOUT repeating
 * the `src` segment, so they get their own anchored pattern. Both are regexes
 * because a bare string `find` in Rollup's alias semantics also swallows subpaths
 * and would produce a doubled `src/src/` path.
 */
function tsconfigPathAliases(): { find: RegExp; replacement: string }[] {
  const raw = readFileSync(resolve(REPO_ROOT, 'tsconfig.base.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  const paths: Record<string, string[]> = JSON.parse(raw).compilerOptions?.paths ?? {}
  const aliases: { find: RegExp; replacement: string }[] = []
  for (const [spec, targets] of Object.entries(paths)) {
    const target = targets[0]
    if (target === undefined) continue
    const dir = resolve(REPO_ROOT, target)
    const s = escape(spec)
    if (/\/src$/.test(target)) aliases.push({ find: new RegExp(`^${s}/src/(.*)$`), replacement: `${dir}/$1` })
    aliases.push({ find: new RegExp(`^${s}/(.*)$`), replacement: `${dir}/$1` })
    aliases.push({ find: new RegExp(`^${s}$`), replacement: dir })
  }
  return aliases
}

export default defineConfig({
  plugins: [standardDecoratorPlugin()],
  resolve: { alias: tsconfigPathAliases() },
  test: {
    root: REPO_ROOT,
    include: [`${HERE}/tests/**/*.spec.ts`],
    testTimeout: 30_000,
  },
})
