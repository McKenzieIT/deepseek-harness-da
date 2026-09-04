# GA-GRILL-query-postgres-compliance — query-postgres src-only-red 合规方向 grilling

**Type**: grilling（先 grill 决方向，再开实施票）  ·  **Phase**: misc  ·  **Status**: Resolved（方向 A，全合规不动 gate）  ·  **Resolved**: 2026-09-04
**Source**: [map GA-EVAL-MANIFEST-impl 遗留](../../map.md)（query-postgres src-only-red pre-existing）· [check-workspace-constraints.ts](../../../scripts/check-workspace-constraints.ts) · [package-invariants.ts](../../../scripts/package-invariants.ts) · [verify-built-package-invariants.mjs](../../../scripts/verify-built-package-invariants.mjs)
**Related**: [map GA-AUDIT1 / GA-EVAL-MANIFEST-impl](../../map.md) · [GA-GRILL-eval-manifests](GA-GRILL-eval-manifests.md)（A/B/C 框架 + eval-cli 方向 A 先例）· [GA-EVAL-MANIFEST-impl-comply](GA-EVAL-MANIFEST-impl-comply.md)（E3 翻 src-only→build 模板）

## 问题（grill 前先读这些确认）

`@deepseek-ai/dsh-query-postgres`（`packages/query/query-postgres`，GA-GT2-D4 第二引擎 stub）在两个 invariant gate 上红，但 `constraints`（dsh- gate）绿：

- **`verify-package-invariants`**：`tsdown.config.ts: package build override must bundle lib/types/invariant.js`（`entry:[]` 源码不含 `lib/types/invariant.js` 字串）。
- **`verify-built-package-invariants`**：`@deepseek-ai/dsh-query-postgres: Cannot find module .../lib/invariant.js`（owner 但 `lib/invariant.js` 不存在——tsdown `entry:[]` 不 bundle）。
- **`constraints`**：query-postgres **不在**违规列表（manifest 已全合规——见下"grill 查到的现实"）。

读确认（2026-09-04 跑 gate 的 ground truth，`/tmp/qpg-gates.log`）：
- `pnpm run constraints`：query-postgres 0 violation（红的是 pre-existing 非 query-postgres：credentials-keychain/-host、tool-discover-alt-labels/tool-resolve-term/tool-scope-routing、eval/eval、client/schema-form+web-react 层级）。
- `pnpm run verify-package-invariants`：**仅** query-postgres 一条（tsdown.config 缺字串）。
- `pnpm run verify-built-package-invariants`：~30 条 `manifest does not publish ./lib/invariant.js as ./invariant`（**非-owner 簇**：dsh-query、dsh-query-maxcompute、dsh-query-tool、dsh-admin、dsh-evidence-query、…）+ query-postgres 的 `Cannot find module .../lib/invariant.js`（**owner 簇**，文件缺）。

## grill 查到的现实

