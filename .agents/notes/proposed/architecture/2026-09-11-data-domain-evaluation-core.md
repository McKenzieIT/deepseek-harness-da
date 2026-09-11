# Agent Note: Data-domain evaluation core over production DSH compositions

Status: proposed

English | [中文](2026-09-11-data-domain-evaluation-core.zh.md)

## Problem

The current evaluation path mixes benchmark content, SQL-specific grading, batch execution, provider glue, Context assembly, persistence, comparison, and product control across `dsh-eval`, `dsh-eval-runner`, `dsh-eval-runner-service`, and `dsh-eval-cli`. Two runner stacks and two adapter stacks already disagree, while the active paths bypass the production Agent, duplicate Context assembly, hard-code one DataScope, and expose evaluation controls in the ordinary data-agent bundle.

This structure cannot support credible product claims. A direct `Nl2sqlEngine` or responder run does not exercise the production profile, preset, Agent loop, Session, tool pipeline, approval policy, hooks, guards, workflow, persistence, or configured Provider graph. A result identified only by model, case id, and a few flags cannot distinguish changes in Benchmark content, Harness composition, Context, Environment, grading, observation, or sampling.

Benchmark content has a different lifecycle from runtime code. Cases, splits, policies, and fresh cohorts need content identity and private-material isolation, while graders, repositories, Environment controllers, and generators need executable Cordis lifecycles. Treating every Pack as a plugin couples content changes to package releases; treating every Pack as a mutable directory leaves no stable identity. Putting private answers beside Harness-visible package assets also defeats access isolation.

The target must remain a data agent rather than an evaluation-specific agent. Evaluation may observe, control an attempt lifecycle, and grade sealed evidence, but it may not insert hidden prompts, tools, retries, approvals, feedback, or stopping behavior while claiming production equivalence. Removing the Evaluation overlay must leave a complete, ordinary data-agent product.

## Proposal

Build a data-domain Evaluation Core for data engineering, data analysis, and data science. Data analysis is the first complete extension; the shared protocol does not contain SQL rows, a database brand, a concrete DataScope, or semantic-layer defaults. Product evaluation drives a frozen production DSH composition through the normal Agent and Session interfaces. Component evaluation remains available under a different subject identity and cannot support product-level claims.

### Ownership and interfaces

| Role | Owns | Does not own |
|---|---|---|
| Benchmark Pack | Case manifests, public task material, private-material references, policies, requirements, splits, provenance, aggregation | Agent execution, Provider selection, runtime defaults |
| Harness | The resolved production profile, preset, model interface, Agent interaction, tools, approvals, hooks, guards, workflow | Correctness policy, private grading material |
| Evaluation Environment | Requirement preflight, attempt lease, Provider-state observation, finality, separation, cleanup, assurance | Query/filesystem/workflow operations, DataScope, correctness |
| Context Projection | Production context selection, ranking, budgeting, serialization, provenance, projection evidence | Benchmark oracle, grading, Environment execution |
| Grading Runtime | Sealed-cut validation, private-material authorization, mechanism invocation, immutable Grade Records | Agent execution, Context retrieval, business Providers |
| Evaluation Controller | Run resolution, Attempt orchestration, sealing, grading invocation, cancellation, publication eligibility | Benchmark content, domain actions, storage implementations |

Each replaceable capability uses Cordis Definition / Provider / Consumer roles. Production Providers remain unaware of evaluation. The first release uses an external CLI/SDK Host and does not mount a permanent Evaluation Service or model-facing benchmark trigger in the ordinary data-agent composition.

### Benchmark and Context content

A canonical case is a shallow `CaseManifest` that explicitly references public material, private grading material, named policy profiles, Environment requirements, and Context requirements. Missing semantic fields do not inherit hidden defaults. Internal K11/RBI formats are migration inputs, not compatibility contracts.

A Benchmark Pack is a sealed, content-addressed data bundle, not intrinsically a Cordis plugin. A `BenchmarkRepository` capability resolves an explicit locator, validates the complete closure, seals it into an Artifact Store, and returns an exact digest. Executable grading mechanisms, importers, generators, validators, and Environment fixtures are optional companion plugins. Public npm packages may carry public Pack assets as a distribution adapter, but package version never replaces Pack content identity. Private grading material is reachable only from the grader-side service graph.

