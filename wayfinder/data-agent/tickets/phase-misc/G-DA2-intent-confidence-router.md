# G-DA2 — 意图/置信度路由（让 phase-gate 识别「是否是查询 query」）

**Type**: grilling
**Phase**: misc
**Status**: resolved (2026-08-21, grilling locked — 乙′ 设计定稿)
**Assignee**: wayfinder-grilling-session 2026-08-21
**Blocking**: 受 `data-agent-conversation-readiness` #3（critique/evaluate/present 工具 ship）正交；本票只决「路由形态」，不决工具 ship 顺序。

## Question

dsh-data-agent 当前 UNDERSTANDING 闸门是 `always_pass`，**任何输入（含「你好」）都无条件推进到 GENERATION**，且 GENERATION 闸门因 critic 工具未 ship 而恒 fail。要不要、以及如何把 reverse-bi 的**置信度分级路由**（`v2-baseline.md §2`：high→直答 / mid→`present_clarification` HALT / low→诚实拒或 discovery）迁移成 phase-gate 在 UNDERSTANDING 的**真闸门**，让 agent 能（a）识别非数据 query 不进 SQL 管道、（b）低置信早退（澄清/拒答）而非强制跑满四阶段？

## 现状（已诊断，见 research）

- `packages/data/phase-gate/src/types.ts` `PHASE_CONFIGS`：UNDERSTANDING `gate: 'always_pass'`, `fallback_phase: null`。
- `packages/data/phase-gate/src/phase-gate.ts` `onTurnStopping`→`runGate`：UNDERSTANDING 走 `always_pass` → 直接 `advance()` 到 GENERATION，不论 `search_data_sources` 是否返回候选（空也照推进，仅 `forcedLoad` 再搜一次仍空）。
- **无意图分类器**；唯一拒答路径是模型在 INTERPRETATION 自愿 emit `INCOMPLETE_MARKER`，或预算/`stall_watchdog`(300s) 耗尽 `honest_decline`。
- GENERATION `generationGate` 依赖 `s.last_critique`/`s.last_quality`（来自 `critique_sql_tool`/`evaluate_sql_quality`，**未 ship**）→ 恒 fail。

## reverse-bi 对照

- `rbi-purpose-arch.md` §4#4 / §5 step 5：UNDERSTANDING 内做置信度分级，high→GENERATION、mid→`present_clarification`+HALT（`disambiguation_timeout_seconds`=300s 后降级 honest_decline）、low→§5 诚实拒或 discovery（A 问定义 / B 广搜+present 1-3 候选）。这是 rbi「识别是否是可答数据 query」的核心机制。
- dsh 只迁了**四阶段编排脚手架**（7 hook），**未迁置信度路由 + v2-baseline 提示脑**。

## 待 grill 的决策点（示例）

1. **路由放哪**：UNDERSTANDING 闸门内（模型自评置信度 + 闸门校验）vs 入口前置一个独立 intent classifier（确定性，非 LLM 自评）？rbi 是前者（prompt 驱动 + 闸门校验 marker）。
2. **非数据 query 处理**：闲聊/问候是直答（绕过四阶段）还是仍走管道到 INTERPRETATION 再 INCOMPLETE？rbi 无显式闲聊路由——靠置信度低→拒/澄清覆盖。
3. **置信度信号**：dsh 无 `critique_sql_tool` 时，UNDERSTANDING 的「检索为空 / 无候选」是否直接当作 low→澄清/拒？（最低成本止血：检索为空且无 `candidate_tables` → 不进 GENERATION，转 honest_decline/discovery。）
4. **与 D2c/P4c 的正交**：意图路由不依赖检索语料是否真实（空语料也能判「这不是数据 query」），可先于 D2c/P4c 落地止血。
5. **v2-baseline 提示脑**：是否同步迁移 §1-§6 提示（load_* grounded / 置信度 / 复合拆解 / 六类消歧 / 诚实拒 why-what-how / 交付纯度），还是先只迁置信度路由这一块？

## 依据 / 引用

- 诊断笔记：`../../research/2026-08-21-conversation-pipeline-root-causes.md` §3。
- rbi 能力源：`../../research/rbi-purpose-arch.md` §4#4 / §5 step 5。
- phase-gate 实现：`packages/data/phase-gate/src/phase-gate.ts`（`onTurnStopping`/`runGate`/`generationGate`/`interpretGate`）+ `types.ts`（`PHASE_CONFIGS`）。

## Research resolution (2026-08-21)

[/research 子代理调研笔记](../../research/2026-08-21-g-da2-intent-routing-survey.md)（外部 survey + dsh 约束逐条核证）。结论：**业界无生产 NL2SQL 系统用入口确定性意图分类器（方案丙）**；最接近对标 Databricks Genie 用方案乙形态（生成流内 3 态自评 answerable/ambiguous/unanswerable，语义模型作可答性边界）。研究里的「分类」=查询复杂度路由（DIN-SQL），非 chitchat 意图；「置信度」=生成后/执行后（CHASE-SQL/BIRD）。生产鲁棒性靠 grounding 信号 + 执行反馈 + 响应形状自路由，非入口分类器。

