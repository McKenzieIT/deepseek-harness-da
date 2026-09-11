# Next-session prompt — UM-flow Phase C 续：subagent 安全扫票（knip/fake-api/L6 + translation zh + UM-LINT triage；p2-*/master-sync 分析待 eval session 收定）

> 承接 `next-session-2026-09-18-reconcile-master-clear-pr115.md`（已执行完）。PR #115 **已 MERGED**（origin/master `607868e6a0`，parents `e064933dc8`+`7a20c4cb0a`）；§五 stale 前提已 §4 证伪（local master 是 origin/master 严格后代非分叉）+ 正确路径（merge local master `1ef40edaee` 进 resync `0301586bed`，21 wayfinder doc take-theirs，merge `7a20c4cb0a`）落地 + tracker 记录（commit `fc917a55d4` on master）。**本 session 未 push local master**（§六；master 与 origin/master 分叉——eval session 推了 `f3e46b3f20`，本 session 加了 doc `fc917a55d4`）。下 session 首要 = **subagent 并行只读分析多票 fix-plan → 主 session 串行应用安全可逆项**（线 D / UM-LINT / translation zh），p2-*/master-sync 仅分析、apply 须 eval session 收定。

## 一、决策历史（前提，勿再重决）

- **PR #115 MERGED**（2026-09-18）：origin/master `607868e6a0`。local master 46 commit 经 resync 着陆。§五 stale 前提（local master 是 origin/master 后代非分叉）已 §4 证伪——"merge origin/master→local master" 空操作、"push local master 清 PR" 反效果（5→~20）。
- **Phase A/B/C 大体 resolved**：UM10/13/14/16/ARCH/CORDIS-REGEN/R-DA Phase1+2/R-DA-UI-PRESENTER-COMPOSITION 全 resolved；UM-ADAPT per-shift 仍开。
- **UM15 首片（§1-§5 + lefthook）durable method 实现完**（在 origin/master 经 PR 着陆）。剩未来自动化 slice。
- **B 类 4 真回归**：markdown-links ✅ / agent-note-format ✅ / type-equivalence 🅿 known-red→UM-QODER-SUBAGENT-RETIRE / package-invariants 🅿 known-red→UM-INVARIANT-COMPANION-CLEANUP。
- **大原则**（用户 2026-09-15 锁定）：upstream 内容不改、上游最新是什么用什么；fork 自有按需重构。
- **UM-MERGE-INTEGRITY**：M1 复活 100/丢 2/回退 27（ui-settings 整包）、M2 全 0。三道完整性门已落（§4，在 origin/master）。waivers 录 `upstream-sync.json`。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| origin/master | `607868e6a0`（PR #115 merge，MERGED）|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，tip `7a20c4cb0a`（comprehensive merge），branch `upstream/resync-2026-09-08` **仅本地**（remote 已删 merged），工作树干净 |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip `fc917a55d4`（doc commit）on `f3e46b3f20`（eval R20 probe）on `1ef40edaee`，**ahead origin/master 2 / behind 2773，unpushed（§六）** |
| **eval session** | **活跃于 master**（本 session 期间推了 `f3e46b3f20`；可能再推；index.lock 警惕 §六）|
| `check:ci:static` | 36/11（本 session 零新增）|
| PR #115 | MERGED ✓ https://github.com/McKenzieIT/deepseek-harness-da/pull/115 |
| lefthook pre-push 三门 | 全绿（no-prod/typecheck/upstream-sync-record，本 session 真实 push 上跑过）|

### 分叉根因（master vs origin/master）
- origin/master `607868e6a0` 含 PR #115 merge（resync 2771 + evaluation R1+G1 + local master 46 commit）。
- local master `fc917a55d4` = eval session `f3e46b3f20`（R20 probe，eval-only）+ 本 session doc `fc917a55d4`，**不含** origin/master 的 PR merge 内容 → behind 2773；ahead 2（eval + doc）。
- 修法 = **eval session 收定后**，把 master 与 origin/master 合并/rebase（local master 46 commit 已着陆，`f3e46b3f20`+`fc917a55d4` 是 eval/doc 独立增量）。**非本 session 做**（eval session 活跃，§六）。

## 三、⚠ 并行铁律（违反必返工；本 session 又证 runner flaky）

