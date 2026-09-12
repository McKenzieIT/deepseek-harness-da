# UM-ADAPT — 逐 upstream 架构移位做 adaptive-vs-surface 分析

**Type**: research · **Status**: **resolved**（2026-09-12；见文末 Resolution 的 8 移位判定表：1 已 land + 5 already-aligned + 1 out-of-scope + 2 归他票；**零新票毕业**）· **Phase**: upstream-merge
**Assignee**: session 2026-09-12 post-uism-apply（done）
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

### [2026-09-12] dsh-rda-admin 内容分析（workflow）+ land/rewrite 决策点

`refactor/rda-admin-lazy-webserver-2026-09-08`（`9ba8638eac`，+102/-16）是**完整、健全的 UM-ADAPT seam 3（lazy webServer carrier）实现**，**未合入**（不在 HEAD `7ad3242d97` 也不在 `origin/master` `be447fc1d0`）。单 commit，`packages/data/admin/src/index.ts` ±35 + `tests/admin.spec.ts` +83 test：
- drops `webServer` from inject array（只剩 `['storageDomain','credentials']` eager）。
- `/admin/api` 路由注册移进嵌套 `ctx.inject(['webServer'], webCtx => webCtx.effect(() => registerRoutes(webCtx, domain, identityService, defaultTenantId), 'admin: routes'))`（domain-open effect 内），路由仅在 async domain open 后 + 有 webServer 时注册（fail-closed 保）。
- domain/identityService 提为 const-in-effect（外层 let 在 dispose 时 reset 破坏 TS narrowing）。
- 路由 disposal 绑 webServer carrier fiber（Cordis LIFO 保 routes-then-domain 顺序）。
- 行为保持（data-agent 总有 webServer，路由仍注册）+ 允许 no-webServer 优雅加载。tests 验 inject 不含 webServer + 无 webServer 也能 open domain + 有则注册 `/admin/api`。scope 仅 admin（45-pkg client-runtime decommission 是 UM14-blocked 另票）。

**CONFIRMED**：HEAD `packages/data/admin/src/index.ts:141` 仍 `inject = ['storageDomain','credentials','webServer']`（eager）→ **本票「seam 3/4 已落地」在分支层面为假，确认仍成立**。

→ **决策点**（UM-ADAPT 产品决策）：① **land 这条分支**（rescue-as-is，merge `9ba8638eac` 进 resync + tsc/test 验 → 使本票 seam 3 真"已落地"）；或 ② **改写本票为"已分析、实现未合入"**（若决定不 land lazy-webServer）。分支实现健全，倾向 ①。

---

## Resolution（2026-09-12 session · RESOLVED）

**收口形态**：本票职责是「产出 per-shift 判定」，不是「做完所有改造」。8 个移位全部销账 —— 1 个已 land、5 个 already-aligned、1 个 out-of-scope、2 个已归他票。**零新票毕业**（4 个待分析 shift 全为清白负面，没有缺口可开票）。用户 2026-09-12 拍板：① dsh-rda-admin **land**；② 剩余移位「毕业成独立票、本票关闭」——实际无票可毕业，故直接以完整判定表关票。

### per-shift 判定表（8 移位）

