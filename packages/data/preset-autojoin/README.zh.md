# @deepseek-ai/dsh-preset-autojoin

[English](README.md) | 中文

[data-agent] da 包装层（§4.2），在 `agent/created` 时将配置好的默认 agent preset 加入到每个已发布的 agent（智能体），无需修改 dsh 源码即可弥合 headless 不加入默认 preset 的缺口。

## 为什么

headless 入口（`@deepseek-ai/dsh-headless`）创建一个裸 agent：其 `setup` 调用 `installModelSelection` 但**不**调用 `AgentPresets.mount(agentCtx, id)`，因此 `data-agent` preset（phase-gate persona + 4 个数据工具）永远不会加入 headless agent。§4.1 禁止修改 dsh 源码（headless bundle 属于 dsh，按 §4.5 不归 da 所有），因此修复方式是一个 da 专用的包装层 seam。

## 如何

一个 Cordis 插件（`inject: ['agentPresets']`），注册一个 `agent/created` 监听器。`agent/created` 在 `setup` 完成之后、首次提示词组装之前触发，因此在此加入的 preset 会在 agent 首次模型请求之前注册其工具、提示词片段和监听器。该监听器：

1. 跳过其 `setup` 已加入 preset 的 agent（`composedPreset` 守卫：幂等，不会重复绑定）。
2. 解析默认 preset（`resolve(undefined)`）；若抛错（无 roster / 未知默认值）则静默跳过，从不强制加入。
3. 挂载默认 preset（`mount(agent.ctx, defaultId)`）。挂载失败（组合损坏）会向上传播以便派发将其上报；随后 agent 以裸方式运行，与现状完全一致。

## 挂载

添加到 data-agent bundle 补丁（`packages/bundle/data-agent/cordis.patch.yml`）：

```yaml
- insert:
    - id: preset-autojoin
      name: '@deepseek-ai/dsh-preset-autojoin'
```

检查组合树：

```sh
pnpm dsh --profile headless --patch packages/bundle/data-agent/cordis.patch.yml --dump-config | grep preset-autojoin
```

## 布局

| 文件 | 职责 |
|---|---|
| `src/index.ts` | `name` / `inject` / `apply` + `createAutojoinListener` 工厂 |
| `tests/autojoin.spec.ts` | 逻辑（resolve→mount、无默认值跳过、已加入跳过、挂载失败传播）+ 组合（真实 `agent/created` 派发） |

## 约束

- §4.1：不修改 dsh 源码，这只是一个新的 da 包。
- §4.2：包装层 seam，注入既有的 `agentPresets` seam；不改变任何 dsh 接口。
- §4.5：da 所有的位置 `packages/data/preset-autojoin/`。

> 注：`agent/created` 派发是同步的，并将监听器返回的 promise 视为即发即弃（拒绝会被上报，但不被等待）。对于一次性 headless 运行，若其唯一的 `followup` 在异步 `presets.mount` 完成之前到达，则加入对首个提示词而言可能太迟（见实验报告）；上游修复（headless `setup` 加入默认 preset）是回退方案。

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 影响

该包的贡献仅追加到可复用请求前缀，不会使既有缓存条目失效。

## 已知限制与延迟工作

- 异步 `presets.mount` 可能在一次性 headless 运行中于首个提示词之后才完成（竞态），因此首个轮次可能在未应用 preset 的情况下运行。
- 挂载失败会向上传播，agent 以裸方式运行而非阻塞。
- 对未定义的 preset 调用 `resolve` 会抛错，目前作为静默跳过被捕获。
