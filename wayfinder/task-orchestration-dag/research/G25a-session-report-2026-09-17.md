# G25a 实施 session 报告 — 2026-09-17

**票**: [G25a Phase-gate incremental-value experiment](../tickets/G25a-phase-gate-incremental-value-experiment.md)
**分支**: `codex/task-orchestration-dag-baseline-2026-09-15`
**worktree**: `/Users/mckenzie/workspace/deepseek-harness-da/.worktrees/task-orchestration-dag-baseline`
**证据文档**: [G25a preflight — the locked case oracle cannot grade the decision batch](G25a-oracle-validity-preflight.md)
**决策运行预算消耗**: 0

## 一句话结论

本 session 的实际产出不是跑完实验，而是在花掉决策批次预算之前证明了锁定协议的评分基准不可执行，在用户两次决策后重建可执行协议，并建成、验证了实验设施中风险最高的模块。阻塞点比票面预期更靠上游：在 benchmark oracle 里，不在 harness 里。

## 本 session 的 commit

| commit | 内容 |
| --- | --- |
| `577e100989` | 记录 oracle 有效性预检阻塞发现 |
| `020d625c95` | 审计替换 benchmark 的 oracle |
| `023bb40348` | 冻结修订后的 G25a 协议 |
| `8e531812da` | 冻结协议 README、36 案例 manifest、24 个行为案例 |
| `2d6bb5ed60` | 策略组插件、两份臂 preset、Stage 0 采集 parity 测试 |
| `ea6ecc07d4` | map 上的实施 checkpoint（另见下文「诚实披露」） |

## 一、环境验证（全绿）

| 项 | 结果 |
| --- | --- |
| `maxc` 解析路径 | `/Users/mckenzie/Library/Python/3.13/bin/maxc` |
| `MAXC_CONFIG` | `$HOME/.maxc/config_ieu_cdm.yaml.bak`，与 `config_ieu_cdm.yaml` 字节相同（`cmp -s` 验证） |
| 真实查询 | 成功，project `ieu_cdm`，`read_only` 策略，`allowed_operations: [SELECT]` |
| 网络 / DNS | 正常 |
| 分区可用性 | `dws_10000251_univ_acc_act_di` 自 `20260720` 至 `20260901` 连续无缺 |

同时机械验证了票面对 harness 的两条独立指控：`today` 在 `packages/eval/eval-cli/src/harness-responder.ts` 中只出现一次，位于 `:172`，是 `HarnessBootOptions` 上的类型声明且从未被读取；`query_result` 在该文件中完全不出现，所以 responder 结构上无法把真实执行结果带进外层评分。

## 二、阻塞发现一：锁定的 24 案例 oracle 无法评分

### 2.1 根本缺失

票面评分规则 2 与批次首尾稳定性探针都指向一个仓库里不存在的产物。24 个 `k11v2_*` 案例只带 `expected.result_value` 与 `match_mode`，没有 `expected.sql`；`grep -rl "reference_sql\|ref_sql" packages/eval` 零命中；全仓 168 个 k11-v2 案例与 `_archived/k11-v1` 都没有 reference SQL。案例构成为 `scalar_exact` 9 个、`row_count_range` 15 个。

### 2.2 用执行反推 oracle，分裂成三类

A 类可复现且语义正确（2 个），都在 `_di` 日增量表上：`k11v2_005` 期望 3259，`COUNT(*) … WHERE ds='20260827'` 实测 3259；`k11v2_011` 期望 22640，`COUNT(*) … WHERE ds='20260826'` 实测 22640。`k11v2_005` 顺带把日期约定钉死：「今天」= ds 20260827（参考日）、「昨天」= ds 20260826。

B 类可复现但语义错误（3 个）。`dws_10000251_com_pay_order_df` 是日全量快照，语义层自己的表说明就警告「`_df` 为全量快照…同一 `order_id` 在多日分区中重复存在,跨分区查询需去重避免重复计数」，且 `pay_amt` 单位为分。oracle 编码的却是不加 `ymd` 过滤的朴素 `WHERE ds='<昨天>'`，于是「昨天」的答案实际是累计至今。

