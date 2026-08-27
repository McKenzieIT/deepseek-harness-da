/**
 * ContextLayerService: cross-plugin face behind ctx.contextLayer.
 * Controls fullscreen graph overlay visibility and focus state.
 * Follows the LayoutController pattern (plain class, not extends Service).
 *
 * React components subscribe via useSyncExternalStore(service.subscribe, service.getSnapshot).
 */

export interface IContextLayer {
  open(focusNode?: string): void
  close(): void
  readonly isOpen: boolean
  readonly focusNode: string | undefined
}

interface Snapshot {
  readonly isOpen: boolean
  readonly focusNode: string | undefined
}

export class ContextLayerService implements IContextLayer {
  #snapshot: Snapshot = { isOpen: false, focusNode: undefined }
  #listeners = new Set<() => void>()

  get isOpen(): boolean { return this.#snapshot.isOpen }
  get focusNode(): string | undefined { return this.#snapshot.focusNode }

  open(focusNode?: string): void {
    this.#snapshot = { isOpen: true, focusNode }
    this.#notify()
  }

  close(): void {
    if (!this.#snapshot.isOpen) return
    this.#snapshot = { isOpen: false, focusNode: undefined }
    this.#notify()
  }

  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb)
    return () => { this.#listeners.delete(cb) }
  }

  getSnapshot = (): Snapshot => this.#snapshot

  #notify(): void {
    for (const cb of this.#listeners) cb()
  }
}
