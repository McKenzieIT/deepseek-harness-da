# UM-MERGE-INTEGRITY — 2026-09-07 merge 双向有损：既丢了 upstream 文件，又复活了 upstream 已删的包

**Type**: research · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（可立即认领）
**Blocks**: [UM11](UM11-pr-merge-post-cleanup.md)（**硬阻塞**：不能在一次双向有损的 merge 上开 PR 并声称「非回归」）、[UM12](UM12-post-merge-ga-fork-ci-resweep.md)（5 门红的根因在本票）
**Graduated from**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 2026-09-10 Phase C 并行分诊（S3 subagent 发现，主 session 独立复核）

## Question

`6b7610d45a`（upstream-merge 2026-09-07）**在两个方向上都丢了东西**。已复核两类，需要的是**把这两类各自的完整集合枚举出来**，逐条判 keep/drop，而不是只修已发现的 4 个实例。

### 方向 A — merge 丢了 upstream 的源文件（更严重）

`packages/client/ui-settings-models/src/client/` 下两个文件在 upstream 侧存在、在 HEAD 侧消失：

| 文件 | `c389f96bf3`（resync 的 upstream 尖端） | `HEAD` (`ecaa56c848`) |
|---|---|---|
| `slot-contract.ts` | `blob` | **ABSENT** |
| `operations.ts` | `blob` | **ABSENT** |

目录条目数：`c389f96bf3` = 21，`HEAD` = 19。

**关键证据**：`git log --diff-filter=D HEAD -- <两文件>` **返回空** —— 没有任何普通 commit 删除过它们。它们是在 merge 的冲突解决里蒸发的。

**为什么没人发现**：fork 的 `index.ts` 自身不 import 这两个文件，所以 `tsc` 不报错、`build:official` 保持绿。**编译器抓不到「upstream 文件被静默丢弃」这一类损失** —— 这是本票最重要的方法论结论。唯一的外部症状是 `verify-md-links` 里两条断链（`ui-settings-models/README{,.zh}.md:37 → src/client/slot-contract.ts`），即文档还在广告一个已经不存在的 slot 契约。

### 方向 B — merge 复活了 upstream 已删除的包

| 包 | `upstream/master` | `HEAD` |
|---|---|---|
| `packages/examples/jsonrpc-demo` | **ABSENT** | `tree` |
| `packages/examples/agent-spine-demo` | **ABSENT** | `tree` |

upstream 的三个删除 commit **全部是 `d347e70390`（第一次 merge 的 upstream parent）的 ancestor**（已逐条 `merge-base --is-ancestor` 复核）：

- `f3402eff58`（2026-08-23，`jsonrpc-demo` → `packages/sdk/python-runtime` 改名）
- `1d4dcf3b57`（删掉改名后的包）
- `244de7c18a`（2026-08-26，删 agent spine demo）

即：**这两个删除本应随 merge 落地，却没有**。自证性证据 —— HEAD **同时携带 upstream 自己的删除说明** `.agents/notes/archived/simplification/2026-08-26-remove-agent-spine-demo.md`，而它要删的包还在。

`scripts/verify-application-entrypoints.ts` 与 upstream **逐字节相同**（`git diff upstream/master HEAD` 为空），所以 upstream 过这门、fork 不过，差异全部来自这两个僵尸包 + fork 自有包。

## 这两类各自的 gate 代价（已实测，非推断）

方向 B 直接造成 5 门红：`config catalog`（唯一 offender 就是 `agent-spine-demo` 的 `personaPrefix`/`personaSuffix` schema-vs-type 不一致）、`tsconfig paths`（唯一 offender 是 `jsonrpc-demo`，包名≠目录名）、`application entrypoints`（13 项里 3 项）、`subsystem pages`（6 项里 1 项）、`package README model experience`（3 项里 2 项）。

## Scope

