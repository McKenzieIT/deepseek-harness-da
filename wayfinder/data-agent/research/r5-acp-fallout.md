# R5 · acp/ 删除 fallout 量化

> 研究问题：若走 (c) 纯产品仓库重构、物理删 `packages/acp/`（`@deepseek-ai/dsh-acp`，Automation-only Agent Client Protocol server），`test-support/acp-snapshot` + `acp-demo` 对它的依赖有多深？删了会 break 什么？给 (c) 的代价量化。当前 Q2 disable-only（da preset 不挂 code-agent 面，acp-demo 不在 data-agent bundle），低优先。

## TL;DR

**删 `packages/acp/` 不是单包编辑——级联到 acp-demo（硬依赖）+ 整个 acp-agent 示例（经 acp-demo 传递依赖）。acp-snapshot 自身不依赖 acp/、存活。** 数字钉死：

- **直接 import `@deepseek-ai/dsh-acp`：全仓 1 处**——`packages/examples/acp-demo/src/index.ts:17`（`import * as acp from '@deepseek-ai/dsh-acp'`），且在 `apply()` 末尾 `ctx.plugin(acp, {provider, model})` 作 ACP transport 桥（`src/index.ts` 末段）。acp-demo 的全部存在意义就是组这枚 acp 插件。
- **package.json 显式 dep 声明 `@deepseek-ai/dsh-acp`：3 处**——acp-demo（peerDep `package.json:45` + devDep `:61`）+ `python/sdk-runtime/package.json:13`（deploy 闭包清单，无源码 import）。
- **acp-snapshot 对 `@deepseek-ai/dsh-acp` 零依赖**——package.json deps 只有 `@agentclientprotocol/sdk`（协议 SDK，非 dsh-acp）+ `@deepseek-ai/dsh-loader-smoke` + `vitest`；peerDeps 是 `dsh-invariants`/`dsh-session`/`cordis`。`src/launcher.ts` 只 import `@agentclientprotocol/sdk` + `dsh-loader-smoke`，启动**任意** agent bin（`AgentUnderTest.binScript` 参数化）。单元 spec 用 `tests/fixtures/fake-acp-agent.ts`（脚本化假 agent，非真 acp/）。
- **fallout 分层**：Tier1 直接 break = acp-demo（build+bin+3 测试）；Tier2 传递 break = `examples/acp-agent/` 全例（7 .ts 测试含 `acp.snapshot.ts` ~70 场景 + 57 cordis.yml/.snapshot.yml 配置 + snapshots/goal-snapshots 固定桩）；Tier3 manifest/文档行 = 5 处（python/sdk-runtime、examples/package.json、scripts/gen-doc-graphs.ts、app-boot 注释、root `demo:acp` 脚本）；**不受影响** = acp-snapshot 自身（3 单元 spec 仍绿）+ headless/jsonrpc/web 测试（只用 acp-snapshot 的 normalizer 导出，启动非 acp-demo bin）。
- **da 表面零交集**：`packages/bundle/data-agent/` grep `acp` 0 命中——acp-demo 不在 data-agent bundle，Q2 disable-only 已把它隔离在 da preset 之外。删 acp/ 对 da 功能无影响，但代价是删/改 2 包 + 1 示例目录。

## 1. 实证（code-read）

### 1.1 acp-demo — 硬依赖（直接 import + plugin 组合）

`packages/examples/acp-demo/src/index.ts`：
- `:17` `import * as acp from '@deepseek-ai/dsh-acp'`——**全仓唯一的 `@deepseek-ai/dsh-acp` 裸 import**（grep `@deepseek-ai/dsh-acp[\"'/]` 排除 -demo/-snapshot 后，源码命中仅此 1 行；另 2 行是 acp 自身的 `invariant.ts:10 PACKAGE_NAME` + `codec.ts:3 @module` 注释）。
- `apply()` 末段：`const transport = ctx.plugin(acp, { provider: config.provider, model: config.model })`——acp-demo 把 acp 当 Cordis plugin 挂作 ACP transport 桥，"the {@link @deepseek-ai/dsh-acp} bridge. The app owns those plugins through one ordered lifecycle"（`src/index.ts:4` 注释）。删 acp/ → acp-demo build 失败（import 解析不到）+ bin 无法 boot（plugin 未定义）+ 3 测试全断：
  - `tests/acp-agent.spec.ts`——"In-process unit coverage for the @deepseek-ai/dsh-acp-demo composition"（`:15` 注释），直接 `ctx.plugin` 组合含 acp。
  - `tests/built-bin.e2e.ts`——`describe.skipIf(!existsSync(acpBin))('dsh-acp-demo BUILT bin ...')`（`:134`），spawn `lib/bin.js` 跑真 ACP stdio 握手。
  - `tests/load-path.e2e.ts`——"Source-path Loader smoke through the package's own bin"（`:25` 注释），跑 initialize + fresh-session 路径。
