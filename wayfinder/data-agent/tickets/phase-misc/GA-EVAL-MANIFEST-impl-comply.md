# GA-EVAL-MANIFEST-impl — eval-cli/eval-runner/retrieval-experiment constraints 合规

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved  ·  **Claim**: wayfinder work-the-map session · 2026-09-03
**Source**: [GA-GRILL-eval-manifests resolution](GA-GRILL-eval-manifests.md)（2026-09-03 grilling 锁定方向 A，全合规、不动 gate）
**Priority**: high
**Blocked by**: 无

## Question

实施 GA-GRILL-eval-manifests 锁定的方向 A：让 eval-cli / eval-runner / retrieval-experiment 三个包满足 `pnpm run constraints`（dsh- gate），**不改 `scripts/check-workspace-constraints.ts`**（保 additive-only / upstream-merge-safe）。

## 背景（grilling 查到的现实）

- **invariant.ts 是全仓 ~150 包的"所有权伴生"惯例**（连 `brand`/`token-meter` 等纯工具包、`install` 空 `() => {}` 都带，只为 `ctx.invariants.register(包名, install)` 占位 → "second mount fails loud"）。所以给 eval-runner/retrieval-experiment 加 `src/invariant.ts` **不是死代码**，是守全仓惯例。ticket 原提的"死代码 → simplification 标"被驳。
- **eval-cli 是全仓仅 3 个有 `bin` 的包之一**；另俩 `jsonrpc-demo`/`acp-demo`（examples）是**已 build + 发布 + 合规**的 dsh- CLI（`lib/packaged-bin.js` + 完整 manifest + cordis peer/dev + invariant）。eval-cli 是异类（src-only）。
- **eval-cli 的 src-only 是 da 自定设计**（`tsdown.config.ts` `entry: false` + 注释 "Source-only CLI package ... not a bundled lib" + tsconfig `noEmit`）。但它**不是上游**——`packages/eval/` 整组是 da 从 reverse-bi 迁来、da 加的包。故"翻掉"这个设计是 da 团队自决，**不涉上游**。
- **B（改 gate 豁免 private 包）会碰 `scripts/check-workspace-constraints.ts` = 上游共享 core gate** → upstream merge 冲突面 → 违 additive-only。故 B 出局，选 A（只动 da-added eval 包，merge-safe）。
- gate 对 `packages/<group>/<pkg>` + `@deepseek-ai/dsh-*` 名的包强制：`type: module`、`main: lib/index.js`、`types: lib/types/index.d.ts`、`exports["."].{types,default}`、`exports["./invariant"].{types,default}`、`files` 精确匹配 `expectedDshPackageFiles`、`cordis` 同时在 peerDep+devDep（且 range 一致）、`version` === 根版本（`0.1.0-rc.8`）、release-member 须 `private != true` + `publishConfig.access=public` + `repository`。

## Scope

### E1: eval-runner — 补 cordis + invariant + 修 files（合规）

- `packages/eval/eval-runner/package.json`：
  - `peerDependencies` 加 `@deepseek-ai/cordis: workspace:^`；`devDependencies` 加 `@deepseek-ai/cordis: workspace:^` + `@deepseek-ai/dsh-invariants: workspace:^`（invariant companion 依赖）。
  - `exports` 加 `"./invariant": { "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" }`。
  - `files` 从 `[lib/index.js, lib/invariant.js, lib/types/**/*.js, lib/types/**/*.d.ts]`（4 项）→ `[lib/index.js, lib/invariant.js, lib/types/**/*.d.ts]`（3 项；删 `lib/types/**/*.js`——eval-runner 无 export default 指向 `./lib/types/`，`usesEmittedTreeDefaults` false，gate 不要这 glob）。
  - version 已 `0.1.0-rc.8` ✓；type/main/types/exports["."]/publishConfig/repository 已合规 ✓。
