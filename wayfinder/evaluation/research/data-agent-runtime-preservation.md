# Data-agent runtime preservation for evaluation architecture

Date: 2026-09-10
Audited revision: `43da666dd8` (`grilling/G10-harness-bhe-split`)

## Purpose and method

This note audits the current dsh-data-agent product and runtime before G10 fixes the Evaluation Environment role. It asks what evaluation must preserve so the measured subject remains the configured data agent rather than an evaluation-specific substitute. The audit uses repository-owned documentation, source, runnable compositions, active Agent Notes, and Wayfinder decisions as primary sources. Archived Agent Notes are excluded. It is the product-specific companion to [Data-domain Evaluation Core and DSH/Cordis integration constraints](dsh-evaluation-integration-constraints.md); that report owns the general Cordis primitive survey, while this note maps those primitives onto the current data-agent behavior and failure modes.

The first part records current facts. The second part derives recommendations. A recommendation is not presented as shipped behavior.

## Executive conclusion

The data agent is a Cordis-composed conversational product. Its behavior is the result of a selected agent preset, scoped prompt and tool registrations, the shared agent loop, a `DataScope`, configured capability providers, durable session history, user interaction, and provider lifecycle. Evaluation must treat that assembled runtime as the subject under test. It must not replace it with a direct `Nl2sqlEngine.run()` path, reconstruct Context independently, bypass model-facing tools, or introduce benchmark-owned control flow.

Evaluation should be an explicit sibling composition with two distinct roles:

1. A run controller creates a dedicated evaluation session from the same production composition, supplies only public task input through normal agent entry points, and waits for the normal lifecycle to settle.
2. A scope-local observer records immutable events and capability evidence without changing prompts, tool visibility, routing, retries, phase transitions, user interaction, or provider behavior.

The Evaluation Environment should therefore be a control-and-observation module over a resolved Cordis provider graph, not another database abstraction and not a universal action executor. Provider selection and business operations remain owned by existing capability seams such as `ctx.query`, `ctx.schema`, `ctx.retrieval`, `ctx.embedder`, filesystem, subprocess, and workflow. Environment evaluation owns requirement preflight, attempt correlation, assurance claims, finality, separation, cleanup evidence, and unresolved-state reporting.

The largest current product-integrity risk is that the default data-agent bundle mounts `eval-runner-service`, `goal-eval-policy`, and `goal-eval-context`. The latter two can trigger evaluation, inject `<eval_evidence>` into a model prompt, and block a live goal. Those are intervention features, not observation, and should not be present in ordinary data-query sessions by default. Sources: `packages/bundle/data-agent/cordis.patch.yml:183-212`, `packages/goal/goal-eval-context/src/index.ts:1-7`, `packages/goal/goal-eval-policy/src/index.ts:106-152`, `packages/goal/goal-eval-policy/src/index.ts:156-226`.

## Part I — Current runtime facts

### 1. Product identity and composition

The product is a natural-language data agent whose intended conversation transforms a business question into grounded data-source selection, SQL generation, query execution, and structured delivery. The documented four phases are UNDERSTANDING, GENERATION, EXECUTION, and INTERPRETATION. Sources: `docs/da-product-brief.md:3-18`, `docs/da-architecture.md:3-32`.

The data-agent distribution is an additive Cordis bundle over `dsh-base`. The bundle disables selected coding-agent affordances, configures native tool presentation, mounts data capabilities, and selects the `data-agent` preset as the default. It does not own a separate agent loop. Sources: `packages/bundle/data-agent/cordis.patch.yml:1-24`, `packages/bundle/data-agent/cordis.patch.yml:26-61`, `packages/bundle/data-agent/cordis.patch.yml:79-94`, `.agents/notes/implemented/architecture/2026-08-19-data-agent-additive-scaffold.md:11-17`.

The source patch treats the LLM adapter and model as deployment choices rather than product constants. A deployment can replace rows through profile, home, or command-line overlays. Sources: `packages/bundle/data-agent/cordis.patch.yml:63-70`, `docs/architecture.md:15-37`, `docs/cordis-primer.md:36-38`.

The bundle README is not fully synchronized with the current patch: it says the bundle mounts `llm-dashscope`, while the patch says the LLM provider is not bundled and must be selected by deployment. The patch and resolved composition are the runtime authority. Sources: `packages/bundle/data-agent/README.md:5-7`, `packages/bundle/data-agent/cordis.patch.yml:63-70`.

### 2. Production conversation and phase orchestration

The production path is agent-loop-driven. `Nl2sqlEngine.run()` is explicitly described as eval-only, while production SQL generation is composed from the normal model request, model-facing tools, and phase-gate hooks. Sources: `packages/data/nl2sql-engine/src/index.ts:1-24`.

The `data-agent` preset mounts the phase gate and its critic consumers inside an isolated realm, then registers the data tools on the agent plane. The host retains registries, persistence, sandbox and approval policy, and model routing. Sources: `apps/cli/config/agent-presets/data-agent/agent.cordis.yml:1-31`, `apps/cli/config/agent-presets/data-agent/agent.cordis.yml:44-99`.

The phase gate does not replace the shared agent loop. It composes behavior through Cordis extension points: `agent/turn-stopping` for ordered transitions, `agent/request` for request configuration, `system-prompt/assemble` for phase instructions, `tools/post-execute` for result-dependent state, `agent/pre-step` for admission, `llm/stream` for accounting, and `agent/status` for question boundaries. Sources: `packages/data/phase-gate/src/phase-gate.ts:1-18`, `packages/data/phase-gate/src/phase-gate.ts:977-1017`, `docs/event-producer-consumer.md:19-24`, `docs/event-producer-consumer.md:69-75`.