1. **枚举方向 A 的完整集合**：把 `c389f96bf3` 与 `HEAD` 做树 diff，限定在「upstream 在上一个 merge base 之后动过」的路径上，逐个文件判「fork 有意重构删的」vs「merge 冲突解决误丢的」。`slot-contract.ts` / `operations.ts` 这两个到底属于哪一类，**本次未能区分** —— 需要读 `6b7610d45a` 的冲突解决才能定。
2. **枚举方向 B 的完整集合**：找出所有「upstream 已删、fork 仍在」的包/目录。已知 2 个，未穷举。判据：upstream 的删除 commit 是否为 merge 的 upstream parent 的 ancestor。
3. **逐条判 keep/drop**，不要一律 drop —— fork 可能有意保留某些。
4. **落地 B 的删除**（含 `python/sdk-runtime/package.json` 的两条 `workspace:^` 声明、`pnpm-lock.yaml`、`gen-module-graph` + `gen-architecture-graph` regen）。
5. **喂给 [UM15](UM15-durable-upstream-sync-method.md)**：merge 的完整性本身需要一道 gate。见下。

## 喂给 UM15 的方法论结论（本票最有价值的产出）

**`tsc` 绿 ≠ merge 无损。** 两个方向都逃过了编译器：

- 方向 A：丢掉的文件没有 fork 侧的 importer，所以编译器无话可说。
- 方向 B：多出来的包能独立编译，所以编译器也无话可说。

UM15 的 durable 方法必须包含一道**merge 完整性 gate**，与「gate 是否变红」正交：

- **upstream 删除应用检查**：对每个「upstream 在窗口内删除的路径」，断言 merge 后该路径确实不存在（除非有显式的 keep-fork 豁免记录）。
- **upstream 文件保留检查**：对每个「upstream 在窗口内存在且未删除的路径」，断言 merge 后仍存在（除非有显式的 fork-drop 豁免记录）。

两者都是纯 git plumbing，不需要构建，且**恰好抓住编译器结构上抓不到的那一类损失**。这道 gate 存在的话，本票的两类问题都会在 merge 当天被抓到。

## 诚实边界

- 方向 A 的两个文件：**已确证消失且非普通 commit 所删**；**未确证**是误丢还是有意重构。区分需要读 `6b7610d45a` 的冲突解决。
- 方向 B 的归因（`6b7610d45a` 而非 `8112743d69`）是从「upstream 删除 commit 是 `d347e70390` 的 ancestor」推出的，推理成立，但**未读 `6b7610d45a` 的冲突解决**确认机制（delete/modify 时 "keep ours" vs 别的）。
- 两个方向都**只发现了实例，没有穷举集合** —— 这正是本票 Scope 1/2 的内容。

## Resolution

### [2026-09-14 Phase C] 两个方向都已穷举。方向 B 已落地；方向 A 的结论是「改文档、不恢复文件」，并暴露出一个远大于本票原框的损失

**S1 subagent 只读枚举 + 主 session 独立复核关键项。** 本票原框「2 个丢失文件 + 2 个僵尸包」**两条都不完整**。

#### 先修正拓扑（本票与 prompt 都记错了）

真实形状（主 session 用 `git merge-base --is-ancestor` 实测）：

```
B1 = 141eb6fef8  = merge-base(65bf3cddc9, d347e70390)   (2026-08-19, upstream rc.8)
65bf3cddc9  (2026-09-07 19:16)  ← 真正的 fork pre-merge tip
6b7610d45a  = M1 = merge(65bf3cddc9, d347e70390)   "upstream-merge 2026-09-07"
   ↓ c28b928fa9
558e6f4f66  (2026-09-08 19:06)  ← **M1 的后代**，不是 fork parent
8112743d69  = M2 = merge(558e6f4f66, c389f96bf3)   "upstream-resync 2026-09-08"
   ↓ ... → a469c899bd
```

- **`558e6f4f66` 不是 fork parent** —— 它是 M1 的后代（`merge-base --is-ancestor 6b7610d45a 558e6f4f66` = YES）。真正的 fork parent 是 **`65bf3cddc9`**。UM12 据此做的唯一一条「正面确证 pre-existing」因此失效（详见 UM12 Resolution）。
- **有两次 merge，不是一次。** 且 `merge-base(M2 的两个 parent) = d347e70390 = M1 的 upstream parent`，两个窗口恰好首尾相接、无重叠。
- `M2..HEAD` 里的 3 个 merge（`5cae53421f`/`e67ecc6541`/`d4f2752c15`）双亲都在 fork 侧，非 upstream merge。**没有第三次 upstream merge。**

