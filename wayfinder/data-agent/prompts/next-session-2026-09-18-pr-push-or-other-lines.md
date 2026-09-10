# Next-session prompt — UM-flow Phase C：推 PR（B 类 2 绿+2 known-red）或续其他线（translation zh / knip+L6 / UM-ADAPT）

> 承接 `next-session-2026-09-17-um15-slice5-pr.md`（本 session 已执行）。第五轮收尾：**UM15 §5 全落 resync（2 commit：`f8c0e3abca` seam-6 + `0301586bed` lefthook pre-push）+ §四方法论复核 + cron follow-up 归 UM12**。resync 11 unpushed，`check:ci:static` 仍 36/11 零新增。**PR 描述已起草（见下 §五），本 session 不擅自 push（§六）——下 session 首要决策 = 用户是否指示推 PR**。

## 一、决策历史（前提，勿再重决）

- **Phase A/B/C 大体 resolved**：UM10/13/14/16/ARCH/CORDIS-REGEN/R-DA Phase1+2/R-DA-UI-PRESENTER-COMPOSITION 全 resolved；UM-ADAPT per-shift 仍开。
- **B 类 4 真回归收口**：markdown-links ✅ GREEN（`e17f0fa16c`+`12d02c7687`）；agent-note-format ✅ GREEN（`d4596863a6`）；type-equivalence 🅿 known-red → UM-QODER-SUBAGENT-RETIRE；package-invariants 🅿 known-red → UM-INVARIANT-COMPANION-CLEANUP。均非本 session 直接修，作 known-red 进 PR 清单。
- **UM15 全 5 节已落 resync**（首片 durable method 实现完）：§1 MODES（`b3a516fe98`）/ §5.2(c) enroll（`c579b809d2`）/ §2 gate-coverage（`2eb5b4a850`）/ §3 generator-inputs（`5536afc99f`）/ §4 stage1 core+gate+record（`cd1e9c37cd`）/ §4 stage2 upstream-status report（`3bc809c3ba`）/ **§5a seam-6（`f8c0e3abca`）+ §5b lefthook pre-push（`0301586bed`）= 本 session**。7 项 grilling 全收口。
- **4 grilling 决策（2026-09-16 锁定，本 session 落地 §5）**：#1 staleness = local 先（lefthook pre-push **已落** `0301586bed`）+ cron 后（**UM12 follow-up 已记**）；#2 cadence = 每周 + 批量 session + threshold 150 commits/14 天/seam>0 任一硬触发；#5 SEAM_MANIFEST seam-6 = (a) 本票带修（**已落** `f8c0e3abca`，pending→seam + implementations=['api-workspace-files'] + regen diff 恰好 1 行）；#8 impact report = `upstream-sync/upstream-impact-<BASE>..<NEW>-<date>.md`（独立目录，无翻译义务）。
- **大原则（用户 2026-09-15 确立）**：upstream 内容不改、上游最新是什么用什么；其他（fork 自有）按需重构。
- **pre-merge 基线**：`65bf3cddc9`（真 fork parent）实测 28/9。`558e6f4f66` 是 M1 后代不是 parent。
- **UM-MERGE-INTEGRITY**：M1 复活 100/丢 2/回退 27（ui-settings 整包）、M2 全 0。三道完整性门 + 第四类（merge 侧擅动 fork 自有，三道抓不到，`--diff-merges` 才可见）。waivers 已录 `upstream-sync.json`。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，tip **`0301586bed`**，**11 unpushed**（`e17f0fa16c`/`d4596863a6`/`12d02c7687`/`b3a516fe98`/`c579b809d2`/`2eb5b4a850`/`5536afc99f`/`cd1e9c37cd`/`3bc809c3ba`/`f8c0e3abca`/`0301586bed`），工作树干净 |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip（本 session 末 [wayfinder] 文档 commit 后），ahead origin，工作树干净 |
| `build:official` | **GREEN**（lib/ 与 dist/ 是有效产物——别乱 rebuild；lib/+dist/ gitignored）|
| `check:ci:static` | **36 passed / 11 failed**（本 session 零新增；§5 不触 gate 矩阵）|
| full lint | **93 errors + 1 warning**（稳定，交 UM-LINT-TYPEAWARE-CORDIS）|
| `pnpm install --frozen-lockfile` | **PASS** |
| `pnpm run verify-upstream-sync-record` | **exit 0**（read-only；ref stale + 1 pending waiver `ui-settings-models/` revert-fork）|
| `pnpm run verify-architecture-graph` | **exit 0**（seam-6 regen 后 doc current）|
| `lefthook run pre-push` | **exit 0**（三 job 全绿：no-prod-src-on-master 3.17s / typecheck 30.21s / **upstream-sync record consistency 6.08s** = 本 session 新加）|

