# R3: DSH Client Plugin Rendering Patterns

## Summary

Client toolview 组件通过 `tool.call.toolview` keyed slot 注册，收到 `ToolCallViewProps`（含 `block: ToolCallBlock`）。结构化意图从 `block.call.argsRaw`（JSON string）解析。`present_table` 所需的行数据可通过 `useSession` hook 扫描同 session 中最近的 `query_data` ToolResultNode 的 content（TSV 格式文本）获取。交互型组件（如 suggest_followups 的 chip 点击提交）通过 inject face 闭包捕获 `ctx.sessions` → `conversation.send(text)` 实现。

## 1. Toolview 注册完整合约

### 注册模式

```ts
// 独立插件（如 bash-sample、ask-question-row）
export const suggestFollowupsToolview = {
  name: 'suggest-followups-toolview',
  inject: ['slots'],  // 可加 'sessions' / 'connection' 获取更多能力
  apply(ctx: ClientContext): void {
    ctx.slots.inject('tool.call.toolview', () =>
      ctx.slots.register({ name: 'tool.call.toolview', key: 'suggest_followups', locale: NS }, Component))
  },
}
```

key = tool wire name（`'present_table'`、`'present_decomposition'`、`'suggest_followups'`）。

### ToolCallViewProps 完整类型

```ts
type ToolCallViewProps = PropsRuntime<'tool.call.toolview'>
// 展开后包含：
// - ToolCallOwnerProps: { callId, toolName, block, cwd?, home?, openFile, inspect? }
// - SessionStandardProps: { useSession, sessionId, useProjection }
// - GlobalStandardProps: { useSessions, useWorkspaces }
// - PropsLocale<NS>: { t }
// - InjectFace: 由 register({ inject }) 提供的自定义注入
```

### 从 block 获取数据

```ts
// block 是 ToolCallBlock = RunningToolCall | ToolResultNode
if ('kind' in block && block.kind === 'tool-result') {
  // 已完成
  const argsRaw: string | null = block.call?.argsRaw ?? null  // JSON 字符串
  const content: ContentBlock[] = block.content  // 渲染文本
  const isError: boolean = block.isError
} else {
  // 运行中 (RunningToolCall)
  const argsRaw: string = block.argsRaw  // 直接可用
}
```

## 2. argsRaw 可用性与 fallback

### 何时为 null

`ToolResultNode.call` 字段：
> "Call head backfilled from the in-window tool/call; **null when window truncation left the call outside**"

即：当事件窗口（session event window）裁剪了较早的 `tool/call` 事件时，`block.call` = null → 无 `argsRaw`。

### 事件窗口大小

由 host 配置（session 的 event window / compaction）。对于 INTERPRETATION 阶段工具：
- `present_table` 紧跟 `query_data`（同 turn、相隔 1-3 个工具调用），极少被裁剪
- Session restore 后长 session 的早期 turns 可能丢失

### 推荐 fallback 策略

1. **`block.call` 可用** → 解析 `argsRaw`，渲染富 UI
2. **`block.call` 为 null** → fallback 到 `block.content` 的文本渲染（generic card），显示 "展开查看原始输出"
3. 不需要从 content text 反向解析（成本高、脆弱）

## 3. result_id → 行数据获取路径

### 核心发现

`result_id` 是 **模型自生成的语义引用**（非系统生成 ID）。`query_data` 工具不生成 `result_id`；模型在 INTERPRETATION 阶段自行编造一个 ID 传给 `present_table`。

**因此：client 无法通过 `result_id` 直接查找对应的 query_data 结果。**

### 可行的数据获取路径

**方案 A（推荐 v1）：同 turn 扫描**

```ts
// 在 present_table 组件中：
const queryResult = useSession(snapshot => {
  // 找到同一个 turn 中 query_data 的结果
  for (const node of snapshot.nodes) {
    if (node.kind === 'tool-result'
        && node.call?.name === 'query_data'  // 替代：argsRaw 解析 name
        && !node.isError) {
      return node.content  // TSV 文本
    }
  }
  return null
})
```

`query_data` 的 content 格式（`renderCompleted`）：
```
column1\tcolumn2\tcolumn3
val1\tval2\tval3
val4\tval5\tval6
(3 rows)
```

TSV 解析简单可靠。注意：
- `maxDisplayRows` 默认 50 行（config 可调）——超出部分文本中有 `(... N more rows elided)` 标记
- 行数 capped by host config；client 只能显示 tool result 中实际返回的行

**方案 B（future：server-side result cache）**：
- 由 `query_data` post-execute 将完整结果（含超出 display cap 的行）写入一个 result store
- 生成 system-assigned `result_id`
- Client 通过 RPC 按 `result_id` 拉取完整数据
- 依赖 infra 层建设（`data-agent-safe-compute-environment` research 的范围）

