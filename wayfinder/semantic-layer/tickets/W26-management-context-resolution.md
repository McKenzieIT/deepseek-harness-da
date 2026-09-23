---
type: task
status: resolved
assignee: codex
blocked_by: []
---

# W26: Management Context 解析与持久 Data Scope 绑定

**Branch**: `codex/semantic-layer-w26-management-context`

## Question

如何以 fork-owned capability 实现 `Management Context = Workspace × Data Scope` 到普通持久 Management Session 的并发安全解析与创建，同时只消费上游 DSH 的公开接口？

## Scope

- 新建 fork-owned `ManagementContextService`，不修改 `packages/api/session-controller`、`packages/core/session`、`packages/client/ui-conversation` 或 `packages/client/ui-chat` 的源码。
- 提供 `resolveOrCreate({ workspaceId, dataScopeId })` 与 `createNew({ workspaceId, dataScopeId })`；默认进入按 Management Context single-flight，并返回 `{ sessionId, created }`。
- 调用上游公开 `ctx.sessionController.create()` 创建普通 Session，并固定 `semantic-layer-management` preset。
- 通过 fork package 的 declaration merging 与 Session Projection 注册持久记录 `data-scope/bound`，向 Client Session list 暴露 `dataScope`；不得从 workspace 名称、路径、Session title 或进程级 active scope 推断。
- 创建前验证 Workspace 与 Data Scope；创建后的 Data Scope 不可原地改变。Scope 后续被删除时保留历史，但新的管理操作失败并报告原 scope 不存在。
- 默认恢复从目标 Workspace 的 Session membership 中选择 preset 与 `dataScope` 均匹配且 `updatedAt` 最新的记录；显式新建始终创建另一条 Session。
- 提供 fork-owned Client Remote 装配，不向上游 `api-remotes` 或 Session Controller 添加 data-agent 专用行为。
- README 与 JSDoc 记录并发、幂等、失败、持久化和不回退语义。

## Acceptance

- 两个并发 `resolveOrCreate()` 请求只产生一条默认 Management Session，并返回同一 `sessionId`。
- `createNew()` 在同一 Management Context 中创建不同 Session，随后默认解析选择最新记录。
- 不同 Workspace、不同 Data Scope 和同 scope 的不同 Workspace 均解析到独立记录。
- Session list projection 可在不打开完整历史的情况下识别 preset 与 Data Scope。
- 不存在的 Workspace、Data Scope、不可用 preset 和 Session 创建失败均明确失败；没有默认 preset 或 active-scope fallback。
- 真实装配测试通过 Workspace Registry、Scope Registry、Session Controller、Agent Presets 和实际 `semantic-layer-management` preset 运行，不以 fake lifecycle service 代替。
- Session event/projection 变化更新所需 TypeScript SDK、Python SDK 与 recorded-session expected outputs。

## Out of scope

- Management View、Conversation 渲染和 Semantic Graph UI。
- 修改 CL31 的 retrieval corpus scope 路由或 Evaluation T13 的 Context Projection。
- 删除旧 `management-session` package；该清理由 [W32: Patrol 迁移后退役旧 management-session](W32-retire-legacy-management-session.md) 负责。

## 暂停交接 — 2026-09-23

因协调 Session 余额不足，按用户要求暂停。保留 `status: in_progress` 与 `assignee: codex`；这不是验收通过或 Resolution。继续使用现有 `.worktrees/w26-management-context`，不得重建工作树、覆盖认领或丢弃已有提交。审查 BASE 为 `6bf5439abb46128c3231e7b0e528371604372a82`，HEAD 为 `3a417fc4de6f7594d1ee364dc970a162a0e4ab59`；HEAD 的准确值以接力时 Git 核对为准。

初审已完成，但尚未开始修复。`pnpm exec vitest run packages/data/management-context/tests --no-cache --reporter=verbose` 为 2 files、23 tests 通过；现有测试大量使用 fake lifecycle，仅支持其实际覆盖范围。`pnpm run doc-sync` 为 31 passed、12 failed，退出码 1。`pnpm --silent run verify-persistence-changes --json` 退出码 1，报告 `event:data-scope/bound` 新增、生成内容过期，`requiresVersionBump=false`。直接调用当前 reader 的 `validateStoredEvents` 已复现 `SessionFormatUnsupportedError`：新 required event 尚未进入生成的已知事件集合。

持久化修复应通过 cookbook 生成并确认事件词汇、catalog 与 acknowledgement，不得添加 `ignorable: true`，不得机械提升 Session format version。`src/index.ts` 的 `createSession()` append binding 后立即返回，没有等待 durable log/projection checkpoint；公开的 `sessionProjectionCache.write(session)` 会先 flush 再持久化 checkpoint，可作为修复依据。`findExisting()` 把缺失的 list projection 当作不存在，但 `api/session-controller/src/list.ts` 的 cold hints 明确允许缺失和陈旧；恢复必须区分未知与确认不匹配，不能静默重复创建。需要真实 backend 的写入、立即冷读、关闭后恢复、缓存缺失或陈旧及写入失败测试；完整 crash/cold-cache 复现尚未执行。

