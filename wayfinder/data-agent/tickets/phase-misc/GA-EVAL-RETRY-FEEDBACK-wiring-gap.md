# GA-EVAL-RETRY-FEEDBACK — wire engine.run retry feedback into SQL-gen prompt

**Type**: task  ·  **Phase**: misc  ·  **Status**: resolved (2026-09-06)
**Source**: [GA-EVAL-SQLGEN-FOLLOWUP](GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md) Resolution（2026-09-06，code review nit 2 确认为 real-exec drop 机制：retry 不用 feedback→drift→anti-flakiness all-must-pass flip）
**Blocked by**: 无（FOLLOWUP 已 resolved）
**Blocks**: 无（与 [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) 互补——(d) 让 retry 一致，(a) 给 event schema；二者可并行）

---

## Question

`packages/data/nl2sql-engine/src/engine.ts` `run()` 在 critic_fail / execution-error / near-dup 时 retry，传 `feedback: lastFeedback` 给 `llm.generate({ question, attempt, feedback, prompt })`——但 `packages/eval/eval-cli/src/context.ts` `CtxLlmAdapter.generate(args)` **忽略 `args.feedback`**（只用 `args.prompt`）→ self-correction 反馈（critic reason / execution error / near-dup）未到 LLM prompt → retry 用同一 prompt（`promptBuilder` 重建 identical——feedback 不进 `BuildPromptArgs`）→ 模型 re-generate near-dup SQL → `NearDupGate` 拒 → 耗尽 → null-SQL；或 stochastic drift 到更差 SQL（046 att3 加 `ROUND`→值错；041 att1 decline）。

GA-EVAL-SQLGEN-FOLLOWUP per-case：null-SQL 爆炸（real-exec 11→23, judge-only 10→22）+ 041/046 retry drift = 此 gap 直接后果。verdict=anti-flakiness all-must-pass（[GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) 故意决策，`runner.js:297-309` `passKVerdict`=every）→ 单个 bad retry flip 全 case → feedback gap 放大 real-exec drop。

**修**：wire `args.feedback` 进 SQL-gen prompt——让 retry 看到上次失败原因 → 真 self-correct → 减少 null-SQL + drift。

## 背景（why，from GA-EVAL-SQLGEN-FOLLOWUP 2026-09-06 per-case + code review nit 2）

- 046 post-fix：att1/att2 正确（em=true，qr=67.81415=exp），att3 加 `ROUND(AVG(act_dur)/60.0, 2)`→67.81≠67.814→em=false→case flip wrong（anti-flakiness all-must-pass）。pre-fix att3 不 round。若 retry 能用 feedback（att1/2 成功模式或 critic 反馈），att3 不 drift。
- 041 post-fix：att2 = pre-fix 同款正确 SQL（`SUM(pay_fst)`, qr=58=exp, em=true），att1 DECLINE（非 SQL "路径走不通"——contextPrefetched §5 honest-decline framing），att3 错表（`selfhelp_new_pay_df`, qr=0）。all-must-pass flip wrong。
- null-SQL case（125/127/129/130 event case）：decline→retry identical prompt→null→exhaust→全 null-SQL（qr={}）。
- engine.ts `run()` loop（`while attempt <= MAX_FEEDBACK_RETRIES`）：`const gen = await this.llm.generate({ question, attempt, feedback: lastFeedback, prompt })`——feedback 已传，CtxLlmAdapter 没接。
- `prompt.ts BuildPromptArgs` 无 feedback field——promptBuilder per-attempt 重建 identical prompt。
- pre-existing bug（非 GA-EVAL-SQLGEN-PROMPT-FIX 引入——PROMPT-FIX 只改 prompt.ts catalog，未动 feedback path）；本票正式修。

## 工作清单

- [ ] **定方向**：(i) `BuildPromptArgs` 加 `feedback?: LlmFeedback` field + `buildPrompt` contextPrefetched branch render `# 上次失败反馈`（failureKind + error 摘要）当 feedback 非空 + `engine.run` 把 lastFeedback 传给 promptBuilder；或 (ii) `CtxLlmAdapter.generate` 拼 feedback 到 prompt（engine 不动）。**lean (i)**——feedback 属 prompt context，promptBuilder 渲染更可控 + 与 eventDef/joinConstraints 同 pattern（BuildPromptArgs 扩展）；(ii) 会绕过 promptBuilder 一致性。
- [ ] 实现 (i)：`BuildPromptArgs.feedback?: LlmFeedback` + `prompt.ts` 渲染（contextPrefetched + default branch 都加——default branch 也受益 if other consumers；但 harness 用 phase-gate 不走 buildPrompt，故只 engine path 实际受益，default branch 加为 byte-stability 保 additive）。
- [ ] `engine.ts run()`：`this.promptBuilder({ question, candidates, eventDef, conventions, phase, isTrend, today, ..., feedback: lastFeedback })`（加 feedback arg）。
- [ ] `CtxLlmAdapter.generate`：保持用 `args.prompt`（promptBuilder 已含 feedback）——可删 `args.feedback` 传递（避免误导 future reader），或留 doc 说明 promptBuilder 已处理。确认 generate 仍 only 读 args.prompt。
- [ ] `LlmFeedback` shape 确认：`{ failureKind: 'critic_fail'|'near_dup'|<execution failureKind>, error: string }`（`engine.ts` import from `./replay-llm.ts`；`RECOVERABLE_FAILURES`/`UNRECOVERABLE_FAILURES`）。prompt 渲染 failureKind + error 摘要（截断 + sanitize，mirror tool-load-event-definition 的 sanitizeSubstrateError）。
- [ ] 测试：`prompt.spec.ts` 加 feedback-rendering snapshot（feedback 非空时 # 上次失败反馈 出现）；`engine scenarios.spec.ts` 加 retry-uses-feedback case（mock llm 首次返错 SQL+critic fail→二次见 feedback→返对 SQL，nearDup 不拒因 SQL 不同）。
- [ ] smoke + re-baseline 双模式（39 EXEC, pass^k, conc=3, --today 20260806）对比 7.7%/56.4%——null-SQL 应降 + 041/046 应稳（不 drift flip）。
- [ ] append audit-log + README baseline 表（加 post-feedback-wire 行）。

