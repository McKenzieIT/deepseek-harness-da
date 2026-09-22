---
type: grilling
status: open
assignee: null
blocked_by: []
---

# G9: semantic definition `lastModified` ownership

## Question

哪个持久、可回放的 semantic-layer 记录应拥有 table、event 和 metric definition 的 `lastModified` 语义，并向 evidence-query 提供统一时间？

决策必须覆盖：

- 修改时间表示定义内容提交、审计记录提交还是其他明确事件；
- table、event 和 metric 使用同一来源，还是返回按资产类型区分的 unavailable；
- 写入、迁移和查询该时间的 Service Provider 与 Consumer；
- 为什么 confirmation timestamp 和文件 mtime 不能替代该字段。

在该 owner 落地前，evidence-query 返回 `lastModified: null`，不从文件系统或 confirmation metadata 推断。
