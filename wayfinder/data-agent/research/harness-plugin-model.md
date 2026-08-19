# Harness Plugin Model — Adding a Capability to `deepseek-harness-da`

A wayfinder research note. Every claim is traced to a primary source in this
checkout. Citations use `path` plus a stable landmark (`#heading`, `§section`,
or `:symbol`); line numbers are approximate where given. INFERENCE marks a
conclusion not stated verbatim by a source.

Primary sources read:
- Skill: `.agents/skills/dsh-plugin-development/{SKILL,CONVENTIONS,MODES}.md`
- Architecture: `docs/architecture.md`, `docs/cordis-primer.md`, `docs/glossary.md`,
  `docs/capability-seams.md`, `docs/testing.md`, `docs/cookbook/{adding-a-package,adding-a-tool,extension-cookbook}.md`
- Code: `packages/shell/{shell,bash-local,tool-bash}/{src/index.ts,package.json,README.md}`,
  `packages/shell/shell/src/types.ts`, `packages/bundle/{README.md,base/{README.md,package.json,cordis.patch.yml}}`,
  `packages/preset/{README.md,agent-presets/tests/fixtures/user/standard/agent.cordis.yml}`,
  `examples/web-cordis/cordis.yml`, `packages/README.md`

---

## 0. The model in one paragraph

Cordis is the vendored plugin framework; every part of the product is a plugin
contributing services, typed events, and reversible effects to a shared
`ctx` (`docs/architecture.md#cordis`). A **plugin** is a TS module exporting
named `name` / `inject` / `apply(ctx)` (or a `Service` subclass); a **package**
is the workspace unit that may contain plugins; a **composition** is a
`cordis.yml` plugin tree (`CONVENTIONS.md#vocabulary`). A running `dsh` is a
plugin tree composed at boot from ordered layers: each bundle in the profile's
listed order, then the profile `cordis.patch.yml`, then home-level, then any
`--patch` overlay (`docs/architecture.md#profiles-and-bundles`). There is no
privileged core; you extend by mounting a plugin beside the others, and
registrations unwind when their plugin unloads. A **capability seam** splits
Service Definition (the `ctx` interface), Service Provider (implementation),
and Consumer (model-facing user) into separate packages when those roles
evolve independently (`docs/glossary.md#capability-seam`).

---

## 1. Step-by-step: how to add a new capability plugin

The authoritative checklist is `docs/cookbook/adding-a-package.md`; the skill
routes via `MODES.md#3-repository-package`. Summary, cited:

### 1.1 Decide the contribution shape and topology first
- Contribution shape (tool / hook / UI / conversation node / settings card /
  LLM adapter / vendored package): choose from `SKILL.md#contribution-shape-cookbooks`
  and `docs/cookbook/extension-cookbook.md`.
- Topology: a **swappable capability** splits Service Definition / Provider /
  Consumer into separate packages when the roles evolve independently (the
  shell trio is the template — `docs/architecture.md#capability-seams`,
  `docs/cookbook/adding-a-package.md#3-decide-the-package-topology`). A
  single-purpose plugin stays one package.
- Role-naming rules: `docs/cookbook/adding-a-package.md#3-decide-the-package-topology`
  (the word table: `Controller/Store/Registry/Runtime/Provider/Backend/...`).
  Singular `ctx` key for one engine/runtime/policy; plural key for a registry.

### 1.2 Create the package files
Per `docs/cookbook/adding-a-package.md#1-create-the-package`:

```
packages/<group>/<pkg>/
  package.json     # copy from packages/core/tools; adjust name/description/deps
  tsconfig.json     # extends ../../../tsconfig.base.json; rootDir src; outDir lib/types;
                    # references vendor/cordis (+vendor/schemastery if Config) + each dsh dep
  src/index.ts      # service default export OR plugin (name/inject/apply/Config)
  README.md         # service API, events, extension points, + gated Model Experience
                    # + Known Limitations sections
  src/invariant.ts  # (package gates expect lib/invariant.js to exist)
```

`package.json` invariants (enforced by `pnpm run constraints` /
`scripts/check-workspace-constraints.ts`):
- `private: true`; `version` matches root `package.json`; `type: "module"`;
- `main: "lib/index.js"`; `types: "lib/types/index.d.ts"`;
- `exports["."]` with `types` + `default` subpaths; an `./invariant` subpath;
  `@deepseek-ai/cordis` in BOTH `peerDependencies` AND `devDependencies`
  (same range); mirror every dsh peer in `devDependencies`;
