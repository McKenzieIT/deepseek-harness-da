# T26 — 扫真实 workspace 的用例仍带低于 lane 预算的字面量

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T20](T20-windows-codex-and-catalog-budget.md) part 2（`gen-client-catalog` 已于 #162 `413b0681d5` 按同一范式修好）；证据取自 `windows node 24 / coverage` job 104663283115（PR #160 head `393c5fbb4f`）

## Question

T20 part 2 的那个模式不是孤例。同一批运行里，`packages/typert/generator/tests/tools-catalog.spec.ts:20`（suite `model-driven dsh-tools generation`）的「round-trips the complete service and event structure through the runtime registry」报：

```
Test timed out in 30000ms
```

它与 #162 刚修掉的那一项**同类**：用例在 12 行把 `workspaceRoot` 解析成真实仓库根（`resolve(import.meta.dirname, '../../../..')`），再在 21-25 行对该根建 `WorkspaceAnalyzer` 并 `analyze()`。成本由编译吞吐决定，不由断言决定；而 20 行自带的 `{ timeout: 30_000 }` 低于 lane 已经授予的 `DSH_COVERAGE_TEST_TIMEOUT_MS: '90000'`（`ci.yml:148`、`ci.yml:553`、`ci-master.yml:275`）。

覆盖规则本仓已有明文，就在 gate runner 自己的注释里（`scripts/run-gates.ts:613-615`）：

> DSH_COVERAGE_TEST_TIMEOUT_MS raises Vitest's per-test, expect.poll, and hook defaults together for instrumented lanes whose scheduling overhead exceeds those defaults. **Explicit fixture timeouts remain authoritative.**

也就是说 case/describe 上的字面量**覆盖**而非让位于 lane 的 `--testTimeout`，30 秒是主动收窄 CI 已经给出的额度。

## 既定修法

范式已由 #162 与两处更早的先例确定：把预算提到 `describe` 层、取值等于 lane 值、旁边写明它匹配 `DSH_COVERAGE_TEST_TIMEOUT_MS`。

- `scripts/gen-client-catalog.spec.ts:210`（注释在 203 行起）——#162 的成品。
- `scripts/translation-pairing-merge.spec.ts:272`（注释 264-271 行）。
- `scripts/install-lefthook.spec.ts:221`（注释 213-220 行）。

**不能直接删掉字面量**：`vitest.config.ts` 与 `vitest.shared.ts` 都不设仓库级 `testTimeout`（已核实两文件均无该键），删掉会让用例在本地 `pnpm test` 和任何未设该 env 的 lane 上掉回 Vitest 内置的 5 秒，立刻变成回归。

## 审计结果（本次实读，非推测）

范围：仓库内 `.spec.ts` / `.spec.tsx` 上**低于 90000** 的 per-case / per-describe 字面量，且用例确实扫真实 workspace。逐个读文件确认，结果如下。

**在范围内，应改（2 项）**：

1. `packages/typert/generator/tests/tools-catalog.spec.ts:20` — `{ timeout: 30_000 }`，对真实仓库根建 `WorkspaceAnalyzer`（12、21-25 行）。本票主项。
2. `packages/test-support/remote-mock/tests/proxy-types.client.spec.ts:78` — `describe('RemoteMock proxy types', { timeout: 60_000 })`。11 行同样把 `root` 解析成真实仓库根，29 行读真实 `tsconfig.base.client.json`，64 行每个用例建一个 `ts.createProgram`。属编译吞吐绑定。两点需在改动时一并判定：它经 `vitest.config.ts:122` 的 `packages/*/*/tests/**/*.spec.{ts,tsx}` 进入 coverage lane（所以 lane 预算确实适用于它）；但它编译的是一个入口受限的 probe 程序（`[probePath]`），不是整个 workspace 面，成本上界低于第 1 项——**60 秒是否已经够用，应先看实测再决定是否动它**，不要机械对齐。

**已在范围外，无需改（实读确认）**：

- `packages/typert/generator/tests/cordis-catalog.spec.ts:60` 与 `:88` — 同样扫真实根（19 行），但字面量是 `{ timeout: 480_000 }`，已高于 lane 预算。
- `packages/typert/generator/tests/type-model.spec.ts` 的 106 / 1262 / 1355 / 1593 行（各 `{ timeout: 60_000 }`）与 1118 行（`{ timeout: 180_000 }`）——这些 suite 走的是 `fixtureRoot = resolve(import.meta.dirname, 'fixtures/type-model')`（19 行）及临时目录，**不扫真实 workspace**，成本与仓库规模无关。
- `packages/typert/generator/tests/remote-model.spec.ts:50` — `{ timeout: 60_000 }`，同样只用 `fixtureRoot = fixtures/remote-model`（10 行）。
- `packages/typert/generator/tests/cordis-catalog-contract.spec.ts:127` — `describe.skip(…, { timeout: 60_000 })`，整个 suite 处于 skip，不参与调度。
- `scripts/project-doc-site.spec.ts:771` — `{ timeout: 60_000 }`，但该用例遍历的是生成出来的 mirror 树（`globSync('**/*.md', { cwd: mirror })`），属 `existsSync` 数量绑定，不是编译吞吐绑定，与本票类别不同。**列在此处仅作备案**：它的成本随仓库文档量增长，值得单独观察，但不应并入本次改动。

**一个正向对照**：`packages/test-support/llm-replay/tests/session-format-corpus.spec.ts` 也把 `repoRoot` 解析成真实仓库根（9 行），但**不带任何 timeout 字面量**，因此自然取用 lane 预算——这正是本票希望其它扫描型用例达到的状态。

## Scope

1. `tools-catalog.spec.ts`：把预算提到 `describe('model-driven dsh-tools generation')` 层、取 90_000，并按上面三处先例的写法注明它匹配 `DSH_COVERAGE_TEST_TIMEOUT_MS`、以及「字面量覆盖 lane flag」这条理由。保留字面量，不删。
2. `proxy-types.client.spec.ts`：先取该 suite 在 Windows coverage 上的实测耗时，再决定是对齐 90_000 还是把 60_000 的理由写在旁边。两种结果都可接受，**没有理由的字面量不可接受**。
3. 深层成本不在本票范围：让 slot / face 扫描不必对每个文件建完整 `SourceFile`（或缓存、增量化）是 T20 已经记下的独立票，本票只把 lane 已授予的额度交还。
4. 不接受 `retry`、不接受 skip、不接受把预算调到 lane 值以上。

验收：`windows node 24 / coverage` 与 `node 24 / coverage` **连续两次真实运行**对涉及的 spec 全绿。注意本票是 task 而非 research——收窄的机制已经确诊，剩下的是逐项按其自身理由落实。
