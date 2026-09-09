# Next-session prompt — UM-flow Phase-B 并行推进（AFK 清障批 + 适配性改造主线）

**Session 起始日期**：2026-09-09（或用户认领当日）
**上一 session 交付**：3× 并行验收（UM14/UM-ARCH/R-DA-admin 全 PASS）+ 决策 grill（R-DA 拆 Phase-1/Phase-2，priority 升 HIGH）+ 3 张票落 master（R-DA-CLIENT-RUNTIME-DECOMMISSION 纠正版、R-DA-UI-PRESENTER-COMPOSITION 升级版、新建 UM-CORDIS-REGEN）+ UM-flow 更新反映清障线/适配性改造主线分层。

## ⚠️ 开场纪律（复述后停下等确认再动手）

复述以下三段，打给用户看，STOP，用户确认后再进行动。有偏差请指正。

### 核心主题（不可偏离）

destination = `deepseek-harness-da` → `deepseek-harness-data-agent`。本 flow 聚焦 **upstream-sync 维度** 三大需求，本 session 推进②③：

1. **同步 upstream dsh 最新代码** — UM14 done（synced base `8112743d69`）。
2. **全解冲突 + data-agent 按 dsh 最新逻辑做适配性改造（非小修补）** — 冲突已全解（21 UU + 15 AU + 29 auto，0 unmerged paths）；本 session 推进**适配性改造**：UM-ARCH regen-from-synced（Phase-B-clear）→ UM-ADAPT 逐移位分析 → R-DA-UI-PRESENTER-COMPOSITION grill → R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2 迁移。**UM-ADAPT 5 条判据是守门**（每移位识别 why + 判架构冲突 + 干净 seam 消费 + 不用 fork workaround + 可验证），防"小修补糊弄"。
3. **一套工程方法** — UM15 durable analyzer 的形态（blocked-by UM-ARCH + UM-ADAPT），本 session 尚不认领 UM15，但 UM-ADAPT 手动一次跑的**分析过程** = UM15 未来的**训练样本**（analyzer 要能自动化的东西）。

### 上 session 关键 grill 结论（用户已确认，直接采用）

- R-DA-CLIENT-RUNTIME-DECOMMISSION 头部数字从 **45→7 包/29 文件**（2026-09-09 subagent 全仓 grep 修正）。
- R-DA 拆两相：**Phase-1** = AFK-safe（3 trivial 包迁移 + 删 zombie 冗余 `'root'` 声明 + 删死 apiproxy tsconfig ref）；**Phase-2** = adaptive（4 presenter 迁移 + boot wiring 重分布 + zombie 包删除），**blocked by R-DA-UI-PRESENTER-COMPOSITION**。
- Phase-1 **不违反**"小修补糊弄"警告——它是**完成** 7 消费者中 3 个 + **删除** fork-only 冗余，不是加 shim 让 zombie 苟活。
- R-DA-UI-PRESENTER-COMPOSITION 从 MEDIUM→HIGH：它是**4 presenter 适配性改造的设计闸门**，非"nice-to-have post-merge refactor"。

### 本 session 推进的两条平行线

**清障线（Phase-B-clear，AFK 并行批）** — 6 个 subagent 并行；不做设计决策，只清障：

| # | 任务 | worktree | 分支（from） | scope | subagent 类型 |
|---|---|---|---|---|---|
| 1 | UM-ARCH regen-from-synced | 新建 `../dsh-arch-regen` | `chore/um-arch-regen-2026-09-09`（from `upstream/resync-2026-09-08`）| 从 synced base 8112743d69 rebase/merge `dsh-arch` 的生成器，跑 `pnpm run gen-architecture-graph` + verify `--check`，产出 seam-6 workspace-files `pending`→实的权威图；PR 已合并 doc | general-purpose |
| 2 | R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1 | 新建 `../dsh-rda-p1` | `refactor/rda-client-runtime-phase1-2026-09-09`（from `upstream/resync-2026-09-08`）| 3 个 trivial 包 zombie-free（`result-cache` / `ui-context-layer` / `ui-settings-models`）+ 删 zombie 内 `slots.ts:41` 冗余 `'root'` 声明 + 删 `tsconfig.json:20` 死 apiproxy ref。每包跑 vitest/tsc verify | general-purpose |
| 3 | UM-CORDIS-REGEN 子任务 1+2 | 新建 `../dsh-cordis` | `task/um-cordis-regen-2026-09-09`（from `upstream/resync-2026-09-08`）| result-cache/remote.ts:74 typert surface fix（约束 unconstrained-unknown）+ `gen-cordis-api` regen；子任务 3（gen-client-catalog）**等**任务 2 完成后跑（主 session 串行触发） | general-purpose |
| 4 | UM16 root-entry 调查+修 | 新建 `../dsh-um16` | `task/um16-root-entry-2026-09-09`（from `upstream/resync-2026-09-08`）| 坐实 tsdown entry glob AND/OR 语义 + 8/13 anomaly + 修法（置空根 entry / 改默认 / 给继承子包各自 tsdown.config）+ 修 masked 子包 emit + build:official green verify | general-purpose |
| 5 | UM1-9 归档 triage | 主 session 内 read-only（无 worktree）| — | 逐张 UM1-9 核对 vs 现状，标 resolved-by-upstream / fold 进 UM10/12 / archive；不动 UM4（apiproxy re-home 仍是 R-DA-* + Phase-2 的活）；产出批量票 status 更新 patch 给主 session apply | Explore |
| 6 | UM-ADAPT per-shift 分析（分片 1/N） | 主 session 内 read-only（无 worktree）| — | UM-ADAPT 移位清单里的**每个移位一个 subagent**——建议先 fire 3-5 个可**独立分析**的移位（seam 3 webServer-lazy / seam 4 manifest / workspace-files first-class / invariant-cleanup / subprocess containment）；每 subagent 产出 per-shift 表（why / data-agent 当前 / 冲突 / adaptive 改造 / 喂给哪个票）；主 session 合成 | general-purpose × 3-5 |