- `@deepseek-ai/schemastery` in `dependencies` (runtime validator);
- `files` = `["lib/index.js","lib/invariant.js","lib/types/**/*.d.ts"]` plus
  runtime artifacts.
See `packages/shell/shell/package.json` and `packages/shell/bash-local/package.json`
for worked examples. In-package relative imports use explicit `.ts` specifiers
in source (`export * from './types.ts'`); the compiler rewrites to `.js`
(`docs/cookbook/adding-a-package.md#1-create-the-package`).

### 1.3 Implement the seam(s)

**Service Definition** (when swappable) — abstract class extending `Service`,
owns the `ctx.<key>` and vocabulary types, declares the key via TS declaration
merging. Template: `packages/shell/shell/src/index.ts`:
- `declare module '@deepseek-ai/cordis' { interface Context { shell: ShellExecutor } }`
  (`packages/shell/shell/src/index.ts`, declaration-merging block).
- `export abstract class ShellExecutor extends Service { constructor(ctx) { super(ctx, 'shell') } abstract resolve/run/start }`
  (same file, `ShellExecutor` class).
- Types live in `packages/shell/shell/src/types.ts` (`ShellExecRequest` /
  `ShellExecSpec` / `ShellRunResult` / `ShellProcess`) and are re-exported.

**Service Provider** — extends the Service Definition, `static inject` lists
hard deps, `static Config` is a schemastery schema, default-exported. Template:
`packages/shell/bash-local/src/index.ts`:
- `export class LocalBashExecutor extends ShellExecutor { static inject = ['subprocess']; static Config: z<Config> = z.object({...}) ; constructor(ctx, config) {...} resolve(...) run(...) start(...) }`
  (`packages/shell/bash-local/src/index.ts`, `LocalBashExecutor` class).
- `export default LocalBashExecutor`.

**Consumer** (model-facing tool) — function plugin with named exports
`name` / `inject` / `apply(ctx, config)`, registers on `ctx.tools` via
`defineTool`. Template: `packages/shell/tool-bash/src/index.ts`:
- `export const name = 'tool-bash'`
- `export const inject = ['tools', 'shell', 'systemPrompt', 'shellEnv']`
- `export function apply(ctx, config) { ctx.systemPrompt.section({...}); ctx.tools.register(defineTool({...})) }`
  (all in `packages/shell/tool-bash/src/index.ts`).

Plugin body rules (`CONVENTIONS.md#plugin-body-rules`):
- Named exports only — a default export silently drops `inject` and breaks
  dependency waiting (`docs/postmortem/0001-acp-default-export-drops-inject.md`).
- Registrations are effects: every listener/tool/service/timer goes through
  `ctx.on()` / `ctx.effect()` / a `register()` returning its disposer.
- Waterfall listeners must call `next()` (`docs/cordis-primer.md#cordis-waterfall-semantics`).
- Read an optional service with `ctx.get('name')`; declare `inject` only for
  hard dependencies the plugin must wait for.
- No hardcoded tunables: deployment-varying choices become validated `Config`
  fields changeable from `cordis.yml`; misconfiguration fails loud at load.
- Explicit over implicit at package boundaries: defaulting is an explicit
  `resolve(request): Spec` step in the owning implementation, never a hidden
  `?? default` inside `run()`.

### 1.4 Register the package in root configs
Per `docs/cookbook/adding-a-package.md#2-register-it-in-the-root-configs`:
- `tsconfig.host.json` (Host package) OR `tsconfig.client.json` (Client) — add
  `{ "path": "./packages/<group>/<pkg>" }` to `references`. An ordinary package
  belongs to exactly one aggregate, never both.
- `tsconfig.base.json` — no edit for an existing group; for a new group, add a
  `./packages/<group>/*/src` candidate to the `@deepseek-ai/dsh-*` wildcard.
- `knip.json` — only if entrypoints aren't already covered.
- Auto-covered by globs/manifest discovery: root `package.json` workspaces,
  `scripts/publint-all.ts`, `tsdown.config.ts`, `.oxlintrc.json`,
  `scripts/check-workspace-constraints.ts`.

