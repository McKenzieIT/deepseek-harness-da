import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-semantic-layer'

export const name = 'client-ui-semantic-layer-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: this package ships the semantic-layer management UI
 * (schema explorer, evidence sidebar, goal dock) and typed RPC bridges; it
 * owns no host-side durable state machine or resource to gate, so it
 * registers only the package name for invariant accounting.
 */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
