# G6 — 定义版本管理：开源项目是否应自带 git 版本控制

**Type**: grilling (HITL)
**Phase**: post-W14
**Status**: closed
**Assignee**: claude
**Blocked by**: 无（独立）
**Related**: W6e（`edit_definition` tool 已 ship）、P8/P8b（audit log 已有 who/when/what Tier-2 记录）

## Question

语义层定义（TableDefinition / EventDefinition / MetricDefinition）通过管理 agent 的 `edit_definition` 工具被修改。当前变更追踪依赖 Tier-2 audit log（记录 who/when/what patch）。

核心决策：**作为一个开源项目 / 可用于不同场景的项目，语义层是否应自带 git 进行定义版本管理？**

需要讨论：

1. **自带 git 的含义**：
   - 每次 `edit_definition` 后自动 `git add + git commit`（定义目录初始化为 git repo）
   - 支持 `revert_definition(version)` 工具回滚到历史版本
   - 支持 `diff_definition(v1, v2)` 查看变更对比
   - 管理者可用标准 git 工具（git log / git blame）审查历史

2. **替代方案**：
   - (a) **当前 audit log 够用**：Tier-2 audit 已记录 patch，回滚 = 反向 patch
   - (b) **Append-only changelog**：JSON Lines 记录每次变更，自带 replay/revert
   - (c) **完整 git**：定义目录 = git repo，每次写入 = commit
   - (d) **外部 git（用户自理）**：项目不管版本，用户自己把定义目录纳入 git

3. **场景考量**：
   - 开源项目部署环境多样（Docker / 裸机 / serverless）——git 依赖是否可接受？
   - 多 agent 并发编辑同一定义——git merge conflict 处理？
   - eval-based confidence gate（W6e）已有 auto-revert 能力——是否已覆盖"回滚"需求？

4. **成本**：
   - git 依赖（isomorphic-git / child_process）
   - 每次写入的 IO 开销
   - 磁盘空间（.git 目录）

## Scope

Grilling session 讨论并锁定方案。若选 (c)/(d)，毕业实现 ticket。

## Resolution

**不引入 git，走 eval-driven 版本治理路线。** 选方案 (a) 并增强。

### 行业调研（2026 H2 前沿）

调研了 Databricks Genie Ontology（Layer 5: Evaluate and improve）、Cube.dev（Semantic Layer for AI Agents 2026）、Hex Context Studio、Martin Fowler/Thoughtworks（Making Data Ready for Agentic AI）四家前沿做法。

**核心发现**：2026 的"版本"不是 git commit——**版本 = 定义状态 + eval 证据的配对**。行业共识已从 git-centric 转向 eval-centric：

- Databricks：certification 标记 + benchmarks 定期验证 + 回答失败时回溯到定义根因（完全不用 git）
- Cube：versioned semantic model + model version 随查询结果传播 + known-answer evals
- Hex：git + eval before shipping + agent observability
- Fowler：traceability（可追溯性）+ confidence-threshold routing

### 五项决策

| # | 决策 | 要点 |
|---|------|------|
| D1 | **不引入 git** | 现有快照+审计足够。用户想用 git 可自行 `git init`。git 是部署依赖负担（Docker/serverless），merge conflict 处理复杂，且行业前沿已不以 git 为中心 |
| D2 | **γ 变更集锚定检查点 eval** | eval run 携带 changeset 元数据（since-last-run 变更列表）；在自然检查点触发（W6a 每 K 轮）；保留因果关系（eval 明确知道在验证哪些变更）+ 成本与 β 一样低。三种方式对比：α（per-change eval，成本过高）、β（snapshot 推断，因果弱）、γ（changeset 锚定，因果精确+低成本） |
| D3 | **定义版本号不随查询传播**（fog） | Agent tool call chain 已是隐式追溯链；CL-8 100% / CL-9 91.7%，无追溯痛点；未来出现追溯困难再引入 |
| D4 | **edit_definition 写入时计算 structured delta** | before/after 结构化差异（added/modified/removed）存入审计记录，作为 changeset 一部分。③自驱循环直接消费，无需额外加载快照对比。成本低：edit_definition 已有 before snapshot + after 状态 |
| D5 | **细粒度 auto-revert** | eval regression 时按 affected scope 只 revert 相关变更（非全量 changeset 回滚）；独立开票，不在 G6 范围 |

### 毕业实现票

- **V1 审计 structured delta**：`edit_definition` 计算 before/after delta 并持久化
- **V2 eval run changeset 标注**：eval run 记录携带 since-last-run changeset
- **V3 细粒度 auto-revert**：基于 changeset + affected scope 的定向回滚（③ 相关）

### 记入雾区

- 定义版本号随查询结果传播（D3，当前无痛点）
- eval affected scope 选择（γ v2 优化——根据 changeset 中 asset_name 筛选 eval case 子集）