- **query-postgres 的 manifest 已全合规**（GA-AUDIT1 2026-09-03 落地）：`version 0.1.0-rc.8`、`type:module`、`main:lib/index.js`、`types:lib/types/index.d.ts`、`exports["."].{types,default}`、`exports["./invariant"].{types,default}`、`files:[lib/index.js,lib/invariant.js,lib/types/**/*.d.ts]`、`cordis` peer+dev、`dsh-invariants` peer+dev、`publishConfig.access=public`、`repository`。GA-AUDIT1 加 `src/invariant.ts`（mirror token-meter companion，`PACKAGE_NAME`/`name=query-postgres-invariant`/`inject=['invariants']`/空 install + "No runtime invariant:" 注释/`apply=ctx.invariants.register`）+ tsconfig ref `../../runtime-diagnostics/invariants`。**唯一缺的**是 tsdown `entry:[]` 不 bundle → `lib/invariant.js` 不产 + tsdown.config 源码不含 `lib/types/invariant.js` 字串。这正是 eval-cli 翻转**前**的同款状态（eval-cli 翻转前还多缺 manifest/version；query-postgres 连 manifest 都已就绪，**比 eval-cli 更简单**——只差 tsdown flip）。
- **src-only 是 da 自定设计**（`tsdown.config.ts` 注释 "Source-only package... mirrors `@deepseek-ai/dsh-query` and `@deepseek-ai/dsh-query-maxcompute`... wiring as composite project breaks the typert WorkspaceAnalyzer's `./src/*` cross-package resolution"），非上游（`packages/query/` 整组 da 从 reverse-bi 迁来、da 加的包）。"翻掉"是 da 团队自决，不涉上游。
- **typert `./src/*` cross-package 断裂的约束对 query-postgres 是 vacuous**：grep `dsh-query-postgres` 全仓（excl self）**仅 `packages/query/query-tool/src/index.ts:345` 一处字符串字面量**（错误提示 `...or @deepseek-ai/dsh-query-postgres so ctx.query is available`），**无任何包 import `@deepseek-ai/dsh-query-postgres/src/*` 或 `@deepseek-ai/dsh-query-postgres`**。query-postgres 是 GA-GT2-D4 stub（seam proof，seam ops throw not-implemented），**尚无消费者**——"consumed via `./src/*` by other host packages" 是 aspirational/future，非当前现实。故"翻 composite 断 typert `./src/*`"无现存 import 可断。
- **query-postgres 本就已是 composite project**：`tsconfig.base.json` `composite:true`（全包默认）+ `tsconfig.host.json` `references` 含 `./packages/query/query-postgres`（line 204）+ query-postgres `tsconfig.json` 已 emit（`rootDir:src`/`outDir:lib/types`/`include:["src"]`/无 `noEmit`，ref invariants ✓）。`tsc -b tsconfig.host.json` 已为 query-postgres emit `lib/types/{index,invariant,conventions}.{js,d.ts,.map}`（disk 上 9/3 13:10 artifact 在）。tsdown `entry:[]` 只跳过 **tsdown bundle phase**（不产 `lib/index.js`/`lib/invariant.js`），不改 composite/emit 状态。故"翻 tsdown→bundle"不新增 composite 性（已 composite），只补 tsdown 产物。
- **typert gate（`verify-cordis-catalog`/`gen-cordis-catalog`，跑 WorkspaceAnalyzer）不在 `pnpm run constraints` 或 `hygiene` 内**——是独立 CI gate。本票验证集（constraints/verify-package-invariants/verify-built-package-invariants/typecheck/bundle+smoke）不含 typert。且 typert 经 `tsconfig.base.json` `paths` 把 `@deepseek-ai/dsh-*` 解析到 **source**（`./packages/<group>/*/src`），与 `lib/` 产物存在与否无关——tsdown 产 `lib/index.js` 不改 typert 的 source 解析。
- **`lib/index.js` 现存于 disk**（9/4 02:16，5142B，可能是某次 build 残留/并行 build 产物，`lib/` gitignored 不显于 git status）但 **`lib/invariant.js`（published path）不存在**（仅 `lib/types/invariant.js` 由 tsc emit）。verify-built 的 staged import 拷 `files` 中 `lib/invariant.js` → 不存在 → `Cannot find module`。故 verify-built 红。

## 三个方向

### A. 翻 query-postgres tsdown `entry:[]`→lib/types-entry bundle（mirror eval-cli E3 / jsonrpc-demo）

