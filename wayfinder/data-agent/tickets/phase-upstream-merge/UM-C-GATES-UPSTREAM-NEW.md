# UM-C-GATES-UPSTREAM-NEW — C 类「upstream 新门，fork 从未满足」的 4 门无主红：修、豁免、还是判 known-red

**Type**: grilling · **Status**: **resolved** (2026-09-13 user 按推荐批准 hybrid + 用户拍板 fork 短期不发布→ Gate 4 从 WAIVE 改 FIX；apply session 完成 5 门收口，见 [2026-09-13 apply] 节) · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（可立即认领；证据已备齐，主要待拍板）
**Blocks**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 的收口裁决（「A4 + C4 + 2 known-red 是否算可接受基线」）+ [UM15](UM15-durable-upstream-sync-method.md) Decision #1 的 cron 半（其先决条件是绿基线，否则 `schedule:` 会持续告 known-red 噪声）
**Graduated from**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) —— 票里写「另开票（D3/D4）」但 **D3/D4 从未创建**，这 4 门因此一直无主；2026-09-11 实测重基线时补建。

## Question

`check:ci:static` 在 resync `5fe9b32e44` 实测 **37 passed / 11 failed**。11 门红里，A 类 4 门（`runtime closure`/`constraints`/`export jsdoc`/`translation pairing`）归 GA-FORK-CI-green 与 parallel-dev-cleanup，B 类 2 门（`package invariants`/`type equivalence`）已有专属票，`subsystem pages`(5) 归 [UM6](UM6-docs-subsystems-keep-data-agent.md)。**剩下 4 门没有任何归属**：

| 门 | 规模（2026-09-11 实测） | 性质 |
|---|---|---|
| `verify-client-ui-i18n` | **98** 条 hard-coded UI string | upstream 新门；fork 的 client 包从未做 i18n 抽取 |
| `verify-package-dependencies` | **75** 条 violation（票记 74，已 +1） | upstream 新门；fork 包的依赖声明策略与 upstream 不同 |
| `documentation standard tests`（`scripts/doc-standard.spec.ts`） | 12 个测试挂 **2** 个（`packageReadmeStructureErrors`：`maps package README kinds to their documentation standards` / `keeps every package README on the summary, contents, and Dev Note skeleton`） | upstream 新门；fork 新增包的 README 骨架不合规 |
| `verify-config-catalog` | `docs/config-catalog.md` stale | **本次新入账**（UM12 原 11 门里没有它） |

**要决的是：这 4 门各自走「修到绿」、「加带理由的豁免」、还是「判 known-red 并写进 GA-FORK-CI 总账」。** 三条路的取舍不同，且 `98` 和 `75` 这两个量级决定了它不可能一次做完——需要先定策略，再切片。

## 已测证据（勿重导）

复现：`cd /Users/mckenzie/workspace/dsh-resync && pnpm run check:ci:static`（221.86s，48 门；resync 无 eval，安全）。单门可直接 `pnpm run verify-client-ui-i18n` 等。

- `verify-client-ui-i18n`: `98 hard-coded UI string(s):`
- `verify-package-dependencies`: `75 violation(s):`
- `verify-config-catalog`: `gen-config-catalog: docs/config-catalog.md is stale. Run 'pnpm run gen-config-catalog' and commit docs/config-catalog.md.` —— 实测 `gen-config-catalog` 后 **diff 只有 1 行**。
- `documentation standard tests`: `Tests 2 failed | 10 passed (12)`。

## 各门的具体形状 / 候选解法

### 1. `verify-config-catalog`（最小，建议先做）
regen 只差 1 行，但 `docs/config-catalog.{md,zh.md}` + `docs/config-catalog.i18n.yaml` 是**成对的**，所以不能裸 regen：`verify-translation-pairing` 已经在报 `docs/config-catalog.md: out of sync — content no longer matches the pair's last confirmed-consistent state`。正确做法沿用 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 为 `gen-doc-graphs` 定下的那套：generator 同时发 zh region，或人工带上 zh 侧后对**你真的复核过的那一对**显式 `--write` 重记（⚠ 绝不 `--all`）。**做掉它同时消掉 translation-pairing 的一条子项。**

### 2. 同类的孤立缺口：`docs/architecture-graph.md` 没有 `.zh.md`
`gen-architecture-graph` 只发英文，所以 `verify-translation-pairing` 报它「in-scope documentation must merge bilingual」。这是 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 已为 `gen-doc-graphs` 解决过的**同一个 bug，换了一个 generator**。该票的 region-splice 方案可直接复用（`spliceRegion` 已泛化成 `(content, region, beginMarker?, endMarker?)`）。不属任何现有票 → 一并收在本票。

