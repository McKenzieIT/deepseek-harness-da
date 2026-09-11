# Next-session prompt — UM-flow Phase C：落 UM15 §5（seam-6 + lefthook pre-push）+ 推 PR（B 类 2 绿+2 known-red）

> 承接 `next-session-2026-09-16-um15-slice234-land-pr.md`（本 session 已执行）。第四轮收尾：**UM15 §2/§3/§4 全落 resync（4 commit）+ 4 项 grilling 全收口**；`check:ci:static` 34/11 → **36/11**，comm 零新增。**§5（seam-6 + lefthook pre-push）+ PR 待续**。
> **本 session 主轴 = ① 落 UM15 §5（seam-6 修 + lefthook pre-push + regen 审 diff）② 推 PR（B 类 2 绿+2 known-red，描述写明 ui-settings 回退 + known-red 理由 + 大原则，不擅自 push）**。

## 一、决策历史（前提，勿再重决）

- **Phase A/B/C 大体 resolved**：UM10/13/14/16/ARCH/CORDIS-REGEN/R-DA Phase1+2/R-DA-UI-PRESENTER-COMPOSITION 全 resolved；UM-ADAPT per-shift 仍开。
- **B 类 4 真回归收口（2026-09-15 第三轮）**：markdown-links ✅ GREEN（`e17f0fa16c`+`12d02c7687`）；agent-note-format ✅ GREEN（`d4596863a6`，第四类 merge 丢失已喂 UM15）；type-equivalence 🅿 known-red → UM-QODER-SUBAGENT-RETIRE（costs+scopeId×2）；package-invariants 🅿 known-red → UM-INVARIANT-COMPANION-CLEANUP（67 companion）。均非本 session 直接修，作 known-red 进 PR 清单。
- **UM15 首片（2026-09-16 第四轮）**：§2/§3/§4 全落 resync（`2eb5b4a850`/`5536afc99f`/`cd1e9c37cd`/`3bc809c3ba`），tsc/oxlint/vitest + gate exit 0 + report exit 0 全过。§4 stage 2 用 read-only subagent 写（offload context，代码干净零主修）。4 项 HITL grilling 全收口。
- **4 grilling 决策（2026-09-16 锁定）**：
  - **#1 staleness 跑哪** = (c) local 先（+ lefthook pre-push 每次 merge 自报）+ cron 后（UM12 绿基线后加 `schedule:`，UM12 票挂 follow-up）。
  - **#2 cadence** = 每周查 + 批量 sync session（人）+ threshold **150 commits OR 14 天 OR seam>0** 任一硬触发（以下信息性）。
  - **#5 SEAM_MANIFEST seam-6** = (a) 本票带修（§5）：mode pending→seam + implementations→[包短名] + note；regen architecture-graph + 审 diff。
  - **#8 impact report 落哪** = `upstream-sync/upstream-impact-<BASE>..<NEW>-<date>.md`（独立顶层目录，不捆绑 wayfinder，无翻译义务；`tickets/README.md` 是 paired 须避误触）。
  - #3/#4/#6 此前已收口。**7 项 grilling 全收口**。
- **大原则（用户 2026-09-15 确立）**：upstream 内容不改、上游最新是什么用什么；其他（fork 自有）按需重构。
- **pre-merge 基线**：`65bf3cddc9`（真 fork parent）实测 28/9。`558e6f4f66` 是 M1 后代不是 parent。
- **UM-MERGE-INTEGRITY**：M1 复活 100/丢 2/回退 27（ui-settings 整包）、M2 全 0。三道完整性门（删未应用/新增丢弃/修改回退）+ 第四类（merge 侧擅动 fork 自有内容，三道抓不到，`--diff-merges` 才可见）。waivers 已录 `upstream-sync.json`（10 条覆盖 129 M1 finding）。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，tip **`3bc809c3ba`**，**unpushed**（9 commit：`e17f0fa16c`/`d4596863a6`/`12d02c7687`/`b3a516fe98`/`c579b809d2`/`2eb5b4a850`/`5536afc99f`/`cd1e9c37cd`/`3bc809c3ba`），工作树干净 |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip（本 session 末文档 commit 后），ahead origin，工作树干净 |
| `build:official` | **GREEN**（lib/ 与 dist/ 是有效产物——别乱 rebuild）|
| `check:ci:static` | **36 passed / 11 failed**（2026-09-16 实测，comm 零新增）|
| full lint | **93 errors + 1 warning**（稳定，交 UM-LINT-TYPEAWARE-CORDIS）|
| `pnpm install --frozen-lockfile` | **PASS** |
| `pnpm run verify-upstream-sync-record` | **exit 0**（记录与 Git 一致；note：upstream ref stale local `5dda764ed3` ≠ remote `c291e7961a` + 1 pending waiver `ui-settings-models/` revert-fork）|
| `pnpm run upstream-status` | **exit 0**（ref stale → behind-count withheld；2 days < 14；1 pending waiver；impact report 写 `upstream-sync/upstream-impact-c389f96bf3..unknown-<date>.md`）|

