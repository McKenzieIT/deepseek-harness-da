# V2 — eval run changeset 标注

**Type**: task (AFK)
**Phase**: post-G6
**Status**: open
**Assignee**: unclaimed
**Blocked by**: [Evaluation T13 — Production Context Projection capability](../../evaluation/tickets/T13-context-projection-service.md)、[Evaluation T9 — Evaluation protocol、stores 与 repository foundations](../../evaluation/tickets/T9-evaluation-foundations.md)
**Related**: G6（structured delta）、V1（audit delta）、[Evaluation G13](../../evaluation/tickets/G13-context-evaluation-protocol.md)

## Question

如何把语义定义 changeset、production Context identity 和受影响 evidence 关联到新 EvaluationStore 中的 Run/Attempt，而不继续扩展 legacy eval JSONL？

## Required scope

- 使用 V1 structured delta 记录定义变更，并关联稳定的 asset、scope、actor、version 和 timestamp。
- 使用 Evaluation T13 产出的 Context identity 与 projection evidence，记录一次 Attempt 实际观察到的定义和关系。
- 使用 Evaluation T9 的 EvaluationStore/ArtifactStore 保存 changeset 引用、sealed evidence 和 before/after comparison inputs。
- 区分“发生在两次 run 之间的变更”和“该 attempt 实际消费的变更”；不得仅凭时间窗口声明因果。
- evidence-query 或后继 UI 只读取 canonical store，不从文件数量或 legacy result directory 推断 changeset。

## Acceptance

- Canonical Run/Attempt 可查询关联的 changeset、Context identity 和 projection evidence。
- 缺失 identity、未 sealed evidence 或无法关联的变更明确为 unavailable/unverifiable。
- 不新增 legacy JSONL 字段作为目标格式，也不复制 EvaluationStore 的 retention 规则。