| # | 移位 | upstream why | data-agent 当前 | 冲突/对齐 | adaptive 改造 | 去向 |
|---|---|---|---|---|---|---|
| 1 | **seam 3** webServer-lazy / carrier-neutral | webServer 成为 lazy carrier，插件不得 eager 依赖 | ~~`packages/data/admin/src/index.ts:141` eager `inject=['storageDomain','credentials','webServer']`~~ → 已改 `['storageDomain','credentials']` | **真冲突**（da 唯一 eager-webServer 插件，违判据 4「不用 fork workaround 对抗新逻辑」） | **真 adaptive**：路由注册移进嵌套 `ctx.inject(['webServer'],…)`（domain-open effect 内）、disposal 绑 webServer carrier fiber（Cordis LIFO 保序）、domain/identityService 提 const-in-effect | ✅ **已 land** `bdecd11840`（merge `9ba8638eac`）+ doc regen `83be9786e1` |
| 2 | **seam 4** client manifest 集中化 | `DshClientManifest` 集中到 `packages/util/package-manifest/src/types.ts:44`，让外部作者不必依赖 boot/client **实现**取类型 | 7 个 fork client 包全用规范 `dsh.client` 声明 + 各有 tsdown config | **已对齐**（结构性证据，非「编译过」）：本地 manifest interface grep **0 命中**；退役名 `DshClientDeclaration` 全仓 **0 引用**（无僵尸 API）；7 包全落在上游门 `scripts/verify-client-packages.ts:12` glob 内**无法静默绕过**；fork 的 `gen-architecture-graph.ts:79` 用 import/peerDep 扫描建模，**未重实现** `dsh.client` 读取 | **0 文件 0 LOC** —— 该 seam 是**纯 reader 侧**类型集中化（那份 upstream note 明确**拒绝**「统一 JSON parser」），author 侧契约未变 | 无需改造。票里把 seam 4 与 admin 混谈是误置——admin 那条属 seam 3 |
| 3 | **workspace-files** 一等 `@Remote` seam | `packages/api/workspace-files/src/index.ts:168` `WorkspaceFiles extends TypertRemoteService`；给 web client 提供 RPC 读 + `fs.contains` 真实路径围栏（抓 symlink 逃逸）+ per-Agent workspace-root 作用域 | fork fs 用点分 7 组：credentials(`credentials-local:699` atomic 0600)、audit(`audit/store.ts:136` O_EXCL `wx`)、semantic-layer(`io.ts:73-75` temp+rename)、eval persistence、evidence-query、identity/scope-registry(`~/.dsh`)、query 静态资产读；retrieval/embedder **零 fs** | **无冲突，两条结构性理由**：① 该 seam **没有写侧**（`grep write\|mkdir\|unlink` 只出散文；自述「fences writes and edits only」= 它是读）；② fork 目标**全在任何 workspace root 之外**（`~/.dsh`/`$DSH_HOME`/包内资产）→ `confine()` 会以 `workspace-file/outside-workspace` 拒绝 | **零组应采纳**。采纳需先给**上游包加写侧**再**放松 containment** 去够 `~/.dsh`——即削弱该 seam 仅有的两条保证来服务 fork，是改上游不是适配 fork。逐组另有硬理由：credentials 违「凭证不过 transport」原则且 RPC 保不住 atomic+lock+0600、audit 需 O_EXCL、semantic-layer 需 temp+rename 原子性、eval/query 是 host 侧无远端消费者 | 🚫 **OUT OF SCOPE**（写进 map Out of scope）。无门引用它；`grep dsh-api-workspace-files` 在 fork 各包 → 空，唯一命中 `packages/bundle/web-app/package.json:47` 是上游驱动的装配依赖 |
| 4 | **invariant-cleanup**（package-owned companions） | 上游改为每包自持 companion、废 shared invariant | 67 个空 companion + 7 误 peerDep | 已处置 | 4-site apply 使包退出 gate owner 集 | ✅ 已归 [UM-INVARIANT-COMPANION-CLEANUP](UM-INVARIANT-COMPANION-CLEANUP.md)（resolved，`verify-package-invariants` 74→0 门翻绿） |
| 5 | **agent inbox** durable projection（非 service） | inbox 从 Cordis service 改为 driver 自持 durable projection（`packages/core/agent-loop/src/inbox.ts:1,27,74`）；消费者改读 `projections.stateOf(session,'inbox'):190`，**不存在 `ctx.inbox` service** | fork 唯一真消费 = `packages/data/phase-gate/src/phase-gate.ts:809` 走稳定 façade `agent.inject(...)`（调用点 :296/:345/:461）；`headless` 测试已用新 `agent/inbox/spliced` durable 事件 | **已对齐**：façade 稳定 → service→projection 重构对 fork **不可见**。`grep ctx.inbox` 全仓 1 命中且是测试 helper。**零生产代码触 projection registry** | **0 文件 0 LOC** | 无需改造 |
| 6 | **session-format v0→v2** | `SESSION_FORMAT_VERSION=2`（`packages/core/session/src/types.ts:86`）；v0 兼容以**链式迁移**保留（`session-format-catalog/src/generated.ts:15,17` + v0→v1 443 LOC + v1→v2 694 LOC）；legacy flat layout 是拒绝而非读 | fork 只有 bundle manifest 的**包名行**（`bundle/base/cordis.patch.yml:111` 等），无 API 耦合；`bundle/data-agent/cordis.patch.yml` **零** session/persist/projection 行；eval harness 纯内存 format-agnostic（`eval-cli/src/harness-responder.ts:296,341,443`） | **已对齐、零耦合**。`evidence-query:263` / `eval-runner-service:317` 那些 jsonl 是 fork **自己的 eval 结果**，不同命名空间不是 session transcript。`session-persistence-sqlite` **零代码引用**（确认 UM5 干净落地） | **0 文件 0 LOC** | 无需改造（UM3/UM5 已 archived） |
| 7 | **subprocess native containment**（122 commit） | `@deepseek-ai/dsh-sandbox` `confine(argv, policy): ConfinedArgv`（`packages/sandbox/sandbox/src/index.ts:175`）+ local 后端链 bwrap→landlock / seatbelt / windows-acl | fork 4 个 spawn 点：query-maxcompute sidecar(`:291` StdioClientTransport + `scrubbedParentEnv():294`)、data-python(`code-runtime-data-python:221`，`env:{}` 比上游更严)、keychain `execFile('/usr/bin/security')`(`credentials-keychain:170`)、web-app browser opener(`:183`)。**无 Infinity sidecar**（embedder-http 是纯 HTTP） | **已对齐**。**关键事实：containment 是 opt-in argv wrapper，不是 chokepoint**——`ctx.subprocess.spawn:143` 无 policy 参数，`subprocess-local` 里 `grep sandbox\|confine` **零命中**；`confine` 全部调用方只有 bash/pwsh/terminal 三处（跑**模型编写**的 argv）。fork 4 点全是**固定 fork-authored argv**，无 LLM 控制的程序名。**上游自己的 MCP stdio client `mcp-client/src/transport.ts:34` 就是同一模式**（scrubbedParentEnv 无 confine）= 先例。intranet-security-first 未被削弱：单一门是 shell/terminal 路径且它确实 confine；`bundle/data-agent/cordis.patch.yml` 无 sandbox-mode override、无包强制 `danger-full-access` | **无需采纳；强行采纳会弄坏两处**：keychain 需无限制 `/usr/bin/security` + Keychain 访问；sidecar 需到 MaxCompute 的网络出口，而 `SandboxMode` 明说「Network and process visibility are outside this vocabulary」(`sandbox/src/index.ts:26-27`) → confine 它买不到安全还断 `maxcConfigPath` 文件访问 | 无需改造。**非安全事项，不阻塞任何票** |
| 8 | **根 entry build-blocker**（`15f2997bcb`） | build-config 非 seam 移位 | — | — | 不需 adaptive 判定 | ✅ 已归 [UM16](UM16-build-green-on-synced-base.md)（resolved，`build:official` GREEN） |

