# G9 — Failure normalization 与 attribution

**Type**: grilling  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [R9 — Multi-engine execution failure taxonomy](R9-error-taxonomy-papers.md)、[T1 — Execution grader implementation](T1-exec-grader-impl.md)
**Blocks**: [T8 — Failure normalization implementation](T8-failure-classifier-impl.md)
**Mode**: HITL
**Branch**: `grilling/G9-failure-classifier`

## Question

Provider-specific outcomes、engine/agent execution failures 与 Benchmark verdict 应如何通过显式 adapter 映射为可扩展、可审计的 normalized execution facts，使 infrastructure、timeout、permission、pending/unresolved、model SQL error、case defect 与 grader failure 不再依赖语言/字符串匹配或被压成一个 `wrong`？

## Must decide

- Canonical core discriminants and namespaced provider extension payloads.
- Ownership of Provider → normalized execution mapping and normalized facts → Benchmark verdict mapping.
- Required evidence, unknown/unsupported handling and fail-loud policy.
- Relationship to G1 outcome classes、Environment assurance/finality and T1 ExecutionArtifact.
- Package location and dependency direction under G10 package topology.

## Out of scope

- Implementing engine-specific adapters ([T8](T8-failure-classifier-impl.md)).
- Comparator defaults or event-case correctness policy.
