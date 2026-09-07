# T5 — README 双语缺口（verify-translation-pairing gate 红）

**Type**: task
**Phase**: post-discovery
**Status**: closed (resolved 2026-09-07 via sessions 2-6: PR #100/#102/#104/#106/#108; corpus green)
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

## Findings（2026-09-07 T2 session 验证）

- `verify-translation-pairing` gate 实际报 **~56 个 in-scope 文件**缺双语对侧（非票面 ~20+）：含 `packages/*/README.md`、`.agents/notes/**`（implemented + proposed）、`docs/*`（da-architecture 等）、`wayfinder/*` README。仍是 HITL（真实 ZH 翻译，非 mechanical——这些是 prose 文档）。

## Resolution（2026-09-07 — corpus green via sessions 2-6）

- 全部 ~56 in-scope 文件已配对双语：sessions 2-6 译完（PR #100 session2 / #102 session3 / #104 session4 / #106 session5 / #108 session6）。
- `verify-translation-pairing` corpus 全配对一致（1069 pairs，0 missing，0 OOS，exit 0）→ gate 绿。本票（T5 = README 双语缺口）即 GA-FORK-CI translation-pairing debt 的 repo-infra 视角，随该债务清零而 resolved。
- 详见 data-agent map § GA-FORK-CI + `.tmp/audit/fix-translation-session6-status.md`。
