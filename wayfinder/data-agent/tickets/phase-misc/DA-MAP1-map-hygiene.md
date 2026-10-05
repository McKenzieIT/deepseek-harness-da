# DA-MAP1 — data-agent map 从「存储」恢复为「决策索引」

**Type**: task  ·  **Phase**: misc  ·  **Status**: in-progress
**Assignee**: claude (DA-MAP1 session)
**Branch**: master（纯 `wayfinder/` 文档，不触 `packages/*/src`——按 CLAUDE.md「直推 master 仅限 diff 不触及 packages/*/src 的纯 wayfinder 文档」）
**Blocked by**: —
**Blocks**: 后续任何读 map 取 ticket 的 session（当前 map 不可用作索引）
**Related**: [semantic-layer A21 map/prompt hygiene](../../../semantic-layer/tickets/A21-map-prompt-hygiene.md)（范本，commit `fd0bdf6102`）

## Question

`wayfinder/data-agent/map.md` 已从「索引」退化为「存储」：360 KB / 621 行，最长单行 12.5 KB，
违反 wayfinder skill 的两条约定——"The map is an index, not a store" 与「map 不镜像 open-ticket 状态」。

按 A21 先例把它恢复成决策索引：规范章节只保留 Destination / Notes / Decisions so far /
Not yet specified / Out of scope；每条 Decisions-so-far 压成「一行 gist + 票链接」；
实施记录与审计明细留在票里或移去 `research/`；open-ticket 状态镜像删除（状态唯一来源是票自己的 `**Status**`）。

同时清理 `tickets/` 下 11 个无可解析状态的文件：分出哪些是真票（补规范 Status）、
哪些是 session 总结 / prompt / 早期 spec 文档（`git mv` 出 `tickets/`）。

**这是搬运与压缩，不是重新决策**——所有跨 map 指针、fog、scope 边界原样保留。

## 范围边界（并行 session 硬约束）

- 只对 `wayfinder/data-agent/**` 有写权，含 `map.md`。
- 发现属于别的 map（repo-infra / evaluation / semantic-layer）的工作：只允许**新建 ticket 文件**，
  指针记在本票 Answer；**不编辑别人的 `map.md`**（另有并行 session 在跑）。
- `tickets/phase-1/调用文档-emp-414028.md` 是已 gitignore 的凭据文档（`842dbf3325` 已处理）——不动、不提交。

## 验收

1. `map.md` 回到 5 个规范章节，体积与行宽大幅下降（目标同量级于 semantic-layer 的 21 KB）。
2. 每条 Decisions-so-far 是「一行 gist + 票链接」，不含实施细节与 open 状态镜像。
3. `tickets/` 下只剩真票；每张票有可解析的 `**Status**`。
4. 本票 Answer 写明：归档了什么、哪些内容搬去哪、哪些判为 out of scope、给别的 map 开了哪些票。

## Answer

<!-- 待本 session 收口时填写 -->
