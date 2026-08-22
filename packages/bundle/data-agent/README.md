# `@deepseek-ai/dsh-data-agent`

English | [中文](README.zh.md)

[data-agent] The data-agent bundle: an additive patch layer over [`dsh-base`](../base/README.md) for the `data-agent` profile. [`cordis.patch.yml`](cordis.patch.yml) disables the code-agent surface — the `tool-str-replace-editor` and `tool-ralph` rows, plus Code Mode off via `tools.mode: native` — disable-only, never delete, so an upstream `dsh-base` reorder cannot re-mount it. It mounts the phase-1 `llm-dashscope` provider (P2 resolved) — an `- insert:` row with its package `name:` plus an `agent-default-model` row setting the profile default to `aga`/`qwen3.7-max` — and reserves a commented `insert` block of placeholders for the remaining data capability plugins this profile will mount once their packages ship (P4-P11: query, retrieval, embedder, semantic layer, audit, admin, plus the phase-1 `subagent-qoder`). The data-plugin rows stay commented because a bare specifier to a not-yet-shipped package breaks `pnpm install` and `verify-cordis-config`; uncomment and supply each `name:` only after its package exists. The data agent's persona is not set here — it belongs to the four-phase preset (P7). `tool-bash` and `code-runtime` are execution backends the data agent itself uses (map Q9); they stay enabled here and are gated from business users at the P10 intranet tool-gate, not in this bundle.

The package has no runtime API; the profile composer resolves the patch through the `dsh.bundle.patch` manifest field, never through code. Inspect the composed tree with `dsh --profile headless --patch ./packages/bundle/data-agent/cordis.patch.yml --dump-config`. A standalone `data-agent` profile is created out-of-tree through `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` once the four-phase preset and its driver land; this bundle deliberately touches no shared boot glue, preserving the upstream upgrade path.

## Model Experience

Indirectly, through the rows it disables and mounts: this bundle contributes no model-visible text of its own. It mounts `llm-dashscope` (P2) as the profile's direct LLM; the remaining data capability plugins mount as P4-P11 fill the reserved block.

#### KV Cache effect

None directly; disabling a row removes its schema and prompt section from the composed tree, and the reserved (commented) rows mount nothing yet.

## Known Limitations and Deferred Work

- **No data capability plugin is mounted yet** — `llm-dashscope` (P2) is mounted as the profile's LLM provider, but the data capability rows (query, retrieval, embedder, semantic layer, audit, admin) and `subagent-qoder` (P3) remain commented placeholders; uncomment and supply each `name:` only after the resolving ticket (P4-P11, P3) ships its package.
- **No persona** — the data-agent persona is owned by the four-phase preset (P7), not this bundle.
- **No driver** — a patch-only layer; runnability comes from composing it with a driver bundle or the P7 preset, not from a `data-agent` profile template (none is added to `dsh-app-boot`).
