# UM-LINT-A-OXLINT-RESOLUTION — oxlint typeAware 为何把 Cordis inject 的 `ctx` 解成 `error` 类型（option (A) 诊断）

**Type**: research · **Status**: resolved (2026-09-11, 根因证实 + (F) 落地，gate 全绿) · **Phase**: upstream-merge
**Assignee**: —（已收口 2026-09-11）
**Blocked by**: —（可立即认领；read-only 诊断，resync 树安全）
**Blocks**: [UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md) 的落地形式 + [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 的 `check:ci:lint:contracts-ready` 门
**Graduated from**: [UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md) Resolution（2026-09-11 用户选 (A)）

## Question

`pnpm run lint:contracts-ready`（`tsx scripts/run-oxlint.ts .`，`.oxlintrc.json` `typeAware: true`）在 resync 树报 **92 errors**，其中 **83 条（90%）** 是 `no-unsafe-call` / `no-unsafe-member-access` / `no-unsafe-assignment` / `no-unsafe-argument` / `no-unsafe-return`，诊断文字统一是 "of an **`error` typed** value"；而 `tsc -b tsconfig.client.json` = **0 errors**。

**要查的是：oxlint 的 type-aware 解析器为什么把 Cordis `inject` 注入的 `ctx`（及其 service handle）解成 `error` 类型，而 tsc 解得出来。** 「error typed」在 typescript-eslint/oxlint 语义里几乎总意味着**解析失败**（unresolved import / 缺 type / 看不到 augmentation），不是真的类型不安全——所以这是可诊断的配置或能力问题，不是代码缺陷。

候选假设（需逐一证实/证伪，**带证据**）：

1. **`paths` 指向问题**：`tsconfig.base.json` 的 `paths` 把 `@deepseek-ai/cordis` 指到 `./vendor/cordis/src`（源码）而非 built `lib/types`。oxlint 是否跟随这份 `paths`？它读的是哪个 tsconfig（`run-oxlint.ts` 传了什么）？
2. **project reference 未被跟随**：oxlint 的 type-aware 引擎（tsgolint / typescript-go 系）是否解析 `references`？若不解析，跨 project 的类型就会退化。
3. **typert 生成的 `.d.ts` module augmentation 不可见**：Cordis 的 `ctx.X` 是靠 `declare module` 接口合并注入的。若 oxlint 的 program 不含那些 augmentation 文件，`ctx.X` 必然解不出。
4. **oxlint 能力边界**：以上都不是 → 该规则族在本仓的 DI 形状下不可用。

## 判据 / 产出

- 至少定位到「oxlint 看到的 program 与 tsc 看到的 program 差在哪」的**具体一处**（哪个文件/哪条 path/哪个 augmentation 不可见），或证明是 oxlint 上游能力缺失（附 issue/文档链接）。
- 若可修：给出配置 patch（改 `.oxlintrc.json` / `run-oxlint.ts` / tsconfig 传参），并复测 92 → 期望大幅下降。
- 若不可修：**按已预先约定的兜底执行 (C)** ——把 `no-unsafe-*` 这族从 typeAware 集合移除（一行 config），并把结论记进 GA-FORK-CI 总账。**不要**退回 (B)（83 条 disable directive）——用户 2026-09-11 已明确否掉。

## 已有证据（勿重导）

- 92 条的 raw capture + per-rule 分布 + FP/REAL 分桶：`/tmp/lint-resync-wf.txt`(764 行) / `/tmp/slint2-summary.md` / `/tmp/slint2-pairs.txt`（若 /tmp 已清，重跑 `pnpm run lint:contracts-ready` on resync 即可复现 92）。
- per-rule：no-unsafe-call 35 / no-unsafe-member-access 23 / no-unsafe-assignment 15 / no-unsafe-argument 6 / no-unsafe-return 4 / no-unnecessary-type-assertion 4 / max-len 2 / unbound-method 1 / no-unnecessary-condition 1 / no-deprecated 1。
- 集中在 `packages/client/ui-*/src/client/`：ui-semantic-layer 18 / ui-chat/apply 18 / ui-model-selection 12 / experimental client-ui-agent-team/mount 11 / ui-goal 6。
- 触发形状：`ctx.sessions.scopeOf()` / `ctx.sessions.binding()` / `sessions.list.subscribe()` —— 全是经 Cordis `inject` 拿到的 service/store handle。
- `.oxlintrc.staged.json`（lefthook staged gate，`typeAware: false`）实测 0 errors → 只影响 full/CI 门，不阻塞日常提交。
- **`pnpm run lint` = `build:lib:host && lint:contracts-ready`**，但 build **非 load-bearing**：`tsconfig.base.json` paths 指 `./src`，oxlint 从源码解析类型。诊断时可直接跑 `lint:contracts-ready`，不必 build。

## 独立于本票的 REAL 修复（9 条，可另开票或顺带）

83 条 FP 之外还有 7 REAL + 2 BORDERLINE，与 (A)/(C) 的选择**无关**，不该被本票挡住：
- `no-unnecessary-type-assertion` × 4：**语义，勿 auto-strip**（`ctx as never` 强制 overload 分支、`output.rows as JsonValue[][]` variance carve-out）。
- `max-len` × 2：机械换行（144/148 > 140）。
- `no-deprecated` × 1：`scripts/gen-architecture-graph.ts:192` `isTypeOnly` → `phaseModifier` 迁移。
- BORDERLINE × 2：`gen-architecture-graph.ts:147` unbound-method、`:254` no-unnecessary-condition。

## Resolution — 2026-09-11：根因 = tsgolint 不做 project-reference 输出重定向；(A) 成功，(C) 未启用

**结论一句话**：81 条（不是 83）`no-unsafe-*` 的根因**不是** Cordis DI 解析失败，而是 **tsgolint 把 host 与 client 两侧的 Cordis `Context` augmentation 合并进了同一个 program**，触发 `TS2717` 属性冲突，冲突后的属性退化为 `error` 类型并级联。**一行 tsconfig 配置根治**，预先约定的兜底 (C) **没有启用**，(B) 也没有。

### 根因（逐条带证据，非推测）

1. **冲突本身** —— 全仓仅 **3 个** Context 属性在两面同名而异型：

   | 属性 | host | client |
   |---|---|---|
   | `sessions` | `SessionStore`（`packages/core/session/src/index.ts:35`） | `ISessions`（`packages/api/session-controller/src/client/index.ts:80`） |
   | `cordisInspect` | `CordisInspectRegistryService` | `ClientCordisInspectRegistry` |
   | `dynamicCordisRunner` | `DynamicCordisRunnerService` | `CordisRunnerFace` |

   用 `tsc` 直接确认（把两面塞进一个 program 的最小探针）：
   `error TS2717: Subsequent property declarations must have the same type. Property 'sessions' must be of type 'SessionStore', but here has type 'ISessions'.`

2. **合并后 host 类型赢** —— 于是 client 独有成员在 client 代码里"不存在"。`oxlint --type-check` 自己招供（同一 program，非外部推断）：
   ```
   TS2339: Property 'open' does not exist on type 'SessionStore'.
   TS2339: Property 'subscribe' does not exist on type '() => Session[]'.
   TS2339: Property 'binding' does not exist on type 'SessionStore'.
   ```
   实测 `open`/`scopeOf`/`binding` 均**不在** host `SessionStore` 上 → `error` 类型 → 81 条级联。

3. **因果实验（决定性）** —— 把 **host** 侧 `sessions: SessionStore` 改名，client 文件 `ui-semantic-layer/src/client/index.ts` 从 **18 → 0 errors**。改 host 的声明能治好 client 的诊断，只可能因为 host 文件确实在 client 文件的 program 里。

4. **为什么 `tsc` 干净** —— `tsc -p packages/client/ui-semantic-layer/tsconfig.json --listFiles` = **412 文件**，里面**既没有** `packages/core/session/src/index.ts`，**也没有** 它的 `lib/types/index.d.ts`（唯一进来的 `core/session/lib/types/types.d.ts` 不含那段 augmentation）。tsc 走 project reference → 消费**编译产物**，两面天然隔离。这正是 root `tsconfig.json` 注释保护的东西：*"`files: []` keeps it program-less, so the host/client cordis Context merges never meet"* / *"NEVER flatten this solution into a single ts.Program"*。

5. **tsgolint 走的是另一条路** —— 它硬编码 `UseSourceOfProjectReference: true`（tsserver 语义，`internal/utils/create_program.go:80`），顺 `paths` 直接进 `src`。泄漏链已定位（7 跳）：
   ```
   client 文件 → @deepseek-ai/dsh-api-remotes/client → ../types.ts → remote-events.ts
             → 【host】evidence-query → semantic-layer → audit → core/session/src/index.ts
   ```
   6 个受影响 client 包全部命中同一形状，不是单点坏 import。

### 四个候选假设的裁定

| 假设 | 裁定 |
|---|---|
| 1. `paths` 指向问题 | **部分成立**——`paths`→`src` 确实是泄漏路径，但它本身不是 bug，tsc 用同一份 `paths` 却被 reference 重定向截断 |
| 2. project reference 未被跟随 | **成立，且是根因**——精确形式是「reference 的**输出重定向**未实现」。旁证：`tsgolint --tsconfig tsconfig.json --list-files`（root solution，`files: []`）→ `linted 0 files`，即 references 不被展开成 program |
| 3. typert `.d.ts` augmentation 不可见 | **否**——augmentation 完全可见，问题恰恰相反：**两面都可见**才冲突 |
| 4. oxlint 能力边界 | **否**（这是本票最重要的更正）——存在可用旋钮，见下。**故 (C) 不该执行** |

### 无 oxlint 侧旋钮（逐个证伪，勿重试）

| 尝试 | 结果 |
|---|---|
| `oxlint --tsconfig <client / host / per-package>` | **无效**，三种都仍是 18 条。官方文档明写 type-aware *does not* respect it，且该 flag 计划废弃（[oxc#20328](https://github.com/oxc-project/oxc/issues/20328)） |
| `.oxlintrc.json` 指定 tsconfig | **不存在此键**——`OxlintOptions` 仅 `denyWarnings` / `maxWarnings` / `reportUnusedDisableDirectives` / `respectEslintDisableDirectives` / `typeAware` / `typeCheck` |
| tsgolint 自己的 `--tsconfig` | **存在但不可达**：oxlint 只向 `tsgolint headless` 传 `-debug/-fix/-fix-suggestions/-trace/-cpuprof/-heap/-allocs`，stdin payload 无 tsconfig 字段 |
| 让 tsgolint 读 root solution | **不跟随 `references`** → 空 program |

上游立场（[tsgolint#817](https://github.com/oxc-project/tsgolint/issues/817)、[#845](https://github.com/oxc-project/tsgolint/issues/845)、[#852](https://github.com/oxc-project/tsgolint/issues/852) 皆 closed not-planned）：「我们复刻你编辑器的 tsconfig 发现逻辑，请用 project references 表达意图」。

### 落地的修法 (F)：一行 `disableSourceOfProjectReferenceRedirect`

typescript-go 把源码重定向挂在一个 tsconfig 选项上（`internal/compiler/program.go:49`）：
```go
func (p *ProgramOptions) canUseProjectReferenceSource() bool {
	return p.UseSourceOfProjectReference && !p.Config.CompilerOptions().DisableSourceOfProjectReferenceRedirect.IsTrue()
}
```

**改动 = `tsconfig.base.client.json` 加 `"disableSourceOfProjectReferenceRedirect": true`（含 6 行原因注释）。**

放 `tsconfig.base.client.json` 而不是 `tsconfig.base.json`，因为：受影响的 **11 个包全部** `extends ../../../tsconfig.base.client.json`（已逐个核对），所以 client-only 放法覆盖全部病灶，而 **host 树一个字节都不受影响**；且实测比全仓放法**少 2 条**报告（16 vs 18）。

### 实测（resync `4d4f725748` + 本次改动）

| 阶段 | full gate | `error`-typed 残留 | 备注 |
|---|---|---|---|
| 基线 | **92 errors** / 0 warnings | 81 | 复现无误 |
| (C′) client 面抑制 `no-unsafe-*`（**已弃用**） | 11 errors / **8 warnings** | 0 | 8 warning = 8 条既有**合法** suppression 变 unused |
| (F) 放 `tsconfig.base.json` | 18 errors / 0 warnings | 0 | host+client `tsc -b` 皆 EXIT 0 |
| **(F) 放 `tsconfig.base.client.json`（采纳）** | **16 errors** / 0 warnings | **0** | |
| **(F) + 修完 16 条真实项** | **0 errors / 0 warnings** | 0 | `tsc -b host` = 0，`tsc -b client` = 0 |

### 92 条构成的精确重算（更正本票与 UM-LINT-TYPEAWARE-CORDIS 的记账）

- **81 条**（不是 83）= 冲突级联，全部 `error`-typed，全部落在 client face 11 个文件。
- **11 条**（不是 9）= 独立真实项。本票原先把 2 条**真** `any`（`gen-architecture-graph.ts:147/150`）算进了 83 条 FP 里 —— 判据是诊断文字：`error`-typed 是冲突，`any`-typed 是真问题。
- 修完 (F) 后真实项从 11 变 **16**：**多出 5 条是之前被 `error` 类型盖住的真问题**，(F) 让它们显形（`result-cache/src/client/service.ts` 6 条真 `any`、`ui-user-questions/src/client/index.ts:61` 一条多余断言）。**这是 (F) 相对任何抑制方案的净收益：不是少报，是多报。**

### 16 条真实项的修复（全部根因修复，**零** disable directive）

- `scripts/gen-architecture-graph.ts` 5 条 → 实为 2 个根因 + 1 次 API 迁移：`ts.readConfigFile` 返回的 `any` 被灌进一个 `unknown` 参数的校验 helper（并删掉原先 `as { path: string }[]` 的假断言）；`ts.sys.readFile` 用箭头包裹（仓库既有 house pattern，见 `scripts/project-reference-faces.ts:74` 等 4 处）；`isTypeOnly` → `phaseModifier === ts.SyntaxKind.TypeKeyword`（TS 6.0.3 `typescript.d.ts:5530-5539`，token union 非 boolean）。
  ⚠ `:254` 的 `no-unnecessary-condition` 根因是**一个说谎的 cast**：`as Record<string, string>[]` 抹掉了 `| undefined`，才让 `?? {}` 看起来多余。删 cast 后守卫重新变成必要的 —— 一处改动同时消掉两条诊断，且运行时字节等价。
- `packages/client/result-cache/src/client/service.ts` 5 条真 `any` → 缺 `import type {} from '@deepseek-ai/dsh-api-session-controller/client'`。原注释声称该 merge 由 api-remotes 带入，**是错的**：api-remotes 只 re-export session-controller 的 `/remote` 与 `/types` 面，不含 `interface Context { sessions }`。缺它 → `ctx.get('sessions')` 落到 cordis 的 `get(name: string): any` overload。零 cast。
- 4 条 `no-unnecessary-type-assertion` **全部安全删除**，逐条查过，**旧票"语义、勿 strip"的判断在这 4 处均不成立**：
  - `ui-settings-models` ×2 的 `ctx as never`：同一文件另有 **8 处** `as never` 未被报，因为那些的表达式是裸对象字面量；规则只报手里已经拿着完整 `Context` 的这 2 处 —— 信号自洽。
  - `tool-compute:170` 的 `output.rows as JsonValue[][]` **不是 variance carve-out**：仓库自己的笔记 `wayfinder/data-agent/prompts/next-session-2026-09-10-phase-c-integration.md:7` 记着它是 **auto-merge 残留**，只因恰好能编译才留着；且 `@deepseek-ai/dsh-util-values` **根本不在** tool-compute 的 `package.json` 里（未声明依赖泄漏）。已连带删掉 unused import 并重写注释。
  - `ui-user-questions:61` 的 `(ctx.sessions as ISessions)` —— 这条断言**本来就是为绕开本票这个 bug 才写的**，根因修掉后自然多余。
- 2 条 `max-len` → 纯换行。**已证明为纯格式**：忽略全部空白后与 HEAD 逐字节相同。

### 门接线（(F) 的必要配套）

`disableSourceOfProjectReferenceRedirect` 让 tsgolint 消费**编译产物**，所以 **client 声明成为 lint 的前置**。已实测失败模式：藏掉 `packages/api/session-controller/lib` 后，单个 client 文件从 0 → **23 errors**。而 `lib/` 在 `.gitignore:4`、入库 0 个文件 → CI fresh checkout 上不存在。

改动（`scripts/run-gates.ts:326`）：`lintGate({ needs: ['typert-contracts'] })` → `lintGate({ needs: ['typecheck'] })`。
`typecheck` = `build:lib:host && tsc -b tsconfig.client.json`，正是两面声明的产出者；无环（`typert-contracts → typecheck → lint → build`，而 `build` 本就 `needs: ['typecheck','lint','doc-typecheck']`，所以**不能**反向让 lint 依赖 build）。已对全部 **17 个 mode** 做拓扑验证：全部无环。
同步改 `scripts/run-gates.spec.ts`（把 lint 从 `needs: ['typert-contracts']` 的循环里摘出，另加显式断言）与 `package.json` 的 `lint` / `lint:fix`（插入 `typecheck:contracts-ready`）。`ci-consumers` 那条路径无需改 —— 它的 `lint-and-duplication` 本就 `needs: validatedBuild`。

### 本次改动清单（resync 树，未 push）

`tsconfig.base.client.json`（+1 选项）· `scripts/run-gates.ts` · `scripts/run-gates.spec.ts` · `package.json` · `scripts/gen-architecture-graph.ts` · `packages/client/result-cache/src/client/service.ts` · `packages/client/ui-user-questions/src/client/index.ts` · `packages/client/ui-settings-models/tests/{components,provider-form}.client.spec.tsx` · `packages/data/tool-compute/src/index.ts` · `packages/credentials/credentials-keychain-host/src/index.ts` · `packages/query/query-maxcompute/tests/per-scope-data-source.spec.ts` · `docs/architecture-graph.md`（regen）

### 门禁复验

`lint:contracts-ready` **0 errors / 0 warnings** · `tsc -b tsconfig.host.json` EXIT 0 · `tsc -b tsconfig.client.json` EXIT 0 · `run-gates.spec.ts` **86/86 通过** · `verify-architecture-graph` up to date · `verify-module-graph` 3 up to date · `verify-doc-graphs` 6 up to date · `verify-cordis-catalog` 99 up to date · `verify-md-links` 1730 files EXIT 0

### 遗留 / 代价（诚实记账）

1. **IDE 代价**：`tsconfig.base.client.json` 同时被 tsserver 读取，所以 **client 面**跨包「跳转到定义」会落在 `lib/types/*.d.ts` 而非源码，且 fresh clone 未 build 时 client 包在编辑器里会报未解析。host 面不受影响。这是 (F) 不可避免的代价，已知情接受。
2. **`docs/architecture-graph.md` 必须随本次改动一起提交** —— `tool-compute` 删掉 `JsonValue` import 后少了一条 type-only 边。已 regen 并核对：diff **恰好一行**。
3. **`packages/data/tool-compute/tsconfig.json` 仍 reference `../../util/values`**，现已不被使用（无害，未动）。
4. **pre-existing 测试失败（非本次引入）**：`packages/credentials/credentials-keychain-host/tests/host.spec.ts` 的 "gates the per-user→global fallback off in stable mode" 挂在 `src/index.ts:147` 的 `parseCredentialsDocument`（"uses the pre-release flat layout"）。两重证据：subagent 做过 A/B（还原 :221 后同样只挂这一条）；且本次对该文件的改动**忽略全部空白后与 HEAD 逐字节相同**。**未开票**，需要时另立。
5. **`verify-translation-pairing` 全量仍 EXIT 1** —— 全是 `README.zh.md` 的 wrong-locale link，属交接 prompt 已记的 A 类 pre-existing 翻译债（归 parallel-dev-cleanup/R1），与本票无关；`docs/architecture-graph.md` 无 `.zh.md` 配对，不受影响。

### 毕业出的新票

诊断副产物（与本票机制无关的独立缺陷）：**[UM-LINT-B-UNMATCHED-PROGRAMS](UM-LINT-B-UNMATCHED-PROGRAMS.md)** —— 56 个文件不被任何 tsconfig 认领，落进 tsgolint 的 option-less inferred program（无 `paths`/无 `strict`）被静默漏检；其中 **7 个落在严格 type-aware override 内**（6 个 `eval-cli/tests/*.spec.ts`，因 `tsconfig.host.json` 的 `exclude` 整包排除了 eval-cli 而该包自己只 `include: ["src"]`；1 个 typert `fixtures/remote-model` 的 `.d.ts`，因 `.oxlintrc.json` 只 ignore 了 `type-model`）。
