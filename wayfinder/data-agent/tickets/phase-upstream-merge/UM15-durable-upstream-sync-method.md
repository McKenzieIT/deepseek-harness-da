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
