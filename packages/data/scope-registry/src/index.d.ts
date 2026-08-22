/**
 * Per-scope namespace registry (`ctx.scopes`). A runtime-mutable store of scope
 * definitions — each scope maps an id to a filesystem `semanticRoot` path plus
 * optional metadata (active provider, project name, etc.). The registry is
 * persisted to a YAML file on disk; the Cordis static config tells the service
 * WHERE to find the file (`registryPath`), while the file itself is the
 * runtime-mutable state that CLI / API / Web UI can read and write.
 *
 * Design decisions (semantic-layer map P1):
 * - Cordis config = WHERE the registry lives (static, set at bundle mount).
 * - Registry YAML = WHAT scopes exist + which is active (runtime-mutable).
 * - Scope = pure namespace; the id carries no semantics beyond being a key.
 * - Active scope is a per-process singleton; switching emits an event so
 *   consumers (SemanticLayerService, audit, query engine) can react.
 *
 * @module @deepseek-ai/dsh-scope-registry
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
/** A single scope definition in the registry. */
export interface ScopeDefinition {
  /** Unique scope identifier (the namespace key). */
  readonly id: string
  /** Filesystem path to this scope's semantic-layer root (dir with config.yaml/events/tables). */
  readonly semanticRoot: string
  /** Arbitrary metadata — active provider, project name, engine type, etc. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
export interface ScopeRegistryConfig {
  /** Path to the scopes.yaml registry file. Empty = service is inert (no scopes). */
  readonly registryPath: string
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    scopes: ScopeRegistryService
  }
  interface Events {
    'scopes/changed': () => void
    'scopes/active-changed': (scopeId: string | undefined) => void
  }
}
/**
 * Scope registry Cordis service. Reads and writes a YAML file at `registryPath`
 * containing scope definitions and the active scope id. All mutations are
 * atomic (cross-process safe via file lock + atomic write).
 */
export declare class ScopeRegistryService extends Service {
  static Config: z<ScopeRegistryConfig>
  private readonly registryPath
  private cache
  constructor(ctx: Context, config: ScopeRegistryConfig)
  /** All registered scopes. Returns empty array when registryPath is unset or file missing. */
  list(): readonly ScopeDefinition[]
  /** Get a scope by id. Returns undefined when not found. */
  get(id: string): ScopeDefinition | undefined
  /** The currently active scope definition, or undefined if none is active. */
  active(): ScopeDefinition | undefined
  /** The currently active scope id, or undefined if none is active. */
  activeId(): string | undefined
  /** Set the active scope by id. Throws if the scope does not exist in the registry. */
  setActive(id: string): Promise<void>
  /** Clear the active scope (no scope is active). */
  clearActive(): Promise<void>
  /** Register (or update) a scope definition. If this is the first scope, it becomes active. */
  register(scope: ScopeDefinition): Promise<void>
  /** Remove a scope from the registry. If it was active, active becomes undefined. */
  remove(id: string): Promise<void>
  private ensureConfigured
  /** Load (or return cached) registry from disk. Returns empty state when inert. */
  private load
  /** Read the registry YAML from disk. Missing file = empty registry. */
  private readFile
  /** Atomic read-modify-write cycle with cross-process file lock. Invalidates cache. */
  private mutate
  /** Serialize registry state to YAML. */
  private serialize
  /** Invalidate the in-memory cache so the next read re-reads from disk. */
  invalidateCache(): void
}
export default ScopeRegistryService
//# sourceMappingURL=index.d.ts.map