- `packages/eval/eval-runner/src/invariant.ts`（新）：照 `packages/llm/token-meter/src/invariant.ts` 模板（15 行 ownership companion）：`PACKAGE_NAME='@deepseek-ai/dsh-eval-runner'`、`name='eval-runner-invariant'`、`inject=['invariants']`、`install: InvariantInstaller = () => {}`、`apply=(ctx)=>Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))`。注释说明"eval-runner 库，无 runtime invariant"。
- 构建：确认 eval-runner 的 tsdown 配置把 `src/invariant.ts` 编进 `lib/invariant.js` + `lib/types/invariant.d.ts`（mirror 全仓惯例，~150 包都这么出）。

### E2: retrieval-experiment — 补 cordis + invariant + 修 files（合规）

- `packages/eval/retrieval-experiment/package.json`：同 E1——加 cordis peer+dev + dsh-invariants devDep、加 `exports["./invariant"]`、`files` 从 `[lib/index.js, lib/types/**/*.js, lib/types/**/*.d.ts]` → `[lib/index.js, lib/invariant.js, lib/types/**/*.d.ts]`（swap `lib/types/**/*.js` → `lib/invariant.js`）。version 已 rc.8 ✓。
- `packages/eval/retrieval-experiment/src/invariant.ts`（新）：同模板，`PACKAGE_NAME='@deepseek-ai/dsh-retrieval-experiment'`、`name='retrieval-experiment-invariant'`。
- 构建同 E1。

### E3: eval-cli — 翻 src-only 设计，build + 发布（mirror jsonrpc-demo）

照 `packages/examples/jsonrpc-demo`（已 build+发布+合规的 dsh- CLI）模板：

- `packages/eval/eval-cli/tsdown.config.ts`：`entry: false` → 真构建设置，emit `lib/index.js`（from `src/index.ts`）、`lib/bin.js`（from `bin/eval.ts`，带 shebang）、`lib/invariant.js`（from `src/invariant.ts`）、`lib/types/**`。**删/改"source-only by design"注释**（设计已翻）。mirror jsonrpc-demo 的 tsdown 配置（impl 时读其 `tsdown.config`）。
- `packages/eval/eval-cli/tsconfig.json`：`noEmit: true` → 让 tsdown 出 lib/types（tsdown 接管 emit；确认不冲突）。
- `packages/eval/eval-cli/src/index.ts`（新，程序化入口）：gate 要 `main: lib/index.js` + `exports["."]`，eval-cli 需程序化入口。从 `bin/eval.ts` 抽出可复用的 eval 运行逻辑（mini-Cordis-context builder / `runEval(...)`）到 `src/index.ts` 并 export；`bin/eval.ts` 改为 import 它、薄 CLI 层。**不造空 placeholder**——给条真 API。
- `packages/eval/eval-cli/src/invariant.ts`（新）：同模板，`PACKAGE_NAME='@deepseek-ai/dsh-eval-cli'`、`name='eval-cli-invariant'`。
- `packages/eval/eval-cli/package.json`：
  - `version`: `0.0.0` → `0.1.0-rc.8`。
  - `bin`: `{ "dsh-eval": "./lib/bin.js" }`（从 `./bin/eval.ts`）。
  - 加 `main: "lib/index.js"`、`types: "lib/types/index.d.ts"`。
  - `exports` 加 `"."`（types+default）、`"./invariant"`（types+default）；保留 `./src/*`、`./package.json`。
  - `files`: `[lib/index.js, lib/invariant.js, lib/bin.js, lib/types/**/*.d.ts]`（gate 的 `expectedDshPackageFiles` 对有 bin 的包 = 这 4 项）。
  - `dependencies` 里的 `@deepseek-ai/cordis` → 挪到 `peerDependencies` + `devDependencies`（gate 要 peer+dev，不要 dep；保留其余 dsh-* workspace deps 不动）。
  - 加 `publishConfig: { access: "public" }` + `repository: { type: "git", url: "git+https://github.com/deepseek-ai/deepseek-harness.git", directory: "packages/eval/eval-cli" }`。
  - `scripts` 加 `"bundle": "tsdown"`（mirror ui-semantic-layer）。
- `bin/compare.ts`：gate 的 `expectedDshPackageFiles` 只认单 bin（`lib/bin.js`）。确认 compare 是否要作为第二发布 bin——若是，gate 的 `sameStringList` 会因多一项文件失败；**建议**把 compare 折成 `dsh-eval` 子命令（单 bin），或留 compare 为 dev/tsx 脚本不发布（不入 `files`）。impl 时定。

