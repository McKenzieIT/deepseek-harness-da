# Research: Phase-gate session events 架构调研

**来源**: task-orchestration-dag G3 grilling（preset 通用性策略 → data-agent 集成）
**日期**: 2026-09-01
**Current standing**: 本文是 phase-gate 现状盘点，不再构成 Task DAG 的前置设计。Task DAG 使用独立 journal，phase 不是 Task；只有 G25 先证明 phase-gate 保留且 durable phase state 有用户价值后，本文的事件候选才进入设计。

## 发现

### 当前状态：零 session events

Phase-gate（`packages/data/phase-gate/`）的阶段状态管理**完全基于内存**，未发射任何 session event。

**证据**：
- `phase-gate/src/` 中无任何 `session.append()`、`ctx.emit()` 调用
- `PhaseGateState`（`types.ts`）是纯内存对象，keyed per session inside the plugin
- 阶段转换通过 `agent/turn-stopping` serial hook（void 返回）+ `agent.inject()` 侧效应驱动
- UI/外部观察者无法获知当前阶段、阶段转换时机、gate 判定结果

### 根因分析

**1. Python rbi 移植遗留**

Phase-gate 头部注释明确声明：

> "Faithful re-expression of reverse-bi `DataAgentPipeline` (`pipeline.py`, `phases.py`, `factory.py`) phase-gated orchestration on harness event seams"

原始 Python 实现中阶段状态是函数作用域内的内存变量。移植时忠实复刻了同样的 ephemeral 范式。

**2. agent-loop 控制流约束**

代码注释揭示关键约束：

> "CONTROL-FLOW REFINEMENT: `agent/turn-stopping` is `serial` with `Promise<void>|void` return — the agent-loop DISCARDS the return. So the P7 stub's return-based control does NOT map; production control is by SIDE EFFECT."

Phase-gate 被迫使用纯侧效应模式（修改 `PhaseGateState` + `agent.inject()` 维持 kick）。在这种实现范式下，开发注意力集中在"让流程正确运转"，非"让流程可观测/可持久化"。

**3. 非刻意的架构选择**

没有任何代码注释、ADR、或 ticket 表明 ephemeral 是有意的设计决策。更准确地描述是：**移植时未考虑可观测性需求**。

### 影响评估

| 能力 | 当前状态 | 需要 session events |
|------|---------|-------------------|
| UI 展示阶段进度（进度条/状态指示） | ❌ 不可实现 | ✅ |
| Session reload 后恢复阶段状态 | ❌ 从 UNDERSTANDING 重新开始 | ✅ |
| DAG 中展示阶段节点 | ❌ 无事件可折叠 | ✅ |
| 阶段耗时/成功率/fallback 频率分析 | ❌ 无持久化数据 | ✅ |
| 多 Agent 协调感知 data-agent 阶段状态 | ❌ 状态私有不可穿透 | ✅ |
| 未来非线性管道（分支/并行/人工审核点） | ❌ 硬编码 PHASE_ORDER 线性推进 | ✅ |

### 架构原则校验

架构文档（`docs/architecture.md`）的持久化原则：

> "Session events are durable facts appended to the log and broadcast through `session/event`. Use one when the fact must survive a reload."

阶段转换符合此标准：
- 它是有意义的业务事实（Understanding → Generation 不是实现细节）
- Gate 判定（pass/fail/fallback/decline）携带因果信息
- 多个消费者需要它（UI 渲染、DAG 投影、分析、外部审计）

### 初步建议的 event 类型

以下为初步方向，具体 schema 需 grilling 确认：

| Event type | 语义 | 数据 |
|------------|------|------|
| `phase/advance` | 阶段推进 | from, to, gateResult, attempt |
| `phase/fallback` | Gate 失败回退 | from, to, reason, fallbackCount |
| `phase/decline` | 诚实拒绝 | reason, phase, turnCount |
| `phase/clarify` | 等待用户澄清 | question, phase |

全部应标记 `ignorable: true`，与 tool-dag-task 的 DAG events 保持同一模式。

### Historical tool-whitelist hypothesis

The original research assumed phase-gate would remain and would replace Todo names with `dag_task_*` in its universal whitelist. The current Task DAG model supersedes that assumption: Task DAG tools are cross-preset orchestration capabilities, and a data-agent inner policy cannot own or hide them. G16 must define generic tool-policy composition; G25 first decides whether phase-gate remains at all.

### 与 data-agent 未来演进的关系

当前强制线性管道（UNDERSTANDING → GENERATION → EXECUTION → INTERPRETATION）是为稳定性而设计。未来如果 data-agent 需要：
- 条件分支（跳过不需要的阶段）
- 并行阶段（同时 critique + execute）
- 人工审核点（在 GENERATION 后暂停等待确认）
- 多代理协调（一个 agent 做 UNDERSTANDING，另一个做 GENERATION）

If G25 retains a durable phase state machine, these evolutions require durable phase facts before they require any particular event schema. PG1 must choose the owning store and minimum facts from current product needs; DSH Session events are one candidate rather than a predetermined prerequisite.
