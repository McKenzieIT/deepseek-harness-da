# Conventions and verification

The rules every mode shares, then the verification matrix and how to run what you built. Each rule names its enforcing gate or owning document rather than restating it; the [root AGENTS.md](../../../AGENTS.md) is the standing authority and the [glossary](../../../docs/glossary.md) defines the vocabulary. A local `AGENTS.md` in the edited subtree adds orders — read the one directory above your edit.

## Vocabulary

A **plugin** is a TypeScript module exporting an `apply(ctx)` function. A **package** is a workspace or npm unit that may contain plugins. A **composition** is a `cordis.yml` plugin tree — host, bundle patch, example, or preset. A **capability seam** splits Service Definition (the `ctx` interface), Service Provider (the implementation), and Consumer (the model-facing user of the capability) into separate packages when those roles evolve independently.

## Plugin body rules

- Export shape: named exports `name` / `inject` / `apply`; never a default export — a default export silently drops `inject` and breaks dependency waiting ([postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).
- Registrations are effects: every listener, tool, service, timer, and slot registration goes through `ctx.on()`, `ctx.effect()`, or a `register()` that returns its disposer. Cleanup must be undoable when the plugin unloads.
- Waterfall listeners must call `next()` to delegate; returning without it short-circuits the chain ([semantics](../../../docs/cordis-primer.md#cordis-waterfall-semantics)).
- Read an optional service with `ctx.get('name')` and handle `undefined`; declare `inject: ['name']` only for hard dependencies the plugin must wait for.
- Typed events use declaration merging. A new event's JSDoc carries `@mode` and payload `@param`; a new `SessionEventMap` member is required-on-read unless it carries `ignorable: true` ([event guide](../../../docs/user/develop/framework/events.md)).
- Model-visible implies logged: anything reaching a model request must be reconstructable from the session log; a new model-visible input requires a session event.
- Tool plugins: pick the render intent (`generic` / `terminal` / `diff`, `locations`) up front and keep presenters pure functions of args ([adding a tool](../../../docs/cookbook/adding-a-tool.md)); choose interception points by the selection rule at [execution policy and observation](../../../docs/cookbook/adding-a-tool.md#execution-policy-and-observation).
- No hardcoded tunables: deployment-varying choices become validated `Config` fields changeable from `cordis.yml`; misconfiguration fails loud at load or at the earliest resolvable point, never as a silent skip.
- Explicit over implicit at package boundaries: defaulting is an explicit `resolve(request): Spec` step in the owning implementation, never a hidden `?? default` inside `run()`.
- Prefer maintained dependencies over hand-rolling when they genuinely delete owned code and tests ([policy note](../../../.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)).

## Repository hygiene

- ESM everywhere; in-package relative imports use explicit `.ts` specifiers in source, which the compiler rewrites in emitted JavaScript.
- Every module and export carries concise JSDoc for its non-obvious contract; `verify-export-jsdoc` enforces function-like exports.
- An empty `catch` names what it swallows and why nothing else can reach it.
- Files end with exactly one trailing newline; the pre-commit hook gates it.
- Non-trivial changes include an [Agent Note](../../../.agents/notes/README.md) in the same change recording the decision; docs and README contracts update together with code.
- Bilingual pairs under `docs/` and `examples/` update both language sides in the same change; prefer an unpaired home for content that will churn ([i18n contract](../../../docs/i18n/README.md)).

## Verification matrix

Run the narrowest checks that cover the diff; CI owns exhaustive coverage. `pnpm run doc-sync` aggregates the documentation gates. Match evidence to surface:

| Change | Required evidence |
|---|---|
| Package or script behavior | The owning Vitest file or focused test name; adjacent tests when a shared contract changes |
| Any documentation, catalog, or Agent Note | `pnpm run doc-sync` |
| Model-, editor-, CLI-, or terminal-visible output | The focused keyless snapshot through a real runnable example |
| Package manifests, exports, build config, bins | `pnpm run build`, relevant `pnpm run hygiene` checks, the owning built-artifact smoke |
| Real provider or agent behavior | The relevant `pnpm run test:e2e` target when credentials exist |
| New workspace package | The full checklist sequence in [adding a package](../../../docs/cookbook/adding-a-package.md) § 5 |

For push-time selection the [`dsh-pre-push-checks`](../dsh-pre-push-checks/SKILL.md) skill owns the procedure, including focused per-file coverage:

```sh
pnpm exec vitest run packages/<group>/<package>/tests/<behavior>.spec.ts \
  --coverage \
  --coverage.include='packages/<group>/<package>/src/**/*.ts'
```

Testing policy and the snapshot obligation live in [docs/testing.md](../../../docs/testing.md); a new model- or product-user-visible behavior adds or updates a keyless snapshot through a real runnable example in the same change.

## Running the result

Observing real behavior beats asserting it. From the repository root, after `pnpm install`:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml   # Web UI with a scratch overlay
pnpm run demo:cordis                               # Web UI with the self-referential Cordis toolset
pnpm run demo:acp                                  # ACP automation server
pnpm dsh --profile headless "task"                 # one-shot task run
```

`demo:cordis`, `demo:acp`, and `dsh --profile` need `DEEPSEEK_API_KEY`. The Cordis tutorial runs keylessly from a scratch directory with `node --import tsx ../../vendor/cordis/bin.js` ([setup](../../../docs/cordis-tutorial/index.md#setup)); its chapters double as smoke tests for framework-level plugins. For Web UI changes, refresh the served URL after rebuilding affected artifacts — only client-plugin bundles hot-reload without a refresh.

## Common failure map

- Plugin loads but its dependency never resolves → default export instead of named, or missing `inject` ([postmortem 0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).
- A registered hook stops other plugins from running → a waterfall listener returned without calling `next()`.
- A capability works in one composition but not another → a package nothing mounts is unreachable; wire its mount row in the same change.
- A tunable cannot be changed from `cordis.yml` → it is hardcoded; move it to a validated `Config` field.
- A silently skipped feature (missing provider, absent file) → misconfiguration must fail loud instead.
- A new tool renders as raw JSON in the Web UI → render intent never chosen; add the presenter ([adding a tool](../../../docs/cookbook/adding-a-tool.md)).
- Tests pass but the assembled app misbehaves → package tests do not substitute for a keyless snapshot through a real runnable example ([testing policy](../../../docs/testing.md)).
