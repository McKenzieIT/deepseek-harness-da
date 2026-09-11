# Next-session prompt — UM-flow Phase C：B 类 4 真回归全修（UM11 硬阻塞）+ UM15 首片落地 + translation zh 实现

> 承接 `next-session-2026-09-14-phase-c-merge-integrity-5gates-um15.md`（本 session 已执行）。第二轮 Phase C 收尾：**`check:ci:static` 27/18 → 32/13**，零新增，5 门翻绿（doc graphs / cordis inspect catalog / config catalog / package README / tsconfig paths）。UM-MERGE-INTEGRITY 双向穷举 + 2 组僵尸删除；pre-merge 基线建立（28/9 @ `65bf3cddc9`，18 红 = A6/B5/C7，推翻 3 条旧结论）；UM15 首片方案 S2 已交但**主体代码在 split-brain 中丢失**（§6/§7/§8 存盘）。**grilling 3 决策用户已拍板**（tsconfig=explicit 已落地 / translation=gen-zh 待实现 / B 类=全修）。
> **本 session 主轴 = ① B 类 4 真回归全修（UM11 硬阻塞，PR 前必绿）② UM15 首片落地（重派 S2 补丢失的 §1-4.4）③ translation zh 实现（gen-doc-graphs 带 zh）**。

## 一、决策历史（前提，勿再重决）

- **Phase A/B/C 大体 resolved**：UM10/13/14/16/ARCH/CORDIS-REGEN/R-DA Phase1+2/R-DA-UI-PRESENTER-COMPOSITION 全 resolved；UM-ADAPT per-shift 仍开。
- **UM-MERGE-INTEGRITY 双向穷举**（`bcf4776f1d` 落地方向 B 的 2 组僵尸删除）：方向 A 文件级 2 条全归 M1，判误丢但**改文档不恢复文件**；方向 B 5 组里 2 组已删、2 组（`knip.json`+`connection/tests/fake-api.client.ts`）零门收益有意 defer、1 组 keep。**⚠ 最大发现**：M1 把整个 `ui-settings-models` 包回退到 merge-base（~30 文件），`tsc` 全绿、`git diff-tree --cc` 看不见 → re-port 单开 `UM-UI-SETTINGS-MODELS-RE-PORT`（task，不阻塞 PR）。
- **pre-merge 基线**：`65bf3cddc9`（真 fork parent；`558e6f4f66` 是 M1 后代，**不是 parent**）实测 28/9。18 红 = **A6 真 pre-existing / B5 merge 回归 / C7 upstream 新门**。推翻 3 条旧结论（`documentation standard tests` 是 C 不是 A；`package invariants` pre-merge 绿；`config catalog` 非 RC-Z 致红）。**pre-merge `--frozen-lockfile` 干净** → "CI install 挂"起于 merge。
- **grilling 3 决策**（用户 2026-09-14 拍板，已记入 `UM-TSCONFIG-PATHS-POLICY` / `UM-GEN-DOC-TRANSLATION-OBLIGATION` Resolution + `UM11`/`UM12`）：
  1. tsconfig = **采纳 upstream 显式 alias** → ✅ **已落地** `10941436b5`（删 fork 通配 fallback 块 + regen，`verify-tsconfig-paths` GREEN，537 显式 alias，`tsc -b tsconfig.client.json` 0 错）。**关键：生成器不用改**——删通配块后 region 重新成为 paths 最后一项，`gen-tsconfig-paths.ts:190` 的不写尾逗号设计重新正确，原 trap 自消。
  2. translation = **生成器带上 zh (a)** → 决策定，**实现本 session**：给 `gen-doc-graphs` 6 产物加 zh 渲染 + `.i18n.yaml`。先读 `gen-module-graph.ts:112-151` 的 zh 机制。
  3. **B 类 4 真回归 = 全修再 PR**（用户指令，不走 tracked-shortcut）：`package invariants` / `agent note format`(L9) / `markdown links`(L7) / `type equivalence` **全须 PR 前绿** → UM12 的 B 类子集 = UM11 硬阻塞。