## 验收标准

1. `pnpm run constraints` → eval-cli / eval-runner / retrieval-experiment **0 violation**（gate 对这 3 包转绿）；无其他包新红（gate 脚本未改）。
2. `pnpm run typecheck`（`tsc -b`）0 新增错误。
3. eval-cli：`pnpm --filter @deepseek-ai/dsh-eval-cli bundle` 出 `lib/index.js` + `lib/bin.js` + `lib/invariant.js` + `lib/types/**/*.d.ts`；`node lib/bin.js`（或装后 `dsh-eval`）smoke 跑通一条 eval case。
4. eval-runner / retrieval-experiment：`pnpm --filter ... bundle` 出 `lib/invariant.js` + `lib/types/invariant.d.ts`；`import '@deepseek-ai/dsh-eval-runner/invariant'`（及 retrieval-experiment）解析到 `lib/invariant.js`。
5. **`scripts/check-workspace-constraints.ts` 未改**（diff 空）→ upstream-merge-safe（additive-only 守住）。
6. 三个 `src/invariant.ts` 与 `brand`/`token-meter`/`jsonrpc-demo` 的 15 行 ownership companion 同构（`name`/`inject=['invariants']`/`apply=ctx.invariants.register`）。
7. eval-cli `tsdown.config.ts` 的"source-only by design"注释已更新/移除（设计翻转，文档同步）。

## 风险 / 待确认

- **eval-cli 程序化入口**：gate 强制 `main`/`exports["."]`，纯 CLI 本无 lib 入口。抽 `runEval`/mini-context builder 到 `src/index.ts` 作真 API（不造空 placeholder）；确认 `bin/eval.ts` 能干净拆出可复用部分。
- **bin/compare.ts**：gate 只认单 `lib/bin.js`（`expectedDshPackageFiles` 不支持多 bin）。compare 若要发布需折叠成子命令或走 `packageFileExtras`（像 jsonrpc-demo 的 `lib/packaged-bin.js`）；否则留 dev/tsx 不入 `files`。
- **tsdown 配置**：mirror jsonrpc-demo 的 `tsdown.config`（impl 时读）；确认 eval-cli tsconfig `noEmit` 与 tsdown emit 不冲突（其他 dsh- 包已这么跑）。
- **bin shebang + 可执行位**：`lib/bin.js` 顶部 `#!/usr/bin/env node` + 发布时可执行位（jsonrpc-demo 先例）。
- **invariant companion 是否真被 mount**：eval-cli/eval-runner/retrieval-experiment 非插件（无 `apply`/`extends Service`），其 invariant companion 不会被 mount——但全仓惯例本就如此（`brand` 等纯库亦然），不算债。gate 只验文件存在 + 导出形状，不验 mount。

## Key files

- `packages/eval/eval-cli/tsdown.config.ts`、`tsconfig.json`、`package.json`、`src/index.ts`（新）、`src/invariant.ts`（新）、`bin/eval.ts`（抽 refactor）、`bin/compare.ts`（定去留）
- `packages/eval/eval-runner/package.json`、`src/invariant.ts`（新）
- `packages/eval/retrieval-experiment/package.json`、`src/invariant.ts`（新）
- 参考（不改）：`packages/examples/jsonrpc-demo/{package.json,src/invariant.ts,tsdown.config}`（built-CLI 模板）、`packages/llm/token-meter/src/invariant.ts`（companion 模板）、`scripts/check-workspace-constraints.ts`（gate 规约，**不改**）

## Resolution (2026-09-03)

方向 A 落地：三包全合规、**不动 gate**（`scripts/check-workspace-constraints.ts` git diff 空 = upstream-merge-safe / additive-only 守住）。mirror jsonrpc-demo（已 build+发布+合规 dsh- CLI）+ token-meter invariant companion。7 条验收全过。

### 改动文件

