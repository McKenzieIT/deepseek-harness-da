# UM15 — durable upstream-sync 工程方法

**Type**: grilling→prototype · **Status**: open · **Phase**: upstream-merge
**Blocking**: PR #130 final push, CI confirmation, merge, and branch cleanup
**Serves**: demand ③——后续每次 upstream 更新快速定位"哪里要变"+ 生成新票
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase C，可与验证/PR 并行）

## Question

设计 + 建一套可复用工程方法，让后续 upstream dsh 每次更新都能快速知道 data-agent 哪里要变 + 生成新票。= 这次手动跑的 Track A+C（conflict + impact 评估）+ UM-ADAPT（adaptive 判定）的**自动化 + 流程化**。

## 组件

1. **staleness 检测**：记 fork 最后 merge 的 upstream-SHA（git note / 文件），定期/demand diff `upstream/master` latest → "N commits behind" 告警（这次 merge 9/4、upstream 9/8 已 +449，缺告警才发现晚了）。
2. **change-impact analyzer**（自动化 Track A+C，reason over UM-ARCH 图）：给定 upstream 自上次 sync 的新 commit，产出 ①conflict-overlap（fork 改过的 ∩ upstream 改过的）②seam-impact（5 seams 各被几个 commit 碰、break/采纳）③data-agent 包 overlap（应 0）④**架构移位 + adaptive vs surface 判定**（自动 UM-ADAPT）。
3. **ticket-generation workflow**：impact report → 毕业成 wayfinder 票候选（"迁 seam X break"、"采纳新 seam Y"、"解 conflict Z"、"regen cordis"），人确认后建票。
4. **cadence**：何时 sync（on upstream release / 周期 / on-demand）——grilling 定。
5. **merge-assistance 纪律**：把这次 merge session 的 94-conflict-resolution 纪律（accept-upstream vs keep-fork vs merge、additive-only、UM1-9 那套）形式化作执行手册。

## Deliver

①design doc（grilling 定 cadence + workflow）②tooling（prototype：staleness + impact-analyzer 脚本，自动化 Track A+C）③process 文档（merge 手册 + ticket-gen 模板）。

## Resolution

### [2026-09-10 Phase C 并行] 设计草案已落盘,首片已选定,仍需 grilling 定其余 7 项

**S4 subagent 交了覆盖全部 6 块的完整设计草案**,主 session 已原样落盘到 [`research/um15-durable-sync-design-2026-09-10.md`](../../research/um15-durable-sync-design-2026-09-10.md)（69KB，含 §1 staleness / §2 change-impact analyzer / §3 ticket generation / §4 cadence / §5 merge manual / §6 regen 清单 + meta-gate + §2.4.bis merge 完整性门）。

**草案里每条 `file:line` 引用 S4 自称已读,但主 session 仅复核了其中与 UM12/UM-MERGE-INTEGRITY 交叉的几条**(`verify-architecture-graph` 组外盲区、`core.symlinks=false`、merge 双向有损)。落地实现前需按本票 Scope 逐条验。

#### 用户已定 = Decision 7 = (b):首片做 §1 + §6(staleness + regen 清单 + meta-gate)

理由(来自草案):§6 防的是**已经发生过的**失败 —— `verify-architecture-graph` 组外盲区让删包必然 stale 却无门可抓,Phase-2 删 `client/runtime` 就是这么漏的。它最便宜,且首片天然包含把 `run-gates.ts` 里重复三份的 mode 列表收成一个导出 `MODES` 数组这个前置(meta-gate 的正确性才结构化而非 aspirational)。

附带产出:把 `docs/da-upstream-debt.md` 升级成持久的 d5 bucket 表(§5.3),因为下一次 sync 会消费它。

#### 仍需 grilling(人定,subagent 不能替)的 7 项

| # | 决策 | 草案推荐 | 为什么需要人 |
|---|---|---|---|
| 1 | staleness detector 跑哪 | (c) 先 local,UM12 出基线后再加 cron | 加第一个 `schedule:` workflow 到一个 19/45 静态红的 repo 是判断题 |
| 2 | cadence | (d)+(b) 周检 + 批量会话 | 阈值(150 commits / 14 days / seam>0 硬触发)是校准题 |
| 3 | synced-SHA 记录格式 | (b) tracked `upstream-sync.json` + gate | git notes vs 文件 vs 纯 merge-base 的取舍 |
| 4 | analyzer 怎么取任意 upstream revision 的架构图 | (b) 默认走 upstream 自带的生成物 diff + export-surface diff;`--rev` 作 `--deep` opt-in | (a) `gen-architecture-graph --rev` 能否不 `pnpm install` 跑 —— **未验证**,Decision 4 依赖它,落地前需 spike |
| 5 | 先修 `SEAM_MANIFEST` seam-6 | (a) 本票带 | 一行 manifest edit + regen;否则 analyzer 从图读 seam 会看到 workspace-files 不存在 |
| 6 | meta-gate day-one 能不能红 | (a) 先 enroll `verify-architecture-graph` + `verify-third-party-notices` 再落地 meta-gate | 拒绝 warn-only(会教所有人忽略它) |
| 8 | impact report 落哪 | `wayfinder/data-agent/research/upstream-impact-<BASE>..<NEW>-<date>.md` | 需确认 `tickets/README.md`(paired)不被误触 i18n 义务 |

**草案里被证伪的两条 §7 承诺**(必改,否则 durable 方法建立在假前提上):
1. `docs/da-plugin-development-guidelines.md:262` §7 承诺「daily automated merge / 24h SLA」—— **根本不存在**(全仓 0 个 `schedule:` workflow,两次 merge 是 9/8 手发的,间隔 5.5 小时)。
2. 同 §7 承诺「冲突只发生在构建接线文件」—— **实测为假**:41 个重叠里 9 个是 dsh 自有 `src/`,`docs/da-upstream-debt.md` §1 也记了 3 个 HIGH 项是 fork 改 dsh 源码。

#### 主 session 补的 §2.4.bis(草案原缺)

