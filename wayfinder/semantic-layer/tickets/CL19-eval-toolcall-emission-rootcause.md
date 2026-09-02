---
type: research
status: closed
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

## Resolution

### A1: 根因——Prompt 是主因，Model 是协因，EXP2 无关

**主因 = TOOL_CATALOG prompt 节**。`buildPrompt`（`prompt.ts:88-99`）和 `buildPromptEN`（`exp2-prompts-en.ts`）均包含完整 tool catalog（`load_event_definition` / `load_table_dimensions` / `query_data` 等 7 个 tool 描述），并在 §3 SOP 中指导模型"先调 tool 获取信息，再生成 SQL"。eval 引擎 `Nl2sqlEngine.run()` 是**单轮 completion**（非 agent loop），不支持实际 tool 执行——但 prompt 描述了 agentic workflow。对开放问题（"玩家反馈怎么样" / "帮我看看昨天的关键指标"），模型判断需先调 tool 获取更多信息，遂发射 tool-call 语法作为文本输出。

**协因 = qwen3.7-max 模型倾向**。该模型在 prompt 含 tool 描述时，对开放/模糊问题 readily 发射 tool-call 语法。格式**跨 run 不确定**：同一 case 不同 run 可能产出 `call:default_api:load_event_definition{...}`（run `8b465bd9`）、`<tool>{"name":"load_event_definition"...}`（08-31 snapshot）、`call:func{}`、`{"tool_calls":[...]}`、`{"name":...}` 等格式。这是模型根据训练数据中不同 tool-call 约定即兴产出，非 prompt 可控。

**EXP2 无关**。CN prompt（`buildPrompt`）和 EN prompt（`buildPromptEN`）均包含 TOOL_CATALOG，tool-call 发射与语言 arm 无关。B-DA6 实验（修改候选名为 qualified 形式）同样触发 tool-call/prose 发射（-67.3pp），进一步确认**prompt 结构敏感性**而非特定 arm。

**关键代码事实**：`buildEvalPrompt`（`prompt.ts:159-200`）**已存在**——无 tool catalog、无 agent persona、纯 SQL 生成任务。但 eval-cli `context.ts` 的 `Nl2sqlAgentResponder` **未使用它**（始终传 `buildPrompt` 或 `buildPromptEN`）。这是 prompt 根因的最直接证据：eval 专用的无 tool-catalog prompt 已写好，但未接入。

**证据链**：

| 证据 | 来源 | 指向 |
|------|------|------|
| voice_017 输出 `call:default_api:load_event_definition{event_name: "game.playerFeedback.sendFeedback"}` | Run `8b465bd9` DIAG | 模型尝试调用 TOOL_CATALOG 中列出的 tool |
| 08-31 snapshot 同 case 输出 `<tool>{"name":"load_event_definition"...}` | 实验日志 | 格式跨 run 不确定（model 倾向） |
| B-DA6 qualified-name prompt 暴跌 67.3pp（LLM 输出 prose/tool-call/空） | Run `1f0ec09c` | prompt 结构变更即可触发 tool-call 发射 |
| `buildEvalPrompt` 无 tool catalog 已存在但未接入 | `prompt.ts:159` | eval 原设计预期无 tool-call prompt |
| EXP2 arm B/C/D 的 `buildPromptEN` 同样含 `TOOL_CATALOG_EN` | `exp2-prompts-en.ts:14-23` | EXP2 非独立触发因素 |

### A2: 修复定位——(a)+(b) 组合，(c) 可选

**推荐 (a) engine 检测 + (b) reply 层合成**，(c) prompt 调整作为可选的源头减量。

#### (a) Engine 层：tool-call 检测 + clean decline

**位置**：`engine.ts` `run()` 方法，在 `llm.generate()` 之后、`extractSqlCandidate` 之前。

**做法**：检测 `gen.sql` 是否为 tool-call 文本。若是，**不进入 critic/execute**，直接作为 empty-SQL 处理（同现有 `!sql` 分支逻辑），返回 `decline: true` + 解析 tool name/target 生成有信息的 reason（如 `"LLM 尝试调用 load_event_definition(game.playerFeedback.sendFeedback) 而非生成 SQL"`）。

**解决的问题**：
- 消除 StandInOdps 对 tool-call 文本的 false-success（当前 `ok=true decline=undefined`）
- 避免 critic 在非-SQL 上浪费 feedback-retry 轮次
- 生成有信息量的 decline reason（含 tool name + target，供 (b) 层使用）

**不解决的问题**：judge 仍看到 `Declined: ...` → 可能仍判负（DELIVERY judge 要结构化拒绝，非技术性 decline）

#### (b) Reply 层：LLM 合成结构化拒绝

