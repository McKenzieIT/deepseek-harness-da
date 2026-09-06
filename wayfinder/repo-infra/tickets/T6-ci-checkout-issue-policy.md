# T6 — CI checkout / Issue-policy 失败

**Type**: task（或 research——需先定 root cause）
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: 2026-09-06 PR #7 的 CI 发现（fast-fail at checkout + Issue lifecycle/policy）

## Question

PR #7 的 CI 多 job fast-fail（6-8s，未到 build/test）：
- **checkout git exit 1**：`##[error]The process '/usr/bin/git' failed with exit code 1`（post-merge `da9483a`；cleanup 有 `git submodule foreach`）。疑：submodule config? merge commit handling? `actions/checkout` 版本?
- **Issue lifecycle / Issue policy**（6-8s）：GH token/permission 失败（疑 repo settings / workflow permissions）。

非本 session 引入（pre-existing CI infra；T7 fix 验证时同 CI 红在 checkout，非 build/test）。

**修法（决策点）**：
- (a) checkout：查 `.github/workflows/`，定位 git exit 1 root cause（submodule? `actions/checkout` 版本? merge commit handling?）。修 workflow OR checkout 配置。**agent-doable**（investigation + workflow fix）。
- (b) Issue lifecycle/policy：查 GH token 的 permissions（repo settings? workflow permissions?）。**可能需用户调 GH settings——非 agent-doable**。

## Scope

定 root cause（checkout (a) agent-doable；Issue policy (b) 可能需用户 GH settings），修，验 CI 绿。出 build/theme infra 范围（CI infra，separate）。