### 11 门红（B 类 2 绿后，无变化）

| 类 | 门 | 说明 |
|---|---|---|
| A（pre-existing，known-red） | `runtime closure`、`constraints`、`export jsdoc`、`translation pairing` | 4 门。归 GA-FORK-CI-green / parallel-dev-cleanup。|
| B（known-red，各有专属票） | `type equivalence`、`package invariants` | 2 门。type-equiv → UM-QODER-SUBAGENT-RETIRE（costs+scopeId×2）；package-invariants → UM-INVARIANT-COMPANION-CLEANUP（67 companion）。均作 known-red 进 PR 清单。|
| C（upstream 新门，known-red） | `client UI i18n`(98)、`package dependencies`(74)、`application entrypoints`(10)、`subsystem pages`(5)、`documentation standard tests` | 5 门。fork 从未满足，作 known-red 或 quick fix。|

## 三、⚠ 并行铁律（违反必返工）

1. **同一棵树里禁止两个 subagent 同时跑 build / `gen-*` / `check:*`**——写 `dist/`/`lib/`/`.tsbuildinfo`，并发互相破坏。
2. **主 session 独占写操作**：build / `gen-*` / `git commit` 只能主 session 串行做。
3. **subagent 只读分析 + 产出精确 patch 方案**，不自己跑 build/gen/commit/改文件。需真写代码的给独立 worktree（但⚠ worktree 默认 base=origin 无 §4 stage 1 core + 无 node_modules——read-only subagent 代码写到 /tmp + 主 session cp 更稳）。
4. 单个 `verify-*` gate 只读，subagent 可跑；`gen-*` 是写操作，不可以。
5. **主 session + subagent 一律 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠 → `mcp__local__bash` 里的 `grep -rEn`。`rg` 不存在。`grep -P` 不存在（BSD grep）。
6. **node v24 强制**：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。v25.9.0 系统默认 crash tsdown/rolldown/fs-ext。
7. shell 是 `sh` 不是 bash：不支持 `<(...)`，用临时文件 + `sort`/`comm`。多行 commit 消息用 `git commit -F <file>`（`mcp__local__write_file` 写 /tmp）。
8. **⚠ split-brain 铁律**：`mcp__local__*` 跑在用户 Mac 上，够不着 runner 侧 transcript。subagent 产出大交付（>~100KB 截断）时，让该 subagent 自己用 `mcp__local__write_file` 直接写盘（/tmp），主 session `cp`。
9. **⚠ subagent 瞬态故障**：长 subagent（>~15min/30+ calls）可能撞 `socket connection closed unexpectedly` 而死。对策：① 先起最小 probe 验存活 ② 逐节派 ③ 增量写盘 ④ 给已验证锚点减探查调用。
10. **不 push**（PR 前 review；推 PR 或留 review 由用户定）。

## 四、方法论铁律

- **不轻信票据/prompt 里记的「已 verified」**。本 session 又证：① §5 prompt 记短名「likely `api-workspace-files`」——自读 `package-graph.ts` 确认 `short: json.name.slice(SCOPE.length)` 派生 + 读 `packages/api/workspace-files/package.json` 实测（与推测同，但走核而非信）；② §5 prompt 警告「gen-architecture-graph 重写全文可能大 diff」——基线先验 `verify-architecture-graph` GREEN 再编辑再 regen，diff **实测恰好 1 行**（基线 doc 已 current + 仅一 manifest entry 变）；③ 「门只读」——跑 `verify-upstream-sync-record` 跑前跑后 `git status` 对比证零写。凡结论要用自己的，自己重跑。
- **凡 gate 以 throw 形式失败，修完 throw 必须重跑并审 regen diff**。throw 是预检在生成前抛的，修完它生成器才跑到底，会报真实 staleness。
- **控制你自己引入的变量**。`~/.gitconfig core.symlinks=false` 让 tracked symlink 落成路径文本——每次新 checkout 必查必修。
- **master 树 index.lock 警惕**：删前必查 mtime + `ps aux | grep git`。
- **🆕（本 session 新证）`mcp__local__edit_file` 会重编码 UTF-8 → 破坏既有 mojibake/U+FFFD**。本 session edit map.md 想插 Phase C 第五轮 entry，结果 **line 351 的 GA-EVAL-SQLGEN-FOLLOWUP 行 FFFD 计数从 5→6**（edit_file 解码全文 U+FFFD 再重编码，对 pre-existing 畸形字节序列非等价）。**对策**：编辑含 U+FFFD/mojibake 的文件（map.md 有 13 个 pre-existing FFFD，line 234/245/351/354）**禁用 edit_file**，改用 **byte-level splice**（node `fs.readFileSync` 取 Buffer → `Buffer.indexOf(marker)` 定位 → `Buffer.concat([前, insertion, 后])` → `fs.writeFileSync` 原样回写）。insertion 文本用 `mcp__local__write_file`（UTF-8 干净）写到 /tmp，splice 脚本 read 它的 raw bytes。本 session 已验：byte-splice 后 FFFD 计数 13 不变、diff 仅 1 hunk 纯插入零删除。干净文件（UM15/UM12，0 FFFD）edit_file 无损（重编码 lossless），仍可用。