### seam 3 land 的实测记录

- **pre-merge 四条验证**：`git merge-tree --write-tree HEAD 9ba8638eac` exit 0（tree `47c1e48fba`）；`packages/data/admin/src/index.ts` 自 merge-base `558e6f4f66` 起在 resync 侧**字节未变**（该包这期间只被 UM-INVARIANT 删 `src/invariant.ts` + 改 package.json/tsconfig.json）→ 文本干净合并在此**同时**是语义干净；两侧 `admin.spec.ts` 均**不含** `invariant` 字样（UM-INVARIANT 踩过的坑，专查）。
- **merge** `bdecd11840`（`--no-ff`）→ `inject` 现为 `['storageDomain','credentials']`；**admin vitest 16/16**。
- ⚠ **全量 sweep 抓到 1 个新红**：`check:ci:static` **36 passed / 12 failed**，第 12 个是 **`doc graphs`**——refactor 在 `admin/pat-miss` 事件声明**上方加了 9 行**，令 `docs/event-producer-consumer.md` 记的 `src/index.ts:533` 变 `:542` 而 stale。regen 提交 `83be9786e1`，diff **恰好每 locale 1 行** + 2 个 pair hash（已逐行审）。**这是「改源码必跑全量 sweep」铁律第二次直接抓到东西**（第一次是 UM-UI-SETTINGS apply 漏 3 个 doc-regen stale）；若只跑 admin vitest + tsc 就推，会带一个新红上 CI。
- zh 同步由 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 的 impl（PR #116 落地）自动完成——`gen-doc-graphs: wrote 6 graph doc(s), spliced 1 translated region(s), refreshed 5 pair record(s)`，实证该修复在真实回归上生效。

### 顺带发现（不开票，只落指针）

1. `packages/data/result-cache/package.json` 的 `"./client"` 导出是**死导出**（无 `dsh.client`、无 tsdown config、唯一引用是它自己的模块文档 `src/client/index.ts:10`，且在上游门 glob 之外）→ 喂 [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 的 knip/dead-export 清理，与 seam 4 正交。
2. [UM15](UM15-durable-upstream-sync-method.md) 的 Decision 5「seam-6 stale」**票面文字已过期**：`scripts/gen-architecture-graph.ts:90-92` 现读 `mode:'seam'` + `implementations:['api-workspace-files']`（§5a `f8c0e3abca` 已修）→ 该行可关。

### 未来 re-sync 的复用价值

本票的 5 条 adaptive-vs-surface 判据 + 上面这张表的**问法**（upstream why → da 现状 → 冲突/对齐 → adaptive vs surface → 去向），已被 UM15 首片吸收为 durable method（§2 gate-coverage meta-gate / §3 generator-inputs manifest / §4 三道完整性门 + upstream-status report）。**本票是一次性的**：下次 re-sync 用 UM15 的自动化，不重开本票。

**Status → resolved（2026-09-12）**