Phase state is per agent and spans a user question. It records the current phase, retry and resource budgets, clarification state, generated SQL, three-state query outcome, failure facts, grounding facts, prior-turn tables, and lifecycle timers. Sources: `packages/data/phase-gate/src/types.ts:23-116`.

The phase gate changes real model behavior. It filters tool schemas, rejects out-of-phase calls, changes reasoning effort, assembles phase-specific instructions, injects model-visible continuation messages, waits for clarification, and can cancel a stalled turn. Sources: `packages/data/phase-gate/README.md:34-96`, `packages/data/phase-gate/src/phase-gate.ts:580-718`, `packages/data/phase-gate/src/phase-gate.ts:888-909`.

Alternative A/B/C/D data-agent presets already demonstrate that orchestration and planning policy are independent experimental factors. The product cannot be represented faithfully by a single direct NL2SQL function because the selected preset changes prompt sections, available tools, and control flow. Sources: `apps/cli/config/agent-presets/data-agent/agent.cordis.yml:1-42`, `apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:1-40`, `apps/cli/config/agent-presets/data-agent/c-hybrid.cordis.yml:1-59`, `apps/cli/config/agent-presets/data-agent/d-bare-react.cordis.yml:1-25`.

### 3. DataScope routing is distinct from Cordis registration scope

The current `ScopeRegistryService` stores logical data namespaces in YAML. Each definition has an id, `semanticRoot`, optional tenant, and provider-oriented metadata. The registry's active scope is process-global and changes emit `scopes/active-changed`; this is data routing state, not Cordis registration scope. Sources: `packages/data/scope-registry/src/index.ts:1-15`, `packages/data/scope-registry/src/index.ts:28-47`, `packages/data/scope-registry/src/index.ts:59-81`.

The registry reads the file on each operation and persists mutations through a file lock and atomic write. It normalizes a missing tenant to `default` at the read interface. Sources: `packages/data/scope-registry/src/index.ts:255-325`.

The live agent has a separate `AgentOptions.scopeId`. The agent loop forwards that value to every root tool execution, and nested Code Mode dispatches preserve it. The current type documentation says production call sites do not yet consistently set it, leaving some consumers on the active-scope fallback. Sources: `packages/core/agent/src/runtime-types.ts:23-44`, `packages/core/agent-loop/src/tool-calls.ts:70-83`, `packages/core/tools/src/code-mode.ts:470-481`.

Scope routing is model-visible in the data-agent preset. `list_scopes`, `switch_scope`, and two prompt sections expose candidate and active scopes; alias matching reads the latest user message and can recommend a switch. Sources: `packages/data/tool-scope-routing/src/index.ts:1-18`, `packages/data/tool-scope-routing/src/list-scopes.ts:31-113`, `packages/data/tool-scope-routing/src/scope-hint.ts:93-171`.

The current process-global active-scope fallback is a migration constraint, not a safe evaluation isolation mechanism. A concurrent evaluation must not mutate the global active scope and assume the result is attempt-local.

### 4. Provider portability is already a product responsibility

`@deepseek-ai/dsh-query` is the Service Definition for `ctx.query`. Its interface exposes `execute`, `attach`, `cancel`, and `getProgress`, with a three-state `completed | pending | failed` outcome and provider-owned SQL conventions. Sources: `packages/query/query/src/index.ts:1-12`, `packages/query/query/src/index.ts:24-75`, `packages/query/query/src/types.ts:15-69`.

The model-facing `query_data` Consumer resolves `ctx.query` at execution time, fails clearly if no provider is mounted, submits SQL with the call's `scopeId`, polls a pending instance, and cancels it on abort or polling failure. Sources: `packages/query/query-tool/src/index.ts:225-250`, `packages/query/query-tool/src/index.ts:304-359`.

The active bundle currently selects MaxCompute, but it documents a provider swap by replacing the provider row behind the same `ctx.query` service. The Postgres package is only a seam proof: dialect conventions work, but execution methods still reject as unimplemented. Sources: `packages/bundle/data-agent/cordis.patch.yml:103-148`, `packages/query/query-postgres/src/index.ts:1-13`, `packages/query/query-postgres/src/index.ts:34-64`.

The MaxCompute provider owns its sidecar process, per-call credential resolution, provider error classification, connection recovery, and disposal. It registers no model-facing tools. Sources: `packages/query/query-maxcompute/src/index.ts:96-152`, `packages/query/query-maxcompute/src/index.ts:194-242`, `packages/query/query-maxcompute/src/index.ts:457-509`, `packages/query/query-maxcompute/src/index.ts:576-604`, `packages/query/query-maxcompute/src/index.ts:723-731`.

Provider portability is therefore real at the Definition/Provider/Consumer split, but only MaxCompute is currently a working production executor. Evaluation must preserve the abstraction without overstating the maturity of the second provider.

### 5. Context and semantic grounding are composed capabilities

`SemanticLayerService` owns `ctx.schema`. It resolves the active or requested data scope to a semantic root, loads definitions and retrieval corpora, builds relation graphs, tracks corpus revisions, and requires audit for persistent Tier-2 writes. Sources: `packages/data/semantic-layer/src/index.ts:286-354`, `packages/data/semantic-layer/src/index.ts:420-465`, `packages/data/semantic-layer/src/index.ts:571-624`, `packages/data/semantic-layer/src/index.ts:1012-1018`.

