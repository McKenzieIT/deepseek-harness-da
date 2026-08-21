# `@deepseek-ai/dsh-tool-load-table-definition`

[English](README.md) | 中文

面向模型的 `load_table_definition` 工具：从语义层 substrate **加载已校验的表定义**，用于 data agent 的 `UNDERSTANDING`/`GENERATION` 阶段。agent 在写 SQL 或评审查询前调用它，以真实 schema（列、分区、主键、指标、维度引用）作为 SQL 落地依据。

这是 **P6b deferred follow-up**（"load_* 接入"）—— [`ctx.schema`](../semantic-layer) `loadTableDefinition` substrate（P6b ship，commit 88524504f8）的面向模型封装。它镜像 [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources)（首个 model-facing tool，P13b commit 0e1a0fdf25）的 [`@deepseek-ai/dsh-tools`](../../core/tools) 注册形态（`defineTool` + `ctx.tools.register`）。

## 状态：已注册 + 可调；ctx.schema 已接通

本工具由 data-agent preset（`tool-load-table-definition` 行，已解注释）注册，并列入 phase-gate `UNDERSTANDING`/`GENERATION` 白名单，故模型可在对应阶段调用。探 `ctx.get('schema')`：`@deepseek-ai/dsh-semantic-layer` service 挂载时命中即返回投影定义；未挂载 provider 时（无该 service 的 profile，或单测）返回诚实的 `found: false` "not mounted" 结果——callable but unwired，非 broken mount（与 `tool-search-data-sources` 在 retrieval provider 挂载前的薄默认态相同）。

`ctx.schema` bundle service 行（`packages/bundle/data-agent/cordis.patch.yml` 的 `semantic-layer`）现已 **解注释 + 接通**：已加 `dsh-semantic-layer` bundle dep 并经 `pnpm install` 同步 lockfile，故挂载 data-agent bundle 即注册 `ctx.schema`、接通本工具到真 substrate——命中即返回投影定义，而非 "not mounted" 默认。（已验证：`verify-cordis-config` + `dsh --dump-config` 显示 `semantic-layer` service；真 `semanticRoot` smoke 返 `found:true` 带投影 `partitions`。）默认空 `semanticRoot` 下，已挂载 substrate 不扫任何 `tables/` 目录，返回 `null`（not-found，不崩）；真实 substrate 目录在 profile/运行时层配置。

`table_name` 参数为模型输入（不可信）。P6b code-review #5 将 definition-name 路径穿越守卫 deferred 到 "load_* 接入"；本工具在边界校验 name（拒 `/`、`\`、`..`、NUL），落实 intranet-security-first 纵深防御。

## 注册形态

镜像 [`@deepseek-ai/dsh-tool-search-data-sources`](../tool-search-data-sources) 与 [`@deepseek-ai/dsh-tool-bash`](../../shell/tool-bash)：

```ts ignore-check
export const name = 'tool-load-table-definition'
export const inject = ['tools']
export const Config: z<Config> = z.object({})

export function apply(ctx: Context, _config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'load_table_definition',
    description: '...',
    parameters: { table_name: { type: 'string', required: true, description: '...' } },
    output: { schema: { ... }, render: (_args, value) => [...] },
    async execute(args, exec) {
      const schema = ctx.get('schema') as SemanticLayerService | undefined
      return loadTableDefinitionResult(schema, args.table_name)
    },
  }))
}
```

注册基于 effect（dispose plugin fiber 即注销工具）；schema 自动汇入 system-prompt 装配。`execute` 返回单一规范 JSON 值（`{ found, table?, message? }`）；`output.render` 投影为面向模型的文本。见 [`docs/cookbook/adding-a-tool.md`](../../../docs/cookbook/adding-a-tool.md)。

## 配置

无旋钮。substrate 拥有数据（`semanticRoot` + scope 配在 `ctx.schema` service mount 上，不在本工具）。路径穿越 name 守卫无条件生效。

## 验证

```sh
tsc -b packages/data/tool-load-table-definition/tsconfig.json
pnpm vitest run packages/data/tool-load-table-definition
pnpm verify-cordis-config
```

本包 ship 后解注释 preset 行（`apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 的 `tool-load-table-definition`）；phase-gate guard 的 `UNDERSTANDING`/`GENERATION` 白名单已含 `load_table_definition`，注册即在对应阶段可调。

## 模型体验

### `load_table_definition` 工具调用

#### 模型所见

`load_table_definition` 工具 schema（name、description、`table_name` 参数、`found`/`table`/`message` 输出形态）在插件挂载后自动汇入 system-prompt 装配，模型在 `UNDERSTANDING`/`GENERATION` 阶段白名单中与之一起发现。模型调用时，`execute` 返回单一规范 `{ found, table?, message? }` JSON 值，`output.render` 投影为面向模型的文本：命中时为多行定义块（`table: <name>`、comment、`columns:` 列表、`partitions:`、`primary_key:`、`metrics:`、`dimension_refs:`），否则为单行 not-found / not-mounted / invalid-name 消息。

#### Token 影响

工具结果中渲染的定义文本是本工具唯一的逐调用 token 成本；`load_table_definition` schema 骑在 system prompt 而非 turn 负载。文本承载 SQL 落地相关字段（列、分区、主键、指标、维度引用）；工作流状态字段（confirmation / coverage / supersedes）在文本中省略，但 JSON 值承载完整已校验定义。成本随表的列/指标数伸缩。

#### KV 缓存影响

工具结果为 append-only：定义文本跟随可复用请求前缀，不使既有缓存条目失效。工具 schema 是跨 turn 稳定 system-prompt 前缀的一部分，故注册或调用不引入前缀抖动。

## 已知限制与待办

- **ctx.schema bundle mount wired（已解）** —— bundle 的 `semantic-layer` service 行已解注释 + 加 `dsh-semantic-layer` dep（lockfile 经 `pnpm install` 同步）；`ctx.schema` 已挂载，故本工具已接通真 substrate（不再 "callable but unwired" 默认）。preset 行 + phase-gate 白名单本已就位。已验证：`verify-cordis-config` + `dsh --dump-config`（service 在）+ 真 `semanticRoot` smoke（`found:true` 投影 `partitions`）。
- **空 substrate（默认 `semanticRoot`）** —— 默认空根下 substrate 不扫任何 `tables/` 目录，`loadTableDefinition` 返回 `null`（not-found，不崩）。真实 substrate 目录在 profile/运行时层配置；本工具契约不变。
- **live-ODPS provider deferred（P6b Q3）** —— `ctx.schema.discover`/`describe`/`sample`（live-ODPS schema）在真实 MaxCompute provider 挂载前抛 "no provider"（P6b follow-up）。`load_table_definition` 仅读 substrate 定义，故不阻塞。
- **路径穿越守卫仅边界生效** —— name 守卫在本工具（不可信模型输入边界）。substrate 的 `io.ts` 读路径按 `table_name` 字段匹配（非按文件名），故 `load_*` 不可达穿越；守卫是对未来 substrate 变更的纵深防御。`io.ts` 写入器（`writeTable`/`writeEventYaml`）会路径化 `name`，目前仅对可信内部调用方守卫（P6b #5/#6 follow-up）。
- **substrate 写层加固 deferred** —— P6b code-review #4（canonicalize-on-write）与 #6（`updateTableMeta` `withFileLock`）在 `io.ts` deferred；不影响本只读工具（仅调校验读取器）。
