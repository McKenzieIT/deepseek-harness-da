# Next session — UM6 docs/subsystems（保 fork data-agent + 接受 upstream 其它）

> UM6 Scope 落地（est ~1 session）。**Blocked by UM4** — 只在 [UM4](../tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md) 完成后启动。

## 0. 前提就位（UM4 未完成前不认领）

- UM4 apiproxy 重落户 + presetSwitches → data-agent 已 resolved（apiproxy 现在的所在决定了 `docs/subsystems/*.md` 的目录归属）
- Cluster D 的 subsystem-pages 决策就位（若 waive/fix，影响本票的 5 项 subsystem-pages 违规）

## 1. 目标

处理 [UM6](../tickets/phase-upstream-merge/UM6-docs-subsystems-keep-data-agent.md) 的 docs/subsystems merge policy：**保留 fork 侧 data-agent 相关 doc**（`docs/subsystems/data-agent.md` + zh + i18n.yaml），**接受 upstream 其他 subsystem doc 的更新**。

## 2. 前置检查

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git status --short   # 期望：clean
git log --oneline -3 -- docs/subsystems/ 2>&1  # 期望：最近变更来自 UM4/gen-doc-graphs
grep -c 'data-agent' docs/subsystems/README.md 2>&1  # sanity
```

## 3. Scope 具体清单

1. `docs/subsystems/data-agent.{md,zh.md,i18n.yaml}` — 保 fork 版本
2. `docs/subsystems/*.md`（其他） — 若 upstream 有更新，采纳（3-way merge with careful review of any fork-only additions）
3. `docs/subsystems/README.md` 的 subsystem 列表 — 保 fork 版本（含 data-agent 条目）
4. 处理 `verify-subsystem-pages` 5 项 pre-existing 违规（若 Cluster D 决策 waive，则登记 waiver；若 fix，则按 UM6 scope 补 package-group README + docs/subsystems 页面链接）

## 4. 铁律（same as parent session prompts + 特化）

- 特化：`docs/subsystems/data-agent.zh.md` 是**手写双语对**（不是 gen-doc-graphs 生成物之一），编辑后必须 `verify-translation-pairing --write docs/subsystems/data-agent.md`
- 其他标准铁律 same as UM4 session prompt

## 5. Estimated session count: ~1

（若 upstream subsystem doc 有大改动需 3-way merge → ~1.5）

## 6. Handoff

1. `map.md` 追加 `[YYYY-MM-DD] UM6 resolved: docs/subsystems merge policy applied ...`
2. UM6 → resolved
3. Commit + push (A 路径)
