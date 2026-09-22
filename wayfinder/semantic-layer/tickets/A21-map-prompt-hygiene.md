---
type: task
status: resolved
assignee: codex
blocked_by: []
---

# A21: 语义层地图与 session prompt 清理

## Question

按 R12 审计结论归档失效 session prompt，修正 map 与当前代码、ticket 状态和新 Evaluation 路线之间的漂移，并把 map 恢复为决策索引。

## Answer

Resolved on 2026-09-18.

- 25 份旧 session prompt 均通过 `git mv` 进入 `../archive/prompts/`；活动 `prompts/` 目录和语义层根目录不再保留这些入口。
- `da-compliance-audit-catalog.md` 没有明确的 active owner：最接近的 catalog effort [UM-CORDIS-REGEN](../../data-agent/tickets/phase-upstream-merge/UM-CORDIS-REGEN.md) 已 resolved，因此旧 prompt 直接归档，不创建无主目录或重复工作票。
- `test-isolation-flaky-fixes.md` 中仍成立的问题已拆给 Repo Infra 的 [T27 bash-local lifecycle race](../../repo-infra/tickets/T27-bash-local-lifecycle-test-race.md) 与 [T28 session-snapshot timeout diagnostic race](../../repo-infra/tickets/T28-session-snapshot-timeout-diagnostic-race.md)；失效的 change-scope 与旧 `acp-snapshot` 假设不再迁移。
- CB-1、CB-3 与 CL-23 标为 resolved；CB-2 标为 deferred；CB-5 迁到 [Repo Infra T29](../../repo-infra/tickets/T29-da-ci-upstream-boundary.md)。
- CL-21 退役并拆分：retrieval corpus 归 [CL-31](CL31-retrieval-corpus-scope-and-trimming.md)，concept formula 归 [CL-32](CL32-concept-formula-production-grounding.md)，benchmark migration 归 [Evaluation T14](../../evaluation/tickets/T14-data-analysis-extension-pack-migration.md)。
- CL-24、CL-25、CL-27、CL-29 已迁到各自 Evaluation owner；R11 被 production Context Projection 与 attribution 路线取代。
- CL-26 改为统一 decline evidence 与用户可见 synthesis 决策票，并以 [Evaluation T12 cutover](../../evaluation/tickets/T12-eval-package-consolidation.md) 为前置；CL-28 标为 superseded，不实施旧入口补丁。
- V2 保持 open，并由 Evaluation T13/T9 阻塞；V3 保持 open，并由 V2、Evaluation G14/R25 阻塞。
- map 只保留 closed decision 的一行 gist、未成票的 fog 和 scope boundary；删除 open-ticket 状态镜像、重复 T1、已回答的 `executionMatch`/pass^k fog 和实验/postmortem 记录。
- map 已纠正 scope/namespace、event/table/concept、虚拟 metric、lineage、SchemaProvider、W13、G7/T13 和 R10 prompt-caching 的当前事实，并保留 R12 ticket 与报告指针。

W18、W19、W23 和 `packages/**` 不属于本工作单元，未由 A21 修改。