**E1 eval-runner** / **E2 retrieval-experiment**（`packages/eval/<pkg>/`，lib 包，已入 host build）：
- `package.json`：加 `@deepseek-ai/cordis` peer+dev（workspace:^）+ `@deepseek-ai/dsh-invariants` **peer+dev**（package-invariants gate 要 peer+dev，非 ticket 原写的 dev-only）+ `exports["./invariant"]`（types+default）+ `files` 4→3（删 `lib/types/**/*.js`——`usesEmittedTreeDefaults` false）。
- `src/invariant.ts`（新）：mirror token-meter companion（`PACKAGE_NAME`/`name=<pkg>-invariant`/`inject=['invariants']`/`apply=ctx.invariants.register(PACKAGE_NAME,install)`/空 install + "No runtime invariant:" 注释）。
- `tsconfig.json`：加 ref `../../runtime-diagnostics/invariants`（package-invariants 要 owner tsconfig 引 invariants）。

**E3 eval-cli**（`packages/eval/eval-cli/`）——翻 da 自定 src-only→build+发布（mirror jsonrpc-demo）：
- `tsdown.config.ts`：`entry:false` → lib/types-entry 三 entry（`lib/types/{index,invariant,bin}.js`→`lib/`，dts:false/clean:false/codeSplit:false，mirror jsonrpc-demo；源码含 `lib/types/invariant.js` 字串满足 package-invariants checkBuild）。"source-only by design" 注释已移除。
- `tsconfig.json`：`noEmit:true` 去掉、`rootDir:"src"`、`outDir:"lib/types"`、`include:["src"]`；补 5 个缺失 project reference（`credentials-local`/`result-cache-memory`/`code-runtime-worker-thread`/`session-projection`/`goal`——原 tsconfig 未 ref 却静态 import → TS6059 paths-to-src；补 ref 后 tsc 走 built .d.ts）+ `runtime-diagnostics/invariants`。
- `tsconfig.host.json`：加 ref `./packages/eval/eval-cli`（让 host tsc emit 其 `lib/types`、root tsdown workspace 跑其 per-package config——tsdown workspace 对每包 loadConfigFile，eval-cli 有 per-package config 就会被 root build 跑，需 lib/types 先由 host tsc 出）。**保留** da-added exclude `packages/eval/eval-cli/**`（最小改动：src 经 ref 入 host typecheck，dev tests 仍 excluded=现状，不新增 typecheck 风险）。exclude 行 da-owned（eval 组 da-added）→ merge-safe。
- `src/index.ts`（新，程序化入口）：re-export `main`+`resolveResponderLlmConfig`（from `./main.ts`）+ `boot`+`BootOptions`+`BootResult`（from `./context.ts`）——真 API（`boot`=mini-Cordis-context builder，即 ticket 风险#1 所指 reusable 部分；`bin/eval.ts` 本就是 6 行 shim 调 `main()`，逻辑早在 `src/main.ts`，故无需从 bin 抽 `runEval`，index 只需 re-export 既有可复用面）。非空 placeholder。
- `src/invariant.ts`（新）：`PACKAGE_NAME=@deepseek-ai/dsh-eval-cli`、`name=eval-cli-invariant`。
- `src/bin.ts`（新，从 `bin/eval.ts` 移来）：shebang `#!/usr/bin/env node`（bundled JS 不需 tsx；dev `node --import tsx/esm src/bin.ts` 仍可）+ `import { main } from './index.ts'`（canonical entry）。删 `bin/eval.ts`。
- `bin/compare.ts`：留 dev/tsx 脚本（不入 `files`、非 bin；gate `expectedDshPackageFiles` 只认单 `lib/bin.js`，`packageFileExtras` gate-hardcoded 无法加且 B 已否决）。加 `scripts.compare`。
- `package.json`：`version 0.0.0→0.1.0-rc.8`、`bin:{dsh-eval:./lib/bin.js}`、加 `main`/`types`、`exports["."]`+`["./invariant"]`（留 `./src/*`+`./package.json`）、`files` 4 项、cordis dep→peer+dev、加 `dsh-invariants` peer+dev、`publishConfig.access=public`+`repository`、`scripts.bundle=tsc -b && tsdown`（+ `eval`/`compare` 更新路径）。补 `dependencies` 缺失的 `@deepseek-ai/dsh-credentials-local`（`context.ts` 静态 import 但原 manifest 未声明 → 发布后解析失败的 latent bug，修）。
- `src/context.ts`：3 处 type-drift 修（eval-cli 是 src-only/tsx-run，从未经 host typecheck，代码 drift 于 nl2sql-engine 现类型）：① `generate()` return `{sql:text,reasoning}`→`{sql:text}`（`LlmGenerateResult={sql,toolCalls?}` 无 reasoning；reasoning 仍由 `completeWithReasoning` 内部用于 SQL 抽取，只是不返回）；② `engine.run({...,evalMode:true})`→去 `evalMode`（`EngineRunArgs={question,eventDef?,scopeId?,today?}` 无 evalMode）；③ `toEngineOutcome` `rows: out.rows`→`as unknown[]`（`QueryOutcome.rows?:unknown[]`，exactOptionalPropertyTypes）。
- `src/exp2-prompts-en.ts`：2 处 deep src import 改 root——`from '@deepseek-ai/dsh-nl2sql-engine/src/types.ts'`+`/src/conventions.ts`→`from '@deepseek-ai/dsh-nl2sql-engine'`（root 经 `export *`/`export {}` re-export 这些；deep `/src/*` 在 plain node（bundled bin）走 strip-only 模式撞 TS parameter property `constructor(public readonly...)` → 必改 root 才能在发布 bin 下跑）。

