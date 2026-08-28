# `@deepseek-ai/dsh-scope-registry`

Per-scope namespace registry (`ctx.scopes`): a runtime-mutable store of scope
definitions for the data agent. Each scope maps an id to a filesystem
`semanticRoot` path plus optional metadata (active provider, project name,
engine type, etc.). The registry is persisted to a YAML file on disk; the
Cordis static config tells the service WHERE the file lives (`registryPath`),
while the file itself is the runtime-mutable state that CLI / API / Web UI can
read and write.

This is the scope seam the [`@deepseek-ai/dsh-semantic-layer`](../semantic-layer)
service consumes: the active scope id selects which `semanticRoot` the
semantic layer scans for `config.yaml`/`events/`/`tables/`, so a scope switch
re-grounds the corpus the model reasons over.

## Status: registered + callable; configured at bundle mount

The service is registered by the data-agent bundle patch
(`packages/bundle/data-agent/cordis.patch.yml`, `scope-registry`) and mounts
`ctx.scopes` on the global Cordis context. When `registryPath` is empty
(the default static config), the service is inert: it returns an empty scope
list and `active()` / `activeId()` return `undefined`, and any write API call
throws "registryPath not configured" rather than silently no-op'ing. A real
profile configures `registryPath` to point at a `scopes.yaml` file; absent or
empty YAML is treated as "no scopes" (no crash).

## Design

- **Cordis config = WHERE** the registry lives (static, set at bundle mount).
- **Registry YAML = WHAT** scopes exist + which is active (runtime-mutable).
- **Scope = pure namespace**; the id carries no semantics beyond being a key.
- **Active scope is a per-process singleton**; switching emits an event so
  consumers (SemanticLayerService, audit, query engine) can react.
- **All mutations are atomic** (cross-process safe via `withFileLock` +
  `writeFileAtomic`); reads re-load from disk on every call (the file is tiny,
  no cache needed).

## Config

```ts ignore-check
export interface ScopeRegistryConfig {
  /** Path to the scopes.yaml registry file. Empty = service is inert (no scopes). */
  readonly registryPath: string
}
```

`registryPath` is a validated Cordis `z.string()` config field (default
`''`). A `~/`-prefixed path is expanded against `os.homedir()`. There are no
hardcoded tunables: every knob is a validated Config field.

## Cordis seam

The service declares the `ctx.scopes` property and two typed events:

```ts ignore-check
declare module '@deepseek-ai/cordis' {
  interface Context {
    scopes: ScopeRegistryService
  }
  interface Events {
    /** Fired after register()/remove() changes the scope set (not on pure active switch). @mode emit */
    'scopes/changed': () => void
    /** Fired after the active scope id changes. @param scopeId - new active id, or undefined. @mode emit */
    'scopes/active-changed': (scopeId: string | undefined) => void
  }
}
```

`scopes/changed` fires after the set of registered scopes mutates (register /
remove); a pure active-scope switch (`setActive` / `clearActive`) does NOT
fire it. `scopes/active-changed` fires after the active id changes — via
`setActive`, `clearActive`, `register()` making the first scope active, or
`remove()` deactivating the previously active scope. Events are emitted only
after the `mutate()` write commits (state published at its commit point).

## Verification

```sh
tsc -b packages/data/scope-registry/tsconfig.json
pnpm vitest run packages/data/scope-registry
pnpm verify-cordis-config
```

## Model Experience

### What the model sees

The scope registry itself is not a model-facing tool and contributes no tool
schema to the system prompt. Its effect on the model is indirect: the active
scope id selects the `semanticRoot` the `ctx.schema` semantic-layer service
scans, so a scope switch re-grounds the table / event / metric corpus the
model reasons over in the `UNDERSTANDING` / `GENERATION` phases. The model
discovers the resulting corpus through the model-facing `load_*` / `search_*`
tools, not through `ctx.scopes` directly.

### Token effect

The registry carries no per-turn token charge: it publishes no tool schema and
appends no tool-result text. Its only token-side effect is that a scope switch
can change which definitions the `load_*` / `search_*` tools return on
subsequent turns, which in turn changes those tools' result-token cost. The
registry reads / writes themselves are out-of-band (YAML on disk), not part of
the conversation payload.

### KV Cache effect

A scope switch does not rewrite the conversation history, so prior cache
entries survive. The downstream effect is that the `load_*` / `search_*` tool
results may differ on the next call (a different corpus), which appends
fresh, cache-miss tool-result text — but the reusable request prefix (system
prompt + tool schemas) is unchanged by a scope switch. The registry emits no
cache-churning output of its own.

## Known Limitations and Deferred Work

- **Inert by default (empty `registryPath`)** — with the default empty
  `registryPath` the service loads no file, `list()` returns `[]`, and
  `active()` / `activeId()` return `undefined`; write API calls throw
  "registryPath not configured". A real `scopes.yaml` path is configured at
  the profile / runtime level (the bundle patch), not shipped as a default.
- **Per-process active-scope singleton** — the active scope is a per-process
  value read from the YAML file, not a distributed lock across processes. The
  registry file itself is cross-process safe (file lock + atomic write), but
  two processes can hold different active scopes if each wrote one; the
  `scopes/active-changed` event fires only in the process that performed the
  switch. A cross-process active-scope-coordination layer is deferred.
- **Reads re-load from disk on every call** — `load()` re-reads the YAML on
  each `list` / `get` / `active` call (no in-memory cache). This is deliberate
  (the file is tiny and it keeps consumers honest across processes) but means
  the read path is not zero-copy; a cache + invalidation hook is deferred
  until profiling shows it matters.
- **Scope switching is detected lazily downstream** — `SemanticLayerService`
  detects a scope switch lazily in `corpusVersion()` (no `scopes/active-changed`
  listener), by comparing the active id against the last-seen id; this is by
  design (no event listener, correct including switch-back). An eager
  invalidation-on-event wiring is intentionally not added.
- **No per-package runtime invariant** — this package ships no
  `src/invariant.ts`; invariants for D3 packages are centrally registered and
  `verify-package-invariants` passes without a per-package invariant file.
  Adding a per-package runtime invariant is not required.
