---
type: grilling
status: resolved
assignee: codex
blocked_by: []
---

# W17: 管理 session 客户端桥接 —— 知识图谱闭环断在一个点上

**Branch**: `codex/semantic-layer-w17-management-session-bridge`

**Working baseline（2026-09-22）**: `codex/semantic-layer-w17-management-session-bridge` 临时堆叠在尚未合并的 W25 HEAD `5c45ce8d489e` 上；W17 不回写或改写 W25 分支。

## 事实（2026-09-03 代码核查）

W10/W11 设计的闭环是「**看图 → 发现问题 → 对话让 agent 调 tool 修正 → 图上叙述后动画 → 再看**」。
挂载 `ui-context-layer` 之后，图能看了，但**闭环的其余部分全断**，而且断在**同一个点**。

`ContextLayerOverlay.tsx:65-66` 是整条链的唯一装配点，它只传了 `data`：

```tsx
<ContextLayerView
  data={data}
  messages={[]}        // ← 硬编码空数组
/>
```

`ContextLayerViewProps`（`ContextLayerView.tsx:15-21`）声明了 6 个 prop，
**4 个交互 prop 全部没传**：

| prop | 没传的后果 |
|---|---|
| `messages` | 传了 `[]` 硬编码 → `ManagementChatPanel` 永远空白 |
| `onSendMessage` | undefined → **用户无法发消息**，对话式管理入口死 |
| `isStreaming` | 默认 false → 无流式指示 |
| `eventSource` | 默认 null → **narration gate 无事件源** → `releasedUpdates` 恒为 `[]` → `useGraphAnimations` 永不触发 |
| `onInsertReference` | undefined → NodeDetailPanel 的 💬「插入 @资产引用」捷径（W11 D2 的记忆负担缓解）死 |

**根因是一个**：`ManagementSessionService` 是**服务端 Service，没有客户端 remote / 桥接**。
messages、发送、流式、事件流四者都要从它来。W10 票里就写着
「管理会话：ManagementSessionService 为服务端 Service 无客户端桥接，messages=[] 占位 TODO」——
这个 TODO 从 2026-08-27 挂到现在。

**与 [W16](W16-evidence-query-client-remote-gap.md) 完全同形**：服务端 Service 齐全、
客户端 remote 从未接。data-agent 里这是第三例（schema-gateway 接了，evidence-query 没接，
management-session 没接）。

## 连带影响：W13 的修复目前不可观测

本 session 把 `graph-animations.ts` 的 12 处 `update*Data` 都配上了 `graph.draw()`（W13）。
但动画的**唯一驱动源**是 narration gate 的 `releasedUpdates`，而 `eventSource=null`
使它恒为空 —— 所以 pulse/blink/边 fade-in **仍然一次都不会触发**。
W13 是必要的（重绘缺失是真 bug，修了才不会白干），但**要等 W17 才能验证**。

## Question（需决策）

1. **桥接形态**：`ManagementSessionService` 是否走 TypertRemoteService + `@Remote`（同
   schema-gateway / evidence-query 的路子）？还是复用现有的 sessions/conversation
   客户端能力（`scope.sessions` 已有 session 列表与消息投影，`ui-conversation` 已渲染对话）？
   —— 后者可能根本不需要新 remote：管理 session 就是一个普通 session，图谱面板要的是
   **同一个 session 的消息流**，而客户端已经有它。若成立，W17 = 接线而非新建 RPC。
2. **对话面板是复用还是自建**：`ManagementChatPanel` 是 ui-context-layer 自己实现的
   聊天 UI。既然 `ui-conversation` 已有成熟对话渲染（含 tool presenter、W9/W10 的
   结构化卡片），全屏图谱里是否应该**嵌入 conversation slot** 而不是维护第二套聊天 UI？
   这决定了 W9/W10 的 presenter（search_schema / get_definition / discover_relations 的
   diff 卡）在图谱面板里能否复用——目前它们只在主对话区可见。
3. **narration gate 的事件源**：`SessionEventSource` 需要 tool result + message-complete
   两类事件。客户端拿得到哪些？（`scope.remote.$on` 的 forwarded-event allowlist 里有哪些
   session 事件？W15 刚往里加过 `evidence/eval-run-completed`，同样机制可加。）
