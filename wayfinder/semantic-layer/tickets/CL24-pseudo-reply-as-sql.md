---
type: grilling
status: open
blocked_by: []
---

# CL-24: 模型伪回复被当 SQL（CL-23 衍生 / CL-19 同族）

**Branch**: `fix/cl24-pseudo-reply-as-sql`  <!-- 待建 worktree -->

## 事实（2026-09-04，voice_042 实测）

CL-23 的 tool-call 检测对 voice_017 **完全生效**（1/3 → 3/3 correct）。
但 voice_042 仍 wrong。挖根因时发现 **042 不属于 CL-23 范围**——是另一类漏洞。

voice_042 连跑两次（`cl23-ground2-042` / `probe-042-raw`），6 个 attempt 里 **3 个产出伪回复文本**，而引擎把它们当 SQL 放行（`ok=true`），根本不进 CL-23 的 decline 分支：

| run | attempt | generated_sql（节选） | 判定 |
|---|---|---|---|
| ground2 | 1 | `为了准确回答您关于"昨天的关键指标"的问题，我将为您查询…首先需要加载相关事件和表的详细定义…` | ok=true（**伪回复被当 SQL**）|
| ground2 | 2 | `无法直接回答该问题。\n\n**为什么不能答**："关键指标"属于模糊业务概念…` | ok=true（伪回复被当 SQL）|
| ground2 | 3 | `为了准确回答"昨天的关键指标"…按规范需要将其拆分为原子子问题…` | ok=true（伪回复被当 SQL）|
| probe-raw | 1 | `无法直接回答。\n\n**为什么不能答**：…系统语义层中并没有统一…` | ok=true（伪回复被当 SQL）|
| probe-raw | 2 | `**【诚实拒绝】**\n\n**为什么不能答**：…"关键指标"是一个宽泛…` | ok=true（伪回复被当 SQL）|
| probe-raw | 3 | `(none)` | decline → CL-23 合成触发 |

**关键观察**：6 个 attempt 里只有 1 个（probe-raw #3）是真 tool-call 文本 → CL-23 合成触发。其余 5 个，模型产出的是**自然语言伪回复**（`无法直接回答…` / `【诚实拒绝】…` / `为了准确回答…我将为您查询`），不是 SQL、也不是 tool-call 文本，但引擎的 `extractSqlCandidate` 没识别出"这不是 SQL"，于是 `sql` 非空 → `ok=true` → 直接过 → **走不到任何合成分支**。

## 根因（初步定位，待 grilling 确认）

模型在开放问题下产出三种文本：
1. **真 tool-call 文本**（`call\n{...}` / `{"name":...}`）→ CL-23 已拦 ✅
2. **自然语言伪回复**（`无法直接回答…` / `【诚实拒绝】…`）→ **当前漏洞**：被当 SQL 放行
3. 真 SQL → 正常路径

类别 2 的特征：
- 中文自然语言，不含 `SELECT`/`call`/`{`/`<` 等任何 SQL 或 tool-call 标记
- 常带 `**...**` markdown 加粗、`\n\n` 分段——**是回复，不是查询**
- 但 `extractSqlCandidate` 对任何非空文本都返回它本身（作为"maybe SQL"），引擎再判 `sql` 非空 → `ok=true`

## 与 CL-23 / CL-19 的关系

- **同族**：都在管"开放问题下模型应答行为"。CL-19 治 tool-call 发射，CL-23 落地检测+合成，本票治**伪回复发射**。
- **不在 CL-23 范围**：CL-23 是"检测 tool-call 文本"；本票是"检测自然语言伪回复"。两者检测逻辑不同（前者找 tool-call 标记，后者要判"这是不是中文回复而非 SQL"），合成路径可复用 CL-23 的 grounding prompt。
- **不阻塞 CL-23 闭票**：CL-23 的 tool-call 检测对 017 已 3/3 翻转，可标"部分达成（017 闭，042 衍生 CL-24）"。

## Question（需决策）

1. **检测点放哪**：
   - (a) `extractSqlCandidate` 里加"这是不是自然语言而非 SQL"判断 → 最上游，但 `extractSqlCandidate` 是纯函数，加 LLM 判断会让它非纯
   - (b) engine.ts 在 `llm.generate` 后、`extractSqlCandidate` 前加一道——与 CL-23 的 `looksLikeToolCall` 平级，加个 `looksLikeProseReply`：检测"非 SQL 且非 tool-call 的中文回复"
   - (c) 放进 critic.ts 作为新的 decline 原因
2. **`looksLikeProseReply` 的判据**（需 grilling 钉死，防误伤真 SQL）：
   - 包含 `无法直接回答` / `【诚实拒绝】` / `我将为您` 这类短语 → 模型套路化回复
   - 不含任何 SQL 关键字（`SELECT`/`FROM`/`WHERE`）且不含 tool-call 标记
   - **边界**：`-- comment` 注释 SQL 里有中文怎么办？要防误伤
3. **合成路径**：复用 CL-23 的 grounding prompt（已验证对 017 有效），还是单独一套？042 的 `covered_assets=[]`，schemaContext 为空，grounding 无法列真实列——需用无候选回退（已在 CL-23 加）。
4. **042 的 expected.answer 形状**：它要的是"列出 DAU/充值/新增/留存等指标让用户选"，不是 schema grounding。这是否意味着**开放问题分两型**——"有候选但缺字段型"(017) vs "无候选需枚举指标型"(042)——各需不同合成策略？

## 验收

- voice_042 翻转为 correct（≥ 中位数口径，CL-22）
- `looksLikeProseReply` 单元测试覆盖：3 种伪回复格式 + 不误伤真 SQL / 注释 SQL / 空 SQL
- 全量 168-case 无回归（n≥1 导航 + compare.ts）
- 与 CL-23 的检测/合成分层清晰，不互相干扰

## 关键文件

- 检测点候选：`packages/data/nl2sql-engine/src/critic.ts`（`extractSqlCandidate`、CL-23 的 `looksLikeToolCall` 同处）
- engine 判定路径：`packages/data/nl2sql-engine/src/engine.ts:270-280`（`llm.generate` → `extractSqlCandidate`）
- 合成复用：`packages/eval/eval-cli/src/context.ts`（CL-23 的 `declineKind === 'tool_call_emitted'` 分支旁）
- 实测证据：`eval-results/cl23-ground2-042.json` / `eval-results/probe-042-raw.json`