## 成功标准

1. null-SQL attempt 数显著降（real-exec 23→target <12, judge-only 22→<12）。
2. real-exec pass_rate > 7.7%（回升——041/046 不再 drift flip；anti-flakiness 一致性升）。
3. retry 真 self-correct：scenario test 证 feedback 到 LLM prompt（非 identical prompt——prompt 含 # 上次失败反馈）。
4. additive——harness responder（phase-gate）不受影响；default buildPrompt byte-stability 保（feedback field optional，无 feedback 时 byte-identical）。

## 备注

- 与 [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) 正交互补：(d) 修 retry 一致性（null-SQL/drift），(a) 修 event schema（错表/placeholder）。二者可并行；(a) 给对 schema 后，(d) 保 retry 一致——组合最大收益。
- pre-existing bug（GA-EVAL-SQLGEN-PROMPT-FIX code review nit 2 → GA-EVAL-SQLGEN-FOLLOWUP 确认为 drop 机制 → 本票正式修）。
- 与 [GA-EVAL-REBASELINE](GA-EVAL-REBASELINE-passk-semantics.md) 的 anti-flakiness all-must-pass 语义正交——本票不 verdict 语义，只让 retry 一致以减少 anti-flakiness flip。
- 环境：conc=3（AGA empty-burst 约束），maxc-sidecar-k11.mjs（real-exec），credentials seam。不 force-push；rebase onto origin/master。

---

## Resolution (2026-09-06)

**Decision**: wire `args.feedback` into the SQL-gen prompt (option (i) — `BuildPromptArgs.feedback` + `buildPrompt` renders `# 上次失败反馈` + `engine.run` passes `lastFeedback` to promptBuilder), NOT option (ii) (adapter-side prompt concat). Feedback belongs in the prompt context (promptBuilder-rendered, consistent with eventDef/joinConstraints); the adapter streams `args.prompt`.

**Implementation** (commit `ba1b1ed597` on `fix/ga-eval-sqlgen-prompt-fix`; backup branch `backup-ga-eval-retry-feedback`):
1. `packages/data/nl2sql-engine/src/prompt.ts`: `BuildPromptArgs` += `feedback?: LlmFeedback | null`. `renderFeedbackSection(feedback)` → `''` when null/undefined (byte-stable) else the `# 上次失败反馈` section (failureKind + `sanitizeFeedbackError`-bounded error; mirrors `sanitizeSubstrateError`). Inserted in BOTH contextPrefetched + default branches, gated on feedback presence.
2. `packages/data/nl2sql-engine/src/engine.ts`: `run()` passes `feedback: lastFeedback` to `this.promptBuilder({...})` (null on attempt 0 → byte-stable; set on critic_fail/execution-error/near-dup → attempt ≥1 prompt carries the failure).
3. `packages/eval/eval-cli/src/context.ts`: `CtxLlmAdapter.generate` doc comment (streams `args.prompt`, now carries feedback; `args.feedback` side-channel vestigial). No behavior change.
4. Tests: `prompt.spec.ts` +2 (feedback-rendering + byte-stability); `scenarios.spec.ts` +1 (S11 retry-uses-feedback — mock LLM self-corrects on retry ONLY when the prompt carries `# 上次失败反馈`). **128/128 nl2sql-engine tests pass.**

**Verdict (success criteria — honest)**:
1. **Criterion #3 (retry 真 self-correct — feedback 到 LLM prompt): MET.** S11 directly asserts the attempt-1 prompt contains `# 上次失败反馈`+failureKind+error + the mock self-corrects only then. Smoke (case 119 real path, judge-only) confirmed the retry loop runs in the CtxLlmAdapter path.
2. **Criterion #4 (additive — harness responder unaffected; default buildPrompt byte-stable): MET.** 5 existing prompt snapshots byte-identical; feedback field optional, null→omitted.
3. **Criteria #1 (null-SQL→<12) + #2 (pass_rate>7.7% real-exec / >56.4% judge-only): NOT MET (judge-only; real-exec deferred).** Judge-only: null-SQL 22/117→21/117 (−1, flat within n=39 noise), pass_rate 56.4%→53.8% (−1, noise). **(d) alone does NOT move the needle.**
4. **Why (d) alone is bounded — confirmed empirically**: the null-SQL explosion is dominated by EVENT cases (125/127/129/130) where the model declines for lack of the event schema (the (a) problem). (d)'s feedback "LLM 未产出 SQL" doesn't hand the model the missing event table `ieu_ods.ods_10000251_all_view` + `GET_JSON_OBJECT` template → the model still can't write the event SQL → still null-SQL. **The wiring was genuinely broken (retries used identical prompts) + is now fixed (correct) — but the fix is necessary-not-sufficient: the real win is (a)+(d) combined** ((a) gives the event schema → (d)'s feedback then keeps retries consistent — the ticket's "组合最大收益"). Resolve (a) next + re-baseline to measure the combined effect.

**Deferred**: real-exec baseline (`--with-query` + `MAXC_CONFIG` + `maxc-sidecar-k11.mjs`) — run when concurrent session idle + network restored (expect the same bounded pattern). Concurrent-session disruption: my uncommitted edits were stashed twice (recovered via `git stash apply`); committed code is in history (safe).
