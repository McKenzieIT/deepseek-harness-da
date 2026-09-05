---
type: task
status: closed
blocked_by: [CB1, CB3]
---

# CB-1a: 冷启动稳定化落地（enrichment graceful degrade + include 失败自检）

**Branch**: `fix/cb1a-cold-boot-stabilization`  <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

**来源**：[CB-1](CB1-cold-boot-blockers.md)（blocker 2 决策）+ [CB-3](CB3-per-row-fault-isolation.md)（失败隔离评估结论）的 2026-09-04 grilling。本票承接两票**已决策但未落地**的实现工作。[CB-2](CB2-enrichment-llm-as-settings-item.md)（enrichment 设置项）已推迟，不在本票。

## 决策回放（grilling 2026-09-04）

- **Q1（boot 契约）= 非致命**：enrichment 未配置不阻 boot。底座 `enrichment.ts` 全程 `llmCall?: LlmCall`、`if (!llmCall) return det`（确定性轮为基底，LLM 为补充）；`index.ts:32/618/636` 明写 "absent => deterministic round only"；`setLlmCall(fn?)` 接受 undefined（未接线为一等状态）。无核心能力依赖 enrichment 的 LLM 轮。
- **Q2（未配置时行为）= graceful degrade + 配置层 surface（插件 α）**：apply 期 `throw` → `ctx.logger.warn(...)` + 早返回（跳过 `wireEnrichmentLlm`）。enrichment 退为确定性轮；boot warn 为 surface。**否决「挂抛错适配器 defer fail-loud」**：substrate 8 处 best-effort `try/catch`（`discoverRelationsFor` 等）会吞掉，结果与不接线完全一样但白抛 + 零 surface，严格劣于 α。substrate 不动。
- **Q3（结构）= S2：维持整组事务性失败 + boot 自检**；S1（per-row 隔离）推迟。理由：`EntryGroup.update`（`vendor/loader/src/config/group.ts`）是**故意的事务性 all-or-nothing**（`Promise.allSettled` → 任一失败 throw + 整组回滚），且 vendor README 本地改动 #8 已加固此语义；S1 逆 #8 方向、改 vendored 代码、跨 sync 维护，预防性不值。S2 消灭「静默缺按钮」真症状，成本是 S1 零头。per-row 重开条件：第 4 颗同形状地雷。

## 实现清单

### 1. enrichment-llm-wiring graceful degrade（α）

`packages/data/semantic-layer/src/llm-wiring-plugin.ts:31-58`：

- `resolveEnrichmentLlmConfig` 不再 throw；未解析到 provider/model 时返回 `null`（或 `apply` 内直接判空）。
- `apply`：provider/model 缺失 → `ctx.logger.warn('enrichment-llm-wiring: no provider/model configured; enrichment runs deterministic-only. Set ENRICHMENT_LLM_PROVIDER/MODEL or the settings item (CB-2, deferred) to enable the semantic round.')` + **早返回（不调 `wireEnrichmentLlm`）**。
- 配置齐全时行为不变（`wireEnrichmentLlm(ctx.schema, textLlm)` + 末尾 `ctx.logger.info`）。
- substrate（`enrichment.ts` / `index.ts` 的 `setLlmCall`）**不动**。

### 2. include 组失败 boot 自检（S2）

任一 include 组 apply 失败 → 当前是「app 照常打开、整组静默消失」。改为显式报错：

- 落点：`packages/boot/app-boot/src/index.ts:523`（`mountRootInclude`）—— include 树挂完后，断言预期 include fiber 已 mounted；失败则抛带 group/entry/根因的显式 boot 错误（而非让 app 静默打开）。
- 可观测增强（CB-3 Q3）：`packages/host/plugin-inventory/src/index.ts:64`（`enabled: !entry.disabled`）旁加「本该加载但 apply 失败」的显示。
- 不改 vendor 事务语义（`group.ts` / `include/src/index.ts` 不动）。

### 3. 回归测试

- enrichment 零 env/零 config 冷启动：boot 成功 + warn 输出 + 语义层按钮可见（CB-1 验收点）。
- enrichment 配置齐全：LLM 轮正常 wire（不回归 CL-8 后的行为）。
- include 组某 entry apply 抛错：boot 显式报错（非静默缺按钮）。
- `scripts/bundle-loader-ids.spec.ts`（CB-3 已落地的重复 id gate）保持绿。

