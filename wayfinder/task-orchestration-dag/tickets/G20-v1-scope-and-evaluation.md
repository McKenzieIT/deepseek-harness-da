# G20 — First-release scope, compatibility, and evaluation

**Type**: grilling
**Status**: open
**Blocked by**: [G15 Current client placement](G15-current-client-placement.md), [G16 Model tools and preset composition](G16-todo-coexistence-and-preset-composition.md), [G17 Executor adapters](G17-native-source-adapters.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md), [G4 Animation and edge design](G4-animation-and-edge-design.md), [G11 DAG view simplification strategies](G11-dag-view-simplification-strategies.md)
**Blocks**: [G21 Advanced verification and evidence providers](G21-advanced-verification-and-evidence.md), [G22 Cross-session and multi-agent scheduling](G22-cross-session-multi-agent-scheduling.md), [G23 Automatic recovery and external-effect reconciliation](G23-recovery-and-external-effect-reconciliation.md), [G24 Advanced routing, parallelism, and optimization](G24-advanced-routing-and-parallelism.md), [G25 Data-agent phase-gate integration](G25-phase-gate-integration.md), [G26 Goal and Plan DAG relationship](G26-goal-plan-dag-relationship.md), [G27 Execution Ledger extraction threshold](G27-execution-ledger-extraction.md), [G28 History, trace, and plan inspection](G28-history-trace-and-plan-inspection.md), [G29 Typed task dataflow ports](G29-typed-dataflow-ports.md), [G30 Conditional branches and richer plan relations](G30-conditional-branches-and-plan-relations.md), [G31 Run Controller extraction threshold](G31-run-controller-extraction.md)

## Question

What is the smallest community-installable first release that proves a writable Plan DAG improves data-agent reliability and understandability without owning upstream executor internals?

Lock limits, supported executors, resume policy, UI, compatibility range, installation and removal, and optional-adapter fallback. Every excluded full-version capability must link an existing follow-up or create a new one before this ticket resolves.

Define unit, integration, keyless snapshot, SDK, replay/resume, browser, HMR, real-model, and eval coverage. Measure plan validity, dependency violations prevented, verified completion, replans, failure cascade, recovery, user comprehension, token/cost, latency, and upstream upgrade effort. Every model eval follows repository experiment-recording policy.