Retrieval is a separate capability. `RetrievalService` exposes an async, scope-aware `retrieve()` interface with opaque provider payloads. `InProcRetrieval` consumes `ctx.embedder`, can source its corpus from `ctx.schema`, and degrades from vector inference to BM25-only behavior. Sources: `packages/retrieval/retrieval/src/index.ts:1-19`, `packages/retrieval/retrieval/src/index.ts:37-76`, `packages/retrieval/retrieval-inproc/src/index.ts:1-18`, `packages/retrieval/retrieval-inproc/src/index.ts:173-221`.

The production `search_data_sources` tool currently has two valid paths: use mounted `ctx.retrieval`, or fall back to a scope/version/root-keyed local `Bm25Linker` over the semantic-layer corpus. It also optionally performs model-based query expansion. Sources: `packages/data/tool-search-data-sources/src/index.ts:416-490`, `packages/data/tool-search-data-sources/src/index.ts:598-711`, `packages/data/tool-search-data-sources/src/index.ts:712-758`.

Embedder choice is itself provider-configurable. The fake-hash provider proves the capability and deterministic mechanics but explicitly does not represent semantic quality; the HTTP provider carries a real external-model identity and can cause retrieval to degrade on inference failures. Sources: `packages/embedder/embedder/src/index.ts:81-105`, `packages/embedder/embedder-fakehash/src/index.ts:1-11`, `packages/embedder/embedder-http/src/index.ts:173-204`.

Consequently, the Context seen by the product is not just a semantic directory. It is the resolved combination of data scope, semantic-layer contents, retrieval path, embedder, graph expansion, query expansion, and prompt/tool projection.

### 6. Query lifecycle is part of product behavior

The query protocol retains pending work through an opaque instance id and supports attach, progress, and cancellation. The model-facing Consumer polls pending results to settlement within a configured budget and returns a still-pending result when that budget expires. Sources: `packages/query/query/src/index.ts:42-75`, `packages/query/query-tool/src/index.ts:225-250`, `packages/query/query-tool/src/index.ts:282-300`.

The MaxCompute provider owns child-process startup, eager connection, lazy recovery, and shutdown. Disposal closes the client and kills the sidecar, while orphan cleanup beyond the sidecar remains a documented gap. Sources: `packages/query/query-maxcompute/src/index.ts:194-242`, `packages/query/query-maxcompute/src/index.ts:252-359`, `packages/query/query-maxcompute/src/index.ts:723-731`.

A product-level evaluation that maps `pending` directly to failure or independently submits the same SQL does not measure the same lifecycle as `query_data`.

### 7. Tools and user interaction are product outputs

The tool registry is scoped. Tool definitions, restrictions, guards, and presentation modes are stored in global or scoped layers, and registrations return exact disposers. The system-prompt registry applies the same scoped-layer model to prompt sections, runtime context, tool-schema providers, and variables. Sources: `packages/core/tools/src/index.ts:137-207`, `packages/core/tools/src/index.ts:951-979`, `packages/core/tools/src/index.ts:1053-1130`, `packages/core/system-prompt/src/index.ts:373-455`.

The data agent's interaction is not exhausted by a final string. It can halt for one user clarification, publish a decomposition, retain query results under handles, present a rich table or chart, compute over a prior result, and offer clickable follow-up questions. Sources: `packages/data/tool-present-clarification/src/index.ts:1-27`, `packages/data/result-cache-memory/src/index.ts:1-25`, `packages/data/result-cache-memory/src/index.ts:119-167`, `packages/client/ui-present-table/README.md:5-18`, `packages/client/ui-suggest-followups/README.md:5-5`.

Tool values, model-facing rendering, and UI presentation are separate concerns. The tool cookbook states that `output.render` owns model-facing prose while pure presenter methods own UI state; policy and observation belong at the appropriate tool events rather than inside each tool. Sources: `docs/cookbook/adding-a-tool.md:57-69`, `docs/cookbook/adding-a-tool.md:87-87`.

### 8. The session log is the authority for model-visible behavior

A `Session` is an append-only typed event log. Derived model history is reconstructed from `user/message`, `assistant/message`, and tool results rather than maintained as a second history. Synthetic `agent.inject()` input becomes a durable `user/message` when it enters a step. Sources: `docs/subsystems/session.md:1-11`, `packages/core/session/src/types.ts:230-295`, `packages/core/agent-loop/src/agent.ts:250-299`.

Each model request records a full `request/header` snapshot containing the resolved model configuration, rendered system prompt, and tool schemas whenever that header is initial, resumed, or changed. Sources: `packages/core/session/src/types.ts:196-228`, `packages/core/agent-loop/src/agent.ts:422-513`.

Dynamic runtime context is materialized as a plugin-sourced durable user message. It is replaced when the current snapshot changes, so replay can reconstruct the context the model actually saw. Sources: `packages/core/agent-loop/src/runtime-context.ts:12-75`.

Persistence stores the same logical `SessionEvent` stream rather than inventing a parallel persisted event model, and the checkpoint policy owns the durability ordering point between turns. Sources: `docs/subsystems/persistence.md:1-17`, `packages/session/README.md:1-29`.

### 9. Cordis lifecycle and scope are product invariants

Cordis uses services for direct capabilities, typed events for observation or interception, and reversible effects for registrations. Required `inject` dependencies delay activation until their services exist. Sources: `docs/cordis-primer.md:7-13`, `docs/cordis-primer.md:40-44`.

A mounted agent preset is attached to an agent's Cordis registration scope. Its tools and prompt sections are visible to that agent and unwind with its lifecycle. Preset mounting rejects unusable rows and rejects services that leak into the process-global realm. Sources: `packages/preset/agent-presets/src/mount.ts:1-13`, `packages/preset/agent-presets/src/mount.ts:322-380`.

