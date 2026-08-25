# M5-generation-sql-candidate-from-toolcall — GENERATION retry「phase 最终文本无 SQL 候选」（LLM 把 SQL 放 tool call 不放文本）

**Type**: grilling（planning；extractSqlCandidate 数据源决策待 grilled）
**Phase**: misc（GENERATION gate 效率）
**Assignee**: 未认领（新 session 修复）
**Status**: Open
**Surfaced by**: M4 验证 session-f7c5795d（2026-08-25 web，game_xxx_wrong patch）—— GENERATION 阶段 critique_sql_tool ×5 + generation retry ×4 才 advance 到 EXECUTION。
**Scope**: GENERATION gate 的 SQL 候选提取——只看 phase_output 文本，不看 critique_sql_tool 的 arguments/sql 产出。
**Question**: extractSqlCandidate 应否也接受 critique_sql_tool 产出的 SQL（s.last_sql）作为 GENERATION 通过候选，避免 LLM 必须在 phase_output 文本重复 SQL？

## Evidence（session-f7c5795d verbatim）

GENERATION 阶段（[371] advance → generation 后）：

- [289] critique_sql_tool（arguments.sql = `SELECT ds, SUM(CASE WHEN act=1...)`）
- [291] evaluate_sql_quality
- [613] inject: `[phase generation retry] gate failed: phase 最终文本无 SQL 候选. Revise per the phase instructions and try again.`
- [520][522] critique + evaluate（重试）
- [903] retry: `phase 最终文本无 SQL 候选`
- [1105] retry: `critique not run (critique_sql_tool missing)`
- [1207][1209] critique + evaluate
- [1249] retry: `phase 最终文本无 SQL 候选`
- [1416][1418] critique + evaluate
- [1513] `[phase advance → execution]`（终于 SQL 进了 phase_output 文本）

**根因**：LLM 调 critique_sql_tool，SQL 在 `arguments.sql`（且 M3#2 fix 把 critiqued SQL 存到 `s.last_sql`），但 `generationGate` 的 `extractSqlCandidate(s.phase_output)` **只看 phase_output 文本**，不看 tool call arguments / s.last_sql → 判「无 SQL 候选」→ retry。LLM 反复把 SQL 放 tool call 不放文本，retry 4 次 + critique 5 次才在文本写了 SQL。

**后果**：GENERATION 阶段冗余 4 轮（token + latency 浪费）。最终 work（LLM 终于在文本写 SQL），但效率差 + 对弱模型可能永不收敛。

## Open decisions（grilling 候选）

1. **extractSqlCandidate 也读 s.last_sql**：critique_sql_tool 产出 SQL 后，generationGate 若 phase_output 无 SQL 候选，fallback 用 s.last_sql（critique 过的 SQL）作候选 → 通过。零额外 LLM 行为依赖。
2. **persona 教**：GENERATION persona 强调「最终文本必须含 ```sql block，不能只调 critique」——prompt-only，LLM 仍可跳过。
3. **phase-gate 强制**：critique 已跑 + s.last_sql 有值但 phase_output 无 SQL → gate 注入 s.last_sql 作 phase_output（程序化补全）。
4. **别的**：extractSqlCandidate 升级看 tool/call events（更通用但跨 event 解析复杂）。

## 关联

- [M3-self-evolution-blockers](M3-self-evolution-blockers.md)（#2 critique_sql_tool 产出 sql 存 s.last_sql——M5 可复用此数据源）
- [M4-update-table-config-persistence](M4-update-table-config-persistence.md)（验证时 surfac 此问题）
- [map](../../map.md) Not yet specified