#### 方向 A —— 文件级完整集合 = 恰好 2 个，全归 M1

用 4 格存在性矩阵（B/F/U/M）分类，两种独立方法交叉验证（`git diff --diff-filter=D` 与 `ls-tree` 的 `comm`）：

| 路径 | B | F | U | M | 归因 | 判定 |
|---|---|---|---|---|---|---|
| `ui-settings-models/src/client/slot-contract.ts` | 缺 | 缺 | 有 | 缺 | **M1** | drop = 真损失 |
| `ui-settings-models/src/client/operations.ts` | 缺 | 缺 | 有 | 缺 | **M1** | drop = 真损失 |

`in U1 not in M1` = 2；`in U2 not in M2` = 2；`in U2 not in HEAD` = 2。在 M2 处矩阵是 `B2=有/F2=缺/U2=有/M2=缺`（= 「fork 有意删除、merge 保留」那一行）—— 即 **M2 只是合法地传播了 M1 的损失，M2 没有造成它**。

#### ⚠ 但文件级枚举结构上看不见真正的损失：**M1 把整个 `ui-settings-models` 包回退到了 B1**

本票 Scope 1 写的是「树 diff」= 文件存在性级别。改做 **blob 级** 4 格分类后：

- **27 个文件** 满足 `F==B`（fork 从未碰过）、`U!=B`（upstream 改过）、`M==B`（merge 保留了 base）—— **27 个全部落在 `packages/client/ui-settings-models/`，仓库其余部分为 0**。
- 加上 `ProviderEditor.tsx`（fork 碰过，merge 取了 ours）→ 该包约 **30 个文件整体回退**。
- **M2 这一类为 0** —— M2 是干净 merge。

**为什么 `--cc` 看不到**：`git diff-tree --cc 6b7610d45a -- <pkg>` **输出为空**，因为 combined diff 只显示与**所有** parent 都不同的路径，而 M1 的树在这里等于 parent¹。已抽样确证 `ModelsSection.tsx` / `index.ts` / `CustomProviderCard.tsx` 均为 `B1==F1==M1` 而 `U1` 不同。

**这条是本票最重要的修正**：损失不是「2 个文件」，是「一个包被静默回退了 3 周」。而 `tsc` 依然绿，因为回退后的包内部自洽。

其余残差桶均属正常：M1 的 74 个「其它」= 60 个真三方解决 + 7 个 upstream 新增被采纳并改动 + 6 个 `B==U, M==F`（fork 独有改动）+ 1 个加性并集（`packages/api/remotes/tsconfig.host.json`）。M2 的 104 个 = 48 三方 + 55 个 `B==U,M==F` + `pnpm-lock.yaml`。

#### 方向 B —— M1 复活 100 条路径，M2 为 0；HEAD 上仍活 25 条 / 5 组

100 条里 75 条在 M1 之后已被清掉（全是 `packages/client/runtime`，R-DA-P1 迁走的那个 zombie）。**活着的 = 25 条 / 5 组**：

| 组 | 文件数 | upstream 删除 commit | 归因 | fork 改过？ | 判定 |
|---|---|---|---|---|---|
| `packages/examples/jsonrpc-demo` | 11 | `f3402eff58` 2026-08-23 | M1 | 否 | **drop** ✅ 已落地 |
| `packages/examples/agent-spine-demo` | 10 | `244de7c18a` 2026-08-26 | M1 | 否 | **drop** ✅ 已落地 |
| `knip.json` | 1 | `907c6334c1` 2026-08-19 | M1 | 是（M1 前 5 个 commit） | **drop**（未落，见下） |
| `packages/client/connection/tests/fake-api.client.ts` | 1 | `e14d354e83` 2026-08-27 | M1 | 是（反应式 tsc 清理） | **drop**（未落，见下） |
| `ui-settings-models/src/invariant.ts` + `tests/invariant.client.spec.ts` | 2 | `15f2997bcb` 2026-08-28 | M1 | 否 | **keep/defer**（与包 re-port 耦合） |

