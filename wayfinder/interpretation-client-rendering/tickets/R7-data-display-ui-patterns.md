# R4: 前沿 agent 数据展示 UI 调研(联网核验版)

**Type**: research (AFK)
**Status**: ✅ resolved
**Blocked by**: none
**Blocks**: [R8](R8-data-display-optimization-plan.md), [T4](T4-present-table-display-upgrade.md)

## Question

前沿 AI agent(对话式 BI 与通用 agent)在数据获取/分析完成后,如何设计数据展示 UI 层?表格交互基线、图表自动生成路线、取数透明度、追问建议与展示形态分别是什么做法与共识?

## Resolution

调研报告见 [../research/R7-data-display-ui-patterns.md](../research/R7-data-display-ui-patterns.md)(368 行)。第二轮使用 web-search-prime / web-reader MCP 完成联网核验:10/14 产品经官方页面/搜索结果核验,10 项重要修正(如 ChatGPT 表格为 interactive tables 而非静态 Markdown 表;ThoughtSpot 透明度走 query tokens + 语义层而非 SQL)。

五条经核验的核心结论:

1. **表格交互已是行业标配**(列排序 + 筛选 + 固定列 + CSV 下载 + 截断提示),静态只读表低于基线;
2. **图表自动生成三条路线**:PNG 静态 → static/interactive 双模式(ChatGPT ADA)→ 可交互代码(Claude Artifacts),均需用户切换工具栏兜底;
3. **取数透明度三条路径**:暴露 SQL(Genie/Hex/Julius,同卡折叠 + 执行状态)、治理语义层 tokens(ThoughtSpot)、默认隐藏 + 分析器(Power BI/Tableau);不可完全不透明;
4. **追问建议紧贴结果卡片**是取数域共识(Genie/Spotter/Julius);
5. **前沿方向 Actionable Insights**(ThoughtSpot:洞察直接触发 Jira/Slack/Salesforce 下游动作)。

与仓库内 [R1](R1-llm-ui-rendering-patterns.md) 互证一致。