Cordis registration scope is not a security sandbox. Trusted same-process plugins can still access services directly, so hidden benchmark material requires a separate process or OS sandbox when confidentiality is claimed. Sources: `.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.md:141-147`.

## Applied Cordis integration map

| Data-agent integration point | Cordis primitive in the current runtime | What the product gets | Evaluation preservation rule |
| --- | --- | --- | --- |
| Query engine | `QueryEngine extends Service`; provider supplies `ctx.query`; Consumers declare or probe service injection | Backend replacement without changing `query_data` | Depend on the Service Definition, never a concrete database provider; record the resolved provider identity |
| Semantic layer | `SemanticLayerService extends Service` at `ctx.schema`; optional `ctx.get('scopes')` and `ctx.get('audit')` | Scope-aware definitions, graph, corpus, and audited writes | Observe the configured service; do not rebuild a benchmark-private schema or retrieval path |
| Retrieval and embedding | Two Service Definition/Provider relationships at `ctx.retrieval` and `ctx.embedder` | Optional hybrid retrieval and graceful BM25 degradation | Preserve the selected providers and degradation behavior; record which path actually ran |
| Model-facing data tools | `ctx.tools.register()` writes into a scoped registry layer and returns an effect-owned disposer | Stable schemas, execution, model rendering, and UI projection | Evaluation observation must not add, remove, rename, reorder, or wrap tools in a behavior-changing way |
| Phase orchestration | Scope-owned listeners on `serial`, `waterfall`, stream-wrap, and `emit` events plus `ctx.tools.guard()` | Four-phase control, retries, visibility, budgets, and clarification | Product scoring must run these hooks unchanged; an observer must not short-circuit a waterfall or inject phase transitions |
| Agent preset | Standing preset mount plus `bindScopeParent`; isolated service realms inside the preset | Per-agent persona, tools, and orchestration without per-process service collisions | The evaluated session must join the selected production preset; evaluation-only plugins use a separate child scope or host composition |
| Prompt and tool-schema assembly | `ctx.systemPrompt.section/context/tools/variable`; `system-prompt/assemble` waterfall | Scoped prompt composition and dynamic runtime context | No benchmark policy, expected answer, judge instruction, or eval hint may register in the evaluated agent's prompt scope |
| DataScope routing | `ScopeRegistryService`, `scopes/*` emit events, `AgentOptions.scopeId`, and `ToolExecutionInput.scopeId` | Project/tenant routing across schema, retrieval, credentials, and query calls | Bind a DataScope explicitly per evaluation agent; never use a process-global active-scope switch for concurrent attempts |
| Query execution lifecycle | Normal `ctx.query` methods invoked by `query_data`; provider `Service.init` and disposal | Pending attachment, cancellation, provider recovery, and shutdown | Observe the real Consumer path for product scores; finality evidence may inspect provider state but must not replace execution |
| Tool observation | `tools/result` emit for immutable final outcomes; `tools/post-execute` waterfall for transformations | Audit, result caching, policy, and presentation can compose | Prefer immutable emit observation; if a waterfall is unavoidable, call `next()` and return the unchanged decision |
| Conversation observation | `session/event` emit and durable `SessionEventMap` | Reconstructable user, assistant, tool, request-header, and context history | Link evaluation evidence to session id and event seq; do not copy hidden material into the session log |
| User interaction | Normal user messages plus presentation tools and UI slots | Clarification, rich delivery, follow-up continuation | A synthetic benchmark user exists only in a dedicated evaluation session and receives only public task state |
| Deployment selection | Bundle/profile/preset loader rows and overlay replacement | Provider, model, tool, policy, and UI choices remain configurable | Evaluation selects an explicit product composition; it must not smuggle provider choices or product defaults into benchmark files |
| Resource ownership | `ctx.effect()`, `ctx.on()`, scoped plugin fibers, `Service.init` cleanup, agent handle disposal | HMR-safe removal and quiescent teardown | Every evaluator listener, temporary scope, process, lease, and artifact writer must unwind from one owner and be awaited before the attempt is final |

The mapping follows the repository's use of services, events, scopes, and effects rather than defining a second orchestration framework. Cordis dispatch semantics are authoritative: observation is `emit`, transformation is `waterfall`, ordered control is `serial`, and a waterfall observer must delegate. Sources: `docs/cordis-primer.md:15-34`, `.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.md:11-30`.

## Part II — Current evaluation conflicts and risks

### 1. Evaluation is mounted in the ordinary product bundle

The default bundle mounts `eval-runner-service`, `goal-eval-policy`, and `goal-eval-context`. The goal policy listens to durable goal-round messages, triggers a batch, computes deltas, and can block the live goal. The context plugin registers model-visible `<eval_evidence>` and behavioral advice. This is active intervention in the agent's control and prompt planes, not passive evaluation. Sources: `packages/bundle/data-agent/cordis.patch.yml:183-212`, `packages/goal/goal-eval-policy/src/index.ts:87-153`, `packages/goal/goal-eval-policy/src/index.ts:156-226`, `packages/goal/goal-eval-context/src/index.ts:98-129`, `packages/goal/goal-eval-context/src/index.ts:168-210`.

The `trigger_eval` tool itself is mounted in the dedicated `semantic-layer-management` preset rather than the ordinary data-query preset, which is the correct product separation. The host-level eval services undermine that separation because they remain present even when the data-query preset does not expose the tool. Sources: `apps/cli/config/agent-presets/semantic-layer-management/agent.cordis.yml:23-68`, `apps/cli/config/agent-presets/semantic-layer-management/agent.cordis.yml:92-100`, `apps/cli/config/agent-presets/data-agent/agent.cordis.yml:91-130`.

### 2. The active evaluator does not run the production conversation

