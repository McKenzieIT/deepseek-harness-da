# @deepseek-ai/dsh-tool-present-clarification

[English](README.md) | 中文

面向模型的 present_clarification 工具：向用户提出澄清问题并中止轮次，等待用户回答（self-evolution #2a；可在任意阶段调用）

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM 适配器。

#### KV Cache 影响

本包的贡献以仅追加方式并入可复用的请求前缀，不会使既有缓存条目失效。

## 已知限制与后续工作

- 纯展示：中止轮次且不存储答案。
- 可在任意阶段调用，但每个轮次仅允许一个待处理的澄清。