1. 同一棵树禁止两 subagent 同时跑 build/gen-*/check:*（写 dist/lib/.tsbuildinfo，并发互坏）。
2. **主 session 独占写操作**（build/gen-*/git commit 串行）。
3. **subagent 只读分析 + 产出 patch 方案，不自己跑 build/gen/commit/改 repo 文件**。patch 写 /tmp，主 session cp/apply。
4. 单个 `verify-*` gate 只读，subagent 可跑；`gen-*` 写操作不可以。
5. 主 session + subagent 一律 `mcp__local__*`（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠 → `mcp__local__bash` 里 `grep -rEn`。`rg`/`grep -P` 不存在（BSD grep）。
6. node v24 强制：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。v25.9.0 系统默认 crash tsdown/rolldown/fs-ext。
7. shell 是 `sh` 不是 bash：不支持 `<(...)`，用临时文件 + `sort`/`comm`。多行 commit 消息用 `git commit -F <file>`（`mcp__local__write_file` 写 /tmp）。
8. **⚠ split-brain**：`mcp__local__*` 跑 Mac 上够不着 runner transcript。subagent 大交付（>~100KB 截断）让它自己 `mcp__local__write_file` 写 /tmp，主 session cp。
9. **⚠ subagent 瞬态故障**：长 subagent（>~15min/30+ calls）可能撞 `socket connection closed unexpectedly`。对策：① 先起最小 probe 验存活 ② 逐节派 ③ 增量写盘 ④ 给已验证锚点减探查。
10. **🆕（2026-09-18 新证）runner 本身 flaky——长 call 死**：长 heredoc 传输 / 大 bash 触发 `runner_gone runner disconnected mid-call`。**对策**：① **单次 write_file**（3 并行 write_file 全死；2 并行 runner 稳时可，不稳就单）② **短 bash**（无长 inline 内容——notes/scripts/commit-msg 一律 `mcp__local__write_file` 写 /tmp，再短 bash `node /tmp/x.js` / `cat /tmp/x >> f` / `git commit -F /tmp/msg` 跑）③ runner 断了重连后**先短 probe `echo x`** 验活再继续 ④ 幂等脚本（splice/append 都先 grep sig 防双插）。
11. **不 push**（§六；master 与 origin 分叉，push 须用户明确指示）。

## 四、方法论铁律

- **不轻信票据/prompt 里记的「已 verified」**。凡结论自己重跑（本 session 证：§五 前提 stale，21/21 take-theirs 是核过非盲）。
- **凡 gate 以 throw 形式失败，修完 throw 必须重跑并审 regen diff**。
- **🆕 `mcp__local__edit_file` 重编码 UTF-8 → 破坏既有 mojibake/U+FFFD**。编辑含 U+FFFD 的文件（map.md 有 13 个 pre-existing FFFD）**禁用 edit_file**，改用 **byte-level splice**（node `fs.readFileSync` 取 Buffer → `Buffer.indexOf(marker)` 定位 → 脚本先 `indexOf(sig)` 防双插 → `Buffer.concat([前, insertion, 后])` → `fs.writeFileSync` 原样回写；insertion 用 `mcp__local__write_file` 写 /tmp，splice 脚本 read raw bytes）。干净文件（0 FFFD，UM11/UM-flow 等）edit_file 无损仍可用，但 `cat >>` 更稳。**本 session byte-splice map.md 验：13 FFFD 不变、diff 纯插入零删除**。
- `~/.gitconfig core.symlinks=false` 让 tracked symlink 落路径文本——每次新 checkout 必查必修。
- **master 树 index.lock 警惕**（eval session 活跃）：任何 master 写操作前 `[ -f .git/index.lock ]` 核；locked 则 abort 等释放；commit 用 `git commit <pathspec>` 仅提交我方文件（不混 eval session staged）。
- **取 ours/theirs 前先核版本确比另一边新且更全**。

## 五、本轮编排（subagent 并行分析 → 主 session 串行应用安全可逆项）

### Phase 1：subagent 并行只读分析（fan-out，每 subagent 一票/一线，patch 写 /tmp）

> 全部 read-only：不 build/gen/commit/改 repo。先起 probe 验存活（rule 9）。增量写 /tmp（rule 8/9）。给锚点减探查。短 bash 读 /tmp（rule 10）。