4. **独立入口**（原为独立雾，归入本票）：W10 D4 决定「独立入口打开全屏管理界面（非侧边栏）」，
   但代码里不存在——`ContextLayerOverlay` 关闭时 render null，唯一开启者是
   `ctx.contextLayer.open()`，只经 AssetDetail 的「在知识图谱中查看」触达，而那条路
   被管理 session gate 挡着。入口形态待定：sidebar footer 第二个按钮 / command palette /
   shell 顶栏 / 管理 session 内的 tool。

## 验收

- 图谱内对话面板显示管理 session 的真实消息，可发送
- agent 调 `discover_relations` 后，图上新边**可见地** fade-in（W13 的 draw() 被真正驱动）
- NodeDetailPanel 的 💬 能把 `@资产名` 插进输入框
- 有一条独立入口能打开全屏图谱（不必先进 SchemaExplorer）
- **测试须走真实装配路径**，不是给组件注入 fake messages —— W12/W13/W16 都是被
  "组件测试绿、真实路径死" 掩盖的

## 关键文件

- `packages/client/ui-context-layer/src/client/ContextLayerOverlay.tsx:65-66`（唯一装配点）
- `packages/client/ui-context-layer/src/client/ContextLayerView.tsx:15-21`（6 个 prop）
- `packages/client/ui-context-layer/src/client/ManagementChatPanel.tsx`
- `packages/client/ui-context-layer/src/client/narration-gate.ts`（`SessionEventSource`）
- `ManagementSessionService`（服务端，W11 交付）
- 对照已接通的先例：`packages/data/schema-gateway/`（`./typert` + `./remote` 双导出）


## Answer（2026-09-22）

### Domain terms

- **Management Context**：一个 Workspace 在一个明确 Data Scope 中的管理环境，即 `Workspace × Data Scope`。同一 Data Scope 可以由多个 Workspace 分别管理；需要按 Domain 分开时，由用户建立不同 Workspace。
- **Management Session**：属于一个 Management Context、使用 `semantic-layer-management` preset 的普通持久 Session。关闭 Management View 不销毁它，重新打开时恢复该 Context 最近使用的记录；显式新建才创建另一条。
- **Management View**：组合 Semantic Graph、标准 Conversation、schema 和 evidence 的全局产品页面。
- **Conversation Binding**：Management View 对目标 Management Session 持有的 Client `SessionBinding`；它提供 Session face、Agent scope 和 event source。
- **Semantic Graph**：Semantic Layer 数据资产及关系的可视化。旧称 Context Layer 不再表示独立产品领域。
- **Semantic Graph Projection**：Host 从 Semantic Layer 当前事实生成的开放 node/edge read model；它不是 Ontology 的权威存储。
- **Graph Narration Gate**：在成功工具结果之后等待 Agent 的 durable 说明结算，再释放本轮图谱动画。
- **Asset Reference Intent**：Node Detail 发出的“把该资产写入管理 composer”意图；Graph 不拥有 draft。
- **Ontology**：保留给后续概念体系、关系语义、source evidence、推理和版本演化；W17 只消除 UI 投影对新 kind 的限制。

### Ownership

| Responsibility | Owner |
|---|---|
| Workspace 定义与 Session membership | Workspace Registry |
| Data Scope 定义与有效性 | Scope Registry |
| Management Context 到 Management Session 的解析、并发去重与创建 | fork-owned `ManagementContextService` |
| Session 身份、持久化、恢复、消息、历史与 Agent lifecycle | 上游 Session Controller |
| Session 绑定的 Data Scope 历史事实 | fork-owned `data-scope/bound` Session event |
| Client 可见的当前 Data Scope | fork-owned `dataScope` Session projection |
| Management Session 的 Client lifetime | Management View 持有的 `SessionReference` |
| Management View、导航与页面状态 | 合并后的 `ui-semantic-layer` |
| Conversation projection、Chat renderer 与 composer | 上游 `ui-conversation` / `ui-chat` |
| Semantic Graph 数据事实 | Semantic Layer kind registry 与 relation graph |
| Graph Remote 投影 | fork-owned Schema Gateway |
| Graph 渲染、选择和动画 | `ui-semantic-layer` 内部 Semantic Graph 模块 |
| Patrol 的目标 Management Context | W22 迁移后的 patrol-mode 调用方 |