| 案例 | 问题 | 期望（全量快照口径） | 语义正确值 | 倍差 |
| --- | --- | --- | --- | --- |
| `k11v2_001` | 昨天的总付费金额 | 13,582,635,332 ✓ | `ymd='20260826'` → 3,162,400 | 约 4,300× |
| `k11v2_002` | 昨天有多少个付费账号 | 282,507 ✓ | `ymd='20260826'` → 181 | 约 1,560× |
| `k11v2_013` | 昨天的平均客单价 | 4,574 ✓ | — | — |

C 类无法复现（2 个确证、2 个构造上不可验）。

| 案例 | 期望 | 真实数据 | 差距 |
| --- | --- | --- | --- |
| `k11v2_022` | 350,000 | `COUNT(*) FROM univ_role_act_di WHERE ds='20260826'` = 3,500 | 恰好 100× |
| `k11v2_024` | 1,200,000 | 该分区总额 22,176 元（404 行） | 约 54× |
| `k11v2_020` | 8,500,000 | `GROUP BY item_type,item_id HAVING SUM(get_amt) BETWEEN 7000000 AND 10000000` 返回 0 行；全部 7,709 个物品合计 39,448,106,709 | 穷举无匹配 |
| `k11v2_072` | 420 | 双表、窗口无规范定义 | 构造上不可验 |

`k11v2_024` 有独立旁证：`dws_10000251_finance_pay_order_di` 自己的 description 记录 `ds=20260720` 单日 status=1 共 384 笔、合计 7735.00 元，1,200,000 的日现金收入与该表自述量级差两个数量级。

### 2.3 为什么这是「停」而不是「绕」

24 个案例中 17 个至少触及一张 `_df` 快照表：`001 002 013 020 033 036 041 042 048 050 057 065 069 072 073 078 080`。

B 类偏差专门惩罚被测臂。完整状态机组的 GENERATION 门 fail closed（`no definition loaded — call load_event_definition … before writing SQL`），强制它先读表定义，也就是那条快照警告；它还额外注入携带 grounding gate 与 SQL conventions 的阶段指令。越认真 grounding 的臂越可能写出 `ymd` 过滤的正确 SQL，也越可能被判错。该偏差方向与锁定的 8pp 阈值同向：它压低状态机组的实测正确率，而 8pp 规则测的正是这个量。C 类案例两臂都无法满足规则 2，只会各消耗 6 个 Attempt 却仅贡献 `pass^3` 分母。

事后自拟期望值等于在看过数据之后重写锁定 oracle，票面 Out of scope 明文禁止「根据 smoke 或中途结果调整判定门槛、案例集合或主指标」，并会摧毁 8pp 与 50% 阈值唯一的意义：它们是在证据存在之前定下的。所以本 session 停下来交给用户决策，而不是自行替换 oracle。

## 三、阻塞发现二：替换 benchmark 只有 12 个案例站得住

用户选择改用 `packages/eval/eval/cases/rbi-10000251-exec`，全仓唯一带 reference SQL 的案例集：39 个案例全部有 `expected.sql`、全部 `tier: verified`、无 retired。

仓库里已有为此写的仪器 `packages/eval/eval-cli/dev/case-expected-value-audit.mjs`，2026-09-06 因 GA-EVAL-EVENTDEF-PREFETCH 而写，起因是 agent 逐字节输出 reference SQL 后案例仍被判 wrong。

### 3.1 标量审计

今天重跑全 39 个（`ONLY_DS=all`，anchor `TODAY=20260806`，故 `ds_yesterday=20260805`、`ds_7d_ago=20260730`）：

```text
MATCH=15  STALE_EXPECTED=16  SKIPPED=8  (of 39)
```

### 3.2 行集审计

该脚本只比对首行首个标量，所有多行期望都落成 `SKIPPED`。补写行集审计并比对完整行集后：

```text
row-set tally: {"STALE_ROWS": 8}
```

