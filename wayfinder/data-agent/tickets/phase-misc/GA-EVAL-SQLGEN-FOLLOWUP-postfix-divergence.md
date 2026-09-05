# GA-EVAL-SQLGEN-FOLLOWUP — investigate post-prompt-fix pass-rate divergence + decide follow-up (eventDef pre-fetch)

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-EVAL-SQLGEN-PROMPT-FIX](GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md) Resolution（2026-09-05，prompt fix 落地后 re-baseline 出现分歧：judge-only 回升 48.7→56.4，real-exec 反降 12.8→7.7）
**Blocked by**: 无
**Blocks**: 无（但 grill 决定方向后可能开 eventDef pre-fetch impl 票 / prompt 修订票）

---

## Question

[GA-EVAL-SQLGEN-PROMPT-FIX](GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md) 的 prompt fix（`contextPrefetched` flag）消除了非 SQL 工具调用发射（criterion #1 达标，两模式 0%），但 re-baseline 出现**分歧**：judge-only **回升 48.7%→56.4%**（criterion #2 达标），real-exec **反降 12.8%→7.7%**（criterion #2 未达标，假设证伪）。本票调查分歧根因 + 决定 follow-up 方向：

1. **分歧根因确认**：分歧是否=judge-leniency 机制（fix 让模型生成更多 SQL → judge 放过更多语义合理但执行值错的 SQL → judge-only 升；real-exec 仍 fail on wrong values）？还是另有原因（engine-mode prompt 本身改变了 SQL gen 质量、self-correction 行为变化、或纯 pass^k 噪声）？
2. **2 个回归 case（041/046）深查**：pre-fix 通过、post-fix fail——是 engine-mode prompt 改动致 SQL gen 退化，还是 n=39 pass^k 噪声（MDE~20pp）？
3. **eventDef 未 pre-fetch 的影响**：engine responder（`Nl2sqlAgentResponder.respond()`，`packages/eval/eval-cli/src/context.ts`）调 `engine.run({ question, scopeId, today })` **不传 `eventDef`** → prompt `# 事件定义` 渲染「未加载」→ 模型缺 event schema → event case（119-138）生成错表/占位符 SQL → real-exec fail。这是 real-exec 低主因吗？pre-fetch eventDef 能修多少？
4. **engine-mode prompt 误导 gap**：`# 上下文` preamble 说 "candidates + event definitions are pre-fetched into context"，但 eventDef 实际未加载（rendered 「未加载」）——**可能误导**模型（说 pre-fetched 但实际未加载）。这是 (b) 修订 prompt 的线索。
5. **follow-up 方向决定**：(a) pre-fetch eventDef in engine responder（impl 票，真修 real-exec 瓶颈）；(b) 修订 engine-mode prompt（# 上下文 preamble 改 "if loaded" + 可能补 eventDef 加载提示）；(c) 接受 mixed result（fix 达成直接目标 criterion #1，real-exec 瓶颈是独立 concern，另票或挂起）。
6. **feedback-wiring gap**（code review nit 2）：engine.ts `run()` 在 critic_fail/execution-error 时 retry，传 `feedback: lastFeedback` 给 `llm.generate()`，但 `CtxLlmAdapter.generate`（context.ts）**忽略 `args.feedback`**（只用 `args.prompt`）-> self-correction 反馈未到 LLM prompt -> retry 用同一 prompt + near-dup gate -> 耗尽 -> null-SQL。这解释了 null-SQL case（real-exec 23 / judge-only 22）。是否贡献 real-exec drop？应否 wire feedback to prompt（另 impl）？

## 背景（why，from GA-EVAL-SQLGEN-PROMPT-FIX 2026-09-05）

