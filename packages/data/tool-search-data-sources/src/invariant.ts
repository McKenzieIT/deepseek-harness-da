/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-search-data-sources`.
 * @module @deepseek-ai/dsh-tool-search-data-sources/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-search-data-sources'

/** Cordis companion plugin name. */
export const name = 'tool-search-data-sources-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this tool is a stateless model-facing retriever — it
 * soft-probes `ctx.schema`/`ctx.retrieval`/`ctx.llm`/`ctx.query` (each optional)
 * and returns a pure ranked-candidate result; it owns no persistent registry
 * slot and exposes no continuously observable in-process relation beyond its
 * own tool registration. The `invariants` companion only reserves package
 * ownership so a second mount of the same package fails loud.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