`eval-runner-service` directly constructs `Nl2sqlAgentResponder`, `CtxLlmAdapter`, `CtxOdpsAdapter`, `CtxQueryExecutor`, and `LlmJudgeExecutor`. It sends special one-shot prompts through `ctx.llm`, builds a local `Bm25Linker`, and separately turns query rows into an answer. Sources: `packages/eval/eval-runner-service/src/index.ts:79-123`, `packages/eval/eval-runner-service/src/index.ts:125-214`, `packages/eval/eval-runner-service/src/index.ts:217-315`, `packages/eval/eval-runner-service/src/index.ts:418-480`.

The package documentation itself distinguishes this engine path from production: the agent under test reuses logic modules, while the production agent-loop path is a separate runtime. `Nl2sqlEngine` likewise labels `run()` eval-only. Sources: `packages/eval/eval-runner-service/src/index.ts:15-18`, `packages/data/nl2sql-engine/src/index.ts:8-24`.

This path can remain useful as a component benchmark for SQL generation and grader mechanics. It cannot be the authoritative end-to-end score for the conversational product because it omits the selected preset, phase hooks, scoped tool schemas, clarification, result-cache and presentation flow, full session log, and normal request-header capture.

### 3. Evaluation reconstructs product capabilities instead of observing them

The runner creates its own BM25 linker from `ctx.schema` data instead of exercising the configured `search_data_sources` path, which may use `ctx.retrieval`, query expansion, relation-graph expansion, and per-scope caching. Sources: `packages/eval/eval-runner-service/src/index.ts:252-315`, `packages/data/tool-search-data-sources/src/index.ts:712-758`.

Its result-match adapter turns a still-pending query into a failed result, while the production `query_data` Consumer polls, cancels on abort or polling error, and can return a pending observation after its budget. Sources: `packages/eval/eval-runner-service/src/index.ts:183-214`, `packages/query/query-tool/src/index.ts:225-250`, `packages/query/query-tool/src/index.ts:282-300`.

The standalone eval CLI repeats composition and adapters again, including direct semantic-layer and query-provider mounting and separate prompt variants. Sources: `packages/eval/eval-cli/src/main.ts:1-31`, `packages/eval/eval-cli/src/main.ts:121-140`, `packages/eval/eval-cli/src/context.ts:722-837`.

These duplicate paths reduce module depth: deleting them would force their behavior back into the real product modules rather than remove essential evaluation semantics. The durable evaluation module should hide run planning, observation, evidence, and grading behind a small interface while calling the existing product interfaces for product behavior.

### 4. DataScope isolation is incomplete

The evaluator requires an explicit `scopeId`, which is better than a hidden runtime default, but the CLI still defaults to `k11`, the bundle still points at K11 assets, and ordinary context consumers can still fall back to the process-global active scope. Sources: `packages/eval/eval-runner-service/src/index.ts:381-390`, `packages/eval/eval-runner-service/src/index.ts:436-474`, `packages/eval/eval-cli/src/main.ts:52-59`, `packages/eval/eval-cli/src/main.ts:66-87`, `packages/bundle/data-agent/cordis.patch.yml:119-132`, `packages/bundle/data-agent/cordis.patch.yml:163-178`.

An evaluation architecture that keeps switching the active scope would make concurrent cases, ordinary user sessions, and evaluation runs capable of observing each other's semantic roots and provider metadata.

### 5. Evidence and intervention are mixed

`evidence-query` is a read-oriented service over semantic coverage, graph gaps, asset health, and persisted eval results. That can remain a product capability. `goal-eval-context` and `goal-eval-policy` then consume the same store to change model instructions and goal state. Sources: `packages/data/evidence-query/src/index.ts:1-16`, `packages/data/evidence-query/src/index.ts:65-88`, `packages/goal/goal-eval-context/src/index.ts:1-7`, `packages/goal/goal-eval-policy/src/index.ts:1-8`.

The distinction needed by G10 is not "evaluation data may never affect a product." It is that observation and intervention are separate, explicitly selected products. A semantic-layer optimization agent may intentionally consume evaluation results; an ordinary data-query agent must not receive that policy accidentally.

## Part III — Recommendations

### 1. Define the subject under test as a resolved product composition

A product-level evaluation run must identify and instantiate the same items that define an ordinary data-agent session:

- bundle/profile layers;
- selected agent preset and its revision;
- model provider and exact model;
- DataScope;
- query, schema, retrieval, embedder, credential, identity, and result-store providers;
- tool presentation mode and visible tool schemas;
- phase/planning variant;
- runtime configuration and code revision.

The end-to-end Harness should create an agent through the normal agent factory, join the selected preset during setup, submit the public task through the normal inbox, wait for normal `whenIdle()`/completion semantics, and read the durable session log. A direct `Nl2sqlEngine.run()` remains a named component Harness with a different identity and cannot be merged into the product score.

### 2. Make evaluation opt-in at composition time

Remove evaluation control plugins from the ordinary `@deepseek-ai/dsh-data-agent` bundle. Provide an explicit evaluation bundle, profile overlay, command, or dedicated management preset that mounts the run controller, observer, evidence store, and optional evaluation UI.

Installing evaluation packages may make their code available, but an ordinary product profile must not activate them. The deletion test is strict: removing every evaluation package and row must leave the data agent's prompts, visible tools, provider graph, session behavior, persistence, and UI delivery intact.

If semantic-layer self-improvement remains a product, keep it as the explicitly selected `semantic-layer-management` agent. Its `trigger_eval` tool and eval-driven goal policy are part of that management product's interface, not the default data-query agent's interface.

### 3. Keep observation separate from intervention

