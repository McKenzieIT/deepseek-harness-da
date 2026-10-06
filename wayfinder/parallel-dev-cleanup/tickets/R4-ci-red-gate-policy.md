# R4: 哪些 CI check 进 required —— 门禁策略

**Status**: open
**Branch**: 未认领（认领时按 CLAUDE.md 声明 `<type>/r4-<slug>`）
**Blocks**: [R3](R3-branch-protection.md)
**Blocked by**: repo-infra [T30](../../repo-infra/tickets/T30-ci-red-gate-rebaseline.md)（见下「为什么本票等 T30」）

## Question

master **无分支保护**（2026-10-06 复测 `gh api repos/McKenzieIT/deepseek-harness-da/branches/master/protection`
→ **404 Branch not protected**，与 2026-09-06 同），所以 CI 的红从未拦住任何 merge —— **CI 目前是装饰**。

**需决策**：哪些 gate 进 required、其余怎么处置（修 / 冻结为明示的已知基线 / 明示放弃）？

## 本票不持有红门的规模数字

红门的**逐项修复与规模**属 [repo-infra](../../repo-infra/map.md)（T18–T30）；本票只持有**策略**。

2026-09-06 本票曾在此本地复制一份六门规模快照（coverage/static/snapshots/python/windows 的失败计数）。
一天后它就漂移了——本票自己记过「static 17→4、coverage 512→516」。2026-10-06 再查，
那份快照已落后 **350 个 commit**，且其中一门命名的 job 根本不存在了
（`windows node 24 / native complete`；`ci.yml:673` 实为 `windows node 24 / native tests`，
见 repo-infra [T12](../../repo-infra/tickets/T12-windows-native-complete.md) 判 moot）。

**结论：策略票不复制规模数字，只持有「规模由谁持有」。** 权威来源：

- 当前红门集合 → repo-infra map 的「当前真实红门清单」节
- 该清单自身的漂移 → repo-infra [T30](../../repo-infra/tickets/T30-ci-red-gate-rebaseline.md)（重建基线）

### 为什么本票等 T30

「哪些 gate 进 required」是对一个**集合**做划分。在那个集合既过期、又含一个不存在的成员时定案，
得到的是对过期集合的策略。T30 交付可信清单后本票才能动——这条边是 2026-10-06 scoping 的派生结论，
不是原始票面。（唯一不依赖清单的候选是候选 4「接受现状」。）

## 候选

1. **先修再开**：全修绿，required 全量。代价最大，且对 coverage 是**移动靶**——
   新代码持续产生新的 per-file 覆盖缺口（本票 2026-09-07 实测一天内多 1 个文件）。
   选它必须同时回答「新代码带来的新债怎么办」。
2. **分级 required**：只把「确定性、且当前可绿」的 gate 设为 required，其余降级 informational，
   各自开欠债票逐步收。② 的 `verify-no-production-src-on-master`（PR #6 merged）是最该第一个进 required 的。
3. **冻结已知基线**：把当前失败集合冻结为明示基线，CI 改判「不得**新增**失败」而非「必须全绿」。
   需 baseline 文件 + 比对逻辑 + **baseline 更新流程**。可行性已被 2026-09-06 审计证明
   （coverage 双向差集为空 = 确定性可比对；windows 抖 ±3 = 该机制对 flake 有判别力）。
   与候选 1 同一个未决问题：新代码的新债。
4. **接受现状**：不开 protection，CI 保持装饰，靠 session 纪律 + lefthook。
   明确写下来，免得后来的人以为 CI 在把关。**这是唯一不依赖 T30 的候选。**

## 一条跨候选的约束：确定性 vs flake 要分开处置

红门里有**两类**东西，不能用同一种策略处置：

- **确定性的债**（失败集合逐字节可复现）——可直接修，或可冻结进基线。
- **不稳定的 flake**（失败集合 run-to-run 抖动）——「修好了」无法用单次运行验证。
  **进 required 之前必须先有 flake 率实测**（同 commit ≥3 次重跑）。

这条判别已在本域多次被证明是决定性的：repo-infra
[T20 part 1](../../repo-infra/tickets/T20-windows-codex-and-catalog-budget.md) 是 4 次运行里失败 1 次，
[T25](../../repo-infra/tickets/T25-atomic-write-lock-eperm.md) 至今只有一次观测。
把这类项设为 required 等于把 merge 权交给调度运气。

## 与其他票的关系

- **阻塞 [R3](R3-branch-protection.md)**（required 集合）。R3 的另一个前置是
  [R6](R6-master-direct-push-permission-set.md)（直推许可集）——两者独立，R3 等的是**两条决议，不是红门归零**。
- **[R6](R6-master-direct-push-permission-set.md)** 原本是本票的「附带决策」一节
  （CLAUDE.md 措辞 vs `PROD_SRC_PATTERN` 不一致）。2026-10-06 剥离：它不是 CI 门禁问题，
  且零依赖红门、可立即取。
- **[R5](R5-issue-workflows-upstream-only.md)** 曾被本票标为「最便宜可先做的一块」——
  **已 resolved**（guard 已在 master 生效）。它不再是本票的一部分。
- **repo-infra [T29](../../repo-infra/tickets/T29-da-ci-upstream-boundary.md)** 持有「哪些 workflow 改动
  该留在 DA 自己的 lane、哪些不该碰上游共享 workflow」。分工：**T29 决定 lane 归属与 upstream 边界，
  本票决定 required 集合**。两票都不决定对方。
- **data-agent 的 coverage 独立轨道**（UM18 剥出）与本票的 coverage 策略重叠 →
  [GA-FORK-CI-coverage-track-overlap](../../data-agent/tickets/phase-misc/GA-FORK-CI-coverage-track-overlap.md)。

## 验收

- 定案：required 集合 + 非 required 的处置方式（修 / 冻结基线 / 明示放弃），写进 map。
- 若选候选 1 或 3：回答「新代码带来的新债怎么办」，否则基线要天天更新，等于没有门禁。
- 若选候选 3：baseline 文件格式 + 比对脚本 + baseline 更新流程定下来。
- 凡进 required 的 flake 类项：先给出 flake 率实测（同 commit ≥3 次重跑）。
- R3 解除本票这一侧的阻塞（或明确记录为「不开 protection」）。