8 个全部 stale。其中 4 个还有第二重缺陷：记录的期望只是更长结果的 5 行前缀（`exp=5r live=7r/10r/11r`）。`050` 与 `054` 有第三重：其期望行里的 `ds` 是 `20260714`–`20260718`，是当前 anchor 下 `{{ds_7d_ago}}` 根本不会产生的日期，说明这两个期望是在另一个 anchor 日期下采集的。

### 3.3 15 个 MATCH 里 3 个退化

| 案例 | 问题 | 为什么不能评正确性 |
| --- | --- | --- |
| `044` | 7月14日新增角色的次日留存率 | reference SQL 是 `user_id` 自连接、两侧都被约束，`COUNT(DISTINCT b.user_id)/COUNT(DISTINCT a.user_id)` 只要有匹配就恒为 `1.0`。期望 `1.0` 是坏查询的产物，不是留存率 |
| `056` | 昨天的登录账号UV | 期望 `0`，来自 `event='game.user.login'` 查 `ieu_ods.ods_10000251_all_view` 返回空。任何找不到数据的 agent 也返回 0 并被判正确 |
| `130` | 昨天付费抽卡（非免费）的次数 | 期望 `0`，同一失效模式（`GET_JSON_OBJECT(params,'$.free')='0'`） |

stale 与可用的分界与 `data_source` 完全吻合，也与该脚本 2026-09-06 docstring 的记录一致：event 族 18 个案例全读原始 `ieu_ods` 视图，每个非零案例都已漂移；dws 汇总表的标量值稳了一个月。漂移原因不是表改口径，而是原始事件视图持续累积，任何对它记录的绝对计数会立刻衰减。

### 3.4 可用池 12 个

```text
036 037 038 039 040 041 042 043 046 048 055 060
```

排除 16 个 stale 标量（`057` 加整个 `119`–`138` event 族）、8 个 stale 多行（`045 049 050 051 052 053 054 059`）、3 个退化（`044 056 130`）。抽检 4 个精确复现：`037` → 4336、`036` → 4563、`039` → 24099.0、`038` → 552。

这 12 个的分布需诚实披露：层级 L2 十个、L3 两个，没有 L1 也没有 L4；意图 metric_lookup 五个、proportion 五个、trend 两个；全部落在 `dws` 汇总表上。

### 3.5 12 个案例撑不起 8pp 规则

`pass^3` 在 12 个 case 上以整案例 8.3pp 为步长移动，8pp 等于 0.96 个案例，低于指标分辨率；以 case 为重采样单位跑 10,000 次 paired bootstrap，区间对任何可信效应都会跨零。规则 1 会由构造而非由测量产出「不确定」。

## 四、修订后的锁定协议

两次修订都写进票面并附明文废止对照表，原文逐字保留作历史记录，冲突时修订段胜。

| 项 | 原 | 修订后 |
| --- | --- | --- |
| 参考日 | 2026-08-27 | 2026-08-06（`ds_yesterday` 20260805、`ds_7d_ago` 20260730） |
| 真实执行案例 | 24 个 `k11v2_*` | 12 个已验证 `eval_10000251_*` |
| 行为案例 | 8 个，每类 2 | 24 个，每类 6 |
| 主指标 | case-level `pass^3` | severe unsupported answer rate |
| 决定规则 | 8pp 或 50% | 规则 2 为主轴；8pp 仍计算上报但低于分辨率 |
| Stage 2 规模 | 32 案例 / 224 Attempt | 36 案例 / 252 Attempt |

50%、2pp、30% 三个阈值逐字未动；30% 成本条款、物质性退化条款、不确定条款、全部产物与隐私边界未动。规则 2 本身是用户 2026-09-17 已批准的条款，变的只是哪条承重。

选择规则 2 还有机制上的理由：phase-gate 最可信的价值就在防编造（GENERATION 门无定义则 fail closed、显式 honest decline），而行为案例不需要仓库 oracle，全部从 Session 证据确定性评分。

## 五、已建成并验证的设施

全部产物由已提交的生成器产出，可重跑复核，不是手写。

### 5.1 `README.md`：冻结协议