### 1.5 Write the package README
Per `docs/cookbook/adding-a-package.md#4-write-the-package-readme`: service API,
config, events, extension points, design notes first; then the gated
`## Model Experience` sequence (one H3 per model-context entry, with
`#### What the model sees` / `#### Token effect` / `#### KV Cache effect` H4s),
then `## Known Limitations and Deferred Work`. Reference implementations:
`packages/shell/tool-bash/README.md` (full Model Experience for a tool),
`packages/bundle/base/README.md` (the `Indirectly, through ...` short form).
The verifiers: `scripts/verify-package-readme-model-experience.ts` and
`scripts/verify-package-readme-limitations.ts`.

### 1.6 Mount the plugin in a composition
Repository plugins mount ONLY through compositions — a bundle patch row, an
example `cordis.yml`, or a host/preset composition naming the package. "A new
package nothing mounts is not yet reachable; wire the intended mount in the
same change" (`MODES.md#3-repository-package`, loading paragraph).

**Composition row syntax** (from `packages/bundle/base/cordis.patch.yml`):
```yaml
- insert:
    - id: <stable-row-id>          # targeted by later patches by id
      name: '@deepseek-ai/dsh-<pkg>'   # the npm package the row mounts
      config: { ... }              # optional; a patch replaces the WHOLE config
      disabled: !!js <expression>  # optional; loader evaluates at every mount
```
A **patch overlay** (profile `cordis.patch.yml`, `--patch`, or a later bundle)
targets a row by id and replaces its whole config, or inserts new rows:
```yaml
# replace an existing row's config (no `insert:` wrapper):
- id: <existing-row-id>
  config: { ... }
# insert new rows:
- insert:
    - id: <new-row-id>
      name: '@deepseek-ai/dsh-<pkg>'
```
See `examples/web-cordis/cordis.yml` for both forms in one file, and
`packages/bundle/base/README.md` ("A patch replaces whole row configs...").

Layer order (applied to an empty entry list): each bundle in the profile's
`dsh.profile.bundles` listed order, then the profile `cordis.patch.yml`, then
the home-level one, then any `--patch` overlay; last write wins per row id
(`docs/architecture.md#profiles-and-bundles`, `packages/bundle/base/cordis.patch.yml`
header comment).

**Bundle manifest**: to ship a bundle, add `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
to the bundle package's `package.json` and export the patch file
(`packages/bundle/base/package.json`, `dsh` field; `exports["./cordis.patch.yml"]`).

**Agent preset** (per-session composition, no new code): a directory under
`${DSH_HOME:-$HOME/.dsh}/.agent-presets/<id>/` holding one `agent.cordis.yml`
(`MODES.md#6-agent-preset-composition`, `packages/preset/README.md`). A preset
row that publishes a process-global service is rejected at mount. Example row:
`packages/preset/agent-presets/tests/fixtures/user/standard/agent.cordis.yml`.

### 1.7 Verify
Per `docs/cookbook/adding-a-package.md#5-verify` and `CONVENTIONS.md#verification-matrix`:
```sh
pnpm install
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```
Plus behavior-specific tests (see §1.8). For a new workspace package the full
checklist sequence is required.

### 1.8 Tests required
From `docs/testing.md` and `CONVENTIONS.md#verification-matrix`:
- **Unit**: vitest under `tests/**` of the package; every registry gets an
  HMR-safety test (dispose the contributing fiber, assert cleanup). Prefer
  edge cases, error paths, event ordering, concurrency races.
  Example: `packages/shell/bash-local/tests/executor.spec.ts`,
  `packages/shell/shell/tests/service.spec.ts`.
- **Coverage gate**: `pnpm run test:coverage` — per-file 100% on
  `packages/*/*/src`.
- **Real-composition test**: product-visible plugins require a non-unit
  REAL-composition test — boot test-only `cordis.yml` through the Loader and
  app/process, mock only external services, assert model-visible request/log
  or user-visible output (`docs/testing.md#test-the-real-entry-path`). For a
  plugin without `inject`, add `expect('default' in mod).toBe(false)` plus an
  `unwrapExports` round-trip assertion (catches the default-export regression).
- **Snapshot**: a non-trivial model-/protocol-/human-visible change adds or
  updates a keyless scenario through a real runnable example in the same
  change (`docs/testing.md#when-a-snapshot-test-is-required`).
- **With-key e2e**: `pnpm run test:e2e` — real provider API; self-skip without
  key. "We are DeepSeek — do not ration real-API tests."
