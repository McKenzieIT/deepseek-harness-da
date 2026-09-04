---
type: grilling
status: open
blocked_by: []
---

# CB-1: 冷启动 blocker —— 单行失败炸掉整个 data-agent include 组

**Branch**: `fix/cb1-cold-boot-blockers`  <!-- CLAUDE.md:64 要求每票声明分支；未声明不算认领 -->

## 事实（2026-09-03 实测，`--profile web` 冷启动）

用户报「语义层按钮又消失了」。**按钮代码完全正常**——真因是 `--profile web` **冷启动失败**，
`data-agent` include 组整组不挂载，连带 `ui-semantic-layer` 一起消失（base web-app 树已挂载，
所以 app 照常打开，只是 data-agent 的一切都没了）。

复现：`node --import tsx/esm apps/cli/src/bin.ts web --port 3099`。两个**独立**的 blocker，
依次触发：

### Blocker 1 — `duplicate loader entry id: result-cache` ✅ 已修

两个不同插件抢同一个 loader entry id：

| 文件 | id | name |
|---|---|---|
| `packages/bundle/web-app/cordis.patch.yml:300` | `result-cache` | `@deepseek-ai/dsh-client-result-cache`（客户端对象缓存） |
| `packages/bundle/data-agent/cordis.patch.yml:227` | `result-cache` | `@deepseek-ai/dsh-result-cache-memory`（服务端 `ctx.resultCache` seam） |

web profile 同时组合两个 bundle → `EntryGroup.update` throw → `Include._apply` 整组失败。
随 T9 落地（commit `9ab8189b0b` "feat(client/result-cache): object-layer hot cache over result.get"）。
与 P-DA4 修过的 `code-runtime` 重复 id 同一 bug 类。

**修复**：data-agent 侧改 id 为 `result-cache-memory`（该 id 全仓无字符串引用，两插件角色不同、
都需要，所以是改名不是 disable）。

### Blocker 2 — `enrichment-llm-wiring: no provider/model configured` ✅ 已决策（grilling 2026-09-04 → [CB-1a](CB1a-cold-boot-stabilization.md) 落地）

`packages/data/semantic-layer/src/llm-wiring-plugin.ts:48` 在 **apply 时** fail-loud：

```ts
const provider = input.provider || process.env.ENRICHMENT_LLM_PROVIDER || ''
const model = input.model || process.env.ENRICHMENT_LLM_MODEL || ''
if (!provider || !model) throw new Error('enrichment-llm-wiring: no provider/model configured')
```

而 `ENRICHMENT_LLM_PROVIDER` / `ENRICHMENT_LLM_MODEL` **全仓无处提供**：
- 无 `.env`（`loadLayeredEnv` 找不到文件）
- bundle 的 `enrichment-llm-wiring` 行（`cordis.patch.yml:179`）**没有 `config:` 块**
- `~/.dsh/settings.yaml` 有 `agent-default-model: {provider: zai-coding-cn, model: glm-5.2}`，
  但本插件**不读 settings.yaml**，只读 env 或 plugin config
- `scripts/setup-da-profile.sh` 只写 `agent-default-model`，不导出 `ENRICHMENT_LLM_*`

CL-8 移除了静默默认（原 `aga`/`qwen3.7-max`）改为 fail-loud，但没有在任何部署面补上取值。

**临时解法**（已验证可启动）：启动前 `export ENRICHMENT_LLM_PROVIDER=... ENRICHMENT_LLM_MODEL=...`。

## Question（需决策）

**fail-loud 的位置错了**：它在 *plugin construction* 抛，代价是整个 bundle 组消失——
一个未配置的 enrichment 能力，炸掉了管理 UI、schema-gateway、evidence-query、全部 tool。
本仓已有相反先例：`query-maxcompute` 经 W14 改为 graceful degrade；
`eval-runner-service` 的 bundle 注释明写 "degrades to all-fail verdicts when a seam is
unmounted, **never crashes the bundle**"。

候选：
1. **推迟 fail-loud 到 use 时**：插件照常 mount，`textLlm.text()` 被真正调用时才抛/拒。
   保住 CL-8 的「不静默用 vendor 默认」意图，同时不连坐。
2. **graceful degrade**：未配置则不 wire `ctx.schema` 的 llm 面 + 启动 warn。
   （enrichment 静默不可用，风险=用户以为在跑）
3. **回落 `agent-default-model`**：读 settings.yaml 的 provider/model 作为默认。
   （最贴合用户直觉，但把 enrichment 和 agent 主模型绑在一起）
4. **bundle 钉死 config**：与 `cordis.patch.yml:63-70` 注释「LLM 是 deployment 决策，
   bundle 不 mandate」冲突，且与用户实际模型不符。

**更大的问题（本票核心）**：include 组的失败语义是"一行炸=整组没"。是否需要
per-row 隔离（一行失败只丢那一行 + 显式 warn）？这决定了每个新增 data 行都是一颗
潜在的"整组消失"地雷——W14、本票都是这个形状，第三次了。

## 决策（2026-09-04 grilling，[CB-1a](CB1a-cold-boot-stabilization.md) 落地）

- **boot 契约 = 非致命**：enrichment 未配置不阻 boot（底座 `enrichment.ts` 全程 `llmCall?` 可选，确定性轮为基底；`index.ts:32/618/636` "absent => deterministic round only"；`setLlmCall(fn?)` 接受未接线）。无核心能力依赖 enrichment 的 LLM 轮。
- **未配置时行为 = graceful degrade（α）**：apply 期 `throw` → `ctx.logger.warn` + 早返回（跳过 wire），enrichment 退确定性轮。**否决候选 1「defer fail-loud 到 use 时」**：substrate 8 处 best-effort `try/catch`（`discoverRelationsFor` 等）会吞掉挂抛错适配器，结果与不接线一样但白抛 + 零 surface，严格劣于 α。substrate 不动。
- **include 组失败隔离 = S2（维持整组 + boot 自检），S1 per-row 推迟**：vendor `EntryGroup.update`（`group.ts`）是故意的事务 all-or-nothing 且 vendor README 本地改动 #8 已加固，S1 逆它代价高、预防性不值；S2 消灭「静默缺按钮」真症状成本是 S1 零头。per-row 重开条件：第 4 颗同形状地雷。详见 [CB-3](CB3-per-row-fault-isolation.md)。
- **CB-2（enrichment 设置项）推迟**：非 boot 必需；且 CB-2 票前提高估现状（插件未接 `ctx.settings`，pull-based，连 settings 配都需改插件代码）。待产品优先级成立单独 grill。

## 验收

- 决策 blocker 2 的修复形态并落地
- `--profile web` 在**零 env、零 credentials** 下能冷启动，且 sidebar 语义层按钮可见
- 决策 include 组失败隔离：per-row 容错 or 维持整组（若维持，需一条启动自检把
  "整组消失" 变成显式报错而非静默缺按钮）
- 回归测试：一个 cordis-config spec 断言 web profile 无重复 loader id（防第三次）

## 关键文件

- `packages/bundle/data-agent/cordis.patch.yml:179`（enrichment 行）、`:227`（已改名）
- `packages/bundle/web-app/cordis.patch.yml:300`
- `packages/data/semantic-layer/src/llm-wiring-plugin.ts:41-58`
- `vendor/include/src/index.ts:312-317`、`vendor/loader/src/config/group.ts:64`（整组失败点）
- 先例：W14（query-maxcompute graceful degrade）、P-DA4（code-runtime 重复 id）