**v1 推荐**：方案 A。原因：
- 零 infra 依赖，立即可 ship
- 50 行 display cap 对绝大多数 BI 展示足够
- `present_table` 的 `columns` intent 已独立于 query_data（覆盖 header）
- 未来升级到方案 B 是 additive（加 result store + RPC + 切数据源）

### 精确匹配策略

同 turn 可能有多次 `query_data`（重试/fallback）。匹配逻辑：
1. 从 `present_table` 的 ToolResultNode 向前扫描同 turn
2. 取最近的 `state: 'completed'` 的 `query_data` ToolResultNode
3. 解析 content text 第一行为 columns，后续行为 rows

## 4. ui-user-questions 机制

**不使用** `tool.call.toolview`——使用 `conversation.composer` chain：

```ts
ctx.slots.inject('conversation.composer', () => ctx.slots.register(
  { name: 'conversation.composer', select: selectQuestion, locale: NS },
  QuestionComposer,
))
```

- `select` 函数从 `ComposerChainProps.interactions` 中匹配 `kind: 'question'`
- 匹配时 composer 被 takeover（整个输入区变成问答 UI）
- 不匹配时该 entry 不渲染（chain fallback 到默认 composer）

**对 suggest_followups 的启示**：followup chips **不应** takeover composer。它们是非阻塞建议（inline 渲染在 chat flow 中），不像 questions 需要阻断对话。使用 `tool.call.toolview` 是正确路径。

## 5. Submit-text 交互路径

### 问题

`suggest_followups` 的 chip 点击需要：将 `suggestion.value` 作为新消息提交到对话。

### 解决方案

通过 plugin inject face 提供 submit callback：

```ts
export const inject = ['slots', 'sessions'] as const

export function apply(ctx: ClientContext): void {
  const sessions = ctx.sessions

  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'suggest_followups',
    locale: NS,
    inject: (sessionId: SessionId) => ({
      submit: (text: string) => {
        const scoped = sessions.scope(sessionId)
        const conversation = scoped?.get('conversation')
        void conversation?.send(text)
      },
    }),
  }, FollowupChips))
}
```

组件通过 inject face 收到 `submit` callback（非 ctx）——符合 AGENTS.md "components never see ctx" 纪律。

### 验证

`IConversation.send(text: string): Promise<void>` 确认存在于 `ui-conversation/src/client/service.ts:42`。这是标准的 session-scoped 消息发送 API。

## 6. Session 恢复 / 事件窗口

### 事件窗口行为

- Session events 存储在 host 端（日志文件）
- Client 连接时拉取一个 window（由 host 配置大小）
- 较旧事件可通过 `loadOlder()` 按需拉取（`ConversationSessionInjected.loadOlder`）
- Window 外的 ToolResultNode 有 `call: null`

### INTERPRETATION 工具的影响

- INTERPRETATION 工具紧跟 `query_data`（同 turn、间隔几秒）→ 几乎不会被窗口裁剪
- 长 session 的早期 turns 可能丢失 → 需要 fallback（§2 策略）
- `present_decomposition`（最先调用）和 `present_table` 通常在同一个 step
- Session 完全重新连接（断线重连）会重新拉取当前窗口 → 数据完整

### 数据完整性保证

| 场景 | argsRaw 可用 | query_data content 可用 | 推荐渲染 |
|------|-------------|------------------------|---------|
| 当前 turn（正常） | ✅ | ✅ | 完整富 UI |
| 窗口内的旧 turn | ✅ | ✅ | 完整富 UI |
| 窗口外的旧 turn | ❌ (call=null) | ❌ | Generic text fallback |
| Session restore 后 | ✅ (窗口内) | ✅ (窗口内) | 完整富 UI |

## 7. 对三个 INTERPRETATION 渲染插件的架构启示

1. **统一模式**：三个插件都是 `tool.call.toolview` keyed slot 注册，各自独立包
2. **数据来源**：
   - `present_decomposition`：纯从自身 `argsRaw` 渲染（自包含）
   - `present_table`：`argsRaw`（intent）+ 同 turn `query_data` content（行数据）
   - `suggest_followups`：`argsRaw`（suggestions 数组）+ inject submit callback
3. **fallback**：三者都需处理 `block.call === null` 的 window-truncation 场景
4. **running state**：三者都需处理 `RunningToolCall`（未完成时显示 skeleton/loading）
5. **无需新 infra**：v1 全部可基于现有 session event stream 实现

### 包结构（每个包）

```
packages/client/ui-present-<name>/
├── package.json         # @deepseek-ai/dsh-client-ui-present-<name>
├── tsconfig.json        # extends tsconfig.base.client.json
├── tsdown.config.ts     # clientBundle(...)
├── src/
│   ├── index.ts         # empty host apply
│   ├── invariant.ts     # companion
│   ├── css-modules.d.ts
│   └── client/
│       ├── index.ts     # Cordis apply (inject + register)
│       ├── <Component>.tsx
│       └── <Component>.module.css
├── tests/
│   └── <component>.spec.ts
└── README.md
```