- Run the result to observe behavior: `pnpm dsh web --patch ./scratch-plugin/cordis.yml`,
  `pnpm run demo:cordis`, `pnpm dsh --profile headless "task"`
  (`CONVENTIONS.md#running-the-result`).

---

## 2. Extension-point catalog (every documented seam)

### 2.1 The `ctx` service catalog
`docs/capability-seams.md` is the generated, guard-backed catalog. Every
`ctx.<key>` with its role (seam / core / bundle), owner package, known
implementations, and direct consumers is in its table. The seams (swappable
capabilities with >=1 provider) — the ones a migration targets:

| `ctx` key | Seam owner (Service Definition) | Provider(s) | Canonical consumer(s) |
| --- | --- | --- | --- |
| `ctx.llm` | `packages/llm/llm` | `llm-deepseek`, `llm-pi-ai`, `llm-replay` | `agent-loop`, `compaction-basic` |
| `ctx.shell` | `packages/shell/shell` | `bash-local`, `bash-sandbox`, `pwsh-local` | `tool-bash`, `tool-pwsh`, `hooks-*` |
| `ctx.shellEnv` | `packages/shell/shell-env` | — | `tool-bash`, `tool-pwsh` |
| `ctx.terminals` | `packages/terminal/terminal` | `terminal-bash` | `tool-terminal` |
| `ctx.subprocess` | `packages/subprocess/subprocess` | `subprocess-local`, `subprocess-e2b` | `bash-local`, `bash-sandbox`, `terminal-bash`, `lsp-stdio`, `subagent-acp/codex/claude-code` |
| `ctx.sandbox` | `packages/sandbox/sandbox` | `sandbox-local` | `bash-sandbox`, `terminal-bash` |
| `ctx.sandboxPolicy` | `packages/sandbox/sandbox-policy` | — | `bash-sandbox`, `fs-sandbox`, `terminal-bash` |
| `ctx.fs` | `packages/fs/fs` | `fs-local`, `fs-sandbox`, `fs-e2b` | `tool-fs` |
| `ctx.codeRuntime` | `packages/code-runtime/code-runtime` | `code-runtime-worker` | `tools` (Code Mode) |
| `ctx.lsp` | `packages/lsp/lsp` | `lsp-local` | `tool-lsp` |
| `ctx.skills` | `packages/skill/skill` | `skill-badge`, `skill-filesystem` | `tool-skill` |
| `ctx.web` | `packages/web/web` | `web-search-exa/perplexity/deepseek`, `web-fetch-http` | `tool-web` |
| `ctx.subagents` | `packages/subagent/subagent` | `subagent-spawn-in-process`, `-fork-in-process`, `-acp`, `-codex`, `-claude-code`, `-dsh-sdk` | `tool-subagent`, `tool-subagent-control`, `tool-ralph` |
| `ctx.jobs` | `packages/jobs/jobs` | `jobs-local` | `tool-bash`, `tool-terminal`, `tool-subagent`, `tool-jobs` |
| `ctx.workflowEngine` | `packages/workflow/workflow` | `workflow-worker-thread` | `tool-workflow`, `tool-ralph` |
| `ctx.compaction` | `packages/compaction/compaction` | `compaction-basic` | (no model-facing compact tool) |
| `ctx.sessionPersistence` | `packages/session/session-persistence` | `session-persistence-jsonl`, `-sqlite` | `agent-loop`, `tool-bash`, `hooks-*`, `session-query-*`, `message-feedback` |
| `ctx.sessionQuery` | `packages/session-query/session-query` | `session-query-sqlite` | `session-reference`, `tool-session-query` |
| `ctx.sessionTitle` | `packages/session/session-title` | `session-title-first-prompt-llm`, `-all-prompts-llm` | — |
| `ctx.sessionTelemetry` | `packages/session/session-telemetry` | `session-telemetry-otel` | — (output leaves process) |
| `ctx.settings` | `packages/settings/settings` | `settings-file` | `llm-deepseek`, `llm-pi-ai`, `apiproxy` |
| `ctx.credentials` | `packages/credentials/credentials` | `credentials-local` | `llm-deepseek`, `llm-pi-ai`, `apiproxy` |
| `ctx.storage` | `packages/storage/storage` | `storage-json`, `storage-sqlite` | `storage-domain` |
| `ctx.attachments` | `packages/attachment/attachment` | `attachment-local` | `host-runtime`, `llm-pi-ai` |
| `ctx.spillStore` | `packages/spill/spill` | `spill-local` | `spill-policy` |
| `ctx.approval` | `packages/interaction/approval` (seam) | `acp` | `tools`, `tool-bash` |
| `ctx.userQuestions` | `packages/interaction/user-questions` | (UI front ends) | `tool-ask-user` |
| `ctx.directoryPicker` | `directory-picker` | `directory-picker-native`, `-browse` | `apiproxy` |

