# R5 — Web UI 语义层管理界面调研

## 1. 业界产品分析

### dbt Cloud

**核心 UI 特性：**

- **Explorer（资源浏览器）**：以 DAG（有向无环图）方式可视化展示 models、semantic models、metrics 之间的依赖关系。用户可在图上点击节点跳转到资源详情页。
- **Semantic Layer Querying（语义层查询）**：2025年推出 beta 功能，用户可在 dbt Insights 中对语义层执行 SQL 查询，无需手写 SQL。界面引导用户基于可用的 metrics、dimensions、entities 构建查询。
- **Metrics 定义**：通过 YAML 文件定义 metrics（支持 simple、derived、cumulative、conversion 等类型），在 Explorer UI 中以列表+详情方式展示。
- **Data Health Tiles（数据健康卡片）**：可嵌入到仪表板中的健康状态小组件，显示数据新鲜度、测试通过率等信号。
- **Cost Insights（成本洞察）**：提供跨 DAG 的资源消耗可视化，帮助用户发现高成本查询和模型。
- **Query History（查询历史）**：记录 Insights 和 Semantic Layer 查询的执行历史。

**组织方式**：基于 project > semantic model > metric 层级结构，通过 YAML 中的 `meta` 和 `tags` 进行额外分类。

---

### Atlan

**核心 UI 特性：**

- **Enterprise Data Graph（企业数据图谱）**：统一展示 warehouse SQL、BI 定义（dbt/Looker/Cube）和业务上下文，形成可导航的知识图谱。
- **搜索与发现**：类 Google 的全局搜索栏，支持按资产类型、owner、certification 状态、标签过滤。
- **血缘（Lineage）可视化**：自动化数据血缘，实时映射数据在整条 pipeline 中的流转路径，精确到列级别（column-level lineage）。
- **Business Glossary（业务术语表）**：统一管理业务术语定义，与资产自动关联。
- **Certification & Ownership**：资产认证徽标和责任人标注，直接在资产卡片上展示。
- **Context Layer for AI**：为 AI Agent 提供结构化上下文（glossary terms、ownership、certification、access policy）。
- **Metadata Lakehouse**：可配置、可扩展，支持数亿级资产规模。

**组织方式**：
- 多维分类：Tags + Glossary Terms + Domains + Collections
- 资产卡片带有认证徽标、新鲜度指示器、Owner 头像
- 左侧导航按 Domain（业务域）组织，支持多视图切换

---

### DataHub

**核心 UI 特性：**

- **Metadata Graph（元数据图）**：基于图数据库的元数据管理，提供深度上下文，涵盖 AI 和数据资产。
- **Search & Discovery**：全文搜索 + faceted filtering（按 domain、platform、tags、glossary terms 过滤）。
- **Domains（域）**：将数据资产按业务域分组（如 Marketing、Finance、Engineering），支持层级域。
- **Glossary（术语表）**：支持术语定义、层级关系（parent/child terms）、与资产的多对多关联。
- **Lineage Graph**：交互式血缘图，支持列级血缘、上下游追溯、blast radius 分析（变更影响分析）。
- **Tags & Ownership**：灵活的标签系统 + 明确的资产所有权分配。
- **Metadata Testing（元数据测试）**：内置元数据质量检查规则。
- **Observability（可观测性）**：DataHub Cloud 提供数据新鲜度、schema 变更、数据量异常等自动监控。
- **Policy Controls（策略控制）**：RBAC + 细粒度数据访问策略。

**组织方式**：
- Domain-first 导航 + Tag-based 过滤
- Browse 树形浏览（按平台/数据库/schema 层级）
- 搜索与 faceted filter 并存

---

### Metabase

**核心 UI 特性：**

- **Models（模型）**：将 saved questions 提升为"模型"，作为可信数据源暴露给业务用户。模型可添加描述、设置列语义类型。
- **Collections（集合）**：用文件夹式层级结构组织 questions、dashboards、models。支持权限控制。
- **Metrics（指标）**：Pro/Enterprise 版支持定义"官方 metrics"，确保全组织使用一致的指标定义。
- **Visual Query Builder**：拖拽式查询构建器，无需写 SQL 即可筛选、聚合、分组数据。
- **Curated Experience**：管理员可将 models 和 metrics 策展到首页或特定 collection，降低用户发现成本。
- **Audit Logs & Data Sandboxing**：Pro/Enterprise 提供审计日志和数据沙盒隔离。

