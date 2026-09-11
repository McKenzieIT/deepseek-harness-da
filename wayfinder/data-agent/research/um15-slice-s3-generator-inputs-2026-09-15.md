# UM15 首片 §3 — `scripts/generator-inputs.manifest.json` + spec（S3 交付，2026-09-15）

> **状态**：✅ **DONE** —— 17 个生成器逐个 `read_file` 实测，manifest + spec + 诚实边界已落盘。tip `12d02c7687`（干净）。
>
> 代码树 `/Users/mckenzie/workspace/dsh-resync`，tip `12d02c7687`（干净）。全部结论为 S3 亲自打开文件读出的行号，**未采信设计草案或 §6 记录的输入面表**（逐个 `read_file` 每个 `gen-*.ts` 自己确认）。

---

## §1 生成器清单：`ls scripts/gen-*.ts` × `package.json` `gen-*` scripts

### 1a. `scripts/` 目录下 `gen-*.ts`（含 spec，排除 spec 后 17 个生成器）

| # | 生成器 `.ts`（非 spec） | 行数 |
|---|---|---|
| 1 | `gen-architecture-graph.ts` | 435 |
| 2 | `gen-client-catalog.ts` | 557 |
| 3 | `gen-config-catalog.ts` | 918 |
| 4 | `gen-cordis-api.ts` | 9 |
| 5 | `gen-cordis-catalog.ts` | 1220 |
| 6 | `gen-cordis-inspect-catalog.ts` | 88 |
| 7 | `gen-doc-graphs.ts` | 1644 |
| 8 | `gen-evidence-query-typert.ts` | 44 |
| 9 | `gen-module-graph.ts` | 177 |
| 10 | `gen-persistence-catalog.ts` | 474 |
| 11 | `gen-schema-gateway-typert.ts` | 43 |
| 12 | `gen-scoped-events.ts` | 399 |
| 13 | `gen-session-format-catalog.ts` | 234 |
| 14 | `gen-third-party-notices.ts` | 784 |
| 15 | `gen-tool-catalog.ts` | 1144 |
| 16 | `gen-translation-brief.ts` | 316 |
| 17 | `gen-tsconfig-paths.ts` | 248 |

另有 7 个 `.spec.ts`（不计入生成器全集）：`gen-client-catalog.spec.ts`、`gen-cordis-catalog-partition.spec.ts`、`gen-cordis-catalog-record.spec.ts`、`gen-doc-graphs.spec.ts`、`gen-session-format-catalog.spec.ts`、`gen-third-party-notices.spec.ts`、`gen-tsconfig-paths.spec.ts`。

### 1b. `package.json` `gen-*` scripts（15 条，不含 `verify-*`）

`gen-translation-brief`(`:115`)、`gen-tsconfig-paths`(`:139`)、`gen-cordis-catalog`(`:141`)、`gen-cordis-api`(`:143`)、`gen-client-catalog`(`:145`)、`gen-cordis-inspect-catalog`(`:146`)、`gen-tool-catalog`(`:150`)、`gen-config-catalog`(`:152`)、`gen-doc-graphs`(`:154`)、`gen-persistence-catalog`(`:156`)、`gen-session-format-catalog`(`:158`)、`gen-third-party-notices`(`:160`)、`gen-module-graph`(`:162`)、`gen-architecture-graph`(`:163`)、`gen-scoped-events`(`:164`)。

### 1c. 差集

**在 `scripts/` 但不在 `package.json`**：`gen-evidence-query-typert.ts`、`gen-schema-gateway-typert.ts`。这两个是 typert 子生成器——它们被 `packages/typert/generator/src/` 下的代码调用（非 `pnpm run gen-*` 入口），不走 package.json script 路径。⚠ 调用方未核（待 §2 逐个确认时标注）。

**在 `package.json` 但不在 `scripts/`**：无。15 条 script 全部对应到 `scripts/gen-*.ts` 文件。

---

## §2 逐生成器输入面实测表

> **方法**：逐个 `read_file` 每个 `gen-*.ts`，找 `readFileSync` / `readdir` / `glob` / `scanRoot` / `TypeScriptProject` / tsconfig 闭包 / `import` 的数据文件。**不照抄草案。** 行号为 tip `12d02c7687` 实测。

