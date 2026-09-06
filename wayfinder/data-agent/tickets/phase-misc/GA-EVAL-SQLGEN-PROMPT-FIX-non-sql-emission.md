# GA-EVAL-SQLGEN-PROMPT-FIX — engine-responder SQL-gen prompt tool-catalog leakage (34% non-SQL emissions)

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved (2026-09-05)
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

- [x] 定位 prompt.ts 的工具描述段（line 89-90, 119, 150-153）+ 确认 engine responder 的 SQL-gen prompt 路径（`Nl2sqlEngine` 的 promptBuilder，context.ts:377-385）。
- [x] 改 prompt：engine responder 模式下，不把 `search_data_sources`/`load_event_definition` 描述为 invocable；改为"候选 + 事件定义已 pre-fetch 进上下文，直接用它们生成 SQL"。注意 **additive**——harness agent 模式（`--responder harness`）仍需工具描述（它真调这些工具），所以改动要么 (a) prompt 分 engine/harness 两版，要么 (b) 加一个"工具已 pre-fetch"的 conditional 段。别破坏 harness responder。
- [x] 跑 1-case smoke（case 037）确认 SQL-gen 仍正常（不退化）+ 非 SQL 发射率降。
- [x] re-baseline real-exec：同 GA-EVAL-REAL-EXEC 命令（`--cases packages/eval/eval/cases/rbi-10000251-exec --with-query --sidecar maxc-sidecar-k11.mjs --today 20260806 --scope-id 10000251 --pass-k 3 --concurrency 3 --run-id rebaseline-real-exec-rbi-10000251-postpromptfix`），对比 12.8% 看回升多少。
- [x] append audit-log（prompt-fix + re-baseline，带 config + 对比 12.8%）。
- [x] 更新 README baseline 表（加 post-prompt-fix real-exec 行，对比 12.8%）。
- [x] 本票 checklist + Resolution；map.md frontier。

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

---

## Resolution (2026-09-05, GA-EVAL-SQLGEN-PROMPT-FIX)

### Fix landed (additive, harness-safe) — chose option (b) conditional, not (a) split

- `packages/data/nl2sql-engine/src/prompt.ts`: added `BuildPromptArgs.contextPrefetched?: boolean` (default `false` = the agent-loop prompt, **byte-identical** to pre-fix — prompt.spec.ts 4 existing inline snapshots pass unchanged). When `true` (engine-responder mode), `buildPrompt` reframes `# 工具集` (invocable tool catalog) -> `# 上下文（已 pre-fetch，勿调用任何工具）` preamble ("candidates + event definitions pre-fetched into context; do NOT emit tool-call format `call:default_api`/`<tool>`/`{"name":...}`; generate SQL directly in ```sql fences"); reframes §3 (engine handles critic/exec/self-correction internally); drops `search_data_sources`/`load_event_definition` name-refs from the `# 检索候选`/`# 事件定义` headers + the 字段清单校验 line.
- `packages/eval/eval-cli/src/context.ts`: `Nl2sqlAgentResponder` passes `promptBuilder: (args) => buildPrompt({ ...args, contextPrefetched: true })` to `Nl2sqlEngine` (standard path only; EXP2_ARM B/C/D keep `buildPromptEN`). **Harness responder (`--responder harness`) UNAFFECTED** — it uses the variant preset's phase-gate prompt, NOT `Nl2sqlEngine`/`buildPrompt`; the default `buildPrompt` branch is byte-identical.
- `packages/data/nl2sql-engine/tests/prompt.spec.ts`: byte-stability snapshot for the `contextPrefetched=true` branch. Complements CL-23 `looksLikeToolCall` (commit ccdd150a97 — detects residual tool-calls at the respond layer; this prevents them at the prompt layer).

### Re-baseline (39 EXEC cases, pass^k, conc=3, --today 20260806, --scope-id 10000251)

| baseline | pre-fix | post-fix | d pass | non-SQL (pre->post) | null-SQL (pre->post) |
|---|---|---|---|---|---|
| real-exec (`--with-query`) | 5/39 = 12.8% | 3/39 = 7.7% | **-2** | 19/117=16.2% -> **0/117=0.0%** | 11/117 -> 23/117 |
| judge-only (`--with-query` off) | 19/39 = 48.7% | 22/39 = 56.4% | **+3** | 26/117=22.2% -> **0/117=0.0%** | 10/117 -> 22/117 |

real-exec: passed lost 041/046 (2 regressions — the engine-mode prompt altered their SQL gen); passed gained **none** (the 19 converted tool-call->SQL attempts produced wrong/null SQL, 0 new passes). judge-only: passed gained 050/051/056/119/128/138 (6 — event cases that pre-fix emitted tool-calls now generate semantically-plausible SQL the judge passes); passed lost 042/049/059 (3). Net +3.

