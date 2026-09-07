# @deepseek-ai/dsh-client-ui-suggest-followups

[English](README.md) | 中文

`suggest_followups` INTERPRETATION 工具的 toolview 卡片。将后续问题建议渲染为两行列表：首行显示短标签，下方显示完整查询 `value`。点击某一行即把该 value 作为一条新消息提交到会话。

## 样式说明

本包自带的 chip 样式引用了六个 `--dsw-bg-*` / `--dsw-text-*` / `--dsw-border-*` 自定义属性，但这些属性在主题中并不存在，因此背景与边框静默解析为空。列表样式重构仅消费 `--dsw-alias-*` token。

## 模型体验

间接接入，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包既不扩展也不使 agent loop（智能体循环）的可复用请求前缀失效。

## 已知限制与延后工作

- 点击某一行会立即提交；没有先填充 composer 的模式，已提交的后续消息也无法撤销（phase-2 候选）。
- 已过期的行不可操作：无法从更早的轮次重新发送。
