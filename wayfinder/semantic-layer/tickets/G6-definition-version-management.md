# G6 — 定义版本管理：开源项目是否应自带 git 版本控制

**Type**: grilling (HITL)
**Phase**: post-W14
**Status**: open
**Assignee**: unclaimed
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
