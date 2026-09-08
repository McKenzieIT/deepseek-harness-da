# UM-ADAPT — 逐 upstream 架构移位做 adaptive-vs-surface 分析

**Type**: research · **Status**: open · **Phase**: upstream-merge
**Blocking**: UM-ARCH（依赖图给"对齐状态"）+ UM14（synced base，分析 data-agent vs latest）
**Feeds**: UM16 + R-DA-CLIENT-RUNTIME-DECOMMISSION + R-DA-UI-PRESENTER-COMPOSITION 的改造子步
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase B）

## Question

对 449 里的每个 upstream 架构移位，做 ①upstream why ②data-agent 当前架构 ③冲突/对齐 ④adaptive 改造（不只 surface）分析，产出 per-shift 判定，喂给 UM16/R-DA 的改造子步。这是 demand ②"按最新逻辑改造"的**防糊弄 gate**——确保是适配性改造不是小修补。

## adaptive vs surface 判据（5 条）

1. 每移位识别 upstream **why**（不只 surface diff）。
2. 判 data-agent 当前架构**是否与新逻辑冲突**（不只编译过）。
3. 改造后达成**干净 seam 消费**（public 契约，不用 zombie 内部、不绕过新 lazy 模式）。
4. **不用 fork workaround 对抗新逻辑**（e.g. upstream 让 webServer lazy，fork 不 re-eager-inject 绕过）。
5. **可验证**（行为符合新逻辑，不只编译过）。

## 移位清单（待分析）

- **seam 3 webServer-lazy/carrier-neutral**（ConnectionRecoveryConfig + inject 丢 webServer）：data-agent bundle 注册是否 eager 依赖 webServer → 冲突 → 重构（不只丢 inject）？
- **seam 4 manifest 集中化**（DshClientManifest from `dsh-package-manifest`）：data-agent client-modules 用法是否跟 single-source-of-truth → 改 import + dep？
- **workspace-files first-class @Remote seam**：data-agent（做取数/文件）是否该采纳作 file ops 通道？（多半 adaptive 采纳）
- **invariant-cleanup（package-owned companions, no shared invariant）**：data-agent 的 invariant companions 是否对齐？
- **agent inbox durable projection（非 service）**：data-agent 的 inbox 消费是否跟？
- **subprocess native containment（122 commit）**：data-agent 的 sandbox/shell 消费是否跟？
- **session-format streaming v0→v2 migration**：data-agent 的 session 持久化/恢复路径是否要迁？
- **根 entry build-blocker**（15f2997bcb）：是 build-config 不是 seam 移位 → UM16 fix（不需 adaptive 判定，但 masked 子包 emit 可能需）。

## Deliver

per-shift 表：移位 | why | data-agent 当前 | 冲突/对齐 | adaptive 改造（重构 vs 表面）| 喂给哪个票。R-DA-CLIENT-RUNTIME-DECOMMISSION + R-DA-UI-PRESENTER-COMPOSITION 本质 adaptive（重架构到 public seam）。

## Resolution

(open；这次 re-sync 的一次性分析；模板被 UM15 自动化作 durable 方法)

**Progress (Session C, 2026-09-08)**：seam 3/4 的 admin 小 piece 已落地——
admin lazy-webServer refactor（mirror seam 3）commit `9ba8638eac` on
`refactor/rda-admin-lazy-webserver-2026-09-08`（worktree `../dsh-rda-admin`，
base `upstream/merge-2026-09-07`），验证 vitest 16/16 + full host tsc exit 0 +
lefthook lint。详见
[research/um-adapt-seam34-sample-2026-09-08.md §7 Resolution](../../research/um-adapt-seam34-sample-2026-09-08.md)。

- **已落地移位**：seam 3（webServer-lazy/carrier-neutral）+ seam 4（manifest
  集中化）的 admin adaptive 重构——data-agent 唯一 eager-webServer 插件
  (`packages/data/admin`) 改 lazy。seam 4 的 `fetchBundle`/条件 lazy 变体对
  HTTP-only admin N/A，用 seam 3 无条件 `ctx.inject(['webServer'], …)` 形。
- **修正**：session-prompt 称 "d347e703 有 seam 3 lazy pattern 可镜像" 有误
  ——`d347e703` 是 pre-refactor 基线；lazy pattern 在 `upstream/master`
  （`c389f96bf3`），`merge-2026-09-07` 无之；镜像自 upstream/master。
- **未落地移位**（待 UM14 + 本票后续分析）：workspace-files 新 seam、
  invariant-cleanup（package-owned companions）、agent-inbox durable projection、
  subprocess native containment、session-format v0→v2 migration、根 entry
  build-blocker（→ UM16，非 adaptive 判定）。
- **关联**：45-pkg client-runtime decommission
  （`R-DA-CLIENT-RUNTIME-DECOMMISSION`）是 R-DA 另一子票，blocked-by UM14，
  本 session 未触碰。本票保持 **open**（UM15 自动化模板）。
