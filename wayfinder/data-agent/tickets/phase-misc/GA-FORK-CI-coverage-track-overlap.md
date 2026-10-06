# GA-FORK-CI — coverage 独立轨道与 R4 / T11 / T30 的归属重叠

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: parallel-dev-cleanup + repo-infra 的 CI 红门归属 scoping session，2026-10-06
**Size**: S（只需一个归属判定，不含修复）  ·  **Risk**: Low
**Related**: [UM18](../phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md)（coverage 轨道的起点账本）、[GA-FORK-CI-green](GA-FORK-CI-green.md)（红门总账）、[parallel-dev-cleanup R4](../../../parallel-dev-cleanup/tickets/R4-ci-red-gate-policy.md)、[repo-infra T11](../../../repo-infra/tickets/T11-test-coverage-failing.md) / [T30](../../../repo-infra/tickets/T30-ci-red-gate-rebaseline.md)

> **本票由外部 session 开立。** 2026-10-06 有一个 session 在重整
> `wayfinder/parallel-dev-cleanup/**` 与 `wayfinder/repo-infra/**` 的 CI 红门归属，
> 发现一处与本 map 重叠。按并行 session 边界，**该 session 不编辑本 map 的 `map.md`**，
> 跨 map 产出只允许新建 ticket 文件 —— 本文件即是。**归属判定权在本 map 的 owner。**

## 背景：2026-10-06 刚立的三方归属口径

那次 scoping 把「CI 红门」拆成三件互不复制的事，并写进了两张 map 的 Notes：

| 谁 | 持有什么 |
|---|---|
| **parallel-dev-cleanup**（R4 / R3 / R6） | 门禁**策略**：哪些 check 进 required、非 required 的处置（修 / 冻结已知基线 / 明示放弃）、branch protection、直推许可集 |
| **repo-infra**（T18–T30） | 红门的**逐项修复**；并作为红门集合的**权威来源** |
| **data-agent**（`GA-FORK-CI-green` + UM 系列） | **总账**与**合并期重基线** |

这个分工本身是对既有事实的批准，不是新发明——`repo-infra/map.md` 与
`data-agent/map.md:613`（「这是跨 map 的仓库卫生，属 parallel-dev-cleanup 的 territory，R4/R5 在那儿」）
早已各自写过一半。

## 问题：coverage 这一项落在三个格子的交界上

[UM18](../phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md) 已 closed，
其 Status 写明：唯一残余项 **coverage 已按用户确认剥离为「独立长期轨道」**，
起点账本 = UM18 §1 + 终局棒数节 + 文末「coverage 独立轨道【第一棒】」节，
并声明这是**专项边界**判定而非 map 级 out-of-scope。

同一个 coverage 债同时出现在另外两处：

1. **作为策略对象** → `parallel-dev-cleanup` 的 **R4**。coverage 是 R4 四个候选都必须处置的一项，
   且 R4 的两个候选（「先修再开」与「冻结已知基线」）都卡在同一个未决问题上：
   **「新代码带来的新债怎么办」**——R4 实测过 coverage 一天内多 1 个文件（`eval-cli/src/event-detect.ts`），
   所以对它而言 coverage 是**移动靶**。
2. **作为逐项修复** → `repo-infra` 的 **T11**（2026-10-06 已判为 `ledger`，不再承接修复）
   与 **T30**（批 0，重建红门基线）。

三者并不矛盾，但**没有一处写明边界**，所以同一项债有三个看起来都有效的 home。

## 需要本 map 的 owner 定的

1. coverage 轨道归 data-agent 自己持有，还是按新口径移交 repo-infra 的逐项修复轨？
   （若留在 data-agent，建议在本 map 写一行「coverage 不走 repo-infra 的逐项轨」，
   否则下一个读 repo-infra 的 session 会以为 T30 之后该由 repo-infra 接。）
2. 无论归谁，**R4 的那个前置问题谁回答**：「新代码持续产生新的 per-file 覆盖缺口，门禁怎么办」。
   这条不回答，任何 coverage 基线都要天天更新，等于没有门禁。
   注意 UM18 已记录一条相关约束：`scripts/coverage-exempt.ts` 与上游逐字相同、无任何 da 条目，
   且**用户已否决「把 da 包加进豁免名单」**（会让今后所有 da 代码脱离覆盖率约定）。
3. `GA-FORK-CI-green`（Status 仍 `Open`）作为红门**总账**，与 repo-infra 现在声明的
   「红门集合权威来源」如何共存？建议：总账记**归属与历史**，集合的当前值引用 repo-infra，
   两边都不自存快照。这是新口径里「三方互不复制对方的数字」想避免的那种重复。

## 为什么值得单独一票

重复记账在本仓已经造成过可观测的代价，且有实测证据：

- `parallel-dev-cleanup/R4` 本地存过一份六门规模快照，**一天内就漂移**
  （static 17→4、coverage 512→516），一个月后更含一个**已不存在的 job 名**
  （`windows node 24 / native complete`；现为 `ci.yml:673` 的 `native tests`）。
  该快照已于 2026-10-06 删除并改为指针。
- `Issue lifecycle` / `Issue policy` 这一个事实曾在**四处**记账
  （parallel-dev-cleanup R5、repo-infra T6、semantic-layer CB-5、本 map 的 UM2），
  而它其实早在 2026-09-07 就由 UM2 的 re-land 解决了（`2fa038f6e6`），
  parallel-dev-cleanup 直到 2026-10-06 才补记——**一个月里那张 map 一直把它当未决项**。

coverage 是目前仅剩的、仍有三个 home 的那一项。

## 验收

- coverage 轨道有**唯一** owner，并在本 map 写明（哪怕结论是「留在 data-agent」）。
- 「新代码的新债」这一问题有归属（本 map 或 R4，二选一）。
- `GA-FORK-CI-green` 与 repo-infra 的权威来源关系写明，双方不再各存一份集合快照。
