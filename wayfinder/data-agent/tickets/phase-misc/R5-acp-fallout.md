# R5 — acp/ 测试 fallout

**Type**: research
**Phase**: misc（低优先）
**Assignee**: wayfinder-subagent 2026-08-20
**Status**: Resolved (2026-08-20)

**Question**: 量化 `test-support/acp-snapshot` + `acp-demo` 对 ACP 的依赖（若 (c) 重构删 acp/ 时用）。当前 disable-only，低优先。

## Finding (resolved 2026-08-20)

删 `packages/acp/`（`@deepseek-ai/dsh-acp`）**不是单包编辑——级联到 acp-demo（硬依赖）+ 整个 acp-agent 示例（经 acp-demo 传递依赖）。acp-snapshot 自身零依赖 acp/、存活。da 表面零交集**。

**ACP 依赖量化**：
- **直接 import `@deepseek-ai/dsh-acp`：全仓 1 处**——`packages/examples/acp-demo/src/index.ts:17`（`import * as acp from '@deepseek-ai/dsh-acp'`），且 `apply()` 末段 `ctx.plugin(acp, {provider, model})` 作 ACP transport 桥（acp-demo 的全部存在意义）。
- **package.json dep 声明：3 处**——acp-demo（peerDep `:45` + devDep `:61`）+ `python/sdk-runtime/package.json:13`（deploy 闭包清单，无源码 import）。
- **acp-snapshot 对 `@deepseek-ai/dsh-acp` 零依赖**：package.json deps 只有 `@agentclientprotocol/sdk`（协议 SDK）+ `dsh-loader-smoke` + `vitest`；`src/launcher.ts` 只 import `@agentclientprotocol/sdk` + `dsh-loader-smoke`，启动**参数化** agent bin；单元 spec 用 `tests/fixtures/fake-acp-agent.ts`（脚本化假 agent，非真 acp/）。删 acp/，acp-snapshot build + 3 单元 spec 仍绿（launcher/suite 工厂部分孤儿化但被假 agent spec 覆盖）。

**fallout 清单**：
| 层 | 对象 | 量化 |
|---|---|---|
| 删除 | `packages/acp/` | 4 src + 8 spec + harness.ts + READMEs |
| Tier1 直接 break | `packages/examples/acp-demo/` | 3 src + **3 测试**（acp-agent.spec/built-bin.e2e/load-path.e2e）+ package.json 2 dep 行 |
| Tier2 传递 break | `examples/acp-agent/` | **7 .ts 测试**（含 `acp.snapshot.ts` ~70 场景）+ **57 cordis.yml/.snapshot.yml** + snapshots/ + goal-snapshots/ 固定桩 |
| Tier3 manifest/文档 | python/sdk-runtime、examples/package.json、gen-doc-graphs.ts、app-boot 注释、root `demo:acp` 脚本 | 5 处 + pnpm-lock 重生成 |
| 不受影响 | acp-snapshot 自身（3 spec 仍绿）+ headless/jsonrpc/web 测试（7 文件只用 normalizer，启非 acp-demo bin）+ `packages/bundle/data-agent/`（grep `acp` 0 命中） | — |

acp-snapshot 的 13 个消费者文件：6（acp-agent 全套）经 acp-demo 传递 break，7（headless 5 + jsonrpc 1 + web 1）存活。

## Assets

- `wayfinder/data-agent/research/r5-acp-fallout.md`（cited note：TL;DR / §1 实证 file:line / §2 fallout 量化表 / §3 对 (c) 的意义 / 来源）。

## Unblocks

对 (c) 纯产品仓库删 acp/ 决策的意义：(c) 可行且与 da 干净分离（`packages/bundle/data-agent/` 0 acp 引用，Q2 disable-only 已隔离 code-agent/ACP 面于 da preset 外），但非零成本——需同删 acp-demo + acp-agent 示例（~70 snapshot 场景 + 57 cordis 配置 + 18 测试文件）+ 5 manifest/文档行 + lock 重生成。当前 disable-only（Q2 既定）零成本优先；(c) 触发本 fallout。无新 ticket 毕业——(c) 自身在 map "Out of scope" 标注"实际删除留作 (c) 纯产品仓库重构时"，决策点已存在，本笔记仅给代价基线。
