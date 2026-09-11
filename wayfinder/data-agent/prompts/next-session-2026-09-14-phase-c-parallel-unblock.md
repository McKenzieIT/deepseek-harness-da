# Next-session prompt — UM-flow Phase C 并行推进：UM12 frontier + 4 张 unblocked 票（subagent 并行）

> 承接 `next-session-2026-09-13-phase-2-push.md`（线 A 已 **resolved**：UM10 + UM16 双关，resync tip `ecaa56c848`，master tip `cc9fc6623e`）。本 prompt **自洽**，next session 据此独立执行。
> **本 session 主轴 = 用 subagent 并行吃掉 5 张 unblocked 票**，而不是线性跑 gate。线 A 已证明「串行跑 gate」一个 session 只够做一票。

## 一、决策历史（前提，勿再重决）

- **Phase A/B 全 resolved**：UM13 ✓、UM14 ✓（synced base `8112743d69`）、UM-ARCH ✓（`038d8b51ce`）、UM-CORDIS-REGEN ✓partial（子任务 3 deferred，blocked by `RootOwnerProps` homing）、UM16 ✓、R-DA Phase-1+2 ✓、R-DA-UI-PRESENTER-COMPOSITION ✓（Plan B + ADR-0002 addendum `ChatSnapshot.legacy` ③'）。
- **UM10 resolved（2026-09-10）**：`build:official` **GREEN**；client tsc 实为 1 非 0（`eb9e4cf05c` 自引，已修）；`check:ci:static` **23 passed/22 failed**；full lint 93 errors 判 pre-existing。
- **UM16 resolved**：原记 325 apiproxy-removal errors 已全清，唯一残留是那 1 个 spec 错误。
- **blocking 环已解**：UM12 header 原写 `Blocked by: UM11`，与 UM11 的 `Blocked by: UM10+UM12` 互锁。以 flow doc `UM10 → UM12 → UM11` 为准。**UM12 = 当前 frontier**。
- **A23 unblocked**：原阻塞的 9 个并行 session worktree 实测现存 **0**。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，tip **`ecaa56c848`**，**unpushed**，tracked 改动 0 / untracked 84 |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip **`cc9fc6623e`**，ahead origin **30**，**unpushed**，工作树干净 |
| `build:official` | **GREEN**（lib/ 与 dist/ 已是有效产物——**别乱 rebuild，会拖慢所有 gate**） |
| `check:ci:static` | 23 passed / **22 failed**（清单在 UM12 票内，已分四类） |
| full lint | 93 errors + 1 warning（真实源码）；带上 84 个生成物则 1980 |

## 三、⚠ 并行铁律（线 A 踩出来的，违反必返工）

1. **同一棵树里禁止两个 subagent 同时跑 build / `gen-*` / `check:*`**——它们写 `dist/`、`lib/`、`.tsbuildinfo`，并发即互相破坏。线 A 全程被迫串行就是因为这个。
2. **主 session 独占「写操作」**：跑 build / `gen-*` / `git commit` 只能主 session 做，且串行。
3. **subagent 只做只读分析 + 产出精确 patch 方案**（文件 + 行号 + 改法 + 理由），**不自己跑 build、不自己 commit、不自己改文件**。需要真写代码的，给它独立 worktree（`git -C /Users/mckenzie/workspace/dsh-resync worktree add ../dsh-<name> -b <branch>`）。
4. 单个 `verify-*` gate 是只读的，subagent 可以跑；**`gen-*` 是写操作，不可以**。
5. **主 session + subagent 一律强制 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob 均 BLOCKED）。`mcp__local__grep` 不可靠 → 用 `mcp__local__bash` 里的 `grep -rEn`。**`rg` 在这台机器上不存在**。
6. **node v24 强制**：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。**v25.9.0 是系统默认且会 crash tsdown/rolldown + fs-ext**。
7. shell 是 `sh` 不是 bash：**不支持 `<(...)` 进程替换**，别用。
8. **不 push**（UM11 仍 blocked by UM12）。

## 四、方法论铁律（线 A 的两条教训）

- **不要轻信票据/prompt 里记的「已 verified」**。线 A 独立重导才发现 Phase-2 记的「client tsc 144→0」实为 1，且错是 Phase-2 自引。**凡结论要用，就自己重跑一遍。**
- **控制你自己引入的变量**。线 A 为看清 lint 而移开了 84 个生成物，这本身是混杂因子——于是在「移开」和「还原」两种状态各跑一次完整 45 门 matrix，确认失败集合完全一致，才敢说「26 门红是真的」。**任何「修完变绿了」的结论，先问：是不是我自己动的别的东西造成的。**

## 五、并行编排（建议 3 轮）

### 第 1 轮：4 个只读 subagent 并行（互不冲突，都不碰 build）