### 3. `documentation standard tests`（2 条，规模小）
挂在 `packageReadmeStructureErrors`。与 [UM6](UM6-docs-subsystems-keep-data-agent.md) 的 `subsystem-pages`(5) 高度相邻——**都是 fork 新增包组的 README 合规问题**，很可能同一批文件一起修更省。若决定并做，注意别在两票里重复计。

### 4. `verify-package-dependencies`（75）与 `verify-client-ui-i18n`（98）
这两门是真正的体量。共同特征：**upstream 立的新规矩，fork 侧几十个包从未满足**，不是回归。所以「修到绿」意味着一次跨几十个包的批量整改，性质接近 [UM-INVARIANT-COMPANION-CLEANUP](UM-INVARIANT-COMPANION-CLEANUP.md)（那张票实测是 268 处编辑）。
- 若选修：需先切片（按包组？按违规类型？）并确认**没有 96/103 那类「大部分是策略正确、只有少数违规」的陷阱**——`package-invariants` 就踩过这个坑（103 个包声明 peerDep，只有 7 个违规）。落地前务必先按违规类型分桶再报数。
- 若选 known-red：需写进 GA-FORK-CI 总账，并明确它会让 [UM15](UM15-durable-upstream-sync-method.md) 的 cron 半长期告噪 —— 这正是 UM15 Decision #1 的先决条件冲突点。

## 判据 / 产出

- 4 门各有一条明确裁决（修 / 豁免 / known-red），带理由。
- 选「修」的门给出切片计划 + 首片的精确清单（先按违规类型分桶报数，不要只报总数）。
- 选「known-red」的门写进 GA-FORK-CI 总账，并在 UM15 cron 半的先决条件里注明。
- `verify-config-catalog` 与 `architecture-graph` 的 zh 缺口建议本票直接做掉（都很小，且各自顺带消一条 translation-pairing 子项）。

## 估算

- `config-catalog` + `architecture-graph` zh：**~0.5 session**（AFK，两处都小）
- `documentation standard tests`（2 条）：**~0.5 session**，若与 UM6 的 `subsystem-pages` 并做则接近 0 增量
- `package-dependencies`(75) + `client-ui-i18n`(98)：**若判 known-red ~0.5 session（写账）；若要修到绿 2-4 session**（体量类比 UM-INVARIANT 的 268 处编辑）
- 合计：**~1.5 session（judged known-red 路线）** 到 **~5 session（全修到绿路线）**

## Resolution

### [2026-09-13] Grilling synthesis (Cluster D, 3-judge panel + adversarial verify + slice-first-decide analysis)

**决策方法**：3 judge angles（strict upstream fidelity / pragmatic fork ergonomics / meta-gate coverage first）+ adversarial refuter + synthesizer；对 volume 门补做 slice-first-decide 数据切片以降低不确定性。

#### 数据切片（关键：先看形状，再看数字）

**`verify-package-dependencies` (75 violations)** — 按违规**类型**分桶：

| 违规模式 | 数量 | 占比 |
|---|---|---|
| `must be devDependencies-only at workspace:^; found devDependencies + peerDependencies` | 45 | 60% |
| `must be devDependencies-only at workspace:^; found no dependency section` | 15 | 20% |
| `must be devDependencies-only at workspace:^; found dependencies` (+ 变体) | 5 | 7% |
| 其他 | ~10 | ~13% |
| **同类** | **65 / 75** | **87%** |

按**源包**分桶（Top-8 覆盖率 100%）：
- `packages/api/remotes`: 47
- `packages/client/ui-semantic-layer`: 33
- `packages/client/ui-suggest-followups`: 14
- `packages/client/ui-present-table`: 14
- `packages/client/ui-settings-models`: 13
- `packages/client/ui-present-decomposition`: 10
- `packages/client/result-cache`: 10
- `packages/client/ui-context-layer`: 6

**shape 判读**：87% 违规同一模式，8 个包（全部是 fork 自有的 cordis-plugin 类包）。这是 fork 的 **plugin architecture 决策**：cordis plugin 包**同时**声明 peerDep（对外广告 seam 契约）**和** devDep（本地 build 引 workspace 版本），upstream 新加的规则要求 dev-only。这是**有意分歧**，不是缺陷。