- **UM15**：Decision 4 收口=(b)（`gen-architecture-graph` 不存在 upstream，(a) 前提错）；Decision 7=(b) 首片 §1+§6。7 项 grilling 收口 1（#4）、推进 2（#3/#6）、余 4 open（#1/#2/#5/#8）。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，tip **`10941436b5`**，**unpushed**，工作树干净 |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip **`44e6a485b0`**，ahead origin，工作树干净 |
| `build:official` | **GREEN**（lib/ 与 dist/ 是有效产物——**别乱 rebuild**） |
| `check:ci:static` | **32 passed / 13 failed**（本 session 末实测，全程 `comm` 零新增） |
| full lint | **93 errors + 1 warning**（稳定，交 UM-LINT-TYPEAWARE-CORDIS） |
| `pnpm install --frozen-lockfile` | **PASS** |

### 13 门红（tsconfig paths 已绿，C 类 6→5）

| 类 | 门 | 说明 |
|---|---|---|
| **B（merge 回归，PR 前必绿）** | `package invariants`、`agent note format`(L9,15条,最高风险)、`markdown links`(L7,14条非1)、`type equivalence` | 4 门。pre-merge 绿现红。`package invariants`+`type equivalence` 检查器也收紧了（hybrid：内容回归+检查器新规则）。 |
| A（pre-existing，可作 known-red） | `runtime closure`、`constraints`、`export jsdoc`(3)、`translation pairing` | 4 门。归 GA-FORK-CI-green / parallel-dev-cleanup。`export jsdoc` pre-merge 7 现 3（merge 修了 4）。`translation pairing` 的 gen-doc-graphs sub-failure 由本 session 线 ③ 清零。 |
| C（upstream 新门，fork 从未满足） | `client UI i18n`(98)、`package dependencies`(74)、`application entrypoints`(10,删僵尸后解锁)、`subsystem pages`(5)、`documentation standard tests` | 5 门。pre-merge 不存在。可作 known-red 或 quick fix（L6 entrypoints 删僵尸后可 allowlist）。 |

## 三、⚠ 并行铁律（违反必返工）

1. **同一棵树里禁止两个 subagent 同时跑 build / `gen-*` / `check:*`**——写 `dist/`/`lib/`/`.tsbuildinfo`，并发互相破坏。
2. **主 session 独占写操作**：build / `gen-*` / `git commit` 只能主 session 串行做。
3. **subagent 只读分析 + 产出精确 patch 方案**（文件+行号+改法+理由），不自己跑 build/gen/commit/改文件。需真写代码的给独立 worktree。
4. 单个 `verify-*` gate 只读，subagent 可跑；`gen-*` 是写操作，不可以。
5. **主 session + subagent 一律 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠 → `mcp__local__bash` 里的 `grep -rEn`。**`rg` 不存在**。
6. **node v24 强制**：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。**v25.9.0 系统默认，crash tsdown/rolldown/fs-ext**。
7. shell 是 `sh` 不是 bash：**不支持 `<(...)`**，用临时文件 + `sort`/`comm`。
8. **⚠ split-brain 铁律（本 session 踩出）**：`mcp__local__*` 跑在用户 Mac 上，**够不着 runner 侧 `/tmp/claude-*/.../tasks/*.output` transcript**。subagent 产出大交付（>~100KB 会在 task-notification 截断）时，**让该 subagent 自己用 `mcp__local__write_file` 直接写盘**（它自己上下文里有 verbatim 内容），**别派另一个 subagent 去读 transcript**——会失败并拒绝编造。本 session S2 的 UM15 首片方案就这么丢了 §1-4.4。
9. **不 push**（UM11 仍 blocked by UM12 B 类）。

## 四、方法论铁律

