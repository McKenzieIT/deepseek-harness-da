# UM15 — durable upstream-sync 工程方法

**Type**: grilling→prototype · **Status**: open · **Phase**: upstream-merge
**Blocking**: UM-ARCH（impact analyzer 在图上推理）+ UM-ADAPT（自动化它的 process）
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