`tsdown.config.ts` 改 `entry:[]` → `defineConfig([{entry:['lib/types/index.js'],outDir:'lib',...},{entry:['lib/types/invariant.js'],outDir:'lib',...}])`（无 bin——query-postgres 是 lib 非 CLI；mirror eval-cli/jsonrpc-demo 的 `entry:lib/types/*.js`+`outDir:lib`+`dts:false`+`clean:false`+`codeSplit:false` 模式）。tsdown workspace 模式 per-package loadConfigFile 会跑此 config（query-postgres 已在 `tsconfig.host.json` references → tsdown 跑其 config 时 `lib/types` 已由 host tsc 出 → root build 不断）。产物：`lib/index.js` + `lib/invariant.js`（from `lib/types/*.js`）。
- **pro**：`verify-package-invariants` 绿（tsdown.config 源码含 `lib/types/invariant.js` 字串）；`verify-built` 绿（`lib/invariant.js` 产 + staged import 加载 name/inject/apply）；`constraints` 不动 manifest → 维绿；`typecheck`（`build:lib:host`）query-postgres 已在 host refs + tsconfig 已 emit + src 不改 → 维 clean。**唯一动 `packages/query/query-postgres/tsdown.config.ts` 一个文件**（manifest/tsconfig/host-ref/src/invariant.ts 全已就绪）= additive-only / upstream-merge-safe / da-owned。mirror eval-cli（已证 build+green）+ jsonrpc-demo（已证 build+发布+合规 dsh- CLI）。
- **con**：`conventions.ts` 用 `resolve(dirname(fileURLToPath(import.meta.url)),'conventions.yaml')` 解析 yaml——bundled `lib/index.js`（conventions 代码 inline）的 `import.meta.url`=lib/index.js → 找 `lib/conventions.yaml`（不存在；yaml 在 `src/conventions.yaml`，且 `files` 不含 yaml——`expectedDshPackageFiles` gate-hardcoded 无法加且 B 已否决）。故从 built `lib/index.js` 调 `getConventions('postgres')` 会 ENOENT。**但**：(1) 此为 pre-existing 设计张力（src-only 设计本为让 `./src/*` channel 的 yaml 解析工作；manifest 早声明 `lib/index.js` 却无 yaml in files——翻前 `lib/index.js` 是 phantom，翻后至少 module 能加载）；(2) gate 不测 `getConventions`（verify-built 只 import `lib/invariant.js`，不碰 conventions；typecheck 不 run）；(3) **无现存消费者**调 `getConventions`；(4) `./src/*` export 保留 → 需 yaml 的消费者走 src channel（`src/conventions.ts`→`src/conventions.yaml` ✓）；(5) 与 `dsh-query-maxcompute` 同款张力（其 `conventions.ts` 亦同模式，src-only 亦同因）。记为 known limitation / follow-up，**不阻塞 gate 转绿**。

### B. 移 query-postgres 的 invariant companion（删 `src/invariant.ts` + `exports["./invariant"]` + `files` 的 `lib/invariant.js`）→ 非 owner，verify-* 跳过

- **pro**：`verify-package-invariants` 跳过（非 owner）；`constraints` 的 `exports["./invariant"]` shape-check 是**条件性**的（只在 export 存在时验 shape，不强制 export 存在）→ 删 `exports["./invariant"]` 不触发；`expectedDshPackageFiles` 硬含 `lib/invariant.js` → 须**保留** `files` 中 `lib/invariant.js`（phantom）才不红。
- **con**（**硬阻**）：`verify-built-package-invariants.mjs` 遍历**所有** manifest，对**非** owner（无 `exports["./invariant"]`）也查：`typeof invariantExport !== 'object'` → push `manifest does not publish ./lib/invariant.js as ./invariant`。**ground truth 证**：~30 个非-owner 包（含 `dsh-query`/`dsh-query-maxcompute`/`dsh-query-tool`/`dsh-admin`/...）正因此红着。故 B 把 query-postgres 从"owner-缺文件红"换成"非-owner-不发布红"——**swap red→red，非转绿**。要真正转绿须改 `verify-built-package-invariants.mjs`（runtime gate）豁免非-owner = 碰 core → upstream-merge 冲突面 → 违 additive-only（上一 session B 已因此否决，勿重蹈）。

### C. 暂不动（留红）

- **pro**：0 风险。
- **con**：`verify-package-invariants` + `verify-built` 持续红 query-postgres；技术债（GA-AUDIT1 半完成的 owner 状态挂在那）。

## Grilling 问题（逐个 grill 后答）

1. **query-postgres 是不是要发布的 npm 包？** 是。manifest 已声明 `publishConfig.access=public` + `repository` + `exports["."].{types,default}`→`./lib/index.js`。GA-AUDIT1 已决它走发布 dsh-* 路线（加 invariant companion + 全合规 manifest）。不是 src-only 私货。
2. **`./src/*` cross-package 断裂真会发生吗？** 对 query-postgres **不会**——无现存消费者 import `dsh-query-postgres/src/*`（grep 仅 1 字符串字面量）。typert gate 不在验证集 + 经 `paths` 解析 source（与 lib 产物无关）。注释的"断"是 future-consumer aspirational，非当前 gate 失败。
3. **B 会触发 constraints 红吗？** `exports["./invariant"]` 删除不触发（条件性 shape-check）；但 `files` 须保留 `lib/invariant.js`（phantom，`expectedDshPackageFiles` 硬含）。**真正阻 B 的是 `verify-built`**：非-owner 也被查"不发布 ./invariant" → 红（~30 包 ground truth 证）。
4. **A 会断 typert / typecheck 吗？** typecheck（`build:lib:host`）：query-postgres 已在 host refs + tsconfig 已 emit + src 不改 → 维 clean（eval-cli flip 已证此路径通）。typert（cordis-catalog）：经 `paths` 解析 source，lib 产物存在与否无关 → 不影响。**A 不断 typert 不断 typecheck。**
5. **A 的 yaml limitation 是回归吗？** 非。翻前 `lib/index.js` 是 phantom（manifest 声明却不存在）——"broken-as-published"已存在。翻后 `lib/index.js` 存在（module 能加载，class 可用），仅 `getConventions` 从 built lib 调有 yaml ENOENT——但 stub 的 seam ops 本就 throw not-implemented，无消费者调 `getConventions`，`./src/*` channel 仍工作。**净改善**（phantom→实文件），yaml 张力 pre-existing + gate-blind + shared-with-maxcompute。

