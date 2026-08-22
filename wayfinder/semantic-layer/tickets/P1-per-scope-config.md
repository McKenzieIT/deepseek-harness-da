# P1 — Per-scope 配置机制实现

**Type**: prototype
**Status**: Resolved (2026-08-21)
**Blocked by**: R3 (resolved)

## Question

实现 per-scope 配置机制：scope registry + SemanticLayerService 按 active scope 加载。

## Resolution

**已实现，无需新建——两个已有包的集成。**

### 架构

```
ctx.scopes (ScopeRegistryService)        ctx.schema (SemanticLayerService)
  ├── register({id, semanticRoot})   ──→   get semanticRoot() delegates here
  ├── setActive(id)                  ──→   scopes/active-changed → invalidateCaches
  ├── list() / get(id) / active()          get scopeId() delegates here
  └── persists to ~/.dsh/data/scopes.yaml
```

### 设计决策

1. **Cordis config = WHERE** the registry lives（静态，bundle mount 时设定：`registryPath: ~/.dsh/data/scopes.yaml`）
2. **Registry YAML = WHAT** scopes exist + which is active（运行时可变，CLI/API/Web UI 均可读写）
3. **SemanticLayerService 代理模式**：`semanticRoot` / `scopeId` getters 优先从 `ctx.scopes.active()` 读取；当 scope-registry 未挂载或无 active scope 时回退到静态 config
4. **事件联动**：`scopes/active-changed` 事件触发 `invalidateCaches`，确保 corpus/index 在 scope 切换后重建
5. **scope-registry 为可选依赖**：语义层不硬性 inject scopes，通过 `ctx.get('scopes')` 运行时探测

### 代码改动

- `packages/data/scope-registry/tsconfig.json` — 对齐 `tsconfig.base.json`（支持项目引用）
- `packages/data/scope-registry/src/index.ts:184` — fix `exactOptionalPropertyTypes` type error
- `packages/data/semantic-layer/src/index.ts` — 添加 `import type {} from '@deepseek-ai/dsh-scope-registry'`；constructor 注册 `scopes/active-changed` listener；getters 已有代理逻辑确认正确
- `packages/data/semantic-layer/tsconfig.json` — 添加 scope-registry 项目引用

### 验证

- tsc clean（semantic-layer + scope-registry）
- 24/24 semantic-layer tests pass
- 15/15 scope-registry tests pass
- Bundle patch 已有 `scope-registry` 行（`registryPath: ~/.dsh/data/scopes.yaml`）

### 使用方式

```typescript
// 注册 K11 scope
await ctx.scopes.register({
  id: '10000251',
  semanticRoot: '/path/to/examples/k11-semantic-layer',
  metadata: { project: 'K11', engine: 'maxcompute' }
})

// 自动：ctx.schema.semanticRoot → '/path/to/examples/k11-semantic-layer'
// 自动：ctx.schema.loadEventDefinition('role_online') → K11 的 role_online 定义

// 切换 scope
await ctx.scopes.setActive('other-game')
// 自动：scopes/active-changed 事件 → invalidateCaches → corpus 重建
```
