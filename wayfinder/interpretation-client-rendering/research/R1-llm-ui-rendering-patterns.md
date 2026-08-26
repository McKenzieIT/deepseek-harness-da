# R1: LLM Agent UI Tool-Result Rendering Patterns (2026)

## Summary

2026 年主流 LLM agent UI 普遍采用**混合渲染**：轻量结果（表格、KPI、建议 chips）**inline 在对话流中**渲染；重型产物（完整文档、交互式应用、代码编辑）在**side panel / artifact viewer** 渲染。数据类 agent（Databricks Genie、ThoughtSpot Sage）几乎全部 inline——因为数据结果就是对话的核心答案。Follow-up suggestion chips 在所有主流产品中都是 inline 渲染，紧跟答案下方。

## Findings

### 1. 通用 AI 助手

| 产品 | 表格/数据 | 图表 | 建议 chips | 结构化卡片 | 机制 |
|------|-----------|------|-----------|------------|------|
| **Claude (Artifacts)** | Inline（短表格）；Side panel（长文档/交互式） | Side panel（artifact） | Inline（对话流底部） | Side panel | Side panel = "Artifacts"；tool results inline |
| **ChatGPT (Canvas)** | Inline（代码解释器输出） | Inline（matplotlib/图表） | Inline chips | Side panel（Canvas 编辑区） | Canvas = 长文档编辑；数据结果 inline |
| **Cursor** | Inline（chat panel 内 expandable card） | N/A（代码工具） | N/A | Inline card（diff, terminal） | 全部 inline in side chat；expandable/collapsible |
| **Claude Code (Web)** | Inline（tool result text） | N/A | N/A | Inline（tool call tree） | keyed toolview 系统 |

**关键模式**：
- **Inline = 答案本体**：当 tool result 就是用户问题的答案时，inline 渲染
- **Side panel = 产物/工件**：当 tool result 是一个可编辑/可交互的独立产物时，side panel
- **Claude Artifacts 2026**：side panel 渲染 code/HTML/SVG/Mermaid；tool results 本身仍 inline（文本 + structured blocks）

### 2. 数据专用 Agent

| 产品 | 表格渲染 | 图表 | KPI/指标 | Follow-up | 位置 |
|------|---------|------|----------|-----------|------|
| **Databricks Genie One** | Inline 表格（chat 内直接展示） | Inline chart（adaptive visualization） | Counter chart / KPI widget | Suggested responses（inline） | 全 inline in conversational interface |
| **Databricks Genie Agents** | Inline + 可展开全屏 | Auto-generated（line/bar/area/pie） | Dashboard KPI widgets | Built-in suggestions | Inline；dashboard 是独立视图 |
| **Microsoft Fabric Data Agent** | Inline 表格 | Inline chart | Power BI tile | Suggested follow-up | Inline in chat panel |
| **ThoughtSpot Sage** | Inline pivot table | Auto-chart（AI 选最佳图表类型） | SpotIQ KPI cards | Drill-down chips | Inline；可 pin 到 dashboard |
| **Hex AI** | Inline + notebook cell | Inline（Plotly/Vega） | Metric cards | Suggested analyses | Hybrid（chat + notebook cells） |

**关键模式**：
- **数据 agent 全部 inline**——表格/图表就是"答案"，不适合 side panel（用户问"DAU 是多少"→答案就在对话里）
- **Genie 2026 的 "adaptive visualizations"**：根据数据自动选择最佳图表类型
- **Follow-up suggestions 是标配**：所有数据 agent 在答案后面紧跟 1-5 个建议（drill-down、time shift、compare）
- **KPI cards**：ThoughtSpot 和 Genie 都在表格上方展示 KPI summary（大数字 + 标签 + 趋势箭头）

### 3. Pattern 分类

| 数据类型 | 推荐渲染模式 | 交互 | 行业参考 |
|---------|-------------|------|---------|
| **结构化表格**（<50 行） | Inline card，默认展开 | 列排序、hover highlight | Genie, ThoughtSpot |
| **结构化表格**（>50 行） | Inline card，展示前 N 行 + "查看全部" | 虚拟滚动 + 展开/收起 | Genie（expand to full view） |
| **KPI summary cards** | Inline，表格上方的横向卡片行 | 无交互（纯展示） | ThoughtSpot SpotIQ, Superset |
| **Line/Bar chart** | Inline card，紧跟表格下方 | Hover tooltip（数据点值） | Genie, Fabric, Hex |
| **Query decomposition** | Inline collapsible card | 展开/收起（默认收起或展开取决于信任度） | ThoughtSpot "query understanding"；新模式 |
| **Follow-up suggestions** | Inline chip row，紧跟所有结果下方 | Click = 填入输入框 + 自动提交 | Genie, ThoughtSpot, ChatGPT |

### 4. 交互模式细节

**表格**：
- 默认展示 10-20 行；"Show more" 展开全部
- 列头点击排序（client-side）
- 无编辑功能（只读）
- 宽表格 horizontal scroll（非 truncate 列）

**图表**：
- Hover 显示 tooltip（具体数据值）
- 点击数据点 = drill-down（高级产品）或无交互（v1）
- 响应式宽度（跟随 chat bubble 宽度）

**Suggestion chips**：
- 点击后**立即提交**（不只是填入——Genie、ThoughtSpot 都是直接发送）
- 旧 chips 变灰/不可点击（新 turn 后）
- 1-5 个，水平 wrap

**Decomposition card**：
- 这是较新的模式（ThoughtSpot "Search Assist" 2025+ 展示 "I understood your question as..."）
- 默认展开（增加透明度）；重复 turn 后折叠
- 信任度低时 highlight（如 confidence < 0.7 时黄色边框）

## Recommendation for DSH data-agent

基于行业调研，推荐：

1. **全部 inline**——数据 agent 的结果就是对话答案，不需要 side panel。DSH 的 `tool.call.toolview` keyed slot 天然 inline，完美匹配。

2. **渲染层级**（同 turn 内从上到下）：
   - `present_decomposition` → collapsible card（默认展开）
   - `present_table` → KPI cards row + table + optional chart
   - `suggest_followups` → chip row

3. **交互**：
   - Suggestion chips: click = 立即提交（填入 + auto-send，如 Genie）
   - Table: 列排序、hover row highlight
   - Chart: hover tooltip
   - Decomposition: 展开/收起

4. **折叠策略**（多 turn）：
   - 当前 turn 的结果全部展开
   - 旧 turn 的 `present_table`/`present_decomposition` 折叠为 summary（标题 + 行数）
   - 旧 turn 的 `suggest_followups` 完全隐藏（已过时）

## Sources

- Databricks Genie One: https://learn.microsoft.com/en-us/azure/databricks/genie-ui/
- Databricks AI/BI release notes 2026: https://learn.microsoft.com/en-us/azure/databricks/ai-bi/release-notes/2026
- Databricks AI/BI concepts: https://learn.microsoft.com/zh-cn/azure/databricks/ai-bi/concepts
- Claude Features 2026: https://suprmind.ai/hub/claude/features/
- Genie Agents in Databricks Apps: https://learn.microsoft.com/zh-cn/azure/databricks/dev-tools/databricks-apps/genie
