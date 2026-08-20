# P7：reverse-bi 四阶段 phase-gated pipeline 忠实再表达到 deepseek-harness-da harness 事件 seam（cited 研究笔记）

> 目的：为 P7 prototype（四阶段 preset overlay + phase-gate 插件）打底——读透 reverse-bi 四阶段 data-agent 的编排控制流，分析如何**忠实地把它的 phase-gated pipeline 重新表达到 deepseek-harness-da 的 harness 事件 seam 上**，additive-only、**不自定义 harness agent-loop**、**不坍缩四阶段**。
>
> 方法：一手源码（`/Users/mckenzie/workspace/reverse-bi` 只读）+ 已有研究笔记 cite。每个 claim 标 `path` + 符号/小节；推断标 `INFERENCE`。确切值（每 phase 的 `max_attempts`/`timeout`/`fallback`）引 `factory.py` 原文。
>
> 范围：编排控制流（pipeline.py、factory.py、gates.py、prompt.py、state.py、state_store.py、steering.py、delivery.py、recovery.py、forced_load.py）。不重做已有研究：cite `harness-agent-loop.md`（harness 侧事件 seam + §4.3 映射表 + Q7）与 `rbi-purpose-arch.md`（§4 四阶段内容 + §5 端到端生命周期 + §7 开放迁移问题）。
>
> 常设原则：additive-only（不改/不删 core、保上游升级路径）；reverse-bi 只读源（重新实现不改）；不自定义 agent-loop、不坍缩阶段（`map.md` ③③）；goal/todo/plan 保留（`map.md` Q8），四阶段 Pipeline 作默认编排。

---

## §1 rbi 四阶段编排内幕

本节填补 `harness-agent-loop.md` 只 sketch 的深度——从源码提取 rbi pipeline 如何**在一个 turn 内跑过四阶段**的精确控制流。

### §1.1 每 phase 的 PhaseConfig 确切值（cite `factory.py` `default_phase_configs`）

源：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/factory.py` `default_phase_configs`（`:106`–`:157`）。返回 `list[PhaseConfig]`，`PhaseConfig` 定义在 `phases.py`（`:139` `@dataclass(frozen=True) class PhaseConfig`）。

| Phase | tools | gate | max_attempts | timeout_seconds | fallback_phase |
|---|---|---|---|---|---|
| **UNDERSTANDING** | `UNDERSTANDING_TOOLS` | `always_pass` | **5** | **60** | **None**（未设） |
| **GENERATION** | `GENERATION_TOOLS` | **`sql_syntax_gate`** | **5** | **60** | **`Phase.UNDERSTANDING`** |
| **EXECUTION** | `EXECUTION_TOOLS` | `always_pass`（**never consulted**） | **1** | **120** | **`Phase.GENERATION`** |
| **INTERPRETATION** | `INTERPRETATION_TOOLS` | `always_pass` | **5** | **60** | **None**（未设） |

关键注释（`factory.py` 原文）：

- `always_pass`（`:78`）：「A gate that admits anything. Used by the phases whose correctness is not checkable from their text output (UNDERSTANDING / INTERPRETATION) and by EXECUTION, which is deterministic and does not go through the ReAct loop at all (RA-F84b) — its gate is never consulted.」
- **GENERATION 的 `sql_syntax_gate` 是 load-bearing 历史**（`:96`–`:103`）：「⚠️ GENERATION uses the real `sql_syntax_gate`, not `always_pass`. This is load-bearing history, not a detail: production once ran `always_pass` here while the eval harness ran the syntax gate, i.e. the evaluation was stricter than production — an inversion that makes eval results systematically optimistic about what production accepts (P0-2 / RA-F85).」
- EXECUTION 的 `always_pass` + `max_attempts=1`：「Deterministic: the pipeline executes the SQL that GENERATION's gate already passed, so the gate here is not consulted (RA-F84b). An execution error falls back to GENERATION carrying the error text (RA-F87).」

工具白名单（`phases.py` `UNDERSTANDING_TOOLS` / `GENERATION_TOOLS` / `EXECUTION_TOOLS` / `INTERPRETATION_TOOLS`，`:96`–`:234`）的精确成员见 `rbi-purpose-arch.md` §4.1（已 cite，不重列）。

### §1.2 转换控制流：一个 turn 如何跑过四阶段（cite `pipeline.py` `run` + 主循环）

源：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/pipeline.py`。

**`run()` 方法**（`:427` `async def run`）的 turn 级编排：

1. **turn 级预算与设施接线**（`:625`–`:679`）：
   - `turn_budget = TurnBudget(max_llm_calls=self._pipeline_config.max_llm_calls_per_turn, ...)`（`:625`–`:626`）——整 turn LLM 调用数硬上限。
   - `system_messages = assemble_system_prompt(state, base_system_prompt)`（`:659`）——组装系统提示词（见 §1.6）。
   - `phase_outputs: dict[Phase, str] = {}`（`:661`）——per-turn per-phase 输出容器。
   - `i = 0`（`:674`）——phase 循环计数器，从第一个 phase 起步。
   - `fallback_count = 0`（`:675`）——fallback 计数器。
   - `first_phase = self._phase_order[0]`（`:676`）——通常 UNDERSTANDING。
   - `exec_budget = _ExecutionBudget(limit=self._pipeline_config.max_executions_per_turn)`（`:679`）——真实 SQL 执行预算。

2. **delivery 观察者接线**（`:608`–`:611`）：在 `TURN_START` 之后调 `attach_delivery_declaration(ctx)`（见 §1.8）。

3. **主 phase 循环**（`:719`–`:930`）——`while i < len(self._phase_order):`：
   - `phase = self._phase_order[i]`（`:722`）。
   - `prefix = system_messages if phase == first_phase else None`（`:726`）——仅第一个 phase 携带完整 system_messages；后续 phase 只带 phase instruction（`:1270` `[Message(role="system", content=self._phase_instruction_for(phase))]`）。
   - **分派**（`:727`–`:743`）：
     - `if phase == Phase.EXECUTION:` → `output, succeeded, tool_facts = await self._run_execution_phase(...)`（`:729`）——确定性执行，不走 ReAct 循环（RA-F84b）。
     - `else:` → `output, succeeded, tool_facts = await self._run_phase(...)`（`:739`）——通用 ReAct 循环 + gate。
   - `phase_outputs[phase] = output`（`:758`）——**无条件写入**（在判成败之前，见 `:947` 注释），供后续 phase 的 context 回灌。
   - **UNDERSTANDING 成功后**（`:778` `if succeeded and phase == Phase.UNDERSTANDING:`）：
     - forced_load 补调（`:852` TABLE_SPEC / `:868` EVENT_SPEC，见 §1.7）。
     - `subquestions = parse_decomposition_plan(output)`（`:878`）——复合问题拆解。
     - `if subquestions and Phase.GENERATION in self._phase_configs:`（`:879`）且 `len(subquestions) <= max_subquestions`（`:880`）→ 跑子问题循环（见 §1.4）。
   - **成功推进**（`:930`）：`i += 1`——前进到下一 phase。
   - **失败处理**（`:910` `if not succeeded:`）：
     - **fallback 决策**（`:917`–`:922`）：`if config.fallback_phase is not None and config.fallback_phase in self._phase_configs and fallback_count < self._pipeline_config.max_fallbacks:` → `fallback_count += 1`（`:921`）、`fallback_idx = self._phase_order.index(config.fallback_phase)`（`:922`）、`i = fallback_idx`（回退到 fallback phase）。
     - **fallback 耗尽 → honest_decline**（`:926`）：`await self._emit_honest_decline(ctx, phase, rewritten, config.max_attempts)` + `break`。

4. **INTERPRETATION 后处理**（`:932`–`:984`）：
   - `interpretation_text = phase_outputs.get(Phase.INTERPRETATION, "")`（`:932`）。
   - `missing_inputs = parse_incomplete_declaration(interpretation_text)`（`:952`）——解析「本轮未完成」声明（见 §1.3）。
   - `if missing_inputs is not None and execution_success:`（`:967`）→ `execution_success = False`（`:984`）+ `_emit_honest_decline`（`:968`）——把模型自报的未完成接进 HONEST_DECLINE 通道。

5. **turn 收尾**（`:1004`–`:1054`）：
   - `max_state_turns` 滑动窗口裁剪（`:1004`–`:1006`）。
   - `TURN_COMPLETE` emit（`:1052`），载荷含 `"success": execution_success`（`:1054`）。

**关键**：rbi 的 phase 转换是 **pipeline 内部决定的**（gate 结果 → 推进 / → fallback），**不是** model-exit（模型调 `exit_<phase>` 工具来推进）。这是 §3(a) 的核心矛盾点。

### §1.3 `_run_phase` 循环：gate 求值如何驱动 advance / retry（cite `pipeline.py` `_run_phase` + `gates.py`）

源：`pipeline.py` `:1216` `async def _run_phase`。

**`_run_phase` 的 attempt 循环**（`:1287` `for attempt in range(config.max_attempts):`）：

