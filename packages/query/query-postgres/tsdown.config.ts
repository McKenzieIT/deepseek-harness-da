import { defineConfig } from 'tsdown'

/**
 * Source-only package: consumed via `./src/*` by other host packages (mirrors
 * `@deepseek-ai/dsh-query` and `@deepseek-ai/dsh-query-maxcompute`), not as a
 * standalone bundled lib. Skip tsdown's host-face entry so `build:lib:host`
 * does not require a tsc-built `lib/types` — wiring this package as a
 * composite project breaks the typert WorkspaceAnalyzer's `./src/*`
 * cross-package resolution, so it stays source-only by design.
 */
export default defineConfig(() => ({
  entry: [],
}))
