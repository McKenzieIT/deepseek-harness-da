# embedding SOTA / DashScope-AGA intranet 路径 / hybrid RRF（核源）

> P5 调研切片 S3。Scope：2026 embedding-model SOTA + DashScope/**AGA** 内网 embeddings 路径 + hybrid RRF。**不**覆盖 seam 结构（S1）或 TS backend/reranker（S2）。日期：2026-08。标记：**[PRIMARY]** = 一手源（HF card / ModelScope / help.aliyun.com / arXiv / 官方 repo）；**[SECONDARY]** = 引用一手的博客/新闻；**[UNVERIFIED]** = 本会话未能从公开源确认。
> Fetch caveat：`huggingface.co` 与 `qdrant.tech` 在本环境**不可直接抓取**（HF 被 fetch 工具安全检查阻断；qdrant/HF docs 经备用 crawler 返 HTTP 403）。下文 claim 立足于 (i) 可抓一手源（ModelScope model card、docs.aliyun.com、FlagEmbedding repo、arXiv）与 (ii) 对不可抓一手源的多处一致二手引用。每条已标。

---

## Q1 — 2026 embedding SOTA（多语言 / CN）

### Qwen3-Embedding（0.6B / 4B / 8B）— 领先开源、Apache 2.0、decoder-based

一手 model card（可抓，**[PRIMARY]**）：ModelScope `Qwen/Qwen3-Embedding-4B` — https://modelscope.cn/models/Qwen/Qwen3-Embedding-4B — 给出权威 spec 表：

| Model | Size | Layers | Seq len | Embed dim | MRL | Instruction-aware |
|---|---|---|---|---|---|---|
| Qwen3-Embedding-0.6B | 0.6B | 28 | 32K | **1024** | yes | yes |
| Qwen3-Embedding-4B | 4B | 36 | 32K | **2560** | yes | yes |
| Qwen3-Embedding-8B | 8B | 36 | 32K | **4096** | yes | yes |

- MRL ⇒ 维度**可截断**（0.6B→32..1024；4B→32..2560；8B→32..4096）。支持自定义输出维度。**[PRIMARY]** 上表 ModelScope。
- License：**Apache 2.0**（商业免费）。**[PRIMARY]** ModelScope card + 多处二手引 Qwen3-Embedding tech report（如 https://zhidx.com/p/484250.html 、 https://baijiahao.baidu.com/s?id=1834190322458726872 ）。
- 架构：基于 **Qwen3 dense base model**（decoder-only LLM）作 **dual-tower embedder**；配套 Qwen3-Reranker 用 single-tower（cross-encoder）结构。**[PRIMARY]** ModelScope card + Qwen3-Embedding collection https://huggingface.co/collections/Qwen/qwen3-embedding-6841b22d0192d7ade9cdefea （引用；HF card 本会话未直接抓）+ GitHub https://github.com/QwenLM/Qwen3-Embedding 。
- MTEB 分（**[SECONDARY]** 引官方 tech report；8+ 聚合源一致）：
  - **8B: 70.58 on MTEB Multilingual，2025-06-05/06 起 #1**（超 Google Gemini-Embedding）。分项：多语言检索 69.02、中文检索 77.45、英文检索 69.76。MTEB-Code(8B) 80.68。
  - 4B: MTEB(Eng v2) 74.60、C-MTEB 68.09、MTEB-Code 73.50 — **[SECONDARY]** 单博客源（ https://blog.csdn.net/weixin_31597759/article/details/157002984 ），未交叉核。
  - 0.6B C-MTEB：二手帖流转一个 "646.33" 数字但量纲存疑（疑为汇总原始分，非百分比尺度 70.x）— **[UNVERIFIED]**，勿依赖。
- 服务途径：HuggingFace transformers、ModelScope、GitHub、**DashScope API**（见 Q2）、SiliconCloud、vLLM。**[PRIMARY]** ModelScope card + DashScope 在售。
- 发布：2025-06-05/06。**[SECONDARY]** 聚合源一致。

### bge-m3（BAAI）— 轻量多语言 encoder、MIT、1024-dim

**[PRIMARY]** HuggingFace `BAAI/bge-m3` — https://huggingface.co/BAAI/bge-m3 （本会话经 search-side curl 取到 card 元数据：`hidden_size:1024`、`BgeM3Model`、24 层、16 头、vocab 250002 = XLM-RoBERTa tokenizer、MIT license、~6.2M downloads、pipeline `feature-extraction`）：
- Embedding dim **1024**；max input **8192 tokens**；**100+ 语言**。
- **Encoder-only**（XLM-RoBERTa backbone）— 典型 pre-LLM-embedder 架构。
- **多功能**：一模型同时产出 **dense + sparse（词法）+ ColBERT 风格多向量** 检索。
- 论文 **[PRIMARY]** arXiv 2402.03216 — https://arxiv.org/abs/2402.03216 。Repo **[PRIMARY]** https://github.com/FlagOpen/FlagEmbedding 。
- License：**MIT**。

### Decoder-vs-encoder 趋势 — 确认

BGE-M3 = **encoder-only**（XLM-RoBERTa）。Qwen3-Embedding = **decoder-only**（Qwen3 dense LLM，经 dual-tower last-token pooling 复用）。这是有据的行业迁移（encoder → LLM-decoder embedder）：Qwen3-Embedding、GTE-Qwen2、NV-Embed、llama-embed-nemotron、Gemini Embedding 均用 LLM backbone。**[PRIMARY]** 经上述 ModelScope/FlagEmbedding 架构描述。

### Seed1.5-Embedding（ByteDance）— 部分

**[SECONDARY]** 钛媒体报道（2025-05-12）： https://www.tmtpost.com/nictation/7562610.html — "字节跳动 Seed 团队最新向量模型 Seed1.5-Embedding 公布技术细节,该模型在 MTEB 上达到了中英文 SOTA 效果. API 接口将于近期在火山方舟平台开放." ByteDance Seed team 页 **[PRIMARY]**： https://seed.bytedance.com （Seed 团队跨 Doubao/Seed 用 MoE — https://seed.bytedance.com/en/special/doubao_1_5_pro 述 MoE 架构）。Seed1.5-Embedding 精确维度 / MRL 本会话**[UNVERIFIED]** — HF/seed model card 不可抓；MoE/MRL 归属视为合理但未确认。API 路径 = 火山方舟（Volcano Ark），**非 DashScope**。

### 其他 2025-2026 多语言 / CN embedder

- **jina-embeddings-v3** — **[PRIMARY]** HF https://huggingface.co/jinaai/jina-embeddings-v3 + arXiv 2409.10173。570M 参数、**1024-dim**（MRL，可截到 32）、8192 tokens、89 语言、**task-LoRA** 适配器（retrieval/clustering/classification/matching）、XLM-RoBERTa+RoPE（encoder）。
- **NV-Embed-v2**（NVIDIA）— encoder/decoder LLM 混合，per-dataset `instructions.json`。**[SECONDARY]** 见 jina-v3 报道。非 CN 优化。
- **GTE / GTE-Pro / GTE-Large**（阿里 DAMO）— **[SECONDARY]** C-MTEB SOTA 声称（ https://blog.csdn.net/weixin_30021053/article/details/155214522 、 https://blog.csdn.net/weixin_28888459/article/details/157038813 ）。C-MTEB > 65（base）。CN 强。
- **Piccolo2**（SenseTime）— **[SECONDARY]** C-MTEB #1（2024）、512/2K/8K 向量长、arXiv 2405.06932、HF `sensenova/piccolo-large-zh-v2`。
- **Stella / Jasper**（NovaSearch）— **[SECONDARY]** Jasper 2B 蒸馏自 Stella、MTEB #3（2024-12-24，71.54 avg）、HF `NovaSearch/jasper_en_vision_language_v1`。MRL。英文为主。
- **F2LLM-v2 / ML-Embed**（蚂蚁 + 上交，ICML 2026）— **[SECONDARY]** https://arxiv.org/abs/2603.19223 — 3D-Matryoshka（MEL+MLL）、基于 Qwen3-0.6B、"登顶 17 个 MTEB 子榜单"（DE/FR/PL/JP/code 11 冠）。研究模型；2026 前沿相关但不一定生产 / license 不明。
- **llama-embed-nemotron-8b**（NVIDIA）+ **gemini-embedding-001**（Google）— **[SECONDARY]** 一份 2025-10-25 CSDN MTEB 榜单 survey（ https://yunyaniu.blog.csdn.net/article/details/135321099 ）将之与 Qwen3-Embedding-8B 并列为 MTEB 多语言(v2) 实时 top-3。2025 末绝对 #1 有争议；Qwen3-Embedding-8B 仍为 top **开源 Apache-2.0** 条目。

### CN/多语言 data agent 现实选型（内网安全、开源）

- **质量最佳、重**：Qwen3-Embedding-8B（Apache 2.0、MTEB-多语言 70.58、4096-dim MRL、119 语言含代码）。重 = 需 GPU / 外置插件。
- **最佳轻量多语言 encoder**：**bge-m3**（MIT、1024-dim、8192 tokens、100+ 语言、dense+sparse+ColBERT）。仍是最强小开源 encoder；自然 "重模型可选外置插件" 候选。
- **API 路径（无模型下载）**：DashScope `text-embedding-v3`/`v4`（见 Q2）— 但**网络 egress**，除非经内网网关（见 Q3）。

---

## Q2 — DashScope（阿里百炼 / bailian）text-embedding API

DashScope = 阿里 LLM 平台（百炼 / Model Studio）。**[PRIMARY]** https://dashscope.aliyun.com/ 与 https://docs.aliyun.com/zh/model-studio/ （后者经 search 取："百炼兼容 OpenAI 接口规范,只需调整 API Key、base_url 和模型名称,即可将现有 OpenAI 代码迁移至百炼"）。

### 模型清单（text embedding）

合并自多处二手源（均引官方 `help.aliyun.com/zh/model-studio/text-embedding` doc；该 help.aliyun.com 页本会话直接抓返 HTTP 403，故表为 **[SECONDARY]** 但跨 3+ 独立帖一致，如 https://blog.csdn.net/weixin_69334636/article/details/157391659 、 https://blog.csdn.net/jack_ck_/article/details/163644412 、 https://blog.csdn.net/kkddqq1121/article/details/162225812 ）：

| Model | Default dim | Configurable dims | Batch (max texts/req) | Max input tokens | Notes |
|---|---|---|---|---|---|
| `text-embedding-v1` | 1536 | no | 25 | 2048 | legacy，退役中 |
| `text-embedding-v2` | 1536 | 512 / 768 / 1024 | 25 | 2048 | 中 |
| `text-embedding-v3` | **1024** | yes（低至 32） | **10** | **8192** | 强、dim 可定制 |
| `text-embedding-v4` | **1024** | yes（1024 / 1536 / 2048，低至 32） | **10** | **8192** | 最新、支持 **sparse 向量** + task `instruct` |
| `qwen3.7-text-embedding` | configurable | configurable | **20** | **128000** | Qwen3-based、最新 hosted 模型 |
| `text-embedding-async-v1/v2` | 1536 | no | 100,000/file（async） | 2048 | async 批 |

多模态 embedder（独立 API）：`multimodal-embedding-v1`（1024）、`multimodal-embedding-one-peace-v1`（1536）、`tongyi-embedding-vision-plus/flash`（1024）、`qwen2.5-vl-embedding`（1024）。**[SECONDARY]** 同源。

### Endpoint / 协议

- **两条**可达：(a) **OpenAI 兼容**端点（`/v1/embeddings` 风格，OpenAI SDK 设 `base_url` + `api_key` 即用），(b) **native DashScope 协议**经 `dashscope.TextEmbedding.call(model=..., input=..., dimensions=..., text_type=..., instruct=...)`（Python/Java SDK）。**[PRIMARY]** docs.aliyun.com/zh/model-studio OpenAI-compat 声明 + **[SECONDARY]** 上 SDK 调用示例。
- 域：`dashscope.aliyuncs.com`（国内站）与 `dashscope-intl.aliyuncs.com`（新加坡 / 国际）。**[SECONDARY]** https://janus.blog.csdn.net/article/details/157021285 。
- Instruction-aware：`text_type` ∈ {`query`, `document`} 与 `instruct`（任务指令串）。`instruct` 空时 query 与 document 返相同向量。**[SECONDARY]** https://zhuanlan.zhihu.com/p/2012619772995590012 （引 DashScope 行为）。

### 验证状态

API **确实存在**，`text-embedding-v3` / `v4` 模型名真实且现行。精确 per-model 维度/batch 数字为 **[SECONDARY]**（跨源一致引官方 doc；本会话 `help.aliyun.com` 直接抓被 403 阻）。若精确维度对设计 load-bearing，固定 config 默认前须从无限制网络重抓 https://help.aliyun.com/zh/model-studio/text-embedding 。

---

## Q3 — AGA（阿里内网 AGA 网关）embeddings 路径 — **不可验证（关键标记）**

### 公开有据部分

- **AGA 本身并非公开有据的阿里产品。** Baidu 搜 "阿里 AGA 网关" / "Alibaba AGA gateway" / "DashScope intranet" 关于 "AGA" 网关**零**结果。返回的全指 **Higress**、API7/APISIX、LiteLLM、AIClient2API、Hermes Agent、腾讯 "AI Agent 安全网关" 等——无一为 AGA。
- **公开**阿里 AI 网关是 **Higress**（开源、Istio/Envoy-based、Wasm 插件）。**[PRIMARY]** https://github.com/alibaba/higress + https://higress.ai/ 。Higress 明确**支持路由到 DashScope/百炼**，且截至 2026-06/07 其 `ai-security-guard` 插件 "**扩展 Embedding 向量接口内容检测能力**"（即 Higress 现亦拦截/检视 Embedding API 调用）。**[SECONDARY]** https://segmentfault.com/a/1190000047944533 、 https://zhuanlan.zhihu.com/p/2056015270108456133 。这证明*公开*阿里网关能代理 DashScope embeddings——但 **Higress ≠ AGA**。
- 依本任务自身 framing，AGA 是**内部/未公开**内网网关（前置 ticket P2 已确认它经 **native AGA 协议**暴露 DashScope **chat**——非 OpenAI 兼容：无 `[DONE]`、`incremental_output` delta、`requestId` 在错误体）。

### AGA 是否暴露 embeddings 端点？— **公开源不可验证**

**无公开文档**确认 AGA 暴露（或代理）DashScope text-embedding 端点。类比 chat 路径（native AGA 协议、非 OpenAI 兼容），embeddings-via-AGA 路径——若存在——大概率亦走 native AGA 协议（非 OpenAI `/v1/embeddings` 形）。

**勿假设 yes。** 须**像 P2 探 chat 一样 live-probe**：
- 用最小 embeddings 请求探 AGA base URL，观察：(a) 是否存在 embeddings 路由；(b) 请求/响应形（native AGA `input`/`embeddings`/`output` 信封 vs OpenAI `input`/`data[].embedding`）；(c) 接受哪些模型名（`text-embedding-v3`/`v4`？某 Qwen3 变体？）；(d) 是否尊重 `dimensions`/`text_type`/`instruct`；(e) 错误体形（`requestId`？）。
- 探明前，安全设计假设：**AGA chat 已确认；AGA embeddings 假设性。**

### 内网安全默认 embedder — 决策含义

- 若 AGA embeddings **live-确认**："DashScope text-embedding-v3/v4 经 AGA" 成理想内网安全默认（无模型下载、无 egress、强质量）。
- 若 AGA embeddings **不可用**：默认 embedder 不能是 "DashScope 经 AGA"。退路 (a) 预打包本地 ONNX embedder（见 Q4——仍须随包发模型 artifact = repo 膨胀 + IP 副本顾虑），或 (b) zero-dependency **hash-embedding stub** 供 wiring/测试（见 Q4），直到显式配置某外置 embedder 插件（bge-m3 / Qwen3-Embedding / DashScope-public）。

---

## Q4 — 本地 embedder 无运行时下载

### transformers.js（`@xenova/transformers` / `@huggingface/transformers`）/ onnxruntime-node

- Transformers.js 在 Node.js **本地**跑 ONNX 模型（无外部推理 API）。**[SECONDARY]** https://www.promptfoo.dev/docs/providers/transformers/ （"running ONNX-optimized models directly in Node.js without external APIs"）。
- **默认行为 = 运行时从 huggingface.co CDN 拉取。** Transformers.js 首次用时从 `huggingface.co` 拉 ONNX 权重（缓存于 `env.cacheDir`）。此为**网络 egress = 违反内网默认**，除非显式禁用。
- 离线控制（`env` 对象上的 env vars）：**`env.allowRemoteModels`**（默认 `true`—设 `false` 禁 CDN 拉）、**`env.localModelPath`**（预打包 ONNX 模型目录）、**`env.cacheDir`**（缓存位）、**`env.useBrowserCache`/`env.useFSS`**（Node FS 缓存）。设 `allowRemoteModels=false` + 预打包 ONNX 于 `localModelPath` 即**全离线**推理。**[UNVERIFIED-by-primary-fetch]** 本会话 HF docs（`huggingface.co/docs/transformers.js`）与 GitHub README（`raw.githubusercontent.com/huggingface/transformers.js`）皆被阻（403 / safety-block）；env-var 名与该库有据设计及 promptfoo provider 指南一致，但精确默认值在从可抓镜像（如 jsr/npm pkg 或干净重抓 HF docs）复核前视为 **secondary**。
- `onnxruntime-node` 同理：runtime 是 dep，但**模型权重**仍须来自某处——要么运行时 HF 拉，要么预打包 artifact。

### 结论：无本地 embedder 运行时真正零下载（除非预打包）

- `all-MiniLM-L6-v2` / `bge-small-en` / `bge-small-zh` 经 transformers.js **要么运行时从 huggingface.co 拉（egress）要么 repo 预打包 ONNX artifact**。
- 预打包模型 artifact = **repo 膨胀**（即便 q8 MiniLM ~25–80 MB；bge-small ~130 MB）+ **IP 副本顾虑**（须镜像 license + 署名；MIT/Apache OK 但仍是刻意打包行为）。
- 故 **zero-dependency / clone-and-run 默认**不能是真实神经 embedder。须是**stub**——产*某*向量但无模型 artifact——而真 embedder（bge-m3 / Qwen3-Embedding / DashScope）为**可选外置插件**（契合任务常设约束）。

### Hash-embedding stub — 模式先例

- 模式（token 确定性 hash → 定维向量、零模型下载、低但非零语义质量、宜 wiring/测试）是经典 **"hashing trick"**（Weinberger et al., 2009, *Feature Hashing for Large Scale Multimodal Learning*）。是内网安全默认 / 测试 fixture 的合理、有先例 stub。
- 具名引用 **"AgenticRec `HashEmbedding`"** 本会话**未能从公开源一手核验**（Google 对 `"AgenticRec" HashEmbedding` 零命中）。**[UNVERIFIED]**—视为前置内部笔记，非可引公开先例。*模式*成立；*具体归属*不成立。

---

## Q5 — Hybrid retrieval：RRF + rerank-after-RRF

### RRF 公式与默认 k

**公式**（**[PRIMARY]** 原始论文 + 多家厂商 doc）：
```
RRF_score(d) = Σ_i  1 / (k + rank_i(d))
```
其中 `rank_i(d)` 为文档 `d` 在 retriever `i` 结果列表中的排名（1-indexed）。

**默认 k = 60。** **[PRIMARY]** Cormack, Clarke, Büttcher, "Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods", SIGIR 2009 — https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf 。k=60 默认被 Azure AI Search（ https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking ）、Elasticsearch（ https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html ）、OpenSearch（ https://opensearch.org/docs/latest/search-plugins/hybrid-search/ ）、Qdrant（ https://qdrant.tech/articles/hybrid-search/ — 本会话直接抓 403，但 search snippet 确认公式 + k=60）、Pinecone、LangChain（`EnsembleRetriever`/RRF）重申。CSDN 走查引同公式 + k=60（"平滑常数,通常取 60,避免头部结果垄断"）— https://blog.csdn.net/m0_67391870/article/details/162007647 。

关键性质：RRF 仅用**排名**（非原始分），绕开 BM25-unbounded vs cosine-[-1,1] 分数尺度不兼容——正是其为 canonical 融合之选的因。**[SECONDARY]** https://zhuanlan.zhihu.com/p/2004247034740360523 。

### rerank-after-RRF 是否 canonical 2026 hybrid pipeline？

是——canonical 2026 hybrid 检索 pipeline 为：

```
BM25 (sparse)  ┐
               ├─→  RRF (k=60)  ─→  top-N  ─→  [optional] cross-encoder reranker  ─→  final top-K
dense embedder ┘
```

- RRF 作融合阶段是事实标准（Azure/Elasticsearch/OpenSearch/Qdrant/LangChain 均原生支持）。
- RRF 后**可选 reranker** 是标准精修（如 Qwen3-Reranker / bge-reranker / cohere-rerank）。Qdrant 自家 hybrid-search 文将 rerank 定位为可选 post-fusion 步。**[SECONDARY]**（Qdrant 文未直接抓；search snippet + 多 RAG 帖确认）。
- Rerank-then-RRF *非* 标准（reranker 是精修阶段，非融合阶段）；序为 fusion-then-rerank。

### 先例

- **WeKnora（Tencent）** — **[PRIMARY]** 开源 RAG 框架。GitHub `Tencent/WeKnora`。**[SECONDARY]** 描述： https://zhuanlan.zhihu.com/p/1953185503147954308 、 https://zhuanlan.zhihu.com/p/1983816884152463068 — hybrid 检索 = **关键词(BM25) + 向量(dense) + 知识图谱(GraphRAG)** 三路召回，再 rerank+generate。支持 PostgreSQL/pgvector + Elasticsearch、可插拔 embedder（本地或 BGE/GTE API）、Qwen/DeepSeek LLM。报 "+15–30% precision vs pure-vector"。
- **Qdrant** — 原生 hybrid query（sparse BM25 + dense → RRF）。**[PRIMARY]** https://qdrant.tech/articles/hybrid-search/ （公式 + k，见上）。
- **Azure AI Search / Elasticsearch / OpenSearch** — 原生 RRF（k=60）作 BM25+kNN 融合。**[PRIMARY]** 上厂商 doc URL。
- **INDUS dense + BM25 via RRF** — 已发表研究先例（arXiv 2608.13867, "Engineering Reliable Coding Agents"，retrieves over code）。**[SECONDARY]** search snippet。
- **Cursor（Merkle + BM25 + dense）** — 本会话 **[UNVERIFIED]**。Cursor codebase-retrieval 内部未公开详记；"Merkle 树增量同步 + BM25 + dense" 刻画本会话未能从 Cursor 工程博客一手核验。视为 **secondary/传闻**；无一手 Cursor 源前勿作硬先例引。
- **OpenLore（clay-good）** — **[SECONDARY]** https://github.com/clay-good/OpenLore — "Keyword (BM25) is the first-class default; semantic is an opt-in upgrade... hybrid dense+BM25" — 契合内网默认哲学（BM25 无需 embedder，故为真·零下载检索默认；dense 为升级）。

---

## Direct answers to P5 grounding questions

- **Q1（2026 embedding SOTA）。** Qwen3-Embedding（0.6B dim-1024 / 4B dim-2560 / 8B dim-4096、皆 32K、MRL、instruction-aware、**Apache 2.0**、**decoder-only** Qwen3-base、119 语言）— **8B = 70.58 MTEB 多语言，2025-06-05 起 #1**；MTEB-Code 80.68。一手：ModelScope `Qwen/Qwen3-Embedding-4B` + GitHub `QwenLM/Qwen3-Embedding`。bge-m3（BAAI、MIT、**1024-dim**、8192 tokens、100+ 语言、encoder XLM-RoBERTa、dense+sparse+ColBERT、arXiv 2402.03216）仍为轻量多语言 encoder。Seed1.5-Embedding（ByteDance、MTEB 中英 SOTA、API 在火山方舟）存在但精确维度/MRL **未核**。2025 末 NVIDIA `llama-embed-nemotron-8b` + Google `gemini-embedding-001` 争绝对 #1，但 Qwen3-Embedding-8B 仍为 top **开源 Apache-2.0** 条目。Decoder-vs-encoder 趋势**确认**（BGE encoder → Qwen3 decoder）。CN/多语言 data agent 现实选：Qwen3-Embedding-8B（质量）或 bge-m3（轻量）。

- **Q2（DashScope text-embedding API）。** **存在。** 模型：`text-embedding-v1`（1536、batch 25、2048tok）、`v2`（1536、512/768/1024、batch 25、2048tok）、`v3`（**1024** +可配至 32、batch **10**、**8192tok**）、`v4`（1024/1536/2048 +sparse+task `instruct`、batch 10、8192tok）、`qwen3.7-text-embedding`（可配、batch 20、**128000tok**）、async-v1/v2（100k/file）。端点：**既 OpenAI 兼容**（`/v1/embeddings`）**又 native DashScope**（`dashscope.TextEmbedding.call`，参 `dimensions`/`text_type`{query,document}/`instruct`）。域 `dashscope.aliyuncs.com`。一手：docs.aliyun.com/zh/model-studio（OpenAI-compat 确认）；per-model 表为 **[SECONDARY]**（本会话 help.aliyun.com 403 阻，跨 3+ 源一致）。固定精确维度前重抓 `help.aliyun.com/zh/model-studio/text-embedding`。

- **Q3（AGA embeddings 经内网网关）。** **公开源不可验证——勿假设 yes。** AGA 非公开有据（Baidu "阿里 AGA 网关" 零 AGA 结果）。**公开**阿里网关是 **Higress**（Istio/Envoy、Wasm、开源、github.com/alibaba/higress），它 DO 路由 DashScope 且（2026-06/07 起）检视 Embedding API 调用——但 Higress ≠ AGA。AGA 是否代理 DashScope embeddings 端点（及何协议——大概率 native AGA、非 OpenAI 形）**须像 P2 探 chat 一样 live-probe**。安全设计假设：AGA-chat 已确认、AGA-embeddings 假设性。

- **Q4（本地 embedder 无运行时下载）。** transformers.js / onnxruntime-node **本地**跑 ONNX 但**默认从 huggingface.co 拉权重**（egress）。离线须 `env.allowRemoteModels=false` + 预打包 ONNX 于 `env.localModelPath`/`env.cacheDir`——即**无本地神经 embedder 真正零下载**，除非随包发模型 artifact（repo 膨胀 + IP 副本；MiniLM-L6 ~25–80MB、bge-small ~130MB）。故 clone-and-run **默认须是 zero-dep stub**，非真 embedder；bge-m3 / Qwen3-Embedding / DashScope 为**可选外置插件**。Hash-embedding stub 模式有先例（Weinberger 2009 "hashing trick"）且合理；具体 **"AgenticRec `HashEmbedding`" 归属未核**（公开无匹配）——引模式，不引名。

- **Q5（hybrid RRF）。** 公式 `score(d)=Σ 1/(k+rank_i(d))`，**k=60** 默认（Cormack et al. SIGIR 2009， https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf ）。Rerank-**after**-RRF 是 canonical 2026 pipeline：BM25 + dense → RRF(k=60) → 可选 cross-encoder reranker → final top-K。仅排名融合绕开 BM25-unbounded vs cosine-[-1,1] 尺度冲突。先例：WeKnora（Tencent、BM25+dense+GraphRAG、github Tencent/WeKnora）、Qdrant/Azure/Elasticsearch/OpenSearch（原生 RRF k=60）、INDUS+BM25 RRF（arXiv 2608.13867）。**Cursor "Merkle+BM25+dense" 本会话未核**——无一手 Cursor 源。BM25 单独即真·零下载检索默认（契合内网默认哲学）；dense 为升级。

---

## 用户域知识订正（2026-08-20，grilling D3）

> 用户（域专家）订正：**此处的 DashScope 是经内部 AI 网关（AGA）中转的，非公网 DashScope**。AGA 是一层 relay/proxy——公网 DashScope 有 text-embedding **不**意味着 AGA 中转路径能提供 embedding 能力。AGA 已 live-确认暴露 DashScope **chat**（P2 native AGA 协议），但 **embeddings 是否被中转 = 未知、且不应假设 yes**（内部网关可能只 relay chat，或只 relay 其配置的子集能力）。

**对 D3 的强化**：
- **默认假设 AGA-embeddings = NO**（非"假设性 yes 待证"，而是"默认 no 待证"）。
- 故 intranet 的重 embedder 路径**不能免费搭 AGA**（chat 能搭、embeddings 未必）——若要 intranet 内用真 embedder，须部署**独立内网推理服务**（Infinity/TEI/Ollama sidecar 跑 bge-m3/Qwen3），**或** AGA-embeddings live-probe 确认 yes（bonus，可省一个 sidecar）。
- D3 外置 embedder 插件设计硬约束：插件是**通用 OpenAI 兼容 `/v1/embeddings`**，URL 由用户配；intranet 默认指向独立推理服务，**不假设 AGA-embeddings**。
- AGA-embeddings live-probe 仍为独立 task，但**默认期望 no**。
