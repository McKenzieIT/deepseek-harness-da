# @deepseek-ai/dsh-client-ui-semantic-layer

The semantic layer management UI plugin (browser half). Registers:

- `SemanticLayerShell` into `sidebar.footer.action` — trigger that opens or resumes the management agent session
- Tool presenters for `search_schema`, `get_definition`, `get_coverage`, `discover_relations`, `trigger_eval` — structured card rendering in conversation
- `GoalDock` in `conversation.input.dock` — objective + phase + round + eval sparkline (management sessions only)
- `EvidenceSidebar` in `details.aux` — coverage, eval trajectory, delta, gap analysis (management sessions only)
- `SchemaExplorer` in `details.aux` — asset browser with domain navigation (management sessions only)

## Architecture

The plugin has no host-side behavior (`src/index.ts` is an empty apply). All logic lives in the browser half (`src/client/`):

- **SemanticLayerShell**: the sidebar button and B→A layout router. In "B" mode (default, evalRunCount < 3), renders a trigger button. In "A" mode (auto-flip after ≥3 eval runs), renders DashboardView.
- **wiring.tsx**: session-scoped slot adapters that gate on `agentPreset === 'semantic-layer-management'`. Non-management sessions render nothing.
- **presenters/**: keyed `tool.call.toolview` renderers for each management tool.
- **hooks/**: `useEvidenceQuery`, `useEvidenceMetrics`, `useSchemaGateway`, `useLayoutMode`.

## Services consumed

| Service | Source | Usage |
|---------|--------|-------|
| `sessions` | dsh-client-runtime | Session list, open/create |
| `workspaces` | dsh-client-runtime | `startSession()` |
| `connection` | dsh-client-connection | API calls (`agentPresets.select`) |
| `remote.schemaGateway` | dsh-schema-gateway (Typert) | Schema browser data |
| `remote.evidenceQuery` | dsh-evidence-query (Typert) | Eval results, coverage, delta |
| `layout` | dsh-client-ui-layout | `openDetails()` (optional) |
| `slots` | dsh-client-ui-slots | Slot registration |
| `locale` | dsh-client-locale | i18n dictionaries |

## Model Experience

None, as this package contributes only browser-side UI rendering and has no model-visible context effect.

### KV Cache effect

Independent. This package does not contribute to or modify the model request assembly.

## Known Limitations and Deferred Work

- **Evidence push subscription** — current v1 fetches on mount + manual refresh; real-time push via Typert event forwarding (`$on`) is deferred.
- **Shell auto-flip requires live connection** — `evalRunCount` for B→A auto-flip comes from the evidence-query RPC bridge; without a live host connection, the shell stays in B mode (trigger button).
- **CSS Modules incomplete** — Evidence panel components (EvidenceSidebar, CoveragePanel, EvalTrajectory, EvalDeltaView, GapPanel) use BEM class names, not CSS Modules. Migration deferred.
- **SchemaExplorer graph navigation** — `onNavigateToGraph` depends on the optional `contextLayer` service; absent that service, the "view in graph" action is unavailable.