Context projection is a normal product capability. The production Agent and Product Evaluation use the same typed request-to-projection path. The projection records candidates, selected facts and relations, scores, provenance, budget, serialization identity, and model-visible digest. No-context, schema-only, relation, production, and oracle configurations are explicit variants; oracle or hidden-derived Context never enters a production headline.

### Evidence, measurement, and identity

The protocol separates product Session facts, evaluation records, and artifact bytes. `SessionStore` remains the authority for model-visible history. `EvaluationStore` owns Runs, Attempts, evidence manifests, grades, measurements, comparison plans, and publication eligibility. `ArtifactStore` owns immutable content-addressed bytes. External tables, jobs, services, and registries are Resources, not Artifacts; Provider receipts identify the observed snapshot and assurance.

Formal grading consumes a persisted, sealed, completeness-checked Evidence Cut. A Product subject references separate Session and Evaluation cuts; a Component subject uses its own cut without inventing a Session. Live scores are provisional. Rescoring creates a new immutable Grade Record and does not rerun the model or Environment. Cleanup failure preserves computed evidence and grades but may block finality, publication, or independent-trial eligibility.

One Evaluation Run owns one frozen resolved DSH root and contains one or more Attempt-scoped Agents. Attempts are serial by default until Providers prove per-attempt isolation. The Run Identity is an acyclic graph of content-addressed component identities for Benchmark, Harness, model/interface, DataScope, Environment, Context, grading, Observer, operation, and extensions. A materialized manifest is a deterministic export, not a second authority.

Cross-Run analysis requires a versioned Comparison Plan that declares treatment and controlled factors, matching units, estimand, inclusion policy, aggregation, and uncertainty. Evidence validity, metric semantics, analysis-unit compatibility, publication eligibility, hidden-material isolation, and case coverage form a non-waivable safety floor. Without a plan, only repeated observations under an identical Run Identity may be aggregated.

### Product fidelity

An Evaluation Observer is scope-local, effect-owned, and read-only. It may index immutable Session and capability facts, but it may not alter prompts, model requests, tool schemas, tool arguments, approval, retry, steering, stopping, or Provider behavior. Any such change is an Intervention with a different Harness identity. Observer failure makes evaluation evidence incomplete; it does not become a model failure.

Product Evaluation loads the production profile, bundle, preset, DataScope, Context Projection, and configured Providers, then creates the normal Agent through the public Agent/SDK entry point. The first release has one shared Evaluation Controller and a thin external CLI/SDK Host. The current in-process runner service, direct engine responder, duplicated adapters, and default bundle evaluation controls are removed at final cutover.

### Packages and migration

The first-release roles are separate packages for Protocol, Controller, Grading Runtime, Environment Definition, BenchmarkRepository Definition/local Provider, EvaluationStore Definition/local Provider, ArtifactStore Definition/local Provider, data-analysis extension, and CLI Host. Production Context Projection lives with data-agent capabilities. Packages are created only for real capability roles; a Definition package must own complete semantics, and a Provider package must hide substantial implementation complexity rather than merely re-export types.

Migration follows the reviewed stack: [T11](../../../../wayfinder/evaluation/tickets/T11-loader-provenance-strip.md) → [T1](../../../../wayfinder/evaluation/tickets/T1-exec-grader-impl.md) → [T13](../../../../wayfinder/evaluation/tickets/T13-context-projection-service.md) → [T9](../../../../wayfinder/evaluation/tickets/T9-evaluation-foundations.md) → [T14](../../../../wayfinder/evaluation/tickets/T14-data-analysis-extension-pack-migration.md) → [T15](../../../../wayfinder/evaluation/tickets/T15-evaluation-controller-cli.md) → [T12](../../../../wayfinder/evaluation/tickets/T12-eval-package-consolidation.md) → [R25](../../../../wayfinder/evaluation/tickets/R25-evaluation-rebaseline.md). Staging exists for review and attribution, not compatibility. Final cutover deletes old packages, exports, bundle rows, globs, defaults, and formats without shims.