**适配性改造主线（Phase-B-adapt，序列化，本 session 推进决策部分）** — 6 号 UM-ADAPT 分片跑完合成后：

7. **R-DA-UI-PRESENTER-COMPOSITION grill**（主 session HITL，用户+Claude）—— UM-ADAPT seam-4 + view-registry seam 判定出来后，用它作证据 grill A（view-registry）vs B（keep-standalone）；预期 A（真适配性改造）。**本 session 应力争达到 grill 定稿**——不落定则 Phase-2 全 block。
8. **R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-2 认领**（后续 session）—— grill 定稿后另开 session 执行 4 packge 迁移。**不放本 session**（太大、认领太重、需 QA）。

**PR 分开处理**：
- **R-DA-admin**：本 session 开头就开 PR（上 session 验收 5 PASS，vitest 16/16，独立干净）——`gh pr create --head refactor/rda-admin-lazy-webserver-2026-09-08`。
- **UM-ARCH**：任务 1（regen-from-synced）落 commit 后开 PR。
- **R-DA Phase-1 / UM-CORDIS-REGEN / UM16**：Phase C 才 PR（UM11 批量走），本 session 内不 PR。

## 主 session 合成 + 补漏 / 决策

- 读 6 份 subagent 输出（各自写 `.tmp/next-<n>.md`，<15KB）+ **重导关键断言**（不采信 subagent 输出，主 session 用 `mcp__local__*` 重跑关键 verify——tsc / vitest / gen --check / gh pr list）。
- **决策集中在 R-DA-UI-PRESENTER-COMPOSITION grill**（任务 7）——若 UM-ADAPT 分片给出充分证据，本 session 完成 grill；否则记录哪些证据缺失，等下 session 补齐。
- **有 gap → 补**：R-DA Phase-1 若 3 个 trivial 包哪个卡住（新 import 路径未 export 等），主 session 补；UM-CORDIS-REGEN 子任务 1 若 typert 修不掉（unconstrained-unknown 是深结构不是 surface），标 UNCLEAR 留决策；UM16 若根因不是想的那样（tsdown entry glob 语义有反直觉），main-session grill。
- **无 gap** → 状态卡：Phase-B-clear 完成度 X/4，Phase-B-adapt 决策进度 Y%。

## 环境 & 纪律

- 主仓 `/Users/mckenzie/workspace/deepseek-harness-da`（master `4dfaa6e008`，含本 session 落的 3 张纠正票 + UM-flow update）。
- Session A 的 `dsh-resync` worktree（`upstream/resync-2026-09-08` @ `2ec25f74f1`）仍在——新 worktree（任务 1-4）都从该 branch 起。
- **主 session 强制用 mcp__local__* 工具**（built-in Read/Bash/Grep/Glob 全 BLOCKED）；subagent 也须用 `mcp__local__*`——每个 subagent prompt 里明确说。
- gh 已 auth McKenzieIT。
- 每 subagent 返回 ONE 行 + 详细写 `.tmp/next-<n>.md`（<15KB）；主 session 只读文件 + 重导，不吸取 subagent 的中间产物到 context。
- **提交纪律**：subagent 若跑代码要落 commit，标 `[R-DA-P1]` / `[UM-CORDIS]` / `[UM16]` / `[UM-ARCH-regen]` 前缀；每 subagent 独立 commit，不 mixed；不主动 PR（除 UM-ARCH regen 任务 1 里主 session 显式让 subagent 开）。
- **CLAUDE.md 铁律**：subagent 报告 = **未验证断言**；主 session 至少重导 1 条关键断言才进产物。

## 下一 session 认领时的自检清单

- [ ] 复述三大主题（destination / 需求②③ / 上 session 结论）
- [ ] 用户 OK 后 fire 6 subagent（1-4 并行；5、6 并行 read-only）
- [ ] R-DA-admin PR 开出（gh pr create）
- [ ] 6 subagent 全回后逐条重导 → 决定 gap 补 / 状态 update
- [ ] 若 UM-ADAPT 分片证据够 → R-DA-UI-PRESENTER-COMPOSITION grill（HITL 主 session）
- [ ] 更新 map.md（Decisions so far 加 R-DA Phase-1 / UM-CORDIS-REGEN / UM-ARCH-regen 结果；若 grill 落定加 R-DA-UI-PRESENTER-COMPOSITION 结果）
