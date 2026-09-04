---
type: grilling
status: open
blocked_by: []
---

# W17: 管理 session 客户端桥接 —— 知识图谱闭环断在一个点上

**Branch**: `feat/w17-management-session-bridge`  <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

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
