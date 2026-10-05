# DA-MAP2 — ticket 的 Status **值** 与实际状态对账

**Type**: task  ·  **Phase**: misc  ·  **Status**: open
**Assignee**: unclaimed
**Blocked by**: —
**Blocks**: 任何依赖「`**Status**` 是状态唯一来源」这条约定的查询（含 [map.md](../../map.md) Notes 里的 frontier 命令）
**Surfaced by**: [DA-MAP1](DA-MAP1-map-hygiene.md)（2026-10-06）

## Question

[DA-MAP1](DA-MAP1-map-hygiene.md) 解决的是**可解析性**：`tickets/` 下 246 份票现已全部带可解析的 `**Status**`（实测 0 份缺失）。
剩下的是**准确性与可机读性**——Status 字段写对了没有、能不能被一条命令正确分类。

map 的 Notes 现在用这条命令代替「读 map 查 frontier」：

```sh
grep -rLiE '\*\*Status\*\*:?[^A-Za-z]*(resolved|closed|archived|dropped|folded|superseded|shipped|implemented|grilled|reverted)' \
  --include='*.md' wayfinder/data-agent/tickets | grep -vE 'README|调用文档'
```

它返回 **46** 份（2026-10-06 实测，default locale 与 `LC_ALL=C` 结果一致）。
这 46 份**不全是真前沿**——里面混着 Status 写法有问题的已结票。本票把这 46 份逐一对账。

## 已确证的两类缺陷（DA-MAP1 session 实测，非推断）

### 1. Status 值与实际状态矛盾

- [R-DA-CLIENT-RUNTIME-DECOMMISSION](R-DA-CLIENT-RUNTIME-DECOMMISSION.md) —— 票头写 `**Status**: open`，
  但该工作已落地（fork-only 僵尸包 `packages/client/runtime` 已删，Follow-on-3-B shard 收口），
  [map.md](../../map.md) 的 Decisions-so-far 已把它记为 closed 决策。
  **两处必须一致**；按 wayfinder「一 session 一票」，DA-MAP1 未擅自翻它的状态。

### 2. Status 值是叙事而非状态

- [P3 subagent-qoder](../phase-1/P3-subagent-qoder.md) —— Status 读作
  `Unblocked（T1 resolved 2026-08-19）→ claimed 2026-08-19 → **resolved 2026-08-20**（…）`。
  真实状态 resolved 埋在第三段，任何「取 Status 开头词」的查询都会把它误判成未关闭。
  规范形状应是 `**Status**: resolved (2026-08-20)`，历程写进正文。

## 验收

1. 46 份逐一判定：真前沿 / Status 值写错 / Status 是叙事；后两类改成规范值（历程移进正文）。
2. 改完重跑上面那条命令，输出 == 真前沿集合，且该集合与各票正文自述一致。
3. 规范值词表写进 [tickets/README.md](../README.md) 的取票流程节
   （⚠ 该 README 在 translation-pairing corpus 内：改 `README.md` 必须同步 `README.zh.md`
   并 `--write` 重录 `README.i18n.yaml`，否则 `verify-translation-pairing` 会红）。

## 相邻指针（不属本票，也不单独开票）

- 仓库根有未追踪的 `analyze-real-exec-gap.mjs`（5,646 B，2026-09-04，GA-EVAL-REAL-EXEC 的 gap 分析脚本）——
  应归入 `scripts/` 或 `.tmp/`，由原 session 决定去向；一个未追踪文件不值得单开票，在此留指针。
- `prompts/next-session-2026-09-12-post-pr117-merge.md` 还有 1 处 U+FFFD（2026-10-06 实测，
  整个 `wayfinder/**/*.md` 仅此一处）—— 见 [map.md](../../map.md) 的 Out of scope 条目，归 parallel-dev-cleanup。

## Answer

<!-- 待认领 -->
