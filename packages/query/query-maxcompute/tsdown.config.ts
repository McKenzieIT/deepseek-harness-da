import { defineConfig } from 'tsdown'

/**
 * Builds each published entry as a self-contained file admitted by the package
 * whitelist. Mirrors `@deepseek-ai/dsh-query-postgres` / `@deepseek-ai/dsh-eval-cli`:
 * tsdown bundles the tsc-emitted `lib/types/*.js` (produced by the host
 * aggregate, which already references this package) into self-contained
 * `lib/*.js` — `clean:false` preserves the declarations tsdown runs after.
 *
 * The earlier `entry:[]` (source-only) was flipped so the package-owned
 * invariant companion actually produces `lib/invariant.js`
 * (verify-package-invariants / verify-built gates). The `./src/*` cross-package
 * concern that motivated source-only is vacuous: typert resolves the bare name
 * to source via tsconfig.base.json `paths` regardless of `lib/` artifacts.
 * See GA-FORK-CI-built-pkg-invariants.
 */
export default defineConfig([
  {
    entry: ['lib/types/index.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, outputOptions: { codeSplitting: false }, dts: false, clean: false,
  },
])
