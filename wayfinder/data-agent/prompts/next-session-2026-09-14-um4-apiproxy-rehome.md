# Next session — UM4 apiproxy 重落户 + presetSwitches → data-agent

> UM4 Scope 首片 apply（真代码工作，est 2-3 session）。承接 UM11 后清完成 + [UM-QODER-SUBAGENT-RETIRE](../tickets/phase-upstream-merge/UM-QODER-SUBAGENT-RETIRE.md) §A resolved 后的 unblocked 状态。

## 0. 前提就位（复核不重跑）

- UM1/UM3 archived；R-DA-CLIENT-RUNTIME-DECOMMISSION Phase 1+2 resolved（2026-09-10 已释放）
- PR #119 merged @ origin/master `9ffb7b3eed` + Cluster A/B/C tracker commit chain merged via PR #120 @ `b06ac7364a`
- Cluster D grilling 决策就位（若批 hybrid，`verify-package-dependencies` WAIVE 为架构 pattern，不再阻塞新 workspace peer/dev 声明；见 [UM-C-GATES Resolution 2026-09-13](../tickets/phase-upstream-merge/UM-C-GATES-UPSTREAM-NEW.md#resolution)）

## 1. 目标（本 session 首片）

推进 [UM4](../tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md) 的 Scope 首片：**apiproxy 重落户 + results-RPC 迁移**。分两个可分割子目标：

1. **Sub-A**: apiproxy 从 harness 内层重落户到 data-agent bundle。涉及包：`packages/api/remotes` + `packages/data/apiproxy`（若存在）+ bundle 挂载点重指。
2. **Sub-B**: results-RPC 迁移（T8/T9/T10/T11/T12/T13 residual）。涉及 result-cache 的 remote 层（`@deepseek-ai/dsh-result-cache/src/remote.ts`）+ 上下游 consumer。

**presetSwitches → data-agent** 从当前 fork 通用位置迁到 data-agent bundle-scoped 位置（相关：B-DA1-preset-switch-tool-interrupt-race 票）。

## 2. 前置检查（session 头 30 秒）

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git status --short   # 期望：clean
git rev-parse master origin/master  # 期望：一致（本 session 从 origin/master 起跑）
grep -c 'U+FFFD' wayfinder/data-agent/map.md 2>&1  # noise; 用 node byte scan
node -e 'const b=require("fs").readFileSync("wayfinder/data-agent/map.md"); let n=0; for(let i=0;i+2<b.length;i++){if(b[i]===0xEF&&b[i+1]===0xBF&&b[i+2]===0xBD)n++;} console.log("U+FFFD:",n);'  # 期望：13
# 复核 UM4 未开工的具体面
grep -rEn 'apiproxy|results-RPC|presetSwitches' packages/api/remotes packages/data/apiproxy 2>/dev/null | head -20
```

## 3. Scope 具体清单（apply 前需 slice-first-decide）

需先做数据切片，不要盲改：

1. 列出 `packages/api/remotes/src/` 下所有 apiproxy-related exports + 消费者
2. 列出 `packages/data/result-cache/src/remote.ts` 的 RPC 契约 + T8-T13 各自的 delta scope
3. 判断哪些是「重落户」（同代码换位置）vs「重构」（跨包重写）

## 4. 铁律（same as parent session prompts）

1. 只用 `mcp__local__*`；sh 非 bash；`export CI=true`
2. commit `-F` 文件；`git add` 显式路径；不 `--no-verify`
3. 不碰 `wayfinder/evaluation/` + `.worktrees/r10-harness-goodhart` / `.worktrees/t1-exec-grader`
4. `edit_file` BLOCKED on `wayfinder/data-agent/map.md` → 用 node Buffer byte-splice
5. 推非 master ref 从 `dsh-resync` worktree 推；PR 走 A 路径（`gh pr merge --merge`）
6. 改源码后跑全量 `check:ci:static`（若 Cluster D FIX 2 门已接入 CI，需与其 baseline 对齐）

## 5. Blocks / Unblocks

- **Blocks**: [UM6](../tickets/phase-upstream-merge/UM6-docs-subsystems-keep-data-agent.md) (docs/subsystems，待 apiproxy 重落户完成)
- **Blocked by**: 无（Cluster D 决策已就位）

## 6. Estimated session count

- Sub-A (apiproxy 重落户): ~1 session
- Sub-B (results-RPC 迁移): ~1-2 session
- 合计 UM4: ~2-3 session

## 7. Handoff (session 末)

1. `map.md` 追加 `[YYYY-MM-DD] UM4 首片 sub-{A,B} landed via ...`
2. UM4 追加 Resolution 节，Status 若未全 done → `open (残余 slice)`
3. Commit `-F` + explicit paths，不 push（沿 tracker discipline）或走 A 路径 push