1. **PHASE_START emit**（`:1247`）——载荷含 phase 名。
2. **phase instruction 注入**（`:1270`）：`[Message(role="system", content=self._phase_instruction_for(phase))]`——per-phase persona/指令段（见 §1.6）。
3. **AgentLoop.run 调用**（`:1301` `self._loop.run(...)`）——驱动 ReAct 循环（LLM + 工具调用），直到 LLM 不再调工具或 `max_steps` 耗尽。输出 = LLM 最终文本回复。
4. **超时/max_steps 处理**（`:1318` `except (MaxStepsExceeded, TimeoutError) as exc:`）——`limit_text = f"{getattr(self._loop, 'max_steps', '?')} steps"`（`:1338`）。
5. **gate 求值**（`:1341`）：`gate_result = config.gate(output)`——gate 是纯函数，输入 phase 的最终文本输出，输出 `GateResult(passed, reason)`。
6. **GATE_CHECK emit**（`:1346`–`:1347`）：`data={"phase": phase.value, "passed": gate_result.passed, "reason": gate_result.reason}`。
7. **gate 通过**（`:1354` `if gate_result.passed:`）→ PHASE_END emit status=passed（`:1407`–`:1408`），return `(output, True, tool_facts)`——phase 成功。
8. **gate 失败**（`:1417` `if not gate_result.passed:`）：
   - `retry_reason = gate_result.reason or "gate check failed"`（`:1418`）。
   - **GENERATION 特殊路径**（`:1358` `if phase == Phase.GENERATION:`）：critique 解析失败 → emit CLARIFICATION（`:1376`）而非 RETRY——「critique parse-fail → CLARIFICATION（非 retry 循环）」（`:1365` 注释）。中立回应命中 / 超时 → `_emit_honest_decline`（`:1389`）。
   - **RETRY 判定**（`:1431` `if attempt < config.max_attempts - 1:`）→ emit RETRY（`:1435`），载荷含 `retry_reason` + 四态触发源（`:1294`/`:1440` 注释），continue 到下一 attempt。
   - **attempts 耗尽** → PHASE_END emit（失败），return `(output, False, tool_facts)`——phase 失败，由主循环决定 fallback / honest_decline。

**gate 函数**（`gates.py`）：

- `sql_syntax_gate(sql_text)`（`gates.py` `sql_syntax_gate`）：`extract_sql_candidate` 剥围栏 → `_looks_like_sql_attempt`（SQL 关键字检测，避免中文 prose 被误判）→ `sqlglot.parse_one(candidate, read=_DIALECT)`（`:18` `_DIALECT = load_conventions(_DEFAULT_ENGINE).get("sqlglot_dialect", "hive")`）。空 SQL → `GateResult(passed=False, reason="empty SQL")`；syntax error → `GateResult(passed=False, reason=f"syntax error: {e}")`；非 SQL 尝试（无关键字）→ `GateResult(passed=True)`（容错 prose）。
- `always_pass`（`factory.py:78`）：`return GateResult(passed=True)`——UNDERSTANDING/INTERPRETATION（文本不可程序化校验）+ EXECUTION（确定性，gate 从不咨询）。
- `GateResult`（`phases.py:123` `@dataclass class GateResult`）：`passed: bool`、`reason: str | None = None`。

**markers**（`phases.py` + `gates.py`）：
- `_DECOMPOSITION_MARKER = "【拆解】"`（`phases.py:40`）——UNDERSTANDING 输出末尾的拆解块标记。prompt 侧（`pipeline.py:276`）与解析侧（`gates.py _DECOMPOSITION_HEADER_RE`）引用同一个值。
- `_INCOMPLETE_MARKER = "【未完成】"`（`phases.py:58`）——INTERPRETATION 输出里的未完成声明标记。prompt 侧（`pipeline.py:337`）与解析侧（`gates.py _INCOMPLETE_HEADER_RE`）同源。
- `parse_decomposition_plan(text)`（`gates.py`）——解析拆解块 + 编号子问题行，`>=2` 条才返回。
- `parse_incomplete_declaration(text)`（`gates.py`）——**三态**返回：`None`（无声明）、`()`（声明了但无条目，仍算未完成）、`(item, ...)`（有条目）。与拆解解析的「解析不出就当没有」相反，因为未完成声明解析失败退回「报成功」恰好制造 §2.6 要消灭的不可区分态。

### §1.4 max_attempts 记账 + fallback 链（cite `pipeline.py` 主循环 + 子问题循环）

**主循环的 max_attempts 记账**：
- 每个 phase 在 `_run_phase` 内跑 `for attempt in range(config.max_attempts)`（`:1287`）——这是**整段重跑次数**，每次重跑整个 phase（`phases.py:146` `PhaseConfig.max_attempts` 注释：「T5：本字段是整段重试次数——`_run_phase` 的 `for attempt in range(config.max_attempts)`，每次都是重跑整个阶段。」）。
- 真实上界 = `max_attempts × AgentLoop.max_steps`（`:150` 注释：「两者嵌套，真实上界 = 本字段 × 每次最多 max_steps 轮 tool call」）。`DEFAULT_MAX_STEPS = 20`（`factory.py:74`）。

**fallback 链**（主循环 `:910`–`:930`）：
- GENERATION 失败 → `fallback_phase = Phase.UNDERSTANDING`（回退到 UNDERSTANDING，重新检索 + 重新生成）。
- EXECUTION 失败 → `fallback_phase = Phase.GENERATION`（回退到 GENERATION，带着执行错误文本重新生成）。
- fallback 计数 `fallback_count` 上限 = `max_fallbacks = 2`（`phases.py:117` `PipelineConfig.max_fallbacks`），在 `:919` 检查 `fallback_count < self._pipeline_config.max_fallbacks`。
- fallback 耗尽 → `_emit_honest_decline`（`:926`）+ `break`——拆错比弃答更糟，与 qodercli「前序失败后续一并拒绝」同构（`phases.py:120` 注释）。
- UNDERSTANDING / INTERPRETATION **无 fallback**（`fallback_phase = None`）——失败即 honest_decline。

**子问题循环**（`:2081` `async def _run_subquestion_turn`，复合问题路径）：
- 子问题数上限 `max_subquestions = 4`（`phases.py:123`），在 `:880` 检查 `len(subquestions) > self._pipeline_config.max_subquestions` → 超限回退单问题路径。
- 每个子问题跑 GENERATION（`:2124` `self._run_phase`）+ EXECUTION（`:2158` `self._run_execution_phase`）。
- 子问题内部 fallback：`for attempt in range(self._pipeline_config.max_fallbacks + 1):`（`:2123`）——`max_fallbacks + 1` 次尝试（`:2099` 注释）。
- 兄弟子问题隔离：反思是 per-phase 局部容器（`:2119`–`:2130` 注释 + `state.py` D2 注释），不跨子问题泄漏。
- 任一子问题最终失败 → 整体 `honest_decline`（`:2101` / `:2190`）。
- 完成后 emit DECOMPOSITION（`:2214`）——**单问题轮不 emit**（`events.py` 注释）。

### §1.5 budgets 执行点（cite `phases.py` `PipelineConfig` + `pipeline.py` 检查点）

`PipelineConfig`（`phases.py:108` `@dataclass(frozen=True) class PipelineConfig`）收拢 9 个参数。每个在 pipeline.py 的检查/计费点：

| Budget | 值（`phases.py`） | pipeline.py 检查/计费点 |
|---|---|---|
| `max_fallbacks` | **2**（`:117`） | `:919` `fallback_count < self._pipeline_config.max_fallbacks`；子问题循环 `:2123` `range(max_fallbacks + 1)` |
| `max_subquestions` | **4**（`:123`） | `:880` `len(subquestions) > self._pipeline_config.max_subquestions` → 超限回退单问题 |
| `max_executions_per_turn` | **8**（`:131`） | `_ExecutionBudget`（`:345` class），实例化 `:679`；对齐 qodercli `MAX_SQL_PER_TURN`，**含失败执行**（防成本爆炸） |
| `max_llm_calls_per_turn` | **60**（`:142`） | `TurnBudget`（`:625`–`:626`），`consume_llm_call()`（`:640`），抛 `TurnBudgetExceeded` 在 `:531` 捕获 → honest_decline。**定标：60 = 3 × `DEFAULT_MAX_STEPS`(20)**（`:142`–`:155` 注释），测试钉住 `60 == 3 * DEFAULT_MAX_STEPS` |
| `max_state_turns` | **20**（`:170`） | `:1004`–`:1006` 滑动窗口裁剪 `state.turns`，与 `SessionStore.load_history` 的 `max_turns=20` 对齐 |
| `critique_confidence_floor` | **0.6**（`:162`） | evaluator 阈值（`critique_sql_tool` 把 error→0.3/clarify→0.6/warning→0.8/clean→1.0） |
| `quality_score_floor` | **60**（`:167`） | `evaluate_sql_quality` 阈值（100 起扣 -5..-20） |
| `disambiguation_timeout_seconds` | **300.0**（`:175`） | G3 等用户回答消歧的时长，超时降级 honest_decline |
| `forced_table_load_timeout_seconds` | **30.0**（`:181`） | forced_load 整批超时（单个 `wait_for` 包住整批，`:852`） |
| `default_call_timeout_seconds` | **60.0**（`:186`） | pipeline 内联调用默认超时（`QueryRewriter.rewrite`） |

**stall watchdog**：`rbi-purpose-arch.md` §5.10 已 cite `_watch_for_stall`（300s 无事件，排除 `ctx.awaiting_input`——用户思考不会误触）。INFERENCE：此 watchdog 在 da 侧须由 phase-gate 插件在 `agent/turn-stopping` 或独立 watchdog hook 上复刻。

