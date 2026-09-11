# UM4 — apiproxy 重落户：results-RPC → packages/api/remotes；presetSwitches → data-agent（A6）

**Type**: refactor
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: ~~UM1, UM3~~ → **已解除（2026-09-10 重评）**：UM1/UM3 均 archived（done via re-sync `8112743d69`），R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1+2 亦已 resolved。**本票现 unblocked。**
> **重评注（2026-09-10，UM10 线 A）**：UM10 实测发现本票的 results-RPC re-home **留了尾巴**——`packages/bundle/data-agent/cordis.patch.yml` mount 了 `@deepseek-ai/dsh-result-cache/src/remote.ts`（result-cache-gateway，本票从 apiproxy re-home 的产物），但 ① bundle `package.json` 只声明 `dsh-result-cache-memory`、缺 `@deepseek-ai/dsh-result-cache`；② `tsconfig.base.json` 缺 `@deepseek-ai/dsh-result-cache/src/*` 映射。这是 `verify-cordis-config` 红的根因，`git blame` 该 mount 行 → `6b7610d45a`（upstream-merge commit），属本票域而非 Phase-2。**注意包名易混**：`packages/data/result-cache` = `@deepseek-ai/dsh-result-cache`；`packages/client/result-cache` = `@deepseek-ai/dsh-client-result-cache`。
**Blocks**: UM6, UM7, UM8（knip 死指针依赖此）
**Related**: d5 A6（`.tmp/audit/d5-upstream-impact.md` line 14）；[T8-result-get-rpc](../../../interpretation-client-rendering/tickets/T8-result-get-rpc.md) + [T9](../../../interpretation-client-rendering/tickets/T9-result-cache-package-impl.md)/[T10](../../../interpretation-client-rendering/tickets/T10-consumer-fetchResult-wiring.md)/[T11](../../../interpretation-client-rendering/tickets/T11-connection-fixture-results-arm.md)/[T12](../../../interpretation-client-rendering/tickets/T12-harden-result-cache-per-review.md)/[T13](../../../interpretation-client-rendering/tickets/T13-runtime-fakeapiclient-results-arm.md) 簇、[B-DA1](../phase-misc/B-DA1-preset-switch-tool-interrupt-race.md)、[harness-package-removal research](../../research/harness-package-removal.md)；upstream `4f00a8b refactor(api): remove ApiProxy package` + Remote controllers 迁移链

## 背景

upstream `4f00a8b refactor(api): remove ApiProxy package` 删了整个 `packages/host/apiproxy`（ls-tree 确认 upstream 已无此目录）。前导：`ce3391e retire migrated unary routes`、`fd7f206 !: remove settings and credentials RPCs`、`6e40876 !: remove directory-picker RPCs`、`243f662 delete the goal unary domain`。替代：`packages/api/remotes/`（`src/{client/index.ts,index.ts,remote-events.ts,types.ts}`）+ `refactor(connection): own RPC transport contracts` + `refactor(api): converge the Remote failure vocabulary` + `refactor(client): consume migrated Remote namespaces`。

fork 的 `packages/host/apiproxy/src/api-proxy.ts`（grep 确认 fork 仍有）含两块：
- **(a) presetSwitches 并发重写**（d5 A6 / B-DA1 partial-fix）：`swapPreset` 同步预留 slot（`:3024`）+ recompose `await queued` + turn `await pendingSwitch`（`:2397`）。Comment 自承 driver："a mid-flight rebind destabilizes the agent's scope observers"（data-agent scopeId）。
- **(b) additive `results.get` RPC 域**（d5 line 14 判 LEGITIMATE-EXTENSION / KEEP）：`results.ts`/`results.schema.ts`/`rpc-map.ts`/`fetch/client.ts`/`fetch/handler.ts`/`api-proxy.ts` handler/`index.ts`——"textbook additive domain"。T8-T13 整 R5 数据线 premised on 它。

两块现在都在 upstream 已删的包里。

## Scope

1. **接受 upstream 删除 `packages/host/apiproxy`**（fork 侧丢该包）。
2. **重落户 results-RPC 域**（保 additive 工作）：把 `result.get` RPC 按 upstream 的 Remote 模式迁进 `packages/api/remotes/`——四镜像（`remotes/src` 的 namespace + `remote-events` + transport + client/server 半）。参 upstream `refactor(apiproxy): retire migrated unary routes` + `refactor(client): consume migrated Remote namespaces` 的迁移模式。
3. **A6 presetSwitches 并发**：upstream 已无 apiproxy → "在纯 upstream 验证 race"已无意义。改：在 **data-agent 层**做 observer rebind-safe（让 scopeId observer 不被 mid-flight rebind 打断），OR 在 Remote 层重做 preset-swap 序列化。先核 race 是否在纯 upstream Remote 架构下复现（B-DA1 复现路径）。
4. **更新 T8-T13 + B-DA1 + R5/R6 + harness-package-removal**：加 upstream-supersession addendum（re-home 落此票）——本批 PR 已加 addendum。
5. **knip.json**：清 `packages/host/apiproxy` 死指针（UM8 接力）。

