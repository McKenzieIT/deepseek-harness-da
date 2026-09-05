# Next session — GA-EVAL-SQLGEN-FOLLOWUP（调查 post-prompt-fix pass-rate 分歧 + 决定 follow-up）

你接手 **GA-EVAL-SQLGEN-FOLLOWUP**（GA-EVAL-SQLGEN-PROMPT-FIX 的 follow-up，ticket 在 `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md`，已 chart + wire 进 map frontier）。上个 session（commits `8b8ba516e5` + `47584b85d7` + `d8b4d7630f` on master，+ `fcdb18779c` 代码 fix）resolved GA-EVAL-SQLGEN-PROMPT-FIX：prompt fix（`contextPrefetched` flag）消除了非 SQL 工具调用发射（criterion #1 达标，两模式 0%），但 re-baseline 出现分歧——judge-only 回升 48.7→56.4（criterion #2 达标），real-exec 反降 12.8→7.7（criterion #2 未达标，假设证伪）。本 session 调查分歧根因 + 决定 follow-up 方向。

## 上 session 结果（全部已落盘 + on master）

- **prompt fix**（`fcdb18779c`，contaminated——被并发 session 的 `git add -A` 扫进 docs commit，code 完好但 commit 污染永久 force-push 不安全）：`packages/data/nl2sql-engine/src/prompt.ts` 加 `BuildPromptArgs.contextPrefetched` flag（默认 false=字节不变；true=engine-responder pre-fetched-context prompt，去掉 `# 工具集` 可调用目录）；`context.ts` `Nl2sqlAgentResponder` 传 wrapped promptBuilder（标准路径；EXP2_ARM B/C/D 仍 `buildPromptEN`）；additive——harness responder（用 preset phase-gate）不受影响；complements CL-23 `looksLikeToolCall`。
- **re-baseline 双模式**（39 EXEC, pass^k, conc=3, `--today 20260806`）：
  - real-exec（`--with-query`）：5/39=12.8% → **3/39=7.7%**（-2 case 041/046 回归，0 新增）；非 SQL 16.2%→**0%**；null-SQL 11→23。
  - judge-only（`--with-query` off）：19/39=48.7% → **22/39=56.4%**（+3 case 含 119/128/138 event case）；非 SQL 22.2%→**0%**；null-SQL 10→22。
- **分歧=judge-leniency 机制印证**（GA-EVAL-REAL-EXEC 的 73.7% false-pass 教训）：fix 让模型生成更多 SQL → judge 放过更多语义合理但执行值错的 SQL → judge-only 升；real-exec 仍 fail on wrong values（event case 模型不知 event 表名 `ieu_ods.ods_10000251_all_view` 生成错表/占位符如 `<数据视图>`；2 metric case 041/046 回归）。**real-exec 瓶颈=SQL 正确性/错值，非非 SQL 发射**。两变化在 n=39 噪声内（MDE~20pp）但定性模式（judge-only 升/real-exec 降/非 SQL 0%）明确。
- **artifacts**：`packages/eval/eval-cli/eval-results/rebaseline-real-exec-rbi-10000251-postpromptfix.json` + `rebaseline-judge-only-rbi-10000251-postpromptfix.json`（gitignored，在盘上）。pre-fix 对照：`rebaseline-real-exec-rbi-10000251.json` + `rebaseline-judge-only-rbi-10000251.json`。
- **code review**（self，subagent 挂了——MCP 工具访问问题）：APPROVE_WITH_NITS，无 code 改动。2 nits：(1) eventDef 未 pre-fetch gap（`# 上下文` preamble 说 "pre-fetched" 但 eventDef 实际未加载→误导）；(2) feedback-wiring gap（`engine.ts run()` retry 传 `feedback` 但 `CtxLlmAdapter.generate` 忽略 `args.feedback`→self-correction 反馈未到 LLM→null-SQL）。

## 本 session 任务（GA-EVAL-SQLGEN-FOLLOWUP）