## 五、本轮编排（按用户 push 决策分支）

### 分支 A（用户指示推 PR）：推 PR + UM11 post-merge cleanup

1. **push resync `0301586bed`** → 开 PR。⚠ push 会触发 **lefthook pre-push**（本 session 新加 `verify-upstream-sync-record` 门 + 既有 typecheck + no-prod-src-on-master，全绿已验）。若门红，**勿 `-n/--no-verify` 绕过**——查原因（record 与 git 不一致 = 真信号）。
2. **PR 描述 4 点**（见 §五末）。
3. PR merge 后 → [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md) post-merge cleanup（branch/worktree 收尾；⚠ 5 个 `refactor/p2-*` 不可按 ancestry 判删；不碰 evaluation worktree）。

### 分支 B（用户暂不推 PR）：续其他线（AFK/quick）

- **线 3 translation zh（AFK，UM-QODER-SUBAGENT-RETIRE 前置）**：用户决策 = 生成器带上 zh (a)。`gen-module-graph` 写三件（md/zh/i18n）照它给 `gen-doc-graphs` 6 产物加 zh 渲染 + `.i18n.yaml` 配对哈希。退 Qoder 删 costs 触发 doc-graphs regen，**先做 zh 让那次级联干净**。regen → `verify-translation-pairing` 本轮 +2 sub-failure 清零。
- **线 D（quick）knip/fake-api 删 + L6 application entrypoints allowlist**：`knip.json` + `connection/tests/fake-api.client.ts` 删（改 `scripts/rescope-fork.ts:263-264` + `rescope-fork.spec.ts:132-137`）。⚠ 别误删 `api/session-controller/tests/fake-api.client.ts`（7 spec import）。L6 `application entrypoints`（C 类，10 条 allowlist）：删僵尸后已解锁，`MANIFEST_BIN_ALLOWLIST`+`EXECUTABLE_SOURCE_ALLOWLIST` 加 10 条。[UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 有精确 patch。

### PR 描述（4 点，分支 A 用）

1. **ui-settings-models 整包 M1 回退**（~30 文件）：M1 把整个 `packages/client/ui-settings-models` 回退到 merge-base（27 fork 未碰 + 1 取 ours）。`tsc` 全绿（多的包能独立编译）、`--cc` 看不见（结构上无 import 丢失）→ 编译器对这类损失什么都没证。见 [UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 三道完整性门 ③（upstream 内容采纳检查）。真特性 merge → [UM-UI-SETTINGS-MODELS-RE-PORT](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md)，**不阻塞本 PR**。
2. **type-equiv / package-invariants 作 known-red 的理由**：type-equiv 3 DRIFT 全是 fork 加在 upstream core 上的字段（`SubagentResult.costs` LIVE + `scopeId`×2 write-never），退 Qoder 比 augmentation 优 → [UM-QODER-SUBAGENT-RETIRE](../tickets/phase-upstream-merge/UM-QODER-SUBAGENT-RETIRE.md) 专门做（不阻塞本 PR，完成前全 known-red）；package-invariants 74 违规 = 67 空 invariant companion + 7 误 peerDep，两规则均 upstream 引入 pre-merge 不存在（非回归）→ [UM-INVARIANT-COMPANION-CLEANUP](../tickets/phase-upstream-merge/UM-INVARIANT-COMPANION-CLEANUP.md)（不阻塞本 PR）。
3. **大原则**：upstream 内容不改、上游最新是什么用什么；其他（fork 自有）按需重构。
4. **§2-§5 是 UM15 首片 durable upstream-sync method 落地**：staleness（local lefthook pre-push 门 `verify-upstream-sync-record` + `upstream-status` report）+ regen 清单（§3 generator-inputs manifest）+ meta-gate（§2 gate-coverage）+ 三道完整性门（§4 upstream-sync-record）+ impact report（§4 stage 2）。7 项 grilling 全收口。

## 六、本 session 不做

- **不 push、不开 PR**——除非用户明确指示推（分支 A vs B 由用户定）。
- **不删分支/worktree**（归 UM11 Scope 4-6 + A23）。⚠ 5 个 `refactor/p2-*` 不可按 ancestry 判删。**不碰 evaluation worktree**（`.worktrees/r10-harness-goodhart`、`.worktrees/t1-exec-grader`）+ master 的 eval session（index.lock 警惕）。
- **不恢复 `ui-settings-models` 的 `slot-contract.ts`/`operations.ts`**——真特性 merge → [UM-UI-SETTINGS-MODELS-RE-PORT](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md)。
- **不直接修 type-equiv/package-invariants 门**——各归专属票，作 known-red 进 PR。
- **map.md 的 U+FFFD（13 个 pre-existing，line 234/245/351/354）**：out of scope（parallel-dev-cleanup），别猜着改。**编辑 map.md 禁用 edit_file**（会 corrupt mojibake），用 §四 byte-splice。本 session 已踩坑修复。

## 七、起手 checklist

1. Read 本 prompt + [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) 2026-09-17 第五轮 update + [UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 2026-09-17 follow-up + [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md)（分支 A 时）。
2. **核两 tip + 两树状态**：resync `0301586bed`（0 行）、master（本 session 末 [wayfinder] commit 后 tip，0 行）。⚠ **核 symlink**：`git -C /Users/mckenzie/workspace/dsh-resync ls-files -s | awk '$1=="120000"{print $4}'` + 逐个 `[ -L ]`。若坏：`git config core.symlinks true` + `git ls-files -s | awk '$1=="120000"{print $4}' > /tmp/links.txt` + `xargs rm -f < /tmp/links.txt && xargs git checkout -- < /tmp/links.txt` + `git status --short --untracked-files=no`（必空）。
3. 确认 `PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
4. **问用户**：推 PR（分支 A）还是续其他线（分支 B）？
5. 分支 A：push resync `0301586bed`（触发 lefthook pre-push 三门）→ 开 PR（描述见 §五 4 点）→ 等 review/merge → UM11 cleanup。分支 B：线 3（translation zh，Qoder 退场前置）或线 D（knip+L6 quick fix）。
6. 目标：① PR 推进/merge（分支 A）或 ② translation zh / knip+L6 推进（分支 B）。

## 八、遗留项审计 + session 估算

**open 票 11 个**（+ 2 resolved-decision：UM-TSCONFIG-PATHS-POLICY / UM-GEN-DOC-TRANSLATION-OBLIGATION）：UM-ADAPT / UM-LINT-TYPEAWARE-CORDIS / UM-MERGE-INTEGRITY（近 done，knip/fake-api cleanup pending）/ UM11 / UM12（+ 本 session 加的 cron follow-up）/ UM15（**首片完，仅剩 PR 推送 + 未来自动化 slice**）/ UM4 / UM6 / UM-UI-SETTINGS-MODELS-RE-PORT + UM-QODER-SUBAGENT-RETIRE / UM-INVARIANT-COMPANION-CLEANUP。

| 终点 | 估算 | 说明 |
|---|---|---|
| **PR merge（B 类 2 绿+2 known-red）** | ~1-2 session | §5 已落（-1）。分支 A：PR 描述+push ~1-2。B 类已 2 绿（-2）。|
| **UM 专项完美结束** | ~12-18 session | + ui-settings re-port ~2 + UM-ADAPT/UM4/UM-CORDIS subtask3/R-DA Round2 ~3-4 + UM-LINT/Typert sprint ~3-4 + QODER-RETIRE ~1-2 + INVARIANT-CLEANUP ~1 + UM15 cron follow-up（UM12 绿基线后）~1。|
| **全门绿（含 fork 债）** | ~20-27 session | + i18n 98 / deps 74 / doc-standard / runtime-closure / constraints（Tier C，非 UM destination）。|

**关键不确定**：PR review 轮次 + merge 时机（用户定）；ui-settings re-port 规模未量化；documentation standard tests scope 未知；QODER-RETIRE 的 3-gen cascade（cordis+config+doc-graphs）规模；translation zh 渲染对 gen-doc-graphs 6 产物的改动量。