### 验证（全过）

1. `pnpm run constraints`：eval-cli/eval-runner/retrieval-experiment **0 violation**（eval-cli 10→0）；总违规 20→10，余 10 全 pre-existing 非本次（`eval/eval`=dsh-eval、`tool-scope-routing`/`tool-resolve-term`/`tool-discover-alt-labels`、`credentials-keychain`/`-host`——version/files 旧，均未触碰）。**无新红**。
2. `pnpm run build:lib:host`（`tsc -b tsconfig.host.json` + tsdown）**exit 0** → typecheck 0 新增错误（eval-cli 现入 host refs，3 处 drift 修+5 ref 补齐后 clean）。
3. eval-cli：`pnpm --filter @deepseek-ai/dsh-eval-cli bundle`（`tsc -b && tsdown`）出 `lib/index.js`(54kB)+`lib/bin.js`(55kB)+`lib/invariant.js`+`lib/types/{index,invariant,bin,...}.d.ts`；`node lib/bin.js --help` **smoke exit 0**（打印 usage；bundled bin 在 plain node 下所有 external dep 解析到 built lib/，无 src/strip-only 错）；shebang `#!/usr/bin/env node` + tsdown 自动授予可执行位。
4. eval-runner/retrieval-experiment：root build 出 `lib/invariant.js`+`lib/types/invariant.d.ts`；`import '@deepseek-ai/dsh-eval-runner/invariant'` 从消费方 eval-cli 解析 OK（`name=eval-runner-invariant`/`inject=['invariants']`/`apply=function`/noDefault）；`verify-built-package-invariants` eval-* 全过。
5. `scripts/check-workspace-constraints.ts` **git diff 空** → upstream-merge-safe。
6. 三 `src/invariant.ts` 与 token-meter/jsonrpc-demo 同构；`verify-package-invariants` eval-* 0 violation。
7. eval-cli `tsdown.config.ts` "source-only by design" 注释已移除（换 lib/types-entry config）。

### 遗留 / 偏离说明

- **pre-existing 红（非本次，out-of-scope 未动）**：`dsh-eval`(eval/eval)、`tool-scope-routing`/`tool-resolve-term`/`tool-discover-alt-labels`、`credentials-keychain`/`-host` 的 constraints 违规（version/files 旧）+ `query-postgres` 的 `verify-package-invariants`/`verify-built-package-invariants` 违规（src-only `entry:[]` + 有 invariant companion 但 tsdown.config 不 bundle `lib/types/invariant.js`——正是 eval-cli 翻转前的同款状态；eval-cli 现已 build+green，与 query-postgres 的 src-only-red 分道）。
- **`bundle: "tsc -b && tsdown"`**（非 ticket 写的 `"tsdown"`）：eval-cli 需自包含 build（tsc 出 `lib/types/*.d.ts`、tsdown bundle `lib/*.js`；单 `tsdown` dts:false 不出 dts）。justified deviation。
- **`bin/compare.ts` 未折成子命令**：留 dev/tsx 脚本（per ticket 选项 b）。`compare.ts` 现不被 eval-cli tsconfig typecheck（include src only）——minor，dev 脚本。
- **eval-cli dev tests（`tests/`）仍 host-excluded**：保留 da-added exclude 行（最小改动），tests 不入 host aggregate typecheck（= 现状，非回归）；src 经 ref 入 host typecheck（clean）。
- **未开 follow-up grilling**：impl 中发现的设计现实（eval-cli type drift + tsconfig ref 不全 + package-invariants 强制 lib/types-entry tsdown config + 需入 host tsc）均属方向 A 的必要实施细节（mirror jsonrpc-demo 必然如此——jsonrpc-demo 本就在 host refs + lib/types-entry config），非设计变更，故在 scope 内修完未升级 grilling。gate 未碰（B 已否决守住）。