The default evaluation observer should be monotonic: it may append evaluation-owned evidence outside the model surface, but it may not change the observed run.

Prefer immutable notification points such as `tools/result`, `session/event`, `agent/status`, and provider-owned completion facts. When a needed fact exists only on a waterfall event, the observer must call `next()` exactly once and return the downstream result without changing it. It must not register `ctx.tools.guard()`, replace tool results, alter `agent/request`, append prompt sections, return pre-step messages, inject continuations, or participate in `agent/turn-stopping` for the evaluated session.

An experiment that intentionally changes prompts, tools, orchestration, Context, or retry policy is not an observer. It is a separately identified Harness variant and must appear in the run identity.

### 4. Keep Benchmark policy and private material outside the product graph

The evaluated agent scope receives only `PublicPreparedTask` and deployment-selected product capabilities. `GradingMaterialRef`, reference SQL, hidden tests, expected values, judge rubrics, comparator thresholds, and benchmark labels must not be registered as services, prompt variables, tool metadata, session fields, or error details visible to that scope.

A same-process train grader may resolve private material only from a context that the target agent cannot reach by scope lookup or import dependency. Heldout/fresh runs require the previously decided independent grader process or stronger sandbox. Cordis scope alone is not a confidentiality mechanism.

### 5. Preserve DataScope as product routing, not benchmark selection

The run plan explicitly binds one `DataScope` to the evaluated agent at creation. Tool executions inherit it through `AgentOptions.scopeId`. The evaluator must not call `setActive()` as its normal selection mechanism, and it must reject a case whose requested DataScope is missing or ambiguous before model execution.

Until production callers consistently set `AgentOptions.scopeId`, concurrent product-level evaluation across DataScopes is unsafe. This is a product routing prerequisite, not a reason to create an evaluation-only scope-routing implementation.

Evaluation may record the resolved DataScope manifest, Environment binding, Context binding, tenant, and provider identities. Benchmark files must not encode physical database projects, credentials, semantic-root paths, or process-global active-scope mutations.

### 6. Preserve provider ownership

Evaluation depends on Service Definitions and normal Consumers. It does not import `MaxComputeQueryEngine`, call sidecar tool names, resolve credentials, qualify tables, classify provider-specific errors, or implement attach/cancel/progress.

The selected Provider may contribute an evaluation participant that reports identity, snapshot, outstanding work, finality, separation, and cleanup receipts. That participant is observational and provider-owned; it does not become a replacement execution interface.

A provider swap should require only deployment configuration and a matching provider participant when stronger assurance is requested. An observational run may proceed without a strong participant, but it must report the lower assurance rather than infer guarantees.

### 7. Preserve the configured Context path

A product-level run must use the same `search_data_sources`, semantic-layer, retrieval, embedder, graph-expansion, and query-expansion path as the selected product composition. The Harness must not preload alternate schema text or construct its own linker.

Context counterfactuals are separate resolved compositions. For example, BM25-only, hybrid retrieval, no-context, or an alternate semantic snapshot each receives a different Harness/Context identity. The observer records the request header, context snapshots, tool calls, provider identities, and corpus/snapshot digests that actually occurred.

### 8. Preserve query and external-work lifecycle

Product correctness is based on the normal query Consumer and provider lifecycle. The observer may correlate `query_data` calls with provider instance ids and finality evidence, but it must not turn pending into wrong, silently re-execute candidate SQL, or score rendered TSV as the authoritative row set.

Reference/oracle execution belongs to the grader's authorized context and uses the query Service Definition with its own DataScope and Environment binding. Candidate execution and reference execution must have separate evidence identities even when they use the same provider implementation.

The Environment role should remain small:

- verify that the resolved provider graph satisfies the case's Environment requirement;
- establish attempt identity and any provider-supported namespace or snapshot;
- correlate provider resources and side effects;
- request or observe settlement without changing product retry policy;
- emit finality, separation, reset, cleanup, and limitation evidence;
- return `unresolved` when guarantees cannot be proven.

It should not expose a universal `execute(action)` interface or mirror query/filesystem/workflow methods.

### 9. Preserve user interaction and presentation

The benchmark driver may act as a synthetic user only inside a dedicated evaluation session. It sends public messages through the same inbox interface as a human and may answer a public clarification according to an explicit scripted-user policy. It never reads private grading material to choose an answer.

Ordinary sessions continue to wait for a real user after `present_clarification`. Evaluation must not install a global auto-answer listener, suppress clarification, force phase advancement, or convert an unanswered clarification into an incorrect answer without a declared Harness policy.

Product-level delivery evaluation should retain the normal `present_decomposition`, `present_table`, result-cache, compute, and follow-up flow. Graders may inspect structured tool values and durable events, but UI-only rendering and display truncation are not substitutes for authoritative execution artifacts.

### 10. Preserve durable model-visible truth

Every public benchmark prompt, synthetic user reply, injected product context, tool call/result, assistant message, effective system prompt, tool schema, and model route must be present in the evaluation session's normal durable log.

Evaluation-only evidence should live in an evaluation store keyed to run, attempt, session, and event identities. It may project product events but must not add hidden grader inputs to the session. If an evaluation event is added to `SessionEventMap`, it must be a non-model-visible fact with an explicit replay requirement; a sidecar evidence store is preferable for private or bulky artifacts.

### 11. Preserve deployment configurability and fail loudly

A benchmark declares requirements. An explicit run profile selects the product composition and bindings. The composition root resolves and freezes the result before creating the agent.

No evaluator may select a provider, model, DataScope, semantic root, project, credential, prompt variant, tool roster, or date through an internal fallback. Missing and ambiguous bindings are preflight failures, not model failures. The frozen run identity records both the requested requirements and the actual resolved product identities.