三臂定义、阈值、案例、Task 工作集、统一运行控制、工具目录对等、Stage 0 至 4、评分规则、产物布局、环境、命令。其中记录了一条对等性陷阱：状态机组在 `system-prompt/assemble` 把模型可见目录过滤到当前阶段白名单，可见集是 `mounted ∩ PHASE_TOOLS[phase]`，而策略组是全部 mounted，所以并集相等要求 policy 与 floor preset 恰好挂 15 个工具、不多不少。

### 5.2 `cases/manifest.json`：36 案例 / 252 Attempt

12 真实执行加 24 行为。语义语料 787 文件，digest `3e92e14415a5ba80…`；manifest digest `4f29ae2e9b7e3edc…`。每案例带来源 `case_id`、内容 digest 与 oracle 状态。

Task 工作集设计成单一固定信封，只有目标行与绝对日期按案例替换；只读约束、验收条件、证据要求、预算在 36 个案例与 3 个臂之间逐字节相同。这有双重承重：让票面「Task 工作集逐字节相同」检查平凡成立；并阻止信封泄露案例类别，因为若验收条件写「期望提出澄清问题」，就等于把答案交给了歧义案例的模型。所以验收条件同时陈述四种行为的策略，由模型自己判断哪条适用。

生成器内建不变式检查：常量段唯一性、无 SQL body 泄露、无限定表名泄露、无期望值数字泄露（绝对日期是唯一豁免）。这个检查抓到了本 session 自己的 bug：第一版朴素地检查 `includes('SELECT')`，被只读条款「只允许 SELECT 查询」触发，于是改成检查 `FROM` / `JOIN` / 限定表名 / 期望值数字。

绝对日期写全是刻意的：相对日期问题曾让历史 harness 生成 2025 年区间却仍被判正确，所以把日期歧义移除而不是测量它。

### 5.3 24 个行为案例

每类 6 个，由 `cases/generate-challenge.mjs` 产出，结构同构，避免评分规则误只适用于一类。

歧义案例扎根在实测确认存在的歧义上：账号与角色主体分裂（`user_type` 2 与 3），同一个「日活」问题在 `univ_acc_act_di` 与 `univ_role_act_di` 上 ds=20260805 分别是 4336 与 4563；含券总额与现金收入（`pay_type=1`）；`com_pay_order_di`（分）与 `finance_pay_order_di`（元）的单位分裂；ARPU 与 ARPPU。每张表各自声明 `disambiguation.term_defaults`，所以没有单一默认能跨候选表消解该词，正是票面「多个仍成立且无默认」的条件。

无 grounding 案例用 grep 验证过语义层中完全不存在的域：直播、竞品、工单、客服满意度、小程序、周边，各 0 个文件命中。刻意避开广告、投放、买量、ROI、实名、舆情，这些确实存在，在那里拒答是错的而不是对的。

### 5.4 两份臂 preset

`presets/generate-presets.mjs` 从 phase-gate 源码抽出 `BASE_PERSONA`（1571 字符）写进两份 preset，字节相等由构造保证而非手抄。共享 persona 逐字不改是最保守的选择：票面把「额外的阶段说明、控制标记、续跑注入」命名为被测 intervention，隐含基础 persona 恒定；自拟一份精简 persona 会让本 session 成为第二个变量的作者，并可能让某一臂吃亏。已披露的唯一不自洽是共享 persona 提到只有状态机组有门的 route token 与 `【incomplete】` 标记，策略插件忽略它们，对两臂都不构成优势。

12 个 tool row 注册 15 个工具名（`tool-scope-routing` 注册 2 个）。两臂唯一差异是 `enforce_admission` 的真假，已用 YAML 解析验证。

