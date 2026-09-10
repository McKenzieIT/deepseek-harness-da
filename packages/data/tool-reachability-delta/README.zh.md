# `@deepseek-ai/dsh-tool-reachability-delta`

[English](README.md) | 中文

面向模型的 `reachability_delta` 工具：**计算若向知识图谱中加入一条拟新增关系，经由 join 将有多少新的资产对变为新可达**。agent（智能体）在提交编辑前调用它以评估新增关系的影响。

它是 [`ctx.evidenceQuery`](../evidence-query) `reachabilityDelta` substrate（随 `@deepseek-ai/dsh-evidence-query` 服务一同提供）的面向模型的包装层。它镜像了 [`@deepseek-ai/dsh-tool-load-table-definition`](../tool-load-table-definition) 与 [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources)，以契合 [`@deepseek-ai/dsh-tools`](../../core/tools) 的注册形态（`defineTool` + `ctx.tools.register`）。

## 状态：已注册 + 可调用；ctx.evidenceQuery 可选

该工具由 data-agent preset 注册，并探测 `ctx.get('evidenceQuery')`：当 [`@deepseek-ai/dsh-evidence-query`](../evidence-query) 服务已挂载时，它针对实时关系图计算 delta；当未挂载提供方（不含该服务的 profile 或单元测试）时，它返回如实的 `ok: false`「evidenceQuery service not mounted」结果——可调用但未接线，而非损坏的挂载（与其他 `ctx.get` 探测型工具在各自服务挂载前所处的同一 thin-default 状态一致）。

`source_id`/`target_id`/`type`/`on` 参数为模型输入（不可信）。`execute` 在计算前检查 `exec.signal.aborted`。

## 注册形态

镜像 [`@deepseek-ai/dsh-tool-load-table-definition`](../tool-load-table-definition) 与 [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources)：

```ts ignore-check
export const name = 'tool-reachability-delta'
export const inject = ['tools']
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'reachability_delta',
    description: 'Compute reachability delta: ...',
    parameters: { source_id, target_id, type, on },
    output: { schema: { ... }, render: (_args, value) => [...] },
    execute(args, exec) {
      if (exec.signal.aborted) throw new Error('reachability_delta aborted')
      const evidenceQuery = ctx.get('evidenceQuery')
      if (!evidenceQuery) return { ok: false, ..., message: 'evidenceQuery service not mounted' }
      const result = evidenceQuery.reachabilityDelta(proposed)
      return { ok: true, ...result }
    },
  }))
}
```

注册基于 effect：dispose（资源释放）plugin fiber 会注销该工具；schema 自动流入系统提示词装配。`execute` 返回一个规范化 JSON 值（`{ ok, proposedRelation, newlyReachableCount, newlyReachable, message? }`）；`output.render` 将其转为面向模型的文本。

## 配置

无可配置项。关系图由 [`ctx.evidenceQuery`](../evidence-query) 服务挂载拥有，而非本工具。

## 验证

```sh
tsc -b packages/data/tool-reachability-delta/tsconfig.json
pnpm vitest run packages/data/tool-reachability-delta
pnpm verify-cordis-config
```

## 模型体验

间接通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

该包的贡献对可复用请求前缀是仅追加的，不会使既有缓存条目失效。

## 已知限制与后续工作

- **ctx.evidenceQuery 可选（挂载前可调用但未接线）**——该工具探测 `ctx.get('evidenceQuery')`，当 [`@deepseek-ai/dsh-evidence-query`](../evidence-query) 服务未挂载（不含该服务的 profile 或单元测试）时，返回如实的 `ok: false`「evidenceQuery service not mounted」结果。为 bundle 接线 `evidence-query` 服务行是 bundle 层关注点；无论是否接线，本工具的约定不变。
- **展示上限（20 对）**——面向模型的文本仅渲染前 20 个新可达对；其余以 `... +M more` 标记概括。完整对列表保留在 JSON 值的 `newlyReachable` 数组中，因此直接读取该值的调用方可看到全部对。对于非常大的 delta，模型看到的是有界摘要。
- **`type` 在边界处转换**——`type` 参数在 schemastery schema 中声明为 `string`，并在 `execute` 内部转换为 `ProposedRelation['type']` 联合类型（`joins` | `derived_from` | `related_to`）。无效的 type 字符串被转发给 substrate 的 `reachabilityDelta`；本工具不对该联合类型做枚举校验（substrate 主导未知类型的行为）。
- **只读（无 Tier-2 审计）**——该工具针对一条假想关系计算 delta，不修改知识图谱，因此不产生 Tier-2 审计写入（不同于 `edit_definition`/`revert_edit` 写入工具）。
- **取消检查仅在计算前**——若 `exec.signal.aborted` 为真，`execute` 在计算前抛出 `reachability_delta aborted`；substrate 的 `reachabilityDelta` 调用是同步的，计算过程中本身不可中断。
