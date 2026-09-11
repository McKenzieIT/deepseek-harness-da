# Next-session prompt — UM-flow Phase C：落 UM15 首片 §2/§3/§4（subagent 交付在盘）+ 4 项 grilling + 推 PR

> 承接 `next-session-2026-09-15-b-class-4regressions-um15-firstslice.md`（本 session 已执行）。第三轮收尾：**B 类 4 真回归逐门查证收口 = 2 绿 + 2 known-red（各有专属票）**；`check:ci:static` 32/13 → **34/11**，comm 零新增。**UM15 首片 §1（`b3a516fe98` MODES 重构）+ §5.2(c) enroll（`c579b809d2`）已落 resync**；§2/§3/§4 由 4 subagent 生成**在盘 ready**（`research/um15-slice-s{1,2,3,4}-2026-09-15.md`，~3200 行，master `483e98e952` committed）。**大原则确立**：upstream 内容不改、上游最新是什么用什么；其他（fork 自有）按需重构。
> **本 session 主轴 = ① 落 UM15 §2/§3/§4（主 session apply subagent 交付，§4 需 grilling #2/#8）② 4 项 HITL grilling（#1/#2/#5/#8）③ 推 PR（B 类 2 绿+2 known-red）**。

## 一、决策历史（前提，勿再重决）

- **Phase A/B/C 大体 resolved**：UM10/13/14/16/ARCH/CORDIS-REGEN/R-DA Phase1+2/R-DA-UI-PRESENTER-COMPOSITION 全 resolved；UM-ADAPT per-shift 仍开。
- **B 类 4 真回归收口（2026-09-15 第三轮）**：
  - **markdown-links** ✅ GREEN（14→0）：`e17f0fa16c`（9/14 重指向）+ `12d02c7687`（dsh-plugin-development skill 按 upstream 新拓扑重建——`4125514a08` retire examples/、`demo:acp`/`demo:cordis` 删、`3e942e5e21` 删 conv-node cookbook；skill 重指上游自维护文档不复述）。
  - **agent-note-format** ✅ GREEN（15→0）：`d4596863a6`。M2 `8112743d69` 把 15 篇 fork 自有 note 搬 rejected/ 未改 Status，搬回 proposed/。**该搬移对 `git log --<path>` 不可见、仅 `--diff-merges=first-parent/-m` 可见 = 第四类 merge 丢失**（merge 侧擅动 upstream 未触及的 fork 自有内容），已喂 UM15 三道门之外。
  - **type-equivalence** 🅿 known-red → [UM-QODER-SUBAGENT-RETIRE](../tickets/phase-upstream-merge/UM-QODER-SUBAGENT-RETIRE.md)：3 DRIFT 全是「fork 加字段到 upstream core 类型」（additive-only 违反）——`SubagentCosts`/`SubagentResult.costs`（活 G3 Qoder Credits，唯一生产者 `subagent-qoder`）+ `AgentOptions.scopeId`/`ToolExecutionInput.scopeId`（write-never，upstream 零 scopeId 确证）。**用户 d1 决策**：退 Qoder-as-subagent（删 subagent-qoder + costs + audit Credits feed + admin export + bundle 行）+ 搭车删 scopeId×2（同一 regen pass 免二次级联），一次级联全 3 DRIFT、type-equiv 全绿 + 恢复 upstream。本票前 type-equiv 全作 known-red。⚠ 删 scopeId 触发 3-gen cascade（cordis+config+doc-graphs，doc-graphs 有 zh churn），须并 [UM-GEN-DOC-TRANSLATION-OBLIGATION](../tickets/phase-upstream-merge/UM-GEN-DOC-TRANSLATION-OBLIGATION.md) zh 实现一起处理。
  - **package-invariants** 🅿 known-red → [UM-INVARIANT-COMPANION-CLEANUP](../tickets/phase-upstream-merge/UM-INVARIANT-COMPANION-CLEANUP.md)：74 违规（67 空 invariant companion+7 误 peerDep，7 是 67 子集）**非回归**——两规则均 upstream 引入（`15f2997bcb`+`de256e8bc1`）且 pre-merge 不存在，pre-merge 绿只因规则没生。与 `client UI i18n`(98)/`package dependencies`(74) 同类作 known-red。**用户 b 决策**：单开票专门做（先判占名机制再删 67 companion）。