### Relationship to active Agent Notes

The [execution grader seam](../../proposed/testing/2026-09-07-execution-grader-seam.md) and [query capability ownership](../../proposed/testing/2026-09-07-evaluation-query-capability-boundary.md) remain authoritative for execution normalization and SQL submission. The [dead eval-core runtime](../simplification/2026-09-03-delete-unused-eval-core-runtime-stack.md) and [dead NL2SQL eval subpackage](../simplification/2026-09-03-remove-nl2sql-engine-eval-subpackage.md) proposals retain independent deletion evidence, while this note owns their destination architecture. The old proposals to promote adapter forks into `dsh-eval-runner`, fold `compare.ts` into that runner, and preserve eval-cli repo-root discovery are rejected because the target removes those runtime and host ownerships rather than consolidating them in place.

## Alternatives considered

**Extend the current `eval-runner-service`.** This preserves existing consumers and wiring, but retains an evaluation-specific Agent substitute, duplicated Provider/Context glue, default product pollution, and a service-first lifecycle that the first release does not need.

**Merge all evaluation code into one `dsh-eval` package.** This reduces package count, but makes Benchmark Packs, SDK projections, private graders, stores, Providers, and the Controller share dependencies and release surfaces despite evolving and running independently.

**Make every Benchmark Pack an npm/Cordis plugin.** This provides installation and registration, but couples case changes to code releases and puts private data in the Harness-visible package tree. Static content gains no useful plugin lifecycle.

**Store only a live trace and score in memory.** This reduces latency, but cannot support crash-safe publication, offline rescore, complete coverage, durable identity, or separation between model failure and evidence failure.

**Run a simplified evaluation-only Agent.** Direct engine or responder paths are faster, but they do not measure production prompts, tools, approvals, hooks, guards, workflow, Session history, Context, or Provider composition.

**Perform one big-bang rewrite.** It avoids temporary old/new paths, but mixes execution semantics, product Context, package moves, case migration, product Harness behavior, and baseline changes into one result that cannot be attributed or reviewed locally.

## Acceptance criteria

- Product Evaluation runs a normal production composition with no evaluation-only model-visible behavior unless the intervention has a distinct Harness identity.
- Benchmark, Harness, Environment, Context Projection, Grading Runtime, Controller, stores, and domain extensions follow the ownership and dependency directions in this note.
- Canonical Packs and Evidence Cuts are sealed and content-addressed; private material is unreachable from the evaluated Harness.
- Formal Grade Records are derivable from persisted evidence, and publication eligibility distinguishes incomplete, unresolved, invalid, observational, and cleanup/separation failures from incorrect answers.
- Run Identity and Comparison Plans reject unplanned component drift and incompatible metrics, units, splits, or assurance.
- Data-analysis provides the first complete extension; data-engineering and data-science conformance fixtures prove that the shared protocol has no SQL or single-DataScope default.
- The final cutover removes the current duplicate runtimes, adapters, service host, default evaluation controls, legacy case discovery, and compatibility exports.
- The first new baseline is recorded as a new anchor and never presented as directly comparable to invalid historical percentages.

## Risks

The capability-oriented package graph adds package and schema overhead before delivering a new score. Each package must earn its split through replaceability, isolation, or independent evolution; shallow wrappers should be folded before implementation lands.

A production Context Projection seam changes normal Agent behavior if migration is not parity-tested. Product snapshots, model-visible hashes, token/latency measurements, and matched runs are required before Evaluation depends on it.

Content-addressed Packs, identities, and Evidence Cuts require canonical encodings, stable reads, closure validation, and garbage collection. A digest only proves the bytes it covers; external Resources still need Provider-specific snapshot and assurance receipts.

Observers, evidence writers, and artifact capture add overhead. Paired deterministic calibration must establish behavioral transparency, and performance reports must include Observer identity and cost.

The staged stack temporarily retains old code on development branches. No intermediate compatibility path becomes a released contract, and master must not keep two formal Evaluation runtimes after final cutover.