### Session identity and lifecycle

Management Session 不属于某条普通 Session，不保存 parent-session 摘要，也不建立 parent-child 关系。它在创建时固定 Workspace、Data Scope 和 `semantic-layer-management` preset；Data Scope 不可原地切换。默认进入按 `(workspaceId, dataScopeId)` 恢复 `updatedAt` 最新的匹配 Session，不存在时创建；用户显式新建时创建另一条记录。

Data Scope 必须通过 Session event 和 projection 持久记录。Workspace 名称、目录、Session title 和进程级 active scope 均不得作为推断或 fallback。Scope 被删除后保留历史，但新的管理操作失败并报告原 scope 不存在。

### Fork and upstream ownership

`packages/data/` 是 data-agent fork 的 additive capability group，上游 package tree 不包含该 group。旧 `packages/data/management-session` 因此是 fork-owned，但其现有进程内 lifecycle 仍不符合本决策。删除或替换它不影响上游；是否保留某个服务只由当前领域职责决定。

旧 `ManagementSessionService` 的 active map、`getActive()`、`listActive()`、`isManagementSession()`、直接 Session-store 创建路径和 created/destroyed events 全部退役。新的 fork-owned `ManagementContextService` 只公开：

```ts
resolveOrCreate({ workspaceId, dataScopeId }): Promise<{ sessionId: SessionId; created: boolean }>
createNew({ workspaceId, dataScopeId }): Promise<{ sessionId: SessionId }>
```

它验证 Workspace 与 Data Scope，按 Management Context single-flight，调用上游公开 `ctx.sessionController.create()` 创建普通 Session，写入 `data-scope/bound`，并返回 `sessionId`。它不承载 messages、streaming、history、Client binding 或 event forwarding。实现不得修改上游 Session Controller、Conversation 或 Chat package 源码；fork package 通过既有插件、Remote、declaration merging 和 Session Projection 扩展点叠加能力。

### Management View and package ownership

独立 `@deepseek-ai/dsh-client-ui-context-layer` package 删除，其 graph 能力迁入 `ui-semantic-layer` 的内部 `graph/` 模块。`ui-semantic-layer` 注册匹配的 `main` keyed panel 与 `sidebar.panellist` 入口；`shell.overlay`、`ContextLayerService`、`ContextLayerOverlay`、`ManagementChatPanel`、私有 `ChatMessage` 和重复 Session event source 删除。

Management View 使用现有 `SessionProvider` 和 `conversation.content` embedded variant 渲染固定 Chat view。它保留 tool cards、streaming、errors、retry、approval、attachments、stop、queue、steering 和 history paging，只缩减主 Conversation 的 header、tabs 和 width controls。返回操作调用 `ctx.layout.selectPanel(null)`，恢复原普通 Conversation，不改变其 Session、draft、scroll 或运行状态。

### Extensible Semantic Graph

Graph node 和 relation kind 是开放集合，不再写死 `dws | dim | event | metric` 或三种关系。Host 按 Semantic Layer kind registry 生成稳定、可序列化的 node/edge 投影；当前 table、event、metric 和 concept 全部进入图。Client presentation registry 按 kind 提供 label、icon、style 和 detail renderer，未知 kind 使用 generic fallback。Graph core 只处理 node、edge、group、selection、layout 和 animation，不读取 kind-specific 业务字段。

W17 不定义 G8 所拥有的关系方向保真、source evidence、confidence、版本、审计和执行约束，也不引入 OWL、RDF、完整 SKOS 或独立 ontology server。

### Asset reference

节点选择只改变 focus 和详情。用户显式点击“插入聊天引用”后，Management View 把 `{ assetId, kind, label }` 路由到目标 Management Session 的标准 composer，在当前光标处插入结构化 reference chip、保留 draft 并聚焦 composer；操作不自动发送。Reference source 校验 Data Scope 并只序列化稳定资产身份，完整 definition 由 Agent 按需调用 `get_definition` 获取。Session 未准备好、scope 已删除或资产不属于绑定 scope 时禁用操作并明确报告，不建立私有 intent queue。

### Graph Narration Gate