**调查 post-prompt-fix pass-rate 分歧根因 + 决定 follow-up 方向**。见 ticket（`wayfinder/data-agent/tickets/phase-misc/GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md`）完整工作清单 + 成功标准。

### 工作清单

- [ ] 调查分歧根因：对比 pre/post（`rebaseline-real-exec-rbi-10000251.json` vs `-postpromptfix.json` + judge-only 同）的 per-case verdict + `generated_sql`，确认分歧=judge-leniency（judge 放过更多语义合理 SQL）还是 engine-mode prompt 致 SQL gen 退化。
- [ ] 深查 041/046 回归：pre-fix 通过的 SQL vs post-fix fail 的 SQL——差异来自 prompt 改动还是 pass^k 噪声？
- [ ] 确认 eventDef 未 pre-fetch 的影响：event case（119-138）的 `generated_sql` 是否普遍缺 event 表名/用占位符？pre-fetch eventDef 能修多少 case？
- [ ] 深查 feedback-wiring gap（code review nit 2）：`CtxLlmAdapter.generate` 忽略 `args.feedback`→self-correction 反馈未到 LLM→null-SQL。是否贡献 real-exec drop？应否 wire feedback to prompt？
- [ ] 评估 (a) eventDef pre-fetch 的可行性：engine responder 如何 load event definitions（semantic layer 的 event schema？按 question 检测 event-based intent + load 对应 eventDef？需新 infra？）+ 估工。
- [ ] grill follow-up 方向：(a) eventDef pre-fetch impl（真修 real-exec 瓶颈）/ (b) prompt 修订（`# 上下文` "if loaded"）/ (c) 接受——决定优先级。
- [ ] 如选 (a)：开 impl 票（engine responder pre-fetch eventDef via semantic layer + pass to `engine.run`）。
- [ ] 如选 (b)：开 impl 票（修订 engine-mode prompt 的 `# 上下文` preamble）。
- [ ] 记录（audit-log + map frontier）。

## 环境约束（CRITICAL）

- 项目在用户本地 Mac：`/Users/mckenzie/workspace/deepseek-harness-da`。cwd pod-side placeholder 忽略。**只用 `mcp__local__*` 工具**（read_file/write_file/edit_file/list_dir/stat/glob/grep/bash），路径都在 `/Users/mckenzie/workspace/deepseek-harness-da` 下；built-in Read/Write/Edit/Bash/Grep/Glob 被 block。
- MCP runner 偶尔断连（runner_gone）——重试即可。sync bash 默认 ~40-70s 超时；长命令用 `run_in_background=true` + bash_output poll，或 nohup+disown orphan + tail log。pnpm@11.7, Node v25。
- key 在 `~/.dsh/.credentials.yaml`（DASHSCOPE_API_KEY，走 credentials seam）。
- maxc CLI 0.4.8（`~/Library/Python/3.13/bin/maxc`，**不在 PATH——需 `export PATH="$HOME/Library/Python/3.13/bin:$PATH"`**）；`~/.maxc/config_ieu_cdm.yaml`（project=ieu_cdm）。
- 长跑用 nohup+disown orphan + cron 轮询；conc=3（conc=4 under load 触发 AGA empty-burst）；机器减载。
- **并发 session 仍活跃**：origin/master 持续前进（多 worktree 并行 + 直接 push docs + PR merge）；上 session 的工作已 on master（`8b8ba516e5`），不受影响。但 commit/push 时需 rebase onto 最新 origin/master（origin/master 会在我 fetch 后前进——push 可能被 reject，retry 即可）。**别 force-push**（破坏已合并 PR 历史）。工作树有并发 leftover（`schema-gateway/package.json` + `pnpm-lock.yaml`，非我——别 commit 它；rebase 前 `git stash` 它）。
- **subagent 会挂**（MCP 工具访问——subagent 默认用 built-in Read/Bash 被 block，mcp__local__ 可能未加载给 subagent）。需要 code review 时自己做（用 mcp__local__），别依赖 subagent。

