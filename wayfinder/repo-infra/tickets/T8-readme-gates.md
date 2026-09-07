# T8 — package-README content gates 红（model-experience + limitations）

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: PR #44 CI `node 24 / static`（job 101598597553，run 34074751506，2026-09-07 02:00）。pre-existing（latent，非 W20）。**verify on current master cf813c18c0 before fixing。**

## Question

两个 package-README gate 红：

- **verify-package-readme-model-experience**：~30 packages 违规——缺 README / 缺 `## Model Experience` / `## Model Experience` 非 final H2 / model-context entry 缺 3 个 ordered H4（`#### What the model sees`、`#### Token effect`、`#### KV Cache effect`）。涉及 `packages/client/ui-context-layer`、`ui-present-decomposition`、`ui-semantic-layer`、`ui-suggest-followups`、`packages/data/admin`、`evidence-query`、`management-session`、`preset-autojoin`、`result-cache`、`result-cache-memory`、`schema-gateway`、`scope-registry`、`tool-compute`、`tool-discover-alt-labels`、`tool-discover-relations`、`tool-edit-definition`、`tool-evaluate-sql-quality`、`tool-get-coverage`、`tool-get-definition`、`tool-list-domains`、`tool-present-clarification`、`tool-present-decomposition`、`tool-present-table`、`tool-resolve-term`、`tool-revert-edit`、`tool-scope-routing`、`tool-search-schema`、`tool-suggest-followups`、`tool-update-table-config`、`packages/eval/eval-cli`、`eval-runner`、`eval`、`retrieval-experiment`、`packages/code-runtime/code-runtime-data-python` 等。
- **verify-package-readme-limitations**：4 packages 缺 `## Known Limitations and Deferred Work`：`ui-present-decomposition`、`preset-autojoin`、`tool-compute`、`eval-cli`（加该节 OR 入 `NO_LIMITATIONS` 清单 in `scripts/verify-package-readme-limitations.ts`）。

非 W20 引入。latent on master。

## Scope

为每个违规 package README 补 `## Model Experience`（含 3 H4 字段）/ `## Known Limitations and Deferred Work` 节（或加 `NO_LIMITATIONS`），验两 gate 绿。CI log: job 101598597553（grep `verify-package-readme-model-experience` / `verify-package-readme-limitations`）。先 verify on current master。与 [T5](T5-readme-bilingual-gaps.md)（README 双语缺口）同属 README-gate 族，但 gate/requirement 不同——保持独立。