| 生成器 | 输入路径/glob（verbatim file:line） | 输出产物 | `scanRoot` 参数化? | 写 zh/i18n? |
|---|---|---|---|---|
| **gen-cordis-api** | 无直接读取——9 行 shim，`import { main } from './gen-cordis-catalog.ts'`（`:6`）→ 调 `main()`（`:9`）。输入面 = gen-cordis-catalog 的输入面（见下） | = gen-cordis-catalog 的输出 | 继承 gen-cordis-catalog | 继承 |
| **gen-schema-gateway-typert** | `REPO_ROOT = resolve(import.meta.dirname, '..')`（`:14`）；`new WorkspaceTypertGenerator(REPO_ROOT).generate(['@deepseek-ai/dsh-schema-gateway'], ['host'])`（`:17-18`）→ **WorkspaceAnalyzer 闭包**：读 `tsconfig.host.json` + target 包 `packages/data/schema-gateway/src/**/*.ts` + 工作区 `package.json`（`workspace.ts:92` readFileSync manifestPath） | `packages/data/schema-gateway/lib/typert.{face}.js`+`.d.ts`；`typert.remote-client.{js,d.ts,d.ts.map}`（`:22-29`） | **否**——REPO_ROOT 硬编码 | 否（JS/d.ts） |
| **gen-evidence-query-typert** | 同上模式：`REPO_ROOT`（`:14`）；`WorkspaceTypertGenerator(REPO_ROOT).generate(['@deepseek-ai/dsh-evidence-query'], ['host'])`（`:17-18`）→ 同 WorkspaceAnalyzer 闭包；target 包 `packages/data/evidence-query/src/**/*.ts` | `packages/data/evidence-query/lib/typert.{face}.js`+`.d.ts`；`typert.remote-client.{js,d.ts,d.ts.map}`（`:22-31`） | **否** | 否 |
| **gen-cordis-inspect-catalog** | `root = resolve(import.meta.dirname, '..')`（`:9` 模块级）；`projectCordisCatalog(root, CORDIS_CATALOG_POLICY, 'client')`（`:62`）→ WorkspaceAnalyzer 闭包；import `CORDIS_CATALOG_POLICY` from `./gen-cordis-catalog.ts`（`:9`）；`--check` 时 readFileSync 目标文件比较（`:76-77`） | `packages/extensions/cordis-client-runner/src/client/api-catalog.ts`（`:10` CLIENT_OUT） | **否**——root 模块级，main() 直接用 | 否（TS 源码） |
| **gen-module-graph** | `root = resolve(import.meta.dirname, '..')`（`:11`）；`collectPackageGraph(scanRoot, GROUP_ORDER, 'gen-module-graph')`（`:109`）→ `package-graph.ts:37` `globSync('packages/*/*/package.json', {cwd:root})` 读所有工作区包 manifest | `docs/module-graph.md`(en)+`docs/module-graph.zh.md`(zh)+`docs/module-graph.i18n.yaml`(meta)（`translationPairPaths('docs/module-graph.md')` `:8,12`） | **是**——`computeModuleGraphOutputs(scanRoot=root)` `:105`、`writeModuleGraph(scanRoot=root)` `:119` 参数化（默认 root） | **是**——写三件 |

