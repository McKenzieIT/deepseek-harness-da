# 前沿 AI Agent 产品"数据获取/分析完成后"数据展示 UI 调研报告

- **调研日期**:2026-01-28(第二轮 MCP 联网核验完成)
- **调研方法**:
  - **第一轮(模型知识)**:基于模型训练知识(截止训练前公开的官方文档、博客、产品页),所有 URL 来自训练期已知的一手/二手来源,存在时效性风险。
  - **第二轮(MCP 联网核验)**:使用 `mcp__web-reader__webReader` 与 `mcp__web-search-prime__web_search_prime` 对关键产品进行实时核验,成功抓取 Anthropic、OpenAI、ThoughtSpot 官方页面全文,以及 Databricks、AG Grid、Google Gemini、Claude、ChatGPT 的多方搜索结果。
- **核验状态一览**:
  - ✅ **已联网核验**:Databricks AI/BI Genie、ThoughtSpot Spotter、ChatGPT Data Analysis(官方帮助中心全文)、OpenAI Canvas(官方公告页)、Claude Analysis Tool(Anthropic 官方公告)、Claude Artifacts(多家可靠二手报道)、Google Gemini Code Execution(官方文档)、Hex Magic(官方产品页)、Julius AI(官方文章)、AG Grid(官方文档)
  - ⚠️ **仍未联网核验**(仅基于模型知识,建议读者自行确认):Power BI Copilot(只抓到 Q&A deprecated 信息)、Tableau Agent / Einstein Copilot、Tableau Pulse、Dataherald
- **调研人**:Delegated Research Subagent(DSH)
- **适用范围**:对话式数据分析 agent / 通用 agent 富结果展示 / 前端企业级表格基线

---

## 一、对话式 BI / 数据分析 Agent

### 1. Databricks AI/BI Genie  ✅ 已核验

