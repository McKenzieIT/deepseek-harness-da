# G1b — Pipeline vs goal/todo/plan 实验执行

**Type**: prototype
**Phase**: misc
**Status**: Blocked by P7b（真 phase-gate/A preset；P7b 自身 blocked by P13）+ P11b（生产 eval harness；P11 throwaway proto 已 resolved 可作早期 throwaway 跑）
**Assignee**: (unclaimed)

**Question**: 跑 G1 设计的 staged 实验（2×2 变体 × 2 模型配置）+ 应用决策规则 + 出报告，答「ship 默认编排 + per-model 路由」。

G1（resolved 2026-08-20，`../phase-misc/G1-pipeline-vs-goal-todo.md`）定稿了实验**设计**（11 决策）；本票是**执行**——建对比 preset + 跑矩阵 + 报告。

## 执行范围（hold G1 设计作 protocol）

1. **建变体 preset**（A=P7b 已有，须建 B/C/D）：
   - **B** = 自由 ReAct + planning group（goal/todo，**不含 plan-mode**=B_core；plan-mode 作 B-内部 Level-2 条件跑）。preset：persona + 全数据工具 + planning group、**无** phase-gate 插件。
   - **C** = 混合（四阶段 + planning group，goal/todo 进 U+I 的 guard 白名单=C_prior；C_all/C_none 作 Level-2）。依赖 P7b 真 phase-gate + P13 真 critic。
   - **D** = 裸 ReAct（persona + 全数据工具，无 planning、无 phase-gate）。地板基线。
2. **模型矩阵前置探针**：探针全 10 dashscope 模型（`../../research/p2-dashscope-wire.md` 清单 + GET /api/v1/models），map 哪些返 reasoning_content（思考）+ 能力档位（弱/中/强）；qwen3.7-max reachability 先探（ping 不通则弃）。据探针选 **Config T（思考轴：非思考 vs 思考~同能力）+ Config C（能力轴：弱→中→强~同思考）**，并集 ~4-5 模型。
3. **eval case 集**：RBI 161 case（5 scope、同游戏/schema）→ 标注线性/迭代 tag（RBI 不标）→ 分层(complexity L1-L4 + intent 7 + 线性/迭代)代表性 ~30 子集。判分 = execution-match（跑 agent 最终 SQL 对照 expected.result_value）+ declined 从 agent 终态推（须启 honesty tagging，RBI L3 未跑）。
4. **staged 跑**（via P11b 生产 eval harness / 或 P11 proto 早期 throwaway 跑，复用 rbi-eval AgentResponder/MultiTurnSession/pass_k 编排 + dsh-llm-replay）：
   - **Stage 1** = 全 {A,B,C,D} × Config C（能力轴、ship 相关、~3 模型）× ~30 case × pass_k=3 ≈1080 run，完整因子。
   - **Stage 2** = + Config T（思考轴、~2 模型）×{A,B,C,D} ≈360-720，**条件跑**——仅当 Stage 1 显最佳变体随模型分歧>5pp。
5. **控制**：pass_k=3 / case~30 / infra health 门+有界重试+infra 失败单独标 / 每格单模型（A per-phase 混搭剥离作 Level-2）/ 变体仅差编排（base persona+数据工具+模型+case 跨变体恒定）/ 固定温度 / 公共预算上限 max 60 LLM calls+max 20 turns per case / 配对（within-subject）。
6. **应用决策规则 + 报告**：ship 主指标（答案正确率，correct/declined/wrong 三分）最高变体；top-2 实际等效(≤3pp)→ship 更简；配对 bootstrap+McNemar 报 effect size+CI。出 ship 推荐 + per-model breakdown。实际「改 da 默认」=毕业下游决策票（fed by 本报告）。
7. **Level-2 条件精化（若触发）**：C per-phase（C_none=A / C_prior U+I / C_all，触发=Level-1 交互显著）/ B plan-mode（B_core vs B+plan-mode，触发=B 欠结构）/ A per-phase model-mix（触发=A 有竞争力）。

## Blocked by

- **P7b**（真 phase-gate 插件 + A 的生产 preset；P7b 自身 blocked by P13——A 的 GENERATION critic）。C 依赖 P7b+P13。
- **P11b**（生产 eval harness，unblocked——跑矩阵的编排+判分基建；P11 throwaway proto 已 resolved 可作早期 throwaway 跑）。
- **data seams 功能就绪**：P4b（ctx.query + tool-query consumer + guard chain）/ P5（embedder+retrieval）/ P6（ctx.schema 语义层）/ P8（ctx.audit）/ P3（subagent-qoder）——多已 resolved(prototype)，须功能态非 stub。

## 前置

- **G1**（resolved 2026-08-20，实验设计 11 决策，`../phase-misc/G1-pipeline-vs-goal-todo.md`）。
- **P7**（resolved，变体 A as-is prototype `../../prototypes/p7-four-phase-preset/`）。
