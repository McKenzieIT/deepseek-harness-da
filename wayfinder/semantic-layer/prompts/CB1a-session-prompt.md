# CB-1a — 冷启动稳定化落地 Session Prompt

> 本文件是下一 session 的完整 prompt。直接粘贴即可开工。规格见 [CB-1a](wayfinder/semantic-layer/tickets/CB1a-cold-boot-stabilization.md)。

## 1. 环境/分支契约（session 启动第一步，必填）

**前提（本 session 前 Lead 已完成）**：上一 session 产出的 wayfinder 文档（CB-1a 票、CB-1/2/3 决策段、map 更新、本 prompt）已直推 master —— 它们不触 `packages/*/src`，属 §2 白名单。worktree 基于 master 才能拿到 CB-1a 票与决策。

```sh
git worktree add ../dsh-cb1a -b fix/cb1a-cold-boot-stabilization master
cd ../dsh-cb1a
node scripts/install-lefthook.mjs   # 重新生成 worktree-local hooks
```

- worktree：`../dsh-cb1a`
- 分支：`fix/cb1a-cold-boot-stabilization`
- 基线：`master @ b258a95ff3`
- **禁止直推 master。** 所有提交落在本分支。

## 2. 直推 master 白名单（commit 前自检）

本 session 的 diff **触 `packages/*/src`**（`llm-wiring-plugin.ts` + `app-boot/src/index.ts` + `plugin-inventory/src/index.ts`）→ **不在白名单** → 必须走分支 + PR。

只有同时满足才可直推 master：

- [ ] diff 不触及 `packages/*/src`、`apps/`、`examples/`、`native/`、`python/`、`scripts/`
- [ ] 仅 `wayfinder/` 文档（map / ticket / research）或实验 probe 脚本 + audit-log 条目

## 3. 任务正文

### 背景

2026-09-04 grilling 解决了 [CB-1](wayfinder/semantic-layer/tickets/CB1-cold-boot-blockers.md)（cold-boot blockers）+ [CB-3](wayfinder/semantic-layer/tickets/CB3-per-row-fault-isolation.md)（per-row 失败隔离评估）的 4 个决策，落账在 [CB-1a](wayfinder/semantic-layer/tickets/CB1a-cold-boot-stabilization.md)。本 session 落地其中两块**已决策、未实现**的工作：

- **Q2 = α**：`enrichment-llm-wiring` 插件 apply 期 `throw` → `ctx.logger.warn` + 早返回（非致命，boot warn 为 surface）。substrate 不动。
- **Q3 = S2**：include 组失败时，把「app 照常打开、整组静默消失」改成 boot 显式报错（指名 group/entry/根因）。不改 vendor 事务语义。

[CB-2](wayfinder/semantic-layer/tickets/CB2-enrichment-llm-as-settings-item.md)（enrichment 设置项）已推迟，**不在本 session**。S1（per-row 隔离）推迟，**不在本 session**。

### Phase 0：前置确认（读码，不 grilling）

1. **建立 red baseline**：零 env 下 `node --import tsx/esm apps/cli/src/bin.ts web --port 3099` 复现当前 crash（`enrichment-llm-wiring: no provider/model configured` → 整组消失 → 语义层按钮不见）。α 落地后此命令应转绿。
2. **α 落点确认**：读 `packages/data/semantic-layer/src/llm-wiring-plugin.ts:31-86`。确认：`ctx.logger.info` 已在 `:86` 用（故 `ctx.logger.warn` 同源可用）；`resolveEnrichmentLlmConfig` 唯一调用点在 `apply`。选最小改动：**不改 `resolveEnrichmentLlmConfig` 签名，在 `apply` 内判 `!provider || !model`**。
3. **S2 落点确认**：
   - 读 `packages/boot/app-boot/src/index.ts:523`（`mountRootInclude`）及上下文：include 树挂载流程、当前失败时的 catch 行为（抛 / 日志 / 静默？）、断言「预期 include fiber 已 mounted」的注入点。
   - 读 `packages/host/plugin-inventory/src/index.ts:64`（`enabled: !entry.disabled`）：inventory 行显示结构，加「本该加载但 apply 失败」状态的位置。
   - 确认 group 失败根因从哪取（`EntryGroup.update` 抛的 `AggregateError` / 单 error）→ 自检报错信息要带 group + entry + cause。

### Phase 1：实现（α + S2）

调用 skill：`dsh-plugin-development`（Cordis 插件改动，即 α）。

**1a — α（enrichment graceful degrade）** — `packages/data/semantic-layer/src/llm-wiring-plugin.ts`：

