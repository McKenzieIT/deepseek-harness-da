# `@deepseek-ai/dsh-data-agent`

[English](README.md) | 中文

data-agent bundle：叠在 [`dsh-base`](../base/README.md) 之上的 additive patch 层，服务 `data-agent` profile。[`cordis.patch.yml`](cordis.patch.yml) 禁用 code-agent 面——`tool-str-replace-editor` 与 `tool-ralph` 两行，加 `tools.mode: native` 关 Code Mode——disable-only、不删，上游 `dsh-base` 重排也不会让它重现。它挂载 phase-1 的 `llm-dashscope` provider（P2 resolved）——一个带包 `name:` 的 `- insert:` 行加一个把 profile 默认设为 `aga`/`qwen3.7-max` 的 `agent-default-model` 行——并预留一块注释占位的 `insert` 块，待其余 data 能力插件包就绪后挂载（P4-P11：query/retrieval/embedder/semantic-layer/audit/admin，加 phase-1 的 `subagent-qoder`）。data 插件行保持注释，因为指向尚未发布包的 bare specifier 会炸 `pnpm install` 与 `verify-cordis-config`；包就绪后再取消注释并填 `name:`。data-agent 的 persona 不在此设——归四阶段 preset（P7）。`tool-bash` 与 `code-runtime` 是 data agent 自用的执行后端（map Q9）；此处保持启用，业务用户的门禁在 P10 内网工具层做，不在本 bundle。

本包无运行时 API；profile composer 经 `dsh.bundle.patch` manifest 字段解析 patch，不经代码。用 `dsh --profile headless --patch ./packages/bundle/data-agent/cordis.patch.yml --dump-config` 查组合后的树。独立的 `data-agent` profile 在四阶段 preset 及其驱动就绪后，经 out-of-tree `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` 创建；本 bundle 刻意不碰 shared boot glue，保上游升级路径。

## Model Experience

间接：经其禁用与挂载的行——本 bundle 自身不产 model-visible 文本。它挂载 `llm-dashscope`（P2）作为 profile 的直连 LLM；其余 data 能力插件待 P4-P11 填充预留块后挂载。

#### KV Cache effect

无直接影响；禁用一行会从组合树移除其 schema 与 prompt section，预留（注释）行当前不挂任何东西。

## Known Limitations and Deferred Work

- **当前不挂任何 data 能力插件**——`llm-dashscope`（P2）已挂载为 profile 的 LLM provider，但 data 能力行（query/retrieval/embedder/semantic-layer/audit/admin）与 `subagent-qoder`（P3）仍为注释占位；待对应 ticket（P4-P11、P3）发包后再取消注释并填 `name:`。
- **无 persona**——data-agent persona 归四阶段 preset（P7），不在本 bundle。
- **无驱动**——patch-only 层；运行性来自与 driver bundle 或 P7 preset 组合，而非 `data-agent` profile template（未给 `dsh-app-boot` 加 template）。
