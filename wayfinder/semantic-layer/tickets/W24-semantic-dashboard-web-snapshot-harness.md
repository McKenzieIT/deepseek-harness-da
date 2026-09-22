---
type: task
status: open
assignee: null
blocked_by: []
---

# W24: Semantic Dashboard recorded-session Web snapshot harness

## Question

如何让 keyless recorded-session Web snapshot 启动 data-agent composition、挂载 `semantic-layer-management` 客户端，并为 `remote.evidenceQuery` 提供可回放的 eval run history，使 Dashboard 的 run list、delta 和 asset-filter-unavailable 状态进入稳定的 assembled UI oracle？

当前 `snapshots/web/` 没有 semantic-layer management 场景，现有 session fixture 也不拥有 `.tmp/eval-results` 或 evidence-query Remote 响应。W18 的 component、service、gateway 和真实 Web 验证能覆盖行为，但不能在不新增 snapshot composition 支持的情况下生成可信的 recorded-session oracle。

## Acceptance

- 场景通过 shipped `dsh web` profile 和 Loader composition 启动，不增加隐藏应用入口。
- 记录的 Session 或明确借用的 canonical Session 驱动管理 UI。
- keyless fixture 提供至少三个 run，断言 run list、最新两次 delta 和 asset-filter-unavailable 提示。
- `DSH_SNAPSHOT=replay pnpm run test:web` 在无 API key 环境复现该输出。