**组织方式**：
- Collection（集合）层级 + 扁平化 model/metric 列表
- 基于权限的可见性控制
- Pin（置顶）重要资产到 Collection 首页

---

### 其他

#### Cube（Cube.dev）

- **Playground**：交互式查询构建器，用户选择 measures 和 dimensions，实时预览查询结果。
- **Data Model Editor**：schema 文件（JavaScript/YAML）定义 cubes、measures、dimensions、joins。
- **API-first 设计**：REST / GraphQL API 暴露语义层，UI 主要服务于开发和调试。
- **Metric Governance**：单一定义源，确保 metric 在所有下游工具中计算一致。

#### Looker（Google Cloud）

- **LookML 建模层**：以代码方式定义 dimensions、measures、joins，形成机器可读的语义本体（ontology）。
- **Explore 界面**：业务用户选择 Explore → 选择维度/度量 → 拖拽构建查询 → 可视化结果。
- **Data Model 管理**：开发者在 LookML IDE 中编辑模型；变更通过 Git 管理和部署。
- **Content Validation**：检测 LookML 变更对下游 Dashboard 的影响。

#### Hex（Context Studio）

- **Semantic Models**：定义共享的 metrics 和 dimensions 定义（如"win rate"的官方含义）。
- **Context Studio**：观察、测试和部署 AI Agent 的工作台，语义模型作为 AI 查询的基础。

---

## 2. 分类/组织方式

### 三种主流模式对比

| 模式 | 代表产品 | 优点 | 缺点 |
|------|----------|------|------|
| **Tag-based（标签）** | DataHub, Atlan | 灵活、多维分类、易扩展 | 标签管理混乱、缺乏层级感 |
| **层级/树形（Hierarchy）** | Metabase Collections, DataHub Browse | 直观、符合用户心智模型 | 资产只能归属一个位置、难以交叉发现 |
| **多视图（Multi-view）** | Atlan, dbt Explorer | 同一资产多种入口、适应不同角色 | 实现复杂、需保持视图同步 |

### 最佳实践总结

1. **Domain-first + Tag-secondary**：顶层按业务域（Domain）组织，辅以标签做横向分类。DataHub 和 Atlan 均采用此模式。
2. **多入口发现**：
   - 全局搜索（模糊匹配 + faceted filter）
   - 树形浏览（按 domain/platform/schema）
   - 图谱导航（从 lineage 图跳转）
   - 推荐/热门（基于使用频率）
3. **Glossary 与 Tag 分离**：业务术语（Glossary Term）用于业务语义对齐，标签（Tag）用于运维/技术分类（如 `PII`、`deprecated`）。
4. **认证/信任层级**：资产分为 Certified、Draft、Deprecated 等状态，视觉上通过徽标区分。

---

## 3. 质量监控 UI 模式

### 覆盖率（Coverage）

- **dbt Data Health Tiles**：嵌入式卡片，显示 model 级别的测试覆盖率和通过率。颜色编码（绿/黄/红）。
- **DataHub Metadata Testing**：配置规则检查资产是否具备 owner、description、tags 等必需元数据，生成覆盖率报告。
- **Atlan Certification**：资产有/无 certification 作为"治理覆盖"的代理指标。

### 使用热力图（Usage Heatmap）

- **dbt Explorer DAG**：节点着色可按使用频率、成本、新鲜度等维度。热门节点高亮，冷门节点淡化。
- **DataHub Popularity**：基于查询频率的资产热度排名，搜索结果中按热度排序。
- **Metabase**：审计日志分析 question/dashboard 的访问频次，识别高频/低频资产。

### 告警（Alerting）

- **DataHub Observability**：自动检测 schema 变更、数据新鲜度异常、数据量突变，触发告警。
- **dbt Freshness Tracking**：DAG 级别的数据新鲜度监控，超时触发通知。
- **Atlan**：资产健康状态实时更新，结合 Slack/Teams 通知。

### 质量监控 UI 模式总结