### §1.6 persona / 段装配（cite `prompt.py` `assemble_system_prompt` + `pipeline.py` `_PHASE_INSTRUCTIONS` + `_phase_instruction_for`）

**系统提示词分两部分**（`prompt.py` + `pipeline.py`）：

**A. 通用系统提示词**（`prompt.py` `assemble_system_prompt`，`:23`）——跨 phase 共享，每 turn 组装一次（`pipeline.py:659` 调用）。返回 `list[Message]`：

1. `base_system_prompt`（如果非空）——调用方传入的 base prompt（`pipeline.py:437` `base_system_prompt: str = ""`）。
2. `_game_context_block(scope_id, game_state)`（`prompt.py:46`）——当前 scope 上下文：
   - scope **名字** + ID（T26：名字必须进上下文，否则用户复述当前 scope 名被丢进检索）。
   - `Active tables` / `Active columns`（前 10 列）。
   - `Last SQL`（前 200 字符）。
3. `_intent_block(state)`（`prompt.py:71`）——跨 scope 携带的分析意图（metrics / dimensions / time_range）。
4. `_old_game_summary(previous_scope_id, old_state)`（`prompt.py:83`）——上一个 scope 的摘要（≤800 字符，`_SUMMARY_MAX_CHARS = 800` `:11`）。
5. 最近 `_MAX_RECENT_TURNS = 3` 轮（`prompt.py:8` `_MAX_RECENT_TURNS = 3`，`:99` `_get_recent_turns`）——当前 scope 的近期 turn。

**B. per-phase 指令段**（`pipeline.py` `_PHASE_INSTRUCTIONS` + `_phase_instruction_for`）——每 phase 每 attempt 注入（`:1270`）：

- `_PHASE_INSTRUCTIONS: dict[Phase, str]`（`:251`）——四 phase 各一段 persona/指令文本：
  - `Phase.UNDERSTANDING`（`:252`）。
  - `Phase.GENERATION`（`:281`）。
  - `Phase.INTERPRETATION`（`:317`）。（EXECUTION 不走 ReAct，无 `_PHASE_INSTRUCTIONS` 条目——它在 `_phase_instruction_for` 中 `if phase in _PHASE_INSTRUCTIONS` 条件跳过，`:1271`。）
  - 段内嵌 `_DECOMPOSITION_MARKER`（UNDERSTANDING 段，`:276`）和 `_INCOMPLETE_MARKER`（INTERPRETATION 段，`:337`）——prompt 侧与解析侧同源（`phases.py` 定义，两侧引用同一个常量）。
- `_phase_instruction_for(phase)`（`:2516` `def _phase_instruction_for`）：
  - `base = _PHASE_INSTRUCTIONS[phase]`（`:2518`）。
  - `if phase == Phase.GENERATION:`（`:2519`）→ 追加 `render_conventions_markdown({_DEFAULT_ENGINE})`（SQL 方言 conventions，`rbi_query.conventions` 子模块，`:30` import）——在**运行期**调（`:242` 注释），非启动期缓存。
  - 返回拼接后的段文本。

**段结构镜像目标**（P7 要镜像的）：base + game_context + intent + old_game_summary + last3 turns（通用，跨 phase）+ per-phase instruction（persona + 输出协议 + markers）+ SQL conventions（仅 GENERATION）。

### §1.7 steering（cite `steering.py`）

源：`/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/steering.py`（809B，极简）。

`Steering.switch_game(state, new_scope_id)`（`:5`）——**代码级 scope 切换，无 prompt 注入**（ADR-0025 in-band agent steering）：

- `if state._active_turn: raise RuntimeError("Cannot switch scope during an active turn")`（`:7`–`:8`）——**turn 活跃时禁止切 scope**。
- 保存当前 scope 的 `ScopeState`（如不存在则创建），创建新 scope 的 `ScopeState`，切换 `state.current_scope_id`。

INFERENCE：steering 是「在 turn 之间、由宿主代码调用的 scope 切换」——不是 mid-turn 的模型 steering。与 harness 的 `followup`/`steer`/`inject` send 原语的关系是：harness 的 `steer`（next-step inbox + 唤醒）可在 turn 之间注入 scope 切换信号，但 rbi 的 steering 本身是宿主层调用，不经过模型。

### §1.8 forced_load + delivery declaration（cite `forced_load.py` + `delivery.py`）

**forced_load**（`forced_load.py`）——UNDERSTANDING 阶段结束后的系统级兜底：

- `force_load(spec, candidates, tool_handler, timeout_seconds)`（`forced_load.py` `force_load`）——按 spec 强制补调工具（`load_table_definition` / `load_event_definition`）。
- **两条行为语义必须逐字保留**（`force_load` docstring）：
  1. **顺序 for-await，不是 `asyncio.gather` 并发**——并发会让 `turn_context_id=None` → 服务端建 N 个独立 TurnContext → `known_fields` 打散。顺序执行让所有候选的列聚集到同一 context。
  2. **单个 `asyncio.wait_for` 包住整批，不是每候选各自计时**——超时即整批放弃（返回空表），不返回半批。
- 在 `pipeline.py:852`（TABLE_SPEC）和 `:868`（EVENT_SPEC）调用，在 UNDERSTANDING 成功后、GENERATION 之前。
- +23.5pp 改进（T12a 56% → T14 96.3%，27-case 结构匹配率）——提示词改进被实测证明没用，harness 强制补调是唯一实测有效的修法（`forced_load.py` 模块 docstring）。

**delivery declaration**（`delivery.py`）——`PRESENTATION` 事件的唯一 emit 点：

- `attach_delivery_declaration(ctx)`（`delivery.py` `attach_delivery_declaration`）——在 `pipeline.py:611` turn 起点调用，接 `TurnContext` 上的观察者。
- 两类呈现工具：
  - **入参即载荷**（`PRESENTATION_TOOL_SECTIONS`）：`present_decomposition` → `TOOL_INVOKE` 观察 → 装 `decomposition` 段。
  - **返回值携句柄**（`PRESENTATION_RESULT_TOOL_SECTIONS`）：`present_table`（`view_id` 句柄，数据不在 payload）、`present_clarification`（归一化后的 `questions`/`options`）→ `TOOL_RESULT` 观察。
- `_is_first_delivery_of_this_turn`（`delivery.py`）——从事件缓冲倒扫到最近 `TURN_START`，判「本轮第一次交付」→ `delivery_start` 开幕帧。
- `suggest_followups` → 不走 `delivery_section`，转 `FOLLOWUP_SUGGESTIONS` 事件（`_RESULT_TOOL_EVENT_KEYS`，`delivery.py`）——通道没换、产出方换了。
- **delivery-surface-ownership SPEC**：`view_id` 是不透明字符串，真数据由 mapper 侧 `rbi_web.services.delivery_table` 取——`rbi_agent` 被 import-linter 禁止 import 任何仓内包，这条边界是免费的。

### §1.9 recovery（cite `recovery.py`）

- `render_interrupted_snapshot(snapshot)` / `render_cancelled_snapshot(snapshot)`（`recovery.py`）——把中断 turn 的进度存档渲染为用户可读告知。
- **绝不自动继续**（RA-F130）：`query_data` 非幂等且花钱，崩溃恢复只展示已有产出，不重放。
- 文案确定性声明本轮不会自动继续，用户需重新提问。
- `SqliteActiveTurnStore` 在 turn 进行中快照进度，崩溃后可呈现已完成的 phase + 已生成的 SQL + 已查到的数据。

---

## §2 rbi 自有 loop 与 harness agent-loop 的缝隙

rbi `pipeline.py` 内部做了以下控制流决策，harness agent-loop **无原语**对应——每项须成 phase-gate 插件持有的 per-agent 可变状态 + hook：