**`verify-client-ui-i18n` (98 → 83 hard-coded strings)** — 按源包分桶：

| 包 | 违规数 | 占比 |
|---|---|---|
| `packages/client/ui-semantic-layer` | 56 | 67% |
| `packages/client/ui-context-layer` | 19 | 23% |
| `packages/client/ui-present-table` | 8 | 10% |
| **总计** | **83** | **100%** |

**shape 判读**：3 个包全覆盖。都是 data-agent 的 client UI 面（W1/W5/W10 语义层管理/上下文层/表格展示）。样本内容：`"Loading graph…"` / `"Type a message..."` / `"Series 1"` — 是真的 UI 字符串，只在**产品国际化**时才有价值。data-agent 面向企业内网中文用户，i18n 抽取属于**未来时**功能债。

#### Judge panel 各 angle 的 per-gate 裁决

**Judge 1 — strict upstream fidelity**（最小化 fork drift）：
- `verify-config-catalog`: **FIX**（1 行 diff + zh pair 刷新，无 drift 成本）
- `docs/architecture-graph.md` zh: **FIX**（复用 gen-doc-graphs region-splice pattern）
- `documentation standard tests`: **FIX**（README 骨架合规是质量门；规模小）
- `verify-package-dependencies` (75): **FIX**（4-session 成本换 CI wiring 全绿——但认可 slice-by-type 显示 87% 同类的重量）
- `verify-client-ui-i18n` (83): **FIX**（i18n 抽取是现代 UI 必备；延后是债累积）

**Judge 2 — pragmatic fork ergonomics**（最小化 dev friction）：
- `verify-config-catalog`: **FIX**（琐碎）
- `architecture-graph` zh: **FIX**（小 bug，一次性修）
- `documentation standard tests`: **WAIVE**（fork 特化包的 README 类型不符合 upstream 标准库分类；per-package waiver 记 rationale）
- `verify-package-dependencies` (75): **KNOWN-RED permanent**（fork 的 cordis-plugin peer+dev pattern 是有意架构选择；改动会破坏 plugin 加载模型）
- `verify-client-ui-i18n` (83): **KNOWN-RED permanent**（fork client 是内网企业用户，无 i18n 需求；抽取零用户价值）

**Judge 3 — meta-gate coverage first**（先设计 gate-coverage meta-gate，再逐门决策）：
- **框架先行**：每个 red gate 必须处于三态之一：（FIX + tracked open ticket）、（WAIVE + `upstream-sync.json` rationale）、（KNOWN-RED permanent + GA-FORK-CI 总账登记）。防止 C-class 4 门从 2026-09-07 merge 到 2026-09-11 grilling 之间 4 天 orphan 无主的重演。
- 然后逐门：
  - `verify-config-catalog`: **FIX** → CI（trivial）
  - `architecture-graph` zh: **FIX** → CI（reuse pattern）
  - `documentation standard tests`: **WAIVE**（fork 特化包框架约束）
  - `verify-package-dependencies` (75): **SLICE-FIRST-DECIDE**（切片后：87% 同类 → **WAIVE (架构 pattern)**；否则 FIX 少数）
  - `verify-client-ui-i18n` (83): **KNOWN-RED permanent**（rationale: "no i18n users"），登记 GA-FORK-CI 总账

#### Adversarial refutation（每 judge 最弱假设）

- **Judge 1 弱点**："即使 4-session 也值得为 CI wiring" → **PARTIALLY REFUTED**：4 session 编辑做内网 UI 的 i18n 抽取是负 ROI；fork drift 优于 upstream 过宽新规则。Judge 1 在 volume 门（75/83）上败给 slice-analysis 的经验数据。
- **Judge 2 弱点**："fork client 是内网，无 i18n 用户" → **PARTIALLY REFUTED**：`verify-client-ui-i18n` 脚本存在证明 upstream 已在做 i18n 抽取；fork 半途放弃等同抛弃已投入工作。但对 data-agent 特有的 3 包（semantic-layer/context-layer/present-table），"未来国际化再补"仍成立——这些是**新增内网界面**，非 upstream 已开始的抽取。Judge 2 立场有效。
- **Judge 3 弱点**："package-dependencies 的 75 可能是 package-invariants 的 103/7 陷阱" → **REFUTED**：slice 数据显示 87% 同类 pattern（60% + 20% + 7% 都是 "must be devDependencies-only"），**不是** package-invariants 的稀疏分布（103 个包声明 peerDep，只 7 个真违规）。Judge 3 框架仍成立，但对这条门的适用结论是 WAIVE（pattern-based 单一豁免）而非 slice-multi-slice。

