# W6d — B→A 布局演进（路由 + 自动翻转）

**Type**: task
**Status**: Closed
**Blocked by**: W6c

## Question

实现 B→A 布局演进的路由机制和自动翻转逻辑。

## 规格

### 双路由并存

| 路由 | 内容 | 角色 |
|------|------|------|
| `/workspace` | 资产浏览/搜索/编辑 + 管理 agent 对话 | B 布局的 landing（资产为首） |
| `/dashboard` | 证据 hero（EvalTrajectory + coverage KPI + delta view）+ workspace drill 入口 | A 布局的 landing（证据为首） |

两路由始终可访问（手动 URL 切换），仅默认 landing 不同。

### 自动翻转逻辑

Config 项 `layoutMode: 'B' | 'A' | 'auto'`：

- `'B'`：强制 `/workspace` 为默认 landing
- `'A'`：强制 `/dashboard` 为默认 landing
- `'auto'`（推荐默认）：
  - 当 eval 历史 < threshold → B（无数据支撑 dashboard）
  - 当 eval 历史 >= threshold → A（数据足够支撑 trajectory view）
  - Threshold = **3+ eval runs with delta data**（即至少跑过 3 次有前后对比的 eval）

### Dashboard 组件（A 布局 landing）

复用 W5-full 的 Evidence Panel 组件（提升而非新建）：
- **EvalTrajectory** → hero 位置（大尺寸，时间线 + pass rate 趋势）
- **CoveragePanel** → KPI 卡片行
- **EvalDeltaView** → 最近一次 delta 详情
- **GapPanel** → 未覆盖资产提示
- **Workspace drill 入口** → 按钮/链接跳转 `/workspace`

### 满足 W5 四条演进约束

| 约束 | 如何满足 |
|------|----------|
| ① 证据=可提升模块 | EvidenceSidebar 组件提升为 dashboard hero |
| ② 落地路由可切换 | `layoutMode` config + auto 逻辑 |
| ③ 共享 evidence-query 后端 | dashboard 和 sidebar 都读 ctx.evidenceQuery |
| ④ 资产工作区可深链 | `/workspace?asset=xxx` 保持可达 |

### 实现策略
- 不推翻 B 结构：B 的代码不删除、不改动
- A = 新路由 + 组件重组合（从 EvidenceSidebar 的组件 → dashboard 布局）
- Auto-flip 逻辑在 router/layout level（检查 eval store run count）

## 验收

- [ ] `/workspace` 和 `/dashboard` 两路由均可访问
- [ ] `layoutMode: 'B'` → 默认 landing = workspace
- [ ] `layoutMode: 'A'` → 默认 landing = dashboard
- [ ] `layoutMode: 'auto'` + <3 eval runs → B；>=3 eval runs → A
- [ ] Dashboard 包含 EvalTrajectory hero + KPI + delta + drill 入口
- [ ] B 结构未被推翻（workspace 路由和组件完整保留）
- [ ] W5 四条演进约束全部满足
- [ ] 测试覆盖 auto-flip 逻辑
