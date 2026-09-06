# playbook — evaluation effort: 执行流程与方向顺序

> 本 playbook 定义 `wayfinder/evaluation/` effort 的**执行流程**(哪些票本环境直接做、哪些走 SPEC→instruction+rubric→另一环境)与**方向顺序**。
> **不写入 map**(map 是方向/票 index,非流程文档);本 playbook 是流程权威。map 见 [`map.md`](map.md)。
> 2026-09-06 起。假设见 §6,可纠正。

---

## 1. 票类型拆分(核心)

| 票类型 | 本环境直接做? | 环节 | 说明 |
|---|---|---|---|
| R1-R11(认读分析论文) | ✅ 本环境(AFK) | Phase 1 | 读论文产 `research/<slug>-papers.md`,喂 grilling |
| G1-G12(grilling) | ✅ 本环境(HITL) | Phase 1 | 你 grill 定 A/B/C 方向,产决策 |
| P1(prototype) | ✅ 本环境(HITL)* | Phase 1 | 新 seam 先验原型(*见 §6 假设) |
| T1-T10(impl/实现票) | ❌ 不直接 | Phase 2→3→4 | 走 SPEC→instruction+rubric→另一环境执行 |
| R12-R22(experiment/实验票) | ❌ 不直接 | Phase 2→3→4 | 同上 |

历史票(`P11*`/`R3`/`G2`/`GA-EVAL-*`/`GA-EXP*`/`GA-GRILL*`)在 `wayfinder/data-agent/tickets/`,不在本流程(已 resolved/或既有 open,各自管)。

---

## 2. 端到端流程(4 阶段)

### Phase 1 — 本环境:G + R 认读(直接做)
- R1-R11(AFK):认读分析论文,产 `research/<slug>-papers.md`(核心方法 + 对本仓映射 + 验证状态)。
- G1-G12(HITL):`/grilling` 一次一问,定 A/B/C 方向,产 grilling Resolution。
- 产出 → **明确**每个 T 和 R-experiment 要做什么(为 Phase 2 SPEC 提供输入)。

### Phase 2 — 本环境:生成 SPEC(为 T + R-experiment)
- 每个 T 票、每个 R-experiment 票生成一个 **SPEC 文件**(需求文档)。
- 基于:Phase 1 的 grilling 决策 + research note。
- **约束**:SPEC 只写"要达到什么/验收什么",**不泄露答案、不写根因、不写行号、不写改法**(否则另一环境的模型直接抄)。
- SPEC 存:`wayfinder/evaluation/tickets/<ticket-id>.spec.md`(或 tickets/specs/),与票关联。

### Phase 3 — 本环境:生成 rubric 包(按参考 prompt)
对每个 SPEC,在 `~/workspace/rubrics/<问题名>/` 下产:
- `instruction.md` — 给另一环境执行的任务说明。
- `attachment/repo/` — 复制所有涉及文件(要改的、要读的、测试用的)。
- `quality.toml` — 评分 rubric(中文)。

**instruction.md 约束**(参考 prompt 要求):
1. 起新 worktree 执行;**worktree 不放进新目录**,只把涉及文件复制到 `attachment/repo/`。
2. 题面**不直接给答案**:不写根因、行号、改法。
3. 可参考 SPEC/Map,甚至指定;但**引了就把相关文档放进 repo**;**尽量少直接告诉模型怎么做**。
4. **不许 subagent**;所有内容只在主 Agent 窗口执行。
5. **完整涵盖 SPEC 和 Map 的全部要求**,不只做其一;生成后逐一审查。

**quality.toml 约束**(用 `~/.claude/skills/code-rubrics-generate`,仿 `/Users/mckenzie/workspace/reverse-bi/docs/quality.toml`):
- 中文;专业,无 AI 生成痕迹,**不直接给分数**。
- 字段**仅** `name` / `description` / `type` / `points` / `weight`。
- **1-5 分制**(非二元);**7-10 项**。
- 符合事实;**不应存在不该存在的阻塞内容来证伪**;评分权合理。
- 文件名:`quality.toml`。
- `description` 按 `points` 给各分值如何评估;**必须参考 quality 模板生成,不脱离模板**(否则无法判分)。

### Phase 4 — 另一环境:执行(不直接做)
- 拿 `instruction.md` + `attachment/repo/` + `quality.toml`,在**新 worktree** 执行(主 Agent only,无 subagent)。
- 由 `quality.toml` 评分;结果回传更新本 effort(map Status + experiment-audit-log)。

---

## 3. 当前 map 流程 recap(详见 [`map.md`](map.md))

