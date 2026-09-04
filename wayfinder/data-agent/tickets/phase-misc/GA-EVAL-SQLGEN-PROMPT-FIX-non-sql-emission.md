# GA-EVAL-SQLGEN-PROMPT-FIX — engine-responder SQL-gen prompt tool-catalog leakage (34% non-SQL emissions)

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-EVAL-REAL-EXEC](GA-EVAL-REAL-EXEC-real-execution-baseline.md) Resolution（2026-09-04，real-exec baseline 跑出 12.8% 后，根因调查发现 34% 非 SQL 发射来自 prompt 漏给 LLM 工具目录）
**Blocked by**: 无
**Blocks**: 无（但修完会触发 real-exec re-baseline）

---

## Question

engine responder（`--responder engine`）的 SQL-gen prompt（`packages/data/nl2sql-engine/src/prompt.ts`）显式描述了 `search_data_sources` + `load_event_definition` 作为**可调用工具**，但 engine responder 是 **pre-fetch** 这些（BM25 retrieval + schema layer），**并不把它们暴露为 callable 给 LLM**。模型（qwen3.7-max）看到 prompt 里的工具描述，~34% 时 emit 工具调用格式（`call:default_api:load_event_definition{...}`、`<tool>search_data_sources("...")</tool>`、`{"name":"load_event_definition","arguments":{...}}`）期望被调用，而非直接生成 SQL。

**是否修 prompt.ts**：在 engine responder 模式下，SQL-gen prompt 不应把 `search_data_sources`/`load_event_definition` 描述为 invocable（或明确说它们已 pre-fetch、LLM 应直接用上下文里的候选 + 事件定义生成 SQL），消除 34% 非 SQL 发射，然后 **re-baseline real-exec**。

## 背景（why，from GA-EVAL-REAL-EXEC 2026-09-04）

- [GA-EVAL-REAL-EXEC](GA-EVAL-REAL-EXEC-real-execution-baseline.md) 跑出 **real-exec pass_rate = 12.8% (5/39)** on RBI 39 EXEC cases。低绝对值部分来自 34% 非 SQL 发射（~40/117 attempt emit 工具调用格式而非 SQL）。
- **根因确认**（不是模型固有倾向）：`packages/data/nl2sql-engine/src/prompt.ts`:
  - line 89: `- search_data_sources(query): BM25 schema-linking 检索返候选数据源（P13b bm25-linking；production 经 P5 ctx.retrieval seam）`
  - line 90: `- load_event_definition(event_name): 加载事件定义（params_fields/metrics/external_refs）；SQL FROM/WHERE event/字段来自此返回不得硬编码（P6 ctx.schema）`
  - line 119: `- 字段清单校验：SQL 每个字段名（尤其 params 内）须在 load_event_definition 返回的 params_fields/metrics 有定义，不得硬编码`
  - line 150: `# 检索候选（search_data_sources BM25-only）`
  - line 153: `# 事件定义（load_event_definition）`
- **关键**：这些工具描述是给 **harness agent**（`--responder harness`，full agent 用 `ctx.tools` 调 search_data_sources/load_event_definition）看的。engine responder 不走 agent tool loop——它 pre-fetch 候选 + 事件定义，直接把上下文塞进 SQL-gen prompt。但 prompt 仍告诉 LLM 这些工具"可调用"→ LLM 有时 emit 工具调用而非 SQL。
- **影响**：34% 非 SQL attempt fail execution_match（非 SQL → executor `ok=false`）AND judge 打低分 → 两判都 fail。**不计入 judge false-pass gap**（gap 是纯 wrong-VALUE case，干净）。但 **拉低 real-exec pass_rate**——修 prompt 后多数 34% 会变有效 SQL，real-exec pass_rate 会明显回升。
- GA-EVAL-REAL-EXEC 的 judge false-pass gap = 35.9pp（14/39）**不受此 prompt bug 影响**（non-SQL case 两判都 fail，不进 gap）——所以 GA-EVAL-REAL-EXEC 的 gap 数字有效，但 real-exec 绝对值 12.8% 被 prompt bug 拖低。

## 工作清单

- [ ] 定位 prompt.ts 的工具描述段（line 89-90, 119, 150-153）+ 确认 engine responder 的 SQL-gen prompt 路径（`Nl2sqlEngine` 的 promptBuilder，context.ts:377-385）。
- [ ] 改 prompt：engine responder 模式下，不把 `search_data_sources`/`load_event_definition` 描述为 invocable；改为"候选 + 事件定义已 pre-fetch 进上下文，直接用它们生成 SQL"。注意 **additive**——harness agent 模式（`--responder harness`）仍需工具描述（它真调这些工具），所以改动要么 (a) prompt 分 engine/harness 两版，要么 (b) 加一个"工具已 pre-fetch"的 conditional 段。别破坏 harness responder。
- [ ] 跑 1-case smoke（case 037）确认 SQL-gen 仍正常（不退化）+ 非 SQL 发射率降。
- [ ] re-baseline real-exec：同 GA-EVAL-REAL-EXEC 命令（`--cases packages/eval/eval/cases/rbi-10000251-exec --with-query --sidecar maxc-sidecar-k11.mjs --today 20260806 --scope-id 10000251 --pass-k 3 --concurrency 3 --run-id rebaseline-real-exec-rbi-10000251-postpromptfix`），对比 12.8% 看回升多少。
- [ ] append audit-log（prompt-fix + re-baseline，带 config + 对比 12.8%）。
- [ ] 更新 README baseline 表（加 post-prompt-fix real-exec 行，对比 12.8%）。
- [ ] 本票 checklist + Resolution；map.md frontier。

## 成功标准

1. prompt.ts 改完，engine responder 的非 SQL 发射率从 34% 显著降（目标 <10%）。
2. real-exec re-baseline pass_rate > 12.8%（回升），带 config（with_query=true）。
3. harness responder 不受影响（它的工具描述保留）。

## 备注

- **不修 code 不能 re-baseline**——本票涉及 `prompt.ts` code change（与 GA-EVAL-REAL-EXEC "本票不涉及 code" 不同，本票就是改 code）。
- 改动 additive：别删 harness agent 需要的工具描述；engine/harness prompt 分版或 conditional。
- 非 SQL 发射集中在 119-138 事件类 case（问 game.role.create / game.item.change / game.coin.change 等 event）——这些 case 的 expected 用 `load_event_definition` 派生，prompt 提该工具最易触发 emit。
- 与 [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) 独立——EXPAND 是 k11-v2 expected.sql 派生（case set 维度），本票是 prompt 维度。二者正交，可并行。
- 修复后若 real-exec pass_rate 回升到接近 judge ceiling（48.7%），则 judge false-pass gap 会缩小——说明 34% 非 SQL 是 real-exec 低主因之一。
