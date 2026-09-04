# GA-QUERY-POSTGRES-impl — query-postgres src-only→build 合规（mirror eval-cli E3）

**Type**: task  ·  **Phase**: misc  ·  **Status**: Pending  ·  **Claim**: wayfinder work-the-map session · 2026-09-04
**Source**: [GA-GRILL-query-postgres-compliance resolution](GA-GRILL-query-postgres-compliance.md)（2026-09-04 grilling 锁定方向 A，全合规、不动 gate）
**Priority**: high
**Blocked by**: 无

## Question

实施 GA-GRILL-query-postgres-compliance 锁定的方向 A：让 `@deepseek-ai/dsh-query-postgres` 满足 `verify-package-invariants` + `verify-built-package-invariants`（owner 须真产 `lib/invariant.js`），**不改 `scripts/check-workspace-constraints.ts` / `scripts/package-invariants.ts` / `scripts/verify-built-package-invariants.mjs`**（保 additive-only / upstream-merge-safe）。

## 背景（grilling 查到的现实）

- query-postgres 的 manifest / tsconfig / `tsconfig.host.json` ref / `src/invariant.ts` **全已由 GA-AUDIT1（2026-09-03）落地合规**。唯一缺：`tsdown.config.ts` `entry:[]`（src-only）→ tsdown 不 bundle → `lib/invariant.js` 不产 + tsdown.config 源码不含 `lib/types/invariant.js` 字串 → `verify-package-invariants` 红 + `verify-built` 红（owner 缺文件）。
- `constraints`（dsh- gate）对 query-postgres **已绿**（manifest 全合规）——本票不动 manifest。
- 比 eval-cli E3 **更简**：eval-cli 翻转前还缺 version/manifest/tsconfig refs/src/index.ts；query-postgres 连这些都已就绪，**只差 tsdown flip 一个文件**。
- mirror eval-cli E3 + jsonrpc-demo 的 tsdown lib/types-entry 模式（`entry:['lib/types/*.js']`+`outDir:'lib'`+`dts:false`+`clean:false`+`codeSplit:false`）。
- typert `./src/*` 约束对 query-postgres vacuous（无现存消费者 + typert gate 不在验证集 + typert 经 `paths` 解析 source 与 lib 产物无关 + query-postgres 本就已是 composite）。详见 grilling 票。

## Scope

### Q1: 翻 `packages/query/query-postgres/tsdown.config.ts` `entry:[]`→lib/types-entry bundle

照 `packages/eval/eval-cli/tsdown.config.ts` + `packages/examples/jsonrpc-demo/tsdown.config.ts` 模板（query-postgres 是 lib 无 bin → 2 entry：index + invariant，无 bin/packaged-bin）：

```ts
import { defineConfig } from 'tsdown'

/** Builds each published entry as a self-contained file admitted by the package whitelist. Mirrors `@deepseek-ai/dsh-eval-cli` / `@deepseek-ai/dsh-sdk-jsonrpc-demo`. */
export default defineConfig([
  {
    entry: ['lib/types/index.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, outputOptions: { codeSplitting: false }, dts: false, clean: false,
  },
  {
    entry: ['lib/types/invariant.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, outputOptions: { codeSplitting: false }, dts: false, clean: false,
  },
])
```

- **移除** "Source-only package... wiring as composite project breaks the typert WorkspaceAnalyzer's `./src/*` cross-package resolution, so it stays source-only by design" 注释（设计已翻——grilling 证 typert 约束对 query-postgres vacuous）。
- `entry:['lib/types/invariant.js']` 字串满足 `package-invariants` `checkBuild`（源码须含 `lib/types/invariant.js`）。
- `clean:false` 保 tsc 先 emit 的 `lib/types/*.d.ts`（tsdown 跑在 tsc 后；`clean:true` 会 wipe）。
- tsdown workspace per-package loadConfigFile 跑此 config（query-postgres 已在 `tsconfig.host.json` references → `lib/types` 由 host tsc 先出 → root build 不断）。

**不改**：`package.json`（manifest 已合规）、`tsconfig.json`（已 emit + ref invariants）、`tsconfig.host.json`（已 ref query-postgres line 204）、`src/invariant.ts`（已合规）、`src/index.ts`/`src/conventions.ts`/`src/conventions.yaml`（不动）。

## 验收标准