| UI 组件 | 作用 | 代表实现 |
|---------|------|----------|
| 健康卡片/Badge | 资产级别快速健康状态 | dbt Data Health Tile |
| 全局仪表板 | 聚合治理指标趋势 | DataHub Observability Dashboard |
| DAG 热力着色 | 跨资产的问题快速定位 | dbt Explorer + Cost Insights |
| 内联告警 | 资产详情页中的实时告警 | DataHub/Atlan 告警列表 |
| 覆盖率进度条 | 治理目标完成度 | DataHub Metadata Testing |

---

## 4. 推荐方案

### 入口设计

```
┌─────────────────────────────────────────────────────────┐
│  全局搜索栏（支持 metrics/dimensions/models 模糊搜索）     │
├────────┬────────────────────────────────────────────────┤
│        │                                                │
│ 左侧   │            主内容区                             │
│ 导航栏  │                                                │
│        │                                                │
│ • 概览  │   根据左侧选择动态展示：                        │
│ • 域    │   - 列表视图 / 卡片视图 / DAG 视图             │
│ • 指标  │   - 资产详情面板（右侧抽屉）                    │
│ • 维度  │                                                │
│ • 模型  │                                                │
│ • 血缘  │                                                │
│ • 质量  │                                                │
│        │                                                │
└────────┴────────────────────────────────────────────────┘
```

### 布局建议

1. **三栏布局**：左侧导航（资产分类树）+ 中间列表/图谱 + 右侧详情面板（抽屉式，按需展开）
2. **顶部全局搜索**：Cmd+K 快速搜索，支持 type-ahead 和 faceted filter
3. **面包屑导航**：Domain > Category > Asset，保持用户方向感
4. **视图切换**：列表 / 卡片 / DAG 三种视图一键切换

### 分类方案

```
层级1：Domain（业务域）
  ├── 营收域
  ├── 用户域
  ├── 产品域
  └── 运营域

层级2：Asset Type（资产类型）
  ├── Metrics（指标）
  ├── Dimensions（维度）
  ├── Semantic Models（语义模型）
  └── Entities（实体）

横向：Tags（标签）
  ├── 状态：certified / draft / deprecated
  ├── 敏感度：PII / internal / public
  └── 自定义标签
```

### 关键交互

| 交互 | 设计 | 理由 |
|------|------|------|
| **搜索** | Cmd+K 全局搜索 + 实时预览 | 参考 Atlan/DataHub，减少导航层级 |
| **资产详情** | 右侧抽屉面板（不离开列表页） | 保持上下文，快速浏览多个资产 |
| **血缘探索** | 交互式 DAG，点击节点展开上下游 | 参考 dbt Explorer / DataHub Lineage |
| **指标预览** | 选择 metric → 选择 dimensions → 实时预览结果 | 参考 Cube Playground / dbt Insights |
| **质量一览** | 概览页顶部 KPI 卡片（覆盖率/告警数/新鲜度） | 参考 dbt Data Health Tiles |
| **批量操作** | 多选资产 → 批量打标签/设 Owner/变更状态 | 提升治理效率 |
| **编辑** | 行内编辑 description + modal 编辑复杂属性 | 降低编辑门槛 |
| **变更审计** | 资产详情页"历史"标签，展示变更时间线 | 参考 Git-style change history |

### 技术选型建议

- **前端框架**：React + TypeScript
- **图谱可视化**：D3.js / React Flow（适合 DAG / Lineage 场景）
- **搜索**：Elasticsearch / Typesense（支持全文搜索 + faceted filter）
- **状态管理**：Server-state 优先（React Query / SWR），减少客户端复杂度
- **设计系统**：Ant Design / Radix UI + 自定义主题

---

## 参考来源

- dbt Platform Features & 2025 Release Notes: https://docs.getdbt.com/docs/platform/about-platform/dbt-platform-features
- dbt Metrics Overview: https://docs.getdbt.com/docs/build/metrics-overview
- Atlan Context Layer vs Semantic Layer: https://atlan.com/know/ai-agent/semantic-layer/context-layer-vs-data-catalog-vs-semantic-layer/
- Atlan Agentic Data Catalog: https://atlan.com/agentic-data-catalog/
- DataHub AI-Ready Data: https://datahub.com/blog/ai-ready-data/
- DataHub OSS vs Cloud: https://archive.docs.datahub.com/docs/1.6.0/managed-datahub/managed-datahub-overview
- Data Lineage Tools Compared: https://dataobservability.ai/data-lineage-tools
- Domo Open Source BI Tools: https://www.domo.com/learn/article/open-source-bi-tools