## Resolution

### [2026-09-10 Phase C 并行] Scope 2（results-RPC 重落户）**收口** — `verify-cordis-config` GREEN

commit **`025db697ab`** `[UM4] fix(bundle): close the results-RPC re-home tail`（resync 树）。

**实测**：`verify-cordis-config: 144 config files passed.`（此前 2 errors）。

两条声明补齐（均为**手写区**，不是 regen）：

| # | 改动 | 为什么是手写 |
|---|---|---|
| ① | `packages/bundle/data-agent/package.json` 加 `"@deepseek-ai/dsh-result-cache": "workspace:^"` 到 **`dependencies`** | checker 的 `bundlePluginDependencyErrors` 只读 `manifest.dependencies`（不看 dev/peer）。range `workspace:^` 由 `scripts/verify-package-dependencies.ts:601` 的 `WORKSPACE_RANGE` 断言 |
| ② | `tsconfig.base.json` 加 `"@deepseek-ai/dsh-result-cache/src/*": ["./packages/data/result-cache/src/*"]` | 该 `/src/*` 块在 **130–132 行**，位于 `gen-tsconfig-paths` 生成区（**307–509 行**）**之上**；且该生成器只产 bare package alias，**永远不会**产 `/src/*` key。故手改，不 regen |

**包名陷阱已从磁盘 `name` 字段核实**：`packages/data/result-cache` = `@deepseek-ai/dsh-result-cache`（就是这个）；`packages/client/result-cache` = `@deepseek-ai/dsh-client-result-cache`（不是这个）。

**非回归已验**（依赖声明能波及的 4 门，逐门跑）：`constraints`、`verify-package-dependencies`（**74 violations，与 UM12 记录的 74 逐字匹配**）、`verify-package-invariants`、`verify-runtime-closure`（失败链 `dsh-python-runtime-closure -> @deepseek-ai/dsh-phase-gate -> @deepseek-ai/dsh-scope-registry` 与 UM12 记录**逐字节相同**）—— 全部维持原红，且**没有一条失败行指向 `bundle/data-agent` 的依赖声明**（那两条提到 bundle/data-agent 的分别是 version 不匹配和 empty install function，均为 UM12 已记录项）。

### ⚠ 订正 UM12 记的第三个错误：**不是仓库缺陷**

`apps/cli/tests/profiles/acp/cordis.yml: root must be a Loader entry array` **是本地 checkout 假象**，不属本票也不属仓库：

- 该文件是 **upstream 的 symlink**（`git ls-files -s` mode `120000` → `../../../../../snapshots/acp/escalation-approved/cordis.yml`），作者 `4125514a08` Tianyi Cui。
- `~/.gitconfig` 设了 **`core.symlinks=false`**，git 把它落成一个 59 字节的、内容为目标路径的普通文件 → `readFileSync` 得到字符串而非数组。
- **CI 不受影响**（fresh checkout，`core.symlinks` 默认 true）。
- 修法是修 checkout（`git config core.symlinks true` + 重新 checkout 这些路径），**不产生任何 tracked 改动**；改那个文件反而是错的 —— 会把 upstream 的 symlink 变成 fork 的普通文件。
- 本 session 已修 resync 树全部 **10 个**坏 symlink（工作树操作，未 commit），修完该错立即消失，余下 2 个错正是 ① ②。

### 仍未收口

**Scope 3（A6 presetSwitches 并发 / B-DA1 race）未做** —— 本票不能整体 resolved。upstream 已无 apiproxy，需在 data-agent 层做 observer rebind-safe 或在 Remote 层重做 preset-swap 序列化，且需先核 race 在纯 upstream Remote 架构下是否复现。Scope 4（T8-T13 addendum）已在前批 PR 加；Scope 5（knip 死指针）归 UM8（已 archived，knip 当前不在任何 gate/workflow 里，无门可抓）。

**→ 本票状态：Scope 2 resolved，Scope 3 仍 open。UM6 的前置（UM4）就是 Scope 2，已解除。**

---

### [2026-09-09 triage] → Status: leave-open (R-DA/Phase-2). synced base 仍 track `packages/host/apiproxy/src/api/results.{ts,schema.ts}`（2 fork-only 文件，results-RPC re-home 待 `packages/api/remotes/`）；upstream `c389f96bf3` 无 `packages/host/apiproxy`；presetSwitches race re-validation under new Remote arch = R-DA + Phase-2。详 `.tmp/next-5-triage.md`。

---

### (original pre-triage)
（待落地后填：results-RPC 重落户后的 remotes 路径 + A6 race 在新架构下的处置）
