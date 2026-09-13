# UM-LINT-B-UNMATCHED-PROGRAMS — 56 个文件不被任何 tsconfig 认领，落进 tsgolint 的无配置 inferred program（type-aware 门静默漏检）

**Type**: grilling · **Status**: **resolved (eval-independent 全部落完)** —— 2026-09-14 落定 Bucket ii WAIVE 34 + Bucket iii KEEP 15 + durable 防线 + contract 断言（见 [2026-09-14 节](#2026-09-14-eval-independent-remainder-landed-bucket-iiiii-dispositions--durable-fence)）；Bucket i 的 eval-cli ×6 拆出 [UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS](UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS.md)，等 eval 团队确认 3 问 · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（本票剩余部分已全部落地；唯一未收口项已拆票，阻塞在 eval 团队确认，不在本票）
**Blocks**: GA-FORK-CI 总账里「`check:ci:lint:contracts-ready` 是否真的在检查它声称检查的文件」这一条 —— 2026-09-14 起由 `scripts/run-oxlint.ts` 的 program-coverage 防线机器回答，不再靠人复核
**Graduated from**: [UM-LINT-A-OXLINT-RESOLUTION](UM-LINT-A-OXLINT-RESOLUTION.md) Resolution（2026-09-11，诊断副产物；与 UM-LINT-A 的 Cordis Context 冲突**无关**，是独立缺陷）

## Question

`oxlint` 的 type-aware 后端 tsgolint 为**每个文件**独立发现 tsconfig（向上走目录只认 `tsconfig.json`/`jsconfig.json` → BFS 其 `references` → 祖先 solution 搜索）。任何一步都没认领的文件不会被跳过，而是被丢进 **`CreateInferredProjectProgram`**——一个硬编码的 option-less program（**无 `paths`、无 `types`、无 `strict`、`moduleResolution: bundler`）。

后果：这些文件**照样被 lint**，但类型全部解析自一个错误的 program。既可能假阳性（跨包 import 解不出 → `error` 类型 → `no-unsafe-*` 乱报），也可能**假阴性**——这更危险，因为门是绿的，看不出来它没在查。

**要决的是：这 56 个文件里哪些必须被真 program 认领、用哪种方式认领、以及要不要加一道 durable 防线阻止它再次发生。**

## 已测证据（勿重导）

复现命令（resync 树，read-only）：

```sh
export PATH="/usr/local/bin:$PATH"; cd /Users/mckenzie/workspace/dsh-resync
OXC_LOG=debug node node_modules/oxlint/bin/oxlint . 2>&1 | grep -a 'Unmatched file:'
```

实测（2026-09-11，tip `4d4f725748` + UM-LINT-A 的 `disableSourceOfProjectReferenceRedirect` 补丁）：

```
Done assigning files to programs. Total programs: 347. Unmatched files: 56
```

按「是否落在 `.oxlintrc.json` 的严格 type-aware override 内」分两类：

### A 类 — 落在严格 override 内（真·静默漏检，7 个）

```
packages/eval/eval-cli/tests/cli-llm-config.spec.ts
packages/eval/eval-cli/tests/compare.spec.ts
packages/eval/eval-cli/tests/harness-responder.spec.ts
packages/eval/eval-cli/tests/main.spec.ts
packages/eval/eval-cli/tests/report.spec.ts
packages/eval/eval-cli/tests/scope-id.spec.ts
packages/typert/generator/tests/fixtures/remote-model/typert-protocol.d.ts
```

**成因已定位到具体一行，两个都是「双向都没管」：**

1. **eval-cli ×6**：`tsconfig.host.json` 的 `include` 有 `"packages/*/*/tests/**/*.ts"`（所以全仓其它包的 tests 都由 `tsconfig.host.json` / `tsconfig.client.json` 兜住——已抽样验证，如 `ui-settings-models/tests/*.client.spec.ts` → `tsconfig.client.json`），**但它的 `exclude` 里有 `"packages/eval/eval-cli/**"`（整包排除）**；而 `packages/eval/eval-cli/tsconfig.json` 自己只 `include: ["src"]`。两头都不认 → `<none>`。
   实证：`Got tsconfig for file packages/eval/eval-cli/tests/main.spec.ts: <none>`
   ⚠ 全仓**没有任何**包把 `tests` 纳入自己的 `include`（抽查 200 个 tsconfig.json，全是 `include: ["src"]`），所以「包自己认领 tests」目前不是既有模式，改法要想清楚是不是要开这个先例。
2. **typert fixture ×1**：`.oxlintrc.json` 的 ignorePatterns 只 ignore 了 `packages/typert/generator/tests/fixtures/type-model/**`，而这个文件在 **`fixtures/remote-model/`**；`tsconfig.host.json` 的 exclude 是 `packages/typert/generator/tests/fixtures/**`（全排）。所以 tsconfig 排掉了它，oxlint 却仍要 lint 它。

### B 类 — 在严格 override 外（只吃默认规则，影响小，49 个）

按顶层目录分布：

```
 15  wayfinder/data-agent/...      （prototypes/ 等，本就不在 override 内）
 12  packages/eval/...             （retrieval-experiment/scripts、eval-cli/bin 等）
  7  apps/desktop/...              （多为 scripts/*.d.mts）
  4  packages/query/...
  2  prototypes/d2c-retrieve-baseline/...
  2  snapshots/acp/...
  2  snapshots/session/...
  1  eval-results/p11d-calibration/...
  1  packages/util/deque/benchmarks/drain.ts
  1  scripts/coverage-uncovered-locations.cjs
  1  snapshots/sdk/sdk.snapshot.ts
  1  vitest.shared.ts
```

## 候选解法（需拍板，非互斥）

**A 类 eval-cli ×6：**
- (a) 把 `"packages/eval/eval-cli/**"` 从 `tsconfig.host.json` 的 `exclude` 摘掉 —— 最小改动，但要先查清当初为什么整包排除（大概率有原因，别盲改）。
- (b) 给 eval-cli 加 `tsconfig.tests.json` 并从 root solution 的 `references` 引用 —— 仓库已有 `tsconfig.host.json`/`tsconfig.client.json` 的 per-package 双面模式（各 9 处），这是同一手法的延伸。
- (c) 把 `packages/eval/eval-cli/tests/**` 加进 `.oxlintrc.json` 的 ignorePatterns —— **诚实地承认不检查**，成本最低，但放弃这 6 个文件的 type-aware 覆盖。
- (d) 让 eval-cli 自己的 tsconfig `include: ["src","tests"]` —— 会开「包自己认领 tests」的先例，需评估对 `outDir`/`rootDir`/composite 的连带影响。

**A 类 typert fixture ×1：** 把 ignorePatterns 从 `fixtures/type-model/**` 放宽到 `fixtures/**`，与 `tsconfig.host.json` 的 exclude 对齐（两边现在不一致，这本身就是 bug）。

**B 类 49 个：** 先决定**要不要管**。它们只吃默认规则（correctness 已 `off`），漏检面小；但 `vitest.shared.ts` / `snapshots/**` / `benchmarks/**` 是否该被 lint 本身也是个 scope 问题。

**Durable 防线（本票最有价值的产出）：** 加一道 gate 断言「`OXC_LOG=debug` 报的 unmatched 列表里，不得出现落在严格 type-aware override 内的文件」。没有这道防线，A 类会无声无息地重新长出来——它已经长出来一次了，而且门一直是绿的。

## ⚠ 执行注意

- `packages/eval/eval-cli` 是 **eval 机器本身**的一部分，而 master 树上 eval **永续运行**。改它的 tsconfig / 源码要与 eval 协调，不能想改就改。诊断（read-only 复现）在 resync 树完全安全。
- 本票**不是** UM-LINT-A 的遗留：UM-LINT-A 的 81 条冲突级联已由 `disableSourceOfProjectReferenceRedirect` 根治，与本票的 program 认领问题机制不同、互不影响。
- 归属存疑：本票是 lint 门的覆盖率问题，严格说更像 repo-infra 而非 upstream-merge。放在本 map 是因为 UM-LINT-A 与 UM12 的门都在这里。若要迁到 [`wayfinder/repo-infra/map.md`](../../../repo-infra/map.md) 也合理（那边的 T6/T10/T11 已是同类门/CI 票），但 repo-infra 的 Destination 写的是 worktree-build + theme token，未覆盖 lint program 覆盖率。

### [2026-09-13] Alignment with UM-C-GATES synthesis (Cluster D)

[UM-C-GATES](UM-C-GATES-UPSTREAM-NEW.md) 的 Cluster D grilling 建立了 **slice-first-decide 框架**（先按违规类型分桶数据，再判 fix/waive/known-red），并落 `verify-package-dependencies` 的 87% 同类 pattern → WAIVE (架构 pattern 豁免) 决策为典型样本。本票的 **56 unmatched programs** 是同类问题（upstream 新规则，fork tsconfig 归属 glob 未覆盖），适用同一框架：

**下一步 slice 分析（本票独立 session）**：
- Bucket (i): fork 包缺 tsconfig owner → **FIX** by adding tsconfig（估算：eval-cli 的 6 个 + typert fixture 的 1 个属 A 类；upstream-side glob-owned 的属这一 bucket 可修）
- Bucket (ii): fork 包故意在 tsconfig 图之外（如 test-support scaffolds / benchmarks / snapshots）→ **WAIVE** with per-glob rationale
- Bucket (iii): B 类 49 个（默认规则 only，漏检面小）→ 单独裁决保留 vs 展开 type-aware 覆盖

**§2 gate-coverage meta-gate**（[UM15](UM15-durable-upstream-sync-method.md) `2eb5b4a850` 已实现）承载：slice 结果落定后，本票的 3 buckets 各自 → §2 manifest（FIX-tracked / WAIVE / KNOWN-RED）。

**Durable 防线**（本票原提议）：加一道 gate 断言「`OXC_LOG=debug` 报的 unmatched 列表里，不得出现落在严格 type-aware override 内的文件」——这道防线在 slice 落定后作为 §2 manifest 之外的**回归防止层**，防止 A 类无声无息重新长出来。

---

## [2026-09-13] Phase-1 research → Phase-6 decision-doc (HYBRID resolution; eval-independent slice LANDED, remainder DEFERRED)

Source: `wayfinder/data-agent/research/next-session-2026-09-14/lint-b.json` (high-confidence read-only research). unmatchedTotal VERIFIED at exactly 56 (plan exact; reproduced via `OXC_LOG=debug oxlint . | grep -c 'Unmatched file:'`). Stable across ~40 commits of drift and orthogonal to UM-LINT-A (the `disableSourceOfProjectReferenceRedirect` fix is now landed in `tsconfig.base.client.json:13`, yet count is still 56).

### LANDED this session (commit `5d0005b9f7`, eval-independent slice)

- **Bucket (i) typert fixture ×1 — FIX**: widened `.oxlintrc.json` ignorePatterns `packages/typert/generator/tests/fixtures/type-model/**` → `packages/typert/generator/tests/fixtures/**`, aligning oxlintrc with `tsconfig.host.json:129` (which already excludes the whole `fixtures/**` tree). This fixes the tsconfig/oxlintrc disagreement that left `packages/typert/generator/tests/fixtures/remote-model/typert-protocol.d.ts` unmatched. Updated `scripts/oxlint-contract.spec.ts:168` to match the new literal. All 13 oxlint-contract tests pass. Unmatched count: 56 → 55.

### DEFERRED — Bucket (i) eval-cli ×6 (gated on eval-team coordination)

`packages/eval/eval-cli` is the perpetually-running eval machine; changing its tsconfig/build shape must be coordinated with the eval team BEFORE apply (cannot self-serve). The 6 unmatched test files: `tests/main.spec.ts`, `tests/compare.spec.ts`, `tests/cli-llm-config.spec.ts`, `tests/harness-responder.spec.ts`, `tests/report.spec.ts`, `tests/scope-id.spec.ts`.

**Root cause (two-sided non-ownership)**: `tsconfig.host.json:109` includes `packages/*/*/tests/**/*.ts` (so other pkgs' tests resolve — sanity-checked llm/llm/tests → host, ui-conversation tests → client) BUT `tsconfig.host.json:131` excludes the whole package `packages/eval/eval-cli/**`, while `packages/eval/eval-cli/tsconfig.json` only `include: ["src"]`. Neither side owns tests → `<none>`.

**Recommended apply (sub-option b)**: add `packages/eval/eval-cli/tsconfig.tests.json` referenced from the root solution — CLEANEST, follows the EXISTING per-package two-face pattern (VERIFIED 9 `tsconfig.host.json` + 9 `tsconfig.client.json` in packages/), no new precedent, gives real type-aware coverage on the 6 silently-unchecked spec files. Sub-option (a) drop the package from `tsconfig.host.json:131` exclude is minimal-diff but risky (must first learn WHY the whole package was excluded — likely deliberate, tied to eval machine build). Sub-option (c) add to `.oxlintrc` ignorePatterns honestly stops checking but forfeits type-aware on 6 files. Sub-option (d) `tsconfig.json include:["src","tests"]` opens 'package owns its own tests' precedent (VERIFIED: no package currently does this).

**Coordination ask**: coordinate at the START of any A-class eval-cli apply session (before touching tsconfig), NOT during. The typert-fixture fix (landed), the durable gate (below), and ALL Bucket ii/iii dispositions are eval-independent and proceeded without coordination.

### DEFERRED — Bucket (ii) 34 WAIVE (intentional out-of-graph scaffolds)

Fork code that lives INTENTIONALLY outside the repo tsconfig graph AND outside the strict override glob: prototype/research scaffolds, benchmarks, snapshots, throwaway dev/bin harness scripts, .d.mts build-config declarations. Only default rules apply (correctness `off` in `.oxlintrc`), so leak surface is genuinely small. Correct disposition is a per-glob WAIVE with rationale in the gate-coverage/upstream-sync waiver layer, NOT adding tsconfigs (would open the 'prototypes are compiled' precedent).

Breakdown (34 files) — **corrected 2026-09-14**, the original line below enumerated 40 files' worth of categories because it attributed `snapshots/**` (5) and `eval-results/p11d-calibration` (1) to bucket ii; the 34/15 counts only add up with those two in bucket iii, and the reproduced 55-file list confirms that attribution: `wayfinder/data-agent/prototypes` 12, `packages/eval/retrieval-experiment/scripts` 9, `wayfinder/data-agent/research` 3, `eval-cli bin+dev` 3, `query-maxcompute dev` 3 (incl 1 `.d.mts`), `prototypes/d2c-retrieve-baseline` 2, `query-tool/dev` 1, `util/deque/benchmarks` 1. (`.d.mts` and `.cjs` files here aren't matched by the override's `*.{ts,tsx}` globs anyway.)

### DEFERRED — Bucket (iii) 15 KEEP-as-default-only (support/build tooling)

The remainder of the B-class 49 that are NOT clearly throwaway: `apps/desktop` build/release harness (7, all `.d.mts` + scripts), repo-root shared harness (`vitest.shared.ts`), coverage tooling (`scripts/coverage-uncovered-locations.cjs`), and misc snapshot/support `.ts`. Only eat default rules today (correctness off). Verdict: KEEP as default-only (do not expand type-aware coverage) — near-zero real-bug ROI, and pulling them into a program would drag build-config `.d.mts` and scaffolds into strict programs. Note `.d.mts` (8) and `.cjs` (1) are structurally outside the override's `*.{ts,tsx}` globs regardless. NOTE: buckets (ii)+(iii) together = the 49 B-class files; the split is a judgment line (intentional-scaffold vs support-tooling), both dispositions are non-FIX.

### DEFERRED — Durable regression gate (highest-value output of this ticket)

A-class already grew silently once (56 unmatched). Install a durable gate asserting: **'no file matching the strict type-aware override globs may appear in the OXC_LOG unmatched list.'** Implementation home is READY in the main tree: `scripts/verify-gate-coverage.ts` + `scripts/gate-coverage.manifest.json` + `scripts/verify-gate-coverage.spec.ts` already exist (UM15 §2 meta-gate landed via `2eb5b4a850`).

Two viable wirings (pick in a follow-up):
1. **RECOMMENDED**: extend `scripts/run-oxlint.ts` (98 lines, already spawnSync's the oxlint CLI) to run one `OXC_LOG=debug` pass, parse `Unmatched file:` lines, and fail if any intersects the strict-override globs — folded into the single existing oxlint invocation + enrolled in the gate-coverage manifest so the meta-gate tracks it.
2. Alternative: add a dedicated `verify-oxlint-program-coverage` gate enrolled alongside `verify-gate-coverage`.

After Bucket (i) FIX lands (both the typert fixture, DONE, and the eval-cli ×6, DEFERRED), the assertion is GREEN and stays green. The honest interim protection is Cluster D's manifest coverage combined with this ticket's documented buckets.

### Verification (landed slice)

- `pnpm exec vitest run scripts/oxlint-contract.spec.ts` → 13/13 pass
- `OXC_LOG=debug oxlint . | grep 'Unmatched files:'` → 55 (was 56; drop is exactly the one typert fixture now ignored)

---

## [2026-09-14] eval-independent remainder LANDED (Bucket ii/iii dispositions + durable fence)

Source: `wayfinder/data-agent/research/next-session-2026-09-18/lint-b.json`. 用户拍板：**eval-independent 余量全部落地，Bucket i 按住拆票**。

### 复现与算术（自证，未沿用上一节数字）

```sh
export PATH="/usr/local/bin:$PATH"; cd /Users/mckenzie/workspace/deepseek-harness-da
OXC_LOG=debug node node_modules/oxlint/bin/oxlint . 2>/tmp/log
grep -ac 'Unmatched file:' /tmp/log          # -> 55
grep -a 'Unmatched files:' /tmp/log | tail -1
# 2026/09/14 03:47:10 Done assigning files to programs. Total programs: 344. Unmatched files: 55
```

在 `2886e5b8e5` 上 **55** 与上一节一致。分桶算术**逐文件核过**（不是抄的）：**34 (ii) + 15 (iii) + 6 (i) = 55，精确**。前提是 `snapshots/**` (5) 与 `eval-results/p11d-calibration` (1) 记在 **iii**；这也是上面 Bucket (ii) 那行 breakdown 已订正的点（原文枚举了 40 个文件的类别，与它自己的「34 files」标题矛盾）。

**严格 override 交集（防线绿不绿的命门）**：55 个里**只有** eval-cli 的 6 个 spec 落在 `.oxlintrc.json` `overrides[0].files` 内，与 recon 一致，没有第 7 个。除逐 glob 机器比对外，另用探针**实测了 oxlint 的 override glob 语义**（这是判断的前提，不能只靠读文档）：写一个 `export var probeValue = 1` 到 6 个位置，只有 `scripts/` 下的那个报 `no-var`：

| 探针位置 | `no-var` 是否触发 | 结论 |
|---|---|---|
| `scripts/` | ✅ 触发 | `scripts/**` 命中 |
| `packages/eval/eval-cli/tests/` | ✅ 触发 | `packages/*/*/tests/**` 命中 |
| `packages/eval/retrieval-experiment/scripts/` | ❌ 不触发 | **override glob 锚定在配置文件目录**，嵌套 `scripts/` 不算 |
| `packages/eval/eval-cli/bin/` | ❌ 不触发 | bin/ 不在 override |
| `wayfinder/data-agent/prototypes/*/src/` | ❌ 不触发 | `packages/` 前缀是字面量 |
| `snapshots/`、`packages/util/deque/benchmarks/` | ❌ 不触发 | 顶层目录不在 override |

第 3 行是关键：如果 oxlint 是「路径里任意位置匹配」，`retrieval-experiment/scripts` 的 9 个文件就会变成 9 个新的 A 类违规，防线落地即红。实测证明它不是。防线的 `strictOverrideGlobToRegex` 因此两端锚定 `^…$`，与实测语义一致。

### 落地内容（逐文件）

- **`scripts/run-oxlint.ts`** —— 防线本体，折进既有 oxlint 调用（decision-doc 的 option 1，不新起 gate 进程）：
  - `STRICT_OVERRIDE_GLOBS`（导出）：`.oxlintrc.json` `overrides[0].files` 的 7 条 glob 副本。
  - `EVAL_CLI_PENDING_FIX`（导出）：eval-cli 6 个 spec 的 **KNOWN-RED allowlist**。有它，防线**现在就绿**；没它，防线落地即红且不可落。
  - `UNMATCHED_DISPOSITIONS`（导出）：**Bucket ii 8 条 WAIVE + Bucket iii 5 条 KEEP 的 per-glob 裁决 + 逐条 rationale**，即本票要求的 waiver 层。每条带一个 `sample`（取自复现清单的真实路径），由 contract test 断言**不落在严格 override 内** —— 这条断言才是裁决的依据：这些文件不是「漏检」，是「严格规则从未管过它们」。
  - `strictOverrideGlobToRegex` / `matchesStrictOverrideGlob`：手写 matcher（`minimatch`/`picomatch` 在本 pnpm-strict 工作区都不可直接 resolve），只认 `*`、descendant wildcard、`{ts,tsx}` 三种形态；遇到更复杂的 glob **抛错而不是静默少匹配**。
  - `assertNoStrictOverrideUnmatched`：CI-only、**lint 绿之后**再跑一趟 `OXC_LOG=debug`（stderr 走临时文件，debug 流约 1.8 MB，不能塞管道），解析 `Unmatched file:`，减掉 allowlist 后若与严格 override 有交集则 `exitCode = 1`。
- **`scripts/oxlint-contract.spec.ts`** —— 新增 3 个断言（13 → 16 tests，全绿）：把 `STRICT_OVERRIDE_GLOBS` 钉到 `.oxlintrc.json` `overrides[0].files`（**含 index 0 是严格 override 本身的交叉校验**，防止有人在前面插一个 override 把防线悄悄缩成空集）；matcher 的正反例单测（含上表第 3 行那个嵌套 `scripts/` 反例）；13 条裁决的 sample 全部落在严格 override 之外 + 34/15/6 计数。
- **`scripts/run-gates.ts`** —— `lintGate()` 上方加注释，说明这道门同时承载 program-coverage 防线，以及为什么它不是独立的 `verify-*` 脚本。**无功能改动。**
- **`.oxlintrc.json`** —— **未改**。`overrides[0].files` 就是防线要钉住的现状，改它才会让防线失真。

### enrollment：为什么 manifest 不加条目

防线随 `lint:contracts-ready`（= `tsx scripts/run-oxlint.ts .`）走，而该脚本已由 `lintGate()`（`scripts/run-gates.ts:587`）在 `ci-lint-contracts-ready`（:241）与 `ci-primary`（:330）两个 mode 里 enrolled。`verify-gate-coverage` 只审 `verify-*` / `gen-*` **package script 名**（`GATE_SCRIPT_PATTERN`），`lint:contracts-ready` 本就不在它的辖区 —— 所以**不需要**加 manifest 条目；更要紧的是**不能**加：manifest 的 Check 2 要求每条 exemption 指向一个真实存在的 `verify-*`/`gen-*` script，硬塞一条会把 meta-gate 弄红。实测 `verify-gate-coverage` 绿。

### 防线实证（绿过、也咬过）

只断言「它是绿的」不算验证。**注入一个真实的第 7 个违规**（`packages/eval/eval-cli/tests/um-lint-b-fence-probe.spec.ts`，正是无人认领的那个目录）后：

```
=== CI=true ===
Found 0 warnings and 0 errors.                 <- lint 自己说绿，这正是危险的那一格
run-oxlint: 1 file(s) match .oxlintrc.json overrides[0].files, so the full type-aware rule set ran
over them, but no TypeScript program claims them — tsgolint resolved their types through an
option-less inferred program, so the type-aware half of this gate reported green without checking them:
  packages/eval/eval-cli/tests/um-lint-b-fence-probe.spec.ts
EXIT=1

=== CI 未设置 ===
Found 0 warnings and 0 errors.
EXIT=0                                         <- 本地跑不付这趟 debug pass 的钱
```

删掉探针后 `EXIT=0`。另外在 lint 红的全仓跑上，防线正确**跳过**（36.7s ≈ 单趟 33.9s，没有第二趟），不会掩盖真实 diagnostics。

### openQuestions 逐条收口

| # | 结论 |
|---|---|
| 1 | `snapshots` + `eval-results` 记 **iii（KEEP-as-default-only）**，已按此落 `UNMATCHED_DISPOSITIONS` 并订正上面的 breakdown 行 |
| 2 | 手写 matcher 已有正反例单测（`packages/eval/eval-cli/tests/main.spec.ts` → 命中；`…/bin/compare.ts`、嵌套 `scripts/` → 不命中）；glob 变复杂时 matcher 抛错 |
| 3 | **带 allowlist 现在落**（用户已拍板）。防线现绿，第 7 个立刻红；allowlist 随拆出的票删除 |
| 4 | eval-cli tsconfig 形状 → 拆出的 [UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS](UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS.md)，3 问逐字承接 |
| 5 | 两趟方案已落（CI-only + 仅 lint 绿时）。实测本仓单趟 33.9s / 全绿时约翻倍 |
| 6 | **答案是「不绿」**：master 上 `lint:contracts-ready` 现有 **725 errors**（全在 client/api 包），根因是 `typecheck:contracts-ready`（`tsc -b tsconfig.client.json`）自带 16 条 TS 报错、client declaration 没能 emit，`no-unsafe-*` 因此级联；`build:lib:host` 的 tsdown 步也因根 `lib/` 缺失而失败。**这意味着防线在 lint 转绿之前是 inert 的** —— 它不是被这次改动弄坏的，是本来就红。要让防线真正在 CI 上生效，得先有人把 lint 弄绿（不属本票）。 |
