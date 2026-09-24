---
description: "TODO: translate: Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-context-layer

[English](README.md) | 中文

## 概述

TODO: 填写概述——占位内容来自 package.json 的 description 字段。

TODO: translate: Context layer graph — G6 v5 interactive relation graph with semantic zoom and domain filtering

## 目录

- [开发备注](#dev-note)
- [开放 kind 展示](#open-kind-presentation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)


上下文层关系图：基于 G6 v5 的交互式关系图，支持语义缩放与领域过滤

本地化：插件注册英语和简体中文的类型化 `contextLayer` 命名空间；slot 渲染的组件接收 `t`，导出的展示组件也要求传入同一翻译函数。

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-client-ui-context-layer` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

<a id="dev-note"></a>
## 开发备注

无。

<a id="open-kind-presentation"></a>
## 开放 kind 展示

图 RPC 类型（`SemanticGraphNode`/`SemanticGraphEdge`/`SemanticGraphData`/`SemanticGraphQuery`）由 `@deepseek-ai/dsh-schema-gateway` 拥有；本包以 type-only 方式从该包的 `./types` 叶子导入，不再重复声明。若改为导入 gateway 根入口，会把它的 `SchemaGateway extends TypertRemoteService` 声明与传递性 host 类型拖入客户端 tsconfig program，而仓库刻意让该 program 与 host program 保持分离；gateway 自己生成的 `lib/typert.remote-client.d.ts` 同样导入这个 `./types` 叶子。解析走已声明的 export，而不是源码级 `paths` 别名：别名同样会改写那份生成声明内部的 specifier，于是产物面的 `.d.ts` 会把同级依赖解析到 `src/types.ts`，把该源码拖进客户端 program，并在其旁边产出多余的 `types.{js,d.ts}`。

节点 `kind` 与关系 `type` 都是开放的 `string`。`graph-presentation.ts` 是覆盖两者的客户端 presentation registry。`createGraphPresentationRegistry()` 是注册接缝：

- `registerNode(kind, spec)` / `registerRelation(type, spec)` 为一个 kind 提供本地化 label key、图标字形、画布样式与详情 renderer，并返回其 disposer。
- `resolveNode(node, t)` / `resolveRelation(edge, t)` 始终有返回。已注册的 kind 获得自己的 label、图标、样式与该 renderer 产出的详情行。未注册的 kind 走通用回退：以原始投影 kind 字符串作为可访问 label，配 `GENERIC_NODE_ICON`/`GENERIC_RELATION_ICON`、`GENERIC_NODE_COLOR`/`GENERIC_EDGE_COLOR` 与通用详情行——因此 Host 侧注册的 kind 无需修改客户端即可渲染，不丢弃、不崩溃。每个解析结果至少携带一行详情。
- 每个 handle 相互独立。插件在 `apply` 中创建一个，并把它的读取面（`GraphPresentationReader`——仅两个 resolver，不含注册面）作为普通 prop 向下传递；测试创建自己的 handle。没有任何模块级状态决定一个 kind 的外观。

图核心只消费解析后的 presentation。`nodeStyle`/`edgeStyle` 把 presentation 映射成 G6 spec，自身不持有 kind 表；每个 G6 节点 payload 携带解析出的 fill，使 `useOverlayMode` 退出诊断叠加层时直接恢复它，而不是从节点 kind 重新推导；每条边把关系 label 作为 `labelText` 携带，这正是未注册关系 kind 在画布上得到命名的方式。`evalPassRate` 仍由核心读取：它是每个 `SemanticGraphNode` 的字段，对所有 kind 以相同方式装饰边框，并且是 `coverage` 与 `heatmap` 叠加模式的全部主题，因此把它接入按 kind 键控的接缝只会让接缝感知叠加层，却消不掉任何 kind 分支。

**原型成员名 kind。** registry 的 kind 表是 `Map`，因此对原型成员名（`toString`、`constructor`、`__proto__`）的查找不可能返回继承成员：`resolveNode`/`resolveRelation` 返回通用回退，其 label 是原始 kind 字符串，fill 与 stroke 是 CSS 颜色字符串，永不为 `undefined`，也永不是函数。

**公开面。** `createGraphPresentationRegistry`、`GENERIC_NODE_ICON`、`GENERIC_RELATION_ICON` 及 registry 的类型从 `./client` 导出，同时导出调色板常量 `GENERIC_NODE_COLOR`、`GENERIC_EDGE_COLOR`、`DOMAIN_PALETTE`、`DOMAIN_BORDER_PALETTE` 与样式映射函数 `nodeStyle`、`edgeStyle`、`comboStyle`、`evalBorderColor`。kind→颜色表不导出，它位于 registry 的内置 spec 中。`graphDataBridge` 从各自 owner（`@deepseek-ai/dsh-typert-protocol` + `@deepseek-ai/dsh-schema-gateway/remote`）导入 `RemoteResult` 与生成的 `schemaGateway` namespace 类型，并在 `{ ok: true }` 却没有 value 时抛出 `getGraphData RPC failed: ok response missing value`，与 `ui-semantic-layer/src/client/remoteResult.ts` 为 evidence-query 与 schema-gateway 两个 bridge 记录的规则一致。


<a id="model-experience"></a>
## 模型体验

无。该浏览器侧上下文层界面不注册任何面向模型的内容。

#### KV Cache 影响

该包不注册任何面向模型的内容，因此不会扩展或使任何 KV Cache 前缀失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- G6 v5 是硬依赖，没有它关系图无法渲染。
- 关系图在领域过滤变更时重新渲染（无增量 diff），因此大图在快速过滤变更时可能抖动。
- 语义缩放级别为手工调校的阈值，并非根据数据自动计算。
