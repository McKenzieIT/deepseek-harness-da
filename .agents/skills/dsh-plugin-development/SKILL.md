---
name: dsh-plugin-development
description: Builds DeepSeek Harness (DSH) plugins across every creation mode — dynamic in-process packages, scratch --patch overlays, repository packages, example and installable bundles, agent presets, and hook or MCP bridges. Use when asked to create, extend, modify, or debug a DSH or Cordis plugin, register a tool, service, event, UI contribution, or LLM adapter, or when deciding where new plugin code belongs.
---

# DSH Plugin Development

Route a plugin request to the correct creation mode and authoring path inside a DeepSeek Harness checkout. This skill works for any agent that edits the repository through files and shell, including agents not running inside DSH. [MODES.md](MODES.md) owns the authoring path per mode; [CONVENTIONS.md](CONVENTIONS.md) owns the shared rules and the verification matrix.

## Orient before writing

Read these in order before writing plugin code:

1. [Architecture](../../../docs/architecture.md) — composition, core packages, the loop, and extension points; required before changing `packages/`.
2. [Cordis primer](../../../docs/cordis-primer.md) — dispatch modes, waterfall semantics, and loader configuration.
3. [Cordis tutorial](../../../docs/cordis-tutorial/index.md) — hands-on chapters, when the framework itself is unfamiliar.
4. [Extension cookbook](../../../docs/cookbook/extension-cookbook.md) — the plugin shapes: tool, hook, UI.
5. [Glossary](../../../docs/glossary.md) — the vocabulary later guides assume.

## Choose a creation mode

| Mode | Fits when | Lifetime |
|---|---|---|
| [Dynamic in-process package](MODES.md#1-dynamic-in-process-package) | experimenting inside a live DSH session with the Cordis toolset | process memory |
| [Scratch overlay](MODES.md#2-scratch-overlay) | prototyping one plugin in the Web UI without touching the repo | local files |
| [Repository package](MODES.md#3-repository-package) | a permanent capability other packages or consumers depend on | shipped with the repo |
| [Example bundle](MODES.md#4-example-bundle) | a runnable demo over shipped packages | `examples/` leaf |
| [Installable bundle](MODES.md#5-installable-bundle) | distributing a patch layer without a repo checkout | installed bundle |
| [Agent preset composition](MODES.md#6-agent-preset-composition) | combining existing plugins for one session type, no new code | user preset directory |
| [Hook bridge](MODES.md#7-hook-bridge) | forwarding Claude Code or Codex hooks into DSH | host composition |
| [SDK or MCP integration](MODES.md#8-sdk-or-mcp-integration) | driving or extending DSH from Python or MCP clients | external project |

Decide lifetime first: an experiment belongs in a dynamic package or scratch overlay, and neither is promoted automatically — keeping it means reimplementing it as a repository package. Decide audience second: only repository packages reach other consumers through releases. When the request names a capability rather than packaging — a tool, service, event, settings card, conversation node, or LLM adapter — pick the contribution shape from the cookbooks below, then the mode that hosts it.

Contribution-shape cookbooks: [tool](../../../docs/cookbook/adding-a-tool.md), [conversation node](../../../docs/cookbook/adding-a-conversation-node.md), [settings card](../../../docs/cookbook/adding-a-settings-card.md), [LLM adapter](../../../docs/cookbook/adding-an-llm-adapter.md), [vendored package](../../../docs/cookbook/adding-a-vendored-package.md).

## Workflow

1. Classify the request: contribution shape, lifetime, audience.
2. Follow the chosen mode's path in [MODES.md](MODES.md) exactly; layout and naming are load-bearing because gates and generators check them.
3. Apply [CONVENTIONS.md](CONVENTIONS.md) before the first review pass — its rules are gate-enforced or invariant-backed.
4. Verify with the narrowest checks from the [verification matrix](CONVENTIONS.md#verification-matrix); CI owns exhaustive coverage.
5. Run the result when behavior must be observed — see [running the result](CONVENTIONS.md#running-the-result).
