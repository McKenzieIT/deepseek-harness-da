# UM13 — 同步 upstream 最新版调查 + 持续 merge 协助机制

**Type**: research (AFK) · **Status**: open · **Phase**: upstream-merge
**Surfaced**: 2026-09-08，由 build:official 根 entry 阻塞的根因调查触发（发现 fork merge 的 upstream `d347e703` 已落后最新 449 commit）。

## Question

fork 当前同步到 upstream `d347e703`（2026-09-04，0.1.3-alpha.1 release），但 upstream 已到 `c389f96bf3`（2026-09-08），**落后 449 commit**。本票调查：如何把 fork re-sync 到 upstream 最新版，以及设计一个持续保持同步的机制。

待查：
1. **re-sync mechanics**：`d347e703 → c389f96bf3` 的 re-merge 流程；449 commit 主要动什么（已知 `tsconfig.base.json` Aug13→d347e703 改 382 行；desktop/electron 新包 `apps/desktop`、`apps/desktop-host`；agent/subagent/webhook 一批改进）。
2. **conflict landscape**：449 commit 哪些会跟 fork 的 merge 状态（`6b7610d45a` vs pure `d347e703`）冲突？重点 build-critical（`tsconfig.*`、`tsdown.config.ts`、`scripts/build.ts`、`packages/typert/generator`）+ fork data-agent 包。（并行 subagent 评估中 → `.tmp/upstream-resync-conflicts.md`）
3. **cadence/approach**：一次性大 re-merge vs 增量；fork additive-only data-agent 层与 upstream 449 改动如何共存。
4. **build-blocker 交互**：build:official 根 entry 阻塞是 upstream 共享当前 breakage（re-sync 修不了——见下 Known facts）。fix-then-resync vs resync-then-fix 的 sequencing。
5. **durable mechanism**（fog，待 sharp 后可能分拆为独立 design 票）：持续保持 fork 与 upstream 同步——staleness 检测（fork merge 9/4、upstream 9/8 已 +449，缺告警）、周期性 sync、merge 协助 workflow。

## Known facts (2026-09-08 根因调查，已逐条 git 核实)

- 449 behind：`git log --oneline d347e703..upstream/master` = 449 commits。
- 根 entry `lib/types/{index,invariant,startup}.js` 在 upstream 最新版（`c389f96bf3`）**未改**（449 只改 `tsdown.config.ts` 的 workspace glob 加 desktop 包）。
- typert plugin/generator/`scripts/build.ts` 在 `d347e703..upstream/master` **未变**（plugin diff 空；generator 只 release 版本号 bump；build.ts 空）。
- tsdown 版本 fork↔upstream 都是 `0.22.2`。
- upstream master CI **自 8/13 起没再绿**（之后全 Dependabot 极简 run；8/13 CI run failure 0s）。`release.yml` (build:official) 最后绿 8/13（`47f943859b`）；`e2e.yml` 8/13 failure（缺 `DEEPSEEK_API_KEY`，红鲱鱼，未跑到 build）。
- 8/13（`47f943859b`，**已有**根 entry `{index,invariant,startup}`）release 绿 → 根 entry 8/13 可满足。
- 8/13→d347e703（9/4）upstream 大改破了根 entry 满足：`scripts/build.ts`（build:official）新建；`tsconfig.base.json` 改 382 行；`tsconfig.host.json` 改 66 行；typert `analyzer.ts` 72 行、`workspace.ts` 26 行；**`15f2997bcb cleanup: omit unneeded invariant companions` 删了一批包的 `src/invariant.ts`** + 删了 generator 自己的 `src/invariant.ts`。
- **结论**：build:official 根 entry 阻塞是 upstream 共享的当前 breakage；re-sync 到最新**修不了**；fix 必须 fork 本地做（正当——补 upstream 自己的破，可推回 upstream）。

## Conflict landscape (verified 2026-09-08)

Re-sync `6b7610d45a`（fork merge）→ `c389f96bf3`（upstream latest），merge-base `d347e703`。一个文件冲突当且仅当 fork 和 upstream 都改了它（vs base）。