### 11 门红（B 类 2 绿后，无变化）

| 类 | 门 | 说明 |
|---|---|---|
| A（pre-existing，known-red） | `runtime closure`、`constraints`、`export jsdoc`、`translation pairing` | 4 门。归 GA-FORK-CI-green / parallel-dev-cleanup。`export jsdoc` pre-merge 7 现 3。`translation pairing` 的 gen-doc-graphs sub-failure 由线 C 清零。|
| B（known-red，各有专属票） | `type equivalence`、`package invariants` | 2 门。type-equiv → UM-QODER-SUBAGENT-RETIRE（costs+scopeId×2）；package-invariants → UM-INVARIANT-COMPANION-CLEANUP（67 companion）。均作 known-red 进 PR 清单。|
| C（upstream 新门，known-red） | `client UI i18n`(98)、`package dependencies`(74)、`application entrypoints`(10)、`subsystem pages`(5)、`documentation standard tests` | 5 门。fork 从未满足，作 known-red 或 quick fix。|

### UM15 已落（resync `3bc809c3ba`）

| 节 | commit | 状态 |
|---|---|---|
| §1 MODES 重构 | `b3a516fe98` | ✅ |
| §5.2(c) enroll verify-architecture-graph | `c579b809d2` | ✅ |
| §2 gate-coverage meta-gate | `2eb5b4a850` | ✅ gate 0, vitest 90/90 |
| §3 generator-inputs manifest | `5536afc99f` | ✅ vitest 5/5 |
| §4 stage 1 core+gate+record | `cd1e9c37cd` | ✅ gate exit 0 |
| §4 stage 2 upstream-status 报告 | `3bc809c3ba` | ✅ report exit 0 |

## 三、⚠ 并行铁律（违反必返工）

1. **同一棵树里禁止两个 subagent 同时跑 build / `gen-*` / `check:*`**——写 `dist/`/`lib/`/`.tsbuildinfo`，并发互相破坏。
2. **主 session 独占写操作**：build / `gen-*` / `git commit` 只能主 session 串行做。
3. **subagent 只读分析 + 产出精确 patch 方案**，不自己跑 build/gen/commit/改文件。需真写代码的给独立 worktree（但⚠ worktree 默认 base=origin 无 §4 stage 1 core + 无 node_modules——本 session 证 read-only subagent 代码写到 /tmp + 主 session cp 更稳）。
4. 单个 `verify-*` gate 只读，subagent 可跑；`gen-*` 是写操作，不可以。
5. **主 session + subagent 一律 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠 → `mcp__local__bash` 里的 `grep -rEn`。`rg` 不存在。
6. **node v24 强制**：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。v25.9.0 系统默认 crash tsdown/rolldown/fs-ext。
7. shell 是 `sh` 不是 bash：不支持 `<(...)`，用临时文件 + `sort`/`comm`。
8. **⚠ split-brain 铁律**：`mcp__local__*` 跑在用户 Mac 上，够不着 runner 侧 transcript。subagent 产出大交付（>~100KB 截断）时，**让该 subagent 自己用 `mcp__local__write_file` 直接写盘**（/tmp），主 session `cp`，别派另一个 subagent 去读 transcript。本 session §4 stage 2 即此模式（read-only subagent 写 /tmp，主 cp + 验证，代码干净零主修）。
9. **⚠ subagent 瞬态故障**：长 subagent（>~15min/30+ calls）可能撞 `socket connection closed unexpectedly` 而死。**对策**：① 先起最小 probe（1 bash+1 write）验存活 ② 逐节派 ③ 增量写盘 ④ 给已验证锚点减探查调用。
10. **不 push**（PR 前 review；本 session 决策推 PR 或留 review 由用户定）。

## 四、方法论铁律

