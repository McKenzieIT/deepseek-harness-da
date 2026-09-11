# Next-session prompt — UM-flow Phase C 收尾：UM-MERGE-INTEGRITY 枚举 + 5 门红 + UM15 首片实现（subagent 并行）

> 承接 `next-session-2026-09-14-phase-c-parallel-unblock.md`。线 A + 4 subagent 并行已收：**`check:ci:static` 23/22 → 27/18**，零新增，4 门翻绿，UM4 Scope2 收口，POLLUTION 收口，13 门全归因，UM15 设计草案落盘。
> **本 session 主轴 = 两条并行线：① UM-MERGE-INTEGRITY 完整性枚举（只读 subagent）+ ② 5 门红精确 patch 落地（主 session 串行）+ ③ UM15 首片实现（subagent，纯设计已定不需 grilling 的部分）**。

## 一、决策历史（前提，勿再重决）

- **Phase A/B/C 线已大体推进**：UM13/14/16/ARCH/CORDIS-REGEN/R-DA Phase1+2/R-DA-UI-PRESENTER-COMPOSITION 全 resolved；UM-ADAPT per-shift 仍开。
- **UM4 Scope2 resolved**（commit `025db697ab`）：`verify-cordis-config: 144 config files passed`。Scope3（A6 presetSwitches race）仍 open。
- **UM-DATA-SRC-DTS-POLLUTION resolved**（commit `6514ade8fc`）：票据首要嫌疑**被证伪**（37 个 tsconfig 全同构，无配置可修，产出者=单次手发裸 tsc）。用户选全面清理：删 84+identity 4+scope-registry 4 已提交产物 + 移除 `.gitignore:52-60` 整块 + `.oxlintrc.json` 加护栏。lint **1980→93**，护栏后仍 93（不吞真信号）。**resync 工作树首次 `git status` 完全干净（0 行）**。
- **UM12 未 resolved 但大幅前进**：13 门「待逐门归因」**全部归因**。三个主根因（RC-Z 僵尸复活 / RC-P2 Phase-2 残留 / RC-M merge 期错位）解释其中 9 门。
- **UM15 设计草案落盘**（[`research/um15-durable-sync-design-2026-09-10.md`](../research/um15-durable-sync-design-2026-09-10.md)，69KB）。用户已定 **Decision 7 = (b)**：首片做 §1 staleness + §6 regen 清单 + meta-gate。仍需 grilling 7 项（见 UM15 Resolution）。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，tip **`a469c899bd`**，**unpushed**，工作树**完全干净（0 行）** |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip **本轮提交后**，ahead origin，工作树干净 |
| `build:official` | **GREEN**（lib/ 与 dist/ 是有效产物——**别乱 rebuild**） |
| `check:ci:static` | **27 passed / 18 failed**（本 session 实测，两轮 `comm` 比对零新增） |
| full lint | **93 errors + 1 warning**（稳定、无产物污染基线，交给 UM-LINT-TYPEAWARE-CORDIS） |
| `pnpm install --frozen-lockfile` | **PASS**（`40449bfa93` 修了；此前 CI install 本来就挂） |

### 18 门红的清单（按根因分组，均有归因）

| 根因 | 门 | 状态 |
|---|---|---|
| **RC-Z 僵尸复活**（→ UM-MERGE-INTEGRITY） | `config catalog`、`tsconfig paths`、`application entrypoints`(3/13)、`subsystem pages`(1/6)、`package README model experience`(2/3) | 删僵尸包后 5 门解 |
| **RC-P2 Phase-2 残留** | `package README model experience`(1/3)、`cordis catalog`(已修)、`cordis inspect catalog`(JSDoc 债) | |
| **RC-M merge 期错位** | `agent note format`、`markdown links`(剩 1 条)、`doc budgets`(已修) | |
| GA-FORK-CI known master-red | `runtime closure`、`constraints`、`export jsdoc`(3)、`translation pairing`、`client UI i18n` | 归 parallel-dev-cleanup / pre-existing |
| 体量即证 pre-existing 债 | `package dependencies`(74)、`package invariants` | |
| 待逐门 | `doc graphs`(SERVICE_ROLES 缺 resultGateway)、`documentation standard tests`、`type equivalence` | |

