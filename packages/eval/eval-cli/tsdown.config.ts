import { defineConfig } from 'tsdown'

/**
 * Source-only CLI package: consumed via `./src/*` subpath exports, not as a
 * bundled lib. tsconfig has noEmit: true so no lib/types/ output exists.
 */
export default defineConfig(() => ({
  entry: false as any,
}))