| metric | value | 核对 |
|---|---|---|
| fork-diverged files（`git diff --name-only d347e703..6b7610d45a`）| **2988** | ✓ |
| upstream-touched unique（`git log --name-only d347e703..upstream/master`）| **4567** | ✓ |
| conflict candidates ∩（`comm -12`）| **57** | ✓ |
| 其中 7 artifact（0 real upstream commits：`knip.json`、`vitest.config.ts`、`packages/examples/{agent-spine-demo,jsonrpc-demo}/*`）→ **实冲突 50** | | ✓ |

按类：
- **build-critical 3**（全 real、高风险）— `tsconfig.host.json`（upstream 15↑，fork 66 ins/1 del，**最高风险**）、`tsconfig.client.json`（5↑，fork 7 ins）、`tsconfig.base.json`（4↑，fork 114 ins/1 del）。
- **data-agent 0**（`packages/data/**`、`packages/bundle/data-agent/**`）— fork-only，upstream 不碰 → re-sync 不跟 data-agent 自家包冲突。✓
- **docs 3**（低风险）。
- **其他 ~47**（source/tests/scripts/CI/package.json）。

upstream churn 最高冲突点（`git rev-list --count d347e703..upstream/master -- <file>`，已核）：
- `packages/extensions/tool-cordis/src/api-catalog.ts` **41↑**（cordis API catalog，data-agent 重度用 cordis → 需细 merge）
- `scripts/gen-cordis-catalog.ts` **28↑**（catalog 生成器，task #4 regen 关切）
- `package.json`（root）**20↑**、`tsconfig.host.json` 15↑、`.github/workflows/ci.yml` 14↑（UM2 resolved）、subprocess/subagent/bash-sandbox spec 13↑、`packages/core/agent-loop/src/index.ts` 9↑（fork GA-GT1 改过 + 刚 fix await 的 zone）、`packages/boot/app-boot/src/index.ts` 9↑、`apps/cli/package.json` 9↑、`pnpm-workspace.yaml` 7↑。

**含义**：re-sync 冲突面**小且可行**（50 个 real 文件，不是 449-commit 墙）；最高风险 = 3 个 root tsconfig + cordis-catalog/api-catalog；data-agent 自家包不冲突。详见 `.tmp/upstream-resync-conflicts.md`。

## 449 content + data-agent impact (verified 2026-09-08)

类型：fix(130)/test(76)/docs(37)/feat(25)/refactor(20)/ci(10)/perf(8)/chore(8)/revert(2)/release(1)，~130 merge。最大子系统：subprocess(122, native containment)、session(~30)、web/sidebar(25)、agent-loop(9)、desktop/electron(~12)。

**对 data-agent 5 seam 影响（已 git 核）**：
- **seam 3 BREAK (HIGH)**：`packages/client/connection` — `inject ['webServer','credentials']→['credentials']`（webServer 改 lazy）；client 公开导出 `ConnectionConfig→ConnectionRecoveryConfig` 改名（新 `recovery-config.ts` + `__DSH_CONNECTION_RECOVERY__` page global）。fork 若 import `ConnectionConfig` 或用旧 inject 注册 connection → 破。
- **seam 4 BREAK (MEDIUM-HIGH)**：`packages/client/modules` — `DshClientDeclaration→DshClientManifest`（从新 `@deepseek-ai/dsh-package-manifest`，commit 4d56cbc3d3 集中 manifest 类型）；`ClientModuleRegistry.inject ['webServer','loader']→['loader']`。fork client-modules 用法需迁。
- **seam 2+5 ADAPT (MEDIUM, additive)**：NEW `packages/api/workspace-files`（dual-face file API，4ce4f0bac4）+ `workspaceFilesRemote` 挂进 api-remotes client assembly。fork UM4 @Remote assembly 需加这个新 remote（dep + tsconfig alias + mount-loop）。**对做取数/文件的 data-agent 是该采纳的增强**。
- **seam 1 (LOW)**：bundle composition 40 commit，但都是 cordis.patch.yml + dep，additive，data-agent bundle 独立不撞。
- **config MERGE (MEDIUM, additive 无碰撞)**：`tsconfig.base.json` +11 新 path-alias（dockkit/sidebar-*/resources/workspace-files/package-manifest 等），**不撞 fork UM8 的 data-agent/zombie alias**（fork 的 `dsh-*` glob 让位 specific alias）；`tsconfig.host/client.json` 加新 include/ref（desktop/benchmarks/workspace-files/package-manifest）。