**本票原文的两处错误**：
1. `1d4dcf3b57` 被列为 demo 包的三个删除 commit 之一 —— 它删的是 `packages/sdk/python-runtime/*`，**其中没有任何一条被复活**，与方向 B 无关。
2. 本票只找到 5 组里的 2 组。

#### 方向 A 的最终判定：**误丢（置信度 ~95%），但正确修法是改文档而不是恢复文件**

证据链：① 两文件是 B1 之后 upstream 新增（`855461c2e8` 2026-08-26、`2f2e6d627b` 2026-08-28），矩阵 `B=缺,F=缺,U=有` 下普通三方 merge 会自动加入，只能被冲突解决显式移除；② `--diff-filter=D` 在 F1/F2/HEAD 上全空；③ 不是 fork 改名（`schema-operations.ts` 是另一个更早的 26 行文件，在 U2 里与 109 行的 `operations.ts` 并存）；④ fork 在 M1 前从未碰过该包的那 27 个文件，无分歧意图；⑤ upstream 侧 6 个组件 + 3 个测试都 import 这两个模块，是完整特性而非死码。

**但恢复 ≠ 恢复 2 个文件**：27 个回退文件里 **20 个在 HEAD 已同时偏离 B1 和 U2**（fork 在回退后的基础上继续开发），6 个仍等于 B1，1 个等于 upstream。所以「恢复」实质是把 upstream 2026-08-26/28 的重构与 M1 之后的 fork 工作做一次真正的特性 merge —— **不是 gate 修复**。

**断链的真正来源（决定 L7 怎么修）**：`README.md` 的 blob 在 B1/F1/**M1**/F2 都是 `0d76d5f315`（0 次提及 `slot-contract`），到 **M2 = HEAD 变成 `3b2f8af6b9`（1 次提及）**，`git diff-tree --cc 8112743d69 -- README.md` 显示 `MM`。即 **M2 采纳了 upstream 的 README 文案，而代码仍是回退状态**。`README{,.zh}.md:37` 整段是 upstream 为一个 fork 并不具备的特性写的文档 —— 不只是一条陈旧链接。

→ **L7 修法：删/改 `README{,.zh}.md:37` 那段（并保持 `README.i18n.yaml` 配对），另开票做包 re-port。**

顺带发现（不阻塞任何门）：`docs/subsystems/slots{,.zh}.md:126-127` 仍列 `settings.models.provider-card` / `settings.models.footer` 两个 fork 未声明的 slot。该文件手写、**不被任何 gate 覆盖**（无脚本引用 `docs/subsystems/slots`），属虚假文档。

#### 已落地（commit `bcf4776f1d`）

删两个僵尸包（21 个 tracked 文件）+ `python/sdk-runtime/package.json` 两条 `workspace:^` + `tsconfig.host.json` 两条 project ref + `pnpm-lock.yaml` 重生成（`--frozen-lockfile` 复测 clean）+ `gen-module-graph`/`gen-architecture-graph` regen + 删 `verify-package-readme-model-experience.ts:84` 的 `packages/client/runtime` 陈旧 allowlist（RC-P2）。

**实测门效果**（每门单独跑，非推断）：

| 门 | 前 | 后 |
|---|---|---|
| `config catalog` | 红（僵尸 schema-vs-type） | **GREEN** |
| `package README model experience` | 红 3 项 | **GREEN**（2 项僵尸 + 1 项 RC-P2 allowlist） |
| `application entrypoints` | 红 13 项 | 红 **10** 项（3 项僵尸消失；余 10 全 fork 自有 → L6 现可安全做） |
| `subsystem pages` | 红 6 项 | 红 **5** 项（1 项僵尸消失） |
| `module graph` / `architecture graph` | 绿 | 绿（regen 后保持） |
| `runtime closure` | 红 | 红（同一条 `phase-gate -> scope-registry`，**未因删依赖而变化**） |

#### ⚠ `tsconfig paths` 上发现的新问题：**门推荐的修法会破坏 `tsconfig.base.json`**

删僵尸后该门从「包名≠目录名」变成「`tsconfig.base.json` is stale」，提示 `run pnpm run gen-tsconfig-paths`。**实跑该命令产出的是无效 JSON**：

