# @deepseek-ai/dsh-preset-autojoin

[data-agent] da wrapper (§4.2) that joins the configured default agent preset
to every published agent on `agent/created`, closing the
headless-doesn't-join-default-preset gap without modifying dsh src.

## Why

The headless entry (`@deepseek-ai/dsh-headless`) creates a bare agent: its
`setup` calls `installModelSelection` but **not** `AgentPresets.mount(agentCtx,
id)`, so the `data-agent` preset (phase-gate persona + 4 data tools) never
joins the headless agent. §4.1 forbids modifying dsh src (the headless bundle
is dsh, not da-owned per §4.5), so the fix is a da-specific wrapper seam.

## How

A Cordis plugin (`inject: ['agentPresets']`) that registers one
`agent/created` listener. `agent/created` fires after `setup` completes and
before the first prompt assembly, so a preset joined here registers its
tools, prompt sections, and listeners ahead of the agent's first model
request. The listener:

1. Skips agents whose `setup` already joined a preset (`composedPreset` guard
   — idempotent, no double-bind).
2. Resolves the default preset (`resolve(undefined)`); if that throws (no
   roster / unknown default) it skips silently — never force-joins.
3. Mounts the default preset (`mount(agent.ctx, defaultId)`). A mount failure
   (broken composition) propagates so the dispatch reports it; the agent then
   runs bare, exactly as it does today.

## Mount

Add to the data-agent bundle patch (`packages/bundle/data-agent/cordis.patch.yml`):

```yaml
- insert:
    - id: preset-autojoin
      name: '@deepseek-ai/dsh-preset-autojoin'
```

Inspect the composed tree:

```sh
pnpm dsh --profile headless --patch packages/bundle/data-agent/cordis.patch.yml --dump-config | grep preset-autojoin
```

## Layout

| File | Role |
|---|---|
| `src/index.ts` | `name` / `inject` / `apply` + `createAutojoinListener` factory |
| `tests/autojoin.spec.ts` | logic (resolve→mount, no-default skip, already-joined skip, mount-failure propagate) + composition (real `agent/created` dispatch) |

## Constraints

- §4.1: no dsh src modified — this is a new da package only.
- §4.2: wrapper seam — injects the existing `agentPresets` seam; no dsh
  interface changed.
- §4.5: da-owned location `packages/data/preset-autojoin/`.

> Note: the `agent/created` dispatch is synchronous and treats a listener's
> returned promise as fire-and-forget (rejection reported, not awaited). For a
> one-shot headless run whose only `followup` lands before the async
> `presets.mount` settles, the join may arrive too late for the first prompt —
> see the experiment report; the upstream fix (headless `setup` joins the
> default) is the fallback.
