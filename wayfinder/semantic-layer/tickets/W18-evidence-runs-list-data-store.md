---
type: task
status: resolved
assignee: codex
blocked_by: []
---

# W18: Evidence Dashboard run history、delta 与 asset 选择语义对齐

**Branch**: `fix/w18-evidence-runs-list-data-store`

## Question

当前 `FileBackedEvalResultStore` 已从 `.tmp/eval-results` 解析 JSONL，`evalResultQuery()`、`beforeAfterDelta()` 和 `getEvalRunCount()` 也共享同一 store；W16 的“双 store / JSONL 无法解析”假设已被当前代码和 focused tests 否定。需要修复的是 UI 加载与选择语义：

1. `DashboardView` 创建 `useEvidenceQuery` 后只触发 coverage，没有主动加载全局 run history 或最新两次运行的 delta。
2. `EvidenceSidebar` 只有选择 asset 后才查询 eval results，未选择时不显示全局历史，也从未主动加载 delta。
3. 旧 eval persistence 只有 `caseId`；默认把它复制为 `assetId`，但没有可靠的 case→asset 映射来源，不能据此声称某个 asset 没有 eval。
4. Dashboard、Sidebar 与 delta 必须使用同一套 run 选择规则。

## Task

- 先添加失败测试，覆盖全局 history、最新两次 run 的 delta、asset mapping unavailable 回退以及 loading/empty/error/single-run/multi-run 状态。
- Dashboard 挂载时查询全局 eval history；至少两次 run 时比较按时间排序的最新两次。
- Sidebar 未选择 asset 时查询全局 history；选择 asset 时仅在 store 存在可靠 case→asset 映射时过滤。
- 没有可靠映射时返回全局结果并明确报告 asset filter unavailable，不得把 caseId fallback 伪装成 asset-scoped evidence。
- UI run list 按 run 聚合展示，不以 JSONL 文件数或 case record 数代替可显示的 run history。
- 更新 EvidenceQuery/UI README、必要 JSDoc、keyless Web snapshot blocker 或支持、真实 Web 验证与 GIF 证据。

## Out of scope

- 不实现 Evaluation T9/T13。
- 不迁移旧/新 EvaluationStore；只记录其 owner 和后续 ticket。
- 不修改 eval case schema 来发明 case→asset 映射。

## Acceptance

- 三个已有 run 能进入 Dashboard run list。
- 至少两个 run 时显示真实 delta。
- 未选择 asset 时，Dashboard 和 Sidebar 均加载全局 run history。
- 选择 asset 时，只在候选记录都有可靠映射时过滤；否则显示全局结果并明确 asset-specific history unavailable。
- loading、empty、error、single-run、multi-run 状态均有自动化测试。
- UI 不再通过文件数量推断已经拥有可显示的 run。
- EvidenceQuery/UI README 与必要 JSDoc 已更新。
- 非平凡可见变化有 keyless snapshot，或同一改动明确记录 snapshot harness blocker。
- 真实 Web profile 浏览器验证并录制 GIF。


## Answer（2026-09-18）

当前 `FileBackedEvalResultStore`、`evalResultQuery()`、`beforeAfterDelta()` 和 `getEvalRunCount()` 原本已共享同一解析后的 store；空面板来自 Client 没有主动查询 history/delta，而不是双 store 或 JSONL 解析失败。

修复后的规则：

- `DashboardView` 挂载后通过 `evalRunHistory()` 查询最新十条全局 run summary；`EvidenceSidebar` 未选择资产时也查询同一有界全局 history，选择资产时发起有界 asset filter 请求。浏览器不接收各 run 的完整 case records。
- `useEvidenceQuery.fetchEvalHistory()` 统一 history 与 delta 的选择规则：从查询结果的 `metadata.runId` 去重，按记录时间排序，存在至少两次运行时比较最新两次；资产筛选实际应用时，delta 使用同一资产范围。重叠请求只有最新选择可以发布结果。
- `EvalTrajectory` 按 run 聚合显示，不再把每条 case record 或 JSONL 文件数量当作 run list。
- `EvalResultStore` 记录 asset identity 是否可靠。候选记录全部来自程序化 `add()` 的明确 `assetId` 时可筛选；旧 JSONL 没有 case→asset resolver 时，`assetFilterStatus` 返回 `unavailable`，保留全局结果并由 UI 明示，不再把 `caseId` fallback 当成资产证据。`hasResultsFor()` 同样忽略不可靠 fallback。
- Client wiring 现在等待 `remote.schemaGateway` 与 `remote.evidenceQuery` 后再构造 client，并使用当前 `layout.openRightbar(true, false)` API。真实 Web 验证在此处发现并关闭了 namespace 过早读取和过时 `openDetails()` 两个阻塞。

自动化证据：

- RED：file-backed store 新增的 3 个 mapping-source 测试最初均因缺少 `assetFilterStatus` 失败；Dashboard 测试最初有 4 个状态因没有 history 请求、run list、delta 和 error 输出而失败；后续顺序测试捕获并修复了“status filter 先清空记录导致误报 unavailable”的问题。
- GREEN：`packages/data/evidence-query` 与 patrol focused run 共 121 tests 通过；`packages/client/ui-semantic-layer` 共 128 tests 通过；evidence-query TypeScript build、UI bundle 和完整 `pnpm run build` 通过。
- 浏览器：真实 `pnpm dsh web` profile 加 data-agent 与 in-page picker patch，读取现有 3 个 `.tmp/eval-results/*.jsonl`（483 case records），显示 3 个 run、最新 `47da1709 → f7959d12` delta，以及翻译后的 `Evidence Dashboard` / `证据看板`。同一 server 上通过 Minimal preset 和已配置 Qwen3.7-Max 路由完成真实模型回合，返回 `DASHBOARD_READY`；semantic-layer management preset 的旧 persona 字段由 [W25](W25-semantic-management-preset-persona-config.md) 接管。
- GIF：`../../../.playwright-mcp/w18-evidence-dashboard/run-4/w18-evidence-dashboard.gif`，1200×750、112 帧、11.2 秒、1,056,749 bytes；源视频 8.16 秒、1× 速度，末帧保持 3 秒。
- assembled Web replay：`DSH_SNAPSHOT=replay pnpm run test:web` 完成 build，并有 118 个测试文件通过、1 个跳过；suite 最终因三个既有非本票路径失败（Office preview PDF worker 超时、details-session-lifecycle terminal 文件未产生并导致 replay 未消费、`remote.localhost` DNS 失败），因此不声称该全量 lane 通过。

当前 recorded-session Web snapshot harness 没有 semantic-layer management composition 或可回放 evidence-query Remote，因此本票未伪造 snapshot。后续 owner 为 [W24](W24-semantic-dashboard-web-snapshot-harness.md)；它必须通过 shipped Web profile 增加 keyless assembled oracle。Evaluation T13 仍拥有 durable case→asset evidence identity，本票未实现 T9/T13 或迁移 EvaluationStore。

设计决策由 [Evidence history loading and asset mapping](../../../.agents/notes/implemented/bug-fix/2026-09-18-evidence-history-loading-and-asset-mapping.md) 记录。
