import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-suggest-followups'

export const name = 'client-ui-suggest-followups-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: this package renders follow-up suggestion chips
 * client-side; it owns no host-side state machine or durable resource to
 * gate, so it registers only the package name for invariant accounting.
 */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
