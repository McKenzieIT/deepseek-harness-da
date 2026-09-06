# T5 — README 双语缺口（verify-translation-pairing gate 红）

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: 2026-09-06 T3 fix 发现（`verify-translation-pairing` 跑出 ~20+ packages README 缺 `docs/i18n/README.md` 双语对侧）

## Question

`verify-translation-pairing` 在 ~20+ packages 的 README 上红：`packages/client/result-cache/README.md`、`ui-present-decomposition/README.md`、`ui-present-table/README.md`、`ui-semantic-layer/README.md`、`ui-suggest-followups/README.md`、`packages/data/patrol-mode/README.md`、`data/preset-autojoin/README.md`、`data/result-cache-memory/README.md`、`data/scope-registry/README.md`、`data/tool-compute/README.md`、`data/tool-critique-sql/README.md`、`data/tool-evaluate-sql-quality/README.md`、`data/tool-present-decomposition/README.md`、`data/tool-present-table/README.md`、`data/tool-reachability-delta/README.md`、`data/tool-suggest-followups/README.md`、`data/tool-trigger-eval/README.md`、`eval/eval-cli/README.md`、`eval/eval-runner-service/README.md`、`goal/goal-eval-context/README.md`、`goal/goal-eval-policy/README.md`、`wayfinder/data-agent/research/exp2-arms/arm-a-baseline/README.md`、`wayfinder/task-orchestration-dag/prototype/README.md`——缺 `docs/i18n/README.md` 双语对侧（"in-scope documentation must merge bilingual (docs/i18n/README.md); add the counterpart and record the pair"）。

这是 pre-existing（并发 session 加 README 未带双语对侧）。block `verify-translation-pairing` gate。

**修法**：
- 为每个 in-scope README 加双语对侧（`docs/i18n/README.md` 的对应条目）+ record the pair（`verify-translation-pairing --write`）。
- OR——若某些 README 不该 bilingual（如 wayfinder 的实验/prototype README），从 in-scope 清单排除。

## Scope

列全 in-scope README 缺双语对侧的清单，加对侧 OR 排除，re-record pairing，验 `verify-translation-pairing` gate 过。**需翻译输入（ZH）——非 agent-doable**。