## 不做（明确边界）

- **不改 substrate 的 best-effort 语义**（8 处 `try/catch` 保持吞错降级）。
- **不改 vendor 事务 all-or-nothing**（S1 per-row 隔离推迟，见 [CB-3](CB3-per-row-fault-isolation.md)）。
- **不做 CB-2 设置项**（推迟；enrichment 配置口暂为 env vars + α 的 warn）。
- **不统一三处重复 resolver**（`eval-cli/src/main.ts`、`tool-search-data-sources/src/expand-query.ts`、本插件）——随 CB-2 一起再议。

## 验收

- `--profile web` 在**零 env、零 credentials** 下能冷启动，sidebar 语义层按钮可见。
- enrichment 未配置时：boot 成功 + warn + enrichment 退确定性轮（不抛、不炸组）。
- include 组 apply 失败：boot 显式报错（指名 group/entry/根因），不静默缺按钮。
- 既有测试不回归。

## 关键文件

- `packages/data/semantic-layer/src/llm-wiring-plugin.ts:31-58`（α 改动点）
- `packages/data/semantic-layer/src/enrichment.ts`（**只读参考**：`llmCall?` 全可选、best-effort）
- `packages/data/semantic-layer/src/index.ts:609/1067-1068`（`setLlmCall` / `wireEnrichmentLlm`）
- `packages/boot/app-boot/src/index.ts:523`（`mountRootInclude`，S2 自检落点）
- `packages/host/plugin-inventory/src/index.ts:64`（inventory 失败行显示）
- `vendor/loader/src/config/group.ts`（**不动**：事务 all-or-nothing）
- 决策来源：[CB-1](CB1-cold-boot-blockers.md)、[CB-3](CB3-per-row-fault-isolation.md)；推迟项：[CB-2](CB2-enrichment-llm-as-settings-item.md)

## Resolution（2026-09-04 landed）

α + S2 落地：[PR #11](https://github.com/McKenzieIT/deepseek-harness-da/pull/11)（commit `6a2551cb82`，分支 `fix/cb1a-cold-boot-stabilization`）。

- **α**（`llm-wiring-plugin.ts`）：`apply()` 未配置 → `ctx.logger.warn` + 早返回（确定性轮）；配置齐全路径字节不变（不回归 CL-8）；`resolveEnrichmentLlmConfig` 签名不变；substrate + vendor 未动。
- **S2**（`app-boot/src/index.ts`）：boot catch 枚举多 entry `AggregateError` 的 per-entry id/name/cause 到顶层（不再埋在 `cause.cause.errors[]`）；单失败路径不变。**规格偏离**：spec 的「`mountRootInclude` 后置自检」drop 为冗余（boot 已 loud reject，复现确认当前 master 对 cold-boot 组失败是 crash 非 silent）；inventory 失败行显示**推迟（Option A）**——loud 世界对失败 case moot（失败 entry 被事务回滚从 `tree.store` 删除、app 崩前 inventory 不被查；需 S1 per-row 隔离才有用）。
- **验证**：4× subagent review（无 blocker）；117 owning 测试绿（107 app-boot + 9 llm-wiring + 1 bundle-loader-ids）；`pnpm run typecheck` exit 0；`app-boot/src/index.ts` 100% 覆盖；端到端零 env `web --port 3099` 启动成功（`dsh web: http://127.0.0.1:3099`），不再 exit-1 crash。
- **预存（非本 PR）**：`llm-wiring-plugin.ts` 的 `textLlm.text` 块未覆盖——master 亦然（α 未触该块，git-stash 确认）；按 dsh-pre-push skill 留 CI。
- **merge 状态**：PR #11 已 admin-merge 进 master（merge commit `a905858f5d`，2026-09-05；master 无 branch protection → admin-merge 无视 larger-runner pending）。larger-runner 3 job（coverage/static/snapshots）在 fork（User 账户无 larger-runner 权限）→ 维持 `pending`（不红、不阻塞）；ubuntu-latest CI 红的根因（`CLAUDE.md` git mode 误为 symlink 120000 → Linux checkout ENAMETOOLONG）由 [PR #17](https://github.com/McKenzieIT/deepseek-harness-da/pull/17)（`2e487635ce`）单独修复并先合入 master。