顺带发现一个真 bug：`@deepseek-ai/dsh-persona` 的 `text:` 自 commit `40792330c0` 重命名为 `prefix:` 起就是死键，但三份已发布 preset 仍用旧拼写，分别是 `packages/bundle/data-agent/presets/data-agent/d-bare-react.cordis.yml:19`、`b-free-react-planning.cordis.yml:24`、`packages/bundle/data-agent/presets/semantic-layer-management/agent.cordis.yml:26`。这些 row 会在缺失必填 `prefix` 上校验失败，`mountPreset` 抛 `agent-preset/invalid`，preset 根本不会 join，且没有 CI 检查覆盖 `presets/**`。本 session 的新 preset 用 `prefix:`。这条不在票面范围内，值得单独开票。

### 5.5 `src/guardrails-policy.ts`：策略组插件

两项职责。

critic context：`critique_sql_tool` 与 `evaluate_sql_quality` 读 `ctx.get('criticCtx')` 且 fail closed，候选集为空时 critic 把每张被引用表标 `table_not_in_candidates`，confidence 落到 0.5 或更低，admission 规则 2 永不通过。所以插件发布同形状 `forAgent(agentId)` 的 `criticCtx` 服务，用镜像 phase-gate `captureToolData` 的采集填充。四个采集辅助函数 `normalizeSql`、`collectTableNames`、`isCandidatesEmpty`、`collectFields` 在 phase-gate 里是模块私有，只能转写。

admission：`enforce_admission` 为真时用单调 `ctx.tools.guard` 在四条规则不全满足时拒绝 `query_data`。选 guard 缝是刻意的，它在可重排的 `tools/pre-execute` waterfall 之后运行且不可被撤销拒绝，其 reason 字符串以 `Error: <reason>` 原样到达模型，这是本插件给出的唯一反馈。插件从不调用 `agent.inject`。

预算强制不受 `enforce_admission` 约束：统一运行控制对三臂含 floor 一致，所以 `query_data` 上限在插件里，模型调用数与墙钟由 runner 负责。关键设计是 `pendingSql` 与 `admitted_sql` 分离，使「critique 一条好 SQL、然后执行另一条」在规则 4 上失败。

### 5.6 测试：30 个通过

覆盖四条 admission 规则各自独立拒绝、格式化等价 SQL 仍准入、修订后重新 critique 可重新准入、guard 不拦非 `query_data`、floor 臂不继承任何 admission 拒绝但仍守统一预算、错误结果永不采集、失败查询仍计入预算、按 agent 隔离状态、快照 JSON 安全。

关于 parity 测试的一次自我纠正值得记录。最初用源码文本比对来钉采集函数，它失败了 4 项，但差异全是形式的：转写的 TS 被转译后类型擦除、引号统一、分号补齐，而 `if (!x) return` 与 `if (x) { … }` 语义相同却文本不同。那个方法既会误报也会漏报真正的逻辑改动。本 session 没有放宽断言，而是换成行为 parity：用 phase-gate 自己的 stub ctx 构造真实 `PhaseGate`，把同一串 tool result 同时喂给它的 `onPostExecute` 和策略插件的，再比对采集出的 critic context，覆盖 6 种 tool result 形状加一整条真实序列，并断言共享集合非平凡（`candidate_tables.size > 3`）以防空断言。另外断言两个下限确实来自 phase-gate 的 `PipelineConfig`（0.6、60、8），使两臂不可能漂移。这钉住了唯一要紧的事，即两臂交给 critic 的候选表、事件参数、分区列完全一致，且走的是 phase-gate 的真实代码路径而非它的副本。

### 5.7 `vitest.config.ts`

根配置的 include 是 `packages/*/*/tests`、`apps/*/tests`、`scripts/**`，都到不了 `wayfinder/`；加宽根 include 会把一次性实验测试拉进全仓每次跑，所以做了作用域配置。

解析要显式 alias 而非 `vite-tsconfig-paths`：本实验不是 pnpm workspace 包、没有自己的 `node_modules`，pnpm 隔离布局只把 `@deepseek-ai/*` 链进各消费包，向上走找不到；而 `vite-tsconfig-paths` 只对 tsconfig 自身 include 范围内的文件生效，`wayfinder/` 在范围外。所以直接读 `tsconfig.base.json` 的 484 条映射转成 Vite alias。深路径（`pkg/src/x.ts`，`nl2sql-engine` 在用）需要独立的锚定正则，否则 Rollup 的字符串 alias 语义会吞掉子路径并产生重复的 `src/src/`。