- **不轻信票据/prompt 里记的「已 verified」**。本 session 又证：① §4 deliverable 记 revert-fork HEAD 残余 7，实测 6，且是**纯文档错**（§4.0 表说 7；代码 Gate ③ 动态计算正确）；② §2 deliverable 在 `12d02c7687` 写，未预见 `c579b809d2` enroll architecture-graph 后 doc-sync spec 断言 staleness（c579b809d2 落了 enroll 没更新 spec——§2 落地时发现并修）；③ §4 deliverable line 392 未闭合模板字面量、line 254 `unknown[]` 类型错（subagent 未跑 tsc）。凡结论要用自己的，自己重跑。
- **凡 gate 以 throw 形式失败，修完 throw 必须重跑并审 regen diff**。throw 是预检在生成前抛的，修完它生成器才跑到底，会报真实 staleness。
- **控制你自己引入的变量**。`~/.gitconfig core.symlinks=false` 让 tracked symlink 落成路径文本——每次新 checkout 必查必修。
- **master 树 index.lock 警惕**：删前必查 mtime + `ps aux | grep git`。

## 五、本轮编排

### 线 1（主轴）：落 UM15 §5（seam-6 + lefthook pre-push）

1. **seam-6 修（Decision #5 = a 本票带）**：
   - 核 `packages/api/workspace-files` 在 `gen-architecture-graph.ts` 的**包短名**（命名约定如 `api-remotes` 对 `packages/api/remotes`，故 likely `api-workspace-files`——落地时 grep `pkgsByRel`/读 `pkg.rel` 映射确认）。
   - 改 `scripts/gen-architecture-graph.ts:89-93` seam-6：`mode:'pending'→'seam'`、`implementations:[]→['<短名>']`、note 改为 "workspace-files restored via UM14 re-sync; previously pending."。
   - `pnpm run gen-architecture-graph` regen（**gen-* 写操作，主 session 独占串行**；⚠ 可能大 diff——gen-architecture-graph 重写 `docs/architecture-graph.md` 全文）。
   - **审 regen diff**（§四铁律）：`git diff docs/architecture-graph.md` 应只有 seam-6 段 + 图节点变化，无意外 churn。gen-architecture-graph 只写英文（§3 manifest 已证），无 zh churn（若有归 UM-GEN-DOC-TRANSLATION-OBLIGATION）。
   - verify（tsc/oxlint + run `verify-upstream-sync-record` 仍 exit 0）+ commit。
2. **lefthook pre-push（Decision #1 local 部分）**：
   - `lefthook.yml` 加 `pre-push` hooks：跑 `pnpm run verify-upstream-sync-record`（**门，不是 report**——report 会写文件脏树，门不写）。每次 push 到 resync 时自报 record 一致性。
   - verify（本地 `lefthook run pre-push` 或 `git push --dry-run`）+ commit。
   - **cron 部分**（#1 cron-later）：归 UM12 follow-up（绿基线后加 `schedule:` workflow），不在本票。在 UM12 票记 follow-up 防拖。

### 线 2：推 PR（B 类 2 绿 + 2 known-red）

- resync `3bc809c3ba`（+ §5 commit）unpushed → push + 开 PR。
- **PR 描述须写明**：① ui-settings-models 整包被 M1 回退（~30 文件，`tsc` 全绿、`--cc` 看不见，见 UM-MERGE-INTEGRITY 三道门 ③）；② type-equiv/package-invariants 作 known-red 的理由 + 各自专属票（UM-QODER-SUBAGENT-RETIRE / UM-INVARIANT-COMPANION-CLEANUP）；③ 大原则（upstream 内容不改）；④ §2/§3/§4/§5 是 UM15 首片 durable upstream-sync method 落地（staleness + regen 清单 + meta-gate + 三道门 + impact report）。
- **不擅自 push**——除非用户明确指示推（§六）。

### 线 3（可选/并行，AFK）：translation zh（线 C）

- 用户决策 = 生成器带上 zh (a)。`gen-module-graph` 会写三件（md/zh/i18n），照它给 `gen-doc-graphs` 6 产物加 zh 渲染 + `.i18n.yaml` 配对哈希。
- **是 UM-QODER-SUBAGENT-RETIRE 的前置**：退 Qoder 删 costs 触发 doc-graphs regen，gen-doc-graphs 只写英文 → regen 让 translation-pairing 变红。先做 zh，Qoder 退场那次级联就干净。
- regen → `verify-translation-pairing` 本轮 +2 sub-failure 清零。

### 线 D（quick）：knip/fake-api 删 + L6 application entrypoints allowlist

