/**
 * B-DA5 — type declaration for `maxc-args.mjs` (pure `maxc` CLI arg-builder,
 * extracted from `runMaxc` in `maxc-sidecar.mjs` so the per-call `--config`
 * routing is unit-testable without spawning `maxc`).
 *
 * Lets `tsc` resolve `import { buildMaxcArgs } from '../dev/maxc-args.mjs'`
 * (in `tests/maxc-args.spec.ts`) without an implicit-`any` (TS7016). The `.mjs`
 * owns the runtime; this `.d.mts` owns the types (`.mjs` → `.d.mts` is TS's
 * declaration-extension mapping for ESM `.mjs` modules).
 */

/**
 * Build the argv tail passed to the `maxc` CLI for one invocation.
 *
 * @param subArgs - the `maxc` sub-command + flags (e.g. `['query','run','--wait','60']`).
 * @param config - the resolved ODPS config path for this call (`--config <config>`).
 * @returns `['--config', config, ...subArgs, '--json']`.
 */
export declare function buildMaxcArgs(subArgs: string[], config: string): string[]