Graph Narration Gate 直接适配 `SessionBinding.eventSource` 的 event window 和 durable entries，不建立第二条 event bus。成功且携带有效 graph delta 的 `tool/result` 按 turn 缓冲；后续可见 durable `assistant/message` 结算后批量释放并播放动画。Tool failure 不更新图谱。Tool 已成功但 assistant 失败、取消或无可见说明时，在 durable `turn/end` 重新读取最新 graph snapshot，无成功动画地同步结果并显示降级说明。

打开、恢复和 reconnect 使用最新 graph snapshot 作为 baseline；历史事件恢复 Conversation，但不重放旧动画。固定 30 秒释放逻辑删除，时间流逝不替代 durable lifecycle event。

### Failure, navigation, responsive and accessibility semantics

Graph 与管理 Conversation 独立降级。Management Session 或 preset 创建失败时不得回退到默认 Agent；Graph 可用时保持只读浏览。断线时保留 Graph、history 和 draft，禁用提交并恢复同一 Session。Session 被删除后由用户确认是否新建。关闭 Management View 不取消正在运行的 Agent turn。

宽度足够时使用 Graph 主区域与右侧 Embedded Conversation；空间不足时切换为“图谱 / 对话”单区域模式。折叠和切换不卸载 Graph、Conversation 或 `SessionReference`。引用插入后展示对话并聚焦 composer。Graph batch 通过状态区域播报；Reduced Motion 下立即呈现最终状态而不播放 fade、pulse 或 blink。完整 Graph 节点键盘遍历、URL deep link、command palette、全局快捷键和性能优化是后续增强。

### Control and data flow

1. Sidebar entry 或 Asset Detail 请求打开 Management View；Asset Detail 同时携带 focus asset。
2. View 读取当前 Workspace 与明确 Data Scope，调用 `ManagementContextService.resolveOrCreate()`。
3. Host 验证 Context、并发去重，恢复或创建普通 Session，确认 preset 与 `data-scope/bound` 后返回 id。
4. Client `ctx.sessions.retain(sessionId)` 取得 `SessionBinding`，并通过 `SessionProvider` 装配 Embedded Conversation。
5. Semantic Graph 从同一 Data Scope 的 Schema Gateway projection 加载当前 snapshot。
6. 用户可向标准 composer 写入 Asset Reference Intent 并发送；Conversation 通过标准 Session face 提交。
7. 成功 tool result 的 graph delta 进入 Graph Narration Gate；对应 assistant settlement 后释放动画。
8. 退出 View 释放 Client reference 并返回原 Conversation；Host Session 与运行中的 turn 保持。

### Rejected alternatives

- 不建立第二套聊天组件、消息模型、streaming RPC 或 event bus。
- 不保留 `ManagementChatPanel` 或进程级 `getActive()`。
- 不让 Management Session 从属于某条普通 Session 或复制 parent summary。
- 不使用 `shell.overlay` 作为一级产品导航。
- 不从 active scope、路径或标题推断 Data Scope。
- 不保留封闭 Graph kind union。
- 不让 timeout 代替 Session lifecycle。
- 不为 data-agent 需求修改上游 DSH package 源码。

### Implementation tickets

- [W26: Management Context 解析与持久 Data Scope 绑定](W26-management-context-resolution.md)：建立 fork-owned lifecycle capability；与 W27 可并行。
- [W27: 可扩展 Semantic Graph 投影与 concept 支持](W27-extensible-semantic-graph-projection.md)：开放 Graph kind 并让 concept 进入真实 Remote 路径；与 W26 可并行。
- [W28: Semantic Layer Management View 合并、导航与 Conversation 绑定](W28-semantic-layer-management-view.md)：依赖 W26、W27，完成首个用户可用里程碑。
- [W29: Semantic asset reference source 与 composer 集成](W29-semantic-asset-reference.md)：依赖 W28。
- [W30: Graph Narration Gate 的真实 Session adapter](W30-graph-narration-gate-session-adapter.md)：依赖 W28。
- [W31: Management View 响应式与无障碍行为](W31-responsive-accessible-management-view.md)：依赖 W29、W30。
- [W32: Patrol 迁移后退役旧 management-session](W32-retire-legacy-management-session.md)：依赖 W22、W26。

产品可见 tickets 更新与自身行为匹配的 keyless Web recorded-session evidence，并从 PR 的真实 server 与真实 management Agent 流录制 GIF。W24 继续独立拥有 Dashboard/evidence-query run-history replay。
