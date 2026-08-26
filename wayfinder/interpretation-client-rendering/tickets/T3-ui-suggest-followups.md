# T3: Implement ui-suggest-followups package

**Type**: task (AFK)
**Status**: ✅ shipped
**Blocked by**: [G1-design-decisions](G1-design-decisions.md)
**Blocks**: none

## Question

Implement `packages/client/ui-suggest-followups/` as a Mode 3 Repository Package — a client-side Cordis plugin that registers a `tool.call.toolview` entry with key `'suggest_followups'`, rendering clickable suggestion chips that trigger follow-up queries.

## Resolution

Implemented and passing all gates. Package structure:

```
packages/client/ui-suggest-followups/
├── package.json              # @deepseek-ai/dsh-client-ui-suggest-followups
├── tsconfig.json             # extends tsconfig.base.client.json
├── tsdown.config.ts          # clientBundle
├── README.md
├── src/
│   ├── index.ts              # empty host-half apply
│   ├── invariant.ts          # invariant companion
│   ├── css-modules.d.ts
│   └── client/
│       ├── index.ts          # inject ['slots', 'sessions'], register key='suggest_followups'
│       ├── FollowupChips.tsx # 组件：chip row + 最新 turn 检测 + skeleton + fallback
│       └── FollowupChips.module.css
└── tests/
    ├── apply.client.spec.ts           # 6 tests
    ├── followup-chips.client.spec.tsx  # 14 tests
    └── invariant.client.spec.ts       # 2 tests
```

### 关键实现决策

| 决策 | 方案 |
|------|------|
| chip 点击 | 立即提交：inject face → `sessions.scope(sessionId).get('conversation').send(value)` |
| 旧 turn 隐藏 | `useSession` 检查 `block.time >= latestTurnStartTime`，非最新 turn 返回 null（从 DOM 移除） |
| fallback | `block.call === null` 时渲染 `block.content` 纯文本 |
| skeleton | RunningToolCall 时显示 3 个骨架 chip |
| 解析 | 从 `block.call.argsRaw` 解析 `{ suggestions: Array<{ label, value }> }` |

### 注册表面

1. `tsconfig.client.json` — references 条目
2. `packages/bundle/web-app/cordis.patch.yml` — `dsh.client` 行
3. `packages/bundle/web-app/package.json` — workspace 依赖

### 验证

- 22 tests，100% 覆盖率（per-file gate）
- `pnpm run test:gui` 全绿（299 files, 4108 tests）
