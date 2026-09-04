# GA-GRILL-eval-manifests — eval-cli/eval-runner/retrieval-experiment constraints 偏离方向 grilling

**Type**: grilling（先 grill 决方向，再开实施票）  ·  **Phase**: misc  ·  **Status**: Resolved（方向 A，全合规不动 gate）  ·  **Resolved**: 2026-09-03
**Source**: [GA-AUDIT1](../../map.md) Phase B（constraints gate）· [check-workspace-constraints.ts](../../../scripts/check-workspace-constraints.ts)
**Related**: [map GA-AUDIT1](../../map.md) · [dsh-plugin-development CONVENTIONS](../../../.agents/skills/dsh-plugin-development/CONVENTIONS.md)

## 问题（grill 前先读这些确认）

`pnpm run constraints` 对这 3 个包报偏离：

- **eval-cli**（CLI，有 bin）：`version: 0.0.0`（应 rc.8）+ 完全没有 `main`/`exports`/`files`。读 `packages/eval/eval-cli/package.json` 确认（exports 只有 `./src/*` + `./package.json`——它是个 src-only 包，跑时用 tsx）。
- **eval-runner**（eval 库，无 Cordis plugin `apply`——grep `packages/eval/eval-runner/src` 无 `export.*apply|extends Service`）：缺 `@deepseek-ai/cordis` peerDep+devDep + `files` 是 4 项（约束要 3 项 `[lib/index.js, lib/invariant.js, lib/types/**/*.d.ts]`）。
- **retrieval-experiment**（scripts 库，同样无 `apply`）：缺 cordis + version rc.1（已修成 rc.8）+ files 4 项。

读确认：`grep -rE 'export.*apply|extends Service' packages/eval/eval-runner/src packages/eval/retrieval-experiment/src`（空 → 库，非插件）；`cat packages/eval/eval-cli/package.json`（看 exports）；`grep -n 'files\|version\|cordis' packages/eval/eval-runner/package.json`。

核心矛盾：约束（`check-workspace-constraints.ts`）对**所有** `packages/<group>/<pkg>` 强制 cordis peerDep+devDep + `lib/invariant.js`（一个 Cordis companion 插件，注册包所有权到 `ctx.invariants`）。但这 3 个包是 **eval 库/CLI**，不是 Cordis 插件——它们**从不被 mount 为 plugin**，所以 `invariant.ts` companion 是**死代码**（从不加载）。给库加死代码违反 dsh-find-simplifications（"dead code"）。

对比：`packages/credentials/credentials-keychain-host`（一个真 Cordis 插件）有 `export const name = 'credentials-keychain-host'` + apply。eval-runner/retrieval-experiment 没有 → 它们不是插件。

## 三个方向

### A. 重构 eval-cli manifest + 给 2 库加结构性 invariant.ts
eval-cli 补 `main`/`exports`/`files`（bin 感知：`lib/index.js` + `lib/bin.js` + `lib/invariant.js` + `lib/types/**/*.d.ts`）+ version rc.8 + cordis + invariant.ts。eval-runner/retrieval-experiment 加 cordis peerDep+devDep + `src/invariant.ts`（复制 audit 的 invariant companion pattern）+ files 3 项。
- **pro**：完全合规（constraints gate 过）；不动约束脚本；eval-cli 拿正经 manifest。
- **con**：2 库的 `invariant.ts` 是**死代码**（库从不被 mount，companion 从不加载）→ dsh-find-simplifications 会标；维护负担（死 Cordis companion 插件）。

### B. 重构 eval-cli + 改约束让非插件库豁免
eval-cli 重构 manifest；改 `check-workspace-constraints.ts` 让"无 Cordis plugin apply 的包"豁免 cordis+invariant.ts 要求（只强制真插件）。
- **pro**：无死代码（库不加假 companion）；约束正确区分插件 vs 库；长期最干净。
- **con**：改 `check-workspace-constraints.ts`（共享 gate，影响全仓）；需"如何检测非插件库"的豁免逻辑（over-exempt 风险——真插件被误豁免）；改动面大。

