---
description: "data-agent bundle：叠在 dsh-base 之上的 additive patch 层，服务 data-agent profile——禁用 code-agent 面、挂载 phase-1 LLM provider 与已发布的 data 能力插件。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-data-agent`

[English](README.md) | 中文

## 概述

data-agent bundle 是叠加在 `dsh-base` 上的 additive 层。它选择 DashScope 作为默认模型路由，公开 data-agent preset，并挂载已发布的查询、语义层、评测、审计、管理、结果缓存与 Python 执行包。它只禁用 code-agent 专用行，不删除上游配置；embedder 与 retrieval provider 仍为 opt-in。bundle 只拥有组合关系，各挂载包自行拥有运行时与 model-visible 行为。

## 目录

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

未发布运行时 invariant companion，因为 `@deepseek-ai/dsh-data-agent` 不拥有可能与其运行时状态独立发生分歧的可观测关系。

评测运行使用外部 `dsh-eval` host。默认产品 profile 不挂载 `eval-runner-service`，因为已发布包不包含 benchmark case，普通 data-agent session 也不应让评测基础设施常驻。

<a id="dev-note"></a>
## 开发备注

本 bundle 不含运行时代码：`package.json` 的 `dsh.bundle.patch` 字段将 profile composer 指向 `cordis.patch.yml`，`presets/` 则拥有随包发布的两个 data-agent preset 目录。包 manifest 直接声明这些 preset 引用的每个裸插件，使 preset 宿主可以从已安装的 bundle 目录解析各行。patch 从已安装 bundle 的 manifest 解析该目录，因此 preset 发现不依赖进程工作目录。data-agent 阶段决策见 `wayfinder/data-agent/map.md`，各插件的实现历史见 `wayfinder/data-agent/tickets/`。

-----

<a id="model-experience"></a>
## Model Experience

间接：经其禁用与挂载的行——本 bundle 自身不产 model-visible 文本。它挂载 `llm-dashscope`（P2）作为 profile 的直连 LLM，且已发布的 data 能力插件（P4-P11：`query-maxcompute`、`semantic-layer`、`nl2sql-engine`、`schema-gateway`、`evidence-query`、`audit`、`admin`、`result-cache-memory`、`preset-autojoin`、goal/eval 对、`code-runtime-data-python`）各自向组合树贡献其 model-visible schema、prompt 与 tool 定义。部署选择行（`embedder`、`retrieval`）在挂载 provider 前不挂任何东西。

#### KV Cache effect

无直接影响；禁用一行会从组合树移除其 schema 与 prompt section，部署选择注释行在挂载 provider 前不挂任何东西。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **embedder / retrieval 为部署选择**——此两 seam 在 patch 中保持注释；取消注释并挂载具体 provider（如 `embedder-fakehash`/`embedder-http`、`retrieval-inproc`）即可激活。其余 data 能力插件（P4-P11）均已发布并 LIVE 挂载。
- **无 persona**——data-agent persona 归四阶段 preset（P7），不在本 bundle。
- **无驱动**——patch-only 层；运行性来自与 driver bundle 或 P7 preset 组合，而非 `data-agent` profile template（未给 `dsh-app-boot` 加 template）。
