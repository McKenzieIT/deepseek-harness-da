# P8b — audit 生产包硬化

**Type**: prototype
**Phase**: 2
**Status**: Blocked by P9

**Question**: P8 audit 生产包（`packages/data/audit` TS + 真实 Cordis `ctx.on`）的剩余决策 + 接线。

P8 prototype（`../prototypes/p8-audit/`）已 validated 形态（zod 镜像 + 3 表关系型 + 所有权 guard + G3 Credits + Tier-2 hash + cross-scope 索引 + override immutability，6 场景全绿）。P8b 是其生产态。

## 待解决策（P8 surfaced tensions）

1. **override-of-identity 策略**：patch `user_id`（误归属修正）经点路径纠正 read view，但 `audit_event.user_id` 列/索引/所有权 guard 仍看 original → 纠正后身份不可经索引查询、guard 查 original。RBI override 是 verdict 字段（非身份）。选项：
   - (a) 禁身份字段 patch（verdict-only；误归属只能 append 新记录 + tag 标记）——**倾向**（贴合 RBI + 保不可变）。
   - (b) 单独 identity-correction 更新列+索引（违背不可变，需新机制）。
   - (c) 接受不纠正。
2. **override-vs-聚合 策略**：`stats` SQL `SUM(json_extract payload)` 用 immutable payload，不反映 override（corrected totals 偏差）。选项：
   - (a) corrected totals 从 materialized view 重聚合（O(n)）。
   - (b) override 同时写「current view」投影列（额外列 + 写放大）。
   - (c) 接受 override 不入聚合（aggregates = immutable original）——合规对账用 corrected view 单独算。

## 接线（生产态）

- 真实 Cordis `ctx.on('tools/post-execute' | 'session/event')`（observe-only，必调 `next()`；替换 `harness-stub.mjs`）。
- P3 subagent-qoder 已落地（2026-08-20，`packages/subagent/subagent-qoder/`，terminal-only one-shot drain `query()` 终态 `result`）→ hook 真实 subagent-qoder tool 的 post-execute（终态 outcome + Credits 自动捕获，tag=`qoder_call`）。**P8 审 call outcome 非 internal tool/reasoning stream**（若 forensic 需 stream → 见 map Not-yet-specified 的 core-seam 变更票）。
- userId 从 **P9** login-state ctx 取（同 P3 `resolve(ref,{userId})` 读的 ctx）——P9 未建是本 ticket 的 blocker。
- Credits `total_credits?` 缺则 `getUsageInfo()`/`accountInfo()` fetch（P3 依赖，P3 已落地）。
- 真实包落 `packages/data/audit/`（data group wildcard 已在 `tsconfig.base.json`）+ `cordis.patch.yml` 预留 `# ── audit (P8) ──` 行 uncomment。

## Blocked by

- **P9**（per-user login-state ctx + 端点→user→scope 绑定 + PAT 自助 UI）。

## 前置

- **P8**（resolved 2026-08-20，prototype `../prototypes/p8-audit/`）。
- **P3**（resolved 2026-08-20，`packages/subagent/subagent-qoder/`）。