**位置**：`context.ts` `Nl2sqlAgentResponder.respond()` 方法，在收到 engine 结果后。

**做法**：当 engine 返回 decline 且 reason 包含 tool-call 信息时（或直接检测 `result.sql` 含 tool-call），用 LLM 合成结构化回复。prompt 示例：

```
用户问了"{question}"。数据 agent 尝试调用 {tool_name}({target}) 获取信息，但当前无法执行 tool call。
请基于检索到的候选数据源，生成一条结构化的拒绝/澄清回复：说明为什么不能直接回答、缺少什么信息、建议用户如何改进提问。
候选数据源：{schema_context}
```

**解决的问题**：
- 产出 DELIVERY judge 可接受的结构化回复（"当前数据资产中没有情感分析字段，无法评估正面/负面倾向。可以提供舆情互动数据..."）
- **唯一能真正翻转 DELIVERY case 的修复层**

**成本**：每个 tool-call case 额外 1 次 LLM 调用（合成回复）

#### (c) Prompt 层（可选）

两个子选项：

**(c1) 添加抑制指令**：在 `buildPrompt`/`buildPromptEN` 末尾添加 `"不要输出 tool-call 语法。本轮仅生成 SQL（用 ```sql 围栏）或结构化拒绝文本。Tool catalog 仅供参考，不可直接调用。"`

- 优点：从源头减少 tool-call 发射
- 风险：模型可能忽略指令（尤其开放问题）；可能影响其他 case 的生成质量

**(c2) eval 切换为 `buildEvalPrompt`**：在 `Nl2sqlAgentResponder` 构造 engine 时传 `promptBuilder: buildEvalPrompt`

- 优点：彻底消除 tool catalog 触发；`buildEvalPrompt` 已存在且有测试
- 风险：**改变评测标的**——从测试 agent 行为（含 tool 理解）变为测试纯 SQL 生成质量；与生产 prompt 不同构
- 判断：若 eval 目标是"eval 引擎能力"而非"生产 agent 能力"，(c2) 合理；否则应保留 agent prompt + 在 (a)(b) 层防御

**推荐实施顺序**：

1. **扩展 `looksLikeToolCall`**（quick fix，5 min）：补齐 `call:` 前缀和 `{"tool_calls":` 格式
2. **(a) engine 检测**（engine.ts，low risk）：tool-call → clean decline
3. **(b) reply 合成**（context.ts，medium effort）：decline + tool-call → LLM 合成结构化回复
4. **(c1) 可选**：添加 prompt 抑制指令（需 eval 验证是否影响其他 case）

### A3: 影响面

- **仅 2 个 DELIVERY case**（voice_017 / voice_042），Type-1 tool-call 发射
- **当前 DELIVERY: 14/18 = 77.8%**（run `32dd9532`）
- **若两 case 翻转: 16/18 = 88.9% > 85% 目标**
- **注意**：voice_042 行为**非确定**（run `32dd9532` 已通过，但前 run 未通过）——实际净增可能仅 voice_017（1 case → 15/18 = 83.3%，仍 <85%）
- **CL-16 85% DELIVERY 目标**：CL-19 单独可能达到（88.9%）或接近（83.3%），取决于 voice_042 的 LLM 非确定性；剩余 2 wrong 为 Type-2（CL-20）
- **Overall 影响有限**：2 case 最多 +1.2pp（168 cases），不改变 overall 趋势

### `looksLikeToolCall` 缺口清单

当前（`context.ts:72-78`）捕获 3 种格式：

| 格式 | 正则 | 覆盖 |
|------|------|------|
| `<call>...` / `<tool>...` | `/^<(call\|tool)/i` | ✅ |
| `{"name": ...}` | `/^\{[\s]*"name"\s*:/` | ✅ |
| `func(args)` | `/^[a-z_]+\s*\(/i` | ✅ |

live 观察到但**未覆盖**的格式：

| 格式 | 示例 | 建议正则 |
|------|------|----------|
| `call:provider:func{...}` | `call:default_api:load_event_definition{...}` | `/^call:/i` |
| `{"tool_calls": [...]}` | `{"tool_calls":[{"name":"..."}]}` | `/^\{[\s]*"tool_calls"\s*:/` |

补丁：

```typescript
function looksLikeToolCall(text: string): boolean {
  const trimmed = text.trim()
  if (/^<(call|tool)/i.test(trimmed)) return true
  if (/^\{[\s]*"(name|tool_calls)"\s*:/i.test(trimmed)) return true
  if (/^call:/i.test(trimmed)) return true
  if (/^[a-z_]+\s*\(/i.test(trimmed) && /^\w+\s*\([\s\S]*\)\s*$/.test(trimmed)) return true
  return false
}
```
