# P-DA1 — 实现 乙′ route-gate（phase-gate 内）

**Type**: prototype
**Phase**: misc
**Status**: resolved (2026-08-21, prototype landed + green — tsc exit 0 / vitest 37/37 / verify-cordis-config 135/135; 4 files +486/-19; scope spot-checked via git status/diff)
**Graduated from**: [G-DA2](G-DA2-intent-confidence-router.md)（resolved 2026-08-21，grilling 锁定 乙′ 设计）
**Assignee**: (unclaimed)

## Question

把 grilling 锁定的 **乙′**（rbi 机制 + 结构化 route + 闲聊前置过滤 + 检索回退，无独立分类器）落地为 **phase-gate 插件内的 additive 改动**——让 data-agent 不再强制四阶段、能识别非数据 query、无 grounding 时诚实早退。

## Spec（7 锁定决策）

1. **机制**：乙′——rbi 机制（模型自评）+ 结构化 route 令牌 + 保守闲聊前置过滤 + 检索回退承重；**不**引入独立 LLM/规则分类器。
2. **route 令牌**：文本 marker `【route:proceed|clarify|decline】`，模型在 UNDERSTANDING 回合（调完 `search_data_sources`/`retrieve` 后）emit 进 `phase_output`；gate 在 `route_gate`（UNDERSTANDING 从 `always_pass` 改）正则解析（镜像既有 `INCOMPLETE_MARKER`/`interpretGate`）；**无令牌 → 默认 proceed + 回退兜底**。
3. **检索回退**：信号 = 聚合 `search_data_sources` + `retrieve` 的 `candidates.length`（`captureToolData` 记 `last_search_empty`/`last_retrieve_empty`，**避开 `candidate_tables` 投影失配**——candidates 是对象非 string，`collectTableNames` 收不到）；触发 = `proceed`/无令牌 **且** 无 grounding（两者皆空 + retrieve 未调或空）→ `honest_decline`（不裸跑 GENERATION）；`clarify`→置 `awaiting_clarification` + HALT；`decline`→`honest_decline`（模型自决）。**纯回退、不 nudge-retrieve**（retrieve 是模型的杆，§2/persona 教它 prefetch 弱时主动 broadening）。
4. **scope**：只管路由（UNDERSTANDING 早退）；GENERATION 闸门放宽单开 [P-DA2](P-DA2-relax-generation-gate.md)；critic/交付工具 ship 属 readiness #3。
5. **闲聊前置过滤**：最小版——整条输入（trim 后）匹配 问候/感谢/meta-about-agent（`你好|您好|hi|嗨|谢谢|感谢|你是谁|你能做什么` 等）→ canned 直答（"我是取数 Agent，可帮你查业务数据，请说指标 + 时间范围"）+ end turn（不调 LLM、不进管道）。**整条匹配 = 零假阳性**（"你好，查 DAU" 不匹配、照走管道）。确切 hook（`agent/status` idle→running 截首条 user message 或 turn-start）prototype 验定。
6. **提示切片 (A) 最小**：扩 `onAssemble` 的 `PHASE_INSTRUCTIONS[UNDERSTANDING]`——① 流程（先调 `search_data_sources`、prefetch 弱调 `retrieve`）+ ② 浓缩 §2 判据（`proceed`=有 grounding 且无歧义 / `clarify`=歧义 / `decline`=无 grounding 或不可答，用 search 实际返的 `candidates` 判）+ ③ emit `【route:...】` 令牌 + ④ §5 诚实拒 why/what/how 格式 + ⑤ clarify-light（`【route:clarify】` + 一个具体澄清问题文本，gate HALT）。工具描述由各 tool `description` 自动注入，persona 不复述 §1。全 §2（tiers/no_strong_match/DWS 快捷）、§4（六类/accumulated-definition）、§3（拆解）、§6（交付）、§7（工具层）defer。
7. **落点**：三层全在 `packages/data/phase-gate/`——route_gate + 回退扩 `runGate`/`onTurnStopping`/`captureToolData`；persona 扩 `onAssemble`；闲聊过滤新前置 hook。单插件、单 prototype、cohesive。

## Files

- `packages/data/phase-gate/src/phase-gate.ts`：UNDERSTANDING `route_gate`（`runGate` 分支）+ `onTurnStopping` 回退（`forcedLoad` 后查 grounding）+ `captureToolData` 记 `last_search_empty`/`last_retrieve_empty`（聚合 search+retrieve）+ 闲聊前置 hook + `capturePhaseOutput` 不变（已抓 `phase_output`）。
- `packages/data/phase-gate/src/types.ts`：`PHASE_CONFIGS[UNDERSTANDING].gate` `always_pass`→`route_gate`；`PhaseGateState` 加 `last_search_empty`/`last_retrieve_empty`（+ 闲聊 short-circuit 状态）。
- `packages/data/phase-gate/src/phase-gate.ts` `PHASE_INSTRUCTIONS[UNDERSTANDING]` + `BASE_PERSONA`：迁 (A) 切片。
- tests：route 三态（proceed+grounding→advance / proceed+empty→decline / clarify→HALT / decline→honest_decline / 无令牌→proceed+回退）+ 闲聊整条匹配短路 + "你好，查 DAU" 不短路 + retrieve 聚合 grounding。

## 前置 / 阻塞

- 无硬阻塞：phase-gate 插件已 ship（P7b）；`search_data_sources` 已 ship；`collectTableNames` 投影失配本票顺带修（抽 candidate `.id`，给 GENERATION grounding 用）。
- `retrieve` 聚合：retrieve-tool（D2c-impl，进行中）未 ship 时，回退只聚合 search（`last_retrieve_empty` 默认 true/忽略）；ship 后 additive 接上。**不阻塞**。
- 与 D2c/P4c 无关：D2c-impl retrieve 未 ship 也照跑（回退只看 search）；P4c EXECUTION 真也无关（本票 pre-EXECUTION）。

## 验收

- 闲聊（"你好"）→ 即时 canned 直答、不进管道、不烧 ODPS。
- 数据 query + 有 grounding（post-D2f）→ route proceed → GENERATION（P-DA2 放宽后可达 EXECUTION）。
- 数据 query + 无 grounding（今天 dormant corpus）→ 诚实 `honest_decline`（不强制跑垃圾 SQL 进真 ODPS）。
- per-pkg `tsc` + vitest + `verify-cordis-config` 全绿；additive（无 core/CLI 改动）。

## Out of scope

- GENERATION 闸门放宽（→ P-DA2）；critique/evaluate/present 工具 ship（→ readiness #3）；corpus 激活（→ D2f）；retrieve-tool ship（→ D2c-impl）；全 §2/§4/§3/§6/§7 提示脑迁移（后续环）。