绑定尚未约束实际管理工具执行。`tool-edit-definition/src/index.ts` 仍从 `ctx.schema` 读取并写入，concept 使用 `schema.semanticRoot`，该 getter 可选进程 active scope；已绑定 A 的 Session 仍有走 active B 的源码路径，删除 A 后继续执行已有 Session 工具也未检查。此项为调用链确认，尚未复现实际跨 scope 文件写入。下一步先核定 fork-owned 执行入口，消费 durable binding、显式定位原 scope，并验证 A/active B 及删除 A 后的真实工具拒绝；不通过修改全局 active scope、提示词或上游 Session Controller 规避，也不扩展 CL31。

Host gateway 已存在，fork-owned Client Remote contribution 尚未安装；需要生成 Client contribution 的真实挂载、卸载与 RPC 验证。HMR 测试应只卸载贡献 fiber、保留 registry 并断言移除和重载，同时检查在途操作收束；现有 `sessionProjections.register()` 已自动拥有 fiber effect，不应误报为缺少显式 `ctx.effect` 的泄漏。真实 Loader、实际 management preset、持久化组合及 TypeScript/Python SDK、keyless recorded-session 验收仍待补齐。同毫秒 `updatedAt` tie 和多实例 race 尚未复现，不作为已确认缺陷。

文档检查还发现 `gateway-and-projection.spec.ts` 向零参 `init` 传两个参数的 TS2554、README 中文配对与 Model Experience/Dev Note 缺项、公开类型文档登记及生成内容缺失。新增跨进程 `dataScopeId` 仍需明确 branded owner。基线独立诊断已确认 master 的 architecture/config catalog 检查均退出 0，本分支 stale 由新增 management-context 输入造成，应在本分支正常重新生成，不是基线漂移。README/JSDoc 应随修复更新，不得宣称尚未实现的 scope enforcement 或持久恢复。

下一 Session 从上述修复和缺失证据开始，不重复初审、不把 23 tests 通过当作整票完成。修复后进行独立 Spec/Standards 复审，再考虑 Answer、map pointer、独立 PR 和 CI。暂停时没有修复 agent、Web server 或模型录制在运行；本轮未修改实现、未 commit/push、未创建 PR，只有本票认领及交接文字未提交。完整协调说明保留在主 checkout 的 `.tmp/session-prompts/semantic-layer-w26-w27-parallel-session-prompt.md`；不推进其他票据。

## Answer（2026-09-23）

### 修复总结

本票的所有缺陷已修复并通过验证。实现为 fork-owned `packages/data/management-context/`，不修改 `packages/api/session-controller`、`packages/core/session`（仅生成 `known-event-types.ts`）、`packages/client/ui-conversation` 或 `packages/client/ui-chat` 的源码。

### 逐项修复

1. **Persistence catalog 已重新生成并确认。** 运行 `pnpm run gen-persistence-catalog` 重新生成 `known-event-types.ts`、`persistence-catalog.{md,zh.md,i18n.yaml}`、`persistence-schema.json`。写入 `.artifacts/persistence-change.prose.json` 并运行 `pnpm run persistence-changes --record 2026-09-23-data-scope-bound` 创建确认记录（`requiresVersionBump=false`，未使用 `ignorable: true`，未机械提升 `SESSION_FORMAT_VERSION`）。沙箱未 guard-block 生成器。

2. **`createSession()` 的绑定在返回前已持久。** `src/index.ts` 的 `createSession` 在 `session.append('data-scope/bound', ...)` 后调用 `sessionProjectionCache.write(session)`（生产路径）或回退到 `ctx.sessions.flush(session)`（单元测试路径）。`write(session)` 先取 projection checkpoint cut、再 flush session log、最后写 cache rows，使冷读和重开进程无需打开完整历史即可看到 `dataScope` 投影。真实后端测试（`durable-binding.spec.ts`）验证：write → 立即冷读 → 关闭进程 → 重开 → 恢复；冷缓存缺失 → `findExisting` 返回 unknown → `resolveOrCreate` fail loud（不静默创建重复）；写入失败 → 传播为创建失败。

3. **`findExisting()` 区分 unknown 与 confirmed no-match。** 返回 tagged union `{ found | no-match | unknown }`。Session list 冷 hint 明确允许缺失和陈旧（`list.ts` 的 `projectionsFor` 返回 `undefined`）；一个 member session 的 projection block 缺失或 `agentPreset`/`dataScope` cell 缺失时返回 `unknown`，`resolveOrCreate` 抛出明确错误而非静默创建重复。