- `package.json:45` peerDep + `:61` devDep `"@deepseek-ai/dsh-acp": "workspace:^"`。
- `src/bin.ts:18` `import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'` + `NAME = 'dsh-acp-demo'`——bin 自身不直接 import acp（经 index.ts 的 plugin 组合间接用），但 boot 出来的 ctx 会 load cordis.yml 里的 acp-demo plugin（即 index.ts），最终仍解析到 `@deepseek-ai/dsh-acp`。

### 1.2 acp-snapshot — 零依赖 acp/（存活）

`packages/test-support/acp-snapshot/package.json` deps：`@agentclientprotocol/sdk` 0.25.1（**协议 SDK，非 dsh-acp**）+ `@deepseek-ai/dsh-loader-smoke` workspace:* + `vitest`。peerDeps：`dsh-invariants`/`dsh-session`/`cordis`。**无 `@deepseek-ai/dsh-acp`**。
`src/launcher.ts`（ACP 测试子进程启动器）import：`@agentclientprotocol/sdk`（`ClientSideConnection`/`ndJsonStream`/`Agent`/`Client`/类型）+ `@deepseek-ai/dsh-loader-smoke`（`resolveExampleLaunch`）。**不 import `@deepseek-ai/dsh-acp`**。`launchAcpTestAgent(options)` 的 `agent.binScript` 是**参数化**入口（注释 `:21` "The agent source bin entry (for example packages/examples/acp-demo/src/bin.ts)"——只是举例，非硬绑）。
`tests/fixtures/fake-acp-agent.ts:2-3`——"Scripted fake ACP agent bin for dsh-acp-snapshot's unit specs. Speaks newline-delimited JSON-RPC on stdio like the real dsh-acp-agent bin"——单元 spec 用脚本化假 agent，**不触真 acp/**。
→ **删 acp/，acp-snapshot 自身 build + 3 单元 spec（`harness.spec.ts`/`normalize.spec.ts`/`suite.spec.ts`）仍全绿。** 但 `launcher.ts` + `suite.ts` 的 `defineAcpSnapshotSuite` 套件工厂**部分孤儿化**：其唯一启动真 ACP server 的消费者（acp-agent，见 §1.3）会断；剩余消费者（headless/jsonrpc/web，见 §1.4）只用 normalizer 导出（`normalizeSessionLog`/`normalizeStdout`/`scrubRequestHeaders`/`stabilizeFixtureMessageIds` 等），不用 launcher/suite 工厂。launcher/suite 仍被 fake-acp-agent 单元 spec 覆盖，不至死代码。

### 1.3 传递 break — examples/acp-agent 全例（经 acp-demo）

`examples/acp-agent/cordis.yml`：`- id: acp-agent / name: '@deepseek-ai/dsh-acp-demo'`（"The ACP automation app: agent spine + JSONL persistence + protocol bridge"），provider=deepseek-official、model=deepseek-v4-pro、persistenceRoot 走 `$DSH_SNAPSHOT_SESSIONS_ROOT`。
`examples/acp-agent/tests/acp.snapshot.ts:28-32`：
```
const AGENT = {
  binScript: fileURLToPath(new URL('../../../packages/examples/acp-demo/src/bin.ts', import.meta.url)),
  configPath: fileURLToPath(new URL('../cordis.yml', import.meta.url)),
  ...
}
```
→ snapshot 套件**启动 acp-demo bin** + load acp-agent/cordis.yml（含 acp-demo plugin）。删 acp/ → acp-demo bin 崩 → acp-agent 整例断。
`defineAcpSnapshotSuite({ agent: AGENT, scenarios: SCENARIOS, ... })` 的 `SCENARIOS`（`acp.snapshot.ts` 中段）含 **~70 场景**（handshake/text-turn/tool-call-turn/bash-spill/fs-*/subagent-*/hook-cc-*/hook-codex-*/code-mode-*/escalation-*/...）。
acp-agent 测试文件（`examples/acp-agent/tests/`）：`acp.snapshot.ts` + `acp.e2e.ts` + `cleanup.e2e.ts` + `cleanup.ts`（helper）+ `escalation.e2e.ts` + `goal.snapshot.ts` + `hooks.e2e.ts` = **7 .ts 文件**。
cordis 配置：`examples/acp-agent/*.cordis.yml` + `*.cordis.snapshot.yml` + `tests/*.cordis.yml` + `tests/*.cordis.snapshot.yml` = **57 个 yml**（全 load `@deepseek-ai/dsh-acp-demo` 作 app 组合或 overlay）。另 `snapshots/` + `goal-snapshots/` 固定桩目录（harvested session logs）成孤儿。

