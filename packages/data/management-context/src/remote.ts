/**
 * Host-half Remote gateway for the Management Context capability
 * (`ctx.managementContext`). Exposes `managementContext/resolveOrCreate` and
 * `managementContext/createNew` so a client can resolve a Management Context to
 * its Management Session over RPC.
 *
 * This gateway is fork-owned and wired through the data-agent bundle patch; it
 * adds no data-agent behavior to the upstream `api-remotes` package or the
 * Session Controller. The service is the authority — the gateway only forwards.
 *
 * @module @deepseek-ai/dsh-management-context/remote
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from './index.ts'
import type { ManagementContextRequest, ManagementContextResolution } from './types.ts'

/**
 * Client-side contract for the `managementContext` Remote namespace. The client
 * calls `ctx.remote.managementContext.resolveOrCreate(request)`; the host
 * gateway dispatches to {@link ManagementContextGateway}.
 */
export interface ManagementContextRemote {
  /**
   * Resolve the Management Context to its Management Session, creating one only
   * when none exists yet.
   * @param request - the Workspace and Data Scope identifying the context.
   * @returns the resolved session id and whether this call created it.
   */
  resolveOrCreate(
    request: ManagementContextRequest,
  ): ManagementContextResolution | Promise<ManagementContextResolution>
  /**
   * Always create another Management Session for the context.
   * @param request - the Workspace and Data Scope identifying the context.
   * @returns the new session id, with `created: true`.
   */
  createNew(
    request: ManagementContextRequest,
  ): ManagementContextResolution | Promise<ManagementContextResolution>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host Remote gateway over `ctx.managementContext`. */
    managementContextGateway: ManagementContextGateway
  }
}

/**
 * Host Remote gateway over `ctx.managementContext`. Register as a Host plugin to
 * expose the `managementContext/resolveOrCreate` and `managementContext/createNew`
 * endpoints; the Typert Gateway routes incoming calls through the live
 * `@Remote` markers or the generated strict descriptors.
 */
export class ManagementContextGateway extends TypertRemoteService {
  static inject = ['managementContext']

  /** @param ctx - Cordis context providing `ctx.managementContext`. */
  constructor(ctx: Context) {
    super(ctx, 'managementContextGateway', { namespace: 'managementContext' })
  }

  /**
   * Remote face of {@link ManagementContextService.resolveOrCreate}.
   * @param request - the Workspace and Data Scope identifying the context.
   * @returns the resolved session id and whether this call created it.
   */
  @Remote('resolveOrCreate')
  resolveOrCreate(request: ManagementContextRequest): Promise<ManagementContextResolution> {
    return this.ctx.managementContext.resolveOrCreate(request)
  }

  /**
   * Remote face of {@link ManagementContextService.createNew}.
   * @param request - the Workspace and Data Scope identifying the context.
   * @returns the new session id, with `created: true`.
   */
  @Remote('createNew')
  createNew(request: ManagementContextRequest): Promise<ManagementContextResolution> {
    return this.ctx.managementContext.createNew(request)
  }
}

export default ManagementContextGateway