- **11 方向**(round-1 五角度 + round-2 五新角度),每方向票链:`R(认读) → G(grilling) → [SPEC] → T impl & R-experiment(另一环境) → R-experiment 结果回传`。
- **linchpin = T1(EX grader)**:解 R12/R17/G3(靠 R14)/G9/G10(靠 R21)/R19 + 既有 GA-EVAL-EXPAND。
- **依赖图**(分层):
  - Layer 0(unblocked,本环境 Phase 1 可起):R1-R11、R14、R20(+ 既有 GA-EXP1/GA-EVAL-SQLGEN-FOLLOWUP/GA-EVAL-REBASELINE item4)。
  - Layer 1(grilling,HITL):G1-G12(G5/G9/G10 ⚠ supersede GA-GT4,须先调和)。
  - Layer 2(SPEC→另一环境):T1-T10 + R12-R22(T1 = linchpin,先做)。
  - 既有 open:GA-EVAL-EXPAND←T1;GA-EXP5←GA-EVAL-EXPAND。
- 方向间:4/6/8 独立于 T1 可并行;11 与 4 互补(都攻 power)。

---

## 4. 方向顺序(推荐)

### 顺序原则
1. 先做 **linchpin 链**(方向 1):R1→G1→[T1 SPEC→rubric 包→另一环境]。T1 解锁最多。
2. 并行做**独立于 T1**的方向(本环境 Phase 1 部分):方向 4(R4→G4)、方向 6(R6→G6)、方向 8(R8→R20→G8)。
3. T1 完成后,做**依赖 T1** 的方向:3(R14→G3→T3)、5(R17→G5)、7(R7→G7→R19)、9(G9→T8)、10(G10→T9→R21)。
4. 最后做 scope 扩展:方向 6 的 prototype/benchmark(P1→T6→R18)。
5. 方向 11(R11→R22→G11→T10)与方向 4 配对收尾(都攻 power/active sampling)。

### 11 方向杠杆序
1 → 3/8(判官修复,可并行)→ 4(显著性,并行)→ 5/9/10(de-K11,依赖 T1)→ 6(轨迹,scope 扩展)→ 7(step-PRM,依赖 T1)→ 11(鲁棒性,补强 4)。

### cheap-first 备选(若想先拿信号再投 linchpin)
- **R20-radar-redundancy**(方向 8,AFK quick win):可能直接定位 0.6 通胀根因 → 喂 G8。
- **R14-judge-falsepass-by-dim**(方向 3,AFK,既有数据分析):分解 73.7% 假通过 → 喂 G3。
- 二者皆 Layer 0,本环境 Phase 1,先做无依赖。

### 单方向内顺序(滚动,每方向独立)
R 认读(Phase 1)→ G grilling(Phase 1)→ T/R-experiment 的 SPEC(Phase 2)→ rubric 包(Phase 3)→ 另一环境执行(Phase 4)→ 结果回传更新 map。**不攒批**:一方向 G 定了就生成该方向 SPEC,不等其他方向。

---

## 5. 每方向的 ticket→阶段映射(简表)

| # | 方向 | Phase1 本环境 | Phase2-4 另一环境 |
|---|---|---|---|
| 1 | 执行级评分+非循环 GT | R1, G1 | T1, R12, (+G12 条件) |
| 2 | Judge blind-rewrite | R2, G2 | T2, R13 |
| 3 | Judge 校准+gated | R3, G3(+R14 喂) | T3, R15 |
| 4 | Power-aware+显著性 | R4, G4 | T4/T4b, R16 |
| 5 | 污染+动态 pipeline | R5, G5(+R17) | T5/T5b |
| 6 | 轨迹+多轮基准 | R6, G6, P1 | T6, R18 |
| 7 | Step-level PRM | R7, G7 | R19 |
| 8 | Pairwise/rubric judge | R8, G8(+R20) | T7 |
| 9 | Error taxonomy | R9, G9 | T8 |
| 10 | Harness B/H/E+Goodhart | R10, G10 | T9, R21 |
| 11 | Robustness+active sampling | R11, G11 | T10, R22 |

(Phase 1 = 本环境直接做;Phase 2-4 = SPEC→rubric 包→另一环境。详见 map.md §3。)

---

## 6. 假设(待纠正)

1. **"先做Grilling票和实验票"中的"实验票"** = 认读票(R1-R11)笔误(因实验票属"不直接做")。→ 本环境 Phase 1 = G + R认读(+P)。
2. **Phase 3 生成位置** = 本环境(本地 Mac,`~/workspace/rubrics`);生成的包再交另一环境执行。
3. **P(prototype)** = 本环境直接做(同 G,HITL);不进 SPEC→rubric 流程。
4. **顺序** = 滚动:每方向 G 定了立即生成该方向 T/R-experiment 的 SPEC,不等其他方向。

---

## 7. 收尾(本 playbook 落地后)
- 更新 `map.md` Notes 加交叉引用 → 本 playbook(流程不写进 map,只引)。
- 更新 `tickets/README.md` 加 T/R-experiment 不直接做的提示 → 本 playbook。
- commit(playbook + 两个交叉引用)。
- 下一 session prompt:按 §4 顺序,从 linchpin 方向 1 的 Phase 1(R1→G1)起,或 cheap-first(R20/R14)。
