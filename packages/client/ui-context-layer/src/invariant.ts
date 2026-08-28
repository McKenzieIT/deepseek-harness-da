import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-context-layer'

export const name = 'client-ui-context-layer-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: this package ships the context-layer graph UI and a
 * client-side ContextLayerService (open/close/focusNode); it owns no
 * host-side durable state machine or resource to gate, so it registers only
 * the package name for invariant accounting.
 */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
