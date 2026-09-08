# @deepseek-ai/dsh-management-session

[English](README.md) | 中文

全屏图谱管理 UI 专用的管理 agent（智能体）会话：在 semantic-layer-management preset 下创建限定作用域的会话，并持有只读的父上下文引用。

## 模型体验

间接，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

本包的贡献对可复用的请求前缀是仅追加的，不会使既有缓存条目失效。

## 已知限制与后续工作

- 父上下文引用为只读（不回写）。
- 管理 preset 是独立作用域，编辑在重新加载前不会自动反映到父会话中。
