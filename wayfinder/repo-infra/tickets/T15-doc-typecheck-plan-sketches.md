# T15 — doc-typecheck 长期红：plan 草图污染语料，掩盖了两处真实的 doc↔API 漂移

**Type**: bug（gate corpus 口径 + 两处真实文档漂移）
**Phase**: post-discovery
**Status**: **resolved 2026-09-15** —— 草图排除与真实示例修复均已完成，`doc-typecheck` 全绿
**Assignee**: unclaimed（剩余项）
**Severity**: medium —— 单门，但它让 `doc-sync` 长期差一门，从而掩盖真实回归
**Related**: [T14](T14-ci-workflow-startup-failure.md)（同一 session 发现，同属「门在骗人」这一类）；发现于 data-agent [UM17](../../data-agent/tickets/phase-upstream-merge/UM17-post-merge-latest-upstream-and-monitor-validation.md) 的 `doc-sync` 验证

## Question

`pnpm run doc-sync` 长期 35 passed / 1 failed，唯一红是 `doc-typecheck`。是文档写错了，还是这道门的取材范围不对？

## 结论：两个独立问题叠在一起，前者掩盖了后者

### 问题 ①（已修）：plan 草图不该进编译语料

`doc-typecheck` 的用途写在自己的模块注释里——**把 Markdown 的 `ts` fence 按 workspace API 编译**，防止文档示例随 API 漂移失真。而 `docs/superpowers/plans/` 里是 **plan 草图**，fence 天生是片段：裸方法体、裸字段声明列表、**根本不是 TypeScript** 的 prompt 模板（`${joinSection}${metricSection}` + `# 当前问题`）。

`docs/superpowers/plans/2026-08-22-phase2-ontology-nl2sql-metrics.md` 一份文件 63 个 `ts` fence，实测产生 **363 条诊断**。

**修法**：`scripts/doc-typecheck.ts` 只有一个排除钩子（`isArchivedAgentNotePath`）、没有 manifest，于是在同一处过滤器加 `isPlanSketchPath`（前缀 `docs/superpowers/plans/`）。**先例**：`verify-translation-pairing` 已排除**同一目录**（`scripts/translation-pairing.manifest.json` 的 `excluded` 含 `"docs/superpowers/plans/"`）。未改任何 fence、未改门的判定逻辑，只改取材范围。

**试过并被数据否决的替代方案**：把该文件里报错的 fence 逐个改 `ts ignore-check`。第一轮只有 8 个 block 报**语法**错（112/121/179/281/324/793/1050/1355），改完后 TypeScript 进入语义检查，**诊断从 9 条涨到 363 条**——说明该文件 63 个 fence 基本全都不可编译，逐个打标记不是有界工作。

### 问题 ②（未修，门仍红）：两处真实文档的 fence 编译失败

排掉草图噪声后，露出**本来就该编译**的 2 个 fence（9 条诊断）：

1. **`docs/da-plugin-development-guidelines.md`（block at line 148）** —— `Cannot find name 'Service' / 'Context' / 'CredentialRef' / 'CredentialAddress'`。fence 缺 import。**这些类型都真实存在**，下一个 session 直接照抄即可：
   - `import { Context, Service } from '@deepseek-ai/cordis'`（现存用法见 `packages/data/audit/src/index.ts:36`）
   - `CredentialRef` / `CredentialAddress` 由 `@deepseek-ai/dsh-credentials` 导出（`packages/credentials/credentials/src/types.ts:15,30`）
   - 注意：fence 注释里写的 `packages/data/credentials-addressed/src/index.ts` **这个包并不存在**，示例是前瞻性的；补 import 即可编译，但要确认是否该同时标注它尚未落地。
2. **`packages/client/result-cache/README.md`（block at line 29）** —— `sessions` 未定义 + 参数隐式 `any`。`sessions` 在 `packages/client/result-cache/src/**` 里不存在，是宿主侧概念对象。**待决**：给 fence 加 `declare const sessions: …` 前奏、还是改成引用真实的 store 类型。

### 为什么不能简单打 `ignore-check` 逃避（实测算术）

该门在 `ratioDenominator >= 4 && ratio > 0.5` 时因 opt-out 过多而失败。排掉草图后，真实语料**恰好贴着阈值**：

| 状态 | ignored / denominator | 结果 |
|---|---|---|
| 仅排除草图（当前） | 85 / 171 = **49.7%** | 比率通过；但 9 条编译错 → 红 |
| 排除 + 标 1 对（EN+zh） | 87 / 171 = **50.9%** | **比率红** |
| 排除 + 标 2 对（实测） | 89 / 171 = **52.0%** | **比率红**（已实测复现） |

即：这 2 个 fence **必须真的能编译**，否则要先把语料里既有的 85 个 opt-out 还掉一些。这 85 个 opt-out 是**先于本票存在的债**，此前一直被草图文件那 63 个假 `check` fence 抬高分母而藏住。

**踩坑提醒**：`ts` fence 的语言标记在双语对里**必须一致**。`partitionPairedMarkdownDerivatives` 用 `kind + code` 做键去重，只改英文侧会让 `.zh.md` 那侧不再匹配、被当作 primary 单独编译（实测：改完 EN 后 `.zh.md` 立刻开始报同样的错）。

## 验证（当前状态）

```sh
pnpm run doc-typecheck   # exit 1，诊断从 363 条降到 9 条，全部集中在上述 2 个 fence
```

## Acceptance（剩余）

- 上述 2 个 fence 能真的编译（补 import / 定义 `sessions`），双语两侧同步；`pnpm run doc-typecheck` exit 0、`doc-sync` 36/36。
- 排除范围仍严格限于 `docs/superpowers/plans/`，`docs/` 其余部分照旧编译。
- 若将来有人想让 plan 草图也参与编译，需连带处理 opt-out 比率债，并 revert 本票的排除。

## Resolution

两个真实示例已改为自足、可编译的 TypeScript：wrapper 示例补齐 Cordis 与 credentials 类型 import；result-cache 示例声明最小结构类型并显式标注参数。当前语料另比票据快照多出 2 个 opt-out，因此同时将 `scope-registry` 的独立配置类型和 LLM adapter 注册示例改为可编译 fence；最终 `pnpm run doc-typecheck:contracts-ready` 报告 86 compiled / 85 ignored（49.7%），exit 0。双语代码块保持一致，排除范围仍只包含 `docs/superpowers/plans/`。
