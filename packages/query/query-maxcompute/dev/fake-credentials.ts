// PROTOTYPE STAND-IN (throwaway) — fake credentials provider for P4b scenarios.
//
// Mirrors the credentials seam (`ctx.credentials`) with in-memory ODPS creds so
// the query-maxcompute provider's per-call resolve has something to read
// without the real credentials-local file. The real credentials-local is
// production (T1/P12); this stand-in is for the P1-wiring scenarios only.

import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'

const INITIAL: Array<[CredentialRef, string]> = [
  [credentialRef('ODPS_ACCESS_ID'), 'AK_OLD'],
  [credentialRef('ODPS_ACCESS_KEY'), 'SK_OLD'],
  [credentialRef('ODPS_PROJECT'), 'proj-game-x'],
  [credentialRef('ODPS_ENDPOINT'), 'odps.cn'],
]

/** In-memory credentials provider: resolve per call (no cache), set fans `credentials/updated`. */
export class FakeCredsProvider extends CredentialProvider {
  private values = new Map<CredentialRef, string>(INITIAL)

  override resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value !== undefined ? { value, source: 'fake' } : undefined)
  }

  override describe(ref: CredentialRef): Promise<CredentialInfo> {
    const value = this.values.get(ref)
    const info: CredentialInfo = { configured: value !== undefined, writable: true }
    if (value !== undefined) info.source = 'fake'
    return Promise.resolve(info)
  }

  override async set(ref: CredentialRef, value: string): Promise<void> {
    if (value.length === 0) throw new Error(`fake-creds: empty value for "${ref}"; use unset`)
    this.values.set(ref, value)
    this.notifyUpdated(ref)
  }

  override async unset(ref: CredentialRef): Promise<void> {
    this.values.delete(ref)
    this.notifyUpdated(ref)
  }
}

export default FakeCredsProvider