<!-- GEN-ROW-START -->
| **gen-translation-brief** | `root = resolve(import.meta.dirname, '..')`（`:38`）；read `scripts/translation-pairing.manifest.json`（`:39`）；read `docs/i18n/terminology.md`（`:40`）；`globSync('**/*.i18n.yaml', {cwd:root})`（`:210`）发现所有翻译对；`loadPair`（`:91`）read 每对 `.md`+`.zh.md`+`.i18n.yaml` 三件；`git cat-file -p <hash>`（`:63`）读 blob 历史；`git diff --no-index`（`:72`）；`briefDirection` read sourcePath + counterpartPath（`:228-229`） | stdout（briefing 文本）；`--apply` 写 `.zh.md` 或 `.md` 对端文件（`:186` writeFileSync） | **否**——root 模块级 | 是——读写翻译对三件 |
| **gen-tsconfig-paths** | `ROOT = fileURLToPath(new URL('..', import.meta.url))`（`:27`）；read `tsconfig.base.json`（`:224 readFileSync(CONFIG)`）；`workspacePackages()`（`:55`）`readdirSync(packages/*/*)` + read 每个 `package.json`（`:47`）；`existsSync(src)` `:62`；`existsSync(src/invariant.ts)` `:93` | `tsconfig.base.json` 的 BEGIN/END 标记区域（`:28-29` 标记，`:244 writeFileSync`） | **否**——ROOT 硬编码 | 否（tsconfig） |
| **gen-session-format-catalog** | `root = resolve(import.meta.dirname, '..')`（`:7`）；`readCurrentSessionFormatVersion(scanRoot=root)`（`:51`）read `packages/core/session/src/types.ts`（`:52`）匹配 `SESSION_FORMAT_VERSION`；`collectSessionFormatMigrations(scanRoot=root)`（`:65`）`globSync('packages/session/session-format-v*-to-v*/package.json', {cwd:scanRoot})`（`:70`）+ read 每个 manifest；read `packages/session/session-format-catalog/package.json`（`:131`）；read 每个 migration 包 manifest（`:175`） | `packages/session/session-format-catalog/src/generated.ts`（`:8 OUT`） | **是**——`:51,65` 参数化（默认 root） | 否 |
| **gen-scoped-events** | `root = resolve(import.meta.dirname, '..')`（`:18`）；`renderScopedEvents(projectRoot=root)`（`:361`）→ `new TypeScriptProject(projectRoot)`（`:365`）→ **整个 host-face TS Program 闭包**（tsconfig.host.json projectReferences）；扫描 `packages/*/*/src/**/*.ts`（`:68-70`）；读 `packages/core/scope/src/index.ts` 找 `scopeTarget` 和 `Scoped`（`:75,83`） | `packages/core/scope/src/scoped-events.generated.ts`（`:19 OUT`） | **是**——`:361 projectRoot` 参数化（默认 root） | 否 |
| **gen-architecture-graph** | `root = resolve(import.meta.dirname, '..')`（`:40` 硬编码）；`collectGraphData()`（`:394` **无参数**）→ `collectPackageGraph(root,…)`（`:395`）read `packages/*/*/package.json`；`collectFaceMembership(root,…)`（`:397`）read `tsconfig.host.json`+`tsconfig.client.json`（`:108-109` via `ts.readConfigFile`）；`new TypeScriptProject(root,'host')`（`:399`）→ **整个 host-face Program**；`collectRemoteAssembly(root)`（`:402`）read `packages/api/remotes/src/client/index.ts`（`:156`）；**⚠ `collectDeclaredDeps(pkgs)`（`:404` 调 → 定义约 `:248`）不收 root 参数，body 内 `readFileSync(resolve(root, pkg.rel, 'package.json'))` 用模块级 root——闭包捕获坑（§6 已证）** | `docs/architecture-graph.md`（`:41 OUT`，英文侧） | **否**——root 硬编码 `:40`，collectGraphData 无参数 | 否（只写英文 `.md`） |
| **gen-persistence-catalog** | `root = resolve(import.meta.dirname, '..')`（`:14`）；`collectLogEvents(scanRoot=root)`（`:176`）`globSync('packages/*/*/src/**/*.ts', {cwd:scanRoot})`（`:180`）+ readFileSync 每个 src（`:183`）+ `ts.createSourceFile` AST 解析（`:184`，**无 checker**）；`packageNameFor(rel,scanRoot)`（`:165`）read `packages/*/*/package.json`；`collectEventEnvelopeTypes(scanRoot=root)`（`:232`）同 glob；`collectSurfaceEventTypes(scanRoot=root)`（`:284`）同 glob；import `githubSlug` from `./verify-md-links.ts` | `docs/persistence-catalog.md`（`:15 OUT`）+ `packages/core/session/src/known-event-types.ts`（`:16 OUT_RUNTIME_TYPES`） | **是**——`:176,232,284` 三个 collect 函数均 `scanRoot=root` | 否（英文 `.md`+`.ts`） |
| **gen-client-catalog** | `root = resolve(import.meta.dirname, '..')`（`:22`）；`collectSlotEntries(scanRoot)`（`:148`，**无默认值**）→ `scanSlotFiles(scanRoot, SOURCE_GLOBS)`（`:149`）其中 `SOURCE_GLOBS=['packages/*/*/src/**/*.ts','packages/*/*/src/**/*.tsx']`（`:24-25`）；`indexExportedTypes(scanRoot, SOURCE_GLOBS)`（`:152`）；均 from `./slot-walk.ts`（**词法扫描，无 TS checker**）；import `./slot-walk.ts` 的 `declaredTypes`/`slotDeclarations`/`slotRegistrations`/`standardKitMembers` 等 | `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`（`:23 OUT`） | **是**——`:148 scanRoot` 参数化但**无默认值**（caller 必须传，main 传 root）；不在 §6 的 6 个有默认值的列表里 | 否（`.ts` 源码） |
| **gen-third-party-notices** | `root = resolve(import.meta.dirname, '..')`（`:17`）；read 各包 `package.json`（`:119`）；read YAML license 声明（`:136` yaml.load）；`globSync(pattern, {cwd:root})` license 文件（`:155`）；`readdirSync(virtual)` node_modules（`:254`）；read node_modules 下的 `package.json`（`:256,262,285,303`）；read `vendor/README.md`（`:444`）；`readdirSync(vendor)`（`:446`）；`globSync('python/*/pyproject.toml', {cwd:root})`（`:587`）；read `pnpm-workspace.yaml`（`:594`）；**⚠ 需 `pnpm install`——读 `node_modules` 树** | `THIRD_PARTY_NOTICES.md`（`:18 OUT`） | **否**——root 硬编码 `:17` | 否（根目录 `.md`） |
| **gen-config-catalog** | `root = resolve(import.meta.dirname, '..')`（`:17`）；`collectConfigCatalog(scanRoot=root)`（`:616`）`globSync('packages/*/*/package.json', {cwd:scanRoot})`（`:625`）+ read manifest（`:627`）；`loadFile(resolve(scanRoot, entryRel))` read `packages/*/*/src/index.ts`（`:647`）+ `ts.createSourceFile` AST（`:106`，**无 checker**）；`loadRelative` 跟相对 import 读更多源码（`:290`）；`declForTypeName` 解析 workspace 包 import + re-export 链（`:300`）；import `LINK_MAP` from `./gen-cordis-catalog.ts`（`:14`） | `docs/config-catalog.md`（`:18 OUT`） | **是**——`:616 scanRoot=root`（§6 `:625` 指 globSync 行） | 否（英文 `.md`） |
| **gen-tool-catalog** | `root = resolve(import.meta.dirname, '..')`（`:120`）；⚠ **运行时 boot**——import 全部 tool 包 + 运行时依赖（`:7-117` 约 110 行 import），`collectToolCatalog()`（`:1000`）对每个 `TOOL_PACKAGES` 条目在 fresh Context 上 boot 插件、harvest schema（**非静态文件扫描**）；`assertManifestComplete(scanRoot=root)`（`:959`）`globSync('packages/*/tool-*', {cwd:scanRoot})`（`:960`）只验覆盖 | `docs/tool-catalog.md`（`:121 OUT`） | **部分**——仅 `assertManifestComplete` `:959` 有 `scanRoot=root`；核心 `collectToolCatalog` 无 scanRoot（运行时 boot） | 否（英文 `.md`） |
| **gen-cordis-catalog** | `root = resolve(import.meta.dirname, '..')`（`:43`）；`computeOutputs()`（`:1048` **无参数**）→ `projectCordisCatalog(root, CORDIS_CATALOG_POLICY)`（`:1049`）→ **WorkspaceAnalyzer 闭包**（整个 workspace TS program）；`contextMergeFiles(root, ['packages/*/*/src/**/*.ts','*.tsx'])`（`:1057`）read 源码提取 Context key / Event name；每 subsystem 页 read `.md`+`.zh.md` 双侧（`:1089-1094`）；`localizePageRegion(scanRoot=root)` read `scripts/translation-pairing.manifest.json`（`:956-959`）；`maybeRecordPair(scanRoot=root)`（`:1124`）read+write `.i18n.yaml`；import `renderCordisCoreApiPages` from `./cordis-core-api.ts`（`:36`）；export `CORDIS_CATALOG_POLICY`（被 gen-cordis-inspect/gen-doc-graphs/gen-config-catalog import） | `docs/cordis-api/inherited.md`（`:45`）+ `packages/extensions/tool-cordis/src/api-catalog.ts`（`:46`）+ `docs/subsystems/*.md`(en)+`.zh.md`(zh) 双侧 + `.i18n.yaml`(meta)（per `SERVICE_PAGE`/`EVENT_SCOPE_PAGE` 映射） | **部分**——`:956,1124` 有 `scanRoot=root`；核心 `computeOutputs()` `:1048` 无参数用模块级 root | **是**——读写 `.md`+`.zh.md`+`.i18n.yaml` 三件 |
| **gen-doc-graphs** | `root = resolve(import.meta.dirname, '..')`（`:22`）；`renderDocs()`（`:1578`）→ `collectPackageGraph(root,…)`（`:1579`）read `packages/*/*/package.json`；`projectCordisCatalog(root, CORDIS_CATALOG_POLICY)`（`:1580`）→ WorkspaceAnalyzer 闭包；`collectEventRelations()`（`:1353`）`new TypeScriptProject(root)`（`:1351`）→ host-face Program + `collectPackageSources` 扫 `packages/*/*/src/**/*.ts`（`:1341`）；`parseExampleCordis(rel)` read 示例文件（`:897`）；import `CORDIS_CATALOG_POLICY` from `./gen-cordis-catalog.ts`（`:16`）；`APP_EXAMPLES` curated 常量 | `docs/graph-atlas.md`+`docs/capability-seams.md`+`docs/event-producer-consumer.md`+`docs/agent-lifecycle.md`+`docs/tool-execution-pipeline.md`+`apps/cli/composition.md`（`:1581-1585,1594`） | **否**——root 硬编码 `:22` | 否（**只写英文侧**，§6 已证） |