- [GA-EVAL-SQLGEN-PROMPT-FIX](GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md) Resolution：prompt fix（`contextPrefetched` flag，additive，harness 不受影响）落地 + re-baseline 双模式。
- **结果**（audit-log 2026-09-05）：非 SQL 发射两模式均 0%（criterion #1 达标）；pass_rate 分歧——judge-only 48.7→56.4（+3 case，含 119/128/138 event case——judge 放过更多语义合理 SQL），real-exec 12.8→7.7（-2 case 041/046 回归，0 新增——19 个 tool-call→SQL 转换 attempt 全产 wrong/null SQL）。
- **初步分析**（audit-log）：分歧=judge-leniency 机制印证（GA-EVAL-REAL-EXEC 的 73.7% false-pass 教训）；real-exec 瓶颈=SQL 正确性/错值（event case 模型不知 event 表名 `ieu_ods.ods_10000251_all_view` 生成错表/占位符；engine responder 不 pre-fetch eventDef）。两变化在 n=39 噪声内（MDE~20pp）但定性模式（judge-only 升/real-exec 降/非 SQL 0%）明确。
- **关键 gap**：engine-mode prompt 的 # 上下文 preamble 说 "event definitions are pre-fetched into context"，但 eventDef 实际未加载（`Nl2sqlAgentResponder.respond()` → `engine.run({question, scopeId, today})` 不传 eventDef → prompt 渲染「未加载」）——**可能误导**。这是 (b) 修订 prompt 的线索，也是 (a) pre-fetch eventDef 的动机。

## 工作清单

- [ ] 调查分歧根因：对比 pre/post（`rebaseline-real-exec-rbi-10000251.json` vs `-postpromptfix.json` + judge-only 同）的 per-case verdict + generated_sql，确认分歧=judge-leniency（judge 放过更多语义合理 SQL）还是 engine-mode prompt 致 SQL gen 退化。
- [ ] 深查 041/046 回归：pre-fix 通过的 SQL vs post-fix fail 的 SQL——差异来自 prompt 改动（engine-mode prompt 改变了这俩 case 的 SQL gen）还是 pass^k 噪声？
- [ ] 确认 eventDef 未 pre-fetch 的影响：event case（119-138）的 generated_sql 是否普遍缺 event 表名/用占位符（如 `<数据视图>`）？pre-fetch eventDef 能修多少 case？
- [ ] 评估 (a) eventDef pre-fetch 的可行性：engine responder 如何 load event definitions（semantic layer 的 event schema？按 question 检测 event-based intent + load 对应 eventDef？需新 infra？）+ 估工。
- [ ] grill follow-up 方向：(a) eventDef pre-fetch impl vs (b) prompt 修订（# 上下文 preamble "if loaded"）vs (c) 接受——决定优先级。
- [ ] 如选 (a)：开 impl 票（engine responder pre-fetch eventDef via semantic layer + pass to `engine.run`）。
- [ ] 如选 (b)：开 impl 票（修订 engine-mode prompt 的 # 上下文 preamble）。
- [ ] 记录（audit-log + map frontier）。

- [ ] 深查 feedback-wiring gap：`CtxLlmAdapter.generate` 忽略 `args.feedback` -> self-correction 反馈未到 LLM -> null-SQL。是否贡献 real-exec drop？应否 wire feedback to prompt？

## 成功标准

1. 分歧根因确认（judge-leniency vs prompt 退化 vs 噪声）——有 per-case 证据。
2. follow-up 方向决定（a/b/c）+ 开对应 impl 票（如 a/b）。
3. 记录（audit-log + map frontier）。

## 备注

- 与 [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) 独立（本票是 prompt/engine 维度，EXPAND 是 case-set 维度）。
- n=39 噪声大（MDE~20pp）——分歧的统计显著性有限，但定性模式（judge-only 升/real-exec 降/非 SQL 0%）是 judge-leniency 机制的强证据。
- 若选 (a) eventDef pre-fetch：需评估 engine responder 如何 load event definitions——`Nl2sqlAgentResponder.respond()` 当前只做 BM25 linking（candidates），不 load eventDef。semantic layer（`ctx.schema`）是否有 event definition API？按 question 检测 event-based intent（game.role.create 等）+ load 对应 eventDef？可能需新 infra 或复用 harness agent 的 `load_event_definition` 工具逻辑。
- 若选 (b) prompt 修订：最小改——`# 上下文` preamble 的 "event definitions are pre-fetched into context" 改 "event definitions IF loaded (below # 事件定义)"，避免误导。但 (b) 不修 real-exec 瓶颈（eventDef 仍未加载）——只修误导，real-exec 仍低。
- (a) 是真修 real-exec 瓶颈的方向（pre-fetch eventDef → 模型有 event schema → 生成正确 SQL）。(b) 是 prompt 诚实性修补。(c) 是接受现状（criterion #1 达标，real-exec 瓶颈另票）。
