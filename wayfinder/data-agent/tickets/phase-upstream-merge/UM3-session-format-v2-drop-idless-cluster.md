# UM3 — session 冲突：接受 upstream format-v2 + 丢 fork id-less 簇（A5）

**Type**: refactor
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: UM1
**Blocks**: UM4（results-RPC 触 session）、UM5、UM6、UM7
**Related**: d5 A5（`.tmp/audit/d5-upstream-impact.md` line 12-14）；upstream `a1271a4 fix(llm): keep streamed tool-call identity across empty deltas`、`f99b06e feat(session)!: embed assistant streams in format v2`

## 背景

d5 审计 A5 记 fork 做了 id-less 容忍簇：`packages/core/session/src/index.ts:336-346`（放松 callId 非空 + 跳过 toolCallId 匹配）+ `packages/llm/llm/src/assembler.ts:71,81`（`if(chunk.id)` 守卫 + block-end 回填）+ `ui-conversation:240` + `ui-trajectory:223`（容忍空 callId）。d5 建议"在 data-agent adapter 铸 callId + 回退整簇"。

**本 session 直接 diff（`git diff master upstream/master`）发现 upstream 走了反方向**：
- `packages/llm/llm/src/assembler.ts`：fork（`-`）`:71 if(chunk.id) partial.toolCallId = chunk.id`（守卫）+ `:78-84` block-end 回填；upstream（`+`）`:72 partial.toolCallId = chunk.id`（无条件）+ `:79 partial.block = chunk.block`（不回填）。两边 `:115` 都有 `?? call-${index}` 兜底。
- `packages/core/session/src/index.ts`：upstream `:376-377` 仍**拒绝空 callId**（`typeof sourceRecord['callId'] !== 'string' || === ''` → throw）。fork 在 `:336-346` 放松了它——两方向相反。

→ upstream 选了"源头修 id 发射（`a1271a4`）+ session 保严格"。这正是 d5 想要的终态。**A5 在 merge 中按 upstream 方向自动解决**：丢 fork 容忍簇（accept upstream），无需 fork 自铸 callId。但条件：data-agent adapter 必须**每 delta 发 id**（对齐 `a1271a4`），否则 upstream session 校验直接拒。

⚠️ session 模块不止 id-less 冲突：upstream 把整个 format 切 v2——`seedLength:number`→`isSeeded:boolean`、新增 `SessionLogOffset`/`SessionSeq`、删 `chunk-rows.ts`/`json.ts` 导出、`deepFreeze`/`snapshotJsonValue` 移到 `dsh-util-values`、`seq < 0` 加 `-0` 检查、`request/header-delta` legacy 拒绝被移除。fork 的 id-less hunk 坐在已死 v1 代码上——整模块大面积冲突。

## Scope

1. 接受 upstream `packages/core/session/src/index.ts`（format v2）整文件——丢 fork 的 id-less 松弛 hunk（`:336-346`）。
2. 接受 upstream `packages/llm/llm/src/assembler.ts`——丢 fork 的 `:71` 守卫 + `:78-84` 回填。
3. 丢 fork `ui-conversation:240` + `ui-trajectory:223` 的空 callId 容忍（accept upstream）。
4. **核 data-agent adapter**：确认每条 `tool-call-delta` 带 id（对齐 upstream `a1271a4` 的"keep identity across empty deltas"）。若不发→在 data-agent adapter 铸 id（NOT 在 upstream session/assembler 放松）。
5. d5 A5 标记 → resolved-by-upstream（map 标记见 [data-agent/map.md § Upstream merge](../../map.md)）。
6. `legacy-empty-callid` × 2 分支（`fix/legacy-empty-callid`、`fix/legacy-empty-callid-pr`）tied to A5，UM3 解决后 UM11 删。

## Merge outcome (2026-09-07)

⚠️ **`packages/core/session/src/index.ts` + `packages/llm/llm/src/assembler.ts` AUTO-MERGED（git 无 textual conflict marker）**。但 fork 的 id-less 容忍（session `:336-346` 松弛 + assembler `:71,81` guard/backfill）+ upstream 的严格（session `:376-377` 拒空 callId）/源头修（`a1271a4`）**很可能共存于合并结果** → semantic 矛盾（一个允许空、一个拒空）。

→ **UM3 任务不是 conflict-marker resolution，是 semantic review**：审 auto-merged 的 session/src/index.ts + assembler.ts，手动丢 fork 的 id-less 容忍（accept upstream 严格 + 源头修），确保 data-agent adapter 每 delta 发 callId（对齐 `a1271a4`）。**git 没标 ≠ semantic OK**——这是 A5 最隐蔽的风险点。

## Resolution (2026-09-08)

4 files reverted to upstream byte-identical: `packages/core/session/src/index.ts`, `packages/llm/llm/src/assembler.ts`, `packages/client/ui-trajectory/src/client/trajectory-tool-definition.ts`, `packages/client/ui-chat/src/client/conversation-nodes/tool.ts`. Dropped fork's id-less tolerance (session `:336-346` relaxation + assembler `:71` guard + `:78-84` backfill); accepted upstream strict (reject empty callId + unconditional `partial.toolCallId = chunk.id` + `a1271a4` source fix). DashScope (non-conformant — emits deltas without callId) fixed in UM7-2.
