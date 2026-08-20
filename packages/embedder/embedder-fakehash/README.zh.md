# @deepseek-ai/dsh-embedder-fakehash

[English](README.md) | 中文

零依赖 FakeHash 嵌入器提供方（确定性 sha256 哈希向量）+ FakeReranker 对等方，用于数据代理的检索管线（P5b 默认梯度）。

## 概述

提供 `FakeHashEmbedder`——一个零依赖提供方，根据输入文本的 sha256 哈希生成确定性向量。配合 `FakeReranker` 作为默认重排对等方。这是启动时的默认配置：无需外部嵌入服务即可使检索正常工作，但以语义质量为代价。

## Model Experience

无，因为确定性 sha256 哈希向量 stub 和 token-recall 重排器不加载模型，不注册任何 prompt、tool、schema 或 session 事件，且其向量与分数输出从不进入模型上下文。

#### KV Cache effect

无直接影响；哈希向量和召回分数服务于检索相似度，不进入 LLM 上下文。

## Known Limitations and Deferred Work

- **语义质量弱** — FakeHash 生成确定性但非语义向量（基于 sha256）；排序质量低是设计预期。这是默认梯度的有意选择：保证检索功能无需外部服务即可运行，但结果缺乏真实的语义相似度。
- **生产环境应升级到真实嵌入器** — 生产负载应挂载 `embedder-http`（InfinityEmbedder）或未来的 sidecar 提供方以获得有意义的向量相似度。
- **FakeReranker 是直通** — 配套的重排器不应用任何学习评分；它仅为在默认梯度满足 Reranker 协议契约而存在。
- **D2 keep/regress 评估驱动激活** — 混合检索（依赖嵌入器质量）是否默认激活延后至 D2c 评估结果。