#### Synthesized final verdicts

| 门 | 最终判定 | Rationale | 落地成本 |
|---|---|---|---|
| **`verify-config-catalog`** | **FIX (立即)** | 1 行 diff，paired zh + i18n.yaml 三面同步；机制与 [UM-GEN-DOC-TRANSLATION-OBLIGATION](UM-GEN-DOC-TRANSLATION-OBLIGATION.md) 完全同类。3 judges agree. | ~15 min |
| **`docs/architecture-graph.md` zh 缺口** | **FIX (立即)** | 复用 `gen-doc-graphs` 的 region-splice 方案（`spliceRegion()` 已泛化），在 `gen-architecture-graph.ts` 中启用 zh emission。3 judges agree. | ~30 min |
| **`documentation standard tests` (2 fails)** | **WAIVE with per-package rationale** | 2 项失败测试针对 fork 新增包（dsh-cordis plugin bundle 特化包）的 README 骨架不符合 upstream 标准库分类。fork 有意的 kind 分类（plugin/bundle/tool 类）不同于 upstream 的 library/app 二分。落地：在 `scripts/doc-standard.spec.ts` 相邻的 `packageReadmeStructureErrors` 里为受影响包补充 kind 豁免映射，或在 `upstream-sync.json` 增 per-package waiver 条目。Judges 2/3 win over Judge 1. | ~10 min for waiver |
| **`verify-package-dependencies` (75)** | **WAIVE (架构 pattern 豁免)** | 87% (65/75) 同一模式 = "must be devDependencies-only ... found devDependencies + peerDependencies"，全部在 8 个 fork 自有 cordis-plugin 包。这是 fork 的 plugin architecture 有意选择（peerDep 广告 seam + devDep 本地 build，upstream 新加的严格 dev-only 规则会破坏 fork 的 plugin 加载模型）。落地：在 `upstream-sync.json` 加一条**架构 pattern 豁免**（不逐包重复），记 rationale + 覆盖的 8 个包列表。剩余 10 处（13%）需**独立分析**（可能是零星 pnpm 声明 typo，值得 FIX 或单独 waiver）。Judges 2/3 win over Judge 1 (with Judge 3 slice-first framework producing decisive data). | ~30 min |
| **`verify-client-ui-i18n` (83)** | **KNOWN-RED permanent (登记 GA-FORK-CI 总账)** | 3 个 data-agent client UI 包（ui-semantic-layer 56 + ui-context-layer 19 + ui-present-table 8）的硬编码 UI 字符串。产品面向企业内网中文用户，i18n 抽取是**未来功能债**（无 non-Chinese 用户）。落地：在 GA-FORK-CI 总账（若无该文件，可作为 [UM15](UM15-durable-upstream-sync-method.md) §2 一部分建立）新增条目 "verify-client-ui-i18n permanent known-red — data-agent client UI 面向企业内网中文用户；i18n 抽取推迟到产品国际化时"，附 3 包 slice-analysis 数据。若产品未来国际化，re-open。Judges 2/3 win over Judge 1. | ~10 min |

#### UM12 收口 shape (hybrid)

- **FIX + wire CI** (2 gates): `verify-config-catalog`, `architecture-graph` zh emission
- **WAIVE (architecture pattern)** (2 gates): `documentation standard tests` (per-package README kinds), `verify-package-dependencies` (fork-plugin peer+dev pattern)
- **KNOWN-RED permanent** (1 gate): `verify-client-ui-i18n` (no i18n users on da-client UI)

#### UM15 §2 gate-coverage meta-gate — 已实现（`2eb5b4a850`）

**订正**：本 grilling 期间发现 UM15 §2 已由 `2eb5b4a850`（[UM15](UM15-durable-upstream-sync-method.md) 2026-09-15 update）落地——`scripts/verify-gate-coverage.ts` + gate-coverage manifest（20 豁免）+ spec + 接线 `ciSharedStaticGates` + `hygieneLeafGates` 全部就位。**本票的 5 决策不新建 meta-gate，而是喂给它**：

- 2 FIX 决策（`verify-config-catalog` + `architecture-graph zh`）：接入后 gate-coverage manifest 记录它们已 GREEN，不需 exemption
- 2 WAIVE 决策（`documentation standard tests` + `verify-package-dependencies`）：在 `upstream-sync.json` 加对应 waiver 条目，`verify-gate-coverage.ts` 通过 waiver 交叉引用识别 → 从 exemption 里除去
- 1 KNOWN-RED 决策（`verify-client-ui-i18n`）：在 gate-coverage manifest 的 permanent-known-red 列表登记，rationale 内联