1. `pnpm run constraints` → query-postgres **0 violation**（维绿；无新红——pre-existing 簇不动）。
2. `pnpm run verify-package-invariants` → query-postgres **0 violation**（tsdown.config 含 `lib/types/invariant.js` 字串）。
3. `pnpm run verify-built-package-invariants` → query-postgres **0 failure**（`lib/invariant.js` 产 + staged import 加载 name/inject/apply 成功）。
4. `pnpm run typecheck`（`npm run build:lib:host && tsc -b tsconfig.client.json`）exit 0（无新 typecheck 错——query-postgres 已在 host refs + tsconfig 已 emit + src 不改）。
5. `pnpm run build:lib:host` 出 `packages/query/query-postgres/lib/index.js` + `lib/invariant.js`（from `lib/types/*.js`）；`node -e "import('./lib/invariant.js').then(m=>console.log(m.name,m.inject))"` smoke（name=`query-postgres-invariant`、inject 含 `invariants`、apply=function）+ `node -e "import('./lib/index.js').then(m=>console.log(typeof m.default))"` smoke（PostgresQueryEngine class 可加载——module top-level 不调 `getConventions`，不触发 yaml）。
6. **gate 脚本 git diff 空**（`scripts/check-workspace-constraints.ts` + `scripts/package-invariants.ts` + `scripts/verify-built-package-invariants.mjs` 均未改）→ upstream-merge-safe（additive-only 守住）。

## 风险 / 待确认

- **`conventions.ts` yaml 张力**（known limitation，grilling 已记）：built `lib/index.js` 调 `getConventions('postgres')` 经 `import.meta.url` 找 `lib/conventions.yaml`（不存在）。pre-existing（src-only 设计本为 src-channel；翻前 `lib/index.js` 已 phantom）+ gate 不测 + 无现存消费者 + `./src/*` channel 仍工作 + 与 maxcompute 同款。本票 smoke 不调 `getConventions`（只 import module 加载）。若未来消费者需 built-lib `getConventions`，开 follow-up。
- **`lib/index.js` 现存于 disk（9/4 02:16）**：可能是并行 build 产物 / 拋留。tsdown flip 后重 build 会覆盖。`lib/` gitignored，不涉 git。git status 确认 query-postgres source 无未提交改动（无并行 session 编 source）。

## Key files

- `packages/query/query-postgres/tsdown.config.ts`（**唯一改动**）
- 参考（不改）：`packages/eval/eval-cli/tsdown.config.ts`（E3 flip 模板）、`packages/examples/jsonrpc-demo/tsdown.config.ts`（built-CLI/lib 模板）、`scripts/package-invariants.ts`（owner/checkBuild 规约，**不改**）、`scripts/verify-built-package-invariants.mjs`（runtime import 规约，**不改**）、`scripts/check-workspace-constraints.ts`（dsh- gate 规约，**不改**）

## Resolution (2026-09-04)

方向 A 落地：query-postgres 翻 src-only→build+bundle，**不动 gate**（三个 gate 脚本 git diff 空 = upstream-merge-safe / additive-only 守住）。mirror eval-cli E3 / jsonrpc-demo。**Status: Resolved.**

### 改动文件

**唯一改动**：`packages/query/query-postgres/tsdown.config.ts`——`entry:[]`（src-only + "wiring as composite breaks typert `./src/*`" 注释）→ `defineConfig([{entry:['lib/types/index.js'],...},{entry:['lib/types/invariant.js'],...}])`（mirror eval-cli/jsonrpc-demo：`outDir:'lib'`/`dts:false`/`clean:false`/`codeSplit:false`/`format:['esm']`/`platform:'node'`/`target:'es2024'`）。注释更新——记 design flip + typert `./src/*` vacuous 理据（无现存消费者 + typert 经 `tsconfig.base.json` `paths` 解析 source 与 lib 产物无关 + query-postgres 本就已是 composite）+ 指向本票。

manifest / `tsconfig.json` / `tsconfig.host.json` ref / `src/invariant.ts` / `src/index.ts` / `src/conventions.ts` / `src/conventions.yaml` **全未动**（GA-AUDIT1 已落地合规）。`tsconfig.host.json` 无需加 ref——query-postgres 早于 line 204 在 references（GA-AUDIT1 落地时已加），故 tsdown workspace per-package loadConfigFile 跑其 config 时 `lib/types` 已由 host tsc 先出 → root build 不断。

### 验证（全过）