---

## §3 `scripts/generator-inputs.manifest.json` 全文

> 基于上表实测，非草案。每条记录生成器读哪些输入、写哪些输出，使「输入变了但没 regen」可被检测。

```jsonc
{
  "$schema": "internal:scripts/generator-inputs.manifest.json",
  "$comment": "Input surface registry for all 17 gen-*.ts generators (excluding .spec.ts).",
  "$comment2": "Inputs are repo-relative globs or literal paths the generator reads. Outputs are repo-relative paths it writes. 'closure' inputs (WorkspaceAnalyzer/TypeScriptProject) list the tsconfig entry point + source glob; the real input face is the full TS program — see §5.",

  "gen-architecture-graph": {
    "inputs": [
      "packages/*/*/package.json",
      "tsconfig.host.json",
      "tsconfig.client.json",
      "packages/*/*/src/**/*.ts",
      "packages/api/remotes/src/client/index.ts"
    ],
    "outputs": [
      "docs/architecture-graph.md"
    ],
    "script": "gen-architecture-graph",
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "collectDeclaredDeps(pkgs) at ~:248 captures module-level root, not a parameter — the --rev trap (§6). collectGraphData() takes no scanRoot."
  },

  "gen-client-catalog": {
    "inputs": [
      "packages/*/*/src/**/*.ts",
      "packages/*/*/src/**/*.tsx"
    ],
    "outputs": [
      "packages/extensions/cordis-client-runner/src/client/slot-catalog.ts"
    ],
    "script": "gen-client-catalog",
    "parameterizedScanRoot": true,
    "writesI18nTriple": false,
    "notes": "collectSlotEntries(scanRoot) at :148 has scanRoot but NO default value (caller must pass). Lexical scan via slot-walk.ts, no TS checker."
  },

  "gen-config-catalog": {
    "inputs": [
      "packages/*/*/package.json",
      "packages/*/*/src/index.ts",
      "packages/*/*/src/**/*.ts"
    ],
    "outputs": [
      "docs/config-catalog.md"
    ],
    "script": "gen-config-catalog",
    "parameterizedScanRoot": true,
    "writesI18nTriple": false,
    "notes": "collectConfigCatalog(scanRoot=root) at :616. AST-only (ts.createSourceFile, no checker). Follows relative imports + workspace re-export chains."
  },

  "gen-cordis-api": {
    "inputs": [],
    "outputs": [],
    "script": "gen-cordis-api",
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "9-line shim: import { main } from './gen-cordis-catalog.ts' and calls it. Input/output face = gen-cordis-catalog's face."
  },

  "gen-cordis-catalog": {
    "inputs": [
      "tsconfig.host.json",
      "packages/*/*/src/**/*.ts",
      "packages/*/*/src/**/*.tsx",
      "scripts/translation-pairing.manifest.json",
      "docs/subsystems/*.md",
      "docs/subsystems/*.zh.md"
    ],
    "outputs": [
      "docs/cordis-api/inherited.md",
      "packages/extensions/tool-cordis/src/api-catalog.ts",
      "docs/subsystems/*.md",
      "docs/subsystems/*.zh.md",
      "docs/subsystems/*.i18n.yaml"
    ],
    "script": "gen-cordis-catalog",
    "parameterizedScanRoot": false,
    "writesI18nTriple": true,
    "notes": "computeOutputs() at :1048 takes no scanRoot; localizePageRegion(:956) and maybeRecordPair(:1124) have scanRoot=root. Writes .md+.zh.md+.i18n.yaml per subsystem page. Exports CORDIS_CATALOG_POLICY consumed by 3 other generators."
  },

  "gen-cordis-inspect-catalog": {
    "inputs": [
      "tsconfig.host.json",
      "packages/*/*/src/**/*.ts"
    ],
    "outputs": [
      "packages/extensions/cordis-client-runner/src/client/api-catalog.ts"
    ],
    "script": "gen-cordis-inspect-catalog",
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "projectCordisCatalog(root, CORDIS_CATALOG_POLICY, 'client') at :62. root module-level. Imports CORDIS_CATALOG_POLICY from gen-cordis-catalog.ts."
  },

  "gen-doc-graphs": {
    "inputs": [
      "packages/*/*/package.json",
      "tsconfig.host.json",
      "packages/*/*/src/**/*.ts"
    ],
    "outputs": [
      "docs/graph-atlas.md",
      "docs/capability-seams.md",
      "docs/event-producer-consumer.md",
      "docs/agent-lifecycle.md",
      "docs/tool-execution-pipeline.md",
      "apps/cli/composition.md"
    ],
    "script": "gen-doc-graphs",
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "No scanRoot param. Uses collectPackageGraph + projectCordisCatalog + TypeScriptProject. Only writes English side (§6 confirmed). Imports CORDIS_CATALOG_POLICY from gen-cordis-catalog.ts."
  },

  "gen-evidence-query-typert": {
    "inputs": [
      "tsconfig.host.json",
      "packages/data/evidence-query/src/**/*.ts"
    ],
    "outputs": [
      "packages/data/evidence-query/lib/typert.*.js",
      "packages/data/evidence-query/lib/typert.*.d.ts",
      "packages/data/evidence-query/lib/typert.remote-client.js",
      "packages/data/evidence-query/lib/typert.remote-client.d.ts",
      "packages/data/evidence-query/lib/typert.remote-client.d.ts.map"
    ],
    "script": null,
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "NOT in package.json scripts. WorkspaceTypertGenerator(REPO_ROOT).generate([TARGET_PKG], ['host']) at :17-18. REPO_ROOT hardcoded. Writes to lib/ (generated artifacts, .gitignored)."
  },

  "gen-module-graph": {
    "inputs": [
      "packages/*/*/package.json"
    ],
    "outputs": [
      "docs/module-graph.md",
      "docs/module-graph.zh.md",
      "docs/module-graph.i18n.yaml"
    ],
    "script": "gen-module-graph",
    "parameterizedScanRoot": true,
    "writesI18nTriple": true,
    "notes": "computeModuleGraphOutputs(scanRoot=root) at :105, writeModuleGraph(scanRoot=root) at :119. main() at :155 passes module-level root. Writes .md+.zh.md+.i18n.yaml three files via translationPairPaths."
  },

  "gen-persistence-catalog": {
    "inputs": [
      "packages/*/*/src/**/*.ts",
      "packages/*/*/package.json"
    ],
    "outputs": [
      "docs/persistence-catalog.md",
      "packages/core/session/src/known-event-types.ts"
    ],
    "script": "gen-persistence-catalog",
    "parameterizedScanRoot": true,
    "writesI18nTriple": false,
    "notes": "collectLogEvents(scanRoot=root) at :176, collectEventEnvelopeTypes(scanRoot=root) at :232, collectSurfaceEventTypes(scanRoot=root) at :284. AST-only (ts.createSourceFile, no checker)."
  },

  "gen-schema-gateway-typert": {
    "inputs": [
      "tsconfig.host.json",
      "packages/data/schema-gateway/src/**/*.ts"
    ],
    "outputs": [
      "packages/data/schema-gateway/lib/typert.*.js",
      "packages/data/schema-gateway/lib/typert.*.d.ts",
      "packages/data/schema-gateway/lib/typert.remote-client.js",
      "packages/data/schema-gateway/lib/typert.remote-client.d.ts",
      "packages/data/schema-gateway/lib/typert.remote-client.d.ts.map"
    ],
    "script": null,
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "NOT in package.json scripts. WorkspaceTypertGenerator(REPO_ROOT).generate([TARGET_PKG], ['host']) at :17-18. REPO_ROOT hardcoded. Writes to lib/ (generated artifacts, .gitignored)."
  },

  "gen-scoped-events": {
    "inputs": [
      "tsconfig.host.json",
      "packages/*/*/src/**/*.ts",
      "packages/core/scope/src/index.ts"
    ],
    "outputs": [
      "packages/core/scope/src/scoped-events.generated.ts"
    ],
    "script": "gen-scoped-events",
    "parameterizedScanRoot": true,
    "writesI18nTriple": false,
    "notes": "renderScopedEvents(projectRoot=root) at :361. TypeScriptProject(root,'host') builds full Program. main() uses default root."
  },

  "gen-session-format-catalog": {
    "inputs": [
      "packages/core/session/src/types.ts",
      "packages/session/session-format-v*-to-v*/package.json",
      "packages/session/session-format-catalog/package.json"
    ],
    "outputs": [
      "packages/session/session-format-catalog/src/generated.ts"
    ],
    "script": "gen-session-format-catalog",
    "parameterizedScanRoot": true,
    "writesI18nTriple": false,
    "notes": "readCurrentSessionFormatVersion(scanRoot=root) at :51, collectSessionFormatMigrations(scanRoot=root) at :65. main() at :189 uses default root."
  },

  "gen-third-party-notices": {
    "inputs": [
      "packages/*/*/package.json",
      "pnpm-workspace.yaml",
      "vendor/README.md",
      "vendor/*",
      "python/*/pyproject.toml",
      "node_modules/**/package.json"
    ],
    "outputs": [
      "THIRD_PARTY_NOTICES.md"
    ],
    "script": "gen-third-party-notices",
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "Requires pnpm install (reads node_modules tree). No scanRoot param. root hardcoded at :17."
  },

  "gen-tool-catalog": {
    "inputs": [
      "packages/*/tool-*/package.json",
      "packages/*/tool-*/src/**/*.ts"
    ],
    "outputs": [
      "docs/tool-catalog.md"
    ],
    "script": "gen-tool-catalog",
    "parameterizedScanRoot": true,
    "writesI18nTriple": false,
    "notes": "RUNTIME BOOT generator: collectToolCatalog() at :1000 imports and boots each tool plugin on a fresh Context to harvest schemas — not a static file scan. assertManifestComplete(scanRoot=root) at :959 only checks on-disk coverage. Input face is effectively the entire compiled package graph + node_modules."
  },

  "gen-translation-brief": {
    "inputs": [
      "scripts/translation-pairing.manifest.json",
      "docs/i18n/terminology.md",
      "**/*.i18n.yaml",
      "**/*.md",
      "**/*.zh.md"
    ],
    "outputs": [
      "<stdout>",
      "**/*.zh.md",
      "**/*.md"
    ],
    "script": "gen-translation-brief",
    "parameterizedScanRoot": false,
    "writesI18nTriple": true,
    "notes": "Discovers out-of-sync pairs via globSync('**/*.i18n.yaml'). --apply writes counterpart files. Uses git cat-file/diff (spawnSync). root module-level at :38."
  },

  "gen-tsconfig-paths": {
    "inputs": [
      "tsconfig.base.json",
      "packages/*/*/package.json",
      "packages/*/*/src/invariant.ts"
    ],
    "outputs": [
      "tsconfig.base.json"
    ],
    "script": "gen-tsconfig-paths",
    "parameterizedScanRoot": false,
    "writesI18nTriple": false,
    "notes": "ROOT = fileURLToPath(new URL('..', import.meta.url)) at :27. workspacePackages() readdirSync + readFileSync. Writes to marked BEGIN/END region of tsconfig.base.json."
  }
}
```