| rbi pipeline 内部做的 | harness 对应 | 缺口 → 须插件持有 |
|---|---|---|
| **决定 phase 转换**（gate 结果 → `i += 1` 推进 / `i = fallback_idx` 回退；`pipeline.py:930`/`:922`） | harness agent-loop 只有 `agent/turn-stopping` serial（终止检查点，无 `next()`）+ step 循环（step→step），**无 phase 概念**（`harness-agent-loop.md` §2.2） | per-agent 可变状态：`current_phase: Phase` + `phase_idx: int` + `fallback_count: int`；在 `agent/turn-stopping` 上检查 gate 完成度后推进/回退 |
| **调 gate**（`config.gate(output)` 纯函数，`pipeline.py:1341`） | harness 无「phase 输出 → 程序化 gate 检查」原语。`tools/post-execute` 的 accept/block 是**单工具结果**检查，不是**phase 输出**检查 | per-agent 状态：`phase_output` 累积；在 `agent/turn-stopping`（turn 自然停时）或 `tools/post-execute`（特定工具调用后）上读 `phase_output` → 调 gate → GATE_CHECK 事件 |
| **计 max_attempts**（`for attempt in range(config.max_attempts)`，`pipeline.py:1287`） | harness 无 per-phase attempt 计数。`AgentLoop.max_steps` 是 per-step 上限（`factory.py:74` DEFAULT_MAX_STEPS=20），不是 per-phase 整段重跑计数 | per-agent 状态：`phase_attempts: dict[Phase, int]`；在 `agent/turn-stopping` 上检查 `phase_attempts[current] >= max_attempts` → fallback / honest_decline |
| **计 max_fallbacks**（`fallback_count < max_fallbacks`，`pipeline.py:919`） | 无对应 | per-agent 状态：`fallback_count: int`；在 fallback 决策点检查 |
| **计 max_executions_per_turn**（`_ExecutionBudget`，`pipeline.py:345`/`:679`） | harness 无 turn 级执行预算 | per-agent 状态：`exec_count: int`；在 `tools/post-execute`（query 工具成功后）或 `agent/turn-stopping` 上递增+检查 |
| **计 max_llm_calls_per_turn**（`TurnBudget.consume_llm_call()`，`pipeline.py:640`） | harness **无内置轮次预算**（`harness-agent-loop.md` §3.2 第 4 点 cite `agent-loop/README.zh.md` 已知限制） | per-agent 状态：`llm_call_count: int`；在 `agent/request` waterfall 或 `llm/stream` 上递增+检查，超限 → `agent/turn-stopping` 取消 |
| **forced_load**（UNDERSTANDING 后强制补调检索工具，`pipeline.py:852`/`:868`） | harness 无「phase 结束后系统级强制补调工具」原语 | 在 `agent/turn-stopping`（UNDERSTANDING phase 完成时）或 `tools/post-execute`（特定检索工具后）上触发 forced_load 逻辑 |
| **attach_delivery_declaration**（`pipeline.py:611`，观察 `TOOL_INVOKE`/`TOOL_RESULT` → emit `PRESENTATION`） | harness 有 `tools/pre-execute`/`tools/post-execute`/`tools/result`，但**无「交付声明」概念**——工具结果到交付卡片的装配是 rbi 特有 | per-agent 状态：`delivery_started: bool`（本轮第一次）；在 `tools/post-execute`（present_* 工具后）或 `tools/result` 上观察 → emit 交付事件 |
| **parse_decomposition_plan / parse_incomplete_declaration**（markers 解析，`gates.py`） | harness 无 marker 解析原语 | 在 `agent/turn-stopping` 或 `tools/post-execute` 上读 phase 输出文本 → 调 `parse_*` → emit DECOMPOSITION / HONEST_DECLINE |
| **steering.switch_game**（`steering.py:5`，turn 间 scope 切换） | harness 的 `followup`/`steer`/`inject` send 原语（`harness-agent-loop.md` §2.3 第 1 步）可注入 scope 切换信号 | per-agent 状态：`scope_id`；在 turn 之间（turn/end 之后、turn/start 之前）由宿主层调用 |

**核心缝隙总结**：rbi pipeline 是一个**外置于 AgentLoop 的编排器**——它在 AgentLoop.run 之外决定 phase、调 gate、计预算、驱动转换。harness agent-loop 是唯一具体循环包（`harness-agent-loop.md` §2.1 cite `agent-loop/README.zh.md`「新行为应放入插件，而不是这里」），**没有 phase / gate / fallback / budget 的原生概念**。因此 rbi pipeline 的**全部编排逻辑**须由 phase-gate 插件在 harness 事件 seam 上重新实现。

---

## §3 逐决策 fit-to-da 适合度 + 推荐

### §3(a) phase 转换机制

**rbi 行为**：pipeline 内部 gate-driven 推进（`pipeline.py:930` `i += 1` on success / `:922` `i = fallback_idx` on fallback）。**不是** model-exit——模型不调 `exit_<phase>` 工具来推进；pipeline 在 gate 通过后单方面决定前进。

**映射的 harness seam**：两选项——
1. **model-driven exit 工具**（à la `exit_plan_mode`）：模型调 `advance_phase` 工具 → `tools/post-execute` 推进 phase。
2. **`agent/turn-stopping` serial 检查点**（`harness-agent-loop.md` §2.2 cite `agent.ts` `turn`）：turn 自然停且 next-step 空时 → phase-gate 插件读 gate 完成度 → 推进/回退。

**适合度**：
- **选项 1（model-driven exit）**：**低**。rbi 的 phase 转换是**内部的**（pipeline 决定，非模型决定）。让模型调 `exit_<phase>` 等于把 phase 推进权交给模型——**语义位移**：rbi 是「gate 通过 → pipeline 推进」（模型不知道 gate 结果），model-exit 是「模型决定推进」（模型可能 gate 未通过就推进，或 gate 已通过但不推进）。rbi 的 `sql_syntax_gate` 恰好是「模型不知道 gate 是否通过」的关键——GENERATION 失败时模型被 RETRY 事件驱动重试，不是模型自己决定退出。
- **选项 2（`agent/turn-stopping` 检查点）**：**高**。`agent/turn-stopping` 是 serial（无 `next()`），每步自然停时触发——这正是 rbi pipeline 在 `_run_phase` 的 attempt 循环中「AgentLoop.run 结束 → 调 gate → 决定推进/重试」的对应点。phase-gate 插件在此处读当前 phase 输出 → 调 gate → 通过则推进 `phase_idx` + 更新 `current_phase`，未通过则检查 `attempts < max_attempts` → RETRY / fallback / honest_decline。

**推荐**：**选项 2（`agent/turn-stopping` serial 检查点驱动 phase 转换）**。忠实再表达 rbi 的「pipeline 内部决定」语义——phase 转换不经过模型，由 phase-gate 插件在 turn-stopping 处程序化决定。

**细节**：
- `agent/turn-stopping` 的 serial 回调可返回取消动作（`harness-agent-loop.md` §2.2）——rbi 的 honest_decline / fallback 耗尽 → 取消 turn 对应 `agent.cancel(cause)`。
- phase 推进后，下一 step 的 `system-prompt/assemble` 会读 `current_phase` → 切换 persona/段（见 §3(c)）。
- INFERENCE：rbi 的 `_run_phase` 在一个 turn 内跑多个 attempt（`for attempt in range(max_attempts)`），每个 attempt 是一次 AgentLoop.run。harness 对应：一个 turn 内多个 step（每个 step 是一次 LLM+tools 循环），phase-gate 插件在 `agent/turn-stopping` 上决定「继续当前 phase 的下一 attempt」vs「推进 phase」vs「fallback」vs「honest_decline + 取消」。

### §3(b) gate 落地

**rbi 行为**：
- UNDERSTANDING / INTERPRETATION：`always_pass`（文本不可程序化校验）。
- GENERATION：`sql_syntax_gate`（load-bearing——`extract_sql_candidate` → `_looks_like_sql_attempt` → `sqlglot.parse_one`）。
- EXECUTION：`always_pass`（**never consulted**——确定性执行，gate 从不调用，RA-F84b）。

**映射的 harness seam**：
- `tools/post-execute` waterfall（accept/block/replace/attach context，`harness-agent-loop.md` §2.5）——检查**单工具结果**。
- `ctx.tools.guard()`（单调、下游不可翻案，`harness-agent-loop.md` §3.1）——硬拒绝非白名单调用。
- `agent/turn-stopping` serial——检查 **phase 输出**（非单工具结果）。

**适合度与推荐**：

- **GENERATION 的 `sql_syntax_gate`**：**中**（需拆分）。da 的 SQL critic 已拆分：
  - **P13 NL→SQL 引擎**负责**生成期 critique**（`p6-nl2sql-feasibility.md` §1.3 cite rbi `critique_sql_tool` = 预执行静态校验，sqlglot+hive 代理，fail-open，无执行反馈闭环）。INFERENCE：P7 的 `sql_syntax_gate`（纯语法检查）在 da 侧应放在 `agent/turn-stopping`——GENERATION phase 的 LLM 输出（SQL 候选文本）在 turn 自然停时被 `extract_sql_candidate` + `sqlglot.parse_one` 检查。这**不是** `tools/post-execute`（因为 `sql_syntax_gate` 检查的是 phase 的**最终文本输出**，不是某个工具的返回值）。**P7 STUB**：若 P13 NL→SQL 引擎未就绪，`sql_syntax_gate` 可先用 sqlglot 独立实现（它是零外部依赖的纯函数，`gates.py` 只 import `sqlglot` + `rbi_query.conventions`）。
  - **P4 tool-query 会话门 + `ctx.query.execute` engine-wrapper guard chain**负责**执行期**门控（`p4-guard-chain-placement.md` §4.2 A1-split 决策表：tool-query consumer 拥 G1/G5/budget/near-dup/halt/cache/required_predicates；`ctx.query.execute` 拥 cost/timeout/retry/orphan）。INFERENCE：rbi 的 `sql_syntax_gate` 与 P4 的 guard chain **不重叠**——前者是生成期语法检查（在 SQL 被提交执行之前），后者是执行期资源/安全检查（在 SQL 被提交执行时）。P7 的 `sql_syntax_gate` 在 `agent/turn-stopping`（GENERATION phase 完成时）检查，P4 的 guard chain 在 `ctx.query.execute`（EXECUTION phase 的 query 工具调用时）检查。

- **UNDERSTANDING / INTERPRETATION 的 `always_pass`**：**高**。直接在 `agent/turn-stopping` 上调 `always_pass`（返回 `GateResult(passed=True)`），无条件推进。INFERENCE：这两个 phase 的「gate」实际上是**no-op**——它们的「完成条件」是模型不再调工具（turn 自然停），而非程序化检查。phase-gate 插件在 `agent/turn-stopping` 上只需确认「turn 自然停」即推进。