- `resolveEnrichmentLlmConfig` 不再 throw；`apply` 内 provider/model 缺失 →
  `ctx.logger.warn('enrichment-llm-wiring: no provider/model configured; enrichment runs deterministic-only. Set ENRICHMENT_LLM_PROVIDER/MODEL or the settings item (CB-2, deferred) to enable the semantic round.')`
  + **早返回（不调 `wireEnrichmentLlm`）**。
- 配置齐全：行为不变（`wireEnrichmentLlm(ctx.schema, textLlm)` + 末尾 `ctx.logger.info`）。
- **substrate（`enrichment.ts` / `index.ts` 的 `setLlmCall`）不动。**

**1b — S2（boot 自检 + inventory 失败显示）**：

- `packages/boot/app-boot/src/index.ts`（`mountRootInclude` 附近）：include 树挂完后断言预期 include fiber mounted；失败 → 抛显式 boot 错误（group + entry + 根因），不让 app 静默打开。
- `packages/host/plugin-inventory/src/index.ts:64`：旁加「本该加载但 apply 失败」的行显示。
- **vendor（`group.ts` / `include/src/index.ts`）不动。**

### Code Review Pattern

每块编码完立即用 subagent review：

```
Agent({ subagent_type: "general-purpose",
  prompt: `Review CB-1a 的 [1a|1b] 实现。
    Check:
    1. substrate 未动（enrichment.ts 8 处 best-effort try/catch 原样）
    2. vendor 未动（group.ts 事务 all-or-nothing）
    3. α 不回归 CL-8（配置齐全时仍 wire，未偷用 vendor 默认）
    4. S2 报错带 group/entry/cause，非静默缺按钮
    5. 未越界做 CB-2 / S1 / 三处 resolver 统一
    Report: issues + severity (block/warn/nit).` })
```

blocking → 修复后再进下一块。

### 约束

- 不改 substrate 的 best-effort（8 处 `try/catch` 保持吞错降级）。
- 不改 vendor 事务 all-or-nothing（S1 per-row 推迟，见 [CB-3](wayfinder/semantic-layer/tickets/CB3-per-row-fault-isolation.md)）。
- 不做 CB-2 设置项（推迟；配置口暂为 env vars + α 的 warn）。
- 不统一三处重复 resolver（`eval-cli/src/main.ts`、`tool-search-data-sources/src/expand-query.ts`、本插件）——随 CB-2 再议。
- `pnpm run typecheck` 绿；新代码有测试；`npx tsc --noEmit` 无新增错误。

### 参考文件

| 文件 | 用途 |
|------|------|
| wayfinder/semantic-layer/tickets/CB1a-cold-boot-stabilization.md | 本 session 规格（决策回放 + 实现清单 + 验收） |
| wayfinder/semantic-layer/tickets/CB1-cold-boot-blockers.md | 决策来源（Q1/Q2/结构） |
| wayfinder/semantic-layer/tickets/CB3-per-row-fault-isolation.md | S2/S1 评估结论 + S2 落点 |
| packages/data/semantic-layer/src/llm-wiring-plugin.ts | α 改动点（:31-86） |
| packages/data/semantic-layer/src/enrichment.ts | 只读参考：llmCall 全可选 + best-effort |
| packages/data/semantic-layer/src/index.ts | setLlmCall（:609）/ wireEnrichmentLlm（:1067） |
| packages/boot/app-boot/src/index.ts | S2 自检落点（:523 mountRootInclude） |
| packages/host/plugin-inventory/src/index.ts | inventory 失败行显示（:64） |
| vendor/loader/src/config/group.ts | 不动：事务 all-or-nothing（决策依据） |

### 验收

- [ ] `--profile web` 零 env/零 credentials 下冷启动 + sidebar 语义层按钮可见
- [ ] enrichment 未配置：boot 成功 + warn + 退确定性轮（不抛、不炸组）
- [ ] enrichment 配置齐全：LLM 轮正常 wire（不回归 CL-8）
- [ ] include 组 apply 失败：boot 显式报错（group/entry/根因），不静默缺按钮
- [ ] `scripts/bundle-loader-ids.spec.ts` 绿；既有测试不回归
- [ ] CB-1a ticket closed + map updated

## 4. 收尾（Lead integration boundary）

- [ ] `pnpm run typecheck` 绿
- [ ] 相关 surface 测试绿（行为改 `test:coverage` / snapshot；模型改 snapshot；文档改 `doc-sync`）
- [ ] `gh pr create`（依赖链用 `gh stack link`），通过 [dsh-pre-push-checks](.agents/skills/dsh-pre-push-checks/SKILL.md)
- [ ] **下一并行批不得在本批 PR 未 merge / 未 abandon 前启动。**