- **大原则（用户 2026-09-15 确立）**：**upstream 的内容不改，上游最新版本是什么就用什么；其他（fork 自有）按需重构**。据此：skill 重建按上游新拓扑（不自己复述）、costs/scopeId 是 additive-only 违反应恢复 upstream、package-invariants 是 fork 包适配上游规则。
- **UM15 首片（2026-09-15）**：subagent 环境瞬态故障（前 5 次全死同 `socket connection closed unexpectedly`）后恢复——改「逐节派、增量写盘（先骨架后填充）、给已验证锚点减探查调用」后重派 4 个全成。§1+§5.2(c) enroll 已落；§2/§3/§4 在盘 ready。
- **grilling 3 决策仍有效**（2026-09-14）：tsconfig=explicit 已落（`10941436b5`）；translation=gen-zh 仍待实现（线 C）；B 类全修 → 现 2 绿+2 known-red。
- **pre-merge 基线**：`65bf3cddc9`（真 fork parent）实测 28/9。18 门红分 A6/B5/C7。`558e6f4f66` 是 M1 后代**不是** parent。
- **UM-MERGE-INTEGRITY 双向穷举**：M1 复活 100/丢 2/回退 27（ui-settings 整包）、M2 全 0。2 组僵尸已删。三道完整性门（删未应用/新增丢弃/修改回退）+ **第四类**（merge 侧擅动 fork 自有内容，三道抓不到，`--diff-merges` 才可见）。

## 二、当前状态（已核，勿重导）

| 项 | 值 |
|---|---|
| resync 树 | `/Users/mckenzie/workspace/dsh-resync`，branch `upstream/resync-2026-09-08`，tip **`c579b809d2`**，**unpushed**（5 commit：`e17f0fa16c`/`d4596863a6`/`12d02c7687`/`b3a516fe98`/`c579b809d2`），工作树干净 |
| master 树 | `/Users/mckenzie/workspace/deepseek-harness-da`，tip **`483e98e952`**（wayfinder 文档 commit），ahead origin，工作树干净 |
| `build:official` | **GREEN**（lib/ 与 dist/ 是有效产物——别乱 rebuild） |
| `check:ci:static` | **34 passed / 11 failed**（本 session 末实测，全程 comm 零新增） |
| full lint | **93 errors + 1 warning**（稳定，交 UM-LINT-TYPEAWARE-CORDIS） |
| `pnpm install --frozen-lockfile` | **PASS** |

### 11 门红（B 类 2 绿后）

| 类 | 门 | 说明 |
|---|---|---|
| A（pre-existing，known-red） | `runtime closure`、`constraints`、`export jsdoc`、`translation pairing` | 4 门。归 GA-FORK-CI-green / parallel-dev-cleanup。`export jsdoc` pre-merge 7 现 3。`translation pairing` 的 gen-doc-graphs sub-failure 由线 C 清零。 |
| B（known-red，各有专属票） | `type equivalence`、`package invariants` | 2 门。type-equiv → UM-QODER-SUBAGENT-RETIRE（costs+scopeId×2）；package-invariants → UM-INVARIANT-COMPANION-CLEANUP（67 companion）。**均非本 session 直接修**，作 known-red 进 PR 清单。 |
| C（upstream 新门，known-red） | `client UI i18n`(98)、`package dependencies`(74)、`application entrypoints`(10)、`subsystem pages`(5)、`documentation standard tests` | 5 门。fork 从未满足，可作 known-red 或 quick fix。 |

### UM15 在盘交付（master `483e98e952`）

| 节 | 文件 | 行 | 状态 |
|---|---|---|---|
| §1 | `research/um15-slice-s1-run-gates-2026-09-15.md` | 613 | ✅ 已落 resync `b3a516fe98` |
| §2 | `research/um15-slice-s2-gate-coverage-2026-09-15.md` | 638 | 待 apply（不需 grilling；⚠ 设计偏差：改文本提取替代 runtime `gatesForMode`，因 pnpmInvocation 在 pnpm 外 throw） |
| §3 | `research/um15-slice-s3-generator-inputs-2026-09-15.md` | 508 | 待 apply（不需 grilling） |
| §4 | `research/um15-slice-s4-upstream-sync-record-2026-09-15.md` | 1426 | 待 apply（**需 HITL grilling #2/#8**；订正 revert-fork HEAD 残余 6 非 7） |

## 三、⚠ 并行铁律（违反必返工）

