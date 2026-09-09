# R-DA-UI-SETTINGS-MODELS-VITEST-DEBT — shard 2 shipped tsc-绿 but vitest 未跑，122 test failures on `03e865a148`

**Type**: task (AFK, likely medium subagent-drivable) · **Status**: open · **Phase**: misc
**Priority**: MEDIUM（不 block UM10 typecheck-green——tsc 层已过；但 block behavioral correctness of ui-settings-models 生产包，且 shard-2 D1 fold hypothesis 需实证）
**Blocked by**: 无（unblocked——ui-settings-models tsc-clean 已 landed at `03e865a148`）
**Blocks**: 无直接 blocker（属回归 gate）
**Discovered**: 2026-09-11 by shard 3-b `[Follow-on-3-B] result-cache` (commit `d0f152ba32`) 的 vitest 顺便验节
**Related**: `R-DA-TYPERT-REMOTE-REGISTRATION.md` § Session progress 「2026-09-11 shard 3-b」+「2026-09-11 shard 2」双条目

## Question

shard 2（`03e865a148` — ui-settings-models 39 tsc error clear，187→148）**tsc 绿但 vitest 未跑就 commit**。shard 3-b 在 result-cache 顺便跑 ui-settings-models vitest 发现 122 failed / 100 passed / 6 spec files 红。

**受影响 spec files**（10 files 4 pass 6 fail）：
- ❌ `store.client.spec.ts`（13/14 fail — 只 `reads an Error message` 通过）
- ❌ `provider-form.client.spec.tsx`（多个 API key field tests）
- ❌ `welcome-store.client.spec.ts`（多个 WelcomeNoticeStore tests）
- ❌ `welcome-notice.client.spec.tsx`（多个 WelcomeNotice tests）
- ❌ `apply.client.spec.ts`
- ❌ `readiness.client.spec.ts`
- ✅ `components.client.spec.tsx`
- ✅ `invariant.client.spec.ts`
- ✅ `onboarding-dialog.client.spec.tsx`
- ✅ `styles.client.spec.ts`

**Failure signature（一致）**：
- `expected 'error' to be 'ready'` — store 状态期待 'ready' 实际 'error'。
- `expected null to be 'credential transport refusal'` — credentialError 期待字符串实际 null。
- `TypeError: Cannot read properties of undefined (reading 'credentials')`
- `expected [] to have a length of 4 but got +0` — rows 空。
- 多为 async load()→store.getSnapshot().status 语义偏差。

**主 session hypothesis（未实证，需 subagent 深挖）**：shard 2 D1 decision（`ctx.remote.llm.listConfigurableProviders()` + `listProviders()` 双调 fold `row.active`，**hard-fail-on-either-half**——见 `packages/client/ui-settings-models/src/client/store.ts:153-158` `store.ts` 折叠逻辑 + 文档理由）在 test bench 只 mock 一半调用（老 `listConfigurableProviders` 单调 pre-shard-2）时 throw → store 落到 error path 而非 ready path。跟进最可能的一致修法 = 每个 bench 加 `providers: vi.fn(() => Promise.resolve({ok:true, value:{providers:[{ns, active:true}, ...]}}))` mock 二调。

## adaptive 判据（UM-ADAPT）

不适用（本 ticket 不是 apiproxy → Typert adapt 决策；是 shard 2 accepted-without-vitest 的 test debt）。属**质量 gate 遗漏**类工作。

## 建议执行

1. Read `packages/client/ui-settings-models/src/client/store.ts` 定位 D1 双调 fold 位置 + test bench pattern。
2. 依 hypothesis 修一个失败 spec（如 `store.client.spec.ts` 的 `joins rows with configured, removable, and credential state`），实证 `listProviders` 缺 mock 是 root cause。
3. 若实证成立，subagent 批量补 mock（6 spec files）→ 复跑 vitest；若 hypothesis 失败，走 diagnosing-bugs skill 深挖。
4. commit：`[shard-2-followup] ui-settings-models: mock ctx.remote.llm.listProviders in test benches (122 failures cleared)` on resync（新 commit，不 amend `03e865a148`）。
5. 归本 ticket。

## 环境（复用 shard 3-b）

- resync worktree = `/Users/mckenzie/workspace/dsh-resync`（branch `upstream/resync-2026-09-08`，tip `d0f152ba32`）
- 主 session 强制 `mcp__local__*`（built-in Read/Write/Edit/Bash 全 blocked）
- node v24：`PATH="/usr/local/bin:$PATH" /usr/local/bin/node ./node_modules/typescript/bin/tsc ...`
- vitest：`PATH="/usr/local/bin:$PATH" /usr/local/bin/node ./node_modules/vitest/vitest.mjs run packages/client/ui-settings-models/tests`
- `lefthook` 3 gate（oxlint / whitespace / vendor-manifest）——不 `--no-verify`。

## 关键上下文（shard 3-b 实证事实，勿重导）

- `RemoteFailure` 是 `RemoteError<Code>` 实例 union 非 plain object（`packages/typert/protocol/src/types.ts:60` + `remote-error.ts`）——测试构造 error 必用 `new RemoteError(code, msg, details)`，不能 plain `{code, message, details}` 字面量。
- `TestRemote(ctx, {namespace: {method}})` 是 canonical mock 模式（`packages/test-support/client-runtime/src/remote.ts`），constructor 自动 `ctx.provide('remote', this)` + `ctx.provide('remote.<name>', face)`。
- `RemoteError` 从 `@deepseek-ai/dsh-client-test-runtime` value re-export（不能直接从 `dsh-typert-protocol`——顶层 import 拉 owner /remote lib artifacts，spec 加载爆炸）。

## Resolution

(open)