S4 原草案没有「merge 完整性门」一节。主 session 在 [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 发现:**`tsc` 绿 ≠ merge 无损** —— 2026-09-07 merge 既丢 upstream 文件、又复活已删包,两个方向都逃过编译器(丢的文件没有 fork 侧 importer;多的包能独立编译),所以 `build:official` 绿对 merge 完整性**什么都没证明**。

durable 方法须含一道**纯 git plumbing 的 merge 完整性 gate**,与「gate 是否变红」正交:
- **upstream 删除应用检查**:对每个「upstream 在窗口内删除的路径」,断言 merge 后该路径不存在(除非有显式 keep-fork 豁免记录)。
- **upstream 文件保留检查**:对每个「upstream 在窗口内存在且未删除的路径」,断言 merge 后仍存在(除非有显式 fork-drop 豁免记录)。

两者都不需要构建,且**恰好抓住编译器结构上抓不到的那一类损失**。已写进 [`research/um15-durable-sync-design-2026-09-10.md`](../../research/um15-durable-sync-design-2026-09-10.md) §2.4.bis。

**→ 本票状态:设计草案已落盘,首片(§1+§6)已选定,但 7 项 grilling 未过、实现未写。仍 open。**

### [2026-09-14 Phase C 第二轮] S2 交了首片实现方案,但传输中丢失主体;§6 spike 收口 Decision 4;新增两条 durable-method 输入

**S2 subagent（只读分析,产出可 verbatim 应用的实现方案）跑了完整 §1–§8**,但**最终消息在 task-notification 里被从开头截断**——通知里只到 §4.5 起句。完整文本在一个 runner 侧 transcript 文件里,而本环境所有文件工具（`mcp__local__*`）只跑在用户 Mac 上,**够不着 runner 侧 `/tmp`**。一个被派去持久化的 subagent 正确诊断了这个 split-brain 并拒绝编造 patch。

**保住的（散文,自包含）已落盘** [`research/um15-first-slice-implementation-2026-09-14.md`](../../research/um15-first-slice-implementation-2026-09-14.md)：§6（Decision 4 spike）、§7（11 条未核项清单）、§8（落地顺序）+ §4.5/§4.6 两脚本的设计摘要 + §5 接线要点。

**丢的（首片主体代码）**：§1（`run-gates.ts` MODES 重构）、§2（`verify-gate-coverage.ts` meta-gate + manifest + spec）、§3（`generator-inputs.manifest.json` + spec）、§4.1–§4.4（核心 `upstream-sync-record.ts` 模块 + 初始 `upstream-sync.json` 真实内容）。**下 session 须重派 S2 只补这四节**——§6 的发现让它别再走 (a) 弯路,§7.2 的 11 条让它落地前逐条验。

#### Decision 4 收口（§6 spike,纯静态读码,未跑但结论硬）

| 问题 | 结论 |
|---|---|
| `gen-architecture-graph --rev` 支持吗 | **不支持**。全文只解析 `--check`（`gen-architecture-graph.ts:415`） |
| 读工作树还是 git 树 | **工作树,root 硬编码**（`:40`）。无任何 git plumbing |
| 加 `--rev` 的隐藏坑 | `collectDeclaredDeps`（`:248`）不收 root 参数、闭包捕获模块级 root → 任何只改 `collectGraphData` 入参的 `--rev` 实现会**静默读 fork 工作树 `package.json`** → 产出混血图,比不生成更危险 |
| 不 install 能跑吗 | **不能**（需 `node_modules/typescript` + 真 `ts.Program`）。但只需 `node_modules`、不需 `build` |
| 草案 (a) 方案本身 | **前提错**：`gen-architecture-graph.ts` 与 `docs/architecture-graph.md` 在 `upstream/master` 与 `c389f96bf3` 上**都不存在**（`git cat-file -e` 逐个确认）→ "checkout 到 upstream rev 跑生成器"根本跑不起来 |

**→ Decision 4 = 采纳 (b)**（默认走 upstream 自带生成物 diff + export-surface diff,不依赖任何未验证前提）。`--deep`/`--rev` 若要做,先①参数化 `collectDeclaredDeps(root,pkgs)` ②`--rev <sha> --into <dir>` = `git archive|tar -x` 到临时目录作 `scanRoot` ③临时目录 install 或 symlink 复用 `node_modules`（后者未验）。**7 项 grilling 的第 4 项由此收口。**

> 主 session 实测 `pnpm run verify-architecture-graph` 本轮是 **GREEN** → §8 落地顺序第 2 步（enroll 该门前确认它今天绿）的前提**成立**。

#### 本轮新增的两条 durable-method 输入（喂回首片设计）

1. **完整性门要三道,不是两道。** 原 §2.4.bis 设计的两道门（upstream 删除应用检查 / upstream 文件保留检查）**都不会抓到 `ui-settings-models` 的整包回退**——因为那 27 个文件在 merge 后**都还在**,只是内容退回了 3 周前（见 [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) Resolution）。须加第三道 **upstream 内容采纳检查**：对每个「fork 未改过（`F==B`）且 upstream 改过（`U!=B`）」的路径,断言 merge 后 `M==U`（除非显式豁免）。这恰好是 fork 无权主张分歧的那批路径,纯 git plumbing。三道门都不需构建,且**恰好覆盖编译器结构上抓不到的三类损失**（删除未应用 / 新增被丢弃 / 修改被回退）。
2. **同仓两个生成器对翻译义务处理不一致。** `gen-module-graph` 写 `.md`/`.zh.md`/`.i18n.yaml` 三件（本轮删僵尸 regen 实测 "3 artifact(s) written",配对债为零）；`gen-doc-graphs` **只写英文** → 任何 regen 都会打破 `translation pairing`（本轮实测 +2 条 sub-failure）。durable 方法的 regen 清单必须把这条形式化：要么让生成器带上 zh,要么把生成文档从配对哈希里豁免。**这是 7 项 grilling 第 8 项（impact report 落哪）的同源问题——凡生成文档都有这个翻译义务冲突。**

#### 7 项 grilling 现状

| # | 决策 | 现状 |
|---|---|---|
| 1 | staleness detector 跑哪 | 仍 open（§1 代码丢失,Direction (c) local-first 仍推荐） |
| 2 | cadence | 仍 open |
| 3 | synced-SHA 记录格式 | Direction (b) tracked `upstream-sync.json` + gate 确认（§4 设计在丢失的代码里） |
| 4 | analyzer 怎么取任意 upstream rev 的架构图 | **✅ 收口 = (b)**（§6 spike 证伪 (a) 前提） |
| 5 | 先修 `SEAM_MANIFEST` seam-6 | 仍 open（S2 只读 seam-1..4,seam-6 未验,§7.2 第 4 条） |
| 6 | meta-gate day-one 能不能红 | Direction (a) enroll `verify-architecture-graph` 先 确认;§2 实测 enroll 后 day-one 全绿的前提（该门今天 GREEN）成立,但 enroll 代码未落 |
| 8 | impact report 落哪 | 仍 open;且与上面第 2 条 durable-method 输入同源（生成文档的翻译义务） |

**→ 本票状态:首片实现方案已交但主体代码丢失待补;Decision 4 收口;新增两条 durable-method 输入待并回首片设计;7 项 grilling 收口 1 项、推进 2 项、余 4 项仍 open。仍 open。**

### [2026-09-15 第三轮] 首片重派 4 subagent 全成 + §1/enroll 已落 resync

**subagent 环境瞬态故障恢复**：前 5 次（S1' + §1/§2/§3/§4）全死于同一 `API Error: socket connection closed unexpectedly`（22min/85 calls 起步，产出零）。改结构：**逐节派、增量写盘（先骨架后填充）、给已验证锚点减探查调用**。重派 4 个（§1/§2/§3/§4）全成（probe 先验存活）：

| 节 | 交付文件 | 行数 | 关键 |
|---|---|---|---|
| §1 | `research/um15-slice-s1-run-gates-2026-09-15.md` | 613 | 15 锚点全核；3 patch（MODES tuple+isMode+parseMode+exhaustive default）+2 spec patch |
| §2 | `research/um15-slice-s2-gate-coverage-2026-09-15.md` | 638 | 差集 21/65 未登记（UM12 盲区实测版）；20 豁免；⚠ 设计偏差：改文本提取（pnpmInvocation 在 pnpm 外 throw） |
| §3 | `research/um15-slice-s3-generator-inputs-2026-09-15.md` | 508 | 17 生成器输入面全实测；manifest+spec；§6 复核 +2 新发现 |
| §4 | `research/um15-slice-s4-upstream-sync-record-2026-09-15.md` | 1426 | git 层+三道门+upstream-sync.json（waivers 覆盖 129 条 M1 finding）；订正 revert-fork HEAD 残余 6（非 7） |

**已落 resync（2 commit，tsc+vitest+oxlint 全过）**：
- `b3a516fe98` §1：run-gates `MODES` readonly tuple 作单一真源 + `isMode` + `parseMode` + `gatesForMode` exhaustive `default: const _exhaustive: never`（oxlint switch-exhaustiveness-check）。spec `it.each(MODES)`。纯重构，86 vitest 全绿。
- `c579b809d2` §5.2(c) enroll `verify-architecture-graph` 进 `docSyncLeafGates`（Decision 6a；该门 GREEN 但此前未 enrolled，现 enroll 使 §2 meta-gate 不判它未覆盖）。

**未落（在盘 ready，下个 session 主 session apply）**：§2（gate-coverage meta-gate + manifest + spec + 接线；不需 grilling，但 §2 subagent 设计偏差待验）→ §3（generator-inputs manifest+spec；不需 grilling）→ §4（upstream-sync-record git 层 + upstream-sync.json + 2 脚本 + 接线；**需 HITL grilling #2 阈值 / #8 报告路径**）。§5 SEAM_MANIFEST（#5）+ cron（#1）在后。

**7 项 grilling 现状（无变化，4 仍 open）**：#1 staleness 跑哪（c 先 local）/ #2 cadence 阈值（150 commits/14days）/ #5 SEAM_MANIFEST seam-6（a 本票带）/ #8 impact report 落哪。#3/#4/#6 已收口。⚠ §2 manifest 把 verify-third-party-notices 列"pending blind spot"豁免，与 Decision 6a"enroll 两者"有张力——落 §2 时读其豁免理由再定。

**落 §4 前须知**：§4 subagent 代码 tsc/oxlint/vitest **未跑**（§7.2 第 10 条）；git 层是 1426 行未验证代码，apply 后须跑 tsc/oxlint/vitest + 单独跑 `pnpm run upstream-status`。

### [2026-09-16 第四轮] §2/§3/§4 全落 resync + 4 项 grilling 全收口 + §5/PR 待续

**§2/§3/§4 全部落地 resync（4 commit，tsc+oxlint+vitest+gate/report exit 全过）**：

| 节 | commit | 关键 |
|---|---|---|
| §2 gate-coverage | `2eb5b4a850` | meta-gate + 20 豁免 manifest + spec；接线 ciSharedStaticGates + hygieneLeafGates；顺手修 `c579b809d2` 留下的 stale doc-sync 断言（c579b809d2 enroll architecture-graph 后没更新 doc-sync spec 断言；§2 deliverable 在 `12d02c7687` 写，未预见 c579b809d2）|
| §3 generator-inputs | `5536afc99f` | 17 生成器 manifest + spec；修 3 deliverable bug（`$` meta 键会崩 spec、`null ?? ''` 让 toBeNull 失败、`**/*.md` 全仓 glob 改 `<counterpart-files>` sentinel）|
| §4 stage 1 | `cd1e9c37cd` | `upstream-sync-record.ts`（804 行，awk 直抽 deliverable 无转录错）+ `upstream-sync.json`（仓根，阈值 14/150 按 #2）+ `verify-upstream-sync-record` 门 + 接线；修 2 未验证代码 bug（collectWaiverFailures 去重键未闭合模板 `${direction}`→`${direction}:${path}`；historyRaw_length `unknown[]`→`unknown`+Array.isArray 守卫）；**门 exit 0**（记录与 Git 一致；note：upstream ref stale + 1 pending waiver `ui-settings-models/` revert-fork）|
| §4 stage 2 | `3bc809c3ba` | `upstream-status.ts` 报告（永不失败 exit 0）；RefState fresh/stale/unknown；拒绝从 stale ref 推落后计数（防假绿）；thresholds 从 record 读（14/150）；`--no-fetch` 用 ls-remote；impact report 写 `upstream-sync/upstream-impact-<BASE>..<NEW>-<date>.md`（#8）；**read-only subagent 写**（代码到 /tmp，主 session cp+验证；subagent 代码干净零主修）offload context；**report exit 0**（ref stale local `5dda764ed3` ≠ remote `c291e7961a` → behind-count withheld；2 days < 14；1 pending waiver；impact report 写盘）|

**4 项 HITL grilling 全收口（决策锁定）**：

| # | 决策 | 定值 |
|---|---|---|
| 1 | staleness 跑哪 | (c) local 先（+ lefthook pre-push 每次 merge 自报）+ cron 后（UM12 绿基线后加 `schedule:`，UM12 票挂 follow-up）|
| 2 | cadence | 每周查 + 批量 sync session（人）+ threshold **150 commits OR 14 天 OR seam>0** 任一硬触发（以下信息性）|
| 5 | SEAM_MANIFEST seam-6 | (a) 本票带修（§5）：mode pending→seam + implementations→[包短名] + note；regen architecture-graph + 审 diff。seam-6 现状已核：`gen-architecture-graph.ts:89-93` = `mode:'pending'`+`implementations:[]`+note 说"workspace-files dir absent"——但 `packages/api/workspace-files` **现已存在**（UM14 re-sync 回归），故 stale，须修 |
| 8 | impact report 落哪 | `upstream-sync/upstream-impact-<BASE>..<NEW>-<date>.md`（独立顶层目录，不捆绑 wayfinder，无翻译义务——research/ 无 .i18n.yaml 先例；`tickets/README.md` 是 paired 须避误触）；每次 sync 一份 dated |

#3/#4/#6 此前已收口。**7 项 grilling 全收口**（UM15 首片 grilling 阶段完）。

**§4 deliverable 订正**：revert-fork HEAD 残余"7 非 6"是**纯文档错**（§4.0 表说 7）——代码（Gate ③ `findings.push({path, direction:'revert-fork'})` 动态计算）跑门实测正确（6），无须改代码。

**`check:ci:static` 36/11**（gate-coverage 在 ci-static + hygiene 都绿 = +2 passed；11 failed 正是 known A/B/C 集，零新增红）。

**未落（下 session）**：§5 SEAM_MANIFEST seam-6 修（#5）+ lefthook pre-push 挂 staleness 门（#1 local）→ PR（B 类 2 绿 + 2 known-red，描述写明 ui-settings 回退 + known-red 理由 + 大原则 + §2-§5 是 UM15 首片，**不擅自 push**）。

**resync tip `3bc809c3ba`，9 commit unpushed**（`e17f0fa16c`/`d4596863a6`/`12d02c7687`/`b3a516fe98`/`c579b809d2`/`2eb5b4a850`/`5536afc99f`/`cd1e9c37cd`/`3bc809c3ba`）。

### [2026-09-17 第五轮] §5 全落 resync（seam-6 + lefthook pre-push）+ PR 待用户推

**§5 全部落地 resync（2 commit，tsc+oxlint+verify-architecture-graph+verify-upstream-sync-record 全过）**：

| 节 | commit | 关键 |
|---|---|---|
| §5a seam-6 | `f8c0e3abca` | SEAM_MANIFEST seam-6：mode pending→seam、implementations []→['api-workspace-files']、note 更新。短名 = `package.json` name 减 `@deepseek-ai/dsh-` 前缀（自核 `scripts/package-graph.ts` `short: json.name.slice(SCOPE.length)` 派生 + 读 `packages/api/workspace-files/package.json` 实测 = `@deepseek-ai/dsh-api-workspace-files`，交叉核 `api-remotes`）。regen `docs/architecture-graph.md` diff **恰好 1 行**——api-workspace-files 行 seam-role 列 `seam-2`→`seam-6, seam-2`（SEAM_MANIFEST 循环在 emitter 循环前，故 seam-6 排前）。mode/note/title 渲染器不读（仅 `entry.implementations` 在 `buildSeamByPkg` line 274 被读），故无其他 churn；无 .zh.md/.i18n.yaml 触（gen-architecture-graph 只写英文，§3 manifest 证）|
| §5b lefthook pre-push | `0301586bed` | pre-push += 'upstream-sync record consistency' job 跑 `pnpm run verify-upstream-sync-record`（**门非 report**——report 写 impact 文件脏树，门只读，实测跑前跑后 `git status` 一致）。接既有 `no-production-src-on-master`+`typecheck` 后。`lefthook run pre-push` exit 0（三 job 全绿：no-prod 3.17s / typecheck 30.21s / record 6.08s）；lib/+dist/ gitignored 故 build:lib:host 不脏树|

**§四方法论复核（不信记的，自重跑）**：① 不信 prompt 记的「likely `api-workspace-files`」——自读 `package-graph.ts` 确认 `short` 派生 + 读 manifest 实测短名（与推测同，但走核而非信）；② 不信「gen-architecture-graph 重写全文可能大 diff」警告——基线先验 `verify-architecture-graph` GREEN（doc current）再编辑再 regen，diff 实测 1 行（基线 doc 已 current + 仅一 manifest entry 变）；③ 不信「门只读」——跑 `verify-upstream-sync-record` 前后 `git status` 对比证零写；④ pre-commit `lint(staged)` oxlint --fix + whitespace + vendor-manifest 全绿（两 commit 各跑一次）。

**cron follow-up**：Decision #1 cron 半（`schedule:` workflow 跑 `upstream-status`）归 UM12 绿基线后——已在 [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 记 follow-up 防拖。

**UM15 首片（§1-§5 + lefthook）durable method 实现完**：staleness（local pre-push 门 + `upstream-status` report）+ regen 清单（§3 generator-inputs manifest）+ meta-gate（§2 gate-coverage）+ 三道完整性门（§4 upstream-sync-record）+ impact report（§4 stage 2）。7 项 grilling 全收口。**本票仅剩 PR 推送（用户指示后）+ 未来自动化 slice（impact analyzer 全自动化 / ticket-gen workflow）——后者非首片 scope，毕业另开。**

**PR 状态**：resync +2 commit（tip `0301586bed`，共 11 unpushed），B 类 2 绿 + 2 known-red，PR 可推。PR 描述待写明 4 点（ui-settings 整包 M1 回退 ~30 文件 / type-equiv+package-invariants known-red 理由 + 专属票 / 大原则 upstream 不改 / §2-§5 是 UM15 首片 durable method）。**不擅自 push——等用户明确指示**（§六）。resync `0301586bed`、master ahead origin，均 unpushed。

### [2026-09-12] 两条现成输入（来自 UM-ADAPT session）

1. **Decision 5「seam-6 stale」的票面文字已过期，可关那行** —— 本票 §Decision 5 记 seam-6 为 stale/pending，但 §5a（`f8c0e3abca`）早已修掉：`scripts/gen-architecture-graph.ts:90-92` 现读 `mode: 'seam'` + `implementations: ['api-workspace-files']`（`packages/api/workspace-files` 已随 UM14 re-sync 回归）。这是**票面未更新**而非第二个缺陷（read-only 复核确认）。
2. **cadence 触发器已响：上游又前进了** —— push 时 `verify-upstream-sync-record` 报 `upstream tracking ref points at c291e7961a51, but record.current.upstreamSha is c389f96bf3a9 — ref may be stale or record may be behind`。按本票收口的 cadence 决策（**每周 + 批量 session + threshold「150 commits / 14 天 / seam>0 任一硬触发」**），下一步是**量一下 `c389f96bf3a9..c291e7961a51` 的 commit 数与 seam 触及数**，判是否达阈值、启下一轮 re-sync（若达阈值，这就是 UM13/UM14 之后的第三轮）。注意本票 §1 的 MODES 重构 + §3 generator-inputs manifest + §4 三道完整性门都已就位，第三轮应当能直接用上，这也是首次真实检验 durable method 的机会。

### [2026-09-13] UM-C-GATES synthesis 消费 §2 meta-gate — 5 决策就位待接入

[UM-C-GATES](UM-C-GATES-UPSTREAM-NEW.md) 的 Cluster D grilling 完成，5 门决策（含 `verify-config-catalog` 新入账）通过 §2 meta-gate 消费：

| 门 | 决策 | §2 manifest 表现 |
|---|---|---|
| `verify-config-catalog` | FIX + wire CI | GREEN post-apply，不入 exemption |
| `docs/architecture-graph.md` zh emission | FIX + wire CI | GREEN post-apply |
| `documentation standard tests` (2 fails) | WAIVE (fork 特化包 README kinds) | `upstream-sync.json` waiver 引用 → §2 识别不入 exemption |
| `verify-package-dependencies` (75, 87% 同类 pattern) | WAIVE (fork-plugin peer+dev pattern) | `upstream-sync.json` pattern waiver → §2 识别不入 exemption |
| `verify-client-ui-i18n` (83) | KNOWN-RED permanent | §2 manifest permanent-known-red 列表登记，rationale 内联 |

**§2 gate-coverage 已实现（`2eb5b4a850`）足够承载此 5 决策**——不需要重建 contract 草案；orphan-gate 结构性防线已生效。C-class 4 门 2026-09-07 → 2026-09-11 orphan 4 天的模式不会重演。

**§2 后续 CI wiring 首片**：UM-C-GATES 用户批 hybrid 后，触发下一 apply session：（a）FIX 2 门代码工作 → （b）§2 manifest 更新（3 门 WAIVE/KNOWN-RED 登记）→（c）`gen-config-catalog`/`gen-architecture-graph` 的 CI wiring 若已在 `ciSharedStaticGates` 则无变；若未在则 by-decision-add。

---

## [2026-09-13] Phase-1 research → Phase-6 decision-doc (§3 GO + §2 structural gap + §4 DEFERRED)

Source: `wayfinder/data-agent/research/next-session-2026-09-14/um15.json` (high-confidence read-only research). This is the FIRST real-world exercise of the durable method UM15 §1-§5 built (MODES tuple, generator-inputs manifest, three integrity gates, seam-6 fix, lefthook pre-push staleness gate).

### §3 cadence — third-round re-sync trigger: DECISIVE GO

All three thresholds tripped, two enormously:

- **commitCount: 852** (`git rev-list --count c389f96bf3a9..c291e7961a51`) — 5.7× the 150-commitsBehind threshold.
- **seamTouchCount: 79** distinct seam-touching commits; ALL 6 seams > 0 (seam-1 bundle=40, seam-2 api/gateway+remotes=23, seam-3 client/connection=27, seam-4 client/modules=10, seam-5 api/remotes=19, seam-6 api/workspace-files=16). The seam>0 hard-stop fires on all six, including seam-3 (client/connection) at 27 — the exact seam that broke during the last (UM14) sync per SEAM_MANIFEST note + design doc :166.
- **calendarDays: 2** (or 2.90 wall-clock) — below the 14-day threshold, but the formula is OR not AND, so two independent hard-trips already mandate the round.

The 852 commits is far larger than the 449 that motivated the whole staleness detector. A re-sync round is unambiguously warranted.

### Refs (the re-sync window)

- BASE (upstream recorded sync tip) = `c389f96bf3a9b6807cb71ed6bdad5849be0df6d8` (2026-09-08 00:46:19+08:00, = current recorded `upstream-sync.json current.upstreamSha`)
- NEW (upstream tracking ref, target) = `c291e7961a515f6d7af9304e7fd1d257929aef26` (2026-09-10 22:17:09+08:00, = upstream tracking ref that tripped `verify-upstream-sync-record`)
- c389 confirmed ancestor of c291 (`git merge-base --is-ancestor` YES).

### §3 handling this session: COMBAT MAP handoff (bonus workflow), NOT in-session merge

The 3rd re-sync round is a multi-session stateful workload (UM14's 449-commit window was multi-session; this is 1.9×). It is NOT feasible in this session alongside the 5-ticket apply. Handling:

- The GO decision + refs + 6-seam touch evidence is recorded here (this decision-doc).
- A bonus 6-agent read-only seam pre-analysis workflow produced a per-seam combat map (`wayfinder/data-agent/research/next-session-2026-09-14/um15-s3-seam-analysis/`) characterizing each seam's upstream shift, fork collision points, conflict severity, and recommended merge approach. **STATUS: the 6 per-seam JSONs landed; the synthesized `RISK-MAP.md` was authored directly from them (the workflow's writer agent failed on a StructuredOutput schema-call, so the synthesis was done in-session from the raw JSONs). The combat map is complete — 6 raw JSONs + the synthesized RISK-MAP.md, ordered by priorityRank with per-seam breaking-changes/collisions/approach/test-hotspots + a suggested merge sequence (~3.5–5 sessions).**
- The next session starts the actual `git merge` round with this map. The first-live-test framing: this round exercises the durable method end-to-end for the first time.

### §2 — NO manifest edits; the REAL finding is a structural gap

The ticket implied §2 = patch `scripts/gate-coverage.manifest.json` with 5 Cluster D entries. The research found this is UNNECESSARY and the real §2 finding is a structural gap:

- 4 of the 5 Cluster D gates are already ENROLLED in `scripts/run-gates.ts` (config-catalog `:751`, package-dependencies `:305`/`:702`, client-ui-i18n `:313`/`:715`, architecture-graph `:739`). Enrolled+GREEN = fully accounted; adding exemptions would trip Check 3 ('exempted but is now enrolled').
- The 5th (doc-standard-tests) is invoked via `pnpmExec('doc-standard-tests', ['vitest','run','scripts/doc-standard.spec.ts'])` at `run-gates.ts:767` — NOT `pnpmScript`, and NOT a `verify-*`/`gen-*` package.json script — so `verify-gate-coverage.ts` (which only scans `PNPM_SCRIPT_CALL_PATTERN` over `verify-*`/`gen-*` script names) never sees it at all. It is neither coverage-tracked nor known-red-trackable today.
- The generators already carry `coveredBy` exemptions (20 total, unchanged).

**THE STRUCTURAL GAP (the load-bearing §2 finding to record)**: `verify-gate-coverage.ts` is a COVERAGE meta-gate only (enrolled-OR-exempted); it does NOT and CANNOT track KNOWN-RED or WAIVE pass/fail state. The UM-C-GATES/UM15 narrative claim that `verify-client-ui-i18n` was 'registered in a permanent-known-red list' and that WAIVE gates were 'identified via upstream-sync.json waiver cross-reference' describes a schema that was NEVER BUILT. `verify-gate-coverage.ts` has no `knownRed[]` array and no `upstream-sync.json` cross-reference.

Concretely:
- `verify-client-ui-i18n` (83 KNOWN-RED permanent, Cluster D Gate 5, intranet Chinese users) is ENROLLED so the meta-gate considers it 'covered' regardless of pass/fail — its permanent KNOWN-RED status is untrackable by the meta-gate today.
- `doc-standard-tests` (2 KNOWN-RED permanent, the 65-package README skeleton gap, graduated to UM-FORK-README-SKELETON-RETROFIT) is invoked via `pnpmExec` so the meta-gate never sees it at all.

Recording these KNOWN-RED statuses structurally needs a §2 schema extension: add a `knownRed: [{script, rationale, ticket, expiry?}]` array to the manifest + add a Check 4 to `verify-gate-coverage.ts` asserting every known-red entry names an enrolled gate. Draft entry for the FUTURE schema:
```json
{"script":"verify-client-ui-i18n","state":"known-red","rationale":"data-agent client UI targets enterprise intranet Chinese users; i18n extraction is future product-internationalization debt, zero current user value","ticket":"UM-C-GATES-UPSTREAM-NEW","reopenTrigger":"product internationalization"}
```
Until that schema+code lands, the client-ui-i18n + doc-standard KNOWN-RED decisions live in ticket prose + the GA-FORK-CI ledger, NOT in `gate-coverage.manifest.json`.

### §4 — DEFERRED (waiver + known-red expiry; needs schema change + human calibration)

Policy sketch for the THREE integrity-gate waiver kinds in `upstream-sync.json` (keep-fork / drop-fork / revert-fork) plus a parallel known-red-expiry for the §2 meta-gate:

1. **Integrity waivers**: add an optional `expiresAfterSyncs` (int) or `expiresOn` (ISO date) field to the `Waiver` interface in `scripts/upstream-sync-record.ts`. `collectGitFailures` already tracks per-waiver hit counts and already emits a 'matched no finding … stale' NOTE for zero-hit waivers — extend that: a waiver with `decision:'keep'` and expiry set becomes a FAILURE (not a note) once expired OR once it goes zero-hit for N consecutive recorded syncs, forcing re-adjudication. `decision:'drop'` waivers (remediation owed) carry a hard expiry tied to their ticket. `decision:'pending'` waivers get the shortest fuse (pending must not survive >1 sync round without a keep/drop decision).
2. **Known-red expiry** (for the future §2 `knownRed[]` array): each known-red carries a `reopenTrigger` (semantic, e.g. 'product internationalization') and optionally a review-by date; on expiry the meta-gate flips the entry from silently-accepted to must-re-justify. This is the structural cure for the exact orphan pattern UM-C-GATES fixed reactively (C-class 4 gates orphaned 2026-09-07→2026-09-11).

**Defer reason**: §4 requires (a) a SCHEMA CHANGE to two shipped files — the `Waiver` interface in `scripts/upstream-sync-record.ts` (804-line git-layer module) and the gate-coverage manifest — and adding an expiry field changes `collectGitFailures` failure semantics (note→failure), which needs its own grilling + spec + test round; (b) the meta-gate half is BLOCKED on the §2 `knownRed[]` extension (itself deferred above) — 'known-red expiry' has nothing to expire until that lands; (c) the policy calibration (N-syncs, expiry windows) is a human judgment call. Expiry is a durability refinement, not a correctness gate — the three integrity checks are already sound without it.

**Recommended pairing**: scope §4 TOGETHER with the §2 `knownRed[]` schema extension as ONE grilling round, kept off the AFK re-sync path.

### PR #122 UM-C-GATES soft-lock — VERIFIED merged

`git log --all --grep '#122'` shows merge commit `2f4398b20b` 'Merge pull request #122 from McKenzieIT/feat/tracker-2026-09-13-apply' on master + origin/master. Its child `e195bcdfd1` = 'Cluster D apply — 5-gate hybrid + 2 scope订正 → UM-C-GATES + UM12 resolved' is the UM-C-GATES soft-lock apply. (CAVEAT: a second unrelated commit `2610fddfc7` also matches '#122' — different fork numbering; the Cluster-D one is unambiguously `2f4398b20b`.)

### Split proposal (what this session does vs defers)

- **THIS SESSION (lands as decision-doc, not code)**: §3 cadence measurement (DONE, hard GO) + §2 finding (NO manifest edits; record the structural gap) + PR #122 verified.
- **DEFERS to follow-up sessions**: the actual §3 re-sync merge (multi-session, stateful) + §2 schema extension (`knownRed[]` + Check 4) + §4 waiver/known-red expiry (paired with §2 schema extension).

---

## [2026-09-14] §3 第三轮 re-sync 开工：2/6 seam 落定、**未 commit（mid-merge，有意）**；§2/§4 按本票 Split proposal 继续 defer

**Status 保持 `open`。** 本节记三件事：①§2/§4 的 defer 决定与理由；②§3 第三轮的实际进展 + **5 条 dry-run/RISK-MAP 都没有的发现**（本轮最有价值的输出）；③精确到命令的 resume 序列。

### 一、§2 + §4 —— 用户决定继续 defer，且这次是**遵从本票自己的判断**

上一版 prompt 的 Phase 3 把 §2（`knownRed[]` schema 扩展）+ §4（waiver expiry）排进了本 session 的 Step 3/4。**用户 2026-09-14 决定不做**，理由是本票 [2026-09-13] decision-doc 末尾的 **§Split proposal** 已经把它们判为 "DEFERS to follow-up sessions"，而那个判断的依据一条也没变：

- §4 要改 **`scripts/upstream-sync-record.ts`（804 行 git-layer 模块）** 的 `Waiver` interface，并且加 expiry 字段会**改变 `collectGitFailures` 的失败语义（note → failure）**。改一道已上线完整性门的失败语义，需要它自己的 grilling + spec + test 轮，不能搭在别的 apply 尾巴上。
- §4 的校准值（**N 次连续 zero-hit 后过期、各 decision kind 的 expiry window**）是**人的判断题**，不是能从代码里读出来的。
- §4 的 known-red 半边**阻塞在 §2 的 `knownRed[]` 扩展上** —— 在那个数组存在之前，"known-red expiry" 没有东西可以 expire。
- 本票 decision-doc 的 **Recommended pairing** 就是把 §4 与 §2 的 schema 扩展**作为一轮 grilling 一起做，并且明确要求 kept off the AFK re-sync path**。本 session 主体正是 re-sync（§3），把 §2/§4 塞进来恰好违反这条。

**→ §2/§4 状态不变**：§2 = 需 schema 扩展（`knownRed: [{script, rationale, ticket, expiry?, reopenTrigger}]` + Check 4 断言每条 known-red 指向一个已 enrolled 的门）；§4 = 需 grilling + spec + test 轮。两者成对，另开专项 session。**下 session 不要把它们排进 re-sync 路径。**

> 附注（本 session 的一个省钱观察）：上一版 prompt 的 Phase-1 里 `um15-s2` 那个 design agent 曾因 StructuredOutput 失败而无产出，prompt 因此把它排了重跑。**不需要重跑** —— §2 的完整设计（`knownRed[]` schema、Check 4、以及 `verify-client-ui-i18n` 的 draft entry JSON）本来就已经逐字写在本票 [2026-09-13] decision-doc 的 §2 节里。

### 二、§3 第三轮 re-sync —— **2/6 seam 落定，工作树停在 mid-merge**

#### 2.1 精确的可恢复状态（**下 session 的起点，逐字核对**）

| 项 | 值 |
|---|---|
| worktree | `/Users/mckenzie/workspace/dsh-s3-resync`（新建；worktree 总数 7 → **8**） |
| branch | `upstream/resync-2026-09-18` |
| HEAD | `6695ed150e` |
| **`MERGE_HEAD`** | **`c291e7961a51`** |
| **unmerged paths** | **36** |
| commit 数 | **0** —— 本轮什么都没 commit |

**为什么 0 commit，且这是对的**：git **禁止**在有 unmerged path 时创建 merge commit，也**禁止**在 merge 进行中做 pathspec commit（`git commit <paths>` 在 mid-merge 下被拒）。所以在 36 个 out-of-seam 冲突解完之前，结构上无法 commit。**这就是预期的可恢复状态，不是失败。** 下 session 直接在这个树上继续解冲突即可，**不要 `git merge --abort`**、**不要 reset**。

> **`dsh-s3-resync` 必须原样保留。** 本 session 的所有 tracker 文档工作都在主树 `master` 上做，与它零交集。

#### 2.2 窗口与可复现性

- BASE = `6695ed150e`（fork 侧 re-sync 分支起点）× upstream = `c291e7961a51`
- git 自算的三方 merge-base = **`c389f96bf3a9`**（= 本票记录的上一次 synced upstream tip，与 `upstream-sync.json` 一致）
- dry-run 报告的 `git merge-tree` 结果 SHA **`9820baebad1c`** 本轮**逐位复现**（bit-for-bit）→ dry-run 与实际 merge 是同一棵树，dry-run 的结论可信。

#### 2.3 dry-run 的 37-漏冲突预测 **精确命中**

冲突总数 **39 = 2 in-seam + 37 out-of-seam**。dry-run 报告的 "RISK-MAP 漏了 37 个 fork-divergent 冲突" **一个不差**。且**零** modify/delete、零 rename/rename、零 add/add —— 全部是普通 content conflict，这对 resume 是好消息（没有需要人判"这个文件到底还该不该存在"的那一类）。

#### 2.4 落定的 2 个 seam

| seam | 范围 | severity | 冲突 | 结果 |
|---|---|---|---|---|
| **seam-4** | `packages/client/modules` | LOW | **0** | 自动应用 **+66/-53 across 7 files**；13 个文件全部与 upstream **字节相同**（take-upstream-wholesale 如 RISK-MAP 所料）。**94/94 tests pass** |
| **seam-2** | `packages/api/gateway` + `packages/api/remotes` | MEDIUM | 恰 **2**，每个 1 个 hunk | `packages/api/remotes/src/client/index.ts`（L164-172）+ `packages/api/remotes/package.json`（L91-97），均 **union-resolve**。**292/292 tests pass** |

**seam-2 不需要 co-adaptation**：`grep -rn 'identifyHost' packages apps scripts` → **0 hits**。upstream 删掉的那个 delegate API 在 fork 侧**没有任何依赖方**，所以 RISK-MAP 担心的 call-site 改造是空集。

**关键状态判断**：**6 个 seam path 现在全部零冲突文件。** 剩下的 36 个冲突**一个都不在 seam 内**。这改变了剩余工作的性质 —— 余下 4 个 seam（5/1/3/6）的工作**不是 merge 冲突解决**，而是 **build-time co-adaptation**（upstream 改了 API，fork 的调用点要跟着改，但 git 层面没有冲突标记指给你）。

#### 2.5 **5 条 dry-run 与 RISK-MAP 都没有的发现（本轮最有价值的输出）**

**① `tsconfig.base.json` 是**所有**验证的硬门，不是普通 Category B 文件。**
它带着冲突标记时，`vite-tsconfig-paths` 解析失败 → 全局 `setupFiles` 里的一个条目 oxc transform 失败 → **全仓每一次 vitest run 都以 0 tests 直接 abort**。症状是"测试一个都不跑"，而不是"某个测试红"，极易误诊成环境坏了。
**→ 每一轮、每一次，第一个解的文件必须是 `tsconfig.base.json`。** 本 session 已作为前置解掉：**2 个纯 additive union hunk，共 484 条 path entry**。

**② merge 后 `pnpm install` 是强制步骤 —— dry-run 报告完全没提这件事。**
upstream 新增了一个**全新的包** `packages/util/chunked-list`，它依赖 `zod`，而这个包在 fork 树上**没有 `node_modules`**。这一条未解析的依赖会让 **`tsc -b` 的 build graph 直接 abort**，级联出 **~28 个幻影 `TS2307` / `TS2339` / `TS2322`** —— 全是假错，改代码只会越改越错。
**→ 这把冲突中的 `pnpm-lock.yaml` 顶到了所有 typecheck 验证的关键路径上**（不是"顺手解一下的 manifest"）。

**③ RISK-MAP seam-4 有一处事实错误（无害，但会误导核对）**：它写 `client/index.ts` 重新导出全部**四个** helper。实测 upstream 重新导出的是**三个 + `parseBootManifest`**；**`optionalStringArray` 并没有从 `./client` 子路径导出**。按 RISK-MAP 的说法去核"4 个都在"会得出错误结论。

**④ seam-6 变简单了：它的 `[high]` `WorkspaceFileResource` co-adaptation 已经 moot。**
`grep -rn 'WorkspaceFileResource' packages` → post-merge **0 hits**。原因：upstream 自己的 rename 带来了它自己的 `fixtures.client.ts`，那个类型名整体消失了。RISK-MAP 把 seam-6 排最难，主要就是因为它的 6 个 breaking + out-of-seam co-adapt；这一条直接划掉。

**⑤ seam-6 的另一个 `[high]` 确认**仍然待做**（别因为 ④ 就以为 seam-6 空了）**：`packages/client/ui-sidebar-files/src/client/face.ts:55` 仍然是 `remote.workspaceFiles.list(sessionId, path, signal)`，与 BASE **字节未变**。这是真正需要 co-adapt 的那一处。

#### 2.6 Category 计数订正（dry-run 报告的分类表）

- **Category E = 1 个文件（`.gitignore`），不是 2**
- **Category C = 13 个，不是 11**
- 合计仍然**对得上 37**（分类内部搬家，总数不变）

#### 2.7 一项标记为**待 build 后重验**、不判 benign

`packages/api/remotes/src/remote-events.ts(32,5) TS2322` on `'goal/activation-changed'`。**最可能**的原因是缺一个已 build 的 `lib/` 出口，而不是缺 tsconfig reference —— 但本 session **没有**证实这一点，所以**不宣布它无害**。等 ② 的 `pnpm install` + build 跑通之后再看它是否自行消失；若不消失，它是真错。

#### 2.8 测试环境的两个坑（记下来省下一轮的时间）

- **`vitest run --dir <pkg>` 会忽略 `projects` 配置，转而跑全仓 suite** —— 十几分钟、还会遗留 orphan worker 进程。**用显式 spec 路径**，不要用 `--dir`。
- **`--reporter=basic` 在 vitest 4 里不存在**（会报未知 reporter）。

### 三、Resume 序列（**严格按序，前 5 步不可调换**）

在 `/Users/mckenzie/workspace/dsh-s3-resync`（branch `upstream/resync-2026-09-18`，mid-merge，36 unmerged）上继续：

1. **`tsconfig.base.json` —— 先解这一个，别的都别碰。** 见发现①：它红着，全仓 vitest 一个测试都跑不起来，你会误诊一整轮。（本 session 已解过一次，若树上仍带标记则重做：2 个纯 additive union hunk / 484 path entries。）
2. **`pnpm install --no-frozen-lockfile`** —— 见发现②：`packages/util/chunked-list` 是全新包且依赖 `zod`，无 `node_modules` 会让 `tsc -b` 的 build graph abort 并级联 ~28 个幻影 TS 错。**冲突中的 `pnpm-lock.yaml` 属于这一步的前置，不是 manifest 顺手活。**
3. **translation-pairing 配对 pass（16 个文件）** —— `docs/**` 的 `.md` / `.zh.md` / `.i18n.yaml` 三件套。机械活，但必须三件同步解，否则 pairing 门红。
4. **manifest / misc union pass（4 个文件）** —— 纯 union，无语义判断。
5. **regenerated-artifact pass —— `packages/typert/generator/src/analyzer.ts` 必须第一个**，它**阻塞后面所有 spec**。其余 regen artifact（`packages/extensions/tool-cordis/src/api-catalog.ts` 等）按 dry-run 的 reframe 处理：**take upstream generators + 重跑 fork regen**，不要做三方合并。
6. **genuine three-way pass** —— 剩下真正需要读语义的那些（`packages/client/ui-layout/src/client/{AppFrame.tsx,index.ts}`、`ui-settings-models` 的 tests、`session-snapshot/src/harness.ts` 等）。
7. **build 完成后回头重验 seam-2 的 client face** —— 见 2.7 的 `remote-events.ts(32,5) TS2322`。它没被判 benign。
8. **然后按 RISK-MAP 顺序推剩余 4 个 seam：seam-5 → seam-1 → seam-3 → seam-6。**
   - seam-5 紧跟 seam-2（同一包路径 `packages/api/remotes`，是 seam-2 的 consumer 下游；要审 fork 侧 emitter 是否都带了 `request.agent`）
   - seam-1（bundle）要过 4 处 AgentSetup caller 迁移这道关
   - seam-3 本轮判 LOW（27 个 commit 以 `fixture.ts` 的 surgical 改动为主，**不是** UM14 那次的 dual-refactor）；保住 `case 'result/get'` 块
   - seam-6 最后：④ 已消掉它的 `WorkspaceFileResource` 那半，⑤ 的 `ui-sidebar-files/src/client/face.ts:55` 仍要改

**每个 seam 解完就跑该 seam 的 testHotspots（RISK-MAP 每 seam 都列了），用显式 spec 路径、不要 `--dir`、不要 `--reporter=basic`。**

### 四、本轮对 durable method 本身的评价

这是 UM15 §1-§5 建成后的**首次真实端到端检验**，两条结论：

- **cadence + staleness 半边有效**：阈值判定（852 commits / 6 seam 全触）正确触发了这一轮；`verify-upstream-sync-record` 的 stale-ref note 是最初的告警源。
- **impact 预测半边有系统性盲区**：RISK-MAP 只看 seam，于是**漏掉了 37 个 out-of-seam 冲突（占总数 95%）**，还错判了 seam-4 的导出面（发现③）与 seam-6 的难度（发现④）。dry-run 补上了 37 这个数字并被本轮**精确验证**，但连 dry-run 也漏了 `tsconfig.base.json` 的门效应（①）和强制 `pnpm install`（②）。**这两条应当喂回 §2 change-impact analyzer 的设计**：analyzer 不能只沿 seam 推理，必须 ① 把"解析器/配置类文件（`tsconfig.base.json`、`pnpm-lock.yaml`）冲突"标记为 blocking-all-verification 级别，② 检测 upstream 新增包并强制 install 步骤。

---

## [2026-09-14] human-gates session：发现 3 个 gate coverage gap + §2/§4 校准待答

**Status 保持 `open`。§2/§4 校准值仍未收口。**

### 发现的 3 个缺陷（gate coverage gap）

本 session 在启动 web UI 做 UM4 gate ① capture 时遇到 3 个 blocker，都是现有 gate 的盲区：

| # | 缺陷 | 票 | 现有 gate 为什么漏 |
|---|---|---|---|
| 1 | `ui-present-table` client bundle code-split，module table 不兼容（52 包里唯一）| [UM-DEFECT-PRESENT-TABLE-SPLIT](UM-DEFECT-PRESENT-TABLE-SPLIT.md) | 无 gate 验证 client bundle 是单文件 |
| 2 | 无任何 bundle/profile 配 `agent-presets.roots`，da 两个 preset 无根可扫 | [UM-DEFECT-PRESET-ROOTS](UM-DEFECT-PRESET-ROOTS.md) | 无 gate 验证 default preset 在 roster 中 |
| 3 | bundle/data-agent/package.json 漏声明 11 个 tool-* 依赖 | [UM-DEFECT-PRESET-DEPS](UM-DEFECT-PRESET-DEPS.md) | `verify-cordis-config` 只查 `cordis.patch.yml` mount，不查 preset `agent.cordis.yml` 行 |

**第 3 条尤其重要**：`verify-cordis-config` 验证 bundle mount 的 `name:` 能否从 bundle 解析。但 preset 的 `agent.cordis.yml` 里每行也是 `name:` + 包名，用的是不同的解析路径（profile baseUrl walk，不是 bundle baseUrl）。**现有 gate 不覆盖后者**。这正是 §2 meta-gate 那条线该扩展的方向：需要一个 `verify-preset-rows-resolvable` 门，断言每个 preset 的每个 live 行的包名可从 profile 的安装闭包中解析。

### §2 knownRed[] schema 扩展（已设计未实现）

2026-09-13 decision-doc 已设计好 schema 和 Check 4，本 session 确认 manifest 现状：

- `scripts/gate-coverage.manifest.json`：109 行，**只有** `exemptions` 一个 top-level key（21 条，**不是**之前票记的 20）
- `scripts/verify-gate-coverage.ts`：129 行，Check 1/2/3 已实现
- **`knownRed` 不存在**于 `scripts/` 任何文件（`grep -rn 'knownRed' scripts/` 零命中）
- 扩展需要：manifest 加 `knownRed: [{script, rationale, ticket, expiry?, reopenTrigger}]` 数组 + `verify-gate-coverage.ts` 加 Check 4 断言每条 known-red 指向一个已 enrolled 的门
- Draft entry（已在本票 [2026-09-13] decision-doc §2 节）：
  ```json
  {"script":"verify-client-ui-i18n","state":"known-red","rationale":"data-agent client UI targets enterprise intranet Chinese users; i18n extraction is future product-internationalization debt, zero current user value","ticket":"UM-C-GATES-UPSTREAM-NEW","reopenTrigger":"product internationalization"}
  ```

### §4 calibration（用户仍未答 Q1-Q6）

本 session grilling 已提出 6 问（Q1 note→failure 语义变更 / Q2 all-history vs per-sync 持久化 / Q3 drop expiry 窗口 / Q4 pending fuse / Q5 known-red 过期模型 / Q6 capture 若返回 interrupted）。用户未答，留待下一 HITL session。

**3 条实测背景改变题目形状**（grilling 时已陈述）：

1. `upstream-sync.json` 现有 **10 条 waiver**：`pending` **0** / `drop` **7** / `keep` **3**
2. `history.length = 1`（历史上只有 2 次 recorded sync）
3. 现行 zero-hit note 语义是 **"matched no finding in *any recorded window*"**（`:212-215`，跨全历史聚合），**不是**"连续 N 轮"——per-sync 命中数只活在函数局部 `hits` Map，**从不落盘**

第 3 条意味着票里说的"连续 N 轮 zero-hit"**不是调阈值，而是换计数模型**——选 (b) 方案需新增持久化字段。

**建议（待用户定）**：做 note→failure，但只对 `decision:'keep'` 生效；计数选 (a) all-history + 日历 expiry，不要 (b) per-sync 持久化（2 次 sync 攒不满有意义的 N）。

### 给 AFK session 的 gotcha 清单

- `pnpm dsh web` 必须在 `dsh-resync` 跑（主树 0/58 client 包有 `lib/client.js`）
- 需要 `--patch /tmp/dsh-disable-present-table.patch.yml` 修 3 个启动 blocker
- `pnpm dsh` = `node --import tsx/esm apps/cli/src/bin.ts`（tsx 才能解 `/src/*.ts` mount）
- `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-tool-resolve-term` 需 symlink（或加依赖声明后 `pnpm install`）
- capture 读回命令用 `zstd -dc` + `data.reason.reason.kind`（票里那条跑不通）

---

## [2026-09-14] §4 calibration Q1-Q4 收口（Q5 待答）

**用户 2026-09-14 定死 4 项校准值**：

| Q | 决策 | 值 | 实现 |
|---|---|---|---|
| Q1 | zero-hit note→failure | 做，只对 `keep` 生效 | `21a5f496c7`：`waiver.decision === 'keep'` → `failures.push` |
| Q2 | 计数基准 | (a) all-history 聚合 + 日历 expiry | **不改 schema**，不回填历史。Q1 已覆盖 zero-hit 语义 |
| Q3 | `drop` expiry | (a) 不加日历 expiry，只加 report 可见性 | **未实现**（report 输出改进留给 AFK session）|
| Q4 | `pending` fuse | 1 轮，直接 FAILURE | `10c5167779`：`pending` + zero-hit → `failures.push` |

**当前 zero-hit 行为总结**（`scripts/upstream-sync-record.ts:212-228`）：

| `decision` | zero-hit 行为 | 理由 |
|---|---|---|
| `keep` | **FAILURE**（门红，拦 push）| 永久接受的分歧可能已不存在，强制重新裁决 |
| `pending` | **FAILURE**（门红，拦 push）| 未决不得存活 >1 轮 sync |
| `drop` | NOTE（信息性，不阻塞）| 有 ticket 追踪 remediation 进度 |

**Gate 现状**：10 条 waiver（keep 3 / drop 7 / pending 0），全部 keep+pending 命中 → gate 仍 exit 0。

**Q5（known-red expiry 给未来 §2）待答**。

### Q3 report 可见性改进（未实现，留给 AFK session）

Q3 选了 (a)：`drop` 不加硬 expiry，改为门每次把 7 条 `drop` 连同其 ticket 列进 report 输出。具体实现：在 `upstream-status.ts` report 里加一节 "Owed remediation (drop waivers)"，列出每条 drop 的 path + direction + ticket。不阻塞 push，但每次 pre-push 都看到。

### Q5 known-red expiry（给未来 §2 `knownRed[]`）= (b)

**`reopenTrigger`（语义字符串，必填）+ `reviewBy`（ISO 日期，可选）**。

- `reopenTrigger` 是一等字段：`verify-client-ui-i18n` 的 reopen 条件是 "product internationalization"（产品事件，非日期）
- `reviewBy` 是结构性防线：到期 → meta-gate 翻 must-re-justify，防 orphan（UM-C-GATES C 类 4 门 orphan 4 天的模式）
- 两者都加，不互斥

**Draft entry**（§2 schema 扩展实现时使用）：
```json
{
  "script": "verify-client-ui-i18n",
  "state": "known-red",
  "rationale": "data-agent client UI targets enterprise intranet Chinese users; i18n extraction is future product-internationalization debt, zero current user value",
  "ticket": "UM-C-GATES-UPSTREAM-NEW",
  "reopenTrigger": "product internationalization",
  "reviewBy": "2027-03-14"
}
```

### §4 calibration 完整总结（给 AFK session）

| Q | 决策 | 状态 |
|---|---|---|
| Q1 | zero-hit `keep` → failure | ✅ 已落地 `21a5f496c7` |
| Q2 | (a) all-history + 日历 expiry | ✅ 不改 schema |
| Q3 | (a) `drop` 无硬 expiry，只加 report 可见性 | ✅ 已落地 `746c4d1fd1` |
| Q4 | `pending` 1 轮直接 failure | ✅ 已落地 `10c5167779` |
| Q5 | (b) `reopenTrigger` + 可选 `reviewBy` | ✅ 已随 §2 schema 落地 `c85f496027` |

**§4 代码实现完成度**：Q1、Q3、Q4 已落地；Q2 明确不新增 schema；Q5 已随 §2 的 `knownRed[]` schema 与 enrolled-gate 校验落地。

## [2026-09-14] AFK execution session: §3 第三轮 re-sync merge 落定 + push blocked by pre-existing dsh-root

**Status 保持 `open`。** 本节记 §3 merge 的最终落定 + build 验证 + push 阻塞。

### §3 merge — 36 out-of-seam 冲突全解，3 commit on `upstream/resync-2026-09-18`

承接 [2026-09-14] §3 第三轮开工节（mid-merge，36 unmerged，0 commit）。本 session 把 36 冲突全解 + 落定 merge commit：

- `1f731901a7` — merge commit。4 通道逐个解：tsconfig.base.json（前 session 已解）/ pnpm-lock.yaml（accept upstream + pnpm install regen）/ 13 docs translation-pairing（take upstream wholesale；3 generated EN docs capability-seams/subsystems-README/tool-catalog 跟 ZH 对齐再 re-record sidecar）/ 4 manifest/misc（union：.gitignore + ci-master.yml + apps-cli + python package.json）/ 7 regenerated-artifact（analyzer.ts take upstream；gen-cordis-catalog + gen-doc-graphs + api-catalog + slot-catalog + gen-tool-catalog.spec + verify-package-readme-model-experience union）/ 9 genuine three-way（ui-layout AppFrame.tsx+index.ts merge fork+upstream 保 details.aux slot + upstream main rename；ui-settings-models 7 files + scoped-tool-subagent + harness.ts take upstream）。
- `3847ec98d6` — fix 2 个 union-merge 产生的 TS1117 duplicate-object errors（api-catalog.ts 的 TableDefinition+SystemPromptUpdate 被合进一个 object → 拆成两个独立 entry；verify-package-readme-model-experience.ts 的 agent-team-web-profile 重复 key → 取 upstream 措辞）+ pnpm-lock.yaml regen。
- `50ef1d6f5e` — fix lsp-stdio test waitForFile 1-arg call → 3-arg（auto-merge 保留了 fork 的 1-arg call + upstream 的 3-arg 定义，不一致）。

### Build 验证 — host tsc green

`node ./node_modules/typescript/bin/tsc -b tsconfig.host.json` **exit 0**。3 个 merge-caused error 全修。发现②的 TS2322 on `remote-events.ts(32,5)` 确认是 phantom（chunked-list 装好后消失，如本票 [2026-09-14] 节预测）。seam-2/seam-4 前 session 已落；余 4 seam（5/1/3/6）host-side source 全编译通过——RISK-MAP 担心的 call-site co-adaptation 在 host 层面是空集或已被 merge 解掉。client-side seam-6（`ui-sidebar-files/face.ts:55` 仍用旧 `sessionId` signature vs upstream `WorkspaceFileScope`）deferred——不阻 host tsc，client build 才暴露。

### ⚠️ Push BLOCKED — pre-existing dsh-root typecheck breakage

pre-push `typecheck` hook = `pnpm run typecheck` = `build:lib:host`（`tsc -b` ✅ + `tsdown --env.DSH_BUILD_FACE host` ❌）。根 `tsdown.config.ts` entry `lib/types/{index,invariant,startup}.js` 在 fresh worktree 不存在；typert plugin 在 tsdown writeBundle 期间生成它们，但 tsdown entry 解析发生在 plugin 之前（chicken-and-egg bootstrapping bug）。**merge 未改此项**（`git diff c389f96bf3a9..HEAD -- tsdown.config.ts` 空；BASE 同 entry line）。dsh-resync（`upstream/resync-2026-09-08`）也无 `lib/types/`，故铁律 4「从 dsh-resync 推」workaround 失效。另 2 个 pre-push job 绿（no-prod-src-on-master / verify-upstream-sync-record）。**13 个 master commit（7 既有 unpushed + 6 本 session）+ 3 个 merge commit 全 ready 但 unpushable**，直到 dsh-root 修（UM12/UM16 tracked）。

push 实测：`git push origin upstream/resync-2026-09-18` → lefthook pre-push → typecheck 🥊 6.55s → `[@deepseek-ai/dsh-root] Cannot find entry: ["lib/types/{index,invariant,startup}.js"]` → `error: failed to push some refs` exit 1。

### 本 session 未做（明示）

- ❌ 未 push（pre-push typecheck 阻塞，dsh-root UM12/UM16）
- ❌ 未做 client-side seam-6 co-adaptation（face.ts:55 WorkspaceFileScope）—— deferred
- ❌ 未做 UM-FORK-README-GENERATOR-RESIDUALS item 2（generator fence-aware scanner）—— time-permitting deferred
- ❌ 未做 PR / merge

### 下 session 形态

1. **先修 dsh-root**（unblock push）：根 `tsdown.config.ts` 的 entry `lib/types/{index,invariant,startup}.js` 需在 tsdown 前生成。typert plugin 的 writeBundle 生成它们，但 entry 解析在前。修法方向：要么让 typert plugin 在 `buildStart`/`config` hook 生成 lib/types/（在 entry 解析后、build 前），要么加一个前置 gen 步骤。这是 UM12/UM16 域，不在 UM15 scope，但 unblock 所有 push。
2. 修完 dsh-root → push 13 master + 3 merge commit → PR → merge。
3. client-side seam-6 co-adaptation（face.ts:55 + ui-sidebar-textpreview/rpc.ts:85，WorkspaceFileScope lookup wiring）。
4. UM-FORK-README item 2（generator fence-aware scanner + 幂等 slug + fixture 回归测试）。


## [2026-09-14] Push unblock and client completion correction

`[@deepseek-ai/dsh-root] Cannot find entry` 不是 Typert bootstrap ordering。失败配置来自已删除 package 的 ignored residue：`packages/client/runtime/` 只剩 `node_modules/`，tsdown workspace glob 仍把该目录当 package，向上找到 root manifest 后以 `dsh-root` 名义报告缺 entry。仓库自带 `pnpm run clean` 删除 manifest-less safe residue；root 删除 355 paths、resync 删除 350 paths 后，两边 `pnpm run typecheck` 均通过，无需生成虚假 root entries 或改 Typert hook。

Client aggregate 随后暴露真实 merge residual：`ui-layout` 丢了 `SessionProvider` prop 且把 root-scoped rightbar 错包进 Session area；修为 rightbar 常驻、仅 `details.aux` 受 SessionProvider 约束。client slot catalog 同时含 merge 生成的重复 object fields，并把 declaration-merged `useWorkspaces` 投影两次；生成器现在按首次出现顺序去重 standard props，再重新生成 catalog。commit `86ad658ff0`。

所谓 client seam-6 signature residual 不成立：generated Remote client 的 lookup parameter wire type 是 `SessionId`，Host gateway 再通过 `workspaceFileScope` lookup 解析 `WorkspaceFileScope`。`ui-sidebar-files` 与 document-preview 继续传 `sessionId` 正是生成 API。`build:lib:client`、workspace-files/read-all/scope/provider、sidebar-files、document-preview、layout 和 catalog focused tests 全绿。

`upstream/resync-2026-09-18` 已推并开 PR #130；因其 merge base 是 `6695ed150e`，而 origin/master 已前进，PR 初始为 conflicting。16 个 master-side commits 已按 production-source policy 发布到 feature branch PR #131；先 landing #131，再把新 origin/master merge-forward 到 resync branch 后更新 #130。

## [2026-09-14] 最终 PR 前收口状态

**Status 保持 `open`，直到 PR #130 合并并完成分支清理。** `upstream-sync.json.current` 已记录 upstream `c291e7961a515f6d7af9304e7fd1d257929aef26` 与 merge `1f731901a76109fefa168fc9bbd785dbfdefc889`；`verify-upstream-sync-record`、`verify-runtime-closure`、`verify-package-dependencies` 与 `verify-cordis-config` 均通过。

先前的 `dsh-root` 诊断已更正：失败来自已删除 `packages/client/runtime/` 下的 ignored `node_modules` residue，`pnpm run clean` 后 typecheck 恢复，无需修改 Typert bootstrap。§2 的 `knownRed[]` 与 enrolled-gate 校验、§3 的 re-sync merge、§4 Q3 的 drop-waiver 可见性均已落地。当前静态检查只剩既有 `constraints`、Client UI i18n 与 translation-pairing 红项；本分支引入的 architecture/catalog/pairing drift 已修复。

本票剩余关闭条件只有：推送最终 head、确认 CI 只保留已授权的两个 release known-red、合并 PR #130，并记录分支清理结果。定时运行 `upstream-status` 的通知语义另行决策；该命令当前固定 exit 0，直接添加 schedule 不会产生有效失败告警。
