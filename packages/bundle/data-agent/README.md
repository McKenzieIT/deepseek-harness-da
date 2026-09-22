---
description: "The data-agent bundle: an additive patch layer over dsh-base for the data-agent profile — disables the code-agent surface, mounts the phase-1 LLM provider and the shipped data capability plugins."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-data-agent`

English | [中文](README.zh.md)

## Summary

The data-agent bundle is an additive layer over `dsh-base`. It selects DashScope as the default model route, exposes the data-agent preset, and mounts the shipped query, semantic-layer, evaluation, audit, administration, result-cache, and Python execution packages. It disables code-agent-only rows without deleting upstream configuration, while embedder and retrieval providers remain opt-in. The bundle owns composition only; each mounted package owns its runtime and model-visible behavior.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

No runtime invariant companion is published because `@deepseek-ai/dsh-data-agent` owns no independently observable relationship that can diverge from its runtime state.

Evaluation runs use the external `dsh-eval` host. The default product profile does not mount `eval-runner-service`, because published packages do not include benchmark cases and ordinary data-agent sessions must not keep evaluation infrastructure resident.

<a id="dev-note"></a>
## Dev Note

The bundle carries no runtime code: the `dsh.bundle.patch` field in `package.json` points the profile composer at `cordis.patch.yml`, while `presets/` owns the two data-agent preset directories published with the package. The package manifest directly declares every bare plugin referenced by those presets, so a preset host can resolve rows from the installed bundle directory. The patch resolves that directory from the installed bundle manifest, so preset discovery does not depend on the process working directory. See `wayfinder/data-agent/map.md` for the overall data-agent phase decisions, and `wayfinder/data-agent/tickets/` for the per-plugin implementation history.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the rows it disables and mounts: this bundle contributes no model-visible text of its own, mounting `llm-dashscope` (P2) as the profile's direct LLM and the shipped data capability plugins (P4-P11) which each contribute their own model-visible schemas, prompts, and tool definitions to the composed tree, while the deployment-choice rows (`embedder`, `retrieval`) mount nothing until a provider is supplied.

#### KV Cache effect

None directly; disabling a row removes its schema and prompt section from the composed tree, and the deployment-choice-commented rows mount nothing until a provider is supplied.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Embedder / retrieval are deployment choices** — these two seams stay commented in the patch; uncomment and mount a concrete provider (e.g. `embedder-fakehash`/`embedder-http`, `retrieval-inproc`) to activate them. All other data capability plugins (P4-P11) ship and mount LIVE.
- **No persona** — the data-agent persona is owned by the four-phase preset (P7), not this bundle.
- **No driver** — a patch-only layer; runnability comes from composing it with a driver bundle or the P7 preset, not from a `data-agent` profile template (none is added to `dsh-app-boot`).
