# T29 — DA CI 与 upstream workflow ownership

**Type**: grilling  ·  **Status**: in-progress（决策已定 + 实现落于分支 `chore/ci-da-upstream-isolation`，PR 待开；见文末 Resolution）
**Part of**: [repo build and theme infra map](../map.md)
**Migrated from**: [semantic-layer CB-5](../../semantic-layer/tickets/CB5-da-ci-upstream-boundary.md)

## Question

Data-agent fork-specific dependencies、platform setup、resource budgets and test adaptations should be owned by which CI lanes, and which changes must stay out of upstream-shared workflows so future upstream syncs remain reviewable?

## Must decide

- Whether DA needs path-scoped CI lanes and which packages, scripts, fixtures, and operating systems they own.
- Whether shared `build:lib:host` memory requirements and upstream test changes are repository-wide fixes or fork-only adaptations.
- How fork-only issue-policy credentials and workflow conditions remain explicit without editing upstream behavior accidentally.
- Which existing workflow edits should remain, move to DA-owned lanes, or be reverted during the next upstream sync.

## Scope

This ticket owns repository CI and upstream-sync policy only. It does not reopen semantic-layer runtime or evaluation implementation work.

## Resolution（2026-09-22 · 决策 + 实现）

采用**两步**回答本票路径隔离项，实现落于分支 `chore/ci-da-upstream-isolation`（PR 待开）：

**① 止血（commit `bea242fc8c`；只改 fork 已分叉的 `ci.yml`，不碰上游文件）**
`all-checks-passed`（分支保护判据）原把 `node-24-coverage` / `node-24-consumers` / `node-compat` 列为必需，而三者都跑上游 `scripts/prepare-ci-bubblewrap.sh`（pin 的 .deb 被 Ubuntu pool 轮换 → HTTP 404，见 UM18 §终局棒二），使判据在每个 PR 上必红、与 fork 改动无关。已把三者移出 `needs`，并将 bubblewrap 预备步骤非致命化（`::warning::` 而非 failure），仍运行供参考。

**② DA 专属必需检查（commit `64afb54333`）**
新增 fork 自有 `.github/workflows/ci-da.yml`（作业 `da-checks (fork-owned only)`）+ `scripts/da-owned-packages.ts`。归属判据 = `upstream/master` 中不存在的包目录（同 UM18 权威判据）。冒烟实测：376 本地包 / 324 上游包 → **66 个 DA 自有包**；`dsh-core` 等上游包正确排除，`nl2sql-engine` / `llm-dashscope` / `eval-cli` / `ui-semantic-layer` / `semantic-layer` 正确纳入。`da-checks` 跑 typecheck（整图——DA 依赖上游类型）+ vitest（只跑那 66 个 DA 包）→ 判据当且仅当 fork 自有内容 OK 才绿，免疫 bubblewrap 404 / 缺 secret / 16 核预算 / 上游自碎测试。

**对照本票「Must decide」**：路径限定 CI lane + 归属哪些包 → `ci-da.yml` + `da-owned-packages.ts`（66 包动态判定）；上游共享 workflow 里哪些改动该留 → 止血改动全在 fork 已分叉的 `ci.yml`，不触上游文件，下次同步可原样保留。

**owner 待办（GitHub 后台，agent 无权）**：Settings → Branches → `master`，把 required status checks 设为 `da-checks (fork-owned only)`，`all checks passed` 降为非必需——隔离才算强制生效。

**后续（可选）**：DA coverage 棘轮（不新增未覆盖）作为独立跟进（UM18 coverage 独立轨道）。

**转 resolved 条件**：PR 合并 + owner 切换必需检查后，标 resolved 并回填「实现见 PR #N」。
