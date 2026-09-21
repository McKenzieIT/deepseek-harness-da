---
type: task
status: resolved
assignee: codex
blocked_by: []
---

# W25: semantic-layer management preset persona config compatibility

## Question

如何把 `packages/bundle/data-agent/presets/semantic-layer-management/agent.cordis.yml` 的 persona 配置更新到当前 `@deepseek-ai/dsh-persona` schema，使 Web Client 能选择 `semantic-layer-management` 并启动真实管理 Agent 回合？

2026-09-18 的 W18 浏览器验证中，preset 激活失败并报告 `$.prefix missing required value`；当前文件仍使用旧 `config.text`。W18 的 Dashboard 数据验证不依赖该 Agent preset，真实模型证据因此使用 Minimal preset，未在 W18 顺手迁移 management persona。

## Acceptance

- semantic-layer management persona 使用当前 `prefix`/`suffix` 配置字段并保留现有模型指令。
- preset selection 在 shipped Web profile 中不报告 row activation failure。
- 真实管理 Agent 回合能加载其工具 roster；更新相应 preset、browser 和 keyless snapshot evidence。

## Answer（2026-09-21）

根因是 shipped `semantic-layer-management` preset 的 persona row 仍写入已移除的 `config.text`，而当前 `@deepseek-ai/dsh-persona` schema 要求 `prefix`。本票只把该字段改为 `prefix`；原 persona 指令文本、段落顺序和工具 composition 均未改变。未显式写入 `suffix`，因为当前 schema 与 package README 均规定省略时默认为空字符串，并覆盖 deployment suffix。

自动化回归测试通过真实 Web bundle、data-agent patch、AgentPresets Loader 和实际 `packages/bundle/data-agent/presets/semantic-layer-management/agent.cordis.yml` 装配该 preset，不复制 YAML、不注入 fake persona。测试先在旧配置上以以下命令稳定复现 RED：

```sh
pnpm vitest run --config vitest.web.config.ts apps/web/tests/semantic-layer-management-preset.e2e.ts
```

失败为：

```text
agent-presets: preset "semantic-layer-management" failed to mount: 1 row(s) did not activate:
persona (@deepseek-ai/dsh-persona): invalid config:
  - $.prefix missing required value (at prefix)
```

修复后同一命令通过 `1 file / 1 test`。测试确认 preset 可发现并激活、`deployment:persona-prefix` 包含原管理 persona、工具 schema 与真实 composition 中启用的 tool rows 一致，并确认注释中的 `execute_metric` 没有进入 roster。另行通过 `pnpm run typecheck`、`pnpm run doc-sync`、`pnpm exec oxlint apps/web/tests/semantic-layer-management-preset.e2e.ts`、`git diff --check` 和 `git diff --cached --check`。完整 Semantic Dashboard recorded-session oracle 仍由 [W24: Semantic Dashboard recorded-session Web snapshot harness](W24-semantic-dashboard-web-snapshot-harness.md) 负责，本票没有伪造 evidence-query replay 数据。

真实 Web 验证使用 data-agent patch 与 in-page picker。按票面命令首次启动时，preset 已可选择且不再出现 `$.prefix missing required value`；该源码启动随后在真实工具派发处复现既有的 source/runtime 双模块问题 `Cannot read properties of undefined (reading 'prepare')`。按已记录的 source-resolution 机制显式设置 `TSX_TSCONFIG_PATH="$PWD/tsconfig.base.json"` 后，以同一 `pnpm dsh web` 命令重启，Web 中选择“语义层管理”，新建真实 `aga/qwen3.7-max` 回合并请求 `get_coverage`。UI badge、`agent-preset/selected` 事件和渲染后的 system prompt 均确认使用 `semantic-layer-management`；工具调用成功返回 4,682 个资产（321 tables、445 events、3,916 metrics），模型完成摘要，Session 以 `turn/end: completed` 收口。

GIF 来自 commit `ccc74d22cb6ebdae3c6b6235094cf1d8958dab92` 的同一真实 server、同一新 Session 和真实模型回合：`.playwright-mcp/w25-semantic-management-ccc74d22cb/semantic-layer-management.gif`。元数据为 839×970、130 frames、13.0 秒、565,922 bytes，SHA-256 `05df3098117d754027b7b798a7d9ebfd3c28eb2b0b9bc073608167fcb3a7211e`；启动命令、prompt 和运行说明在同目录 `notes.md`。

剩余边界不变：[W17: 管理 session 客户端桥接 —— 知识图谱闭环断在一个点上](W17-management-session-client-bridge.md) 继续负责图谱内真实消息、发送、事件源、引用插入和独立入口；[W22: Patrol 真实编辑执行与 composition](W22-patrol-real-edit-composition.md) 继续负责 patrol 的真实 edit 执行与 composition；[W24: Semantic Dashboard recorded-session Web snapshot harness](W24-semantic-dashboard-web-snapshot-harness.md) 继续负责 Dashboard/evidence-query replay；[Evaluation T13 — Production Context Projection capability](../../evaluation/tickets/T13-context-projection-service.md) 继续负责生产 Context Projection 与 evidence identity。本票不改变这些 ticket 的状态或职责。