- `knip.json` + `connection/tests/fake-api.client.ts` 删（改 `scripts/rescope-fork.ts:263-264` + `rescope-fork.spec.ts:132-137`）。⚠ 别误删 `api/session-controller/tests/fake-api.client.ts`（7 spec import）。
- L6 `application entrypoints`（C 类，10 条 allowlist）：删僵尸后已解锁，`MANIFEST_BIN_ALLOWLIST`+`EXECUTABLE_SOURCE_ALLOWLIST` 加 10 条。[UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 有精确 patch。

## 六、本 session 不做

- **不 push、不开 PR**——除非用户明确指示推。
- **不删分支/worktree**（归 UM11 Scope 4-6 + A23）。⚠ 5 个 `refactor/p2-*` 不可按 ancestry 判删。**不碰 evaluation worktree**（`.worktrees/r10-harness-goodhart`、`.worktrees/t1-exec-grader`）+ master 的 eval session（index.lock 警惕）。
- **不恢复 `ui-settings-models` 的 `slot-contract.ts`/`operations.ts`**——真特性 merge → [UM-UI-SETTINGS-MODELS-RE-PORT](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md)。
- **不直接修 type-equiv/package-invariants 门**——各归专属票，作 known-red 进 PR。
- **map.md 的 U+FFFD**：out of scope（parallel-dev-cleanup），别猜着改。

## 七、起手 checklist

1. Read 本 prompt + [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) 2026-09-16 第四轮 update + [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md) + [UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) updates。
2. **核两 tip + 两树状态**：resync `3bc809c3ba`（0 行）、master（本 session 末文档 commit 后的 tip，0 行）。⚠ **核 symlink**：`git -C /Users/mckenzie/workspace/dsh-resync ls-files -s | awk '$1=="120000"{print $4}'` + 逐个 `[ -L ]`。若坏：`git config core.symlinks true` + `git ls-files -s | awk '$1=="120000"{print $4}' > /tmp/links.txt` + `xargs rm -f < /tmp/links.txt && xargs git checkout -- < /tmp/links.txt` + `git status --short --untracked-files=no`（必空）。
3. 确认 `PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
4. **落 §5**：seam-6 短名核（grep `pkgsByRel`/读 `pkg.rel` 映射）→ 改 SEAM_MANIFEST seam-6 → `pnpm run gen-architecture-graph` regen → **审 regen diff**（只 seam-6 段）→ lefthook pre-push 挂 `verify-upstream-sync-record` → verify（tsc/oxlint + gate exit 0）+ commit。
5. **推 PR**（用户指示后）：push resync + 开 PR，描述写明 4 点（ui-settings 回退 + known-red 理由 + 大原则 + §2-§5 是 UM15 首片）。
6. 目标：① §5 全落 ② PR 推进/merge ③ translation zh（若做，Qoder 退场前置）。

## 八、遗留项审计 + session 估算

**open 票 11 个**（+ 2 resolved-decision：UM-TSCONFIG-PATHS-POLICY / UM-GEN-DOC-TRANSLATION-OBLIGATION）：UM-ADAPT / UM-LINT-TYPEAWARE-CORDIS / UM-MERGE-INTEGRITY（近 done，knip/fake-api cleanup pending）/ UM11 / UM12 / UM15（§5 + PR 待续）/ UM4 / UM6 / UM-UI-SETTINGS-MODELS-RE-PORT + UM-QODER-SUBAGENT-RETIRE / UM-INVARIANT-COMPANION-CLEANUP。

| 终点 | 估算 | 说明 |
|---|---|---|
| **PR merge（B 类 2 绿+2 known-red）** | ~1-3 session | §5（seam-6+lefthook+regen 审）~1 + PR 描述+push ~1-2。B 类已 2 绿（-2）。|
| **UM 专项完美结束** | ~13-19 session | + ui-settings re-port ~2 + UM-ADAPT/UM4/UM-CORDIS subtask3/R-DA Round2 ~3-4 + UM-LINT/Typert sprint ~3-4 + QODER-RETIRE ~1-2 + INVARIANT-CLEANUP ~1 + UM15 cron follow-up（UM12 后）~1。|
| **全门绿（含 fork 债）** | ~20-27 session | + i18n 98 / deps 74 / doc-standard / runtime-closure / constraints（Tier C，非 UM destination）。|

**关键不确定**：§5 seam-6 regen 的 diff churn 量（gen-architecture-graph 重写 `docs/architecture-graph.md` 全文，可能大 diff，须审只 seam-6 段）；ui-settings re-port 规模未量化；documentation standard tests scope 未知；QODER-RETIRE 的 3-gen cascade（cordis+config+doc-graphs）规模。