## 六、诚实披露

`ea6ecc07d4` 这个 `map.md` commit 混入了父 effort 的在途编辑。本 session 按路径显式 stage，但那个文件本就带着父 effort 未提交的修改（初始 `git status` 里的 `M wayfinder/task-orchestration-dag/map.md`）。commit 是 16 增 10 删，本 session 的段落只占约 2 增 1 删，其余是父 effort 对 Destination、两条 Notes、ticket-frontier 树、G1 与 G3 的 Decisions-so-far 条目的改动。

没有任何内容丢失，其余 23 个父 effort 修改文件仍正确处于未 staged 状态。没有对 CJK 内容做危险手术，而是 amend 了 commit message 明确披露。抓到它的正是 CLAUDE.md 要求的删除侧审计（`git diff --cached | grep "^-"` 并为每条删除给出理由），这条纪律确实值钱。

## 七、剩余工作

待建：`src/session-observer.ts`、`src/controlled-runner.ts`、`src/score.ts`、`src/analyze.ts`、`fixtures/fault-sidecar.mjs` 及各自测试，然后 Stage 0、1、2、3、4 与 `report.md`。

下一步最该先做的一件事是验证 preset loader 能否在 `tsx/esm` 下 import 一个 `.ts` plugin row。两份臂 preset 都依赖 `name: '../../src/guardrails-policy.ts'`（`classifyRowSpecifier` 把 `.` 开头判为 `preset` kind、相对 preset 自身目录解析），但「preset row 直接 import 原始 `.ts`」在本仓是未经验证的路径。这是整条策略臂的单点依赖，值得在写更多代码之前用一个最小 smoke 证伪或证实。若不行，退路是把插件改为编译产物，或由 runner 在 `setup(agentCtx)` 内以 isolate group 方式程序化挂载。

两个已知实现风险已写进代码注释。第一，若 `criticCtx` 未落在 isolate realm，`dsh-agent-presets` 的 `leakedServices` 守卫会拒绝整个 preset；若消费者被留在 realm 外，`ctx.get('criticCtx')` 返回 undefined，则每条 SQL confidence 落到 0.5 或更低、admission 永不开启。两份 preset 已按 `packages/bundle/data-agent/presets/data-agent/agent.cordis.yml:47-89` 的形状把 provider 与两个 critique 工具包进同一个 `isolate: { criticCtx: true }` group。第二，Stage 2 的 252 个 Attempt 按预检实测单次约 125.8 秒、并发 3 估算约 2.9 小时，需在有网络与凭据的主机环境跑，且沙箱拒绝、DNS 错误、provider 不可达、`spawn maxc ENOENT` 一律记为 infra failure，不得转成模型 wrong。

G25 保持未解决，按票面要求留给下一个决策 session。

## 六、Stage 1 执行 checkpoint

真实 Attempt driver 已实现并运行。每个 Attempt 新建 Cordis root、Agent、Session、audit database 与 sidecar，使用 `aga` / `qwen3.7-max`、scope `10000251`、最多 20 次模型请求、最多 8 次 `query_data`、300 秒墙钟上限和一次仅 `TRANSPORT` 可重试的 provider retry。原始 Session、查询 outcome、运行环境、observation、Grade Record 与失败详情写入忽略目录 `eval-results/g25a/raw/`；可提交摘要不含 credential、Authorization header、完整查询行或最终回答。

前两批无资格 smoke 均保留在原始 Evidence Cut 中。`g25a-smoke-2026-09-17-0ae7653c-2a77-4e2a-b1b1-9ea000c737b3` 在 Agent 创建前因 runner 从 `eval-cli` 的局部依赖集合解析 `cordis-plugin-include` 而使 18 个 Attempt 全部成为 infrastructure failure。改用完整 pnpm closure 后，`g25a-smoke-2026-09-17-17aa2980-dcf7-4691-addd-508c009d66e6` 暴露第二个设施缺陷：host `ToolRuntime` 从构建产物加载，而 `tsx/esm` 下的 `AgentLoop` 从源码加载，两个私有 scheduler symbol 不同，首个 tool call 均以 `Cannot read properties of undefined (reading 'prepare')` 结束。host 模块统一改为源码加载后，聚焦 boot regression 通过。

