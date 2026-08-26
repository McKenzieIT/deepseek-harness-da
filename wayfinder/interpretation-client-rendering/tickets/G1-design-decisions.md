# G1: INTERPRETATION client rendering design decisions

**Type**: grilling (HITL)
**Status**: ✅ resolved
**Blocked by**: [R1](R1-llm-ui-rendering-patterns.md), [R2](R2-frontend-table-chart-libraries.md), [R3](R3-dsh-client-rendering-patterns.md)
**Blocks**: [T1](T1-ui-present-decomposition.md), [T2](T2-ui-present-table.md), [T3](T3-ui-suggest-followups.md)

## Question

Stress-test and resolve the following design decisions for the INTERPRETATION client rendering plugins.

## Resolution

### 架构性决策（贯穿全部）

- **LLM 数据路径 ≠ UI 数据路径**：LLM 只需采样行（节省 token），UI 通过独立 result store RPC 获取完整数据集。
- **所有实现遵循 `dsh-plugin-development` Mode 3（Repository Package）**，严格遵守 `packages/client/AGENTS.md` 全部纪律。
- **Result data 通过 object layer cache 管理**（非组件 local state、非 declared store），组件通过 inject callback 读写。Client 侧实现轻量 LRU cache（按 result_id 索引），折叠/展开不丢数据。

### 7 个具体决策

| # | 决策 | 结论 |
|---|---|---|
| 1 | 宽表格 overflow 策略 | **Horizontal scroll**（`overflow-x: auto`，行业标准，数据完整性优先） |
| 2 | 数据不可用 fallback | **场景 A**（有 argsRaw，result store 不可用）：显示「数据已过期」提示 + text fallback + retry 按钮（retry = 重新从 result store 拉取）。**场景 B**（block.call===null）：generic text card，无 retry。 |
| 3 | 旧 suggest_followups chips | **完全隐藏**（新 turn 产生后旧 chips 从 DOM 移除） |
| 4 | 多轮 table 折叠 | Summary card = **title + KPI cards**（如有 kpi_columns），无 KPI 时退化为 title + row count。**点击原地展开**（lazy load from result store）。 |
| 5 | present_decomposition 可见性 | **默认展开**（透明度优先）。**confidence < 0.7 时**加黄色/橙色边框 + 「理解可能不准确，请确认」提示。 |
| 6 | Session 恢复 retry 行为 | Retry = 重新从 result store 拉取。拉不到 → text fallback +「数据已过期，无法恢复」。**重新执行查询不是 client 插件责任**（用户应重新提问）。 |
| 7 | 虚拟滚动 / 大数据量 | **虚拟滚动 day-1 必须**。UI 行数上限 = **10000 行**，超出提供「下载 CSV」。 |

### dsh-plugin-development 合规性确认

- 数据获取通过 inject callback（组件不见 ctx）✅
- Business data 在 object layer cache（非 store、非 local state）✅
- 虚拟滚动依赖（如 `@tanstack/virtual`）放 `dependencies` ✅
- 折叠/展开等 UI 交互状态可放 declared store ✅
- Retry/fetch 内部走 RPC 遵循 rpcId 双向协议 ✅
