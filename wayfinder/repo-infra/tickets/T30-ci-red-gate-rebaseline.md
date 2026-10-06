# T30 — 红门清单重建基线（批 0）

**Type**: task
**Status**: open
**Part of**: [repo build and CI gate credibility map](../map.md)
**Mode**: AFK
**Blocks**: [parallel-dev-cleanup R4](../../parallel-dev-cleanup/tickets/R4-ci-red-gate-policy.md)（策略票无可信集合即无法定案）
**Assignee**: unclaimed

## Question

map 的「当前真实红门清单」标的日期是 **2026-09-16**，并写明「供下一会话直接接手」。
2026-10-06 复查：那之后 `origin/master` 落了 **350 个 commit**，`ci-master.yml` 跑了约 **12 次**，
而本 map 在这三周内**没有一次文档更新**。

**需交付**：一份当前 master 上**可信的**红门集合，取代那张清单。
在它交付之前，五张票（R4 的策略划分、T12 的接力、以及三笔欠确认的账）都没有可靠输入。

## 为什么是「批 0」

本票不修任何红门，但它是**一次 CI 运行同时结四件事**，性价比最高：

1. **重导红门集合**（取代 2026-09-16 的清单）。
2. **回答 [T12](T12-windows-native-complete.md) 的接力问题**：`windows node 24 / native tests`
   （`ci.yml:673`）现在红不红？T12 已判 moot（它命名的 `native complete` job 不存在），
   但 native lane 本身的状态未知。**若红则另开新票，不复用 T12 编号。**
3. **收割三笔欠确认的账**（本域验收 = 连续两次真实运行，目前各只有一次或零次）：
   - [T19](T19-windows-projection-cache-durability.md) — `cache.spec.ts` + `fixtures.spec.ts`
     的四条断言（`windows node 24 / coverage`）
   - [T20](T20-windows-codex-and-catalog-budget.md) part 2 — `gen-client-catalog.spec.ts` 的预算项
   - [T23](T23-gate-descendant-walk-overflow.md) — `collectDescendants` 不再把全绿报成红
   - 另：[T14](T14-ci-workflow-startup-failure.md) 欠的「首个真实 PR 运行出现 `ci.yml` 的 job」
4. **判定 [T24](T24-headless-deepseek-idle-budget.md) 的遮蔽是否仍在**——它决定 snapshots lane
   那一段清单的可信度（见下）。

## 已知的起点（2026-10-06 实测，仅供对照，不作结论）

- `ci-master.yml` 最近一次完成运行 `35982768309`（2026-09-24，head `6a9a034869`）：
  红的是 `python runtime / macOS and Linux ARM64` 的 **node24-macos-arm64 / node24-macos-x64 /
  node24-linux-arm64** 三腿；绿的有 `windows node 24 / wine`、`python runtime / … / plan targets`
  与 whl；`serial / windows|linux|macos`、两个 benchmark 为 skipped。
- **这三条 python runtime 腿不在 2026-09-16 的清单里** —— 清单列的是
  `node 24 / coverage`、`windows node 24 / coverage`、`node 24 / snapshots and artifacts`。
  红门集合确实已经变了，不只是数字变了。
- `ci-master.yml` 与 `ci.yml` 的 job 集合不同（前者 master-push，后者 PR）。
  **两边都要重导**，否则清单只覆盖一半。
- 2026-09-16 的清单里 `python runtime / node24-linux-x64` 曾被 R4 记为「25 个 preset 插件缺 dep，
  已修（本地 exit 0）」—— 现在红的是 macos/arm64 三腿，须判定是同族未尽还是新债。

## Scope

1. 在当前 `origin/master` 上取得 **`ci.yml` 与 `ci-master.yml` 各一次完整真实运行**
   （PR 侧可用一个仅含文档改动的 PR 触发，避免引入新变量）。
2. 逐 job 导出 conclusion，再对红 job 逐一下钻到失败断言/step，**映射到现有票或标为无票**。
   无票的按本 map 既有惯例开新票，并在本票记一行指针。
3. 对上面第 3 条列的四笔欠账，逐条给出**本次运行的证据或其缺失**
   （「未再出现」须说明该用例确实跑了，而不是被 fail-fast 跳过——这是 T24 遮蔽过的坑）。
4. 用新清单**整段替换** map 的「当前真实红门清单」节，并标注运行 id、head sha、日期。
5. 若清单与 2026-09-16 版有增减，逐项说明（新债 / 已修 / 重构掉 / 改名）。

## 不接受的做法

- 从 CI 日志之外推导清单（本票存在的理由就是上一份清单变成了传闻）。
- 只跑一个 lane 就宣布清单完整。
- 把 fail-fast 遮蔽下「没报错」当成「通过」——[T24](T24-headless-deepseek-idle-budget.md)
  排在 snapshots lane 最前且遮蔽其后 85+ 条 replay，这一点必须在清单里显式标注。
- 顺手修红门。本票只重建基线；修复由各自的票承接。

## 验收

- map 的「当前真实红门清单」节带有运行 id + head sha + 日期，且两个 workflow 都覆盖。
- 每条红门都有归属票（或明确标注「无票」+ 开票指针）。
- `windows node 24 / native tests` 的状态有明确答案（T12 接力闭环）。
- T19 / T20 part 2 / T23 / T14 各有一行「本次运行是否构成其欠的那次确认」。
- 被 fail-fast 遮蔽而未实际执行的用例，在清单里与「已跑且绿」区分标注。