### 12. Keep modules deep and seams evidence-backed

The durable external interface of the product-level Harness should be small: resolve a run, execute a public task through a selected product composition, and return evidence references. Prompt assembly, agent creation, tool execution, Context use, and provider lifecycle remain hidden behind existing product interfaces.

Do not expose one evaluation adapter per internal call site. Reuse the same adapter from CLI, service, and automation hosts. Do not create a generic Environment participant interface until at least two real provider or capability implementations need the same operation; otherwise keep the observation internal to the first adapter and extract the seam when variation is demonstrated.

## Recommended target composition

```text
ordinary data-query profile
  dsh-base
  + data-agent product bundle
  + selected data-agent preset
  + deployment-selected providers
  - no benchmark loader
  - no grader
  - no eval observer
  - no eval prompt or policy

evaluation profile / explicit overlay
  the same resolved product composition
  + host-side Benchmark runner
  + evaluation-session-scoped observer
  + evaluation evidence store
  + Environment assurance participants
  + separate authorized grader

semantic-layer-management profile
  product management preset
  + explicit trigger_eval / eval-feedback features when desired
  - never selected implicitly for an ordinary data-query session
```

The run controller is outside the target agent's prompt/tool scope. The observer is inside only the dedicated evaluation agent's lifecycle scope. The grader is outside the target process or outside its accessible service graph according to the selected confidentiality level.

## Guardrails

1. **Composition opt-in:** no evaluation row is mounted by the ordinary data-agent bundle; enabling evaluation requires an explicit profile, overlay, command, or management preset.
2. **Target fidelity:** product-level scores must use the normal agent factory, selected preset, agent loop, tool registry, and persistence path; direct engine runners are labeled component evaluations.
3. **Prompt neutrality:** the evaluated agent's effective `request/header.system`, tools, model route, and runtime-context snapshots match an ordinary session under the same product configuration, except for the public task text and explicitly identified experimental factor.
4. **No hidden-material reachability:** the evaluated process and agent scope cannot resolve private grading material, a private loader, grader credentials, or reference artifacts.
5. **No benchmark control flow:** Benchmark code cannot call `agent.inject`, register guards, intercept `agent/request`, participate in `agent/turn-stopping`, answer clarification, or choose retries unless the run declares a distinct Harness intervention.
6. **Observer monotonicity:** observation listeners never replace waterfall results or suppress downstream listeners; their removal changes no product event, prompt, tool result, or provider call.
7. **Explicit DataScope:** every evaluated agent has a resolved `DataScopeId`; evaluation never relies on or mutates the process-global active scope.
8. **Provider neutrality:** evaluation packages depend on capability Definitions, not concrete query, retrieval, embedder, credential, or LLM providers.
9. **Context fidelity:** product evaluation uses the selected Context providers and Consumers; no evaluator-local BM25, schema projection, or prompt reconstruction participates in the score.
10. **Lifecycle fidelity:** pending work, cancellation, attach, retries, finality, and cleanup follow the product/provider implementation; uncertainty produces `unresolved`, not a fabricated terminal result.
11. **User-path fidelity:** clarification, delivery tools, result handles, and follow-up actions remain part of the observed product behavior; synthetic user responses are explicit public Harness inputs in eval-only sessions.
12. **Durable traceability:** every model-visible input is reconstructable from the session log and effective request header; evaluation evidence references those facts instead of maintaining a conflicting transcript.
13. **Separate observations and interventions:** passive metrics and traces cannot block goals or instruct the model; an eval-guided optimization agent is a separately selected product mode.
14. **Quiescent teardown:** an attempt is complete only after the agent, observer, provider participants, pending jobs, persistence flush, and temporary resources have reached their documented disposal point.
15. **Deletion test:** deleting the evaluation composition and packages leaves an ordinary data-agent deployment behaviorally complete.

## Acceptance matrix