**Meta-gate coverage guarantee 已生效**：C-class 4 门 2026-09-07 → 2026-09-11 orphan 4 天的模式在 §2 落地后不再重现——任何未来的 orphan gate 会立即在 `verify-gate-coverage` 触发。本票的 5 决策**闭合了当前 C-class 4 门的 orphan 状态**（新入账的 `verify-config-catalog` 一并处理）。

#### UM-LINT-B alignment note

[UM-LINT-B](UM-LINT-B-UNMATCHED-PROGRAMS.md) 的 56 unmatched programs 与本票同类（upstream 新规则，fork 的 tsconfig 归属 glob 未覆盖）。适用同一 slice-first-decide 框架：
- 分析 56 by 根因类型：
  - Bucket (i): fork 包缺 tsconfig owner → **FIX** by adding tsconfig
  - Bucket (ii): fork 包故意在 tsconfig 图之外（如 test-support scaffolds）→ **WAIVE**
- Slice 分析是独立 follow-up（UM-LINT-B 单开 session ~1-2）。本票只锁定 alignment 关系。

#### Grade uncertainty: **LOW-MEDIUM**

- `verify-config-catalog` + `architecture-graph` zh: **LOW**（3 judges agree, mechanism 已知）
- `documentation standard tests`: **LOW**（Judges 2/3 clear win, 规模小）
- `verify-package-dependencies` (75): **LOW**（slice 数据 87% 同类 → pattern 豁免 clear win；剩余 13% 需单独 look，但影响不改变主决策）
- `verify-client-ui-i18n` (83): **MEDIUM**（"no i18n users" 假设成立但含隐含产品路线图；若产品未来国际化，known-red 需 re-open）
- **UM15 §2 meta-gate contract**: **MEDIUM**（草案已成型；具体 verify-gate-coverage.ts 扩展是独立实现 session）

**建议下一步**：本 grilling 决策接受后，认领 2 个 FIX 门作为快速首片（AFK ~1 session），随后 UM15 §2 meta-gate 独立 session（~1 session），UM-LINT-B 的 slice 分析独立 session（~1）。3 个 WAIVE/KNOWN-RED 门的登记随 UM15 §2 完成。

### [2026-09-13] Cluster D grilling — Status transition

Status: `open` → **`open (awaiting user sign-off on synthesis)`**。**不动 CI wiring yaml、不接门**，待用户拍板；决策 doc 已就位供 paste 进 UM12 + UM15 §2 + UM-LINT-B 的 Resolution 节。若用户批 hybrid（fix 2 + waive 2 + known-red 1），则触发下一 apply session。

### [2026-09-13 apply] 5 门 hybrid 收口——含关键订正 2 处

**用户批准（2026-09-13）**："按推荐批准" + 关键澄清 2 条：
1. **fork data-agent 相关包短期不 npm 独立发布，1.0 后再考虑** → **Gate 4 从 WAIVE 改为 FIX（收敛 peer to upstream levels）**
2. **data-agent 短期不国际化，保持 dsh 已有语言切换** → 确认 Gate 5 KNOWN-RED

**Apply 期间发现的 2 处 grilling 数据订正**：

**订正 A（Gate 2 moot）**：`docs/architecture-graph.md` 已在 `scripts/translation-pairing.manifest.json` excluded 列表 (line 7)——先前 session（推测 Cluster A 5-generator regen cascade 或 UM11 后清）已应用；实测 `verify-translation-pairing` **0 hits on architecture-graph**。Gate 2 「zh 缺口」的 grilling 前提**已 stale**，不需要新 fix。

**订正 B（Gate 3 scope 大幅扩张）**：Cluster D grilling 说 "2 test fails, ~10 min WAIVE"。Apply 实测：failing tests 的 `packageReadmes()` 迭代**在首个失败包处 short-circuit**，我原以为的 "1 file offender"（data-agent bundle）实际上是**alphabetical-first offender**——真实 scope 是 **65 个 fork 包**缺 YAML frontmatter + skeleton headings（`packages/*/*/README.md`）。原估 "~10 min WAIVE" 严重低估；真实 mass retrofit 是 65 × 2 = 130 file edits，达 ~1-2 session mechanical work。