- **不轻信票据/prompt 里记的「已 verified」**。本 session 第四次发现记录错（`558e6f4f66` 被记为 fork parent，实为 M1 后代；真 parent = `65bf3cddc9`）。凡结论要用自己的，自己重跑。
- **凡 gate 以 throw 形式失败，修完 throw 必须重跑并审 regen diff**。本 session 第三次见「预检 throw 掩盖真实 staleness」（`doc graphs` 掩盖 13 个缺失服务 + 陈旧事件矩阵；`cordis inspect catalog` 掩盖 api-catalog stale）。throw 是预检在生成前抛的，修完它生成器才跑到底，会报真实 staleness。
- **控制你自己引入的变量**。`~/.gitconfig core.symlinks=false` 让 tracked symlink 落成路径文本——每次新 checkout 必查必修（修法不产生 tracked 改动，别 commit）。

## 五、本轮编排

### 线 A（主轴）：B 类 4 真回归全修（UM11 硬阻塞）

4 门，**全须 PR 前绿**（用户指令）。串行，每门单独 verify + commit。按 risk÷gain 排序：

1. **`markdown links`(L7, 14 条)**：逐条 triage。`slot-contract.ts` 那条按 S1 删 `ui-settings-models/README{,.zh}.md:37` 的 "Extension slots" 段（保 i18n 配对）。余 13 条多数指向 upstream 已删的 `examples/`、已删 note、或 anchor 缺失——逐条判删/改/留。
2. **`type equivalence`**：检查器 `verify-type-equiv.ts` +73−3（加了 module-augmentation `augmentations` 合并特性）。pre-merge 绿现红 = hybrid。需读新 `augmentations` 特性 + 找 fork 的违规点。
3. **`package invariants`**：`scripts/package-invariants.ts` +93−37（加 3 条新规则：`exports["./invariant"]` 缺 `src/invariant.ts` 时须省、`dsh-invariants` 须作 peerDep、缺配套须 README 写理由）。pre-merge 绿现红 = hybrid。需读新规则 + 找 fork 违规包。
4. **`agent note format`(L9, 15 条，最高风险)**：⚠ `rejected/simplification/2026-09-03-*.md` 是 15 个（非 S3 记的 19），`proposed/simplification/` 目录已不存在 → `git mv` 目标需先重建目录；`proposed:` 语法额外要求 `## Proposal`/`## Acceptance criteria`/`## Risks` 三标题，未核，可能触发第二波。**放最后，先核清楚再动**。

每门 verify + commit 后，重跑 `check:ci:static` + `comm -13` 比对**确认无新增失败**。

### 线 B（并行）：UM15 首片落地

S2 的方案 §6/§7/§8 + §4.5/§4.6 设计摘要已存盘 [`research/um15-first-slice-implementation-2026-09-14.md`](../research/um15-first-slice-implementation-2026-09-14.md)。**丢失的 §1/§2/§3/§4.1-4.4 须重派 S2 补**。

- **重派 S2**（只读 subagent）：给它上述 research 文件 + 设计草案 [`research/um15-durable-sync-design-2026-09-10.md`](../research/um15-durable-sync-design-2026-09-10.md) + [UM15 票](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) + [UM-MERGE-INTEGRITY Resolution](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)（喂 `upstream-sync.json` 的 waivers 真值：M1=`6b7610d45a`/`d347e70390`、M2=`8112743d69`/`c389f96bf3`、HEAD=`10941436b5`、5 组发现里 pending 的）。让它只补 §1（`run-gates.ts` MODES 重构）+ §2（`verify-gate-coverage.ts` meta-gate）+ §3（`generator-inputs.manifest.json`+spec）+ §4.1-4.4（`upstream-sync-record.ts` 核心模块 + 初始 `upstream-sync.json`）。§6 让它别走 (a) 弯路；§7.2 的 11 条让它落地前逐条验。**让它自己 `mcp__local__write_file` 写盘交付**（split-brain 铁律，别重蹈覆辙）。
- 主 session 按 §8 顺序落：§1 → enroll `verify-architecture-graph`（已 GREEN）→ §2 → §3（并行）→ §4（最后，单独跑 `upstream-status`）。**落地后必须跑 tsc/oxlint/vitest**（§7.2 第 10 条——S2 没跑过）。
- **3 道完整性门**（UM-MERGE-INTEGRITY 喂的新输入）：删除未应用 / 新增被丢弃 / **修改被回退**（第三道抓整包回退，前两道抓不到）。纯 git plumbing。