---

## §4 spec 全文

> 照抄 `verify-doc-budgets.ts` 的 manifest 读取模式（`resolve(import.meta.dirname,'..')` + `JSON.parse(readFileSync(...))`）+ `gen-tsconfig-paths.spec.ts` 的 vitest 结构。

```typescript
/**
 * Verify scripts/generator-inputs.manifest.json: every non-spec gen-*.ts file
 * is registered, every registered script name exists in package.json (or is
 * null for the two typert generators not wired as scripts), and every listed
 * output artifact exists on disk. The manifest is the registry that makes
 * "input changed but not regenerated" detectable; this spec pins its shape.
 *
 * Manifest-reading pattern follows scripts/verify-doc-budgets.ts:
 *   const root = resolve(import.meta.dirname, '..')
 *   JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<...>
 *
 * Test structure follows scripts/gen-tsconfig-paths.spec.ts.
 */
import { existsSync, globSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const MANIFEST_PATH = resolve(root, 'scripts/generator-inputs.manifest.json')

interface GeneratorEntry {
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  readonly script: string | null
  readonly parameterizedScanRoot: boolean
  readonly writesI18nTriple: boolean
  readonly notes: string
}

type Manifest = Readonly<Record<string, GeneratorEntry>>

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest

const generatorFiles: readonly string[] = globSync('scripts/gen-*.ts', { cwd: root })
  .map(path => basename(path))
  .filter(name => !name.endsWith('.spec.ts'))
  .sort()

const generatorNames: readonly string[] = generatorFiles.map(file => file.replace(/\.ts$/, ''))

const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
const packageScripts: ReadonlySet<string> = new Set(Object.keys(packageJson.scripts ?? {}))

describe('generator-inputs.manifest.json', () => {
  it('registers every non-spec gen-*.ts file (no extras, no missing)', () => {
    const registered = Object.keys(manifest).sort()
    expect(registered).toEqual([...generatorNames].sort())
  })

  it('every registered script name is a real package.json script (or null)', () => {
    for (const [name, entry] of Object.entries(manifest)) {
      if (entry.script === null) continue
      expect(
        packageScripts.has(entry.script),
        `${name}: script "${entry.script}" is not in package.json scripts`,
      ).toBe(true)
    }
  })

  it('every listed output artifact exists on disk (literal or glob-matched)', () => {
    for (const [name, entry] of Object.entries(manifest)) {
      for (const output of entry.outputs) {
        if (output === '<stdout>') continue
        if (output.includes('*')) {
          const matches = globSync(output, { cwd: root })
          expect(
            matches.length > 0,
            `${name}: output glob "${output}" matched nothing`,
          ).toBe(true)
        } else {
          expect(
            existsSync(resolve(root, output)),
            `${name}: output "${output}" does not exist`,
          ).toBe(true)
        }
      }
    }
  })

  it('the two typert generators (not in package.json) have script: null', () => {
    expect(manifest['gen-evidence-query-typert']?.script ?? '').toBeNull()
    expect(manifest['gen-schema-gateway-typert']?.script ?? '').toBeNull()
  })

  it('gen-cordis-api (shim) has empty inputs/outputs (delegates to gen-cordis-catalog)', () => {
    const shim = manifest['gen-cordis-api']
    expect(shim).toBeDefined()
    expect(shim?.inputs.length ?? 1).toBe(0)
    expect(shim?.outputs.length ?? 1).toBe(0)
  })
})
```

