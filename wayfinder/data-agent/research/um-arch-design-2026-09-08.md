# UM-ARCH design — gen-architecture-graph.ts + authoritative data-agent Mermaid + refined depmap

> Generated 2026-09-08. Replaces v1 手画 diagrams in `UM-flow-2026-09-08.md`.
> All facts from actual `package.json` peerDeps + `src/*.ts` import grep + `cordis.patch.yml` + `api-remotes/src/client/index.ts`. READ-ONLY design pass.
>
> **Update 2026-09-08 (Session B impl)**：implemented in `scripts/gen-architecture-graph.ts` (see `wayfinder/data-agent/tickets/phase-upstream-merge/UM-ARCH-architecture-diagrams-depmap.md` Resolution + Cross-check). Code-vs-design corrections — SEAM_MANIFEST has **4** bundles (not 7 — `sdk-app/sdk-minimal/acp-app` don't exist), **9** assembly remotes in `api-remotes/src/client/index.ts` (not 3 — `result-cache` has no `./remote` export), **9** @Remote emitters; `packages/api` has only `gateway`+`remotes` (session/settings/workspace "controllers" are `dsh-{session,settings,workspace}` elsewhere). §1.4's "lefthook pre-commit hook (like gen-module-graph)" was a **false premise** — `module-graph` has no lefthook regen hook (`lefthook.yml` pre-commit = translation-pairing/archived-notes/lint/third-party-notices/whitespace/vendor-guard only); update-on-change is CI-gate-only (architecture-graph mirrors). The §2 data-agent 4-phase flow diagram + §3 data-agent→upstream depmap + UM-flow v1 replacement are deferred to UM14 (UM-flow self-states "UM14 后权威").

## 1. gen-architecture-graph.ts design

Follows the repo generator pattern of `scripts/gen-module-graph.ts` (manifest-only peer graph, `--check` verify, paired zh/en) and `scripts/gen-doc-graphs.ts` (hybrid: enumerable facts from `TypeScriptProject` source scan + curated manifest for seams the source cannot infer). Reuses shared helpers; no new infra.

### 1.1 What the script reads

| Source | Read via | What it yields |
|---|---|---|
| `packages/*/*/package.json` | `collectPackageGraph()` (package-graph.ts) | package nodes: `short` / `name` / `group` / `rel` / peerDep `deps[]` — the manifest-level graph (same as gen-module-graph) |
| `packages/*/src/**/*.ts` | `TypeScriptProject(root,'host'|'client')` (ts-project.ts) | every import declaration → resolve `@deepseek-ai/dsh-*` specifiers to package short names → **cross-package import edges** (superset of peerDeps; flags imports absent from peerDeps as "undeclared") |
| `packages/bundle/*/cordis.patch.yml` + each bundle `package.json` `dsh.bundle.patch` field | YAML parse | **seam 1** bundle composition: which base rows each bundle disables/inserts, which packages it mounts |
| `packages/api/remotes/src/client/index.ts` | source scan of its `import ... from '@deepseek-ai/dsh-*/remote'` lines | **seam 5** @Remote assembly manifest: which `/remote` exports are wired into the neutral client assembly |
| `packages/client/connection/package.json` `exports` field | manifest read | **seam 3** `./client` public subpath export boundary |
| `packages/client/modules/package.json` `exports` field | manifest read | **seam 4** client-modules loader export boundary |
| `packages/api/{gateway,remotes,session-controller,settings-controller,workspace-controller}` dir presence | glob | **seam 2** @Remote/api-remotes controller set |
| `@Remote(...)` decorators + `TypertRemoteService`/`Remote`/`RemoteError` symbol refs | TS checker scan of source | which packages emit/consume the @Remote wire — **seam 2** enumerable side |
| `SEAM_MANIFEST` (new, curated in the script, mirrors `SERVICE_ROLES` in gen-doc-graphs.ts) | static array | policy the source cannot infer: seam id → title / mode / packages / note — the 5 seams + @Remote assembly |

### 1.2 How it builds the graph

Three layers, layered like gen-doc-graphs.ts (package graph as base, relationship graph on top):

1. **Package layer** — `collectPackageGraph(root, GROUP_ORDER, 'gen-architecture-graph')` → topo-sorted nodes + peerDep edges. Identical to gen-module-graph.ts. This is the "what exists" floor.
2. **Import layer** — for each package `src/**/*.ts`, walk import declarations via the TS checker; resolve `@deepseek-ai/dsh-<short>` and `@deepseek-ai/dsh-<short>/src/...` specifiers to short names; record `(importer, imported, isSubpath)` edges. An import edge NOT present in the importer's peerDeps is flagged `undeclared` (a policy violation candidate, feeds verify-package-dependencies). This catches what manifest peer graphs miss: subpath imports (`/src/index.ts`), type-only `import type {}`, and cross-face leaks.
3. **Seam layer** — `SEAM_MANIFEST` (curated, 6 entries) annotates packages with seam roles. For @Remote (seam 2), the enumerable side is the `@Remote(...)` / `TypertRemoteService` source scan; for the client assembly (seam 5), it is the `api-remotes/src/client/index.ts` import list. Each seam entry: `{ key, title, mode: 'seam', packages: {implementations[], consumers[], assembly?[]}, note }`.

`SEAM_MANIFEST` (curated, from code):
```
seam-1 bundle-composition: implementations=[base,headless,sdk-app,sdk-minimal,web-app,acp-app,data-agent]; note='cordis.patch.yml overlay; dsh.bundle.patch manifest field'
seam-2 remote-api: implementations=[api-gateway,api-remotes,api-session-controller,api-settings-controller,api-workspace-controller]; consumers=packages emitting @Remote/TypertRemoteService; note='@Remote markers + TypertRemoteService; client assembly in seam-5'
seam-3 client-connection: implementations=[client-connection]; export='./client'; note='public RPC carrier subpath'
seam-4 client-modules: implementations=[client-modules]; export='./client'; consumers=packages/client/ui-*; note='loader for client plugins'
seam-5 remote-assembly: implementations=[api-remotes/src/client]; assembly=imported /remote exports; note='platform-neutral Host Remote contributions'
seam-6 remote-workspace-files: mode=pending; note='NEW seam, pending UM14 re-sync'
```

### 1.3 Output format

Two artifacts, mirroring gen-module-graph.ts (Mermaid + depmap table) and its `--check` verify:

**Artifact A — `docs/architecture-graph.md`** (Mermaid flowchart):
- subgraphs by face: `Host` (Node/server packages) and `Client` (browser packages), each with group sub-subgraphs (util/llm/core/.../data/bundle/api/client)
- package nodes (reuse `graphNodeId`/`escapeMermaidLabel` from package-graph.ts)
- edges: solid `-->` = peerDep (manifest), dashed `-.->` = import-only (undeclared), `==>` = @Remote wire (seam 2→3 carriage)
- seam nodes styled via `classDef seam` (the 6 seam markers)
- `maxEdges` raised (verify-mermaid.ts already sets 2000; architecture graph is smaller than module graph)

**Artifact B — depmap table** (in same md, below the Mermaid):
`| package | group | peer deps | cross-imports | seam role | undeclared? |`
- peer deps and cross-imports both link to package dirs (reuse `packageLink` pattern)
- seam role = which SEAM_MANIFEST entry the package belongs to (or `—`)
- undeclared = `⚠` if an import edge has no peerDep backing (policy violation candidate)

### 1.4 Verify + update-on-change

- `--check` mode (identical to gen-module-graph.ts `main()`): recompute, diff against on-disk, exit 1 + print stale paths if any artifact drifted; print `gen-architecture-graph: N artifact(s) up to date.` otherwise. Wired into `run-gates.ts` alongside gen-module-graph/gen-doc-graphs.
- No paired zh/en (unlike gen-module-graph) — architecture graph is internal-only (wayfinder), single locale. If productized, add `translationPairPaths` later.
- Update-on-change: lefthook pre-commit hook (like gen-module-graph) regenerates on package.json/src import churn; CI `--check` fails PRs with stale graphs. This is the "gen/verify/update-on-change" the UM-flow 工程机制 demands.

### 1.5 Scope boundary (honest)

- The script reads **code structure** (manifests + imports + @Remote markers + patch YAML). It does NOT infer runtime call-flow (that is gen-doc-graphs.ts `SERVICE_ROLES` curated territory) or data-flow (that is a separate concern). The architecture graph is the "what connects to what" floor; the relationship/flow graph stays in gen-doc-graphs.ts.
- `SEAM_MANIFEST` is curated, not inferred — seams are a design decision, not enumerable from a single file. When a new seam lands (e.g. workspace-files, UM14), the manifest gains an entry + the source scan confirms its packages; the verify gate catches a missing entry only if a package emits `@Remote`/TypertRemoteService without a matching seam row (optional structural check).

---

## 2. Authoritative data-agent architecture Mermaid (from code)

Facts: `packages/data/*` (37 pkgs) + `packages/bundle/data-agent` (cordis.patch.yml) + `packages/eval/*` + `packages/query/*` + `packages/retrieval/*` + `packages/embedder/*`. Edges from actual `src/*.ts` imports + `package.json` peerDeps + the patch YAML insert rows. Seam deps marked `-.->`.

```mermaid
flowchart TB
    subgraph DABUNDLE["① bundle/data-agent — cordis.patch.yml (seam-1 PUBLIC)"]
        Patch["disable: code-agent surface (tool-str-replace-editor, tool-ralph)<br/>disable: goal/todo/plan-mode (planning-OFF)<br/>disable: identity stub, code-runtime worker<br/>insert: query-engine, scope-registry, semantic-layer,<br/>schema-gateway, evidence-query, audit, nl2sql-engine,<br/>admin, result-cache-memory, eval-runner-service,<br/>goal-eval-policy/context, code-runtime-data-python,<br/>preset-autojoin, client-ui-context/semantic-layer<br/>deploy-layer (commented): llm-dashscope, embedder, retrieval"]
    end

    subgraph PIPELINE["4-phase data pipeline"]
        RET["① retrieval"]
        QRY["② query"]
        GRD["③ guard"]
        EVL["④ eval"]
        Patch --> PIPELINE
    end

    subgraph CORE["data core services (ctx.* seams)"]
        SEM["semantic-layer<br/>ctx.schema · loaders+tables"]
        SCH["schema-gateway<br/>TypertRemote (W1 read-only)"]
        SCOPE["scope-registry<br/>ctx.scopes · per-scope ns"]
        NL2SQL["nl2sql-engine<br/>ctx.nl2sql · BM25+prompt+critic"]
        QENG["query-maxcompute<br/>ctx.query · MaxCompute provider"]
        QTOOL["query-tool<br/>engine-neutral SQL exec"]
    end

    subgraph TOOLS["data tools (defineTool → dsh-tools)"]
        TSEM["semantic-layer tools<br/>discover-relations · discover-alt-labels<br/>get-coverage · get-definition · list-domains<br/>load-{table,event}-definition · search-schema<br/>update-table-config · edit-definition · revert-edit · resolve-term"]
        TQRY["query/retrieval tools<br/>critique-sql · evaluate-sql-quality<br/>compute · retrieve · search-data-sources<br/>suggest-followups · present-{table,decomposition,clarification}<br/>scope-routing · trigger-eval · reachability-delta"]
    end

    subgraph CACHE["result cache"]
        RC["result-cache<br/>@Remote get (TypertRemote)"]
        RCMEM["result-cache-memory<br/>in-mem session-scoped provider"]
        RCMEM --> RC
    end

    subgraph AUDIT["audit + evidence"]
        AUD["audit<br/>ctx.audit · node:sqlite (P8b)"]
        EVQ["evidence-query<br/>coverage/gap/eval-result<br/>+ gateway (TypertRemote)"]
    end

    subgraph GUARD["guard + eval backstop"]
        PG["phase-gate<br/>Agent pre/post-step · SQL syntax gate"]
        PATROL["patrol-mode<br/>phase patrol"]
        EVALSVC["eval-runner-service<br/>ctx.evalRunner · Nl2sqlEngine over K11"]
        GOALEVALP["goal-eval-policy<br/>no-progress backstop (K=3,N=3)"]
        GOALEVALC["goal-eval-context<br/>inject eval_evidence XML"]
    end

    subgraph IDENTITY["identity + access (P9b)"]
        ADM["admin<br/>IdentityService · PAT self-service · authz"]
        MGT["management-session"]
        PAJ["preset-autojoin<br/>agent/created → join data-agent preset"]
    end

    subgraph CLIENTPLG["client plugins (loaded by seam-4)"]
        UICL["client-ui-context-layer<br/>knowledge-graph overlay"]
        UISEM["client-ui-semantic-layer<br/>semantic-layer mgmt UI"]
        CRTPY["code-runtime-data-python<br/>pandas transforms + Excel"]
    end

    RET --> NL2SQL
    RET --> SEM
    QRY --> QENG
    QRY --> QTOOL
    QRY --> NL2SQL
    GRD --> PG
    PG --> NL2SQL
    PG --> SEM
    PG --> SCOPE
    EVL --> EVALSVC
    EVALSVC --> GOALEVALP
    EVALSVC --> GOALEVALC
    EVL --> TQRY
    GRD --> PATROL
    PATROL --> MGT
    PATROL --> AUD
    PATROL --> EVQ

    TSEM --> SEM
    TSEM --> AUD
    TQRY --> NL2SQL
    TQRY --> CACHE
    TSEM --> SCOPE
    TQRY --> EVQ
    EVQ --> SEM
    SCH --> SEM
    SCH --> NL2SQL
    ADM --> IDSEAM["dsh-credentials · dsh-identity · dsh-host-webserver"]

    Patch -.->|"seam-1 bundle composition"| BASE["dsh-base (upstream)"]
    SCH -.->|"seam-2 @Remote + seam-5 assembly"| ASM["api-remotes/src/client"]
    RC -.->|"seam-2 @Remote + seam-5 assembly"| ASM
    EVQ -.->|"seam-2 @Remote + seam-5 assembly"| ASM
    ASM -.->|"seam-3 client/connection ./client"| CONN["client-connection (RPC carrier)"]
    UICL -.->|"seam-4 client-modules loader"| CMOD["client-modules"]
    UISEM -.->|"seam-4"| CMOD
    ADM -.->|"host webserver + credentials seam"| BASE
    PG -.->|"core seams: agent/llm/system-prompt/session/tools"| BASE
    EVALSVC -.->|"llm seam (ctx.llm from base)"| BASE
    QENG -.->|"query seam (abstract dsh-query peer)"| BASE
    Patch -.->|"deploy-layer: llm-dashscope (commented)"| LLMDEP["llm-dashscope (AGA) — deployment choice"]
    Patch -.->|"opt-in: embedder/retrieval (commented)"| EMB["embedder-fakehash · retrieval-inproc"]
```

### 2.1 Reading the diagram

- **Solid `-->`** = in-package-family dependency (peerDep or src import, confirmed in code).
- **Dashed `-.->`** = cross-face / seam dependency (data-agent → upstream seam). Labeled with the seam id.
- The 4-phase pipeline (retrieval/query/guard/eval) is the data-agent's own control flow; the core services + tools are the capability substrate the pipeline drives.
- `seam-2 @Remote + seam-5 assembly` appears three times: schema-gateway, result-cache, evidence-query each emit a `/remote` that `api-remotes/src/client/index.ts` imports (confirmed: `schemaGatewayRemote`, `resultCacheRemote`, `evidenceQueryRemote` are all imported in that file). These are the data-agent's only @Remote contributions to the client assembly.
- LLM is **deployment-layer**, not bundled: `llm-dashscope` is commented in `cordis.patch.yml`; the data-agent consumes `ctx.llm` from base. Same for embedder/retrieval (opt-in, commented).

---

## 3. Refined dependency map (data-agent → upstream seams)

Refined from v1 (UM-flow) using actual `package.json` peerDeps + `src/*.ts` import grep. "Public" = consumes a documented seam/contract. "⚠ VIOLATION" = consumes an internal/zombie boundary.

| data-agent component | upstream seam / package | contract (how) | status |
|---|---|---|---|
| `bundle/data-agent` cordis.patch.yml | ① bundle composition | `dsh.bundle.patch` manifest field → patch YAML overlay over dsh-base | PUBLIC — aligned |
| `result-cache/src/remote.ts` | ② @Remote/api-remotes | `@Remote('get')` marker → TypertRemoteService | PUBLIC — aligned (UM4 re-home) |
| `evidence-query/src/gateway.ts` | ② @Remote/api-remotes | TypertRemoteService + Remote (EvidenceQueryGateway) | PUBLIC — aligned |
| `schema-gateway/src/index.ts` | ② @Remote/api-remotes | TypertRemoteService + Remote (read-only ctx.schema projection) | PUBLIC — aligned (W1) |
| `schema-gateway` + `evidence-query` + `result-cache` `/remote` exports | ⑤ api-remotes client assembly | imported in `api-remotes/src/client/index.ts` (3 of N remotes) | PUBLIC — 3 data-agent remotes wired |
| `admin` | host webserver + credentials + identity seams | peerDep `dsh-host-webserver` + `dsh-credentials` + `dsh-identity`; src imports `IdentityService`, `CredentialRef`, `userId/scopeId` | PUBLIC — aligned (P9b) |
| `phase-gate` | core seams: agent/llm/system-prompt/session/tools | peerDeps + src imports `Agent`, `GenerateOptions`, `PromptAssembly`, `UserMessage`, `ToolExecution` | PUBLIC — aligned |
| `semantic-layer` | audit + llm + atomic-write seams | peerDep `dsh-audit` + `dsh-llm` + `dsh-atomic-write`; src `writeFileAtomic` | PUBLIC — aligned |
| `nl2sql-engine` | query seam (abstract `dsh-query` + provider `dsh-query-maxcompute`) | peerDep both; src imports `EngineConventions`, `loadConventions` | PUBLIC — aligned |
| `result-cache-memory` | result-cache + tools seams | peerDep `dsh-result-cache` + `dsh-tools`; src imports `ResultCache`, `PostToolDecision` | PUBLIC — aligned |
| `tool-compute` | code-runtime + result-cache seams | peerDep `dsh-code-runtime` + `dsh-result-cache`; src imports `CodeBindingFunction`, `ResultEntry` | PUBLIC — aligned |
| `tool-retrieve` + `tool-search-data-sources` | retrieval seam (opt-in) | peerDep `dsh-retrieval`; src imports `RetrievalService` (type-only, degrades to Bm25Linker if unmounted) | PUBLIC — opt-in |
| `client-ui-context-layer` + `client-ui-semantic-layer` | ④ client-modules loader | client plugins under `packages/client/ui-*`; mounted via patch insert rows; loaded by client-modules | PUBLIC — aligned |
| LLM provider (`llm-dashscope`) | llm seam | deployment choice, commented in patch; consumes `ctx.llm` from base | PUBLIC — deploy-layer, not bundled |
| `embedder` + `retrieval-inproc` | embedder/retrieval seams | opt-in, commented in patch; `Bm25Linker` default when unmounted | PUBLIC — opt-in |
| `client/runtime` (OLD fork, 45 pkgs) | ③ client/connection internal | ⚠ VIOLATION — zombie internal boundary | R-DA-CLIENT-RUNTIME-DECOMMISSION (not in synced base; fork-only) |
| `workspace-files` | ② api/workspace-files @Remote | NEW seam | pending UM14 re-sync (dir not yet present; only `workspace-controller` exists) |

### 3.1 Refinement notes vs v1

- **v1 said** "client/connection 用法 public (ConnectionRecoveryConfig rename)". **Refined**: no `packages/data/*` src file imports `dsh-client-connection` directly. The data-agent touches seam 3 only transitively: its @Remote remotes (seam 2) are assembled in `api-remotes/src/client` (seam 5) and carried over `client-connection` (seam 3). So seam 3 is an **indirect** carriage dep, not a direct data-agent import. The `ConnectionRecoveryConfig` rename is an upstream API surface the data-agent does not reference in source.
- **v1 said** "client-modules 用法 public (DshClientManifest rename)". **Refined**: no `packages/data/*` src imports `dsh-client-modules`. Seam 4 is consumed only by the two `client-ui-*` plugins the bundle mounts (they are client-side, loaded by client-modules). Data-agent server packages do not touch seam 4.
- **v1 zombie row** confirmed: `client/runtime` zombie violation is **fork-only** (the 45 decommission packages). The synced upstream base + `packages/data/*` have **zero** `client/runtime` imports — verified by grep. Post-UM14 re-sync, the fork's 45 packages are the decommission scope; they do not appear in the authoritative data-agent layer.
- **NEW**: `workspace-files` seam confirmed absent — `find packages/api` shows only `workspace-controller`; the `workspace-files` @Remote is a UM14-pending new seam, not yet in code.
- **@Remote count**: exactly 3 data-agent remotes wired into the client assembly (schema-gateway, evidence-query, result-cache) — confirmed in `api-remotes/src/client/index.ts`. v1's "32↑" re-validate count referred to total api-remotes imports; the data-agent's slice is 3.

---

## 4. Open items for the gen-script implementer (UM-ARCH build)

1. `SEAM_MANIFEST` curation: the 6 entries above are the minimum; review whether `workspace-files` (pending) should be a stub row now or added at UM14 land.
2. Undeclared-import detection: decide threshold — `import type {}` (type-only, no runtime) may be acceptable without peerDep (TS project refs cover it). The script should distinguish `import type` from value imports when flagging `undeclared`.
3. `maxEdges`: architecture graph is smaller than the module graph (which already needs 2000). Default 2000 is safe; no raise needed.
4. Paired zh/en: skip for now (internal wayfinder doc); if the graph graduates to `docs/`, adopt `translationPairPaths`.
5. Wire into `run-gates.ts` after `gen-module-graph` + `gen-doc-graphs` so a stale architecture graph fails CI the same way.