### C. 暂不动（已上报）
留后；constraints gate 对这 3 包持续红。
- **pro**：0 风险。
- **con**：constraints gate 持续红；技术债。

## Grilling 问题（逐个 grill）

1. **eval-cli 到底是不是要发布的 npm 包？** 它的 `exports` 只有 `./src/*`——它是个 src-only 包（跑时用 tsx），可能**根本不该有 `main`/`exports`/`files`**（因为不发 lib）。如果是这样，约束对 eval-cli 的 `main`/`exports`/`files` 要求**本身就不适用**——这指向 B（豁免 src-only 包）而非 A。先 grill：eval-cli 将来会发 npm 包吗？还是永远是 src-only 的 CLI？
2. **eval-runner/retrieval-experiment 的 invariant.ts 真的会是死代码吗？** 有没有任何场景（测试、未来）会 mount 它们？如果未来 eval-runner 要变成 Cordis plugin（被 bundle mount），那现在加 invariant.ts 是**前瞻**不是死代码。grill：这两个包有"变 Cordis 插件"的 roadmap 吗？
3. **约束的设计意图**：读 `scripts/check-workspace-constraints.ts` 的注释——它强制 cordis+invariant.ts 是因为"每个 harness 包都该有 ownership companion"，还是只是机械套模板？如果是后者，B（豁免）是对的；如果是前者（所有权是设计原则），A（加）是对的。
4. **豁免逻辑风险**：方案 B 要检测"非插件库"——怎么检测？（grep `export.*apply`？太脆——一个包可能用 namespace export。）有没有误判风险？grill：豁免逻辑能可靠区分插件 vs 库吗？
5. **eval-cli 的 bin**：eval-cli 有 `bin/eval.ts` + `bin/compare.ts`——它是 CLI。CLI 的 manifest 该长啥样？（`bin` field + main 指向 lib/index.js？）grill：eval-cli 的 manifest 结构该参照哪个现成 CLI 包？
6. **dead code vs 合规的取舍**：A 让 gate 绿但埋死代码（dsh-find-simplifications 会标）——这是"合规但脏"。B 让 gate 绿且无死代码但要改约束——这是"合规且干净但改动大"。你更怕哪个？

## 决策门槛

grill 到能回答"eval-cli 是不是发 npm 包"+"2 库有变插件的 roadmap 吗"+"约束强制 invariant.ts 的设计意图"后，定方向。定后开实施票（GA-EVAL-MANIFEST-impl）。

## 不 grill 就不能定的事

- eval-cli 是不是 src-only（不发 lib）——这决定它**该不该**有 main/exports/files，是 A vs B 的分水岭。
- 2 库有没有"变插件"的未来——这决定 invariant.ts 是死代码还是前瞻。

## Resolution (2026-09-03)

grilling 锁定方向 **A**（全合规、不动 gate、upstream-merge-safe）：

- **2 库（eval-runner/retrieval-experiment）→ A（事实驱动）**：invariant.ts 是全仓 ~150 包的"所有权伴生"惯例（`brand`/`token-meter` 等纯库 install 空 `() => {}` 亦带）。ticket 原提"死代码 → simplification 标"被驳——纯库带空 companion 是 repo 既有做法。补 cordis peer+dev + `exports["./invariant"]` + `src/invariant.ts` + 修 files 即合规。
- **eval-cli → A（翻 da 自定 src-only 设计，merge-safe）**：eval-cli 的 src-only 是 da 自定（`tsdown.config.ts` `entry:false` + "source-only by design" 注释 + tsconfig `noEmit`），非上游（`packages/eval/` 整组 da 从 reverse-bi 迁来）。照 jsonrpc-demo 先例（已 build+发布+合规的 dsh- CLI）翻成 build+发布。
- **B 出局**：改 `scripts/check-workspace-constraints.ts` 豁免 private 包 = 碰上游共享 core gate → upstream merge 冲突面 → 违 additive-only（core 不动）。A 只动 da-added eval 包、不碰 core、merge-safe。

实施 → [GA-EVAL-MANIFEST-impl-comply](GA-EVAL-MANIFEST-impl-comply.md)。