1. **同一棵树里禁止两个 subagent 同时跑 build / `gen-*` / `check:*`**——写 `dist/`/`lib/`/`.tsbuildinfo`，并发互相破坏。
2. **主 session 独占写操作**：build / `gen-*` / `git commit` 只能主 session 串行做。
3. **subagent 只读分析 + 产出精确 patch 方案**，不自己跑 build/gen/commit/改文件。需真写代码的给独立 worktree。
4. 单个 `verify-*` gate 只读，subagent 可跑；`gen-*` 是写操作，不可以。
5. **主 session + subagent 一律 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）。`mcp__local__grep` 不可靠 → `mcp__local__bash` 里的 `grep -rEn`。`rg` 不存在。
6. **node v24 强制**：每条命令前置 `export PATH="/usr/local/bin:$PATH"`（v24.15.0）。v25.9.0 系统默认 crash tsdown/rolldown/fs-ext。
7. shell 是 `sh` 不是 bash：不支持 `<(...)`，用临时文件 + `sort`/`comm`。
8. **⚠ split-brain 铁律**：`mcp__local__*` 跑在用户 Mac 上，够不着 runner 侧 `/tmp/claude-*/.../tasks/*.output` transcript。subagent 产出大交付（>~100KB 会在 task-notification 截断）时，**让该 subagent 自己用 `mcp__local__write_file` 直接写盘**，别派另一个 subagent 去读 transcript——会失败并拒绝编造。
9. **⚠ subagent 瞬态故障（本 session 踩出，已恢复）**：长 subagent（>~15min/30+ calls）可能撞 `API Error: socket connection closed unexpectedly` 而死，产出零。**对策**：① 先起最小 probe（1 bash+1 write）验存活 ② 逐节派（不一次性派大节）③ **增量写盘**（先写整份骨架，再逐节覆写填充，每节落盘）④ 给已验证锚点减探查调用。本 session 5 次失败后改此结构，4 次全成。
10. **不 push**（PR 前 review；本 session 决策推 PR 或留 review 由用户定）。

## 四、方法论铁律

- **不轻信票据/prompt 里记的「已 verified」**。本 session 又一次：§4 残骸记 revert-fork HEAD 残余 7，实测 6。凡结论要用自己的，自己重跑。
- **凡 gate 以 throw 形式失败，修完 throw 必须重跑并审 regen diff**。throw 是预检在生成前抛的，修完它生成器才跑到底，会报真实 staleness。
- **控制你自己引入的变量**。`~/.gitconfig core.symlinks=false` 让 tracked symlink 落成路径文本——每次新 checkout 必查必修。
- **master 树 index.lock 警惕**：本 session 末遇 stale index.lock（0 字节、29min 前、无活动 git 进程 = 可删；但若有活动 eval session 在用，别删）。删前必查 mtime + `ps aux | grep git`。

## 五、本轮编排

### 线 1（主轴）：落 UM15 §2/§3/§4（apply subagent 交付）

按 §8 顺序，每节 apply + tsc/oxlint/vitest + 单独 commit。§1/enroll 已落，从 §2 起：

1. **§2 gate-coverage meta-gate**（不需 grilling）：
   - apply `scripts/verify-gate-coverage.ts`（照 `verify-config-source-ownership.ts` CLI 模板 + `verify-doc-budgets.ts` manifest 模式；⚠ §2 subagent 用**文本提取** `pnpmScript('id','script')` 2nd args 替代 runtime `gatesForMode`——验它等价）+ manifest（20 豁免，含差集 21/65 未登记实测版）+ spec。
   - 接线：`package.json` 新 script 插 `:167 verify-architecture-graph` 后 / `:168 constraints` 前；门 id `gate-coverage` 进 `ciSharedStaticGates()` 尾 + `hygieneLeafGates()` 尾（两函数从不同 mode 出现，不触发 `validateGateGraph:813` duplicate-id）；spec hygiene id 断言 `:185` 加 `'gate-coverage'`。
   - ⚠ §2 manifest 把 `verify-third-party-notices` 列"pending blind spot"豁免，与 Decision 6a"enroll 两者"有张力——落 §2 时读其豁免理由再定（enroll 它 or 留豁免）。
   - verify + commit。
2. **§3 generator-inputs manifest**（不需 grilling，与 §2 无耦合，可并行/先后）：
   - apply `scripts/generator-inputs.manifest.json`（17 生成器输入面实测，非草案）+ spec。
   - verify + commit。
