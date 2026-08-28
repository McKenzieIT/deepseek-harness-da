# P-DA4c — Scope routing 工具发布 + maxcConfigPath + code-runtime 修复

**Type**: ship
**Phase**: misc
**Status**: resolved
**Assignee**: claimed
**Blocking**: 无
**Blocked by**: [P-DA4](P-DA4-scope-routing-tools.md)（resolved），[P-DA4b](P-DA4b-phase-gate-scope-dynamic.md)（resolved）
**Related**: [G-DA5](G-DA5-per-question-scope-routing.md)（resolved，设计决策），[S1](S1-decouple-maxcompute-from-bundle.md)（resolved，config 解耦）

## Problem

三个阻塞 X63 scope 查询的问题：

1. **Scope routing 工具未发布**：prototype 在 `wayfinder/data-agent/prototypes/p-da4-scope-routing/` 但未打包为正式 package，agent 无法切换 scope（`switch_scope`/`list_scopes` 工具不存在），所有查询走 K11（active scope 默认值）。
2. **maxcConfigPath 缺失**：bundle patch 设置 `credMode: sidecar-self` 但 `maxcConfigPath` 为空（注释写"deployment supplies"但无 deployment 提供），sidecar 启动报 `Config.maxcConfigPath is required when credMode is "sidecar-self"`。
3. **code-runtime duplicate**：headless bundle 和 data-agent bundle 均 `insert` 同名 `id: code-runtime`，组合后 loader 报 `duplicate loader entry id` 崩溃。

## Resolution

### 1. 新包 `@deepseek-ai/dsh-tool-scope-routing`

- 位置：`packages/data/tool-scope-routing/`
- 功能：
  - `list_scopes` 工具（read-only，枚举注册 scope + metadata）
  - `switch_scope` 工具（调用 `ctx.scopes.setActive()`，触发 `scopes/active-changed` 事件→semantic-layer/phase-gate 联动）
  - `scope-awareness` system-prompt section（静态列出可用 scopes）
  - `scope-alias-hint` system-prompt section（per-turn 检测用户消息中的 scope alias→注入路由建议）
- 挂载：`agent.cordis.yml` 顶层 loose row（`inject: ['tools', 'systemPrompt']`）
- phase-gate：`UNIVERSAL_TOOLS` 添加 `list_scopes`/`switch_scope`（所有阶段可用）

### 2. maxcConfigPath 修复

- `cordis.patch.yml`：添加 `maxcConfigPath: ~/.maxc/config.yaml`
- `query-maxcompute/src/index.ts`：constructor 中 `~/` → `homedir()` 展开（与 scope-registry 一致）

### 3. code-runtime duplicate 修复

- `cordis.patch.yml`：原 insert `id: code-runtime` → 改为 `disabled: true`（抑制 headless 的 worker-thread）+ 新 insert `id: code-runtime-data-python`（data-python 变体）

### 4. scopes.yaml metadata

- `~/.dsh/data/scopes.yaml`：为 K11/X63 scope 添加 `aliases`、`name`、`description` 字段（alias-hint 系统依赖此数据）

## Verification

端到端验证（web profile，实际 LLM 调用）：
```
[phase-gate] onTurnStopping: phase=understanding turn=0 ... candidate_tables=19 last_search_empty=false
[phase-gate] advancing from understanding
[phase-gate] advancing from generation
[phase-gate] advancing from interpretation
```
四阶段完整执行，X63 scope 正确路由。

## Files Changed

- `packages/data/tool-scope-routing/` (new package)
- `packages/bundle/data-agent/cordis.patch.yml`
- `packages/bundle/data-agent/package.json`
- `apps/cli/config/agent-presets/data-agent/agent.cordis.yml`
- `packages/data/phase-gate/src/domain.ts`
- `packages/data/phase-gate/tests/phase-gate.spec.ts`
- `packages/query/query-maxcompute/src/index.ts`
- `~/.dsh/data/scopes.yaml` (runtime config, not committed)