## 先读背景

- `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md`（本票，完整工作清单 + 成功标准）。
- `wayfinder/data-agent/tickets/phase-misc/GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md` 的 Resolution（上 session 的 fix + re-baseline 详情）。
- `wayfinder/data-agent/research/experiment-audit-log.md`（2026-09-05 GA-EVAL-SQLGEN-PROMPT-FIX entry + Code review subsection + 2026-09-04 GA-EVAL-REAL-EXEC entries——judge-leniency 教训）。
- `packages/eval/eval-cli/README.md`（baseline 表——post-prompt-fix real-exec 7.7% + judge-only 56.4% 行 + divergence note）。
- `packages/eval/eval-cli/src/context.ts`（`Nl2sqlAgentResponder`——confirm eventDef 未传 + feedback-wiring gap；`CtxLlmAdapter.generate` 忽略 `args.feedback`）。
- `packages/data/nl2sql-engine/src/engine.ts`（`run()` 的 critic/retry 循环——feedback 传递 + promptBuilder 调用）。

## 关键教训（已 documented）

- **judge-leniency**：judge-only 是 upper bound with 数十 pp 偏差——judge 放过语义合理但执行值错的 SQL（GA-EVAL-REAL-EXEC 的 73.7% false-pass）。fix 让模型生成更多 SQL → judge 放过更多 → judge-only 升（更高 over-count，非真质量提升）→ real-exec 仍 fail（值错）。
- **real-exec 瓶颈=SQL 正确性/错值，非非 SQL 发射**：event case 模型不知 event 表名（`ieu_ods.ods_10000251_all_view`）生成错表/占位符；engine responder 不 pre-fetch eventDef（`Nl2sqlAgentResponder.respond()` 调 `engine.run({question, scopeId, today})` 不传 `eventDef` → prompt `# 事件定义` 渲染「未加载」）。
- **feedback-wiring gap**：`engine.ts run()` retry 传 `feedback:lastFeedback` 给 `llm.generate()`，但 `CtxLlmAdapter.generate` 忽略 `args.feedback`（只用 `args.prompt`）→ self-correction 反馈未到 LLM → retry 用同一 prompt + near-dup gate → null-SQL on exhaust。pre-existing（非本 fix 引入）。
- **n=39 噪声大**（MDE~20pp）——分歧的统计显著性有限，但定性模式（judge-only 升/real-exec 降/非 SQL 0%）是 judge-leniency 机制的强证据。
- **curated case set**：`packages/eval/eval/cases/rbi-10000251-exec/`（39 EXEC，源 reverse-bi/eval-cases/10000251/）。da 的 `match_modes.ts` 是 rbi `match_modes.py` 的 1:1 port。
- **maxc-sidecar-k11.mjs** 是 wrapper（real maxc CLI）；默认 `standin-sidecar.mjs` 是 MOCK。`MAXC_CONFIG` 必须显式设 `~/.maxc/config_ieu_cdm.yaml`。
- item-4 config 字段 LIVE（`with_query` 区分 real-exec/judge-only）。

## 完成标准

1. 分歧根因确认（judge-leniency vs prompt 退化 vs 噪声）——有 per-case 证据。
2. follow-up 方向决定（a/b/c）+ 开对应 impl 票（如 a/b）。
3. 记录（audit-log + map frontier）。

## 完成后可选 follow-up（不在本票 scope）

- GA-EVAL-EXPAND（k11-v2 `expected.sql` 派生 → k11-v3，正交于本票，仍 open）。
- GA-EVAL-REBASELINE item 4 token usage（LLM-stream interceptor，仍 open）。

先用自己的话重述任务 + 确认理解，然后执行。建议先做 per-case 对比分析（pre/post `generated_sql`）确认分歧根因，再 grill follow-up 方向。