---

## §5 诚实边界

### §5.1 亲自打开确认的（17/17 生成器全文已 read_file）

全部 17 个非 spec 的 `gen-*.ts` 文件均已逐个 `read_file` 或 `sed -n` 关键段落。行号为 tip `12d02c7687` 实测。`package.json` 全量 164 条 scripts 已 grep（§1b）。`verify-doc-budgets.ts`、`gen-tsconfig-paths.spec.ts`、`doc-budgets.manifest.json`、`package-graph.ts` 关键行已读。`packages/typert/generator/src/cordis-catalog.ts:365-400`、`workspace.ts:1-80` 关键段已读。

### §5.2 ⚠ 未核 / 不确定项

1. **WorkspaceAnalyzer 闭包（gen-cordis-catalog/gen-cordis-inspect-catalog/gen-doc-graphs）**：`projectCordisCatalog(root, policy)` → `WorkspaceAnalyzer({root, …}).discoverPackages()/analyzeInBatches()/indexSourceDeclarations()`。实际输入面 = `tsconfig.host.json` 的 `projectReferences` 闭包解析出的**全部** `packages/*/*/src/**/*.ts` + TS 内置 `lib.*.d.ts`。manifest 中列 `tsconfig.host.json`+`packages/*/*/src/**/*.ts` 是**必要不充分**近似——真实输入面远大于字面 import。**判断依据**：§6 实测 `new TypeScriptProject(root,'host') → ts-project.ts:96 ts.createProgram(...)` 建 Program 需 `tsconfig.host.json` 的 `projectReferences` 闭包（§6 §7.2 第 10 条）。