第三批 `g25a-smoke-2026-09-17-ce1745d4-945c-44fc-9384-e6b162b1c94e` 完成全部 18 个 Attempt，没有 infrastructure failure。五个真实案例的 reference SQL 在批次前后都与 expected value 一致且 digest 稳定；15 个真实案例 Attempt 都保留可读成功查询 outcome；所有 Attempt 的 Task working set 与首个模型请求都包含冻结的绝对日期。原始证据位于同名 run directory，可提交摘要位于 `experiments/g25a-phase-gate/results/smoke-summary.json`。

该批次仍不能通过 Stage 1，因为冻结的 Session tool-union parity 与必需的 persistent-failure path 冲突。`g25a_fail_01` 的 policy 和 floor arm 从首个请求暴露全部 15 个工具；state-machine arm 在 UNDERSTANDING、GENERATION 与 EXECUTION 间累计暴露 11 个工具，并在连续 transport failure 后直接输出正确的无数据结论，没有进入一个暴露 `compute`、`present_decomposition`、`present_table` 与 `suggest_followups` 的 INTERPRETATION 请求。因此，对该必需 case 要求三臂 Session `request/header` union 完全相同，会把正确的提前拒答路径判为 protocol failure；除非修改 case 行为或 parity 规则，否则该 gate 无法稳定满足。

同批次还暴露并修复了一个不改变外部执行的 scorer-safety 检查缺陷：controller 的重复启发式把拒答中的日期和重试次数当作确定业务数值。controller 现在复用 scorer 的 refusal-aware `confidentBusinessConclusion` 分类；`2026-08-05 的数据不可得，4 次查询均失败` 的回归测试先红后绿。按照冻结协议，修复设施后本应从头重跑 18 个 Attempt，但当前同时存在上述协议矛盾，因此停止进一步外部运行，没有启动 Stage 2，也没有冻结 Stage 2 run identity。

建议下一次用户决策只修订 parity 的观测方式：保留 Stage 0 对三份 preset 完整挂载工具目录一致性的静态证明，并把 Stage 1 的动态检查改为“state-machine 每个 request/header 都是冻结 15 工具目录的子集，且 Session union 不含额外工具”；不要要求 persistent-failure path 必须进入与任务无关的 INTERPRETATION 工具阶段。批准或拒绝该修订后，必须从头重跑全部 18 个 smoke Attempt。

## 七、Amendment 4 与通过的 Stage 1

用户于 2026-09-17 批准 path-sensitive dynamic tool parity：Stage 0 继续证明三个 preset 的完整挂载目录都是同一组 15 个工具；Stage 1 与 Stage 2 要求独立策略组和诊断下限组暴露该完整目录，并要求完整状态机组的每个 `request/header` 目录都是其子集且没有额外工具。正确地在后续阶段之前结束的 case 不需要为了目录相等而进入无关阶段。

修订后从头执行的完整 smoke run `g25a-smoke-2026-09-17-99ff461f-904e-47fb-8195-e192e9dca7f5` 通过全部 Stage 1 gate，共 18 个 Attempt，三组 infrastructure failure 均为 0。五个真实案例的 reference SQL 在批次前后都匹配 expected value 且 digest 不变；15 个真实案例 Attempt 都有可读成功查询 outcome；每个首个模型请求都包含逐字节相同的冻结 Task working set 与绝对日期；scorer safety negative control 通过。Smoke 不进入 Stage 2 效果统计。

当前没有冻结 Stage 2 run identity，也没有消耗 decision Attempt。下一步先完成 Stage 2–4 的执行、封存、评分、盲化复核包与报告生成路径；最终代码再次通过 Stage 0 和完整 Stage 1 后才能冻结并启动 252-Attempt decision batch。
