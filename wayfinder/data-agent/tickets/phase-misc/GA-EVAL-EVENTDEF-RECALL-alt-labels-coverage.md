# GA-EVAL-EVENTDEF-RECALL — event 检测的召回被 alt_labels 覆盖率卡死（453 个事件只有 6 个有）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) Resolution（2026-09-06——精度问题已解决且 0 FP，**召回成了下一个瓶颈，且形状已完全清楚**）
**Blocked by**: 无
**Blocks**: 无（(a) 已 land，本票是纯增量收益）

---

## Question

(a) 的两段式检测精度是干净的（FP=0，两跑一致），但**召回只有 6/18**——12 个 event case 全部死在第一段：词法预筛找不到任何候选。原因是硬的：**scope 内 453 个事件定义里只有 6 个填了 `alt_labels`**（`game.recharge` / `game.role.create` / `game.coin.change` / `game.item.change` / `game.DungeonOnkeyPass.{begin,end}`）。`game.card.gacha` 没有「抽卡」，`game.role.online` 没有「登录」，`game.pvp.begin` 没有「对战」。

**怎么把候选生成扩宽，而不把 FP=0 弄丢？**

## 证据（2026-09-06，39 case real-exec + judge-only 双跑）

被检测到的 6 个 event case，**计算全部正确**（119/125/126 三次 attempt 精确命中 live 值；135/057 只差 fen/yuan 单位；136 两次精确 + 一次瞬时失败）。**没有一个是因为「不知道表名」失败的。**

12 个未检测到的照旧以 (a) 之前的方式崩坏：

| case | 失败形态 |
|---|---|
| 129 / 123 | 把**事件名当表名**：`FROM \`game.card.gacha\`` → Table not found；幻觉出 `game.yanwu.match` 后诚实拒答 |
| 124 / 127 / 130 | 全 null-SQL（decline → retry exhaust）|
| 120 / 128 / 121 | 退回 DWS 表出错值（120→4563 = DAU、128→409865、121→63876）|
| 056 / 122 / 137 / 138 | 混合（用账号 DAU / 邻近但错的口径 / 诚实拒答）|

即：**召回每多一个，就多救一个 case**——收益直接、可预测，不像精度那样有回退风险（漏检的失败模式是「退回 (a) 之前」，不是静默错值）。

## 候选方向（待 grill，非穷举）

- **(A) 跑现成的 alt_labels enrichment**。`packages/data/semantic-layer/src/enrichment.ts` 已有 CL-1 Phase 3 的两轮 alt_labels 发现（确定性抽取 + LLM 建议，`mergeAltLabels` 保留人工策划的条目）。**先查它为什么只覆盖了 6 个事件**——是没对 events 跑过、还是跑过但大部分事件被跳过？若只是没跑，这是最省的一条路，且顺带提升 BM25 召回（corpus `description` 打包 alt_labels）。风险：LLM 生成的别名可能引入泛词，反而制造新的 FP 候选——但第二段 LLM pick 正是为此存在的，需重跑 FP 探针验证。
- **(B) description-mining**。事件 `description` 里有特定名词（「创角事件」「现金券」），风险门记录过「过生成」。可作为 (A) 的补充：从 description 抽候选短语但不写回 YAML，只用于检测。
- **(C) BM25 event-candidate 抽取**。风险门测过 BM25 **0/4** 不返事件定义（只返 DWS 表或该事件的 *metric* 条目）。但 metric 条目**带 host 事件名**（`game.item.change__..._cnt`）——从命中的 metric 反查 host 事件，可能绕过 BM25 对事件定义本身的失灵。这条没测过。
- **(D) 直接扩大 LLM 段的输入**。跳过词法预筛，把 top-N BM25 候选 + 问题交给 qwen3.7-max 判。成本 ↑（候选多 → prompt 长），且失去「泛词命中才进候选」这道便宜的把关——FP 风险最高，需要重新做完整的 FP 探针。

## 工作清单

- [ ] grill 方向（A-D 或组合）。**先做 (A) 的前置调查**：`enrichment.ts` 的 alt_labels 发现有没有对 events 跑过？只有 6 个的原因是什么？
- [ ] 任何改动都必须重跑 `packages/eval/eval-cli/dev/event-detect-fp-probe.ts` 确认 **FP 仍为 0**（严格定义：DWS→event **和** event→错的 event 都算 FP）。当前基线 TP=6/FP=0/TN=21/FN=12。
- [ ] 12 个 FN 里有几个是「扩了 alt_labels 就能救」的？（`card.gacha`+「抽卡」直接救 121/128/129/130 四个——单条别名收益最高）
- [ ] 注意 137/138 是**规则性 NONE**而非词法 miss（「付费的角色」「新增且…的角色」按泛词规则回 NONE），扩召回救不了它们——它们需要的是口径判断，可能本就该 NONE。

## 备注

- 与 [GA-EVAL-CASESET-EVENT-ANCHOR](GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md) 正交但相关：召回上去了，能被 execution_match 观测到的 event case 变多，而那些 case 的期望值 16/18 是 stale 的——**两票都解开才能在 real-exec 上看到数字动**。
- 检测成本：每个有词法候选的问题 +1 次 qwen3.7-max 调用（~2-3s，按 question 缓存）。扩召回会让更多问题进入 LLM 段 → 成本随之上升，需要算一下。
