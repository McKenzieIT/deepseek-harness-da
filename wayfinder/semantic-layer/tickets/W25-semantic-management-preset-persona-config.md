---
type: task
status: in_progress
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