用 TypeScript 自己的 parser 复核（`ts.parseConfigFileTextToJson`）——
- regen 前：`OK, 418 path aliases`
- regen 后：`ERROR: ',' expected.`

原因：生成器把它那段 alias 的最后一条写成**不带尾逗号**（假定自己的块是 `paths` 对象的结尾），而 **fork 在 `// END generated package aliases` 之后又加了一整块 `"@deepseek-ai/dsh-*"` 通配 fallback**。已 `git restore`，未提交。

更深的冲突：regen 想显式补进 ~120 条 data-agent 包 alias，而 **fork 选择用一条通配 fallback 覆盖它们**。「保留通配 vs 采纳显式生成」是设计取舍，不是机械修复 → **另开票 / 进 grilling**，且这条正是 UM15 该抓的 fork-upstream seam 冲突。

#### 未落地（有意，附理由）

- **`knip.json` + `fake-api.client.ts`**：两者都已确证为僵尸（`fake-api.client.ts` 在 `packages/client/connection/` 内零 importer，且与 `packages/api/session-controller/tests/fake-api.client.ts` **同名不同文件**，后者被 7 个 spec 使用 —— 差点误删）。但**两者都不影响任何 gate**（upstream 已把 `knip` 门与脚本一并删除，S3 在 pre-merge 基线确证 `knip` 门那时还红着），而删 `knip.json` 需连带改 `scripts/rescope-fork.ts:263-264` 的 edit descriptor 与 `rescope-fork.spec.ts:132-137` 的断言。**零门收益 + 非零风险 → 留作独立 commit。**
- **`ui-settings-models/src/invariant.ts` 对**：S1 未能确证 `verify-package-invariants` 是否要求每包配套 invariant（该包不在 `scripts/package-invariants.ts` 里点名）。与包 re-port 耦合，一并 defer。

#### 本票产出的 UM15 输入（比原先更强）

原结论「`tsc` 绿 ≠ merge 无损」成立，但**还不够强**。真正的结论是：

**文件存在性级的完整性门也不够。** 本票原设计的两道门（upstream 删除应用检查 / upstream 文件保留检查）**都不会抓到 `ui-settings-models` 的整包回退** —— 因为那 27 个文件在 merge 后**都还在**，只是内容退回了 3 周前。抓它需要第三道门：

- **upstream 内容采纳检查**：对每个「fork 未改过（`F==B`）且 upstream 改过（`U!=B`）」的路径，断言 merge 后 `M==U`（除非有显式豁免）。这恰好是 fork 无权主张分歧的那批路径，也是纯 git plumbing。

这三道门都不需要构建，而且**恰好覆盖编译器结构上抓不到的三类损失**（删除未应用 / 新增被丢弃 / 修改被回退）。已写进 UM15 §2.4.bis 的待办。

#### 诚实边界

- S1 **未跑任何 gate**（禁止），其所有 gate 影响结论都是读脚本源码推出的；**主 session 已逐门实跑复核**上表全部数字。
- 方向 A/B 在**文件存在性**级对两次 merge 都是穷举的。blob 级 sweep 对「fork 未改 / upstream 改了 / merge 保留 base」这一模式是穷举的，但 **108 个真三方解决（M1 60 + M2 48）里的部分 hunk 丢失未逐 hunk 审计**，可能藏更小的内容损失。
- 20 个「已偏离」的 `ui-settings-models` 文件只做了 blob 比对，**未逐个读 diff**，所以 re-port 的规模只能说「非机械」，无法进一步量化。
- `knip` 门被 upstream 删除后，其底层债（`packages/eval/eval` 的 `knip.json ignoreDependencies`）**是否仍存在未测**。

**→ 本票状态：Scope 1/2/3 完成，Scope 4 完成方向 B 的主体（2 组落地、2 组有意 defer、1 组 keep），Scope 5 已喂给 UM15 并升级为三道门。**
**仍 open 的原因**：整包回退（`ui-settings-models`）是本票发现但不属本票的工作，需新票；`tsconfig paths` 的生成器/通配冲突需决策。**对 UM11 的硬阻塞可以解除到「已知且已量化」的程度，但 PR 描述必须写明整包回退这条**，否则仍是在一次有损 merge 上声称非回归。