3. **§4 upstream-sync-record**（**需 HITL grilling #2/#8 先**）：
   - apply `scripts/upstream-sync-record.ts`（上半类型+shape 已在 §4.2；下半 git 层+三道门在 §4.2.bis）+ 初始 `upstream-sync.json`（sha/时间戳 `git show -s --format=%cI` 实测，waivers 覆盖 129 条 M1 finding）+ `scripts/verify-upstream-sync-record.ts`（门）+ `scripts/upstream-status.ts`（报告，永不失败 exit 0）。
   - 接线：`package.json` 2 新 script 插 `:167/:168` 间；门 id `upstream-sync-record` 进 `ciSharedStaticGates`+`hygieneLeafGates` 尾；`upstream-status` 不进任何 mode。
   - **落地后必跑 tsc/oxlint/vitest**（§7.2 第 10 条——subagent 没跑过）+ 单独跑 `pnpm run upstream-status`。
   - verify + commit。
4. **§5 SEAM_MANIFEST seam-6**（grilling #5=a 本票带）+ **cron**（grilling #1=c 先 local）。

### 线 2：推 PR（B 类 2 绿+2 known-red）

- B 类 4 门收口：markdown-links/agent-note-format GREEN + type-equiv/package-invariants known-red（各专属票）。
- **PR 描述须写明**：① ui-settings-models 整包被 M1 回退（~30 文件，`tsc` 全绿、`--cc` 看不见，见 UM-MERGE-INTEGRITY）② type-equiv/package-invariants 作 known-red 的理由 + 各自专属票 ③ 大原则（upstream 不改）。
- resync `c579b809d2` unpushed → push + 开 PR。

### 线 3（可选/并行，AFK）：translation zh（线 C）

- 用户决策 = 生成器带上 zh (a)。`gen-module-graph` 会写三件（md/zh/i18n），照它给 `gen-doc-graphs` 6 产物加 zh 渲染 + `.i18n.yaml` 配对哈希。
- **是 UM-QODER-SUBAGENT-RETIRE 的前置**：退 Qoder 删 costs 触发 doc-graphs regen，gen-doc-graphs 只写英文 → regen 让 translation-pairing 变红。先做 zh，Qoder 退场那次级联就干净。
- regen → `verify-translation-pairing` 本轮 +2 sub-failure 清零。

### 线 D（quick）：knip/fake-api 删 + L6 application entrypoints allowlist