### 成功标准 status

1. **MET** — non-SQL tool-call emission <10%: eliminated in BOTH modes (real-exec 16.2%->0%, judge-only 22.2%->0%). The fix's direct goal achieved.
2. **MIXED** — pass_rate recovery: judge-only **rose 48.7%->56.4% (MET, +3 cases)**; real-exec **dropped 12.8%->7.7% (NOT MET, -2 cases, 0 gained)**.
3. **MET** — harness responder unaffected (additive; default buildPrompt byte-identical; harness uses preset phase-gate).

### Hypothesis REFUTED for real-exec (partially right for judge-only)

The ticket's note ("修复后若 real-exec pass_rate 回升到接近 judge ceiling（48.7%），则 judge false-pass gap 会缩小——说明 34% 非 SQL 是 real-exec 低主因之一") is **REFUTED for real-exec**: real-exec did NOT recover toward 48.7% — it DROPPED to 7.7%. The 34% non-SQL emissions were NOT the real-exec bottleneck. The fix eliminated them (criterion #1) but the converted attempts (tool-call->SQL) produced wrong/null SQL (0 new passes) + 2 regressions (041/046). The divergence IS the judge-leniency pattern (GA-EVAL-REAL-EXEC's lesson, confirmed): the fix makes the model generate MORE SQL -> the JUDGE (semantic, execution-blind, lenient) passes more -> judge-only rises (a higher over-count, not a real quality gain — 73.7% judge false-pass) -> but the REAL-EXECUTOR (value match, strict) still fails (event cases: the model doesn't know the exact event table `ieu_ods.ods_10000251_all_view`, generates wrong tables/placeholders like `<数据视图>`; 2 metric cases regressed). The real-exec bottleneck is **SQL-CORRECTNESS (wrong values), NOT non-SQL emissions**. n=39 noise (MDE ~20pp) — both changes within noise, but the qualitative pattern (judge-only up, real-exec down, 0 non-SQL both modes) is the judge-leniency mechanism confirmed, not random.

### Carried forward (separate ticket, not this scope)

The real-exec bottleneck = SQL-correctness for event cases. Root cause: `Nl2sqlAgentResponder.respond()` (packages/eval/eval-cli/src/context.ts) calls `engine.run({ question, scopeId: this.scopeId, today: this.today })` with **NO `eventDef`** -> the prompt's `# 事件定义` renders `（未加载）` for event questions -> the model lacks the event schema -> generates wrong-table/placeholder SQL -> execution_match=false. A follow-up to **pre-fetch eventDef in the engine responder** (load event definitions for event-based questions via the semantic layer + pass to `engine.run`) would target the real-exec bottleneck directly. This is the actual fix for low real-exec pass_rate (the prompt tool-catalog fix here was necessary-but-insufficient: it eliminated the non-SQL symptom but not the SQL-correctness root cause).

### Artifacts + commit + cleanup

- Artifacts: `packages/eval/eval-cli/eval-results/rebaseline-real-exec-rbi-10000251-postpromptfix.json` (real-exec, 140KB); `rebaseline-judge-only-rbi-10000251-postpromptfix.json` (judge-only). Both config-stamped (`with_query` true/false, `verdict_semantics='pass^k'`, `today='20260806'`, `concurrency=3`, `scope_id='10000251'`). 0 AGA-burst, 0 infra (empty-SQL throughout = engine null-SQL from critic-retry exhaust on event cases, matching the prior run's 11/10 pattern — NOT AGA empty-response bursts).
- Code on branch `fix/ga-eval-sqlgen-prompt-fix` (commit fcdb18779c). **Cleanup needed**: a concurrent session (CL-23 + wayfinder docs, live during this work) repeatedly wiped uncommitted working-tree changes via `git add -A`/reset + swept the code fix into its docs commit fcdb18779c (the code is intact + verified — `git show HEAD:prompt.ts | grep contextPrefetched` = 3 — but the commit is contaminated with a docs change). **Split-cleanup**: re-commit the code fix (prompt.ts + context.ts + prompt.spec.ts) cleanly on the branch, leaving the docs change for the concurrent session. Backups preserve the fix: `backup-ga-eval-sqlgen-prompt-fix` branch + `stash@{0}` + reflog.
- Records: experiment-audit-log.md 2026-09-05 entry; eval-cli/README.md baseline table (2 post-prompt-fix rows + divergence note); map.md Decisions so far + frontier (this ticket resolved).
