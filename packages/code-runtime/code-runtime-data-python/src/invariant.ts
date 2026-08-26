/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-code-runtime-data-python`.
 * @module @deepseek-ai/dsh-code-runtime-data-python/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-code-runtime-data-python'

export const name = 'code-runtime-data-python-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