2. **WorkspaceTypertGenerator 闭包（gen-schema-gateway-typert/gen-evidence-query-typert）**：同上——`WorkspaceTypertGenerator(REPO_ROOT).generate([TARGET_PKG], ['host'])` 经 `WorkspaceAnalyzer` 建 Program。输入面不只是 target 包的 src，而是整个 host-face program。manifest 中列 `tsconfig.host.json`+`packages/data/<pkg>/src/**/*.ts` 是近似。

3. **gen-tool-catalog 运行时 boot**：`collectToolCatalog()` import 并 boot 全部 tool 插件（`:7-117` 约 110 行 import），输入面 = **整个编译后的包图 + node_modules**。manifest 中列 `packages/*/tool-*/src/**/*.ts` 只覆盖了 boot manifest 覆盖检查（`assertManifestComplete`）；实际输入远大于此。

4. **gen-third-party-notices node_modules 遍历**：`:254 readdirSync(virtual)` + `:256,262,285,303` 多路径读取。manifest 中列 `node_modules/**/package.json` 是简化——实际遍历逻辑（`:254-310` 段）我没逐行读，可能涉及 pnpm 虚拟存储符号链接结构。⚠ 需 `pnpm install`——这是唯一一个需要 install 才能跑的生成器（§6 已证 gen-architecture-graph 只需 node_modules 不需 build）。