### 1.4 不受影响 — headless/jsonrpc/web（只用 normalizer，启非 acp-demo bin）

- `examples/headless-agent/tests/headless.snapshot.ts`：import `normalizeSessionLog`/`normalizeStdout`/`refreshFixtureReplacements`/`scrubRequestHeaders`/`stabilizeRefreshLog`/`tokenizeSessionFixtureCwd`（自 `@deepseek-ai/dsh-acp-snapshot`，`:9-20`）。`binScript = ./fixtures/headless-driver.ts`（`:53`）、`dshBinScript = ../../../apps/cli/src/bin.ts`（`:54`）——**启 headless-driver / apps/cli bin，非 acp-demo**。同例 `semantic-checkpoint.snapshot.ts`/`subagent-diagnostic.snapshot.ts`/`subagent-inheritance.snapshot.ts`/`workspace-context-resume.snapshot.ts`（5 文件）。
- `examples/jsonrpc-agent/tests/sdk.snapshot.ts`：import 同 normalizer 集（`:17-27`）。`runtimeBin = ../../../packages/examples/jsonrpc-demo/src/bin.ts`（`:33`）——**启 jsonrpc-demo bin，非 acp-demo**。
- `apps/web/tests/scaffold.ts`：import `scrubRequestHeaders`/`stabilizeFixtureMessageIds`（自 `@deepseek-ai/dsh-acp-snapshot`，`:31`）。boot 真 web 组合（dsh-base + dsh-web-app bundle），**非 acp-demo**。
→ 这 7 文件（5 headless + 1 jsonrpc + 1 web）删 acp/ 后**仍绿**——它们只借 acp-snapshot 的 normalizer 库，与 acp/ 无传递依赖。

### 1.5 manifest/文档行（非代码断，需清理）

- `python/sdk-runtime/package.json:13` `"@deepseek-ai/dsh-acp": "workspace:^"`——deploy 闭包清单（"Dependency-only deploy root ... pnpm deploy materializes this manifest"），源码 grep `dsh-acp` 0 命中（无 import），仅 manifest 1 行。
- `examples/package.json` `"@deepseek-ai/dsh-acp-demo": "workspace:*"`——workspace umbrella dep 1 行。
- `scripts/gen-doc-graphs.ts:734-735,760`——doc 图生成对 `@deepseek-ai/dsh-acp-demo` 的 special-case（3 行）。
- `packages/boot/app-boot/src/index.ts:2`——**仅注释** "Shared boot glue for the app bins (`dsh`, `dsh-acp-demo`)"（无代码 dep；app-boot 同时给 `dsh` CLI 和 acp-demo bin 用）。
- 根 `package.json:140` `"demo:acp": "node --import tsx packages/examples/acp-demo/src/bin.ts --config examples/acp-agent/cordis.yml"`——可运行 demo 脚本。
- `pnpm-lock.yaml:3885,8551`——regenerate。

## 2. fallout 清单（量化表）

| 层 | 对象 | 动作 | 量化 |
|---|---|---|---|
| 删除 | `packages/acp/`（`@deepseek-ai/dsh-acp`） | 删 | 4 src（codec/content/index/invariant）+ 8 spec（approval/bridge/codec/content/dispose/edges/multi-session/turns）+ harness.ts + READMEs |
| Tier1 直接 break | `packages/examples/acp-demo/` | 删/重写 | 3 src（bin/index/invariant）+ **3 测试**（acp-agent.spec/built-bin.e2e/load-path.e2e）+ package.json peerDep+devDep |
| Tier2 传递 break | `examples/acp-agent/` | 删/重写 | **7 .ts 测试**（含 acp.snapshot.ts ~70 场景）+ **57 cordis.yml/.snapshot.yml** + snapshots/ + goal-snapshots/ 固定桩 |
| Tier3 manifest/文档 | python/sdk-runtime、examples/package.json、gen-doc-graphs.ts、app-boot 注释、root demo:acp 脚本 | 行编辑 | 5 处 + pnpm-lock 重生成 |
| **不受影响** | `packages/test-support/acp-snapshot/` | 留（launcher/suite 工厂部分孤儿化，仍被 fake-acp-agent 单元 spec 覆盖） | 6 src + **3 单元 spec 仍绿** |
| **不受影响** | headless/jsonrpc/web 测试 | 留 | 7 文件（5 headless + 1 jsonrpc + 1 web）只借 normalizer |
| **不受影响** | `packages/bundle/data-agent/` | 留 | grep `acp` 0 命中——da 表面零交集 |