**来源**:[Databricks AI/BI Release Notes 2026](https://docs.databricks.com/aws/en/ai-bi/release-notes/2026)(一手)、[AI/BI Release Notes 2025 on GCP](https://docs.databricks.com/gcp/en/ai-bi/release-notes/2025)(一手)、[Zenlytic 二手介绍](https://zenlytic.com/blog/databricks-ai-bi-genie)(二手)

- **展示形态**:对话界面中以"结果卡片"形式呈现,含自然语言答案摘要、数据表格(使用 metric view display names 和 display formats,2026 release notes 确认)、自动生成的可视化图表
- **表格交互**:基础排序/列调整;✅ 支持下载 CSV(2026 release notes 确认"SQL download settings for full query results")
- **自动图表**:Genie 根据问题语义自动选择;用户可追问切换
- **取数过程透明度**:
  - ✅ 显示生成的 SQL(可展开/折叠)
  - ✅ 显示查询执行状态(2025 release notes:"It now displays Running query until the query result is ready")
  - ⭐ 2026 release notes 新增 "Metric view display names" — 列名显示业务化别名
- **追问建议**:结果卡片下方给出 2-4 个追问按钮
- **本轮核验修正**:确认了 SQL 透明度、CSV 下载、查询状态显示均为真;新增 metric view display names 细节

### 2. Microsoft Power BI Copilot / Fabric  ⚠️ 部分核验

**来源**:[Microsoft Learn - Q&A in Power BI](https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-intro)(一手)、[Neenopal](https://www.neenopal.com/blog/copilot-in-powerbi-get-instant-answers-without-rebuilding-dashboards)(二手)

- **重要更新**:Power BI 原生的 **Q&A 视觉对象已 deprecated**,微软正在向 **Copilot** 迁移
- **展示形态**:Copilot 侧边栏 + Smart Narratives;Copilot 可以 "generate entire report pages from a text prompt"
- **表格交互**:完整企业级(排序、钻取、交叉筛选、筛选窗格、书签、Focus Mode);导出 CSV/Excel
- **自动图表**:Copilot 可按问题自动选择;用户可切换 30+ 种图表类型
- **取数过程透明度**:⚠️ 默认隐藏 DAX/查询;高级用户可用性能分析器或 DAX Studio
- **本轮核验修正**:确认 Q&A deprecated,主力是 Copilot;Copilot 的"生成整页报告 + 叙事摘要"是核心能力

### 3. ThoughtSpot Spotter  ✅ 已核验(重大修正)

**来源**:[ThoughtSpot Spotter 官方产品页](https://www.thoughtspot.com/product/agents/spotter)(一手,已全文抓取)、[官方文档: Getting started with Spotter](https://docs.thoughtspot.com/cloud/26.8.0.cl/spotter-getting-started.html)(一手)、[新闻稿: Spotter Semantics](https://www.thoughtspot.com/press-releases/thoughtspot-introduces-spotter-semantics-to-bring-trust-and-context-to-enterprise-ai)(一手)

- **展示形态**:Search bar 为中心,Answer 卡片(表格+图表双视图);多步推理过程可见
- **表格交互**(核心强项):排序、筛选、搜索、钻取、列操作、导出(CSV/XLSX/PDF/PNG)、Pivot
- **自动图表**:✅ 智能图表推荐引擎;用户可一键切换,支持复合图表
- **取数过程透明度 — 重大修正**:
  - ⚠️ **ThoughtSpot 不暴露 SQL,也不暴露 TML**。官方产品页明确写:
    > "Instead of direct text-to-SQL, Spotter translates questions into **search tokens** grounded in your governed semantic layer—producing fully traceable, auditable queries."
  - 用户看到的是 **Query Tokens**;官方文档:"Query tokens Represent the simplified query, and show how the data in the answer was computed. Hover over a query token to see more information about it."
  - 核心差异化:**"governed semantic layer" + "search tokens"** 取代传统 NL2SQL 路径
- **Actionable Insights(重要新发现)**:Spotter 可自动触发下游动作:创建 Jira tickets、更新 Salesforce、发 Slack 消息
- **本轮核验重大修正**:ThoughtSpot 的透明度不是"显示 SQL",而是"显示 query tokens + semantic layer",这是与 Databricks Genie 截然不同的架构

### 4. Tableau Agent / Einstein Copilot ⚠️ 未核验

> ⚠️ 本轮未直接联网核验,以下基于模型训练知识。

**来源**:[Tableau Agent 公告](https://www.tableau.com/products/tableau-agent)(一手,未核验)

- Tableau Agent 对话式 → Workbook;Tableau Pulse Metrics 卡片流 + AI-generated insights;"Show Me" 面板自动推荐图表

### 5. Hex Magic  ✅ 已核验

**来源**:[hex.tech](https://hex.tech/)(一手)、[Querio 对比](https://querio.ai/articles/hex-magic-vs-databricks-notebooks-ai-features-compared)(二手)、[YouTube: Hex Agentic AI Ep39](https://www.youtube.com/watch?v=hUiXdjrsu8E)(二手)

- Notebook 式(Cell 内渲染表格/图表);Magic AI 生成 SQL/Python + 输出并列
- 代码完全透明;YouTube 确认 "thinking traces, SQL visibility, versioned"
- 支持组合为 Logic App 分享

### 6. Julius AI  ✅ 已核验

**来源**:[julius.ai](https://julius.ai/)(一手)、[Julius AI: Data to Graph AI](https://julius.ai/articles/data-to-graph-ai)(一手)

- 对话 + Python/R 代码 + 输出;matplotlib/seaborn/plotly 图表;支持 CSV/Excel/Google Sheets;代码完全可见

### 7. Dataherald  ⚠️ 未核验

> ⚠️ 基于模型训练知识。

**来源**:[GitHub](https://github.com/Dataherald/dataherald)(一手,未核验)

- NL2SQL 引擎,SQL 可见,可视化依赖前端集成

---

## 二、通用 Agent 的富结果展示

### 1. ChatGPT Advanced Data Analysis  ✅ 已核验(重大修正)

**来源**:[OpenAI Help Center: Data analysis with ChatGPT](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt)(一手,已全文抓取)、[Towards Data Science 评测](https://towardsdatascience.com/evaluating-chatgpts-data-analysis-improvements-interactive-tables-and-charts-622d3e5a3816/)(二手)

- **展示形态**:对话流中顺序嵌入 Python 代码块(可折叠)→ 代码输出 → 图表 → 文件下载;上传 CSV/Excel/JSON/PDF 等;支持 Google Drive/OneDrive/SharePoint 连接器
- **表格交互 — 重大修正**:
  - ⭐ **OpenAI 官方帮助中心明确写**:"The environment can use files made available to the session and can **display pandas DataFrames as interactive tables** when that format is useful."
  - ChatGPT 的表格**不是单纯的 Markdown 静态表**,而是**交互式 pandas DataFrame 渲染**(有排序/筛选/分页能力)
  - 大数据集截断 + 文件下载(CSV/XLSX)
- **自动图表 — 重大修正**:
  - ✅ 官方帮助中心明确区分了 **static charts(图像输出)** 和 **interactive charts(可交互)**
  - 官方原文:"ChatGPT can create static charts as image outputs. Some charts can also be shown as interactive charts."
  - 官方原文:"When an interactive chart is available, select **Switch to interactive chart**"
  - **支持交互式的图表类型**:bar、line、pie、scatter(其他类型退化为 static image)
- **取数过程透明度**:✅ Python 代码完全可见(可折叠);显示代码执行状态;上传/生成的文件可见
- **环境限制**:"stateful Jupyter notebook environment";Python 环境**不能发起外部网络请求**
- **本轮核验重大修正**:
  1. ChatGPT 的表格**是交互式的**(pandas DataFrame 渲染),不是静态 Markdown
  2. ChatGPT 的图表**分为 static/interactive 两种模式**,bar/line/pie/scatter 支持交互式切换

### OpenAI Canvas(独立功能,与数据分析关系有限)

**来源**:[OpenAI Blog: Introducing Canvas](https://openai.com/index/introducing-canvas/)(一手,已全文抓取)

- **定位修正**:Canvas 主要是用于**写作和编码项目的协作界面**,**不是数据分析工具**
- 写作/编码快捷功能(Suggest edits、Review code、Fix bugs 等)
- **与数据分析的关系**:Canvas 目前主要服务于代码/文档协作;数据分析仍以 Advanced Data Analysis 为主
- **本轮修正**:第一轮报告中"Canvas 用于数据分析"的说法需要弱化

### 2. Claude.ai Artifacts & Analysis Tool  ✅ 已核验

**来源**:[Anthropic: Introducing the Analysis Tool](https://www.anthropic.com/news/analysis-tool)(一手,已全文抓取)、[Zapier: Claude Artifacts visualize data](https://zapier.com/blog/how-to-use-claude-artifacts-to-visualize-data/)(二手)、[LabLab: Interactive Charts with Claude](https://lablab.ai/ai-articles/designing-ai-driven-interactive-charts-with-claude)(二手)

#### Analysis Tool(内置数据分析)

- **语言修正**:Analysis Tool 使用的是 **JavaScript**(非 Python)
  - 官方原文:"Claude can write and run **JavaScript** code"
- 内置代码沙箱,处理 CSV 文件,生成洞察(营销/销售/产品/工程/财务五大场景)

#### Artifacts(双栏可交互内容)

- **双栏界面**:左侧对话 / 右侧 Artifact 面板
- Artifact 可以是:代码、Markdown、SVG、**React 组件**、Mermaid 图、HTML 页面
- **图表能力(重大确认)**:
  - 多家二手来源确认 Claude 使用 **React + Recharts**(也有用 Chart.js 的情况)生成**真正可交互的图表**
  - LabLab 原文:"When you ask Claude to visualize data, it doesn't return an image. It **generates live, interactive chart code**, typically using **Recharts** or **Chart.js**"
- **表格能力**:取决于模型生成的 React 代码;模型倾向生成带排序、筛选、搜索的 React 表格
- **本轮核验修正**:确认 Analysis Tool 用 JavaScript(非 Python);确认 Artifacts 用 React + Recharts 生成真正可交互图表(比 ChatGPT 的 interactive charts 更自由)

### 3. Google Gemini 代码执行与数据展示  ✅ 已核验

**来源**:[Google AI: Code execution docs](https://ai.google.dev/gemini-api/docs/code-execution)(一手)、[Google Developers Blog: Gemini 2.0 Deep Dive](https://developers.googleblog.com/gemini-20-deep-dive-code-execution/)(一手)

- 对话流中内联 Python 代码块 + 输出 + 图表;Gemini 2.0 明确支持"graphs & chart output";Python 代码可见

---

## 三、前端生态数据表格能力基线

### 1. TanStack Table(原 React Table)

**来源**:[TanStack Table 官方文档](https://tanstack.com/table/latest)(一手)

- **定位**:**Headless UI** 表格库 — 只提供逻辑,不提供 UI
- **内置能力**:排序、筛选、分页、列调整(隐藏/显示/列宽/列固定 pinning left/right)、行选择、展开行、分组与聚合、虚拟滚动
- **不包含**:渲染、样式、导出(需自行实现)
- **框架支持**:React / Vue / Solid / Svelte / Qwik / Lit

### 2. AG Grid  ✅ 已核验

**来源**:[AG Grid Community vs Enterprise](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/)(一手)、[AG Grid Enterprise Landing](https://www.ag-grid.com/landing-pages/enterprise-data-grid/)(一手)、[AG Grid Pivot Chart](https://www.ag-grid.com/javascript-data-grid/integrated-charts-pivot-chart/)(一手)

- **定位**:企业级完整表格解决方案(Community 免费 + Enterprise 付费)
- **Community 版**:排序、筛选、分页、列调整、单元格编辑、行选择、主题(含深色)、**CSV 导出**
- **Enterprise 版追加**(官方核验):
  - ✅ 行分组 & 聚合;✅ 主从表(Master-Detail)
  - ✅ **Excel 导出**(Open XML xlsx,支持样式和公式)
  - ✅ 剪贴板操作;✅ **Integrated Charts**(选中数据范围直接在表格内生成图表,含 Pivot Chart)
  - ✅ Sparklines;✅ **Pivot(透视)**;✅ 服务器端行模型;✅ **AI Toolkit**(新增);✅ Range Selection
- **无障碍**:完整 ARIA 支持、键盘导航

### 3. 其他主流表格(简要,未实时核验)

| 库 | 特点 |
|---|---|
| **Ant Design Table** | React UI 库内置,中文生态常用 |
| **MUI X Data Grid** | Material-UI 官方,Community + Pro + Premium 分级 |
| **Handsontable** | 类 Excel 体验,商业授权 |

---

## 四、可复用的 UI 模式清单

### 📋 展示模式(5 种)

1. **对话流内联卡片模式**(ChatGPT、Databricks Genie、Julius AI、Claude Analysis Tool)
2. **双栏 Artifact 模式**(Claude Artifacts、Hex)
3. **Notebook Cell 模式**(Hex、Julius AI)
4. **嵌入式仪表盘模式**(Power BI Copilot、Tableau Agent)
5. **侧边栏/抽屉模式**(Claude Artifacts、Power BI Copilot)

### 🎛️ 表格交互基线

**必备(Must-have)**:列排序、全局搜索/列筛选、列宽拖拽调整、固定列(Pin left/right)、行数显示、CSV 下载、单元格/整行复制、大数据集截断+"查看全部"入口

**推荐(Nice-to-have)**:列隐藏/显示、列拖拽排序、Excel(XLSX)导出、分页/虚拟滚动、单元格值格式化、行选择+批量操作、展开行、全屏/焦点模式、业务化列名(metric view display names,Databricks Genie 特性)

**高级(Advanced)**:透视(Pivot)、聚合切换、主从表、选中数据一键生成图表(AG Grid Enterprise)、数据回写、触发下游工作流(Jira/Slack/Salesforce,ThoughtSpot Spotter 特性)

### 📊 可视化自动化

- ✅ **模型主动生成**主流图表(柱/线/饼/散点)是行业共识
- ✅ 提供**图表类型切换工具栏**
- ✅ **字段语义推断图表类型**:时间序列 → 折线,分类 → 柱状,占比 → 饼,相关 → 散点
- ⭐ **区分 static / interactive 两种模式**(ChatGPT 特性)
- ⭐ **使用 React + Recharts/Chart.js 生成真正可交互图表**(Claude Artifacts 路线)
- ✅ 支持**复合图表**(双 Y 轴、组合图)

### 🔍 取数过程透明度(Explainability)— 多种架构路径

调研发现**三条不同的架构路径**,这是重要洞察:

1. **暴露 SQL 路径**(Databricks Genie、Hex、Julius AI、ChatGPT ADA):SQL/Python 代码直接可见,默认折叠;专业用户可编辑 SQL 重跑
2. **Search Tokens 路径**(ThoughtSpot Spotter):不暴露 SQL,而是显示"query tokens";通过 governed semantic layer 保证准确性和可审计性;主打"deterministic, no hallucination"
3. **默认隐藏 + 性能分析器路径**(Power BI Copilot、Tableau):普通用户看不到底层查询;高级用户通过性能分析器或管理员面板查看

**必备项**:某种形式的取数透明度(三条路径之一,不可完全不透明);执行状态指示器;数据源标识;行数/列数元信息

### 💬 追问建议与数据展示的整合

- ✅ 结果卡片**下方**提供 2-4 个追问建议(位置关键!)
- ✅ 追问类型:细分、可视化切换、深入分析、导出报告
- ⭐ 基于数据特征动态生成

### 🎨 主题与无障碍

- ✅ **深色模式**(必选项);✅ **移动端响应式**
- ⭐ **无障碍**:ARIA 标签、键盘导航、屏幕阅读器、颜色对比度合规(WCAG 2.1 AA)
- ⭐ **国际化**:数字/日期/货币本地化格式

---

## 五、设计权衡与共识结论

### 1. 表格交互的共识基线

> **结论**:无论产品定位如何,数据 Agent 的表格至少要做到"列排序 + 筛选 + 列固定 + CSV 导出 + 大数据截断"。

**本轮新增洞察**:ChatGPT 用 pandas DataFrame 渲染实现了交互式表格,证明**即使是对话式产品也能做到表格交互** — 简陋 Markdown 静态表已经是落伍做法。

### 2. 图表自动生成的共识

> **结论**:所有主流产品都做"模型主动生成图表",但实现路线有差异。

**本轮新增洞察 — 三种图表实现路线**:
1. **PNG 静态图**:基础路线(大多数产品)
2. **区分 static/interactive 模式**:ChatGPT ADA — bar/line/pie/scatter 支持交互式切换
3. **React + Recharts 生成真正可交互代码**:Claude Artifacts — 自由度最高

**权衡**:必须提供**图表切换工具栏**作为兜底(自动生成常出错)。

### 3. SQL / 代码透明度的共识

> **结论**:某种形式的取数过程透明度是**行业共识**,但实现路径多样。

**三条架构路径**(详见第四节):NL2SQL + 显示 SQL(Databricks Genie);Search Tokens + Semantic Layer(ThoughtSpot Spotter);隐藏查询 + 性能分析器(Power BI)

### 4. 导出能力的共识

> **结论**:CSV 是底线,XLSX 是加分项,PDF/图片用于报告场景。

### 5. 追问建议的共识

> **结论**:追问建议应**紧跟结果卡片下方**。2-4 个、基于数据特征动态生成。

### 6. 展示模式选择

| 用户类型 | 推荐展示模式 | 理由 |
|---|---|---|
| 业务用户(非技术) | 对话流内联卡片 + 自动图表 + 简单表格 | 低学习成本 |
| 数据分析师 | 双栏 Artifact / Notebook | 代码 + 结果并重 |
| 管理层 | 仪表盘嵌入模式 | 与现有 BI 集成 |
| 移动端 | 简化卡片 + 摘要 + 全屏查看 | 屏幕空间有限 |

### 7. 深色模式 / 无障碍

> **结论**:深色模式已是行业标配,无障碍是合规要求(WCAG 2.1 AA)。

### 8. 当前简陋表格的改进路径建议(按优先级)

1. **P0(立即)**:加入排序、筛选、CSV 下载、行数显示、SQL/代码折叠查看、**交互式表格**(替代 Markdown 静态表)
2. **P1(近期)**:列固定、列宽调整、XLSX 导出、深色模式适配、**业务化列名**(metric view display names)
3. **P2(中期)**:自动图表 + 图表类型切换、追问建议紧贴卡片下方、**interactive chart 模式**(bar/line/pie/scatter)
4. **P3(长期)**:双栏 Artifact 模式、SQL 编辑重跑、透视、聚合切换、虚拟滚动、**Actionable Insights(触发下游工作流)**

---

## 六、本轮核验发现的重要修正汇总

| 产品 | 第一轮说法 | 第二轮修正 | 来源 |
|---|---|---|---|
| ChatGPT ADA 表格 | "Markdown 静态表格,无交互" | **交互式 pandas DataFrame 渲染** | OpenAI 帮助中心原文 |
| ChatGPT ADA 图表 | 只描述生成图表 | **区分 static/interactive 两种模式**,bar/line/pie/scatter 支持交互式 | OpenAI 帮助中心原文 |
| OpenAI Canvas | "可用于数据分析" | **Canvas 主要用于 writing/coding 协作**,与数据分析关系有限 | OpenAI Blog |
| ThoughtSpot Spotter 透明度 | "显示搜索语法(TML)" | **显示 query tokens + governed semantic layer**,不暴露 SQL | ThoughtSpot 官方产品页 + 文档 |
| Claude Analysis Tool 语言 | "Python" | **JavaScript**(不是 Python) | Anthropic 官方公告 |
| Claude Artifacts 图表 | "React 组件生成" | 进一步确认使用 **React + Recharts/Chart.js**,真正可交互 | Zapier / LabLab 等多来源 |
| ThoughtSpot Spotter | 未提及 | **Actionable Insights**:可触发 Jira/Slack/Salesforce 等下游动作 | ThoughtSpot 官方产品页 |
| Databricks Genie 列名 | 未提及 | **Metric view display names**:业务化列名取代裸字段名 | 2026 Release Notes |
| Power BI Q&A | 仍在用 | **Q&A deprecated**,主力迁移到 Copilot | Microsoft Learn |
| ThoughtSpot 移动端 | "持续完善" | **明确支持 Mobile Support** | ThoughtSpot 官方产品页 |

---

## 七、调研局限与后续建议

### 本轮已解决

- 主要产品的官方文档已核验,核心结论可靠
- 关键术语(Search Tokens、Artifacts、Interactive Charts)已确认

### 本轮仍未解决

- Power BI Copilot 的具体 UI 细节(只抓到 Q&A deprecated 的信息)
- Tableau Agent / Einstein Copilot 最新功能细节
- Dataherald 具体 UI 细节

### 建议后续动作

1. **亲自试用** free tier:Databricks AI/BI Genie、ThoughtSpot(trial)、Claude.ai、Julius AI、ChatGPT Plus
2. **竞品截图采集**:建立 Figma / Notion 库收集各家数据卡片设计
3. **用户调研**:针对自己产品的用户群(业务 / 分析师 / 工程)做专项访谈
4. **A/B 测试**:自动图表 vs 不自动图表、SQL 折叠 vs 不折叠、追问建议位置
5. **跟踪 changelog**:关注 Databricks / ThoughtSpot / Anthropic / OpenAI 的官方博客更新

---

## 八、参考链接汇总(按类别)

### 对话式 BI / 数据分析(已核验)
- [Databricks AI/BI Release Notes 2026](https://docs.databricks.com/aws/en/ai-bi/release-notes/2026)
- [Databricks AI/BI Release Notes 2025](https://docs.databricks.com/gcp/en/ai-bi/release-notes/2025)
- [Databricks Blog: Introducing AI/BI](https://www.databricks.com/blog/introducing-ai-bi-democratizing-data)
- [ThoughtSpot Spotter](https://www.thoughtspot.com/product/agents/spotter)
- [ThoughtSpot: Getting started with Spotter](https://docs.thoughtspot.com/cloud/26.8.0.cl/spotter-getting-started.html)
- [ThoughtSpot Press Release: Spotter Semantics](https://www.thoughtspot.com/press-releases/thoughtspot-introduces-spotter-semantics-to-bring-trust-and-context-to-enterprise-ai)
- [Microsoft Learn: Q&A in Power BI](https://learn.microsoft.com/en-us/power-bi/natural-language/q-and-a-intro)
- [Microsoft Learn: Copilot in Power BI](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction)
- [hex.tech](https://hex.tech/)
- [Hex Notebooks](https://hex.tech/product/notebooks/)
- [julius.ai](https://julius.ai/)
- [Julius AI: Data to Graph AI](https://julius.ai/articles/data-to-graph-ai)

### 通用 Agent 富结果展示(已核验)
- [OpenAI Help Center: Data analysis with ChatGPT](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt)
- [OpenAI Blog: Introducing Canvas](https://openai.com/index/introducing-canvas/)
- [Anthropic: Introducing the Analysis Tool](https://www.anthropic.com/news/analysis-tool)
- [Anthropic: Artifacts](https://www.anthropic.com/news/artifacts)
- [Zapier: How to use Claude Artifacts to visualize data](https://zapier.com/blog/how-to-use-claude-artifacts-to-visualize-data/)
- [Google AI: Code execution docs](https://ai.google.dev/gemini-api/docs/code-execution)
- [Google Developers Blog: Gemini 2.0 Deep Dive](https://developers.googleblog.com/gemini-20-deep-dive-code-execution/)

### 前端表格基线(已核验)
- [TanStack Table](https://tanstack.com/table/latest)
- [AG Grid Community vs Enterprise](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/)
- [AG Grid Excel Export](https://www.ag-grid.com/javascript-data-grid/excel-export/)
- [AG Grid Enterprise Landing](https://www.ag-grid.com/landing-pages/enterprise-data-grid/)
- [AG Grid Pivot Chart](https://www.ag-grid.com/javascript-data-grid/integrated-charts-pivot-chart/)

### 未核验(待后续补充)
- [Tableau Agent](https://www.tableau.com/products/tableau-agent)
- [Tableau Pulse](https://www.tableau.com/products/tableau-pulse)
- [Salesforce Einstein Copilot](https://help.salesforce.com/s/articleView?id=sf.c360__einstein_copilot.htm)
- [Dataherald GitHub](https://github.com/Dataherald/dataherald)

---

*本报告由 DeepSeek Harness 调研 subagent 生成。第二轮 MCP 联网核验已完成(覆盖 10+ 产品、40+ 搜索结果、4 个官方文档全文抓取),核心结论可靠。仍有个别产品(Tableau、Dataherald)未核验,建议读者按引用 URL 自行确认。*
