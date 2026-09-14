# UM-DEFECT-PRESET-DEPS — bundle/data-agent 漏声明 11 个 tool-* 依赖，preset mount 失败

**Type**: defect · **Status**: resolved（2026-09-14） · **Phase**: upstream-merge
**Discovered**: 2026-09-14 human-gates session (web UI repro for UM4 gate ①)
**Blocks**: any session that creates a data-agent preset through the profile's preset-mount path (web UI session create, and any other code that `await`s `presets.mount`)

## Question / Symptom

```
SessionCreateError: session create failed: agent-preset/invalid:
  agent-presets: preset "data-agent" failed to mount:
  row "tool-resolve-term" names a plugin that cannot be resolved:
  @deepseek-ai/dsh-tool-resolve-term
      at ClientSessions.create (service.ts:408:27)
```

## Root Cause

**Resolution base**: profile launch (`pnpm dsh --profile web`) sets `ctx.baseUrl = file:///Users/mckenzie/.dsh/profiles/web/`. `AgentPresets` stores this as `harnessBase`. `packageInstalled()` in `packages/preset/agent-presets/src/discovery.ts` does an upward `existsSync(join(dir, 'node_modules', pkg, 'package.json'))` walk from `harnessBase`.

**`~/.dsh/profiles/node_modules/@deepseek-ai/`** is the shared fallback populated by `healProfilesModuleFallback` doing a **BFS over declared `dependencies`/`peerDependencies`** from `apps/cli/package.json`. If a package is not in that dependency graph, the BFS never reaches it → no symlink → preset mount fails.

**Concrete defect**: `packages/bundle/data-agent/package.json` declares **12** `tool-*` dependencies but **does NOT declare `@deepseek-ai/dsh-tool-resolve-term`**. The package exists at `packages/data/tool-resolve-term`, is built (`lib/index.js` present), and is a LIVE (uncommented) row in `packages/bundle/data-agent/presets/data-agent/agent.cordis.yml:113-114`. But because it is undeclared, it is absent from the fallback node_modules → mount fails.

**Wider**: the `semantic-layer-management` preset (same dir, also da-owned) reports **10 more undeclared** tool packages, all existing, all built:
`tool-search-schema` / `tool-get-definition` / `tool-list-domains` / `tool-get-coverage` / `tool-discover-relations` / `tool-discover-alt-labels` / `tool-trigger-eval` / `tool-reachability-delta` / `tool-edit-definition` / `tool-revert-edit`.

**Total: 11 undeclared packages across 2 da presets.**

## Session workaround (2026-09-14, NOT a repo change)

One symlink created in user config:
```
~/.dsh/profiles/node_modules/@deepseek-ai/dsh-tool-resolve-term
  -> /Users/mckenzie/workspace/dsh-resync/packages/data/tool-resolve-term
```
Verified via real `session/create` RPC: `{"ok":true,"value":{"agentPreset":"data-agent"}}`. No restart needed (discovery is unmemoized; `packageInstalled` runs `existsSync` fresh every call).

Survives reboots: `healProfilesModuleFallbackLocked` is additive-only for the shared dir (pruning only touches per-profile `.dsh-module-fallback`).

## Repo fix (for AFK execution session)

1. Add to `packages/bundle/data-agent/package.json` `dependencies`:
   ```json
   "@deepseek-ai/dsh-tool-resolve-term": "workspace:^"
   ```
2. Add the **10** `semantic-layer-management` preset packages to `dependencies` as well, all `workspace:^`.
3. Run `pnpm install` in the repo root.
4. Verify: `healProfilesModuleFallback` BFS now reaches all 11 → symlinks appear automatically in `~/.dsh/profiles/node_modules/@deepseek-ai/`.

## Gate coverage gap (separate ticket)

Existing `verify-cordis-config` checks bundle `cordis.patch.yml` mount rows. It does **NOT** check preset `agent.cordis.yml` rows. This ticket's defect would have been caught by a preset-row variant of that gate. See [UM-DEFECT-PRESET-ROW-GATE](UM-DEFECT-PRESET-ROW-GATE.md).

## Impact

- **Severity**: HIGH. The web UI cannot create any session using the data-agent preset (which is the default preset). The headless profile silently **swallows** the mount failure (fire-and-forget dispatch in `preset-autojoin` catches the error), so headless runs with the agent bare — no persona, no data tools — and reports no error. This is a silent data-loss mode for the headless path.
- **Affected profiles**: `web` (hard block), `headless` (silent bare-agent fallback).
- **Related**: UM4 Scope 2 (`025db697ab`) fixed the same class of bug (`bundlePluginDependencyErrors` reads only `manifest.dependencies`) but for bundle **mount** rows in `cordis.patch.yml`, not preset rows in `agent.cordis.yml`. This ticket extends that finding to the preset path.

## [2026-09-14] RESOLVED — bundle 声明 preset 的完整运行时依赖

commit `36e0a0136e` 为 `packages/bundle/data-agent/package.json` 补齐所有 live preset row 使用的 11 个 `tool-*` workspace package；合并后的依赖清单包含全部 23 个工具包并保持字母序。

`verify-cordis-config`（149 个配置文件）、`verify-package-dependencies`（66 个 package）与 `verify-runtime-closure`（4 个 preset、172 个 workspace package）均通过，证明安装闭包和 bundle 解析闭合；临时 profile symlink workaround 不再需要。`verify-preset-rows-resolvable` 仍作为 UM15 meta-gate 的独立增强方向，不阻塞本缺陷关闭。