- **S-D（线 D，knip+fake-api+L6）**：读 `knip.json`、`scripts/rescope-fork.ts:263-264`、`rescope-fork.spec.ts:132-137`、`packages/client/connection/tests/fake-api.client.ts`（删候选）、`packages/api/session-controller/tests/fake-api.client.ts`（⚠ 7 spec 用，**不可删**——核清两文件 import 关系，别误删）、L6 `application-entrypoints` 10 条 allowlist（`MANIFEST_BIN_ALLOWLIST`+`EXECUTABLE_SOURCE_ALLOWLIST` 在 `scripts/verify-application-entrypoints.ts`）。产出：逐项 patch（删哪文件、改 rescope-fork.ts 哪行、spec 改哪断言、L6 加哪 10 条）→ `/tmp/sd-patch.md`。
- **S-3（线 3，translation zh）**：读 `scripts/gen-doc-graphs.ts`（现只写英文→加 zh + `.i18n.yaml`）、`scripts/gen-module-graph.ts`（已写 md/zh/i18n 三件，作参考）。产出：gen-doc-graphs 改 zh 的 patch 方案 + regen 后 6 产物×3 文件清单 + `translation-pairing` 预期影响 → `/tmp/s3-patch.md`。**先做 zh 让 UM-QODER-RETIRE 退场级联干净**（退 Qoder 删 costs 触发 doc-graphs regen，只英文→regen 让 translation-pairing 变红；先 zh 则级联清零）。
- **S-LINT（UM-LINT-TYPEAWARE-CORDIS，93 lint 假阳 triage）**：跑 `pnpm run lint`（lint 不写，subagent 可跑）拿 93 finding，逐条判 false-positive vs real，false-positive 给 `// eslint-disable-next-line <rule>` 精确行 + 理由，real 归修复票。产出 → `/tmp/slint-triage.md`。⚠ 93 条多，逐节派 + 增量写盘（rule 9）。
- **S-p2（UM11 Scope 4-6，5 p2-* 逐内容审）**：读 5 个 `refactor/p2-*` 分支（`dsh-p2-present-table`/`-decomp`/`-suggest-followups`/`-uism-layer`/`-uism-vitest`）vs `eb9e4cf05c`（Phase-2 内容收编 commit），逐分支判已收编内容/未收编残留 → keep/delete 推荐。产出 → `/tmp/sp2-analysis.md`。⚠ **不可按 ancestry 判删**（Phase-2 是 cherry-pick/squash 收编，`merge-base --is-ancestor` 一律 false）。
- **S-master（master sync 分析，apply 须 eval session 收定）**：算 `fc917a55d4`+`f3e46b3f20` vs origin/master `607868e6a0` 的合并/rebase 方案（merge-base、冲突预测——eval+doc vs PR merge 内容，wayfinder doc 可能冲突）。产出 → `/tmp/smaster-plan.md`。**apply 仅 eval session 收定后**。

### Phase 2：主 session 串行应用（安全可逆项，每项 commit 前验）

> 串行：一次一票，apply 前 read subagent /tmp patch，apply 后 typecheck/verify，commit（pathspec-limited，不混 eval session）。reversible（local commit，`git reset`；不 push §六）。

1. **线 D apply**（最快，UM12 有精确 patch）：按 `/tmp/sd-patch.md` 删 `knip.json` + `connection/tests/fake-api.client.ts`（**再核非 `api/session-controller/tests/` 那条**）、改 `rescope-fork.ts:263-264` + `rescope-fork.spec.ts:132-137`、L6 加 10 条 allowlist。`pnpm run typecheck`（须过）+ `pnpm run verify-application-entrypoints`（C5 entrypoints 10→少）+ `pnpm run constraints`。commit `[wayfinder] 线D: knip+fake-api delete + L6 entrypoints allowlist (UM12 patch)`。
2. **UM-LINT apply**（若 S-LINT triage 清）：按 `/tmp/slint-triage.md` 给 false-positive 加 `// eslint-disable-next-line` + real 归票。`pnpm run lint`（93→少）。commit `[wayfinder] UM-LINT-TYPEAWARE-CORDIS: triage 93 findings`。
3. **translation zh apply**（若时间，S-3 patch ready）：按 `/tmp/s3-patch.md` 改 `gen-doc-graphs.ts` 加 zh 渲染 + `.i18n.yaml` 配对。`pnpm run gen-doc-graphs`（regen 6×3）+ `pnpm run verify-translation-pairing`（须过——本线主验）+ `verify-md-links`。commit `[wayfinder] 线3: gen-doc-graphs zh emission (UM-QODER-RETIRE 前置)`。
4. **p2-* apply**（仅 S-p2 analysis 明确安全 + **eval session 收定**）：删确认已收编无残留的 p2-* 分支/worktree。⚠ 5 个逐个核，不可批量。commit per-branch。**eval session 未收定则跳过**。
5. **master sync apply**（仅 eval session 收定）：按 `/tmp/smaster-plan.md` merge/rebase master 与 origin/master。**eval session 未收定则跳过**。

### Phase 3：收尾
- 更新 map/UM11/UM12/UM-LINT/UM15 票（byte-splice map.md，§四）记录本轮。
- commit doc 更新（pathspec-limited，不混 eval session）。
- 不 push（§六）。

## 六、本 session 不做

- **不 push master**（outward，§六须用户明确指示；master 与 origin 分叉，push 非 FF）。
- **不碰 evaluation worktree**（`.worktrees/r10-harness-goodhart`/`.worktrees/t1-exec-grader`）+ master eval session index.lock 警惕。
- **不删 p2-* 分支除非 S-p2 analysis 明确安全 + eval session 收定**（不可按 ancestry 判删）。
- **不 force-push**。
- **不直接修 type-equiv/package-invariants 门**——各归专属票（UM-QODER-RETIRE/UM-INVARIANT-CLEANUP），作 known-red。
- **不恢复 `ui-settings-models` 的 `slot-contract.ts`/`operations.ts`**——真特性 merge → UM-UI-SETTINGS-MODELS-RE-PORT（~30 文件，单独 ~2 session）。
- **map.md 的 U+FFFD（13 个）**：编辑禁用 edit_file，用 byte-splice（§四）。
- **subagent 不跑 build/gen/commit/改 repo**——只读分析 + /tmp patch，主 session apply（§三 rule 2/3）。