- **EXECUTION 的 `always_pass`（never consulted）**：**高**。EXECUTION 是确定性执行（`pipeline.py:727` 分派到 `_run_execution_phase` 而非 `_run_phase`），不走 ReAct 循环。INFERENCE：da 侧 EXECUTION 对应 P4 的 `tool-query` consumer + `ctx.query.execute`——query 工具调用的 `tools/post-execute` 结果即是 phase 输出。gate 从不调用，因为 EXECUTION 的成败由 query 工具的返回值（3-state `QueryOutcome`）直接决定，不由文本 gate 检查。

**推荐**：
- GENERATION `sql_syntax_gate` → `agent/turn-stopping`（phase 输出检查，**非** `tools/post-execute`）。P7 用 sqlglot 独立实现（STUB for P13 完整 critic）。
- UNDERSTANDING / INTERPRETATION `always_pass` → `agent/turn-stopping`（no-op 推进）。
- EXECUTION → 不设 gate（`always_pass` never consulted），成败由 `ctx.query.execute` 的 3-state `QueryOutcome` 直接驱动 `agent/turn-stopping` 的推进/fallback。

### §3(c) persona / 段放置

**rbi 行为**：`assemble_system_prompt`（通用 base+game+intent+old_summary+last3）每 turn 组装一次（`pipeline.py:659`）；`_phase_instruction_for(phase)`（per-phase persona+输出协议+markers+SQL conventions）每 attempt 注入（`:1270`）。两部分分离。

**映射的 harness seam**：
- harness 的 `system-prompt/assemble` waterfall（`harness-agent-loop.md` §2.4 cite `system-prompt/README.zh.md`）——每步组装一次，可替换组装结果。
- `section()` 行（`harness-agent-loop.md` §2.4：`order` 升序、`complete:true` 段抑制其他所有段）。
- `context()` 行（有序动态上下文，运行时成为带来源的 user 快照）。

**适合度与推荐**：

- **通用段（base+game+intent+old_summary+last3）**：**高**。作为 preset 的 `section()` 行 + `context()` 行挂载，由 harness 每步组装。`base_system_prompt` → persona `section`；`_game_context_block` / `_intent_block` / `_old_game_summary` → `context()` 行（运行时从 per-agent state 读取）；`_get_recent_turns` → `context()` 行（从 session log 读取）。

- **per-phase 指令段（`_PHASE_INSTRUCTIONS`）**：**中**（需决定一个 complete 段 vs 四个切换段）。
  - **选项 A：一个 `complete:true` 段按 phase 切换 `text`**——`harness-agent-loop.md` §2.4：「`complete:true` 段抑制其他所有段」。phase-gate 插件在 `system-prompt/assemble` waterfall 上读 `current_phase` → 替换该段的 `text` 为 `_PHASE_INSTRUCTIONS[current_phase]`。优点：phase 切换是原子的（一个段替换），与 rbi 的「每 attempt 注入一个 phase instruction」语义一致。缺点：`complete:true` 会抑制其他段——通用段须合并进这一个段，或通用段也由 phase-gate 插件在 assemble 上动态拼接。
  - **选项 B：四个独立 `section()` 行，按 phase 的 `order` 值选择性激活**——但 harness 的 `section()` 不支持运行时按条件抑制（`complete:true` 是段级标记，不是运行时条件）。INFERENCE：需要 phase-gate 插件在 `system-prompt/assemble` waterfall 上过滤段——读 `current_phase`，只保留对应 phase 的段 + 通用段。
  - **选项 C：persona 放 preset `section()` 行（静态），phase-specific 指令放 `context()` 行（动态）**——persona（跨 phase 共享的角色定义）作为静态 `section()` 行挂载；`_PHASE_INSTRUCTIONS` 的内容作为 `context()` 行（运行时由 phase-gate 插件按 `current_phase` 注入）。

**推荐**：**选项 C（persona 放 preset section，phase 指令放动态 context）**。理由：
1. persona（如「你是数据取数 agent」）跨 phase 共享，适合静态 `section()` 行——与 `standard` preset 的 `dsh-persona` 行同构（`harness-agent-loop.md` §1.2 cite `standard/agent.cordis.yml`）。
2. `_PHASE_INSTRUCTIONS` 的内容（输出协议、markers、SQL conventions）是**按 phase 切换的动态段**，适合 `context()` 行——phase-gate 插件在 `system-prompt/assemble` waterfall 或 `agent/pre-step` 上读 `current_phase` → 注入对应段文本。
3. 避免用 `complete:true`（它会抑制其他段，增加组装复杂度）。
4. 与 rbi 的分离结构一致：通用段（`assemble_system_prompt`）≈ preset section + context；per-phase 段（`_phase_instruction_for`）≈ 动态 context。

**SQL conventions**（`render_conventions_markdown`，仅 GENERATION）：作为 GENERATION phase 的 `context()` 行附加内容，由 phase-gate 插件在 `current_phase == GENERATION` 时注入。

### §3(d) budgets 迁移

**rbi 行为**：`PipelineConfig`（`phases.py:108`）收拢 9 个参数（`max_fallbacks=2` / `max_subquestions=4` / `max_executions_per_turn=8` / `max_llm_calls_per_turn=60` / `max_state_turns=20` / `critique_confidence_floor=0.6` / `quality_score_floor=60` / `disambiguation_timeout_seconds=300.0` / `forced_table_load_timeout_seconds=30.0`）。定标关系：`max_llm_calls_per_turn=60 = 3 × DEFAULT_MAX_STEPS(20)`（`phases.py:142`–`:155` 注释 + 测试钉住）。

**映射的 harness seam**：
- harness **无原生 turn 预算**（`harness-agent-loop.md` §3.2 第 4 点 cite `agent-loop/README.zh.md` 已知限制：「没有内置轮次预算」）。
- `agent/turn-stopping` serial 是「限制失控轮次的策略必须从既有生命周期扩展点执行取消」的唯一原生处。

**适合度与推荐**：

- **采用 rbi 值作初始默认，后由 evals/R8 重定标**：**高**。理由：
  1. rbi 值有**实测定标依据**——`max_llm_calls_per_turn=60 = 3 × DEFAULT_MAX_STEPS(20)`，读作「一个 turn 最多烧掉三个 attempt 的满额步数」（`phases.py:142` 注释）。da 侧 `DEFAULT_MAX_STEPS` 也应取 20（`factory.py:74`：「Every measured call site passes 20」），故 60 的定标关系可直接迁移。
  2. rbi 值有**测试钉住**——`test_turn_budget_r6.py` 断言 `60 == 3 * DEFAULT_MAX_STEPS`（`phases.py:151` 注释）。
  3. da 侧尚无真实 LLM 调用数/turn 的分布数据（R8 计数器未落地），**现在重定标是凭空估计**。`phases.py:157` 注释：「📌 落码后应回头收紧一次：R8 的计数器落地后本仓第一次有 LLM 调用数/turn 的真实分布，届时按 P99 重新定 60。在那之前不得由落码 session 静默改。」
  4. 采用 rbi 值 = 忠实再表达；重定标留作 R8 后的独立决策。

- **budget 检查点迁移**：
  - `max_llm_calls_per_turn=60` → phase-gate 插件在 `agent/request` waterfall 或 `llm/stream` 上递增 `llm_call_count`，超限 → `agent/turn-stopping` 取消 turn。
  - `max_executions_per_turn=8` → phase-gate 插件在 `tools/post-execute`（query 工具成功后）递增 `exec_count`，超限 → honest_decline。
  - `max_fallbacks=2` → phase-gate 插件在 fallback 决策点检查。
  - `max_subquestions=4` → phase-gate 插件在 `parse_decomposition_plan` 后检查。
  - `max_state_turns=20` → phase-gate 插件在 turn 收尾处裁剪 session log 滑动窗口（INFERENCE：harness 的 `SessionStore` 可能有类似机制，需确认）。
  - `disambiguation_timeout_seconds=300.0` → phase-gate 插件在 CLARIFICATION 后设 watchdog，超时 → honest_decline。
  - `forced_table_load_timeout_seconds=30.0` → forced_load 逻辑内的 `asyncio.wait_for` 超时。
  - `critique_confidence_floor=0.6` / `quality_score_floor=60` → GENERATION phase 的 evaluator 阈值（P13 NL→SQL 引擎负责，P7 STUB）。

**推荐**：采用 rbi 值作初始默认（`max_fallbacks=2` / `max_subquestions=4` / `max_executions_per_turn=8` / `max_llm_calls_per_turn=60` / `max_state_turns=20` / `disambiguation_timeout_seconds=300.0` / `forced_table_load_timeout_seconds=30.0`），后由 R8 evals 重定标。phase-gate 插件持有 per-agent 可变计数器，在对应 harness seam 上检查。

### §3(e) steering / forced_load / delivery 再表达

