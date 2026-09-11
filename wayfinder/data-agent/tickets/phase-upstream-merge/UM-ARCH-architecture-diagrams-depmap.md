# UM-ARCH — dsh + data-agent 架构图 + 依赖图 + gen/verify/update 机制

**Type**: task · **Status**: resolved（2026-09-09 regen-from-synced；2026-09-10 UM10 补一次 regen）· **Phase**: upstream-merge
**Blocking**: UM14（权威 dsh 图基于 synced latest）
**Foundational for**: UM15（impact analyzer 在图上推理）、UM-ADAPT（adaptive 守门用依赖图的"对齐状态"）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase B）

## Question

建工程机制：产出 `dsh` upstream + `dsh-data-agent` 两张 Mermaid 架构图 + data-agent→upstream 依赖图（含 violation 标记），带 gen/verify/update-on-change。这是 demand ③（durable 方法）+ Q2（adaptive-vs-patch 守门）的地基模型——没它，impact 分析只是文件 overlap；有它，才是架构对齐感知的。

## 子步

1. `gen-architecture-graph.ts`——从代码（包结构 + 跨包 import + 5 modular seam + @Remote assembly）生成两张 Mermaid + 依赖图。跟 repo 现有 `gen-module-graph.ts`/`gen-doc-graphs.ts`/`verify-module-graph.ts` 同 pattern。
2. `verify-architecture-graph.ts`——图与代码不漂移则 fail。
3. **依赖图**（data-agent→upstream）：每个 data-agent 组件 → upstream seam/包 → 契约（public / zombie violation）→ 对齐状态。v1 草表见 `UM-flow-2026-09-08.md`（含 R-DA-CLIENT-RUNTIME-DECOMMISSION 的 zombie violation + workspace-files 待采纳）。
4. **update-on-change gate**：每次 data-agent 或 upstream 更新 regen；gate 进 CI（`check:ci:static` 或新 gate）+ pre-push。像 `verify-module-graph`。
5. 用 gen 脚本生成的权威图替换 `UM-flow-2026-09-08.md` 里的手画 v1 草图。

## Deliver

`gen-architecture-graph.ts` + `verify-architecture-graph.ts` + 初始权威两张 Mermaid（dsh + data-agent）+ 依赖图 + update-on-change gate。

## Resolution

**[2026-09-09] RESOLVED** — regen-from-synced 落地：commit `038d8b51ce`（worktree `../dsh-arch-regen`，branch `chore/um-arch-regen-2026-09-09`），`verify-architecture-graph` green，`docs/architecture-graph.md` 成为权威 dsh 图，workspace-files 已 authoritative。手画 v1 草图已被 gen 脚本产物替换。

**[2026-09-10] 补记（UM10 线 A）** — Phase-2（`eb9e4cf05c`）删除 `packages/client/runtime` 后，本票产出的 `docs/architecture-graph.md` **变 stale**（仍把 `client-runtime` 列为包，且列为 `client-result-cache`/`client-ui-context-layer`/`client-ui-present-decomposition` 的依赖）。UM10 已重跑 `gen-architecture-graph` 修复（commit `ecaa56c848`，删除的 -64 行全是 `pkg_client_runtime` 的 mermaid 节点与边）。

**教训（喂给 UM15）**：架构图是**删包操作的下游产物**，任何包增删都必须触发 regen；`verify-architecture-graph` 不在 `check:ci:static` 组内，所以 static sweep 抓不到它 stale——UM15 的 durable 方法应把它纳入删包 checklist。
