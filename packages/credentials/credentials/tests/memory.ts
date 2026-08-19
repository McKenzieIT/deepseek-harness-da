import type { Context } from '@deepseek-ai/cordis'
import { CredentialProvider } from '../src/index.ts'
import type { CredentialAddress, CredentialInfo, CredentialRef, ResolvedCredential } from '../src/index.ts'

/**
 * In-memory credentials provider for interface and consumer tests: one
 * always-writable `memory` source seeded from plugin config. Addressing is a
 * flat `(ref, address)` slot, so the seam's per-user/scope dimension and the
 * `notifyUpdated` fan-out are exercised: a value stored for one user is
 * invisible to another and to the global slot.
 */
export class MemoryCredentials extends CredentialProvider {
  /** Flat key combining a reference with its optional per-user/scope address. */
  private slot(ref: CredentialRef, address?: CredentialAddress): string {
    if (address === undefined) return ref
    return [ref, address.userId ?? '', address.scopeId ?? ''].join(' ')
  }

  private readonly store = new Map<string, string>()

  constructor(ctx: Context, seed: Record<string, string> = {}) {
    super(ctx)
    for (const [key, value] of Object.entries(seed)) this.store.set(key, value)
  }

  override resolve(ref: CredentialRef, address?: CredentialAddress): Promise<ResolvedCredential | undefined> {
    const value = this.store.get(this.slot(ref, address))
    return Promise.resolve(value === undefined || value.length === 0
      ? undefined
      : { value, source: 'memory' })
  }

  override describe(ref: CredentialRef, address?: CredentialAddress): Promise<CredentialInfo> {
    const value = this.store.get(this.slot(ref, address))
    const configured = value !== undefined && value.length > 0
    return Promise.resolve({
      configured,
      ...configured ? { source: 'memory' } : {},
      writable: true,
    })
  }

  override set(ref: CredentialRef, value: string, address?: CredentialAddress): Promise<void> {
    if (value.length === 0) {
      return Promise.reject(new Error('memory credentials: an empty value cannot be stored; use unset'))
    }
    this.store.set(this.slot(ref, address), value)
    this.notifyUpdated(ref, address)
    return Promise.resolve()
  }

  override unset(ref: CredentialRef, address?: CredentialAddress): Promise<void> {
    if (this.store.delete(this.slot(ref, address))) {
      this.notifyUpdated(ref, address)
    }
    return Promise.resolve()
  }
}