| Scenario | Setup | Required observation | Reject when |
| --- | --- | --- | --- |
| Ordinary web session, evaluation absent | Boot the normal data-agent profile without the evaluation overlay | Data question can reach clarification or delivery through the selected preset and providers | Any eval service, eval tool, eval prompt section, benchmark path, or grader dependency is required |
| Ordinary headless session, evaluation absent | Create through the normal headless/product entry with the data-agent preset | First request has the expected product persona and tool schemas before model execution | Preset join is best-effort/racy or an eval wrapper is required to make the session usable |
| Opt-in evaluation session | Add the explicit evaluation overlay and create a dedicated session | The evaluated session uses the same product composition and gains only non-model-visible observation | Evaluation changes prompt, visible tools, phase decisions, retries, or provider calls |
| Prompt neutrality | Compare first and changed `request/header` events for ordinary and evaluated sessions under equal product config | Headers differ only in public task input or a declared experimental factor | Benchmark labels, expected answers, judge instructions, eval advice, or hidden fields appear |
| Hidden-material isolation | Run heldout/fresh with the authorized grader separated | Target process cannot resolve private artifact references; logs and errors contain no private payload | Harness imports private loaders or material appears in service lookup, filesystem view, messages, tool data, or diagnostics |
| Phase fidelity | Evaluate a task that exercises grounding, generation retry, execution, and interpretation | Durable events and visible-tool changes follow the selected preset's normal hooks | Harness calls `Nl2sqlEngine.run()` and reports the result as equivalent to the production conversation |
| Orchestration variants | Run the same public cases under A/B/C/D or future presets | Each preset has a distinct Harness identity and its real prompt/tool/control behavior | Variant selection is an unrecorded eval flag or common eval prompt erases the product difference |
| DataScope isolation | Run two sessions concurrently against distinct DataScopes | Every tool execution, semantic lookup, retrieval cache, credential lookup, and evidence item carries the intended scope | Either run uses process-global `active` as its authoritative binding or observes the other scope's assets |
| Provider swap | Replace the query provider through deployment composition | Product tools and Harness remain unchanged; run identity and assurance show the new provider | Evaluation imports a concrete provider or requires provider-specific benchmark fields |
| Context path fidelity | Run with retrieval disabled, BM25 fallback, and hybrid retrieval as separate configurations | Evidence identifies the actual path and captures its model-visible effects | Eval constructs its own linker or silently enables a provider absent from product composition |
| Pending query | Provider returns pending before completion | Normal `query_data` polling/attach/cancel behavior is observed; Environment reports final or unresolved | Evaluator maps pending directly to wrong/failed or bypasses the Consumer lifecycle |
| Clarification | Public task contains a genuine ambiguity | Agent emits the normal clarification tool result and waits; scripted reply is a logged public user message | Global listener auto-answers, private reference determines the response, or the turn is forced forward |
| Structured delivery | Task produces a decomposition, result handle, table/chart, compute step, or follow-up | Structured tool values, durable tool events, and UI projections remain correlated | Grader scores only final prose or evaluation replaces product presentation tools |
| Persistence and resume | Interrupt or resume an evaluation session | Session log reconstructs messages, request headers, tool events, context snapshots, and preset identity | Eval keeps a separate model transcript that cannot be reconciled with the canonical log |
| Observation removal | Run once with observer mounted and once without it under deterministic providers | Product session events, request headers, tool values, and terminal state are identical | Observer changes waterfall output, ordering, timing-dependent policy, or resource behavior |
| Scorer change | Regrade frozen run evidence with a different `ResolvedGradingPlan` | Product session and provider actions are not rerun; only grading evidence changes | Grader policy is embedded in the Harness or product transcript |
| Assurance downgrade | Attached provider cannot prove snapshot, separation, or cleanup | Run remains available as observational evidence with explicit limitations | Result enters managed/attached-snapshot headline aggregates by default |
| Unload and cleanup | Dispose the evaluation session or unload the overlay | Scope registrations, listeners, child processes, pending jobs, and writers quiesce; ordinary agents continue | Global service or listener remains, a provider is killed for unrelated sessions, or evidence finalizes before cleanup |
| Management-agent opt-in | Select `semantic-layer-management` explicitly | Eval feedback and `trigger_eval` are visible only in that management composition | Ordinary data-query sessions inherit `<eval_evidence>`, no-progress blocking, or eval tools |

## Implications for G10's Environment decision

The current DSH runtime supports a clear answer to the ownership question without defining a second provider system:

- **Benchmark** states Environment requirements and owns no deployment details.
- **Composition root** selects and freezes the data-agent profile, preset, DataScope, and concrete provider bindings.
- **Existing capability Providers** execute queries, read/write data, retrieve Context, and manage their own transport resources.
- **Evaluation Environment** verifies the resolved composition, opens any attempt-specific resource scope supported by those Providers, correlates their facts, and produces assurance/finality/separation/cleanup evidence.
- **Harness** drives the real agent through its normal conversation interface.
- **Observer** records without modifying behavior.
- **Grader** consumes run evidence and private material outside the target's accessible graph.

This makes Environment a deep module only if it hides heterogeneous preflight, resource correlation, finality, and cleanup behind a small attempt lifecycle interface. A pass-through wrapper around `ctx.query.execute`, `ctx.fs`, or `ctx.workflow` would be shallow and should not exist.

## Decisions G10 can take from this audit

1. Product-level evaluation and component evaluation require different Harness identities; only the former supports claims about the data-agent product.
2. Evaluation control plugins move out of the default data-agent bundle and into explicit evaluation or semantic-management compositions.
3. The evaluation observer is scope-local and behavior-preserving; interventions are separate Harness variants.
4. DataScope selection becomes explicit per evaluated agent before concurrent evaluation is allowed.
5. Environment owns assurance and lifecycle evidence over the configured Provider graph, not business capability execution or Provider selection.
6. The selected production Context path is part of the run identity and may not be reconstructed inside the evaluator.
7. The canonical session log and request headers are the authority for what the model saw; evaluation evidence references them.
8. Hidden material and grading remain outside the evaluated process's reachable services, files, prompts, and logs.

## Source set reviewed

- Product and architecture: `docs/da-product-brief.md`, `docs/da-architecture.md`, `docs/architecture.md`, `docs/cordis-primer.md`, `docs/subsystems/{core,session,persistence,scope,tools}.md`.
- Composition: `packages/bundle/data-agent/`, `apps/cli/config/agent-presets/data-agent/`, `apps/cli/config/agent-presets/semantic-layer-management/`, `packages/preset/agent-presets/`, `packages/data/preset-autojoin/`.
- Data runtime: `packages/data/phase-gate/`, `packages/data/scope-registry/`, `packages/data/semantic-layer/`, data tools, result cache, audit, management session, evidence query, and patrol mode.
- Providers: `packages/query/`, `packages/retrieval/`, `packages/embedder/`.
- Evaluation: `packages/eval/`, `packages/data/tool-trigger-eval/`, `packages/goal/goal-eval-policy/`, `packages/goal/goal-eval-context/`.
- Runnable composition precedent: `examples/AGENTS.md`, `examples/headless-agent/`, `examples/acp-agent/`, `examples/jsonrpc-agent/`.
- Current decisions: relevant non-archived Agent Notes and Wayfinder G10/GA-GT2/GA-GT4 tickets.
