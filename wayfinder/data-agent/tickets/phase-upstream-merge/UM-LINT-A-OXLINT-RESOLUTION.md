# UM-LINT-A-OXLINT-RESOLUTION — oxlint typeAware 为何把 Cordis inject 的 `ctx` 解成 `error` 类型（option (A) 诊断）

**Type**: research · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
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
