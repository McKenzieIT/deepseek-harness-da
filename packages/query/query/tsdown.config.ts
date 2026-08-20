import { defineConfig } from 'tsdown'

/**
 * Source-only package: the abstract query-engine seam is consumed via `./src/*`
 * by the MaxCompute provider (and re-exported through its types), not bundled as
 * a standalone lib. Skip tsdown's host-face entry so `build:lib:host` does not
 * require a tsc-built `lib/types` — wiring this package as a composite project
 * breaks the typert WorkspaceAnalyzer's `./src/*` cross-package resolution, so
 * it stays source-only by design.
 */
export default defineConfig(() => ({
  entry: [],
}))