**推荐 乙′**（乙的硬化，仍在乙哲学内）= 乙 + ① 结构化 route enum（`【route:proceed|clarify|decline】`，融进既有 UNDERSTANDING LLM 调用，像 `INCOMPLETE_MARKER` 一样正则可解析，零额外 LLM 调用）+ ② 保守闲聊前置过滤（入口极小高 precision 正则，仅短路问候/感谢/meta，余 fallthrough 自评）+ ③ 检索回退承重（forcedLoad 后无 grounding 且未 emit clarify/decline → 强制 honest_decline）。落地只需已 ship 的 `search_data_sources` + 既有 `honest_decline`/`INCOMPLETE` 机制；与 D2c/P4c 无关；`present_clarification` 未 ship 时 `clarify` 退化为文本澄清 HALT。丙被否（同款 prompt 不合规失败 + 前置瞎猜可答性 + 额外调用 + 规则脆/embedding 无语料）。

## Resolution（grilling locked 2026-08-21 — 乙′ 设计定稿）

经 `/research` 子代理外部调研（`../../research/2026-08-21-g-da2-intent-routing-survey.md`）+ 7 子决策 grilling（每条用户确认），锁定 **乙′**（rbi 机制 + 结构化 route + 闲聊前置过滤 + 检索回退，**无独立分类器**）：

1. **机制**：乙′（非丙——丙同款 prompt 不合规失败 + 前置瞎猜可答性 + 额外调用 + 规则脆/embedding 无语料）。
2. **route 令牌 (i)**：文本 marker `【route:proceed|clarify|decline】`，模型 UNDERSTANDING 回合 emit 进 `phase_output`；`route_gate`（UNDERSTANDING 不再 `always_pass`）正则解析（镜像 `INCOMPLETE_MARKER`）；无令牌→默认 proceed + 回退兜底。
3. **检索回退 (i)**：信号 = 聚合 search+retrieve `candidates.length`（`captureToolData` 记，**避开 `candidate_tables` 投影失配**——candidates 是对象非 string，`collectTableNames` 收不到）；触发 = proceed/无令牌 且 无 grounding（search+retrieve 皆空 + retrieve 未调或空）→ `honest_decline`；clarify→置 `awaiting_clarification` + HALT；decline→`honest_decline`（模型自决）。纯回退、不 nudge-retrieve（retrieve 是模型的杆，§2/persona 教它 prefetch 弱时主动 broadening，对齐 rbi §2 discovery path B）。
4. **scope**：乙′ 只管 UNDERSTANDING 路由；GENERATION 闸门放宽单开 [P-DA2](P-DA2-relax-generation-gate.md)；critic/交付工具 ship 属 readiness #3。
5. **闲聊过滤**：最小版——整条输入（trim 后）匹配 问候/感谢/meta-about-agent → canned 直答 + end turn（不调 LLM、不进管道）。整条匹配 = 零假阳性（"你好，查 DAU" 不匹配、照走管道）。
6. **提示切片 (A) 最小**：persona 只含——① 流程（先调 `search_data_sources`、prefetch 弱调 `retrieve`）+ ② 浓缩 §2 判据（proceed=有 grounding 且无歧义 / clarify=歧义 / decline=无 grounding 或不可答，用 search 实际返的 `candidates` 判）+ ③ emit `【route:...】` 令牌 + ④ §5 诚实拒 why/what/how 格式 + ⑤ clarify-light（`【route:clarify】` + 一个具体澄清问题文本，gate HALT）。工具描述由各 tool `description` 自动注入。全 §2（tiers/no_strong_match/DWS 快捷）、§4（六类/accumulated-definition）、§3（拆解）、§6（交付）、§7（工具层）defer。
7. **落点 (i)**：三层全在 `packages/data/phase-gate/`——route_gate + 回退扩 `runGate`/`onTurnStopping`/`captureToolData`；persona 扩 `onAssemble`；闲聊过滤新前置 hook。单插件、单 prototype、cohesive。

**状态校正**（grilling 中用户纠正，覆写上文过时假设）：P4c（真 ODPS 执行）= **DONE**（a maxc sidecar + c tool-query Consumer 都 landed；case 037→4336 真 ODPS row；b guard chain deferred 非硬门）→ EXECUTION 真实可用。D2c keep/regress 决策 **resolved（keep b）**；**D2c-impl（ship retrieve-tool escape-hatch）进行中**；D2e（enriched corpus：params_fields+terminology）**shipped dormant**（bundle `semantic-layer` 行仍注释 → `ctx.schema` 未挂 → `search_data_sources` 今天仍用空 `Bm25Linker`）；D2f（激活 corpus runtime）未做；real embedder 未做。

**乙′-now 落地后果**：今天 search+retrieve 皆空（dormant corpus）→ 回退恒触发 → 数据 query honest_decline（诚实不可用，非强制跑垃圾进真 ODPS 烧钱）→ **乙′ 把「坏」改「诚实」**。随 D2c-impl/D2f 收窄；端到端跑通还差 D2f（corpus）+ critic 工具 + 交付工具（见 [P-DA1](P-DA1-implement-route-gate.md) spec 表 + readiness #3）。乙′ 是跑通链的**第一环（必要不充分）**。

**毕业**：[P-DA1](P-DA1-implement-route-gate.md)（原型：phase-gate 内实现乙′，7 决策为 spec）+ [P-DA2](P-DA2-relax-generation-gate.md)（GENERATION 闸门过渡放宽，critic 未注册时只靠 folded sqlSyntaxGate 让 grounded query 到 EXECUTION）。两者 unblocked、additive、与 D2c/P4c 无关。

**遗留修正**：`data-agent-conversation-readiness` ticket 的「P4c 真执行未 ship」表述过时（P4c 已 DONE），待修正。

## Out of scope

- critique_sql_tool / evaluate_sql_quality / present_* 工具包 ship（→ `data-agent-conversation-readiness` #3）。
- 检索 keep/regress（→ `phase-misc/D2c-retrieve-tool-keep-regress`，已 resolved keep b）。
