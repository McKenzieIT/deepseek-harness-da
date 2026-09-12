---
description: "data-agent bundle：叠在 dsh-base 之上的 additive patch 层，服务 data-agent profile——禁用 code-agent 面、挂载 phase-1 LLM provider 与已发布的 data 能力插件。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-data-agent`

[English](README.md) | 中文

## 概述

data-agent bundle：叠在 [`dsh-base`](../base/README.zh.md) 之上的 additive patch 层，服务 `data-agent` profile。[`cordis.patch.yml`](cordis.patch.yml) 禁用 code-agent 面——`tool-str-replace-editor` 与 `tool-ralph` 两行，加 `tools.mode: native` 关 Code Mode——disable-only、不删，上游 `dsh-base` 重排也不会让它重现。它挂载 phase-1 的 `llm-dashscope` provider（P2）——一个带包 `name:` 的 `- insert:` 行加一个把 profile 默认设为 `aga`/`qwen3.7-max` 的 `agent-default-model` 行——并以 LIVE 行挂载已发布的 data 能力插件（P4-P11）：`query-maxcompute`、`scope-registry`、`semantic-layer`（含其 `llm-wiring-plugin`）、`schema-gateway`、`evidence-query`（含 `gateway`）、`client-ui-semantic-layer`、`eval-runner-service`、`goal-eval-policy`、`goal-eval-context`、`audit`、`nl2sql-engine`、`admin`、`result-cache-memory`、`code-runtime-data-python` 与 `preset-autojoin`。仅 opt-in / 部署选择行——`embedder`、`retrieval`——保持注释：取消注释并挂载具体 provider 即可激活这些 seam；指向尚未发布包的 bare specifier 仍会炸 `pnpm install` 与 `verify-cordis-config`。data-agent 的 persona 不在此设——归四阶段 preset（P7）。`tool-bash` 与 `code-runtime` 是 data agent 自用的执行后端（map Q9）；此处保持启用，业务用户的门禁在 P10 内网工具层做，不在本 bundle。

本包无运行时 API；profile composer 经 `dsh.bundle.patch` manifest 字段解析 patch，不经代码。用 `dsh --profile headless --patch ./packages/bundle/data-agent/cordis.patch.yml --dump-config` 查组合后的树。独立的 `data-agent` profile 在四阶段 preset 及其驱动就绪后，经 out-of-tree `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` 创建；本 bundle 刻意不碰 shared boot glue，保上游升级路径。

## 目录

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

间接：经其禁用与挂载的行——本 bundle 自身不产 model-visible 文本。它挂载 `llm-dashscope`（P2）作为 profile 的直连 LLM，且已发布的 data 能力插件（P4-P11：`query-maxcompute`、`semantic-layer`、`nl2sql-engine`、`schema-gateway`、`evidence-query`、`audit`、`admin`、`result-cache-memory`、`preset-autojoin`、goal/eval 对、`code-runtime-data-python`）各自向组合树贡献其 model-visible schema、prompt 与 tool 定义。部署选择行（`embedder`、`retrieval`）在挂载 provider 前不挂任何东西。

#### KV Cache effect

无直接影响；禁用一行会从组合树移除其 schema 与 prompt section，部署选择注释行在挂载 provider 前不挂任何东西。

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **embedder / retrieval 为部署选择**——此两 seam 在 patch 中保持注释；取消注释并挂载具体 provider（如 `embedder-fakehash`/`embedder-http`、`retrieval-inproc`）即可激活。其余 data 能力插件（P4-P11）均已发布并 LIVE 挂载。
- **无 persona**——data-agent persona 归四阶段 preset（P7），不在本 bundle。
- **无驱动**——patch-only 层；运行性来自与 driver bundle 或 P7 preset 组合，而非 `data-agent` profile template（未给 `dsh-app-boot` 加 template）。

<a id="dev-note"></a>
## 开发备注

本 bundle 无代码——`package.json` 的 `dsh.bundle.patch` 字段将 profile composer 指向 `cordis.patch.yml`，一切挂载与禁用皆在该 YAML。改动归 YAML，绝不写 TypeScript。data-agent 阶段决策见 `wayfinder/data-agent/map.md`，各插件的实现历史见 `wayfinder/data-agent/tickets/`。
