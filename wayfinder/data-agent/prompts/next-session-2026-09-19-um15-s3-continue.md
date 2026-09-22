# Next session — finish UM15 §3 third re-sync（serial merge，multi-session）

> **承接** 2026-09-14 session-4（3 PR 连落 origin/master `8ace277bce`→`726a680ac6`：#126 tracker + #127 UM-FORK-README resolved + #128 UM-LINT-B resolved；UM15 §3 第三轮 re-sync 开工 **2/6 seam**，停在 `dsh-s3-resync` mid-merge）。
>
> **本 session 目标**：把 UM15 §3 第三轮 re-sync **收完**——36 个 out-of-seam 冲突 + 余 4 个 seam（seam-5 → seam-1 → seam-3 → seam-6），多 session。UM4 与 UM15 §2/§4 是**显式 defer 的 backlog**，本 session 不碰，除非用户改主意。

---

## ⚠️ 0. 头号铁律：核工具，不信 prompt 里的数字

**上 session 一次抓到 4 类 stale fact**（都是前一版 prompt 写错/过时的事实，靠 preflight 实测才发现）：
- **拓扑**：prompt §0 记 master ahead 5、§9 记 ahead 2，**实测 ahead 7**。
- **Blocker 诊断**：handoff 说 lint error 是 `MODEL_EXPERIENCE_VARIANTS.includes` 类型 narrow，实际是 `RegExpExecArray.index !== undefined` 恒真（`gen-package-readme-skeleton.ts:585`）。
- **文件数**：handoff 说 stash 有 2 个 docs sidecar 要 unstage，实际 **3** 个（`grep -v README` 把 `docs/subsystems/README.i18n.yaml` 滤掉了）；且 stash 是 `-u` 建的，另带 4 个 untracked。
- **双基线**：corpus pairing baseline 说 21 实为 **22**；`check:ci:static` 说 39/9 实为 **40/9**（PR #127 enroll 了 `verify-package-readme-skeleton`，门数 48→49）。

**结论**：本 prompt 里的每个 SHA / 计数 / 行号，动手前用工具复核一遍。尤其 §3 是 stateful merge，基线错一位会误诊一整轮。

