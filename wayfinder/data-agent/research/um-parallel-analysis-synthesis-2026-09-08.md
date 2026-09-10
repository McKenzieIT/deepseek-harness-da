# UM Parallel Analysis Synthesis (2026-09-08)

Synthesis of two parallel READ-ONLY research notes on the upstream-merge (UM)
data-agent seam analysis. Facts derive from the source notes (each verified
against actual git/grep/file commands in its own pass).

## Sources
- `um-adapt-seam34-sample-2026-09-08.md` — seams 3/4 adaptive-vs-surface
  verdict (fork data-agent vs upstream `d347e703..upstream/master` c389f96bf3, +449).
- `um-arch-design-2026-09-08.md` — gen-architecture-graph.ts design +
  authoritative data-agent Mermaid + refined depmap.

## 1. What UM-ADAPT found — adaptive-vs-surface verdict (seams 3 & 4)

**Architectural shift:** both seams demote webServer from a load-time hard
dependency to an optional, on-demand carrier.
- Seam 3 (`packages/client/connection`): inject `['webServer','credentials']`
  → `['credentials']`; `/api` route mount moved inside
  `ctx.inject(['webServer'], (webCtx) => webCtx.effect(...))`; client export
  `ConnectionConfig` → `ConnectionRecoveryConfig`.
- Seam 4 (`packages/client/modules`): inject `['webServer','loader']` →
  `['loader']`; route registration now conditional-lazy; new
  `fetchBundle(request: Request)` serves bundles without webServer;
  `DshClientDeclaration` removed → `DshClientManifest`.

**Data-agent exposure:**
- Type consumption: NONE — no `packages/data/*` or `packages/bundle/data-agent`
  src imports `ConnectionConfig`/`DshClientDeclaration`/
  `ConnectionRecoveryConfig`/`DshClientManifest`.
- Bundle/host registration: NO — `packages/bundle/data-agent/src/index.ts` is
  `export {}`; `cordis.patch.yml` is additive-only, lists no connection/modules
  rows.
- Plugin-level: YES, one plugin — `packages/data/admin/src/index.ts` (line 141
  inject `['storageDomain','credentials','webServer']`, line 238 synchronous
  `ctx.webServer.register` inside `ctx.effect`). This is the SAME OLD pattern
  both seams retired.

**Verdict: ADAPTIVE for both seams.** Not because the specific type/inject
breaks touch the data-agent (they do not), but because the joint shift
requires the fork's one eager-webServer plugin to align. Per the decision rule
(eager webServer → adaptive) + criterion 2 (no fork workaround against the new
logic), keeping admin eager IS the workaround to retire. Admin's
HTTP-justification makes the refactor low-risk (behavior-preserving when
webServer present), not unnecessary.

**Single shared refactor** covers both seams (file
`packages/data/admin/src/index.ts`):
1. Drop `webServer` from `inject`.
2. Wrap `ctx.webServer.register` in `ctx.inject(['webServer'], (webCtx) =>
   webCtx.effect(...))` (mirror seam 3), or the conditional variant per seam 4.
3. Update `packages/data/admin/tests/admin.spec.ts` (lines 7/45/48): replace
   `expect(inject).toContain('webServer')` with a lazy-registration assertion.

Risk: LOW. Feeds **R-DA** (adaptive data-agent refactor).

**Surface-only companion (NOT adaptive, feeds UM14):** merge the 11 new
upstream `tsconfig.base.json` path-mappings (incl.
`@deepseek-ai/dsh-package-manifest`); no key conflicts with fork's UM8
data-agent aliases (additive both sides). Data-agent does not need
`dsh-package-manifest` as a runtime dep (admin does not consume
`DshClientManifest`); only the tsconfig alias is required (owned by base).

## 2. What UM-ARCH found — gen-script design + data-agent diagram

**gen-architecture-graph.ts design:** follows the repo generator pattern of
`scripts/gen-module-graph.ts` (manifest-only peer graph, `--check` verify) and
`scripts/gen-doc-graphs.ts` (hybrid: enumerable source facts + curated manifest
for seams source cannot infer). Reuses shared helpers; no new infra.

Three layers:
1. **Package layer** — `collectPackageGraph()` → topo-sorted nodes + peerDep
   edges (the "what exists" floor).
2. **Import layer** — walk TS import declarations per `packages/*/src/**/*.ts`;
   resolve `@deepseek-ai/dsh-*` specifiers to short names; record cross-package
   import edges; flag imports absent from peerDeps as `undeclared` (policy
   violation candidate). Catches subpath imports, type-only imports, cross-face
   leaks that manifest peer graphs miss.
3. **Seam layer** — `SEAM_MANIFEST` curated 6 entries (seam-1
   bundle-composition, seam-2 remote-api, seam-3 client-connection, seam-4
   client-modules, seam-5 remote-assembly, seam-6 remote-workspace-files
   pending). Annotates packages with seam roles.

**Output:** `docs/architecture-graph.md` (Mermaid flowchart + depmap table) +
`--check` verify mode wired into `run-gates.ts` alongside
gen-module-graph/gen-doc-graphs. Lefthook pre-commit regenerates on churn.