Core (non-swappable) service owners also in the table: `ctx.sessions`
(`packages/core/session`), `ctx.agents` (`packages/core/agent`), `ctx.agentLoop`
(`packages/core/agent-loop`, bundle — the one concrete loop), `ctx.tools`
(`packages/core/tools`), `ctx.systemPrompt` (`packages/core/system-prompt`),
`ctx.goals` (`packages/goal/goal`), `ctx.planMode` (`packages/plan/plan-mode`),
`ctx.commands` (`packages/interaction/commands`), `ctx.agentPresets`
(`packages/preset/agent-presets`), `ctx.tokenMeter`, `ctx.toolResultPruner`,
`ctx.invariants`, `ctx.typert`/`ctx.typertGateway`, `ctx.sessionProjections`/
`ctx.sessionProjectionCache`/`ctx.sessionReferenceResolver`/`ctx.messageFeedback`/
`ctx.workspaceRegistry`/`ctx.agentDefaultModel`/`ctx.storageDomain`/`ctx.webServer`/
`ctx.clientModules`/`ctx.apiProxy`/`ctx.dynamicCordisRunner`/`ctx.cordisInspect`/`ctx.e2b`.
Full table: `docs/capability-seams.md`.

### 2.2 Event extension points (interception / policy)
From `docs/architecture.md#events` and `docs/cookbook/extension-cookbook.md#the-feature--mechanism-map`:
- **Session events** (durable, appended to the log): `turn/*`, `step/*`,
  `user/message`, `assistant/*`, `tool/*`. New model-visible input requires a
  new `SessionEventMap` member (`CONVENTIONS.md#plugin-body-rules`,
  `docs/architecture.md#session-log`).
- **Agent events** (live, carry a live `Agent`): `agent/session-start`,
  `agent/pre-step` (waterfall; reject or rewrite messages),
  `agent/request` (waterfall), `agent/request-error`, `agent/turn-stopping`
  (serial, no `next()`), `agent/inject`, etc. (`docs/architecture.md#turn-flow`).
- **Capability events**: `fs/*`, `tools/*`, `telemetry/*`.
  - Tool pipeline waterfalls (`docs/cookbook/extension-cookbook.md#a-hook-plugin-permission-gate-example`):
    `tools/pre-execute` (allow/deny/ask policy, returns `PreToolDecision`),
    `ctx.tools.guard()` (monotonic final deny), `tools/execute` (around
    dispatch; deadline/retry/metrics; only `exec.signal` replaceable),
    `tools/post-execute` (transform result / attach context),
    `tools/result` (observe immutable outcome).
  - `system-prompt/assemble` (expert cooperative whole-assembly transform).
  - `session/event` (UI/observer stream: assistant chunks, boundaries, tool activity).

### 2.3 Composition / packaging extension points
- **Service Definition / Provider / Consumer** three-role split —
  `docs/glossary.md#capability-seam`; canonical template = shell trio
  (`packages/shell/README.md`).
- **Tools** — `ctx.tools.register(defineTool({...}))` or raw JSON-Schema
  `ToolDefinition` (MCP-sourced); `docs/cookbook/adding-a-tool.md`,
  `docs/cookbook/extension-cookbook.md#a-tool-plugin`.
- **System prompt sections** — `ctx.systemPrompt.section({ name, order, text })`
  with ordering and scope-local shadowing (`docs/cookbook/extension-cookbook.md#the-feature--mechanism-map`).
- **Human commands** — `ctx.commands`; dispatches without a model turn
  (`docs/architecture.md#where-new-behavior-goes`).
- **Background jobs** — `ctx.jobs.start({ kind, label, owner, run })`;
  `job_*` tools collect/stop (`docs/cookbook/extension-cookbook.md`).
- **Model-visible context injection** — `agent.inject({ content, source })`
  lands in the next admitted request; not a wake-up.