## 决策门槛

grill 到能答"query-postgres 是不是发 npm 包"+"typert `./src/*` 断裂对 query-postgres 是否现实"+"B 是否真转绿"后，定方向。**三问已答**（是发布包 / 不现实 / B 不转绿只 swap red）→ **锁 A**。

## 不 grill 就不能定的事

- query-postgres manifest 是否已合规（决定 A 是"只 flip tsdown"还是"连 manifest 一起修"）→ **已合规**，A 极简。
- B 是否真转绿（决定 B 是出路还是 swap）→ **不转绿**（verify-built 查非-owner），B 出局。
- typert `./src/*` 对 query-postgres 是否现实约束 → **不现实**（无消费者 + typert 经 paths 解析 source + typert gate 不在验证集），A 不被 typert 阻。

## Resolution (2026-09-04)

grilling 锁定方向 **A**（翻 query-postgres tsdown `entry:[]`→lib/types-entry bundle，mirror eval-cli E3 / jsonrpc-demo；全合规、不动 gate、upstream-merge-safe）：

- **A 落地极简**（比 eval-cli E3 更简）：query-postgres 的 manifest / tsconfig / tsconfig.host ref / `src/invariant.ts` 全已由 GA-AUDIT1 落地就绪。**唯一改动** = `packages/query/query-postgres/tsdown.config.ts`：`entry:[]` → `defineConfig([{entry:['lib/types/index.js'],...},{entry:['lib/types/invariant.js'],...}])`（mirror eval-cli/jsonrpc-demo，`outDir:'lib'`/`dts:false`/`clean:false`/`codeSplit:false`/`format:['esm']`/`platform:'node'`/`target:'es2024'`）。tsdown workspace per-package loadConfigFile 跑此 config（已在 host refs → `lib/types` 由 host tsc 先出 → root build 不断）。
- **B 出局**（ground truth 证）：移 companion → query-postgres 变非-owner → `verify-built` 查"不发布 ./invariant"红（~30 非-owner 包同款红着）= swap red→red，非转绿。要真转绿须改 `verify-built-package-invariants.mjs` core gate → upstream-merge 冲突 → 违 additive-only。A 只动 da-added query-postgres、不碰 core、merge-safe。
- **typert `./src/*` 约束对 query-postgres vacuous**：无现存消费者 + typert gate 不在验证集 + typert 经 `paths` 解析 source（与 lib 产物无关）+ query-postgres 本就已是 composite（base `composite:true` + host ref）。"翻 composite 断 typert"无 import 可断。A 不被 typert 阻。
- **A 的 known limitation**（记，不阻塞）：`conventions.ts` 的 yaml 经 `import.meta.url` 旁路解析——built `lib/index.js` 调 `getConventions('postgres')` 会 ENOENT（yaml 在 `src/`，`files` 不含，`expectedDshPackageFiles` gate-hardcoded 无法加）。pre-existing 设计张力（src-only 本为 src-channel yaml 工作而设；翻前 `lib/index.js` 已是 phantom broken-as-published）+ gate 不测 + 无现存消费者调 `getConventions` + `./src/*` channel 仍工作 + 与 `dsh-query-maxcompute` 同款。净改善（phantom→实文件）。若未来有消费者需 built-lib `getConventions`，开 follow-up（要么 `conventions.ts` 改 inline yaml-as-string，要么 gate 加 `packageFileExtras` for yaml——后者碰 core 须 grilling）。

实施 → [GA-QUERY-POSTGRES-impl-comply](GA-QUERY-POSTGRES-impl-comply.md)。
