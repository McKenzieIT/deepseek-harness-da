---
type: grilling
status: open
blocked_by: []
---

# CB-2: enrichment LLM 配置改为 dsh-data-agent 设置项

**来源**：CB-1 blocker 2 的决策（2026-09-04）——不走"选哪种 fail 语义"，
而是**把配置本身搬到设置项里**，让它成为用户可见、可填的东西。

## 现状

`packages/data/semantic-layer/src/llm-wiring-plugin.ts:41-48` 只从两处取值：

```ts
const provider = input.provider || process.env.ENRICHMENT_LLM_PROVIDER || ''
const model = input.model || process.env.ENRICHMENT_LLM_MODEL || ''
if (!provider || !model) throw new Error('enrichment-llm-wiring: no provider/model configured')
```

- `input` = 插件 Config（bundle patch 的 `config:` 块）—— **bundle 里没写**
- 环境变量 —— **全仓无处提供**（无 `.env`，`setup-da-profile.sh` 不导出）

于是任何冷启动都 throw，而 throw 发生在 apply 时 → 整个 data-agent include 组消失
（见 [CB-1](CB1-cold-boot-blockers.md)）。

**关键事实：管道已经存在。** 插件已声明 `Config { provider?, model? }`，
Cordis 也已支持从 `~/.dsh/settings.yaml` 按插件名注入 config（`llm-deepseek:`、
`agent-default-model:`、`ui-theme:` 都是这么配的）。缺的只是**设置面**——
一个 settings key + 一个设置 UI 入口，以及"没填时怎么办"的语义。

## Question（需决策）

1. **settings key 的形状**：单独一节（`enrichment-llm: { provider, model }`）
   还是并入某个已有节？注意 `agent-default-model` 已是
   `{ provider, model, reasoningEffort }` 的成熟形状，可对齐。
   —— 若对齐，是否顺带支持 `reasoningEffort`（enrichment 是批量推断，可能想调低）？
2. **设置 UI 落点**：现有 4 个设置 tab（`ui-settings-general` / `-models` /
   `-plugins` / `-plugin-inventory`）。enrichment 模型选择天然属于
   **`ui-settings-models`**（已有模型选择 UI）还是应该有个 data-agent 专属 tab？
   —— 若是后者，那 CB-2 就是"dsh-data-agent 设置面"的第一个条目，
   后面 `semanticRoot` / `resultsDir` / `caseDir` / scope 配置都该进来（本票需划边界：
   只做 enrichment 一项，还是建一个 data-agent 设置面板作为容器）。
3. **没填时的语义**（CB-1 blocker 2 的原问题仍需答，但有了设置面后风险大降）：
   - (a) 推迟到调用时才 fail-loud（插件照常 mount，不连坐）
   - (b) 回落 `agent-default-model`（你 settings 里已有 `zai-coding-cn/glm-5.2`）
   - (c) 优雅降级 + 启动 warn
   —— 有了可见设置项后，(a) 的"反馈晚一步"缺点被抵消（用户能在 UI 里看到它未配），
   所以 (a) 变得更有吸引力。但 (b) 让开箱即用，零配置即可跑 enrichment。
4. **环境变量契约是否保留**：`ENRICHMENT_LLM_*` 目前还被
   `eval-cli/src/main.ts` 和 `tool-search-data-sources/src/expand-query.ts`
   各自复制了一份同样的 resolver（CL-8 注释明说"共享契约是 env 名 + 错误信息，
   非共享代码"）。改成 settings 后，这三处要不要统一？若统一，是否需要一个
   共享 seam（与 CL-8 当初"不新增跨包依赖"的决定相反）？

## 验收

- `--profile web` 在**零 env** 下能冷启动
- enrichment 的 provider/model 可在设置里配置并生效（改完不需重启，或明确说明需重启）
- 未配置时的行为符合决策，且**用户能看见它未配置**（不是静默）
- 三处重复 resolver 的处理有明确决定（统一 or 记录为有意重复）

## 关键文件

- `packages/data/semantic-layer/src/llm-wiring-plugin.ts:21-58`（Config + resolver）
- `packages/bundle/data-agent/cordis.patch.yml:179`（enrichment 行，无 config 块）
- `~/.dsh/settings.yaml`（现有 `agent-default-model` 形状可对齐）
- `packages/client/ui-settings-models/`（候选 UI 落点）
- 重复 resolver：`packages/eval/eval-cli/src/main.ts:222`、
  `packages/data/tool-search-data-sources/src/expand-query.ts`