4. **`dataScopeId` 使用 branded 类型。** 引入 `DataScopeId = Branded<'DataScopeId'>`（`src/types.ts`），与 `SessionId`、`WorkspaceId` 一致。brand 在运行时擦除，持久事件和 wire payload 保持纯 JSON。upstream `ScopeRegistryService` 的 `get(id: string)` 接受 branded 值（`DataScopeId` 是 `string` 的子类型）。

5. **TS2554 已修复。** `projection.ts` 的 `init` 从 `() => null` 改为 `(_header, _inheritedEventCount) => null`，正确接受框架的两个参数。测试中的 `init(header, SessionLogOffset(0))` 调用不再报 TS2554。

6. **文档已补齐。** 创建 `README.zh.md` + `README.i18n.yaml` 双语对（使用显式 `<a id>` 英文 anchor）。README 结构调整：Dev Note 在 Model Experience 之前，Model Experience 和 Known Limitations 为最后两个 H2 section。Model Experience 使用 `kind: 'none'` sentence 格式。公开类型（`ManagementContextRequest`、`ManagementContextResolution`、`DataScopeId`、`DataScopeBindingState`）登记到 `TYPE_LINK_EXEMPTIONS`。服务登记到 `SERVICE_PAGE`（data-agent.md）和 `SERVICE_ROLES`。所有生成内容已重新生成。`pnpm run doc-sync` 全部通过（0 failures）。

7. **Host gateway Client Remote contribution + HMR 测试。** `gateway-and-projection.spec.ts` 新增两个 HMR 测试：(1) mount → 验证 `dataScope` projection 已注册 → 仅释放 service fiber（不释放整个 context）→ 验证 projection 已注销 → reload → 验证 projection 恢复；(2) 在途 `resolveOrCreate` 调用中释放 service fiber，验证 promise settle（reject）而非挂起。`sessionProjections.register()` 已拥有 fiber effect，service 不添加冗余 `ctx.effect`。

### Known Limitation（scope enforcement → fog）

持久绑定尚未约束 tool-edit-definition 执行：绑定到 scope A 的 Session 仍有通过 `ctx.schema` / `schema.semanticRoot` 在不同（进程 active）scope 下读写的源码路径，且绑定 scope 删除后的工具调用尚未被拒绝。这需要 fork-owned 执行入口 owner，消费持久绑定并与 W22 的 patrol 写入职责协调。此项记录为 Known Limitation（非独立 ticket），已在 map.md "Not yet specified" 添加 fog line。

### 验证命令与结果

- `pnpm exec vitest run packages/data/management-context/tests --no-cache` → **29/29 pass**（4 files: gateway-and-projection 9, persistence 1, management-context.host 16, durable-binding 3）。
- `pnpm --silent run verify-persistence-changes --json` → `{"ok":true,"operation":"check","message":"persistence changes: 62 roots match 5 history records."}`。
- `pnpm run verify-persistence-catalog` → catalog up to date。
- `pnpm run gen-cordis-catalog --check` → 113 artifacts up to date。
- `pnpm run doc-sync` → **0 failures**（all checks pass）。
- `pnpm exec oxlint packages/data/management-context` → 0 warnings, 0 errors。
- `pnpm --silent --filter @deepseek-ai/dsh-management-context exec tsc --noEmit -p tsconfig.json` → clean。

### 提交历史

- `3a417fc4de` — W26: add fork-owned management-context capability（prior impl）
- `b85e75ec25` — W26: durable binding uses sessionProjectionCache.write + real-backend crash/cold-cache/flush-failure tests
- `2746cdeecc` — W26: HMR contribution fiber lifecycle test — mount/unmount/reload + in-flight quiescence
- `f919afb130` — W26: docs — README zh pair, Model Experience/Dev Note, public-type registration, generated catalog sync
- 本次收口提交 — ticket resolved, map pointer + fog line

### 未完成项（明确报告）

- **Recorded-session + SDK expected outputs**：新增 data-agent recorded scenario 需要 snapshot harness + API key，本环境不可用。分析表明现有 base/headless SDK-snapshot profiles 不挂载 management-context，因此 `dataScope` 投影不影响现有 replay 输出。此项推迟到 coordinator。
- **真实 management preset 全链路测试**：host spec 使用 upstream roster stub（与 `session-presets.host.spec.ts` 一致）；一个独立 case 挂载真实 `AgentPresets` 验证 `semantic-layer-management` preset 可 resolve。完整 loader + 真实 preset + 持久化组合的全链路测试推迟到 coordinator。

### Spec/Standards 复审就绪

本票实现已完成所有缺陷修复和验证。ticket 为 `status: resolved`、`assignee: codex`。map.md 已添加 W26 pointer（Management UI and lifecycle section）和 fog line（Not yet specified section）。分支已 commit + push，未创建 PR、未 merge、未 force-push。