**消费者计数**：acp-snapshot 的 13 个消费者文件中，6（acp-agent 全套）经 acp-demo 传递 break，7（headless 5 + jsonrpc 1 + web 1）存活。

## 3. 对 (c) 的意义

(c) 纯产品仓库删 acp/ 的代价**可量化、可控、与 da 表面零交集**：

1. **不是单包编辑**——级联 2 包 + 1 示例：必须同删/重写 acp-demo（硬 import）+ acp-agent（cordis.yml 硬 load acp-demo + snapshot 套件启 acp-demo bin）。acp-snapshot 可留（零依赖），但 launcher/suite 工厂失去唯一真 ACP-server 消费者，半孤儿（仍被假 agent 单元 spec 覆盖）。
2. **da 功能无影响**——`packages/bundle/data-agent/` 0 acp 引用，Q2 disable-only 已隔离 code-agent/ACP 面于 da preset 之外（P1 已落地：disable tool-str-replace-editor/ralph + tools.mode:native，acp-demo 不在 data-agent bundle）。删 acp/ 是清 code-agent 遗产，非 da 需求。
3. **测试基建损失重**——~70 snapshot 场景 + 57 cordis 配置 + 8+3+7 spec 文件是 ACP automation 的旗舰 e2e/snapshot 展示面；但 da 不消费它（da 走自己的 query/data/subagent/credentials/phase-gate 包 + G2 eval 迁 TS）。
4. **与 disable-only 的关系**：Q2 disable-only 保 acp/ 在仓内但 da preset 不挂（保上游升级路径）；(c) 才真删。本笔记给 (c) 的代价基线：删 acp/ 非孤立动作，需配套删 acp-demo + acp-agent + 5 manifest/文档行。决策维持 disable-only（Q2 既定）零成本；(c) 触发本 fallout。

**结论**：(c) 纯产品仓库删 acp/ **可行且与 da 干净分离**，但非零成本——需同删 acp-demo + acp-agent 示例（~70 场景 + 57 配置 + 18 测试文件）+ 5 manifest/文档行 + lock 重生成。当前 disable-only 优先级低于 (c)，本量化留作 (c) 决策输入。无新 ticket 毕业（(c) 自身在 map "Out of scope" 标注"实际删除留作 (c) 纯产品仓库重构时"，决策点已存在）。

## 来源（Sources）

- **primary（code-read，2026-08-20）**：
  - `packages/examples/acp-demo/src/index.ts:4,17`（import + plugin 组合）+ `src/bin.ts:18`（boot glue）+ `package.json:45,61`（peerDep/devDep）+ `tests/{acp-agent.spec,built-bin.e2e,load-path.e2e}.ts`。
  - `packages/test-support/acp-snapshot/package.json`（deps 无 dsh-acp）+ `src/launcher.ts`（import @agentclientprotocol/sdk + dsh-loader-smoke）+ `tests/fixtures/fake-acp-agent.ts:2-3`（假 agent）+ `tests/{harness,normalize,suite}.spec.ts`。
  - `examples/acp-agent/cordis.yml`（`id: acp-agent / name: '@deepseek-ai/dsh-acp-demo'`）+ `tests/acp.snapshot.ts:28-32`（AGENT.binScript = acp-demo/src/bin.ts）+ `tests/*.ts`（7 文件）+ `*.cordis.{yml,snapshot.yml}`（57）。
  - `examples/headless-agent/tests/headless.snapshot.ts:9-20,53-54`（normalizer + headless-driver/cli bin）+ 4 同例 snapshot 文件。
  - `examples/jsonrpc-agent/tests/sdk.snapshot.ts:17-27,33`（normalizer + jsonrpc-demo bin）。
  - `apps/web/tests/scaffold.ts:31`（normalizer + web 组合）。
  - `packages/acp/acp/{package.json,src/*,tests/*.spec.ts}`（删点：8 spec + 4 src）。
  - `python/sdk-runtime/package.json:13`、`examples/package.json`、`scripts/gen-doc-graphs.ts:734-735,760`、`packages/boot/app-boot/src/index.ts:2`、根 `package.json:140`、`pnpm-lock.yaml:3885,8551`。
  - `packages/bundle/data-agent/`（grep `acp` 0 命中——da 零交集）。
- `wayfinder/data-agent/map.md` Notes（Q2 disable-only）+ Decisions（拓扑 Q4：(c) npm-消费纯产品仓库留作后续低风险选项）+ Out of scope（"物理删除 code-agent 包——实际删除留作 (c) 纯产品仓库重构时"）。
- `wayfinder/data-agent/research/p2-dashscope-wire.md`（note 结构模板：TL;DR / 实证 file:line / 纠正 / 来源）。