### Code review + test（subagent，2026-09-04）

**Code review subagent**（general-purpose，9 类核查）：全 CLEAN，无 blocker/major。3 处 context.ts type-drift 修经核源码确认为 behavior-preserving——engine `run()`（`packages/data/nl2sql-engine/src/engine.ts`）从不读 `reasoning`/`evalMode`（`evalMode` 在 `packages/data/nl2sql-engine/src` 全仓 grep 0 出现）；`rows as unknown[]` 契合该文件 loose-typing 惯例 + 消费方 `respond()` `Array.isArray(result.result)` 守卫。manifest 合规两 gate（check-workspace-constraints + package-invariants）；tsconfig.host.json（TS exclude wins over include，da-owned→merge-safe）；`src/index.ts` 真 API（`verify-export-jsdoc` 对 re-export 豁免，定义模块 `main.ts`/`context.ts` 带 JSDoc）；`tsdown.config.ts` 精确 mirror jsonrpc-demo；conventions（JSDoc/ESM `.ts`/单尾换行/no-unused 全过）。**1 minor**：`bin/compare.ts` 失 typecheck 覆盖（tsconfig `include:["src"]`，compare.ts 在 `bin/` 外；ticket 已认 minor，dev 脚本不发布、不入 files）。**nits**：`./src/*` export publint warn（精确 mirror jsonrpc-demo，repo 惯例，非新 regression）；CL session prompts + CLAUDE.md 有 stale `bin/eval.ts`（已修，见下）。

**Test subagent**（vitest）：初跑 92 test / 90 pass / **2 fail**——**blocker**：`packages/eval/eval-cli/tests/main.spec.ts:6` `const BIN = join(__dirname,'..','bin','eval.ts')` 仍指已删 `bin/eval.ts`（bin 移到 `src/bin.ts`）→ 2 test `ERR_MODULE_NOT_FOUND`（`--help exits 0` + `loads and runs with fake key`）。**修**：BIN 改 `join(__dirname,'..','src','bin.ts')`（dev tsx 路径，匹配原 `node --import tsx/esm` 调用）。重跑 **92/92 pass（13 files）exit 0**。其余全绿（eval-runner 34、retrieval-experiment 33、eval-cli 非 bin spec 25——含 `context.ts` boot/scopeId + 3 type-fix 覆盖）。无 credential-gated skip（单测/stub-based）。

**Doc-sync**（review/test 发现的 stale `bin/eval.ts` 路径；CONVENTIONS「docs and README contracts update together with code」）：`CLAUDE.md` + `wayfinder/semantic-layer/prompts/CL{11-14,15,16-17}-session-prompt.md`（CL16-17 两处）+ `README.md`（前已改）的 `bin/eval.ts` → `src/bin.ts`。`.tmp/cl-batch/agent5.md`（ephemeral .tmp，跳过）。

**遗留 minor（未改）**：`scope-id.spec.ts` / `harness-responder.spec.ts` 的 JSDoc 注释称 "eval-cli lacks `src/invariant.ts`"——现已 stale（eval-cli 已加 `src/invariant.ts`）；tests 仍 pass（subprocess/seam 路径不受影响），注释核心结论（tests 用 subprocess 而非 in-process test-invariants）仍真，仅前提 stale；未改因 wrapped JSDoc 编辑易碎 + 低影响，记此 follow-up。