## 三、⚠ 并行铁律（线 A 踩出来的，违反必返工）

1. **同一棵树里禁止两个 subagent 同时跑 build / `gen-*` / `check:*`**——它们写 `dist/`、`lib/`、`.tsbuildinfo`，并发即互相破坏。
2. **主 session 独占「写操作」**：跑 build / `gen-*` / `git commit` 只能主 session 做，且串行。
3. **subagent 只做只读分析 + 产出精确 patch 方案**（文件 + 行号 + 改法 + 理由），**不自己跑 build、不自己 commit、不自己改文件**。需真写代码的给它独立 worktree。
4. 单个 `verify-*` gate 是只读的，subagent 可跑；**`gen-*` 是写操作，不可以**（`gen-doc-graphs` 是写，L8 的 regen 由主 session 做）。
5. **主 session + subagent 一律强制 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob 均 BLOCKED）。`mcp__local__grep` 不可靠 → 用 `mcp__local__bash` 里的 `grep -rEn`。**`rg` 在这台机器上不存在**。
6. **node v24 强制**：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。**v25.9.0 是系统默认且会 crash tsdown/rolldown + fs-ext**。
7. shell 是 `sh` 不是 bash：**不支持 `<(...)` 进程替换**，别用。
8. **不 push**（UM11 仍 blocked by UM12 + UM-MERGE-INTEGRITY）。

## 四、方法论铁律（线 A 的两条教训，本 session 再次验证有效）

- **不要轻信票据/prompt 里记的「已 verified」**。线 A 独立重导才发现 Phase-2 记的「client tsc 144→0」实为 1。本 session S3 分诊时把「`gen-* --check` ⇒ regen 可解」当真,实跑发现 4 门在预检阶段 throw、regen 不是替代;且 `cordis catalog` 的 throw 还**掩盖了**真实 staleness。**凡结论要用,就自己重跑一遍。**
- **控制你自己引入的变量**。本 session 发现 `~/.gitconfig core.symlinks=false` 让两树共 16 个 tracked symlink 落成路径文本——这是被忽略的混杂因子。**每次新 checkout 后先核 `git ls-files -s | awk '$1=="120000"{print $4}'`,确认每个路径是 `-L`**(见下「起手 checklist」第 2 步)。

## 五、本轮编排（3 条并行线 + 主 session 串行落地）

### 线 ①：UM-MERGE-INTEGRITY 完整性枚举（只读 subagent，**主线**，硬阻塞 UM11）

[UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 已发现 2026-09-07 merge **双向有损**,但只找到实例,未穷举集合。**枚举是只读 git plumbing,适合 subagent**。

**任务**:把两个方向各自的完整集合枚举出来:
- **方向 A（丢了 upstream 文件）**:树 diff `c389f96bf3` vs `HEAD`,限定在「upstream 在上一个 merge base `d347e70390` 之后动过且未删除」的路径上。已知 `ui-settings-models/src/client/{slot-contract,operations}.ts`(无普通 commit 删过)。判 keep(有意重构)vs drop(merge 误丢)——**需读 `6b7610d45a` 的冲突解决**才能区分。
- **方向 B（复活了 upstream 已删包）**:找出所有「upstream 已删、fork 仍在」。已知 `packages/examples/{jsonrpc-demo,agent-spine-demo}`(三个删除 commit 均为 `d347e70390` 的 ancestor)。判据:`git log --diff-filter=D` + `merge-base --is-ancestor`。

**交付**:两个完整集合 + 每条 keep/drop 判定 + 给主 session 的删除 patch(方向 B 的删除含 `python/sdk-runtime/package.json` 的两条 `workspace:^` + `pnpm-lock.yaml` + `gen-module-graph`/`gen-architecture-graph` regen 清单)。

**交付后**:主 session 落地方向 B 的删除 → 5 门顺带解(`config catalog`/`tsconfig paths`/`application entrypoints` 3 条/`subsystem pages` 1 条/`package README model experience` 2 条)→ 再落 L6(`application entrypoints` 的 12 条 allowlist,**必须在僵尸删除后**)。

### 线 ②：5 门红精确 patch 落地（主 session 串行，不并行）

S3 已给逐门 file:line 级 patch。**按依赖顺序串行**(不能并行,因为同树写操作):

1. **L8 `doc graphs`**:`scripts/gen-doc-graphs.ts` 的 `SERVICE_ROLES`(line ~100)加 `resultGateway`(~8 行,源 `packages/data/result-cache/src/remote.ts:48`)→ `pnpm run gen-doc-graphs`(写操作,主 session)→ `verify-doc-graphs`。
2. **L4 `Cordis inspect catalog`**:5 处 JSDoc(`result-cache/src/client/service.ts` 3 处 + `ui-context-layer/src/client/service.ts` 2 处,~14 行)→ `verify-cordis-inspect-catalog`。
3. **L1 之后的 markdown links 剩 1 条**:依赖线 ① 的方向 A 结论(`slot-contract.ts` 是否真丢)——**线 ① 出结论后再动**。
4. **L9 `agent note format`**:⚠ **S3 记 19,实测 15**。`rejected/simplification/2026-09-03-*.md` 是 15 个,`proposed/simplification/` 目录已不存在。`git mv` 目标需先重建目录;且 `proposed:` 语法额外要求三标题,未核,可能触发第二波。**风险比 S3 估的高,建议放最后或先核清楚再动。**
5. **L6 `application entrypoints`**:12 条 allowlist(`MANIFEST_BIN_ALLOWLIST` + `EXECUTABLE_SOURCE_ALLOWLIST`)。**必须在线 ① 僵尸包删除之后**,否则把 3 条僵尸行错误 allowlist 掉。

每门单独 verify + commit。每落一批重跑 `check:ci:static` + `comm` 比对失败集合,**确认无新增失败**。

### 线 ③：UM15 首片实现（subagent，设计已定不需 grilling 的部分）

[UM15 Resolution](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) + [`research/um15-durable-sync-design-2026-09-10.md`](../research/um15-durable-sync-design-2026-09-10.md)。**用户已定 Decision 7 = (b):首片 = §1 staleness + §6 regen 清单 + meta-gate**。

**首片里不需 grilling、可 subagent 纯做的**:
- **前置(Decision 6 precondition)**:把 `scripts/run-gates.ts` 里**重复三份**的 mode 列表(`:24-41` Mode union / `:135-152` parseMode switch / `:156` error string)收成一个导出 `const MODES = [...] as const` + `type Mode = typeof MODES[number]`。**小、机械、让 meta-gate 自己的正确性结构化。**
- **`scripts/generator-inputs.manifest.json`**(§6.1 清单的数据化)+ `scripts/verify-generator-inputs.spec.ts`(断言每个 generator 声明的输入匹配它实际读的)。
- **`scripts/verify-gate-coverage.ts`**(meta-gate):枚举所有 `verify-*`/`check:*` 脚本 × `gatesForMode(m) for m of MODES`,diff,失败在既不在聚合也不在豁免清单的脚本上。豁免清单 3 条初始(`no-production-src-on-master`/`npm-install-layout`/`cordis-api` alias)。
- **`scripts/upstream-sync-record.ts` + `verify-upstream-sync-record.ts` + `upstream-status.ts`**(§1 staleness,Decision 1 = (c) 先 local)。

**首片里仍需 grilling、subagent 不能替的 7 项**(见 UM15 Resolution 表):Decision 1(跑哪)、2(cadence)、3(记录格式)、4(`--rev` 能否不 install 跑——**未验证,需 spike**)、5(先修 seam-6)、6(meta-gate day-one 红)、8(impact report 落哪)。**这些攒齐和用户过一轮。**

**注意铁律**:线 ③ 的 subagent **只能给实现方案(文件 + 代码),不能自己跑 `gen-*`/`build`/`commit`**。落地由主 session 串行做。`scripts/run-gates.ts` 的 MODES 重构是写操作,主 session 做。

### 第 1 轮：起 3 个只读 subagent 并行

| # | 线 | 任务 | 交付 |
|---|---|---|---|
| **S1** | UM-MERGE-INTEGRITY 枚举 | 见线 ① | 两集合 + keep/drop + 删除 patch |
| **S2** | UM15 首片实现方案 | 见线 ③,产 4 个新脚本的完整代码 + `run-gates.ts` MODES 重构 patch + `package.json` script 条目 | 精确 patch(可 verbatim 应用) |
| **S3** | pre-merge 基线补齐 | **UM12 诚实边界**:在 fork parent `558e6f4f66` 上复跑 `check:ci:static`,建立严格 pre-merge red set,正面确证哪些门 pre-existing(只有 `documentation standard tests` 做到了)。**只读 git + gate 跑,需独立 worktree**(见下)| pre-merge vs post-merge red set 对照表 |

**S3 需独立 worktree**(因为要 checkout 到 `558e6f4f66` 跑 gate,不能污染 resync 树):
```sh
git -C /Users/mckenzie/workspace/dsh-resync worktree add ../dsh-premerge-baseline -b um12-premerge-baseline 558e6f4f66
cd /Users/mckenzie/workspace/dsh-premerge-baseline
export PATH="/usr/local/bin:$PATH"; pnpm install --frozen-lockfile --ignore-scripts  # 注意 558e6f4f66 的 lockfile 状态
pnpm run check:ci:static
```
⚠ **S3 在独立 worktree 跑 gate,不与主 session 同树** —— 这是唯一可以并行跑 `check:ci:static` 的方式。S1/S2 在 resync 树只读,不跑 gate。

### 第 2 轮：主 session 串行落地

1. 落 **S1 方向 B 删除** → 5 门顺带解 → `verify-config-catalog`/`verify-tsconfig-paths`/`verify-architecture-graph`/`verify-module-graph` → commit。
2. 落 **S2 的 MODES 重构**(`run-gates.ts`)+ `gate-coverage`/`upstream-sync-record`/`generator-inputs` 三个新脚本 + `package.json` 条目 → 每个单独 verify + commit。
3. 落 **L8/L4** → 每门单独 verify + commit。
4. 落 **L6**(僵尸删除后)。
5. 收齐 S3 pre-merge 基线后,**和用户过 UM15 的 7 项 grilling**(Decision 1/2/3/4/5/6/8)。
6. 每批重跑 `check:ci:static` + `comm` 比对,**确认无新增失败**。

### 第 3 轮（看余量）：UM-LINT-TYPEAWARE-CORDIS + Round 3 cherry-pick

- **Round 3 cherry-pick `a99d206835`**(2 行 lint fix,已在 `fix/lint-noop-assertion-unused-disable`,对 master 0-ahead/对 resync 53-ahead,52 个是 wayfinder 文档,1 个是真 fix):`tool-update-table-config/src/index.ts:250` 多余 assertion + `eval-cli/tests/compare.spec.ts:1` unused disable。**仍确认在 resync HEAD 未吸收**(本 session 已核)。cherry-pick 后 lint 93→91。
- **UM-LINT-TYPEAWARE-CORDIS 是 grilling 票**(A/B/C 方案取舍需人定,subagent 不能替)。等 93 基线稳(已稳)再和人过。POLLUTION 已 unblock 它。

## 六、本 session 不做

- **不 push、不开 PR**(UM11 blocked by UM12 + UM-MERGE-INTEGRITY)。
- **不删任何分支/worktree**。清理归 UM11 Scope 4-6 + A23。⚠ **5 个 `refactor/p2-*` 分支不可按 ancestry 判删**——Phase-2 是按内容收编(cherry-pick/squash)进 `eb9e4cf05c`,`merge-base --is-ancestor` 一律返回 false,误删会丢工作。
- **不碰 `.worktrees/r10-harness-goodhart` 和 `.worktrees/t1-exec-grader`**——属 evaluation effort。
- **UM6** 仍 blocked by UM4 Scope3(A6 race)——本轮不排。
- **UM-ADAPT per-shift 收尾** + `UM-CORDIS-REGEN` 子任务 3(blocked by `RootOwnerProps` homing):本轮不排。
- **map.md 的 U+FFFD**(Out-of-scope 段记 7 行,实测 2 行):明确 out of scope,属 parallel-dev-cleanup,**别猜着改**。

## 七、起手 checklist

1. Read 本 prompt + [`UM-flow-2026-09-08.md`](../tickets/phase-upstream-merge/UM-flow-2026-09-08.md) 末尾 + [UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) Resolution(终态 27/18 + 5 门待办表)+ [UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) + [UM15 Resolution](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) + [`research/um15-durable-sync-design-2026-09-10.md`](../research/um15-durable-sync-design-2026-09-10.md)。
2. **核 `a469c899bd` 两 tip + 两树状态**(resync:0 行;master:0 行)。⚠ **核 symlink**:`git -C /Users/mckenzie/workspace/dsh-resync ls-files -s | awk '$1=="120000"{print $4}'` + 逐个 `[ -L ]`。本 session 修过 `core.symlinks=true`(两树共享 `.git/config`),但**新 checkout 会回退** —— 若坏,跑:
   ```sh
   git config core.symlinks true
   git ls-files -s | awk '$1=="120000"{print $4}' > /tmp/links.txt
   xargs rm -f < /tmp/links.txt && xargs git checkout -- < /tmp/links.txt
   git status --short --untracked-files=no   # 必须空
   ```
3. 确认 `PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
4. **起 3 个 subagent(S1 枚举 / S2 UM15 方案 / S3 pre-merge 基线)**,每个 prompt 带第三节并行铁律。**S3 给独立 worktree**(见第五节第 1 轮),S1/S2 在 resync 树只读。
5. 收齐后主 session 串行落地(第 2 轮),每步单独 verify + commit。
6. 每票收口后更新其 Resolution + map Decisions-so-far + UM-flow overview。
7. 目标:① UM-MERGE-INTEGRITY 收口(解 UM11 硬阻塞)② 5 门红降到 ≤10 ③ UM15 首片实现落地(MODES 重构 + meta-gate + staleness)④ 和用户过 UM15 的 7 项 grilling。

## 八、遗留项审计结论（本 session 末做的，供下 session 参考）

| 项 | 现在补 vs 下 session | 理由 |
|---|---|---|
| S4 UM15 设计草案落盘 | **现在已补**(`research/um15-...md`, 69KB) | 零成本但重导要花一整个 subagent |
| L1 `documentation site checks`(1 行) | **现在已补**(`a469c899bd`) | 最低风险,1 行,且属独立 commit |
| L8 `doc graphs`(SERVICE_ROLES + regen) | 下 session | 需 regen(写操作)+ 与 UM4 线协调 `remote.ts` |
| L4 `Cordis inspect catalog`(5 JSDoc) | 下 session | 中等量纯写 |
| L6 `application entrypoints` | 下 session | **必须等僵尸删除后** |
| L7 `markdown links` 剩 1 条 | 下 session | 依赖 UM-MERGE-INTEGRITY 方向 A |
| L9 `agent note format` | 下 session | S3 记 19 实测 15,风险被低估 |
| UM-MERGE-INTEGRITY 枚举 | 下 session(线 ①) | 只读枚举,适合 subagent,硬阻塞 UM11 |
| Round 3 cherry-pick `a99d206835` | 下 session(第 3 轮) | 属 UM-LINT-TYPEAWARE-CORDIS |
| UM15 首片实现 | 下 session(线 ③) | 设计已定,实现未写 |
| UM15 的 7 项 grilling | 下 session(和用户过) | HITL,subagent 不能替 |
| symlink 修复 | **每次新 checkout 必做** | `core.symlinks=false` 是环境级混杂因子 |