**steering**（`steering.py`）：
- rbi 的 `switch_game` 是**turn 间宿主层调用**（`if state._active_turn: raise`），不经过模型。
- 映射到 harness 的 `followup`（next-turn FIFO + 唤醒，`harness-agent-loop.md` §2.3 第 1 步）——宿主在 turn 结束后用 `followup` 注入 scope 切换信号，phase-gate 插件在 `turn/start`（或 `agent/pre-step`）上读取信号 → 调 `switch_game` 逻辑（更新 `scope_id` + 切换 `ScopeState`）。
- **适合度：高**。harness 的 `followup` 天然是 turn 间注入点。phase-gate 插件在 `agent/pre-step` waterfall 上读 `current_scope_id` → 注入 `_game_context_block` / `_old_game_summary` 到 `context()` 行。
- INFERENCE：harness 的 `steer`（next-step inbox + 唤醒）和 `inject`（next-step inbox 不唤醒）不适用于 scope 切换——scope 切换是 turn 间操作，不是 mid-turn 操作。rbi 的 `state._active_turn` 禁止 mid-turn 切换与 harness 的 turn 边界语义一致。

**forced_load**（`forced_load.py`）：
- rbi 在 UNDERSTANDING 成功后、GENERATION 之前强制补调 `load_table_definition` / `load_event_definition`（`pipeline.py:852`/`:868`）。
- 映射到 harness：phase-gate 插件在 `agent/turn-stopping`（UNDERSTANDING phase 完成时）上触发 forced_load 逻辑——读 `search_data_sources` 的 TOOL_RESULT 事件 → 提取候选名 → 程序化调用 `load_table_definition` / `load_event_definition`（不经模型，直接调 `ctx.tools.get(name)` 的 handler）。
- **两条行为语义必须逐字保留**（`forced_load.py` `force_load` docstring）：① 顺序 for-await（非 gather）；② 单个 `wait_for` 包住整批。
- **适合度：中**。harness 的 `tools/result` 是仅观测的同步通知——phase-gate 插件可在此观察 `search_data_sources` 的结果，但**程序化调用另一个工具**需要绕过模型直接调 handler。INFERENCE：harness 的 `ctx.tools` 可能有 `execute` API（`harness-agent-loop.md` §3.1 cite `ToolRuntime` 的 `execute`），phase-gate 插件可在 `agent/turn-stopping` 上程序化调 `ctx.tools.execute('load_table_definition', {table_name: ...})`——不经模型、不经 `tools/pre-execute`/`guard`（因为是系统级强制补调，不是模型发起）。需确认 harness 是否允许插件程序化调工具。

**delivery declaration**（`delivery.py`）：
- rbi 的 `attach_delivery_declaration` 观察 `TOOL_INVOKE`（present_decomposition）和 `TOOL_RESULT`（present_table/present_clarification）→ emit `PRESENTATION` 事件。
- 映射到 harness：phase-gate 插件在 `tools/post-execute`（present_* 工具后）和 `tools/result`（仅观测）上观察 → 装配交付声明 → emit 交付事件。
- `_is_first_delivery_of_this_turn` 的「从事件缓冲倒扫到最近 TURN_START」逻辑 → phase-gate 插件持有 `delivery_started: bool` per-turn 状态。
- **适合度：高**。harness 的 `tools/post-execute` waterfall 可 accept/replace/attach context——phase-gate 插件在 present_* 工具的 `tools/post-execute` 上装配交付声明，emit 交付事件。
- **P7 STUB**：INTERPRETATION 的 presentation 工具（present_table / present_decomposition / suggest_followups）在 da 侧尚未定义（`map.md` Not-yet-specified「tool-query consumer」雾区）。P7 须 STUB 这些工具或仅做接线框架。

**推荐**：
- steering → `followup`（turn 间）+ `agent/pre-step`（读 scope → 注入 context）。
- forced_load → `agent/turn-stopping`（UNDERSTANDING 完成时触发）+ 程序化 `ctx.tools.execute`（绕过模型）。保留顺序 for-await + 单 `wait_for` 整批语义。
- delivery → `tools/post-execute`（present_* 工具后装配）+ per-turn `delivery_started` 状态。P7 STUB presentation 工具。

---

## §4 忠实形态草图：preset overlay + phase-gate 插件

### §4.1 preset overlay（`agent.cordis.yml`）

在 `apps/cli/config/agent-presets/data-agent/agent.cordis.yml`（或用户 home `${DSH_HOME}/.agent-presets/data-agent/`）挂以下行（cite `harness-agent-loop.md` §1.2 `standard/agent.cordis.yml` 行结构 + §4.2A「一个 preset 组装四阶段全部能力」）：

```yaml
# ── persona（跨 phase 共享的角色定义，静态 section 行）──────────
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are a data agent powered by the {{model}} model.
      Your working directory is {{cwd}}.
      You answer business data questions through a four-phase pipeline:
      understanding → generation → execution → interpretation.

# ── 全阶段工具（保目录稳定，KV cache 友好；phase 门控由插件 guard() 硬拒绝）──
- id: tool-bash              # agent 自身执行用（map Q9），P10 门控给业务用户
  name: '@deepseek-ai/dsh-tool-bash'
- id: tool-code-runtime      # 同上
  name: '@deepseek-ai/dsh-tool-code-runtime'
# ── data 能力插件行（P4-P11 填，P7 挂框架；cite p8-audit-scope.md §cordis.patch.yml:60-72）──
- id: query-engine            # P4 ctx.query
  name: '@deepseek-ai/dsh-query'
- id: embedder                # P5 ctx.embedder
  name: '@deepseek-ai/dsh-embedder'
- id: retrieval               # P5 ctx.retrieval
  name: '@deepseek-ai/dsh-retrieval'
- id: semantic-layer          # P6 in-process
  name: '@deepseek-ai/dsh-semantic-layer'
- id: audit                   # P8 ctx.audit
  name: '@deepseek-ai/dsh-audit'
- id: llm-dashscope           # P2 direct LLM
  name: '@deepseek-ai/dsh-llm-dashscope'
- id: subagent-qoder          # P3 query() delegation
  name: '@deepseek-ai/dsh-subagent-qoder'

# ── phase-gate 插件（per-agent 可变状态 + hook 注册）──────────────
- id: phase-gate-plugin
  name: '@deepseek-ai/dsh-phase-gate-plugin'  # P7 新增包
  isolate:
    dataAgentPhaseGate: true   # entry-local realm（cite harness-agent-loop.md §1.2 isolate）

# ── compaction（长会话压缩，镜像 rbi 的 max_state_turns=20 滑动窗口）──
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
```

**关键决策**：
- **全阶段工具一次性挂载**——保目录稳定（KV cache 友好，cite `harness-agent-loop.md` §3.2 第 3 点 plan-mode 注释 + §4.2A）。**不做**「每阶段切一套工具白名单」。
- **persona 是一行**（跨 phase 共享）——per-phase 指令段由 phase-gate 插件在 `system-prompt/assemble` / `agent/pre-step` 上动态注入（§3(c) 选项 C）。
- **phase-gate 插件用 `isolate` realm**——entry-local 实例，不与其他 preset 共享（cite `harness-agent-loop.md` §1.2 `isolate`）。
- **model routing 不进 preset**——用 `installAgentLlmTarget`（cite `harness-agent-loop.md` §1.2 + §4.2C）。

### §4.2 phase-gate 插件（每 phase 哪些 seam / hook）

phase-gate 插件在 `setup(agentCtx)` 内（cite `harness-agent-loop.md` §4.2B + §1.4 `setup` 唯一调用点）注册以下 hook：

**per-agent 可变状态**（插件持有，per session/agent key）：
```typescript
{
  current_phase: Phase,           // UNDERSTANDING | GENERATION | EXECUTION | INTERPRETATION
  phase_idx: number,              // 0..3
  fallback_count: number,        // 0..max_fallbacks=2
  phase_attempts: Map<Phase, number>,  // per-phase attempt 计数
  llm_call_count: number,         // 0..max_llm_calls_per_turn=60
  exec_count: number,             // 0..max_executions_per_turn=8
  delivery_started: boolean,      // per-turn 第一次交付
  scope_id: string,               // 当前 scope
  phase_output: string,           // 当前 phase 的累积输出文本
  // ... per-turn 重置的状态在 turn/start 上清零
}
```

**每 phase 的 hook 注册**：

| Phase | guard() 白名单 | turn-stopping 预算/推进 | post-execute gate/fallback | request 模型 | system-prompt/assemble 段切换 |
|---|---|---|---|---|---|
| **UNDERSTANDING** | `UNDERSTANDING_TOOLS`（search_data_sources / load_table_definition / load_event_definition / load_table_dimensions / present_clarification / save_accumulated_definition ∪ UNIVERSAL） | gate=`always_pass`（no-op 推进）；forced_load 触发（程序化调 load_table/event_definition） | 无（gate always_pass） | 默认模型 | 注入 UNDERSTANDING persona + 输出协议（含 `_DECOMPOSITION_MARKER`） |
| **GENERATION** | `GENERATION_TOOLS`（critique_sql_tool / evaluate_sql_quality ∪ UNIVERSAL） | gate=`sql_syntax_gate`（**P7 STUB**：sqlglot 独立实现，P13 完整 critic 未就绪）；max_attempts=5；fallback=UNDERSTANDING | critique parse-fail → CLARIFICATION（非 RETRY） | 默认模型 | 注入 GENERATION persona + 输出协议 + SQL conventions（`render_conventions_markdown`） |
| **EXECUTION** | `EXECUTION_TOOLS`（query_data ∪ UNIVERSAL） | gate=`always_pass`（never consulted）；max_attempts=1；fallback=GENERATION（携带错误文本） | query 工具 3-state `QueryOutcome` 直接驱动推进/fallback（**P4 tool-query + ctx.query.execute** 现成可用） | 默认模型 | 无 phase instruction（确定性执行，不走 ReAct） |
| **INTERPRETATION** | `INTERPRETATION_TOOLS`（present_decomposition / present_table / compute / record_template_usage / suggest_followups ∪ UNIVERSAL） | gate=`always_pass`；max_attempts=5；无 fallback | `parse_incomplete_declaration` → HONEST_DECLINE；delivery 装配（present_* 工具 → 交付事件） | 默认模型 | 注入 INTERPRETATION persona + 输出协议（含 `_INCOMPLETE_MARKER`） |

