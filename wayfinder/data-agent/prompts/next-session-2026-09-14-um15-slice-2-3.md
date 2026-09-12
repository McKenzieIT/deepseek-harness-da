# Next session — UM15 slice 2 / 3（durable upstream-sync method 后续片）

> UM15 §1 + §5.2(c) slice 1 已 land（`b3a516fe98`+`c579b809d2`）；§2-§5 首片已完（`2eb5b4a850` 起若干 commit）。**本 session 承接 §2 后续 (CI wiring) + §3 cadence 触发器实测 + §4 slice 2/3**（est 2-3 session）。

## 0. 前提就位

- UM15 首片 durable method 实现完（§1-§5 + lefthook 门 + `verify-gate-coverage.ts` + upstream-sync-record git 层 + `upstream-sync.json` waivers + `upstream-status` report），见 [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) 2026-09-15 update + `2eb5b4a850`
- Cluster D grilling 决策就位（若批 hybrid，§2 meta-gate manifest 需登记 3 WAIVE/KNOWN-RED 决策 + 2 FIX 决策的 GREEN 状态）
- upstream tracking ref `c291e7961a51` ≠ record `c389f96bf3a9` — cadence 触发器已响，需量 commit count + seam touches vs 150/14d/seam>0 阈值判是否启第三轮 re-sync

## 1. 目标

**Sub-A (§2 CI wiring 首片)**: Cluster D 5 决策落 §2 gate-coverage manifest：
- FIX 2 门 (`verify-config-catalog` + `architecture-graph zh`) 接入 `ciSharedStaticGates` 或 `hygieneLeafGates`
- WAIVE 2 门在 `upstream-sync.json` 加 pattern-level waiver（`documentation standard tests` per-package + `verify-package-dependencies` fork-plugin peer+dev pattern）
- KNOWN-RED 1 门 (`verify-client-ui-i18n`) 登记 gate-coverage manifest 的 permanent-known-red 列表
- 完成后 `verify-gate-coverage` 应对 5 门 all clean（不再列 exemption）

**Sub-B (§3 cadence 触发器实测)**: 已响应的 upstream tracking drift `c389f96bf3a9..c291e7961a51`：
- 量化 commit count + seam touches vs 阈值（150 commits / 14 days / seam>0）
- 若达阈值：启第三轮 re-sync，走 durable 流程（首次真实检验）
- 若未达：暂缓，登记 cadence-not-yet-triggered 状态

**Sub-C (§4 slice 2/3)**: durable upstream-sync-record 剩余项落地：
- 三道 integrity gate 的深化（内容采纳检查 §2.4.bis 的实装）
- upstream-sync.json waivers 的自动化维护（waiver expiry / regeneration）

## 2. 前置检查

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git status --short   # 期望：clean
pnpm run verify-gate-coverage 2>&1 | tail -10   # 期望：baseline exemption list (若 D 未 apply 尚未减 5)
git ls-remote upstream refs/heads/master 2>&1 | head -1   # cadence 分析用
git log --oneline c389f96bf3a9..c291e7961a51 2>&1 | wc -l   # commit count for threshold
```

## 3. Scope 具体清单

**Sub-A**：
1. 读 `scripts/verify-gate-coverage.ts` + gate-coverage manifest（`2eb5b4a850` 引入）；理解 manifest schema
2. Cluster D 5 决策的 manifest 表现（FIX 转 GREEN、WAIVE + rationale、KNOWN-RED + rationale）
3. 若 FIX 2 门代码工作未做，先做（`gen-config-catalog` + `verify-translation-pairing --write` for config-catalog；`gen-architecture-graph.ts` 加 zh region-splice for architecture-graph）
4. `upstream-sync.json` waiver 条目 for `documentation standard tests` + `verify-package-dependencies`
5. gate-coverage manifest 更新 for 5 门

**Sub-B**：
1. `git log --oneline c389f96bf3a9..c291e7961a51 -- packages/**` 逐 seam 触及分析（seam 3/4/5/6 覆盖的包）
2. commit count 数 + days 数 + seam>0 触及数
3. 判决：启第三轮 re-sync / 暂缓

**Sub-C**：
1. §2.4.bis 内容采纳检查（`F==B, U!=B, M!=U` 模式的 gate 实装）
2. waiver expiry mechanism（`upstream-sync.json` 每条 waiver 加 `expires_at` field，`verify-upstream-sync-record` 到期告警）

## 4. 铁律（same as parent + 特化）

- 特化：改 `verify-gate-coverage.ts` 或 gate-coverage manifest 需与 UM15 §2 spec 断言对齐（`scripts/verify-gate-coverage.spec.ts` 若存在）
- 其他 same as UM4 session prompt

## 5. Estimated session count: Sub-A ~1 + Sub-B ~1 + Sub-C ~1-2 = **~3 session**

Cluster D apply 前置：若 D 决策未 apply（Sub-A 依赖它），需先做那部分再进 §2 manifest 更新。

## 6. Handoff

1. `map.md` 追加 `[YYYY-MM-DD] UM15 slice 2/3 sub-{A,B,C} landed via ...`
2. UM15 追加 Resolution 节
3. Commit + push (A 路径)