**其他**：
- `packages/data/**` + `packages/bundle/data-agent`：upstream **0 overlap**（fork-only，不冲突）。✓
- zombie `packages/client/runtime`：upstream 449 **0 commit**，base + latest 都 absent（fork-only zombie shim）→ R-DA-CLIENT-RUNTIME-DECOMMISSION 全 fork-internal，re-sync 无交互。
- 3 named commits（`64a963da0b` TypeRT / `4f00a8b82a` ApiProxy / `15f2997bcb` invariant-cleanup）**都在 base d347e703 之前**，不在 449 → build-blocker 根 entry（15f2997bcb 引入）在 base 里（fork 已有），449 没修也没碰。TypeRT 存活部分（`packages/api/gateway` + `packages/client/connection/src/{rpc,rpc-host}.ts`）stable。

详见 `.tmp/upstream-449-impact.md`。

## Sequencing recommendation (2026-09-08)

build-blocker 根 entry 阻塞：upstream-shared（base + latest 都有，449 没修），fix 必须 fork 本地动 `tsdown.config.ts`/`tsconfig`。而 `tsconfig.host.json`（15↑）+ `tsconfig.base/client.json` 正是 re-sync 最高风险的 3 个 build-critical 文件。

- **fix-then-resync**：先在 d347e703 base 上 fix 根 entry（动 tsdown.config.ts + tsconfig.host.json），再 re-sync → re-sync 在**刚 fix 过的 tsconfig.host.json** 上撞 15↑ upstream → churn/rework。**不推荐**。
- **resync-then-fix（推荐）**：先 re-sync 到 latest（解 50 conflict + 迁 seam 3/4 break + 采纳 workspace-files + merge 3 tsconfig），再在 synced base 上 fix 根 entry（fork-local，可对 latest upstreamable）。fix 是最后一步，不跟 re-sync 抢 tsconfig。但 re-sync 是大工程（449 commit、2 break 迁移、1 新 seam 采纳）。
- **decouple（推荐落地）**：本 session 的 UM11 PR 就 ship d347e703 merge + tsc fix（+ pnpm-lock sync），build:official-green 作为列出的 follow-up（upstream-shared breakage + re-sync sequencing）。re-sync（UM13）+ 根 entry fix 作为 separate、更大的 dedicated effort，走 resync-then-fix。

## Research agenda

- [DONE 2026-09-08, verified] conflict assessment → `.tmp/upstream-resync-conflicts.md`（见上 §Conflict landscape）
- [DONE 2026-09-08, verified] 449 content + data-agent impact → `.tmp/upstream-449-impact.md`（见上 §449 content + impact）
- cadence + data-agent 共存分析（部分：seam 影响已查；cadence/frequency 待定）
- fix-then-resync vs resync-then-fix sequencing → **见上 §Sequencing recommendation**（推荐 resync-then-fix + decouple UM11 PR）
- durable mechanism design（fog → 可能分拆独立 grilling/design 票）

## Out of scope (本票)

- 实际执行 re-merge（re-sync 决策后的 task 票）
- build:official 根 entry fix 本身（fork-local，当前 build blocker task #1；机制确认后可单开 UM-build 票）

## Resolution

(research DONE 2026-09-08：conflict landscape + 449 impact + sequencing recommendation 均已核实并写入本票。下一步 = 用户定 sequencing：decouple UM11 PR now + resync-then-fix as separate effort，或别的。durable mechanism design 仍 fog。)
