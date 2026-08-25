# R6 — Web UI 实现方案技术调研

## 目标

调研 dsh 插件化架构下语义层 Web UI 的技术实现路径。产出技术方案文档，解决 G4 决策所需的可行性前提。

## 调研步骤

### 1. 分析现有 Web UI 插件结构

在 `packages/client/` 下找到 2-3 个已实现的 UI 插件（如 `ui-workspace`、`ui-conversation`、`ui-skill`），分析：
- 目录结构（entry / components / slots / styles）
- 如何注册到 Client UI Slot 系统（`slot.register` or annotation）
- 如何注册一个新的导航项/路由
- 数据获取模式（typert RPC / ctx service proxy / REST）

### 2. 理解 Host ↔ Client 通信

搜索 `typert-protocol`、`TypertRemoteService`、`@Remote` 了解：
- Host 侧 Service 如何暴露方法给 Client
- Client 如何调用 host 上的 `ctx.schema`
- 是否有现成的 "Service → Client RPC" 模式可复用

### 3. 确认语义层数据访问路径

`ctx.schema` 运行在 host 进程。Web UI 渲染在浏览器。需要明确：
- 是否已有 `ctx.schema` 的 Remote 接口？
- 若无，需新增哪些 RPC 方法（list tables/events/metrics、search、load definition）？
- 搜索后端：BM25Linker 在 host 进程内存中，能否直接暴露为 RPC？延迟预期？

### 4. 图谱可视化选型

检查 `package.json`（monorepo root + client packages）中已有的前端图谱依赖：
- 有无 React Flow / D3 / Cytoscape？
- 若无，推荐哪个？评估标准：bundle size、与 React 集成度、DAG 布局能力

### 5. 产出文档

写入 `wayfinder/semantic-layer/research/r6-web-ui-implementation.md`，含：
- 推荐的插件结构模板
- 数据流示意（host ↔ client）
- R5 各推荐功能的可行性判断
- 工作量估计（S/M/L）

## 参考文件

| 文件 | 用途 |
|------|------|
| wayfinder/semantic-layer/research/r5-web-ui-semantic-layer.md | UI 设计调研（需求侧） |
| wayfinder/semantic-layer/research/r3-harness-plugin-system.md | Cordis + UI Slot 系统调研 |
| packages/client/ | 现有 UI 插件实例 |
| packages/extensions/cordis-host-runner/ | Host 侧插件运行时 |
| packages/typert/ | RPC 协议层 |
| packages/data/semantic-layer/src/index.ts | ctx.schema Service 接口 |

## 验收

- 文档产出并写入 research 目录
- R6 ticket closed + map updated
- G4 unblocked（G4 的决策依赖本调研的可行性结论）
