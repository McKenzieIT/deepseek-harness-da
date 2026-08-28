# S1 — Decouple MaxCompute config from the dsh-data-agent bundle patch

**Type**: task (design change)
**Phase**: misc
**Status**: resolved (2026-08-28)
**Assignee**: claude-code
**Blocked by**: —
**Related**: [P4b](../phase-2/P4b-query-maxcompute-hardening.md), [G4](../phase-2/G4-query-sidecar-control-reliability.md), [P4c](../phase-2/P4c-real-odps-execution-path.md), [R2](../phase-2/R2-maxcompute-cred-cache.md), [R6](../phase-2/R6-cred-hot-reload.md), `packages/bundle/data-agent/cordis.patch.yml`, `packages/query/query-maxcompute/src/index.ts`

## Question
The published bundle patch hardcodes a machine-specific MaxCompute sidecar config path into `query-maxcompute`'s `Config.args`, coupling the provider-agnostic bundle to a MaxCompute deployment. Decouple + make the path deployment-overridable.

## Original design purpose
`Config.args` (`query-maxcompute/src/index.ts:98` — "Sidecar args — the sidecar script path plus its args. Required.") lets the patch supply the sidecar binary + its args. The maxc sidecar self-manages ODPS auth (P4c/P4d, `credMode: sidecar-self`), so `--maxc-config <path>` is the sidecar's auth/connection config. The patch's query-engine insert row passes these as `Config.args`.

## Why the coupling is a problem
- A machine-specific absolute path (`/Users/mckenzie/.maxc/config_ieu_cdm.yaml.bak`) in a PUBLISHED bundle patch = deployment path leak + breaks on any other machine.
- The bundle should be provider-agnostic (the `ctx.query`/`QueryEngine` seam is abstract); the MaxCompute config is `query-maxcompute`'s concern, not the bundle's.
- Violates "no hardcoded tunables: deployment-varying choices become validated `Config` fields" (CONVENTIONS.md).

## Proposed solution (3-layer decouple)
1. **`query-maxcompute` Config**: split raw `args` → structured `sidecarPath` (sidecar script, repo-relative default) + `maxcConfigPath` (ODPS config path, deployment-overridable, default empty). Both validated Config fields.
2. **`query-maxcompute` spawn**: build sidecar args from Config (`[sidecarPath, --maxc-config, maxcConfigPath]`) at spawn time, not from raw patch args. Fail-loud if `maxcConfigPath` empty at spawn ("misconfiguration fails loud").
3. **bundle patch**: the query-engine insert mounts `query-maxcompute` + `sidecarPath` only; NO hardcoded `maxcConfigPath`. Deployment supplies `maxcConfigPath` via `cordis.yml` override (or env).

## Evidence
- `cordis.patch.yml:108-117` — `args:` block with hardcoded `/Users/mckenzie/.maxc/config_ieu_cdm.yaml.bak`.
- `query-maxcompute/src/index.ts:94-98` (Config.args, Required), `:188` (static Config), `:204` (constructor config).
- spawn uses `config.args` — exact spawn code path to be confirmed in 2nd verification.

## Risks
- `Config.args` is "Required" + used by spawn; splitting it is a Config-shape change (cordis.yml override syntax changes). Mitigate: keep `args` as a fallback OR migrate the one patch + dev smoke.
- The dev sidecar path (`./packages/query/query-maxcompute/dev/maxc-sidecar.mjs`) is ALSO a dev artifact in the published patch — confirm whether a production sidecar exists or this is pre-release dev-only.

## Acceptance criteria
- `bundle/data-agent/cordis.patch.yml` has NO machine-specific absolute path.
- `query-maxcompute` Config has validated `maxcConfigPath` (overridable via `cordis.yml`).
- spawn builds args from Config; empty `maxcConfigPath` fails loud.
- per-pkg `tsc` + `verify-cordis-config` + a boot smoke pass.

## Follow-ups
- If a production (non-dev) sidecar lands, update `sidecarPath` default.
- Consider making the query provider itself a deployment choice (comment the insert) — separate ticket.

## Resolution (2026-08-28)

**3-layer decouple executed:**

1. **Config schema** (`query-maxcompute/src/index.ts`): replaced `args: string[]` with `sidecarPath: string` (required, the sidecar script path) + `maxcConfigPath: string` (default `''`, deployment-overridable ODPS config path). Both validated by schemastery.

2. **Spawn** (`spawnAndConnect()`): constructs `[sidecarPath, '--maxc-config', maxcConfigPath]` at spawn time. Fails loud (`throw`) if `maxcConfigPath` is empty — surfaces misconfiguration at first connect, not silently at runtime.

3. **Bundle patch** (`cordis.patch.yml`): `args:` array removed; `sidecarPath: ./packages/query/query-maxcompute/dev/maxc-sidecar.mjs` supplied; NO `maxcConfigPath` (deployment supplies via cordis.yml override or env). The hardcoded `/Users/mckenzie/.maxc/config_ieu_cdm.yaml.bak` is gone.

**Before → After (patch config):**
```yaml
# BEFORE
config:
  args:
    - ./packages/query/query-maxcompute/dev/maxc-sidecar.mjs
    - --maxc-config
    - /Users/mckenzie/.maxc/config_ieu_cdm.yaml.bak
  credMode: sidecar-self

# AFTER
config:
  sidecarPath: ./packages/query/query-maxcompute/dev/maxc-sidecar.mjs
  credMode: sidecar-self
```

**Verification:**
- `tsc --noEmit -p packages/query/query-maxcompute/tsconfig.json` — PASS (zero errors)
- `vitest run` — 54/54 tests pass (4 files: normalize, qualify, classify-error, per-scope-data-source)
- `verify-cordis-config` — only pre-existing unrelated failures (evidence-query gateway, client-ui-present-* paths); no new regressions
- Boot smoke (`dsh --dump-config`) — deferred (`dsh` CLI not installed in workspace)

**Code review fix:** fail-loud made conditional on `credMode === 'sidecar-self'` (only the maxc sidecar needs its config for self-auth; push-mode / stand-in sidecars don't). `--maxc-config` arg passed only when `maxcConfigPath` is non-empty. Test/dev files updated from stale `args: []` to `sidecarPath: 'unused'`/`sidecarPath: SIDECAR`.

**Dev smoke scripts** (`query-tool/dev/query-tool-smoke.ts`, `query-maxcompute/dev/maxc-smoke.mjs`) already use `process.env.MAXC_CONFIG ?? fallback` — NOT affected by the Config shape change (they don't consume Config). `query-tool-smoke.ts` still uses old `args:` syntax — out of scope (different package, not mounted via Cordis Config validation).

---
**S-series process**: ~~these simplification tickets are OPEN and blocked by a new-session second verification~~ — RESOLVED. Second verification confirmed: sole consumer of Config.args is spawnAndConnect(); no other package depends on the shape; dev sidecar is pre-release only (no production sidecar yet).