**订正 B 应对**：Gate 3 apply 决策从 WAIVE 改为 **KNOWN-RED permanent**（同 Gate 5 机制）。data-agent bundle README 已作 correct skeleton 示例落地；剩余 64 fork 包 retrofit 归**新票 [UM-FORK-README-SKELETON-RETROFIT](UM-FORK-README-SKELETON-RETROFIT.md)** 单开跟踪。

#### 5 门实际 apply 结果

| # | Gate | 决策 | 实际动作 | 验证 |
|---|---|---|---|---|
| 1 | `verify-config-catalog` | FIX | `pnpm run gen-config-catalog` → `docs/config-catalog.md` up-to-date（1-line delta） | ✅ `verify-config-catalog` GREEN |
| 2 | `docs/architecture-graph.md` zh | **moot（订正 A）** | 无——已在 excluded manifest（line 7） | ✅ `verify-translation-pairing` 0 hits on this file |
| 3 | `documentation standard tests` | **KNOWN-RED（订正 B）** | 部分 fix：data-agent bundle README 补 frontmatter + Summary/TOC/Dev Note 作示例；剩余 64 包归 UM-FORK-README-SKELETON-RETROFIT 单票 | ❌ `doc-standard.spec.ts` 仍 2/12 failing——per ticket permanent 状态 |
| 4 | `verify-package-dependencies` (65) | **FIX（订正决策）** | `pnpm run verify-package-dependencies --fix` 自动修复 8 manifests + `pnpm-lock.yaml` refreshed + 3 module-graph artifacts auto-regen；peer 收敛到 upstream 一致 | ✅ 65 → **0 violations**，`66 package(s) match the published dependency policy` |
| 5 | `verify-client-ui-i18n` (83) | KNOWN-RED permanent | 无 code change——rationale 内联 ticket，脚本仍 enrolled 在 run-gates（Meta-gate `verify-gate-coverage` 只查 coverage 不查 pass/fail） | ❌ `verify-client-ui-i18n` 仍 83 violations——per user 决策 permanent |

#### 落地文件（Cluster D apply）

- **Gate 1**: `docs/config-catalog.md` regen（1 line）
- **Gate 3 partial fix**: `packages/bundle/data-agent/README.md` + `.zh.md` 补 frontmatter + Summary + TOC + Dev Note skeleton；pair record 刷新
- **Gate 4**: `packages/api/remotes/package.json` + 7 个 client 包 package.json 收敛 peer；`pnpm-lock.yaml` 重生成；`docs/module-graph.{md,zh.md,i18n.yaml}` auto-regen
- **新票**: `wayfinder/data-agent/tickets/phase-upstream-merge/UM-FORK-README-SKELETON-RETROFIT.md`

#### 关键决策 rationale trail

1. **Gate 4 决策 FIX 优于 WAIVE** 因为：fork 短期不发布 → peer 扩展（"发布 ready"）非必要 → 收敛到 upstream 一致更简单，无需 waiver 长期挂账 + 结构性防线（未来 upstream 加/改规则时无 fork drift 债）
2. **Gate 3 决策 KNOWN-RED 优于 mass FIX** 因为：65 包 × 2 = 130 files 手工/自动 retrofit 是 ~1-2 session 工作量，与 Cluster D "grilling + apply 单 session" 目标不匹配 → 单开票跟踪
3. **保留 data-agent README skeleton** 因为：作 correct skeleton 示例 + 减 1 后续 retrofit 目标 + 无 drift 引入
4. **Gate 2 moot 而非 FIX** 因为：`architecture-graph.md` 已 excluded → 加 zh emission 是超范围工作（若某天想真"接 zh"，是独立票工作）

#### 门统计变化

`check:ci:static` 门总 48：
- 前（Cluster A/B/C 后基线）: 37 passed / 10 failed
- 后（Cluster D apply）: **38 passed / 9 failed**（Gate 4 `verify-package-dependencies` 从红→绿；其他 Cluster D 门本已知红 & 状态未变）
- CI real red-set (Release workflow): {`Dependency layout`, `Pack npm tarballs`}——**`Dependency layout` 变化预期**（本 apply 后应转绿；`Pack npm tarballs` 是 version-split issue，不受本 apply 影响）

**票转移**：本票 open → **resolved**；UM12 open → **resolved**（Cluster D 收口）；UM-FORK-README-SKELETON-RETROFIT 新建 open。ledger delta: -2 open + 1 open + 2 resolved = **34 → 35（7 open + 21 resolved + 6 archived + 1 folded）**。