- **Bundles** — `dsh.bundle.patch` manifest field; `packages/bundle/{base,web-app,headless}`
  (`packages/bundle/README.md`, `MODES.md#5-installable-bundle`).
- **Agent presets** — per-session `agent.cordis.yml`; `packages/preset/`
  (`MODES.md#6-agent-preset-composition`).
- **Hook bridges** — `packages/hooks/` (Claude Code / Codex wire protocol to
  harness events); `MODES.md#7-hook-bridge`.
- **SDK / MCP** — `@deepseek-ai/dsh-sdk` (JSON-RPC), Python SDK, ACP server,
  MCP tool registration (`MODES.md#8-sdk-or-mcp-integration`).
- **Conversation nodes** (Web Client) — `ConversationNodeDefinition` + keyed
  `conversation.chat.node` renderer (`docs/cookbook/adding-a-conversation-node.md`).
- **Settings cards** — `docs/cookbook/adding-a-settings-card.md`.
- **LLM adapters** — `LlmAdapter` subclass via `registerAdapter`
  (`docs/cookbook/adding-an-llm-adapter.md`).
- **Dynamic in-process packages** — `cordis_define` / `cordis_run` /
  `cordis_stop` / `cordis_inspect` (`MODES.md#1-dynamic-in-process-package`).
- **Scratch overlay** — `scratch-plugin/{src, cordis.yml}`, loaded via
  `dsh web --patch` (`MODES.md#2-scratch-overlay`).

### 2.4 The "feature to mechanism" map
`docs/cookbook/extension-cookbook.md#the-feature--mechanism-map` is the
checkable microkernel table (every product feature = a listener on a
documented extension point; no row modifies the loop). Key rows: Hook
system, `/goal`, `/loop`, Dynamic workflow, Queued+steering messages,
Context compaction, System prompt configurability, AGENTS.md, Built-in
tools, ToolSearch, Tool deadline/retry/metrics, Monotonic terminal turn,
Subprocess sandbox, Permission/AskUserQuestion, Plan mode, Sub-agent
delegation, MCP, Skills, Memory, Scheduled tasks, UI, Web Client Chat
node, SessionTelemetry, Model adapters, Plugin hot-reload.

---

## 3. Skeleton / template for a new capability plugin

A swappable capability with a model-facing tool, three packages. Adapted
verbatim from the shell trio (`packages/shell/{shell,bash-local,tool-bash}`).

### 3.1 Service Definition — `packages/<group>/<cap>/<cap>/src/index.ts`
```ts
/**
 * Service Definition for the `ctx.<cap>` capability seam.
 * @module @deepseek-ai/dsh-<cap>
 */
import { Context, Service } from '@deepseek-ai/cordis'

export type { CapRequest, CapSpec, CapResult } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    <cap>: <Cap>Service
  }
}

export abstract class <Cap>Service extends Service {
  constructor(ctx: Context) {
    super(ctx, '<cap>')
  }
  /** Apply implementation defaults/caps to a request before execution. */
  abstract resolve(request: CapRequest): CapSpec
  /** Execute; resolves with a result. Infra failures reject; domain outcomes resolve. */
  abstract run(spec: CapSpec): Promise<CapResult>
}

export default <Cap>Service
```
`packages/shell/shell/src/index.ts` (`ShellExecutor` class) is the reference.

### 3.2 Service Provider — `packages/<group>/<cap>/<cap>-local/src/index.ts`
```ts
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { <Cap>Service } from '@deepseek-ai/dsh-<cap>'
import type { CapRequest, CapSpec, CapResult } from '@deepseek-ai/dsh-<cap>'

export interface Config { /* tunables, all optional — static Config supplies defaults */ }
export const Config: z<Config> = z.object({ /* ... */ })

export class Local<Cap>Service extends <Cap>Service {
  static inject = ['<hard-dep-service>']      // e.g. ['subprocess']
  static Config  // schemastery schema; declare when there are tunables

  constructor(ctx: Context, config: Config) {
    super(ctx)
    // validate config; install settings section if hot-reloadable
  }

  resolve(request: CapRequest): CapSpec { /* fill defaults, cap */ return { ... } }
  async run(spec: CapSpec): Promise<CapResult> { /* ... */ }
}

export default Local<Cap>Service
```
`packages/shell/bash-local/src/index.ts` (`LocalBashExecutor`) is the reference.