- `knip.json` + `connection/tests/fake-api.client.ts` 删（改 `scripts/rescope-fork.ts:263-264` + `rescope-fork.spec.ts:132-137`）。⚠ 别误删 `api/session-controller/tests/fake-api.client.ts`（7 spec import）。
- L6 `application entrypoints`（C 类，10 条 allowlist）：删僵尸后已解锁，`MANIFEST_BIN_ALLOWLIST`+`EXECUTABLE_SOURCE_ALLOWLIST` 加 10 条。[UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 有精确 patch。

### 第 1 轮：起 subagent（若需重派或派新活）

subagent 现已健康（本 session 末 4 次全成），但若再遇 socket 故障，用「逐节派 + 增量写盘 + probe 先验」结构。§2/§3/§4 交付在盘，**主 session 直接 apply 即可，不需重派**——除非 apply 时发现交付有缺漏要 subagent 补。

### 第 2 轮：主 session 串行落地

1. §2 → enroll verify-third-party-notices（若 Decision 6a 定 enroll）→ §3（并行/先后）→ §4（grilling #2/#8 先）。
2. 每节 tsc/oxlint/vitest + commit。
3. 线 C translation zh（若做）→ 线 D quick。
4. 推 PR。
5. 每批重跑 `check:ci:static` + `comm` 比对。

### 第 3 轮：和用户过 4 项 grilling（HITL，subagent 不能替）

Decision 1（staleness 跑哪）/ 2（cadence 阈值 150 commits/14days）/ 5（先修 SEAM_MANIFEST seam-6）/ 8（impact report 落哪 `research/upstream-impact-<BASE>..<NEW>-<date>.md`，确认 `tickets/README.md` paired 不被误触 i18n）。**逐项带过来，不攒着**。#2/#8 影响落 §4；#5 影响 §5；#1 影响 cron。

## 六、本 session 不做

- **不 push、不开 PR**——除非用户明确指示推（本 session 决策推 PR 或留 review）。
- **不删分支/worktree**（归 UM11 Scope 4-6 + A23）。⚠ 5 个 `refactor/p2-*` 不可按 ancestry 判删。**不碰 evaluation worktree**（`.worktrees/r10-harness-goodhart`、`.worktrees/t1-exec-grader`）+ master 的 eval session（index.lock 警惕）。
- **不恢复 `ui-settings-models` 的 `slot-contract.ts`/`operations.ts`**——真特性 merge → [UM-UI-SETTINGS-MODELS-RE-PORT](../tickets/phase-upstream-merge/UM-UI-SETTINGS-MODELS-RE-PORT.md)。
- **不直接修 type-equiv/package-invariants 门**——各归专属票（UM-QODER-SUBAGENT-RETIRE/UM-INVARIANT-COMPANION-CLEANUP），作 known-red 进 PR。
- ~~**不跑 `gen-tsconfig-paths`**~~：已解（`10941436b5`），生成器安全可跑。
- **map.md 的 U+FFFD**：out of scope（parallel-dev-cleanup），别猜着改。

## 七、起手 checklist

1. Read 本 prompt + [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) 2026-09-15 update + [UM11](../tickets/phase-upstream-merge/UM11-pr-merge-post-cleanup.md) 2026-09-15 update + [UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 2026-09-15 update + 4 subagent 交付（`research/um15-slice-s{1,2,3,4}-2026-09-15.md`）。
2. **核两 tip + 两树状态**：resync `c579b809d2`（0 行）、master `483e98e952`（0 行）。⚠ **核 symlink**：`git -C /Users/mckenzie/workspace/dsh-resync ls-files -s | awk '$1=="120000"{print $4}'` + 逐个 `[ -L ]`。若坏：`git config core.symlinks true` + `git ls-files -s | awk '$1=="120000"{print $4}' > /tmp/links.txt` + `xargs rm -f < /tmp/links.txt && xargs git checkout -- < /tmp/links.txt` + `git status --short --untracked-files=no`（必空）。
3. 确认 `PATH="/usr/local/bin:$PATH"` → `node -v` = v24.15.0。
4. **（subagent 不需重派）** §2/§3/§4 交付在盘，主 session 直接 apply。若 apply 发现交付缺漏需 subagent 补，用「逐节派+增量写盘+probe 先验」。
5. 主 session 按 §8 顺序落 §2 → §3 → §4（grilling #2/#8 先）。每步单独 verify + commit。
6. **和用户过 4 项 grilling**（Decision 1/2/5/8）——HITL，逐项带过来。
7. 推 PR（B 类 2 绿+2 known-red，描述写明 ui-settings 回退 + known-red 理由）。
8. 目标：① UM15 首片全落（§2/§3/§4 + grilling）② PR 推进 ③ translation zh（若做，Qoder 退场前置）。

## 八、遗留项审计 + session 估算

**open 票 11 个**（+ 2 resolved-decision：UM-TSCONFIG-PATHS-POLICY / UM-GEN-DOC-TRANSLATION-OBLIGATION）：UM-ADAPT / UM-LINT-TYPEAWARE-CORDIS / UM-MERGE-INTEGRITY（近 done，knip/fake-api cleanup pending）/ UM11 / UM12 / UM15 / UM4 / UM6 / UM-UI-SETTINGS-MODELS-RE-PORT + **本 session 新 2**：UM-QODER-SUBAGENT-RETIRE / UM-INVARIANT-COMPANION-CLEANUP。

| 终点 | 估算 | 说明 |
|---|---|---|
| **PR merge（B 类 2 绿+2 known-red）** | ~3-5 session | 落 §2/§3/§4 ~1-2 + grilling ~1 + PR ~1-2。B 类已 2 绿（-2）。 |
| **UM 专项完美结束** | ~15-21 session | + UM15 durable method ~2-3（§2/§3/§4 落+grilling）+ ui-settings re-port ~2 + UM-ADAPT/UM4/UM-CORDIS subtask3/R-DA Round2 ~3-4 + UM-LINT/Typert sprint ~3-4 + QODER-RETIRE ~1-2 + INVARIANT-CLEANUP ~1 |
| **全门绿（含 fork 债）** | ~22-29 session | + i18n 98 / deps 74 / doc-standard / runtime-closure / constraints（Tier C，非 UM destination） |

**关键不确定**：§2 subagent 设计偏差（文本提取）待验；§4 git 层 1426 行未验证代码 apply 后 tsc/oxlint/vitest 必有问题要修；ui-settings re-port 规模未量化；documentation standard tests scope 未知；4 项 UM15 grilling 待人定。
