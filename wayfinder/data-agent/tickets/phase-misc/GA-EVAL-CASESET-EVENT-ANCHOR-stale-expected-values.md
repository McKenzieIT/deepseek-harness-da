# GA-EVAL-CASESET-EVENT-ANCHOR — event-case expected values are not a frozen anchor

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) Resolution（2026-09-06——(a) 让 agent 逐字生成 case 119 的 reference SQL，case 仍判 `wrong`；实测发现 16/18 event case 的 `expected.result_value` 已与自己的 `expected.sql` 不符）
**Blocked by**: 无
**Blocks**: 任何用 real-exec `execution_match` 衡量 event-case SQL 正确性的票（含 [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) 的 criterion #1、[GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) 的功效计算）

---

## Question

`rbi-10000251-exec` 的 event case 用 `match_mode: scalar_exact` 对一个约一个月前抓取的数值打分，但**原始事件视图 `ieu_ods.ods_10000251_all_view` 的历史分区不是冻结的**——同一条 SQL、同一个 `ds=20260805`，今天返回的值与 case 里记录的不同。DWS 汇总表没有这个问题。

所以：**event case 该怎么被 real-exec 评分？** 这不是「把值刷新一遍」那么简单——刷新只在下次漂移前有效。需要定一个能长期成立的口径。

## 证据（2026-09-06 实测，`packages/eval/eval-cli/dev/case-expected-value-audit.mjs`）

把每个 case **自己的 `expected.sql`**（`{{ds_yesterday}}`→`20260805`）实跑，与 `expected.result_value` 对账：

| data_source | MATCH | STALE | SKIPPED（多行/非数值） | 合计 |
|---|---|---|---|---|
| **event** | 2 | **16** | 0 | 18 |
| **dws** | 13 | **0** | 8 | 21 |

- event 两个 MATCH 都是 `0 == 0`（056 登录账号 UV、130 付费抽卡次数——reference SQL 本身返回 0，本身可疑，见下方工作清单）。
- 漂移幅度：057/135 `773500 → 2409900`（3.1×）、121 `33503 → 46306`、127 `33564 → 45845`、126 `2774223 → 3413512`、119 `510 → 552`、136 `432 → 482`、120 `4314 → 4530`、125 `4327 → 4545`。
- **方向不单调**：137 `288 → 259`、138 `48 → 39` 是**降**，其余是升。所以「迟到数据持续追加」能解释多数但不能解释全部——只能确证「该分区不稳定」，机制未证。
- **DWS 侧一个都没漂**（036 dau=4563、037 dau=4336、038 新增=552、040=259、046=67.81415370005114 全部逐位相符）→ 不是全局数据重建，是 ODS 原始视图与 DWS 汇总表的**稳定性差异**（DWS T+1 算完即冻结）。

**两个被误记在 agent 头上的数**：[GA-EVAL-SQLGEN-FOLLOWUP](GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md) 记录「119 att3 → 552 vs exp 510 错值」「136 att3 → 482 vs 432 错值」。552 和 482 正是这两条 reference SQL **今天的实测值**——模型当时算对了，判错的是仪表。据此，audit-log 里「real-exec 瓶颈 = SQL 正确性/错值」这一结论对 event case 至少部分失效。

## 候选口径（待 grill，非穷举）

- **(A) 重锚 + 定期重锚**：把 event case 的 `expected.result_value` 刷成实测值，并加一条 CI/cron 定期重锚。简单，但把「eval 是回归门」变成「eval 追随数据」——数据漂了就静默改期望值，掩盖真实回归。
- **(B) 换 match_mode**：event case 改用容差比较（相对误差 ±x%）或「非零 + 数量级正确」。保留回归检测力，但要定 x，且 3.1× 的漂移超出任何合理容差。
- **(C) 冻结快照表**：把 `ds=20260805` 的相关事件切一份物化快照表进 `ieu_cdm`，case 指向快照。真正的冻结锚点，但要建表 + owner + 存储成本，且改动 case 的 `expected.sql`（偏离「真实生产表」的初衷）。
- **(D) event case 退出 execution_match 评分**：只用 SQL 语义 judge + SQL 形状断言（FROM 表/event 过滤/params 提取）评分。承认「值不可锚」，改测「SQL 是否正确构造」。但 [GA-EVAL-REAL-EXEC](GA-EVAL-REAL-EXEC-judge-vs-exec.md) 已测出 judge false-pass 35.9pp——退回 judge 等于退回那个已知不可信的信号。
- **(E) 相对锚**：expected 存「与另一条 SQL 的关系」而非绝对值（如 119 == 038 同日同口径）。本次实测正好显示 event view 与 DWS 在 038/119 上**都是 552**，这条关系可能比任一绝对值都稳。

## 工作清单

- [ ] grill 口径（A-E 或组合）——核心权衡：eval 作为**回归门**（需冻结锚点）vs 作为**正确性度量**（需跟随真实数据）。
- [ ] 查 056/130 为何 reference SQL 返回 0（登录账号 UV=0、付费抽卡次数=0 都不合理）——可能 reference SQL 的 event 名/过滤写错，是独立的 case 质量问题。
- [ ] 查 137/138 为何**下降**（288→259、48→39）——与其余上升方向相反，可能另有机制（沙盒过滤？分区重算？）。
- [ ] 定下口径后，回填 [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) criterion #1 的测量（该票已按 live 值重锚做过一次一次性评分，见其 Resolution）。
- [ ] 同步检查另一处：DWS 侧 8 个多行期望值本次 SKIPPED 未验（需镜像 runner 的行集匹配器）——它们可能也漂了，只是没测。

## 备注

- 工具已落地：`packages/eval/eval-cli/dev/case-expected-value-audit.mjs`（`ONLY_DS=event|dws|all`）。原始输出存 `wayfinder/data-agent/research/artifacts/case-expected-value-audit-{event,dws}-20260906.log`。
- case set 在仓库外未 git 追踪（`packages/eval/eval/cases/rbi-10000251-exec/`，源 `reverse-bi/eval-cases/10000251/`）——`git clean` 会丢；任何重锚方案要先解决它的持久化。
- 与 [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md) 相关但不同：EXPAND 是 case 数量/功效维度，本票是**已有 case 的期望值可信度**维度。n=39 的 MDE~20pp 之上，还叠了 16/18 event case 结构性不可过——真实可测样本比看起来更小。