### 线 C（并行，AFK）：translation zh 实现

用户决策 = 生成器带上 zh (a)。实现：读 `gen-module-graph.ts:112-151` 的 zh 写入机制（真生成 vs copy？）→ 给 `gen-doc-graphs` 6 产物（capability-seams / event-producer-consumer / agent-lifecycle / tool-execution-pipeline / graph-atlas / apps/cli/composition）加 zh 渲染 + `.i18n.yaml` 配对哈希 → regen → `verify-translation-pairing`（本轮 +2 sub-failure 应清零）。同步核 `gen-architecture-graph`（只写英文、无 zh 对）是否也欠配对。

### 线 D（quick / 可并入线 A）：零散收尾

- **`knip.json` + `connection/tests/fake-api.client.ts` 删**（零门收益，UM-MERGE-INTEGRITY defer 项）：需改 `scripts/rescope-fork.ts:263-264` + `rescope-fork.spec.ts:132-137`。独立 commit。⚠ `connection/tests/fake-api.client.ts` 是**不同文件**于 `api/session-controller/tests/fake-api.client.ts`（后者被 7 spec import）——别按名误删。
- **L6 `application entrypoints`**（C 类，10 条 allowlist）：删僵尸后已解锁。`MANIFEST_BIN_ALLOWLIST` + `EXECUTABLE_SOURCE_ALLOWLIST` 加 10 条。[UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 有精确 patch。

### 第 1 轮：起 subagent 并行

| # | 线 | 任务 | 交付 |
|---|---|---|---|
| S1' | UM15 §1-4.4 重派 | 见线 B | 4 节完整代码（**自己 `mcp__local__write_file` 写盘**，别返回长文本——会截断丢失） |
| （可选）S2' | B 类 hybrid 门调查 | `package invariants`+`type equivalence` 的检查器新规则 + fork 违规点 | 逐门 patch 方案 |

B 类的 `markdown links`(L7) + `agent note format`(L9) 是内容回归（非 hybrid），主 session 直接做，不需 subagent。

### 第 2 轮：主 session 串行落地

1. 线 A 的 L7 markdown links（14 条逐条）→ commit。
2. 线 A 的 type equivalence + package invariants（hybrid，读完检查器新规则后修）→ 各 commit。
3. 线 A 的 L9 agent note format（最后，风险最高）→ commit。
4. 线 B 的 UM15 首片（S1' 交付后，按 §8 顺序）→ 各 commit。
5. 线 C 的 translation zh → commit。
6. 线 D 的 knip/fake-api + L6 → commit。
7. 每批重跑 `check:ci:static` + `comm` 比对。

### 第 3 轮：和用户过 UM15 的 4 项 grilling

Decision 1（staleness 跑哪）/ 2（cadence 阈值）/ 5（先修 SEAM_MANIFEST seam-6）/ 8（impact report 落哪）。HITL，subagent 不能替。**落地 UM15 首片时逐项带过来，不攒着**（本 session 的教训：grilling 当「下 session 做」违反 HITL 契约）。

## 六、本 session 不做

- **不 push、不开 PR**（UM11 blocked by UM12 B 类 4 门）。
- **不删分支/worktree**（归 UM11 Scope 4-6 + A23）。⚠ 5 个 `refactor/p2-*` 不可按 ancestry 判删（Phase-2 按内容收编）。
- **不碰 `.worktrees/r10-harness-goodhart` 和 `.worktrees/t1-exec-grader`**（evaluation effort）。
- **不恢复 `ui-settings-models` 的 `slot-contract.ts`/`operations.ts`**——不是 2 文件恢复，是真特性 merge → [UM-UI-SETTINGS-MODELS-RE-PORT](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md)，不在此 session。
- ~~**不跑 `gen-tsconfig-paths`**~~：**已解**（`10941436b5` 删通配块），生成器现在安全，可跑。
- **map.md 的 U+FFFD**：out of scope（parallel-dev-cleanup），别猜着改。

## 七、起手 checklist

1. Read 本 prompt + [`UM-flow-2026-09-08.md`](../tickets/phase-upstream-merge/UM-flow-2026-09-08.md) 末尾（2026-09-14 第二轮 update）+ [UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) Resolution（32/13 + B 类全修指令 + 13 红清单）+ [UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) Resolution + [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) Resolution + [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md) 2026-09-14 update + [`research/um15-first-slice-implementation-2026-09-14.md`](../research/um15-first-slice-implementation-2026-09-14.md)。
2. **核两 tip + 两树状态**：resync `10941436b5`（0 行）、master `44e6a485b0`（0 行）。⚠ **核 symlink**：`git -C /Users/mckenzie/workspace/dsh-resync ls-files -s | awk '$1=="120000"{print $4}'` + 逐个 `[ -L ]`。若坏：
   ```sh
   git config core.symlinks true
   git ls-files -s | awk '$1=="120000"{print $4}' > /tmp/links.txt
   xargs rm -f < /tmp/links.txt && xargs git checkout -- < /tmp/links.txt
   git status --short --untracked-files=no   # 必须空
   ```
3. 确认 `PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
4. **起 subagent**：S1'（UM15 §1-4.4 重派，**让它自己写盘交付**）。B 类 hybrid 门（package invariants + type equivalence）可选起调查 subagent。
5. 主 session 串行落地线 A（B 类 4 门）+ 线 C（translation zh）+ 线 D（knip/fake-api + L6）。每步单独 verify + commit。
6. **和用户过 UM15 的 4 项 grilling**（Decision 1/2/5/8）——HITL，不攒，逐项带过来。
7. 目标：① B 类 4 门全绿（解 UM11 硬阻塞）② UM15 首片落地 ③ translation zh 实现（translation pairing sub-failure 清零）④ 到 PR merge 的 session 数从 ~5-8 降到 ~3-5。

## 八、遗留项审计 + session 估算

**open 票 9 个**（+ 2 resolved-decision：UM-TSCONFIG-PATHS-POLICY / UM-GEN-DOC-TRANSLATION-OBLIGATION）：UM-ADAPT / UM-LINT-TYPEAWARE-CORDIS / UM-MERGE-INTEGRITY（近 done，knip/fake-api cleanup pending）/ UM11 / UM12 / UM15 / UM4 / UM6 / UM-UI-SETTINGS-MODELS-RE-PORT。

| 终点 | 估算 | 说明 |
|---|---|---|
| **PR merge（B 类全修干净）** | ~5-8 session | B 类 ~3-5 + translation ~1 + worktree/PR ~2-3 + quick C fix ~1。tsconfig 已落（-1）。 |
| **UM 专项完美结束** | ~17-23 session | + UM15 durable method ~3-4 + ui-settings re-port ~2 + UM-ADAPT/UM4/UM-CORDIS subtask3/R-DA Round2 ~3-4 + UM-LINT/Typert sprint ~3-4 |
| **全门绿（含 fork 债）** | ~24-31 session | + i18n 98 / deps 74 / doc-standard / runtime-closure / constraints（Tier C，非 UM destination） |

**关键不确定**：ui-settings re-port 规模未量化（20 偏离文件没逐读 diff）；documentation standard tests scope 未知；Typert sprint 18 包未开票；4 项 UM15 grilling 待人定。
