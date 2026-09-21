---
type: task
status: open
assignee: null
blocked_by: []
---

# CL-31: retrieval corpus scope 与 label trimming

## Question

如何让生产 retrieval corpus 明确按请求的 scope 加载，并以可复现规则修剪会稀释检索的过度 enrichment labels？

范围：

- 修正 `loadRetrievalCorpusAll(scopeId)` 当前忽略调用方 `scopeId`、转而读取 active root 的行为。
- 为 scope 隔离增加有效与无效用例，禁止 JavaScript 静默忽略参数。
- 用受保护检索切片决定 label trimming，不以旧总体 pass-rate 阈值代替 corpus-level evidence。
- 保留表、事件、concept 和虚拟 metric 的真实 corpus 投影；不在本票选择新的 hybrid fusion 公式。