5. **gen-cordis-catalog 输出页清单**：manifest 列 `docs/subsystems/*.md` 等通配。实际页由文件内 curated `SERVICE_PAGE` / `EVENT_SCOPE_PAGE` 映射表决定。我读了 `:1048-1100` 但没枚举映射表的具体 key→page 条目（文件 1220 行，映射表在中间某处）。输出通配是安全近似。

6. **gen-doc-graphs `APP_EXAMPLES`**：`:1582 ...APP_EXAMPLES.map(example => ({ rel: example.rel, ...}))`。我写了 `apps/cli/composition.md` 作为输出，但没读 `APP_EXAMPLES` 常量定义（文件 1644 行，常量在 `:25-?` 或某处）。`apps/cli/composition.md` 是从 `renderIndex` 的 `labels` 表（`:1599`）反推的。

7. **gen-cordis-catalog `renderCordisCoreApiPages`**：从 `./cordis-core-api.ts` import（`:36`）。我没读 `cordis-core-api.ts`——它的输出并入 `main()` 的 `outputs`（`:1158 ...renderCordisCoreApiPages()`）。这些额外输出不在 manifest 中。⚠

8. **gen-cordis-catalog `contextMergeFiles`**：`:1057` 调用 `contextMergeFiles(root, ['packages/*/*/src/**/*.ts', '*.tsx'])` from `./cordis-walk.ts`。我没读 `cordis-walk.ts` 确认它的 glob 参数格式，但从 call site 直接看到 glob 模式。

9. **manifest + spec 未经 tsc/oxlint/vitest 验证**：按铁律「只读」，我没有跑 build/check/vitest。spec 代码按 `tsconfig.base.json`（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）和 `.oxlintrc.json:153-181`（scripts/** 规则）手写，但**未实测**。不确定项：
   - `JSON.parse(...) as Manifest` 是否过 `no-unsafe-*`（oxlint 允许 `as` 断言到具体接口？）
   - `globSync` 返回类型在 `@types/node` v24 下的签名（是否 `string[]`，是否 readonly）
   - `expect(manifest[...]?.script ?? '').toBeNull()` 是否过 `no-unnecessary-condition`（`?? ''` 后再 `toBeNull()` 可能被标为不可达）

10. **§6 行号对照**（旧 tip → 今 `12d02c7687`）：
    | §6 记录 | 今实测 | 差异 |
    |---|---|---|
    | gen-config-catalog `:625` | collectConfigCatalog `:616`，globSync `:625` | §6 指 globSync 行，今仍 `:625` ✅ |
    | gen-module-graph `:118,130` | computeModuleGraphOutputs `:105`，writeModuleGraph `:119`，globSync `:109` | 偏移 ~-11 行 |
    | gen-persistence-catalog `:176` | collectLogEvents `:176` | ✅ 精确 |
    | gen-session-format-catalog `:51,68,117` | `:51` readCurrentSessionFormatVersion ✅，`:65` collectSessionFormatMigrations（`:70` globSync），第三 `:117` 可能对应 `:131` catalog readJson | 部分偏移 |
    | gen-tool-catalog `:960` | assertManifestComplete `:959`，globSync `:960` | ✅ 精确 |
    | gen-architecture-graph `:40,394,409,248` | `:40` root ✅，`:394` collectGraphData ✅，`:404` collectDeclaredDeps call，定义约 `:248` | ✅ 一致 |

### §5.3 未覆盖

- **4 个 `.spec.ts` 文件本身**（gen-client-catalog/gen-cordis-catalog-partition/gen-cordis-catalog-record/gen-doc-graphs/gen-session-format-catalog/gen-third-party-notices/gen-tsconfig-paths 的 spec）——不在本节范围，它们测生成器逻辑，不测 manifest。
- **`scripts/` 下的辅助模块**（`package-graph.ts`/`ts-project.ts`/`cordis-walk.ts`/`cordis-core-api.ts`/`slot-walk.ts`/`translation-pairing.ts`/`translation-brief.ts`/`jsdoc.ts`/`verify-md-links.ts`/`translation-pairing-git.ts`/`translation-pairing-record.ts`）——只读了 `package-graph.ts` 的 I/O 行和 `ts-project.ts` 的 §6 记录。它们的输入面通过 caller 的 glob 参数间接覆盖，但辅助模块本身可能读额外路径。

---

> **增量写进度**：✅ 17/17 生成器已落盘。manifest + spec + 诚实边界已填。
