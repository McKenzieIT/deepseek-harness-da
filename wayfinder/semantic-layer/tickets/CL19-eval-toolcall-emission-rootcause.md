---
type: research
status: open
blocked_by: []
---

# CL-19: eval LLM 发射 tool-call 文本根因 + 修复定位（CL-16 Type-1 剩余）

## Question

CL-16 的 2 个 Type-1 DELIV-FAIL（`voice_017` / `voice_042`）：eval LLM（`aga`/`qwen3.7-max`）在单次 `Nl2sqlEngine.run` 中把 tool-call 文本（`<tool>{"name":"load_event_definition"...}` / `call:load_table_dimensions{...}`）当作 `gen.sql` 输出。根因链（读 `packages/data/nl2sql-engine/src/engine.ts` 的 `run()` 确认）：

1. `gen = await this.llm.generate(...)` → LLM 返回 tool-call 文本作为 `gen.sql`。
2. `rawSql = extractSqlCandidate('```sql\n'+gen.sql+'\n```') ?? gen.sql` → 抽不出 SQL → 回落原始 tool-call 文本。
3. `sql` 非空 → 跳过 empty-SQL 分支 → `critiqueSql(tool-call-text)` 失败 → feedback-retry 耗尽 → `decline: true, reason: '自修 N 次仍失败'`。
4. eval-cli `context.ts`：`result.decline` true → `reply = 'Declined: 自修…'` → DELIVERY judge 看到干瘪技术性拒绝 → `deliv=false`。

需回答三问：

1. **根因**：为何 LLM 发射 tool-call 文本而非 SQL？是 `buildPrompt`（`prompt.ts`）邀请/允许 tool-call 语法，还是 qwen3.7-max 模型倾向（换模型可验证），还是 GA-EXP2 prompt arm 副作用？
2. **修复定位**（三选一或组合）：
   - (a) **engine**（`engine.ts`，git 干净）：检测 tool-call/非-SQL 输出 → 不重试、立即 decline，并从 tool-call 文本解析 tool+target 生成更有用的 decline reason。**注意：此路径只改 decline 措辞，judge 仍可能判负（judge 要结构化拒绝，engine 从 tool-call 文本合成不出）。**
   - (b) **reply 层**（`eval-cli/src/context.ts`，即 CL-16 Option A）：`looksLikeToolCall(sql)` 时用 LLM 合成结构化拒绝 reply（说明缺什么/要澄清什么）让 DELIVERY judge 有真拒绝可打分。**最可能真正翻转 case，但属 reply 层而非 engine 根因。**
   - (c) **prompt**（`prompt.ts`）：调整 prompt 阻止 tool-call 发射（根因层，若 prompt 是诱因）。
3. **影响面**：仅 2 case；CL-16 的 85% DELIVERY 目标靠此达不到（另 5 个 DELIV-FAIL 是 Type-2 agent 行为，超出 CL-16 管道范围）。

## 背景

- CL-16 已部分推进（pipeline 部分：CL-11 reply 管道 + 08-31 `looksLikeToolCall` 过滤；`019` 已翻转；`078`/`voice_043` 现已通过）。
- engine 核心（`engine.ts`/`prompt.ts`/`critic.ts`）git 干净；唯 `stand-in-odps.ts` 有 WIP（与本根因无关）。
- 验证需 eval（凭证已就绪：`scripts/run-eval.sh` 从 `~/.dsh/.credentials.yaml` 加载 `DASHSCOPE_API_KEY`）。

## 验收

- 根因定位（prompt vs model vs EXP2）有证据（可换模型/改 prompt 对比跑）。
- 修复定位决策（a/b/c）+ 实施 + eval 验证 `voice_017`/`voice_042` 翻转。
- 记录到 `experiment-audit-log.md`。