**Scope boundary (honest):** reads code structure only (manifests + imports +
@Remote markers + patch YAML). Does NOT infer runtime call-flow (gen-doc-graphs
curated territory) or data-flow. `SEAM_MANIFEST` is curated, not inferred.

**Authoritative data-agent architecture (from code):**
- Bundle/data-agent `cordis.patch.yml` (seam-1): disables code-agent surface,
  goal/todo/plan-mode (planning-OFF), identity stub; inserts query-engine,
  scope-registry, semantic-layer, schema-gateway, evidence-query, audit,
  nl2sql-engine, admin, result-cache-memory, eval-runner-service,
  goal-eval-policy/context, code-runtime-data-python, preset-autojoin,
  client-ui-context/semantic-layer. Deploy-layer (commented): llm-dashscope,
  embedder, retrieval.
- 4-phase pipeline: retrieval → query → guard → eval.
- Core services: semantic-layer, schema-gateway, scope-registry,
  nl2sql-engine, query-maxcompute, query-tool.
- @Remote contributions to client assembly: exactly 3 (schema-gateway,
  evidence-query, result-cache) wired in `api-remotes/src/client/index.ts`.

**Refined depmap (vs v1 UM-flow):**
- Seam 3 is INDIRECT carriage — no `packages/data/*` src imports
  `dsh-client-connection`; remotes assembled in seam-5 are carried over
  seam-3. `ConnectionRecoveryConfig` rename is upstream surface the
  data-agent does not reference.
- Seam 4 consumed only by the two `client-ui-*` plugins (client-side, loaded
  by client-modules); data-agent server packages do not touch seam 4.
- `client/runtime` zombie violation is FORK-ONLY — the 45 decommission
  packages. Synced upstream base + `packages/data/*` have ZERO
  `client/runtime` imports (verified by grep). Post-UM14 re-sync, those 45
  fork packages are the decommission scope; they do not appear in the
  authoritative data-agent layer.
- `workspace-files` seam confirmed ABSENT — only `workspace-controller`
  exists; `workspace-files` @Remote is a UM14-pending new seam.
- @Remote count: exactly 3 data-agent remotes (not v1's "32↑" total).

## 3. What this unblocks

| Track | Unblocks | Depends on |
|---|---|---|
| UM-ADAPT (seam 3/4 adaptive) | R-DA admin lazy-webServer refactor (single refactor covers both seams) | UM-ARCH diagram confirms admin is the ONLY eager-webServer plugin + seam deps are indirect → refactor scope confirmed minimal + low-risk |
| UM-ADAPT surface | `tsconfig.base.json` 11 path-mappings merge | UM14 re-sync (path-mappings land with UM14 base merge) |
| UM-ARCH impl | gen-architecture-graph.ts build | UM14 multi-session — `SEAM_MANIFEST` seam-6 workspace-files entry + the seam-6 source scan both land at UM14; script should accept a pending stub row now |
| UM-ARCH verify gate | CI catches stale architecture graphs on package.json/src import churn | gen-architecture-graph.ts built + wired into `run-gates.ts` |
| UM14 re-sync | workspace-files @Remote seam lands; `client/runtime` 45-pkg decommission scope finalized | UM-ARCH diagram authoritative baseline (fork-only zombie row confirmed) |

**Key dependency:** UM-ADAPT full completion needs UM-ARCH + UM14 — UM-ARCH
provides the authoritative baseline that confirms the adaptive refactor scope
(admin is the sole eager-webServer plugin; seam 3/4 deps are indirect, so the
single admin refactor suffices); UM14 lands the tsconfig path-mappings surface
merge and the workspace-files seam that closes seam-6.

## 4. Next steps

1. **Build gen-architecture-graph.ts (UM-ARCH)** — three-layer script per §2;
   seed `SEAM_MANIFEST` with 6 entries (seam-6 workspace-files as pending
   stub); wire `--check` into `run-gates.ts`; ship `docs/architecture-graph.md`
   (Mermaid + depmap). Implementer open items: distinguish `import type` from
   value imports when flagging `undeclared`; skip paired zh/en for now
   (internal wayfinder doc); default `maxEdges=2000` is safe.
2. **R-DA admin lazy-webServer refactor** — the single shared refactor in
   `packages/data/admin/src/index.ts` covering both seam 3 and seam 4; update
   `admin.spec.ts` lazy-registration assertion. Low-risk, behavior-preserving
   when webServer present. Can proceed once UM-ARCH baseline lands (confirms
   scope); the surface tsconfig merge waits for UM14.
3. **UM14 tsconfig merge** — merge 11 new `tsconfig.base.json` path-mappings
   (incl. `@deepseek-ai/dsh-package-manifest`); additive, no conflicts with
   UM8 aliases.
4. **UM14 re-sync** — land `workspace-files` @Remote seam (closes seam-6);
   finalize `client/runtime` 45-pkg decommission scope against the
   authoritative UM-ARCH baseline; re-derive @Remote count after UM14 lands.
