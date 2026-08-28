# `@deepseek-ai/dsh-data-agent`

English | [中文](README.zh.md)

[data-agent] The data-agent bundle: an additive patch layer over [`dsh-base`](../base/README.md) for the `data-agent` profile. [`cordis.patch.yml`](cordis.patch.yml) disables the code-agent surface — the `tool-str-replace-editor` and `tool-ralph` rows, plus Code Mode off via `tools.mode: native` — disable-only, never delete, so an upstream `dsh-base` reorder cannot re-mount it. It mounts the phase-1 `llm-dashscope` provider (P2) — an `- insert:` row with its package `name:` plus an `agent-default-model` row setting the profile default to `aga`/`qwen3.7-max` — and mounts the shipped data capability plugins LIVE (P4-P11): `query-maxcompute`, `scope-registry`, `semantic-layer` (plus its `llm-wiring-plugin`), `schema-gateway`, `evidence-query` (plus `gateway`), `client-ui-semantic-layer`, `eval-runner-service`, `goal-eval-policy`, `goal-eval-context`, `audit`, `nl2sql-engine`, `admin`, `result-cache-memory`, `code-runtime-data-python`, and `preset-autojoin`. Only opt-in / deployment-choice rows — `embedder`, `retrieval`, `subagent-qoder` — stay commented: uncomment and mount a concrete provider to activate those seams; a bare specifier to a not-yet-shipped package still breaks `pnpm install` and `verify-cordis-config`. The data agent's persona is not set here — it belongs to the four-phase preset (P7). `tool-bash` and `code-runtime` are execution backends the data agent itself uses (map Q9); they stay enabled here and are gated from business users at the P10 intranet tool-gate, not in this bundle.

The package has no runtime API; the profile composer resolves the patch through the `dsh.bundle.patch` manifest field, never through code. Inspect the composed tree with `dsh --profile headless --patch ./packages/bundle/data-agent/cordis.patch.yml --dump-config`. A standalone `data-agent` profile is created out-of-tree through `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` once the four-phase preset and its driver land; this bundle deliberately touches no shared boot glue, preserving the upstream upgrade path.

## Model Experience

Indirectly, through the rows it disables and mounts: this bundle contributes no model-visible text of its own. It mounts `llm-dashscope` (P2) as the profile's direct LLM, and the shipped data capability plugins (P4-P11: `query-maxcompute`, `semantic-layer`, `nl2sql-engine`, `schema-gateway`, `evidence-query`, `audit`, `admin`, `result-cache-memory`, `preset-autojoin`, the goal/eval pair, and `code-runtime-data-python`) contribute their own model-visible schemas, prompts, and tool definitions to the composed tree. The deployment-choice rows (`embedder`, `retrieval`, `subagent-qoder`) mount nothing until a provider is supplied.

#### KV Cache effect

None directly; disabling a row removes its schema and prompt section from the composed tree, and the deployment-choice-commented rows mount nothing until a provider is supplied.

## Known Limitations and Deferred Work

- **Embedder / retrieval / subagent-qoder are deployment choices** — these three seams stay commented in the patch; uncomment and mount a concrete provider (e.g. `embedder-fakehash`/`embedder-http`, `retrieval-inproc`, `subagent-qoder`) to activate them. All other data capability plugins (P4-P11) ship and mount LIVE.
- **No persona** — the data-agent persona is owned by the four-phase preset (P7), not this bundle.
- **No driver** — a patch-only layer; runnability comes from composing it with a driver bundle or the P7 preset, not from a `data-agent` profile template (none is added to `dsh-app-boot`).