| # | 票 | 任务 | 交付 |
|---|---|---|---|
| **S1** | [UM-DATA-SRC-DTS-POLLUTION](../tickets/phase-upstream-merge/UM-DATA-SRC-DTS-POLLUTION.md) | **定位产出者**：谁往 `packages/data/{audit,evidence-query,semantic-layer}/src/` 写 `.d.ts`/`.js`？查这 3 包的 `tsconfig.json`（对比同级别正常包的 `outDir: lib/types`）、`tsdown.config.*`、`package.json` scripts、根 `scripts/build.ts`。**不要只给 gitignore 方案** | 产出者定位 + 3 个处置方案取舍 |
| **S2** | [UM4](../tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md) | **修 results-RPC re-home 的尾巴**（= `verify-cordis-config` 红的根因）：`packages/bundle/data-agent/cordis.patch.yml:240` mount 了 `@deepseek-ai/dsh-result-cache/src/remote.ts`，但 bundle `package.json` 只声明 `dsh-result-cache-memory`；`tsconfig.base.json` 缺 `@deepseek-ai/dsh-result-cache/src/*` 映射。**注意包名易混**：`packages/data/result-cache` = `@deepseek-ai/dsh-result-cache`，`packages/client/result-cache` = `@deepseek-ai/dsh-client-result-cache`。另 `apps/cli/tests/profiles/acp/cordis.yml: root must be a Loader entry array` 也在这门里 | 精确 patch（含参照同类 `/src/*` 映射的既有写法，如 `dsh-semantic-layer/src/*`） |
| **S3** | [UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) | **给 13 门「待逐门归因」分诊**：`application entrypoints`/`cordis catalog`/`Cordis inspect catalog`/`config catalog`/`doc graphs`/`markdown links`/`subsystem pages`/`tsconfig paths`/`package README model experience`/`agent note format`/`doc budgets`/`documentation standard tests`/`documentation site checks`。逐门跑 `pnpm run verify-<x>`（只读，可跑）取首条实质诊断，判「regen 可解 / 小修可解 / 大债需单开票 / upstream 共享」 | 13 门分诊表 + 哪些能在本 session 收 |
| **S4** | [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) | **durable 方法设计草案**（纯设计，不写实现）：读 `docs/architecture-graph.md`（UM-ARCH 权威图）+ UM-ADAPT 的 per-shift 判据 5 条 + UM13 的 449-impact 分析。设计 impact analyzer：upstream 更新 → diff 新旧 dsh 图 → 架构移位 → 交叉依赖 → adaptive vs surface → ticket 候选。**必带**线 A 的教训：`verify-architecture-graph` 不在 `check:ci:static` 组内，删包必让它 stale 却无门可抓 → durable 方法须含「包增删触发 regen 清单」+「组外 gate 纳入 sweep」 | 设计草案 + N-behind 告警/cadence/94-conflict-resolution 形式化 |

**S1 与 S3 有轻微耦合**：S1 若建议删掉那 84 个文件，会影响 S3 跑 lint 相关门的读数。**让 S1 只分析不动手**，删除由主 session 在第 2 轮决定。

### 第 2 轮：主 session 串行落地（按 S1–S3 的方案）

1. 先落 **S2 的 UM4 patch** → 跑 `verify-cordis-config` 确认翻绿 → commit。
2. 落 **S1 的 POLLUTION 处置** → 重跑 full lint，确认 1980 → 93（或更低）→ commit。
3. 按 **S3 分诊表**收「regen 可解 / 小修可解」的门，**每门单独 verify 后再 commit**（别攒一个大 commit，出问题无法二分）。
4. 每落一批，重跑 `check:ci:static` 看总数，并 `comm` 比对失败集合，**确认无新增失败**。

### 第 3 轮（可选，看余量）：UM-LINT-TYPEAWARE-CORDIS

[UM-LINT-TYPEAWARE-CORDIS](../tickets/phase-upstream-merge/UM-LINT-TYPEAWARE-CORDIS-false-positives.md) 是 **grilling 票（HITL）**——A/B/C 三方案的取舍需要人来定，**subagent 不能替人拍**。等 POLLUTION 清完（93 条信号变干净）再和用户过一轮。
**先看一眼分支 `fix/lint-noop-assertion-unused-disable`（ahead 53）**——疑与本票同域，可能已有半成品，别重造。

## 六、本 session 不做

- **不 push、不开 PR**（UM11 blocked by UM12）。
- **不删任何分支/worktree**。清理归 UM11 Scope 4-6 + A23，且 ⚠ **5 个 `refactor/p2-*` 分支不可按 ancestry 判删**——Phase-2 是按内容收编（cherry-pick/squash）进 `eb9e4cf05c`，`merge-base --is-ancestor` 一律返回 false，误删会丢工作。逐条判据已在 UM11 票内。
- **不碰 `.worktrees/r10-harness-goodhart` 和 `.worktrees/t1-exec-grader`**——属 evaluation effort，不是本 effort 的。
- **UM6** 仍 blocked by UM4——UM4 收了才动。
- **UM-ADAPT per-shift 收尾** + `UM-CORDIS-REGEN` 子任务 3（blocked by `RootOwnerProps` homing）：本轮不排。
- **map.md 的 U+FFFD**（实测 2 行，Out-of-scope 段记的是 7 行）：明确 out of scope，属 parallel-dev-cleanup，**别猜着改**。

## 七、起手 checklist

1. Read 本 prompt + `tickets/phase-upstream-merge/UM-flow-2026-09-08.md`（尤其末尾 2026-09-10 Phase C 段）+ UM12 票（22 门四类清单）+ UM10 Resolution（证据基线，勿重导）。
2. 核 `ecaa56c848` / `cc9fc6623e` 两 tip + 两树状态（resync：tracked 0 / untracked 84；master：干净）。
3. 确认 `PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
4. **起 4 个 subagent（S1–S4）并行**，每个都要在 prompt 里带上第三节的并行铁律（尤其「只读、不 build、不 commit」）。
5. 收齐后主 session 串行落地（第 2 轮），每步单独 verify + commit。
6. 每票收口后更新其 Resolution + map Decisions-so-far + UM-flow overview。
7. 目标：`check:ci:static` 22 failed 显著下降 + UM4 收口 + POLLUTION 收口 + UM15 有设计草案；UM12 逼近「非回归可 PR」状态。