## 1. 拓扑事实（session 头 30 秒核验）

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git rev-parse origin/master            # 期望 726a680ac6（若 CI/他人推进则更新，以实测为准）
git rev-list --left-right --count origin/master...master   # 期望 0	0（本地已 FF 平）
git worktree list | wc -l              # 期望 8
git stash list | wc -l                 # 期望 3（stash@{0} 是 session-3 的 README apply，已 committed 但保留作安全网，勿 drop）
# §3 工作树的 mid-merge 状态（本 session 的主战场）：
git -C /Users/mckenzie/workspace/dsh-s3-resync rev-parse MERGE_HEAD   # 期望 c291e7961a51
git -C /Users/mckenzie/workspace/dsh-s3-resync diff --name-only --diff-filter=U | wc -l  # 期望 36
# map.md 守恒信号：
node -e 'const b=require("fs").readFileSync("wayfinder/data-agent/map.md");let n=0;for(let i=0;i+2<b.length;i++){if(b[i]===0xEF&&b[i+1]===0xBF&&b[i+2]===0xBD)n++;}console.log("U+FFFD:",n)'  # 期望 13
```

- **主树 4 个 untracked**（session-3 stash `-u` 带出，故意不 commit，3 个在 HANDS-OFF 路径）：`docs/adr/0002-ui-presenter-composition-plan-b.i18n.yaml` + `wayfinder/task-orchestration-dag/research/G13-{agent-runtime-correlation,distributed-execution-protocols,dsh-correlation-surfaces}.md`。**永不 `git add -A`/`git add .`**，只显式 stage。
- **票账**：39 文件 = 37 票 + 2 非票 doc（`UM-flow` / `UM-session-summary`）。**37 = 3 open + 1 blocked + 26 resolved + 6 archived + 1 folded**。
  - open：**UM15**（§3 停 2/6 seam）· **UM4**（defer）· **UM-FORK-README-GENERATOR-RESIDUALS**（新，2 项 generator 残留）
  - blocked：**UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS**（新，等 eval-team 答 3 问）
- **dsh-root build breakage 仍在**（UM12/UM16 tracked）：主树 pre-push `typecheck`=`build:lib:host`（tsc+tsdown）在 master 基 fail（tsdown 解析不了 `lib/types/{index,invariant,startup}.js`）；**推非 master ref 一律从 `dsh-resync` 工作树推**（那里 built）。

## 2. §3 是本 session 的全部——resume 序列已在 UM15 票里

**别在这里重抄步骤**。完整的 8 步 resume 序列 + 5 个 dry-run/RISK-MAP 漏掉的发现，已逐条写在
[`UM15-durable-upstream-sync-method.md`](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) 的 `[2026-09-14]` 节（§三 Resume 序列）。**先读那节**，它是本 session 的作战手册。摘其不可违的前 5 步顺序：

1. **`tsconfig.base.json` 先解**——它红着，全仓 vitest 一个测试都跑不起来（`vite-tsconfig-paths` 解析失败 → 全局 `setupFiles` 的 oxc transform 挂 → 每次 vitest abort 0 tests）。**这是本 session 头号发现，dry-run 都漏了。**
2. **`pnpm install --no-frozen-lockfile`**——upstream 新增包 `packages/util/chunked-list` 依赖 `zod`，无 `node_modules` 会让 `tsc -b` build graph abort 并级联 ~28 个幻影 TS 错。冲突中的 `pnpm-lock.yaml` 是这一步的前置。
3. translation-pairing 三件套 pass（16 文件）
4. manifest/misc union pass（4 文件）
5. regenerated-artifact pass——**`packages/typert/generator/src/analyzer.ts` 必须第一个**（阻塞后面所有 spec）；其余 regen artifact 用「take upstream generator + 重跑 fork regen」，不做三方合并
6. genuine three-way pass（余下需读语义的）
7. build 完成后回头**重验 seam-2 的 `remote-events.ts(32,5) TS2322`**（未判 benign）
8. 按 RISK-MAP 序推余 4 seam：**seam-5 → seam-1 → seam-3 → seam-6**

### 已完成（session-4，勿重做）
- **seam-4**（client/modules，LOW）：0 冲突，auto +66/-53 across 7 files，13 文件 byte-identical to upstream，**94/94 tests pass**。
- **seam-2**（api/gateway+api/remotes，MEDIUM）：2 冲突各 1 hunk（`api/remotes/src/client/index.ts` L164-172 + `api/remotes/package.json` L91-97），union 解，**292/292 tests pass**。`grep identifyHost` 全仓 0 hit → 无需 co-adapt。
- **dry-run 的 37-missed 预测精确命中**：39 总 = 2 in-seam + 37 out-of-seam，merge-tree SHA `9820baebad1c` bit-for-bit 复现。

### 5 个发现（RISK-MAP/dry-run 漏的，UM15 票 §二有全文）
① `tsconfig.base.json` = blocking-all-verification（非 routine）· ② 强制 `pnpm install`（upstream 新包）· ③ RISK-MAP 错判 seam-4 导出面（`optionalStringArray` 不从 `./client` re-export，无害）· ④ seam-6 变易（`WorkspaceFileResource` co-adapt moot，全仓 0 hit）· ⑤ seam-6 另一半仍 pending（`ui-sidebar-files/src/client/face.ts:55`）。

### 完成 §3 后
- 在 `dsh-s3-resync` 上 `git commit -F <tmpfile>`（0 unmerged 后 git 才允许）→ 从 **`dsh-resync`** 推 A-path → PR → `gh pr merge --merge`。
- UM15 §3 → resolved（§2/§4 仍 open-deferred，视情况把 UM15 整票留 open 只标 §3 done，或另开 §2/§4 票——你判）。

## 3. Backlog（本 session **不做**，除非用户点名）

| 票 | 状态 | 为什么 defer | 解锁条件 |
|---|---|---|---|
| **UM4** Scope 3 | open | observer-fix 根因未验证——需交互式 DSH 跑 JSONL capture（new-conversation → 选「取数模式」→ send → 读 `~/.dsh/storages/sessions/<id>.jsonl` 的 `turn/end.reason.reason.kind`），agent 驱动不了 UI | 用户跑 capture 贴回 `disposed`/`error` |
| **UM15 §2**（knownRed[] schema + Check 4）| open-deferred | 设计已在 UM15 票 §2（含 draft entry），但 land 需接 §4 一起 grilling | 与 §4 配对 grilling |
| **UM15 §4**（waiver expiry）| open-deferred | 改 `upstream-sync-record.ts`（804L）的 `collectGitFailures` note→failure 语义，需独立 spec+test；expiry 窗口（N 轮 zero-hit）是人判断 | 用户 calibration + 专项 grilling |
| **UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS** | blocked | 等 eval-team 答 3 问（`tsconfig.host.json:131` 整包 exclude 原因 / tests tsconfig emit-vs-noEmit / 是否扰动常驻 eval 机器）| 用户拿到 eval-team ack |
| **UM-FORK-README-GENERATOR-RESIDUALS** | open | 2 项：`verify-package-readme-model-experience` 在 `packages/bundle/data-agent/README.md` 上 pre-existing 红 + generator anchor-in-codeblock latent bug（当前 inert，重跑 retrofit 即复活）| quick，可穿插 |

## 4. Context budget（~500-750K）

| Phase | Tokens |
|---|---|
| Preflight + 读 UM15 票作战手册 | ~20K |
| §3 前 5 步（tsconfig.base + install + pairing 16 + manifest 4 + regen）| ~150-220K |
| §3 three-way pass + 重验 seam-2 | ~80-120K |
| seam-5 + seam-1 解冲突 + testHotspots | ~120-180K |
| seam-3 + seam-6（若预算够）| ~100-150K |
| commit + push A-path + verify | ~40-60K |
| handoff + map snapshot | ~30-50K |
| **Total** | **~540-800K**（若只到 seam-1 即停，~370-500K）|

**Checkpoint**：§3 是多 session 的。**每解完一个 seam 就是一个合法 handoff 点**——mid-merge 是可续状态。剩预算 <150K 时停在 seam 边界、写 handoff，别硬冲留半解 seam。

## 5. 铁律

1. 仅用 `mcp__local__*`；**从不 `--no-verify`**。
2. commit `-F` + 显式路径；**永不 `git add -A`/`.`**（4 个 untracked 故意不进 commit，3 个在 HANDS-OFF 路径）。
3. `.worktrees/{r10,t1,g10}` + `wayfinder/evaluation/` + `wayfinder/task-orchestration-dag/` **完全 hands-off**。
4. `edit_file` BLOCKED on `wayfinder/data-agent/map.md` → node Buffer byte-splice；splice 后核 **U+FFFD=13** + 字节数守恒（**别复制任何 U+FFFD 字节进新文本**——那个计数是损坏信号，污染它就废了）。
5. **§3 是 serial git merge，不是 workflow**——单工作树 stateful。per-seam 解析已并行完成（RISK-MAP.md）；merge 本身串行。
6. **`dsh-s3-resync` 是 §3 的唯一战场**，`dsh-resync` 是推送载具（保持 clean）；`stash@{0}` 保留勿 drop。
7. 推非 master ref 从 `dsh-resync` 推（主树 pre-push typecheck fail）；PR 走 A 路径。
8. **测试坑**：vitest 用**显式 spec 路径**——`--dir <pkg>` 会忽略 `projects` config 跑全仓（>10min，orphan workers）；`--reporter=basic` 在 vitest 4 不存在。

## 6. Reference

- **§3 作战手册**：`UM15-durable-upstream-sync-method.md` 的 `[2026-09-14]` 节（Resume 序列 + 5 发现 + durable-method 评价）
- **combat map**：`research/next-session-2026-09-14/um15-s3-seam-analysis/RISK-MAP.md` + `seam-{1..6}.json`（priorityRank + 每 seam testHotspots）
- **dry-run**：`research/next-session-2026-09-18/um15-s3-dry-run-report.md`（37-missed 已被本轮精确验证；但它也漏了发现①②）
- **上 session plan**（本 prompt supersedes）：`prompts/next-session-2026-09-18-parallel-remaining-um.md`
- **本 session 3 PR**：#126 `d8d55f7149`（tracker）· #127 `2886e5b8e5`（UM-FORK-README，`1d39160a09`）· #128 `726a680ac6`（UM-LINT-B，`66aec7aa78`+`aa250b598a`）
- **map.md session-4 entry**：`## Upstream merge 2026-09-07` 节末尾 `[2026-09-14] session-4` bullet