### 3.3 Consumer (model-facing tool) — `packages/<group>/<cap>/tool-<cap>/src/index.ts`
```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-<cap>'
export const inject = ['tools', '<cap>', 'systemPrompt']   // hard deps

export function apply(ctx: Context, config: Config = {}): void {
  ctx.systemPrompt.section({ name: 'tool:<cap>', order: 105, text: '...' })

  ctx.tools.register(defineTool({
    name: '<cap>',
    description: '...',
    parameters: {
      // typed args; defineTool validates before execute runs
      query: { type: 'string', required: true, description: '...' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ... } },
      render: (_args, value) => [{ type: 'text', text: '...' }],
    },
    async execute(args, exec) {
      // args are typed (InferArgs); exec carries immutable identity + signal
      const spec = ctx.<cap>.resolve({ query: args.query, signal: exec.signal })
      const result = await ctx.<cap>.run(spec)
      return canonicalResult(result)
    },
    presentCall(args) { return { card: 'generic', title: args.query, kind: 'search' } },
    presentResult(args, result) { return { card: 'generic', content: result.content } },
  }))
}
```
`packages/shell/tool-bash/src/index.ts` is the production reference (incl.
`presentCall`/`presentResult` render-intent, background-job path via
`ctx.jobs.start`, `output.presentationMeta`).

### 3.4 package.json (each of the three)
Mirror `packages/shell/shell/package.json`, `packages/shell/bash-local/package.json`,
`packages/shell/tool-bash/package.json`. The Service Definition lists its
type deps in `peerDependencies` (+mirror in `devDependencies`); the Provider
depends on the Service Definition + underlying seams; the Consumer depends on
the Service Definition + `dsh-tools` + `dsh-system-prompt`. Extension plugins
depend on Service Definitions, never concrete providers (`packages/README.md#dependencies`).

### 3.5 Composition mount
Add a row to a bundle patch (e.g. `packages/bundle/base/cordis.patch.yml`)
and/or an example `cordis.yml`:
```yaml
- insert:
    - id: <cap>-local        # the provider
      name: '@deepseek-ai/dsh-<cap>-local'
      config: { ... }
    - id: tool-<cap>          # the consumer
      name: '@deepseek-ai/dsh-tool-<cap>'
```
If the capability is opt-in, leave it out of `base` and mount it in a mode
bundle, profile patch, or preset (see how `dsh-base` gates `bash-sandbox` vs
`pwsh-sandbox` by platform: `disabled: !!js process.platform === 'win32'`).

---

## 4. Mapping a reverse-bi capability onto this model

`reverse-bi` (upstream `track2data`) is the migration source; the harness is
the target. The mapping is mechanical once the capability is decomposed into
the three roles. INFERENCE below: the harness side is cited; the `reverse-bi`
side is inferred from the migration framing (a BI/data capability with data
connectors, query execution, and model-facing data tools).

### 4.1 Decompose the reverse-bi capability into roles
A reverse-bi "data connector + query runner + model tool" maps directly onto
the shell trio's shape (`docs/glossary.md#capability-seam`,
`docs/architecture.md#capability-seams`):

| reverse-bi role | Harness role | Target package(s) | ctx key |
| --- | --- | --- | --- |
| Query spec / result vocabulary (request to spec to result) | Service Definition | `packages/<data>/<data>/` | `ctx.<data>` |
| Concrete connector (e.g. SQL over a warehouse, REST/GraphQL client, file reader) | Service Provider | `packages/<data>/<data>-<impl>/` (one per backend) | (registers `ctx.<data>`) |
| Model-facing data tool(s) (query, list-sources, explain) | Consumer | `packages/<data>/tool-<data>/` | `ctx.tools` |
| Cross-cutting policy (row/cost limits, PII redaction, read-only enforcement) | Hook plugin | listener on `tools/pre-execute` + `ctx.tools.guard()` | — |
| Per-session catalog state / cache | Core service or `ctx.storage` domain form | `packages/<data>/<data>-state/` | `ctx.<data>State` or `ctx.storageDomain` |