**hook 注册细节**：

1. **`ctx.tools.guard()`（经 `agent.ctx`）**——核心硬门控（cite `harness-agent-loop.md` §3.1 + §4.2B）。读 `current_phase` + 该 phase 工具白名单，拒绝白名单外调用。单调、下游不可翻案。**保持可见工具目录稳定**（cache 友好），同时在执行时硬拒绝越界调用。

2. **`agent/turn-stopping` serial**——phase 转换 + 预算检查 + fallback / honest_decline（cite `harness-agent-loop.md` §2.2 + §4.2B）。回调逻辑：
   - 读 `phase_output` → 调 `config.gate(output)` → GATE_CHECK 事件。
   - gate 通过 → `phase_idx += 1`、`current_phase = next`、`phase_attempts[next] = 0`、重置 per-phase 状态。
   - gate 失败 → `phase_attempts[current] += 1`；`if attempts < max_attempts` → RETRY 事件（继续当前 phase）；`else if fallback_phase` → `fallback_count += 1`、`phase_idx = fallback_idx`、`current_phase = fallback`；`else` → HONEST_DECLINE 事件 + `agent.cancel(cause)`。
   - 预算检查：`llm_call_count >= 60` / `exec_count >= 8` / `fallback_count >= 2` → HONEST_DECLINE + 取消。

3. **`tools/post-execute` waterfall**——gate/fallback for 特定工具 + delivery 装配（cite `harness-agent-loop.md` §2.5 + §4.2B）。
   - GENERATION：critique_sql_tool 返回 → 检查 `critique_confidence_floor=0.6` / `quality_score_floor=60` → accept/block。
   - EXECUTION：query 工具返回 → 检查 3-state `QueryOutcome` → 推进/fallback。
   - INTERPRETATION：present_* 工具返回 → 装配交付声明 → emit 交付事件；`parse_incomplete_declaration` → HONEST_DECLINE。
   - `additionalContexts` 注入纠正性上下文（如执行错误文本回灌 GENERATION）。

4. **`agent/request` waterfall**——per-phase 模型/推理强度（cite `harness-agent-loop.md` §2.3 第 5 步 + §4.2C）。读 `current_phase` → 改写 `proposedConfig`（provider/model/reasoningEffort）。INFERENCE：P7 默认四阶段用同一模型（rbi 的 DashScope qwen-plus），后续实验可按 phase 切模型。

5. **`system-prompt/assemble` waterfall**（或 `agent/pre-step`）——per-phase persona/段切换（cite `harness-agent-loop.md` §2.4 + §4.2B + §3(c) 选项 C）。读 `current_phase` → 注入 `_PHASE_INSTRUCTIONS[current_phase]` 到 `context()` 行；GENERATION 额外注入 `render_conventions_markdown`。

6. **`turn/start`**（或 `agent/pre-step`）——per-turn 状态重置（`phase_attempts` 清零、`llm_call_count = 0`、`exec_count = 0`、`delivery_started = false`、`phase_output = ""`）+ 读 scope → 注入 `_game_context_block` / `_old_game_summary`。

### §4.3 P7 须 STUB vs 现成可用

**P7 须 STUB**（未就绪，需 STUB 或接线框架）：

| 能力 | 原因 | STUB 形态 |
|---|---|---|
| **GENERATION critic（`critique_sql_tool` / `evaluate_sql_quality`）** | P13 NL→SQL 引擎未解（`p6-nl2sql-feasibility.md` §1.3：rbi 的 critique 是预执行静态校验，sqlglot+hive 代理，fail-open，无执行反馈闭环） | `sql_syntax_gate` 用 sqlglot 独立实现（零外部依赖，`gates.py` 只 import sqlglot + `rbi_query.conventions`）；`critique_sql_tool` / `evaluate_sql_quality` 工具 STUB（返回固定 clean/1.0） |
| **INTERPRETATION presentation 工具（`present_table` / `present_decomposition` / `present_clarification` / `suggest_followups` / `compute`）** | da 侧交付面尚未定义（`map.md` Not-yet-specified 雾区） | 工具 STUB（接收参数、记录调用、返回固定 payload）；delivery 装配逻辑可接线（观察 `tools/post-execute` → emit 交付事件框架） |
| **tool-query consumer** | Not-yet-specified（`map.md`：query-trio 剩余生产 tool-query+engine-wrapper guard chain 见 Not-yet-specified） | P4b 已落地 `packages/query/{query,query-maxcompute}/`（`map.md` cite `ctx.query.execute` + 3-state `QueryOutcome`）；tool-query consumer（会话门 G1/G5/budget/near-dup/halt/cache）STUB |

**现成可用**（已落地或已定义，P7 可直接接）：

| 能力 | 来源 |
|---|---|
| **`ctx.query`** | P4b `packages/query/query/`（`map.md` P4b resolved：abstract `QueryEngine extends Service` + `ctx.query` + execute/attach/cancel/getProgress + 3-state `QueryOutcome`） |
| **`ctx.schema`**（INFERENCE：即 semantic-layer） | P6 in-process（`p8-audit-scope.md` cite `cordis.patch.yml:60-72`：`semantic-layer` P6 in-process） |
| **`ctx.embedder`** | P5（`vector-rbi-mirror.md` cite `ctx.embedder` seam；`vectorization-frontier.md` §7：契约 `embed(texts) -> list[vec]` + `dim`/`model`） |
| **`ctx.retrieval`** | P5（`vectorization-frontier.md` §7：hybrid 检索 BM25+vec+reranker 作为 retriever 插件组合） |
| **`ctx.audit`** | P8（`p8-audit-scope.md`：guard/session-event + tool-audit + `ctx.storage` SQLite） |
| **subagent-qoder** | P3（`p8-audit-scope.md` cite `query()` delegation，`SDKMessage`→harness streaming adapter，PAT auth） |
| **`ctx.tools.guard()`** | harness 原生（`harness-agent-loop.md` §3.1） |
| **`agent/turn-stopping` serial** | harness 原生（`harness-agent-loop.md` §2.2） |
| **`tools/post-execute` waterfall** | harness 原生（`harness-agent-loop.md` §2.5） |
| **`agent/request` waterfall** | harness 原生（`harness-agent-loop.md` §2.3 第 5 步） |
| **`system-prompt/assemble` waterfall** | harness 原生（`harness-agent-loop.md` §2.4） |
| **`ctx.tools.restrict()`** | harness 原生（per-agent 掩码，`harness-agent-loop.md` §3.1） |

---

## §5 暴露的开放风险 / 张力

### §5.1 model-driven phase exit vs rbi 内部转换 = 语义位移

**风险**：若 P7 误选 model-driven exit（§3(a) 选项 1），phase 推进权交给模型——rbi 的 `sql_syntax_gate` 恰是「模型不知道 gate 结果」的关键（GENERATION 失败时模型被 RETRY 驱动重试，不是模型自己决定退出）。model-exit 会让模型在 gate 未通过时推进，或 gate 已通过但不推进。

**缓解**：采用 §3(a) 选项 2（`agent/turn-stopping` serial 检查点驱动）——phase 转换不经过模型，由 phase-gate 插件程序化决定。但这带来新风险：`agent/turn-stopping` 只在 turn 自然停（next-step 空）时触发——若模型持续调工具不自然停（如 rbi 的 `_run_phase` 中 AgentLoop 跑到 `max_steps` 耗尽），phase-gate 插件须在 `MaxStepsExceeded` 对应的 harness 事件（INFERENCE：可能是 `agent/request-error` 或 step 循环的自然结束）上也能触发 gate 检查。需确认 harness 的 step 循环在 `max_steps` 耗尽时是否触发 `agent/turn-stopping`。

### §5.2 gate 跨 P13 / tool-query 拆分

**风险**：rbi 的 `sql_syntax_gate`（生成期语法检查）与 P4 的 guard chain（执行期资源/安全检查）在 da 侧被拆到不同层——`sql_syntax_gate` 在 `agent/turn-stopping`（GENERATION phase 完成），P4 guard chain 在 `ctx.query.execute`（EXECUTION phase 的 query 工具调用）。若两层之间的 SQL 文本不一致（如 `tools/post-execute` 改写了 SQL），gate 检查的 SQL ≠ 被执行的 SQL。

**缓解**：cite `gates.py` `extract_sql_candidate` docstring 的「被评审的 SQL 恒等于被执行的 SQL」（Guard Chain 同源）原则——phase-gate 插件在 `agent/turn-stopping` 上提取的 SQL 候选必须与 `ctx.query.execute` 收到的 SQL 同源。INFERENCE：P7 须确保 GENERATION phase 的最终输出文本（经 `extract_sql_candidate` 提取）就是 EXECUTION phase 传给 `ctx.query.execute` 的 SQL——中间不得有 `tools/post-execute` 的 `replace` 改写。

