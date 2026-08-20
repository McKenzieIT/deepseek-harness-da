# Creation modes

Each mode below states its trigger, the authoring path, and how it verifies. The [mode table in SKILL.md](SKILL.md#choose-a-creation-mode) owns the lifetime-and-audience decision; this file owns execution. The shared rules that cut across modes live in [CONVENTIONS.md](CONVENTIONS.md).

## 1. Dynamic in-process package

For an agent already running inside a live DSH session with the Cordis toolset mounted (`pnpm run demo:cordis` composition): define a package with `cordis_define` (host half `code`, optional browser half `client` — plain JavaScript function bodies, no TypeScript or JSX), activate with `cordis_run`, dispose with `cordis_stop`, and read live services and events first through `cordis_inspect`. Packages live in process memory only: no file is created, nothing survives a restart, and `cordis_define` never writes to the repository. Keeping an experiment means reimplementing it below as a repository package or scratch overlay. Contracts: [tool-cordis README](../../../packages/extensions/tool-cordis/README.md).

## 2. Scratch overlay

Prototype one real plugin file loaded by a real Web UI without touching tracked repository files.

1. Create `scratch-plugin/src/<plugin>.ts` exporting at least `apply(ctx)` (plus `name`, and `inject` when it needs a service). `tmp/` and `scratch-plugin/` are untracked; anything else needs an explicit user decision.
2. Create `scratch-plugin/cordis.yml` with an insert row whose `name` is the **absolute path** to the plugin file — a patch file contributes configuration but never changes the loader's module-resolution root.
3. Launch `pnpm dsh web --patch ./scratch-plugin/cordis.yml` from the repository root and open the printed URL; startup logs confirm the plugin loaded.
4. Iterate by editing the file and restarting, or moving to mode 1 for in-session hot iteration.

Full walkthrough: [your first plugin](../../../docs/user/develop/basic/index.md).

## 3. Repository package

A permanent capability under `packages/`. The file-by-file checklist is [adding a package](../../../docs/cookbook/adding-a-package.md); follow it in full. Its load-bearing summary:

1. `packages/<group>/<pkg>/` with `package.json` (scoped `@deepseek-ai/dsh-<pkg>`, `private`, `type: module`, `main: lib/index.js`, `types: lib/types/index.d.ts`, matching `exports["."]`, `@deepseek-ai/cordis` in peerDependencies **and** devDependencies, every dsh peer mirrored in devDependencies), `tsconfig.json` extending the base face, `src/index.ts`, and `README.md` ending with the gated Model Experience and Known Limitations sections.
2. Register in exactly one aggregate — `tsconfig.host.json` or `tsconfig.client.json` — plus root-config edits the checklist tables. Workspace constraints and hygiene gates check the rest.
3. Topology: a swappable capability splits Service Definition / Provider / Consumer packages when the roles evolve independently; a single-purpose plugin stays one package.
4. Verify: `pnpm install`, then the checklist's `doc-sync`, `constraints`, `typecheck`, `lint`, `build`, `hygiene` sequence, plus the behavior-specific tests the [testing policy](../../../docs/testing.md) requires.

Loading: repository plugins mount through compositions — a bundle patch row, an example `cordis.yml`, or a host/preset composition naming the package. A new package nothing mounts is not yet reachable; wire the intended mount in the same change.

## 4. Example bundle

A runnable demo composition under `examples/` wiring shipped packages, governed by [examples/AGENTS.md](../../../examples/AGENTS.md). The leaf holds `cordis.yml` wiring, demo artifacts, and e2e/snapshot scenarios; reusable logic belongs in `packages/` instead. Every example carries both a keyless smoke (boots the real `cordis.yml` through the Loader, asserts output and clean exit) and a with-key scenario (self-skips without `DEEPSEEK_API_KEY`). A config naming packages must declare them in root `tsconfig.json` references and `examples/package.json`.

## 5. Installable bundle

An npm package whose manifest declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, making it a `dsh --profile` patch layer installable without a repository checkout via `dsh plugin --profile <name> add <package>`. The substance is the patch list; runtime glue plugins a bundle ships are mounted by its own patch. Contracts: [bundle README](../../../packages/bundle/README.md), [profile contract](../../../packages/boot/app-boot/README.md#profiles).

## 6. Agent preset composition

Compose existing plugins for one session type — its tools, persona, and prompt sections — with no new plugin code, while every other live session keeps its own composition.

1. Create one directory under `${DSH_HOME:-$HOME/.dsh}/.agent-presets/<id>/` holding one `agent.cordis.yml`. Never edit the deployment's shipped preset install; copy it to a new directory and edit the copy.
2. A preset carries what one agent contributes to the registries. A row that publishes a process-global service is rejected at mount; registries and cross-session facilities stay in the host composition. The `editing-cordis-compositions` skill (when available in the host) owns row vocabulary.
3. Row configuration follows the [loader configuration primer](../../../docs/cordis-primer.md#loader-configuration); the generated [config catalog](../../../docs/config-catalog.md) is the exhaustive option reference.
4. Verify by mounting the preset in a session and observing its contributed tools or prompt sections; the [composition and HMR chapter](../../../docs/cordis-tutorial/06-composition-and-hmr.md) shows how to diagnose a row that mounts but contributes nothing.

Contracts: [preset README](../../../packages/preset/README.md).

## 7. Hook bridge

Forward Claude Code or Codex lifecycle hooks into DSH, or speak the hook wire protocol from another tool: the `packages/hooks/` family owns the bridges and the protocol library. A bridge is a host-composition plugin — it registers handlers that translate external hook events into harness events or tool calls. Contracts: [hooks README](../../../packages/hooks/README.md).

## 8. SDK or MCP integration

Drive or extend DSH from outside the Node process.

- **TypeScript JSON-RPC:** [`@deepseek-ai/dsh-sdk`](../../../packages/sdk/README.md) projects the agent loop over JSON-RPC; a runnable consumer is [examples/jsonrpc-agent](../../../examples/jsonrpc-agent/README.md).
- **Python:** the [Python SDK and bundled runtime](../../../python/README.md) project the same loop.
- **ACP automation:** an Agent Client Protocol server for editor and automation integration, run via `pnpm run demo:acp`; see [examples/acp-agent](../../../examples/acp-agent/README.md).
- **MCP:** expose DSH state to MCP clients or consume MCP servers. MCP-sourced tools register as raw JSON-Schema `ToolDefinition`s on `ctx.tools` directly ([extension cookbook](../../../docs/cookbook/extension-cookbook.md)); an MCP server over DSH memory is [examples/mcp-memory](../../../examples/mcp-memory/README.md).
