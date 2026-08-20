import { defineConfig } from 'tsdown'

/**
 * Source-only package: consumed via `./src/*` by other host packages (e.g.
 * nl2sql-engine imports `@deepseek-ai/dsh-query-maxcompute/src/conventions.ts`),
 * not as a standalone bundled lib. Skip tsdown's host-face entry so
 * `build:lib:host` does not require a tsc-built `lib/types` — wiring this
 * package as a composite project breaks the typert WorkspaceAnalyzer's
 * `./src/*` cross-package resolution, so it stays source-only by design.
 */
export default defineConfig(() => ({
  entry: [],
}))