1. `pnpm exec tsdown`（per-package）出 `lib/index.js`(5154B) + `lib/invariant.js`(1009B)（from `lib/types/*.js`，tsc host emit）；`lib/types/*.d.ts` 由 `clean:false` 保住。
2. smoke `lib/invariant.js`：`name=query-postgres-invariant` / `inject=["invariants"]` / `apply=function` / `hasDefault=false` ✓（verify-built staged import 的同款检查）；`lib/index.js` 产 5154B（不 runtime-import——它 import `@deepseek-ai/dsh-query`，后者亦 src-only 无 built lib/index.js，pre-existing 非 本次）。
3. `pnpm run constraints`：query-postgres **0 violation**（manifest 维绿；12 总违规全 pre-existing 非 query-postgres：credentials-keychain/-host、tool-discover-alt-labels/tool-resolve-term/tool-scope-routing、eval/eval、client/schema-form+web-react 层级）。
4. `pnpm run verify-package-invariants`：**0 violation**——"262 hand-owned package companion(s) conform"（query-postgres 从"1 violation（tsdown.config 缺 `lib/types/invariant.js` 字串）"→0；tsdown.config 源码现含该字串为 entry）。
5. `pnpm run verify-built-package-invariants`：query-postgres **0 failure**（`lib/invariant.js` 产 + staged import 加载成功——从"Cannot find module .../lib/invariant.js"→pass；30 总 failure 全 pre-existing 非-owner 簇"manifest does not publish ./invariant"：dsh-query/dsh-query-maxcompute/dsh-query-tool/dsh-admin/…）。
6. `pnpm run typecheck`（`build:lib:host && typecheck:contracts-ready` = `tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host && tsc -b tsconfig.client.json`）**exit 0**（tsdown host phase 跑 query-postgres per-package config clean；query-postgres 已在 host refs + tsconfig 已 emit + src 不改 → 0 新 typecheck 错）。
7. gate 脚本 git diff 空：`scripts/check-workspace-constraints.ts` + `scripts/package-invariants.ts` + `scripts/verify-built-package-invariants.mjs` 均 0 改动 → upstream-merge-safe（additive-only 守住）。

### 遗留 / 偏离说明

- **known limitation（记，不阻塞）**：`conventions.ts` 的 yaml 经 `import.meta.url` 旁路解析（`resolve(dirname(fileURLToPath(import.meta.url)),'conventions.yaml')`）——built `lib/index.js`（conventions 代码 inline）调 `getConventions('postgres')` 会找 `lib/conventions.yaml`（不存在；yaml 在 `src/conventions.yaml`，`files` 不含，`expectedDshPackageFiles` gate-hardcoded 无法加）。pre-existing 设计张力（src-only 设计本为 `./src/*` channel yaml 工作；翻前 `lib/index.js` 已是 phantom broken-as-published）+ gate 不测（verify-built 只 import `lib/invariant.js` 不碰 conventions；typecheck 不 run）+ 无现存消费者调 `getConventions` + `./src/*` channel 仍工作 + 与 `dsh-query-maxcompute` 同款。**净改善**（phantom→实文件）。若未来消费者需 built-lib `getConventions`，开 follow-up（`conventions.ts` 改 inline yaml-as-string / `?raw` import，或 gate 加 `packageFileExtras` for yaml——后者碰 core 须 grilling）。
- **pre-existing 红（非本次，out-of-scope 未动）**：constraints 的 credentials-keychain/-host、tool-discover-alt-labels/tool-resolve-term/tool-scope-routing、eval/eval、client/schema-form+web-react 层级；verify-built 的 ~30 非-owner"manifest does not publish ./invariant"簇（dsh-query/dsh-query-maxcompute/dsh-query-tool/dsh-admin/…——src-only 或未加 invariant companion 的包，与本票 query-postgres 的 owner-缺-build 不同款；要修须逐个加 companion+build 或改 core gate 豁免非-owner，皆 out-of-scope）。
- **`lib/index.js` disk 状态**：翻前 9/4 02:16 已有 5142B 拋留/并行 build 产物（`lib/` gitignored 不显于 git status）；翻后 9/4 09:53 tsdown 覆盖为 5154B。git status 确认 query-postgres source 无未提交改动（无并行 session 编 source；唯 `tsdown.config.ts` 是本 session 改）。
- **dirty-state 并发（非本 session，commit 不 stage）**：`packages/eval/eval-cli/src/context.ts` M（GA-EVAL-CLEAN-RERUN fix——移 duplicate EnvCredentialProvider mount，typecheck 验证有效非 break）、`pnpm-lock.yaml` M、`wayfinder/data-agent/research/experiment-audit-log.md` M、12 个 `.agents/notes/proposed/simplification/*` ??、`GA-GRILL-eval-manifests.md` ??（上 session 未提交 grill 票）——皆非本 session sole-author 文件。
- **`bundle` script 未加**：query-postgres 是 lib（非 CLI），与 E1/E2 的 eval-runner/retrieval-experiment 同（靠 root `build:lib:host` 构 build，无 per-package `scripts.bundle`）；eval-cli 加 `bundle` 因它是 CLI 需自包含 build。本票用 `pnpm exec tsdown` 替代 `pnpm --filter ... bundle`（criterion 意图"产 lib/* + smoke"等价满足）。
