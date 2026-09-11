# T12 — Final Evaluation package graph 与 legacy cutover

**Type**: task（impl，AFK）  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [T1 — Execution grader implementation](T1-exec-grader-impl.md)、[T15 — Product Evaluation Controller 与 external CLI](T15-evaluation-controller-cli.md)
**Blocks**: [R25 — New Evaluation stack baseline re-anchor](R25-evaluation-rebaseline.md)
**Mode**: AFK（后端方向，本地直接做；按 [playbook](../playbook.md) §1.1）
**Branch**: `task/T12-evaluation-package-cutover`
**Supersedes**: 本票原“eval-runner 并回 dsh-eval”题面；G10 D20–D25 已否定单一 `dsh-eval` monolith 与首版 Cordis Service Host
**Evidence**: [R24 — eval 包级合并可行性](../research/eval-package-consolidation.md)、[DSH/Cordis 集成约束](../research/dsh-evaluation-integration-constraints.md)、[Benchmark Pack 拓扑](../research/benchmark-pack-topology-options.md)

## Question

在 [T15](T15-evaluation-controller-cli.md) 已证明新 Product Evaluation path 后，如何把仓库切到最终 capability-oriented package graph，迁移所有外部 consumers，并删除 current `dsh-eval`/`dsh-eval-runner`/`dsh-eval-runner-service`/`dsh-eval-cli` 的旧 runtime、exports、bundle rows、case discovery 和 eval-only product hooks，使 master 只保留一条正式 Evaluation 路径？

## Target package roles

- Evaluation Protocol、Controller、Grading Runtime、Environment Definition。
- BenchmarkRepository Definition/local Provider。
- EvaluationStore Definition/local Provider。
- ArtifactStore Definition/local Provider。
- Data-analysis extension 与 external CLI Host。
- Production Context Projection packages live with data-agent capabilities, not under an eval-private implementation.

Final names may differ only when the same ownership and dependency directions remain mechanically enforced.

## Required consumer migration

- `packages/data/tool-trigger-eval`、`packages/goal/goal-eval-policy`、`packages/goal/goal-eval-context`、`packages/data/patrol-mode`。
- `python/sdk-runtime`、TypeScript/Python SDK projections where the new public protocol requires them。
- `scripts/live-verify-w1-w5.ts` and any examples/snapshots importing old packages or paths。
- `tsconfig.base.json` paths、project references、`knip.json`、`tsdown.config.ts`、workspace/package constraints、bundle manifests and generated catalogs。

## Success criteria

- Old duplicate runners、persistence、health gates、CLI/service adapter forks、K11 caseDir/glob/defaults and direct engine responder paths are deleted, not retained behind compatibility shims.
- Current `eval-runner-service` and eval control rows are removed from the default data-agent bundle; the first release has no always-mounted `ctx.evalRunner` or model-facing benchmark trigger.
- Every surviving consumer imports the owning Definition/Protocol package and uses the unique Controller/CLI path; consumer-owned duck-typed service declarations disappear.
- Normal data-agent product tests prove prompts、tools、phase behavior、Provider calls and session output are unchanged when Evaluation is absent.
- Built package artifacts contain the intended runtime code and public assets only; private grading material is unreachable from the Harness graph.
- An executed static gate rejects a deliberate Harness import/re-export/deep-import of hidden tests、reference、solution、oracle artifacts or private scorer internals.
- Final package artifacts preserve Benchmark/Adapter/Harness provenance and content digests; old import paths are deleted rather than retained as compatibility shims.
- Source/artifact-plane checks、focused package tests、required snapshots、typecheck/build/hygiene and documentation gates pass.
- The final tree contains no old package exports, compatibility re-exports, obsolete config rows or undocumented temporary migration path.

## Out of scope

- Establishing the first new baseline ([R25](R25-evaluation-rebaseline.md)).
- Remote Benchmark/Artifact repositories or a permanent Evaluation Service Host.
- Dynamic/fresh lifecycle policy ([G15](G15-dynamic-evaluation-lifecycle.md)).