### 4.2 Migration steps (per capability)
1. **Identify the seam boundary.** What does the model-facing tool call? That
   interface becomes the Service Definition's `resolve()`/`run()` (cf.
   `ShellExecutor.resolve/run/start` in `packages/shell/shell/src/index.ts`).
   Keep job ids/ownership out of the seam — they belong to `ctx.jobs`
   (`packages/shell/shell/src/index.ts` module docstring: "Job ids, ownership,
   polling, and notices belong to `@deepseek-ai/dsh-jobs`, keeping executors
   independent of sessions").
2. **Design the vocabulary types** (`CapRequest`/`CapSpec`/`CapResult`) in the
   Service Definition's `types.ts`, mirroring `packages/shell/shell/src/types.ts`
   (Request = caller-facing optional fields; Spec = resolved/validated;
   Result = settled outcome; `resolve()` fills and caps).
3. **Port one provider** as `<cap>-local` extending the Service Definition,
   with `static inject` for its hard deps and `static Config` for tunables
   (template: `packages/shell/bash-local/src/index.ts`). Do NOT copy-paste the
   reverse-bi implementation wholesale — re-implement behind the seam so the
   provider is swappable (`CONVENTIONS.md#vocabulary`, "explicit over implicit
   at package boundaries").
4. **Port the model-facing tool** as `tool-<cap>` Consumer, registering on
   `ctx.tools` via `defineTool` with `output.schema` + `render` + optional
   `presentCall`/`presentResult`/`presentationMeta` (template:
   `packages/shell/tool-bash/src/index.ts`; full contract in
   `docs/cookbook/adding-a-tool.md`).
5. **Move deployment policy out of the tool** into `tools/pre-execute`
   (allow/deny/ask), `ctx.tools.guard()` (monotonic deny), `tools/execute`
   (deadline/retry/metrics), `tools/post-execute` (transform)
   (`docs/cookbook/adding-a-tool.md#execution-policy-and-observation`).
6. **Make tunables `Config` fields**, not hardcoded — changeable from
   `cordis.yml`, failing loud at load (`CONVENTIONS.md#plugin-body-rules`).
7. **Mount via composition** — add rows to a bundle patch or a data-agent
   profile/preset (see 3.5). Keep the capability opt-in if it's not part of
   every data-agent profile.
8. **Test the real entry path** — unit + real-composition Loader boot + keyless
   snapshot through a runnable example + with-key e2e (`docs/testing.md`).
9. **Model-visible means logged** — any new model-visible input (e.g. a query
   result shape the model sees) needs a `SessionEventMap` member so it
   reconstructs from the log (`docs/architecture.md#session-log`,
   `CONVENTIONS.md#plugin-body-rules`).

### 4.3 What to remove (harness features a data agent doesn't need)
INFERENCE: a data agent likely drops or de-emphasizes: the `Ralph` fresh-agent
loop (`ctx.workflowEngine` + `tool-ralph`), persistent terminals
(`ctx.terminals`/`tool-terminal`), LSP (`ctx.lsp`/`tool-lsp`), Plan mode
(`ctx.planMode`), and possibly the sandbox escalation surface — but keeps the
seam discipline so each can re-mount via a profile/preset without code forks.
The bundle/profile layering (`docs/architecture.md#profiles-and-bundles`) is
the lever: a `dsh-data-agent` bundle is just another patch layer over
`dsh-base` that inserts data-capability rows and `disabled: true`s the
harness rows it doesn't want (cf. how `dsh-base` gates the pwsh/bash stacks
by platform).

---

## 5. Key invariants and failure map (load-bearing)

- **Named exports only.** A default export silently drops `inject`; the plugin
  loads but its dependency never resolves (`CONVENTIONS.md#plugin-body-rules`,
  `docs/postmortem/0001-acp-default-export-drops-inject.md`).
- **Waterfall listeners must call `next()`** or they short-circuit the chain
  (`docs/cordis-primer.md#cordis-waterfall-semantics`).
- **A patch replaces whole row configs** — no deep-merge; profile overrides
  must restate every field (`packages/bundle/base/README.md#known-limitations-and-deferred-work`).
- **One Service Provider per ctx key per context** — loading a second throws
  Cordis' standard duplicate-service error (`packages/shell/shell/src/index.ts`,
  `ShellExecutor` class docstring).
- **Extension plugins depend on Service Definitions, never concrete
  providers** (`packages/README.md#dependencies`).
- **A new package nothing mounts is unreachable** — wire the mount row in the
  same change (`MODES.md#3-repository-package`).
- **Misconfiguration fails loud** at load or earliest resolvable point, never
  a silent skip (`CONVENTIONS.md#plugin-body-rules`).
- **Model-visible means logged** — runtime invariant asserts it
  (`docs/architecture.md#session-log`).