### §5.3 persona-as-preset-section 与 standard preset 的 planning group + goal/todo/plan Q8 共存

**风险**：`map.md` Q8 决定保留 goal/todo/plan（不禁用），四阶段 Pipeline 作默认编排。但 `standard` preset 的 planning group（`harness-agent-loop.md` §1.2 cite `standard/agent.cordis.yml` `cordis:group` + `isolate: planMode: true`）与四阶段 phase-gate 插件可能冲突——planning group 的 `exit_plan_mode` 工具是 model-driven exit（§3(a) 选项 1），与四阶段的 `agent/turn-stopping` 驱动转换语义不同。

**缓解**：INFERENCE：goal/todo/plan 与四阶段 Pipeline 是**两种编排模式**——`map.md` Q8 说「后期实验对比 Pipeline vs goal/todo/plan（不同模型可能不同搭配）」。P7 的 data-agent preset **不挂** planning group（四阶段 Pipeline 是默认编排）；goal/todo/plan 作为可选编排在另一 preset 或 mode 中保留。两者不共存于同一 preset。需确认 harness 是否允许 preset 级别选择编排模式。

### §5.4 forced_load 程序化调工具绕过模型

**风险**：rbi 的 forced_load 在 UNDERSTANDING 后强制补调检索工具（`forced_load.py`），不经模型。harness 的 `ctx.tools.guard()` 是**执行时门控**——它检查模型发起的工具调用。若 phase-gate 插件程序化调 `ctx.tools.execute('load_table_definition', ...)` 绕过模型，是否经过 `guard()`？若经过，`guard()` 会因 `current_phase == GENERATION`（forced_load 在 UNDERSTANDING 后、GENERATION 前触发，`current_phase` 可能已是 GENERATION）拒绝 `load_table_definition`（非 GENERATION 白名单）。

**缓解**：INFERENCE：phase-gate 插件的 forced_load 逻辑应在 `current_phase` 仍为 UNDERSTANDING 时触发（UNDERSTANDING 的 `agent/turn-stopping` 检查点：gate 通过 → 推进前先跑 forced_load → 再推进到 GENERATION）。程序化调工具不经 `guard()`（系统级强制补调，不是模型发起）。需确认 harness 的 `ctx.tools.execute` 是否有「不经 guard」的程序化调用路径。

### §5.5 `max_llm_calls_per_turn=60` 的计数点

**风险**：rbi 在 `pipeline.py:640` `turn_budget.consume_llm_call()` 计费——在每次 LLM 调用前。harness 对应的计数点应在 `agent/request` waterfall（每次 LLM 请求前）或 `llm/stream`（每次流开始）。但 harness 的 `agent/request` waterfall 可能在一个 step 内被调多次（如 `agent/request-error` 重试），计数须与 rbi 的「每次真实 LLM 调用」对齐。

**缓解**：INFERENCE：phase-gate 插件在 `llm/stream`（流开始时）递增 `llm_call_count`——这与 rbi 的 `consume_llm_call()` 语义最接近（每次真实 LLM 调用前计费）。`agent/request` waterfall 可能有 waterfall 重试（不产生真实 LLM 调用），不应计费。需确认 harness 的 `llm/stream` 是否在每次真实 LLM 调用时触发。

### §5.6 stall watchdog 的 harness 对应

**风险**：rbi 的 `_watch_for_stall`（300s 无事件，排除 `ctx.awaiting_input`）在 da 侧无原生对应——harness 的 `agent/turn-stopping` 只在 turn 自然停时触发，不等同于 stall 检测。

**缓解**：INFERENCE：phase-gate 插件须在 `turn/start` 上启动独立 watchdog timer，在每次事件（`TOOL_INVOKE` / `TOOL_RESULT` / `llm/stream`）上重置；300s 无事件且非 `awaiting_input` 状态 → 取消 turn + emit stall_timeout。需确认 harness 是否允许插件在 turn 内设独立 timer。

---

## 引用索引（绝对路径）

**rbi 一手源（只读）**：
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/factory.py`——`default_phase_configs`（确切 PhaseConfig 值）、`always_pass`、`DEFAULT_MAX_STEPS=20`、`build_data_agent`、`AgentStores`
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/pipeline.py`——`DataAgentPipeline.run`（turn 级编排）、`_run_phase`（attempt 循环 + gate 求值）、`_run_execution_phase`（确定性执行）、`_run_subquestion_turn`（子问题循环）、`_phase_instruction_for`（per-phase 段 + SQL conventions）、`_PHASE_INSTRUCTIONS`、`_emit_honest_decline`、`_ExecutionBudget`、主循环（`i`/`fallback_count`/`while`）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/phases.py`——`Phase` enum、`PhaseConfig` dataclass、`PipelineConfig`（9 个 budget 参数 + 定标注释）、`_DEFAULT_ENGINE`、`_DECOMPOSITION_MARKER`、`_INCOMPLETE_MARKER`、`GateResult`、`UNIVERSAL_TOOLS`/`UNDERSTANDING_TOOLS`/`GENERATION_TOOLS`/`EXECUTION_TOOLS`/`INTERPRETATION_TOOLS`
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/gates.py`——`sql_syntax_gate`、`extract_sql_candidate`、`_looks_like_sql_attempt`、`extract_query`、`parse_sql_clauses`、`parse_decomposition_plan`、`parse_incomplete_declaration`（三态）、`strip_incomplete_declaration`、`summarize_execution_result`、`_DIALECT`
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/prompt.py`——`assemble_system_prompt`、`_game_context_block`、`_intent_block`、`_old_game_summary`、`_get_recent_turns`、`_MAX_RECENT_TURNS=3`、`_SUMMARY_MAX_CHARS=800`
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/state.py`——`ConversationState`、`ScopeState`、`AnalyticalIntent`、`SQLClauses`、`state_to_payload`/`state_from_payload`、`halt_declined`
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/state_store.py`——`StateStore` Protocol、`InMemoryStateStore`
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/steering.py`——`Steering.switch_game`（turn 间 scope 切换，禁止 mid-turn）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/delivery.py`——`attach_delivery_declaration`、`PRESENTATION_TOOL_SECTIONS`/`PRESENTATION_RESULT_TOOL_SECTIONS`/`_RESULT_TOOL_EVENT_KEYS`、`_is_first_delivery_of_this_turn`、delivery-surface-ownership SPEC
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/forced_load.py`——`force_load`（顺序 for-await + 单 `wait_for` 整批）、`ForcedLoadSpec`、`TABLE_SPEC`/`EVENT_SPEC`、`find_search_candidates`
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/recovery.py`——`render_interrupted_snapshot`/`render_cancelled_snapshot`（绝不自动继续 RA-F130）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/data_agent/presentation.py`——`AutoCompletion`（`_auto_audit`/`_auto_title`/`learn_from_success`，followups 模板替身已退役）
- `/Users/mckenzie/workspace/reverse-bi/libs/rbi-agent/src/rbi_agent/core/events.py`——`AgentEvent` + 全部事件常量（`PHASE_START`/`PHASE_END`/`GATE_CHECK`/`RETRY`/`CLARIFICATION`/`DECOMPOSITION`/`PRESENTATION`/`HONEST_DECLINE`/`TURN_START`/`TURN_COMPLETE`/`AUDIT_RECORDED`/`FOLLOWUP_SUGGESTIONS`/`TEMPLATE_HIT`/`REWRITE_CONFIRM`）

**已有研究笔记（cite，未重做）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/harness-agent-loop.md`——harness 侧事件 seam（§2.2 turn/step 流程）、Q7 无原生 per-phase 门控（§3.2/§6）、§4.3 映射推荐汇总表、§4.2A preset + §4.2B phase-gate 插件推荐、§1.2 `standard/agent.cordis.yml` 行结构、§1.4 `setup` 唯一调用点、§2.4 `system-prompt/assemble`、§2.5 `tools` 流水线、§3.1 `ctx.tools` API
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/rbi-purpose-arch.md`——§4 四阶段内容 + 15 能力、§5 端到端生命周期（每 phase gate/max_attempts/timeout/fallback + budgets + 事件流 + 崩溃恢复 §5.1-§5.12）、§7 开放迁移问题
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p4-guard-chain-placement.md`——§4.2 A1-split 决策表（tool-query consumer 拥 G1/G5/budget/near-dup/halt/cache；`ctx.query.execute` 拥 cost/timeout/retry/orphan）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p6-nl2sql-feasibility.md`——§1.1 DSL 不是 LLM 生成的 IR、§1.2 plan_query 是潜伏代码、§1.3 critique_sql = 预执行静态校验 fail-open 无执行反馈闭环
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/p8-audit-scope.md`——`cordis.patch.yml:60-72` 插件行（query-engine/embedder/retrieval/semantic-layer/audit/subagent-qoder/llm-dashscope）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/vector-rbi-mirror.md`——`ctx.embedder` seam 镜像靶
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/vectorization-frontier.md`——§7 `ctx.embedder`/`ctx.retrieval` capability seam 推荐
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/map.md`——③③（preset + phase-gate 插件，不自定义 agent-loop、不坍缩阶段）、Q7（harness 无原生 per-phase 门控）、Q8（goal/todo/plan 保留，四阶段作默认编排）、P4b resolved（`ctx.query` + 3-state `QueryOutcome`）、Not-yet-specified（tool-query consumer 雾区）
