---
type: task
status: open
assignee: null
blocked_by: []
---

# W27: 可扩展 Semantic Graph 投影与 concept 支持

**Branch**: `codex/semantic-layer-w27-semantic-graph-projection`

## Question

如何让 Semantic Graph 的 Host 投影和 Client 展示支持开放的资产与关系 kind，并让当前已经存在的 `concept` 进入真实 Graph Remote 路径？

## Scope

- 在 fork-owned Semantic Layer 与 Schema Gateway 中定义稳定、可序列化的 `SemanticGraphNode`、`SemanticGraphEdge` 与查询字段；跨进程 id 使用 branded 类型。
- 节点与关系 `kind` 保持开放，不再以 `dws | dim | event | metric` 或三种关系的封闭 union 限制 Graph RPC。
- Host 按 Semantic Layer kind registry 生成 graph projection；每个 kind 明确贡献节点投影或明确不进入图，禁止手写 table/event/metric 三组平行循环。
- 当前 table、event、metric 和 concept 全部进入投影；domain/group、focus 和 bounded traversal 保留现有用户行为。
- Client presentation registry 按 node/relation kind 提供 label、图标、样式和详情 renderer；未知 kind 使用通用 fallback，不丢弃、不崩溃。
- Graph core 只处理 node、edge、group、selection、layout 和 animation，不读取 table、metric 或 concept 的业务字段。
- 更新 Schema Gateway 与 Client 的公开类型、README 和必要 JSDoc；删除 `ui-context-layer` 内复制的 Graph RPC 类型和 bridge。

## Acceptance

- 真实 Schema Gateway Remote 返回 table、event、metric 和 concept 节点。
- 注册一个测试 kind 后，无需修改 Graph RPC 核心 switch 即可通过 Remote 进入 Client generic renderer。
- 未注册专用 presentation 的 node/relation kind 使用通用展示，并保留可访问 label 与详情。
- focus 不存在时返回空子图；domain/group filtering 与当前 bounded traversal 行为保持明确。
- focused Host、Remote 和 Client tests 覆盖有效及无效投影；组件 fake data 不能替代 Remote 装配测试。
- keyless Web snapshot 覆盖开放 kind 与 concept node；从本票真实 Web server 和 management preset flow 录制 concept 可见的 GIF。

## Out of scope

- [G8: Ontology 执行约束与可审计关系模型](G8-ontology-execution-auditability.md) 所拥有的关系方向保真、source evidence、confidence、版本、审计和 fail-closed 执行规则。
- OWL、RDF、完整 SKOS 兼容、Ontology 推理和独立 ontology server。
- CL31 retrieval fusion 与 Evaluation T13 Context Projection。
