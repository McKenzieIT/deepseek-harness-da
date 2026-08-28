/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-result-cache`.
 * @module @deepseek-ai/dsh-result-cache/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-result-cache'

export const name = 'result-cache-invariant'
export const inject = ['invariants']

// No runtime invariant: this package is an abstract Service Definition seam;
// concrete implementations (e.g. dsh-result-cache-memory) own the stored
// entries and the immutable-once-written relation, so runtime invariants
// belong to the implementing package.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