## 七、起手 checklist

1. Read 本 prompt + [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md) 2026-09-18 update + [UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) + [UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)。
2. **核状态**：origin/master `607868e6a0`、resync `7a20c4cb0a`（本地，remote 删）、master `fc917a55d4`（on `f3e46b3f20`，ahead 2/behind 2773，unpushed）。`PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
3. **核 eval session 是否活跃**：`ls /Users/mckenzie/workspace/deepseek-harness-da/.git/index.lock` + `git -C master log --oneline -3`（看 `f3e46b3f20` 是否 tip、有无更新）。eval session 活跃 → p2-*/master-sync **apply 跳过，仅 Phase 1 分析**。
4. **runner 健康**：短 probe `echo x`（rule 10）；不稳则单 write_file + 短 bash。
5. **Phase 1 fan-out**：5 subagent（S-D/S-3/S-LINT/S-p2/S-master），各先 probe 验存活 + 增量写 /tmp。可并行（不同票，read-only 不互坏——但同一棵树勿同时 build/gen/check）。
6. **Phase 2 串行 apply**：线 D → UM-LINT → translation zh（安全可逆；每项 typecheck/verify + commit pathspec-limited）；p2-*/master-sync 仅 eval session 收定后。
7. 目标：① 线 D（knip/fake-api/L6，清 C5 entrypoints 部分 + 僵尸）② UM-LINT triage（93→少）③ translation zh（QODER-RETIRE 前置，清 translation-pairing 级联债）④（条件）p2-* + master sync。

## 八、遗留审计 + session 估算

**11 门红**（36/11，零新增）：A4 pre-existing（runtime-closure/constraints/export-jsdoc/translation-pairing）+ B2 known-red（type-equiv→UM-QODER-RETIRE / package-invariants→UM-INVARIANT-CLEANUP）+ C5 upstream 新门（i18n 98/deps 74/entrypoints 10/subsystem-pages 5/doc-standard）。**本 session 线 D 能清 entrypoints 部分 + knip/fake-api 僵尸**；translation zh 能清 translation-pairing 级联债（为 QODER-RETIRE 清路）。

**11 open 票**：UM-ADAPT（per-shift adaptive，仍开）/ UM-LINT-TYPEAWARE-CORDIS（93 lint 假阳，本 session S-LINT triage）/ UM-MERGE-INTEGRITY（近 done，knip/fake-api cleanup 本 session 线 D 收）/ UM11（PR merged 核心完，p2-*+master sync 未完）/ UM12（GA-FORK-CI re-sweep，11 门 + cron follow-up）/ UM15（首片完，剩未来自动化 slice）/ UM4（apiproxy re-home 收尾）/ UM6（docs/subsystems）/ UM-UI-SETTINGS-MODELS-RE-PORT（整包真特性 re-merge ~30 文件，~2 session）/ UM-QODER-SUBAGENT-RETIRE（3-gen cascade，zh 前置后可启）/ UM-INVARIANT-COMPANION-CLEANUP（67 companion+7 peerDep）。

| 终点 | 估算 | 说明 |
|---|---|---|
| **本 session（subagent 扫票）** | ~1 session | 线 D + UM-LINT triage + translation zh（3 项安全可逆，subagent 分析 + 主 session 串行 apply）；p2-*/master-sync 仅分析待 eval session |
| **UM 专项完美结束** | ~10-15 session | 剩 ui-settings re-port ~2 + UM-ADAPT/UM4/CORDIS subtask3/R-DA Round2 ~3-4 + UM-LINT sprint ~1-2（本 session triage 后）+ QODER-RETIRE ~1-2（zh 后）+ INVARIANT-CLEANUP ~1 + UM15 cron follow-up ~1 + UM6 ~1 |
| **全门绿（含 fork 债）** | ~18-25 session | + i18n 98 / deps 74 / doc-standard / runtime-closure / constraints（Tier C，非 UM destination）|

**关键不确定**：① eval session 何时收定（决定 p2-*/master-sync 能否 apply）② translation zh 对 gen-doc-graphs 改动量 + regen 后 translation-pairing 是否一次过 ③ UM-LINT 93 finding false-positive 比例 ④ 线 D rescope-fork.ts 改动是否触其它 spec ⑤ runner flaky 程度（决定 subagent fan-out 顺不顺——长 call 死，须短 bash + 单 write_file）。
