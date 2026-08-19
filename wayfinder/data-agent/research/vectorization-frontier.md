# 向量化（Embedding/检索）前沿实践调研 —— deepseek-harness-da wayfinder

> 调研日期：2026-08-19。方法：web 检索（baidu/google）+ 二手文章对源码/配置的引用。已尽量回溯到 repo 路径 / 配置 / 源码片段级别，但部分结论来自社区解读（已在文中标注"解读/推断"）。GitHub 直连在本环境被 403/网络策略阻断，未能逐字核对仓库源码；引用的源码片段来自社区源码分析文章，已在每条标注出处，需后续在能访问 GitHub 时二次校验。

---

## 0. 一句话结论（先看这个）

前沿 data/RAG/NL2SQL agent 普遍把 **embedding 模型 + 向量库 + retriever 做成"可插拔 provider/seam"**（WrenAI 的 `providers/embedder/`、SuperSonic 的 `EmbeddingMapper` SPI、Vanna 的 mixin、LangChain 的 `Embeddings`/`VectorStore`/`Retriever` 抽象、Spring AI 的 `EmbeddingModel`/`VectorStore`、AgenticRec 的 `VectorBackend` 协议）。**embedder 进程内 vs 外置不是非此即彼，而是"接口在 harness 内、实现可换"**：轻量/边缘/单机自托管倾向进程内（ChromaDB / sqlite-vec / zvec / Ollama embed），生产/多租户倾向外置 sidecar（Qdrant / Milvus / pgvector）。**对我们 deepseek-harness-da（一切皆插件、无特权内核、additive-only）的推荐：把 `ctx.embedder` + `ctx.retrieval` 做成 capability seam，默认给一个进程内轻量实现（sqlite-vec 或 Chroma 风格的 in-proc 默认 backend），把重模型（bge-m3 / Qwen3-Embedding）走外置 OpenAI 兼容 API 或本地 Ollama sidecar，hybrid 检索（BM25 + 向量 + reranker）作为 retriever 插件组合，而非写死在 agent core。** 详见第 7 节。

---

## 1. 前沿 data/RAG/NL2SQL agent 怎么做向量化

### 1.1 WrenAI（Canner/WrenAI）—— GenBI agent，三服务架构 + provider 模式

**架构（事实）**：WrenAI 由三个服务组成——Wren UI（前端）、**Wren AI Service**（`wren-ai-service`，Python，核心 AI 推理）、Wren Engine（数据查询/计算）。另有 Qdrant 向量库容器、Ibis Server（数据访问抽象）。[baike.baidu.com/item/Wren AI](https://baike.baidu.com/item/Wren%20AI/67373145)、[CSDN gitblog_00044](https://blog.csdn.net/gitblog_00044/article/details/159421630)

**向量库（事实）**：Qdrant，作为独立容器运行。配置片段（来自社区部署文章，引用 `config.yaml`）：
```yaml
type: document_store
provider: qdrant
location: http://qdrant:6333
embedding_model_dim: 1024
```
[知乎 deepseek+aliyun 启动 WrenAI](https://zhuanlan.zhihu.com/p/1906643604983777123)

**Embedder（事实，关键）**：embedder 是 **provider 模式**，代码位于 `wren-ai-service/src/providers/embedder/`，已有 `openai.py`，用户可加 `openai_like.py` 自定义 provider。配置用 `EMBEDDER_PROVIDER=openai_like_embedder`、`EMBEDDING_MODEL=bge-m3`、`EMBEDDING_MODEL_DIMENSION=1024`。也支持 `litellm_embedder`（走 LiteLLM 统一接口，可接 OpenAI/Aliyun DashScope `text-embedding-v3`）。[CSDN m0_74825360 自定义模型部署](https://blog.csdn.net/m0_74825360/article/details/145787237)、[CSDN m0_54804970](https://blog.csdn.net/m0_54804970/article/details/145288273)、[知乎 deepseek+aliyun](https://zhuanlan.zhihu.com/p/1906643604983777123)

**检索 pipeline（事实）**：`src/pipelines/generation/` 下有 `intent_classification.py`、`sql_generation.py`、`chart_generation.py`。意图分类流程：`query_embedding = await self.embedder.run(query)` → `tables = await self.table_retriever.run(query_embedding, project_id)` → LLM 分类意图。即 **embedder 是 provider 接口、retriever 是 pipeline 节点、Qdrant 是外置 sidecar**。[CSDN gitblog_00567](https://blog.csdn.net/gitblog_00567/article/details/154565807)

**reranker（稀薄）**：社区资料未明确提及 WrenAI 内置 reranker；官方强调"语义索引 + 精心设计的 UI/UX"和"向量库索引/分块策略"。推断：WrenAI 目前以向量检索为主，rerank 不在公开主线（需源码核验）。

### 1.2 SuperSonic（tencentmusic/supersonic）—— Chat BI + Headless BI，Java SPI 可插拔

**架构（事实）**：Java 项目，"被设计为可插拔的框架，采用 **Java SPI 机制**来扩展定制功能"。融合 Chat BI（LLM Text2SQL）与 Headless BI（语义层）。Schema 元素存于 `s2_metric`/`s2_dimension`/`s2_term`/`s2_tags` 表。[知乎 北方的郎 SuperSonic](https://zhuanlan.zhihu.com/p/707127840)、[CSDN xyghehehehehe](https://blog.csdn.net/xyghehehehehe/article/details/162794320)

**向量化机制（事实，关键）—— EmbeddingMapper**：工作流第一环节是"模式映射 Schema Mapping"，把用户文本映射到 SchemaElement。Mapper 实例通过 SPI 从 `spring.factories` 自动加载。其中 `EmbeddingMapper extends BaseMapper implements SchemaMapper`，`doMap()` 逻辑：
1. `query from embedding by queryText` → `EmbeddingMatchStrategy.getMatches()` 返回 `List<EmbeddingResult>`（每个带 `id`/`metadata{dataSetId,type}`/`similarity`/`detectWord`）
2. 据 `Retrieval.getLongId()` 还原 elementId/dataSetId，查 `SemanticSchema` 拿到 `SchemaElement`
3. 构造 `SchemaElementMatch`，`addToSchemaMap()`

[知乎 SuperSonic EmbeddingMapper 源码分析(二)](https://zhuanlan.zhihu.com/p/1900958331763426003)、[知乎 SuperSonic 技术调研 debug](https://zhuanlan.zhihu.com/p/1910352988733699480)

**解读**：SuperSonic 把"语义层条目向量化 + 检索"做成了**一个 SPI 插件 EmbeddingMapper**，和关键词 mapper 等并列；embedding 模型与向量存储的具体选型在资料中未展开（社区文章聚焦 mapper 流程），需源码核验 `EmbeddingMatchStrategy`/`Retrieval` 的后端实现。但"向量化作为可插拔 mapper"这个 seam 形态是确证的。

### 1.3 Vanna（vanna-ai/vanna）—— 轻量 RAG 框架，mixin + 进程内默认

**架构（事实）**：Python RAG 框架，MIT 许可。核心是 `VannaBase` 抽象基类 + **mixin 多继承**组合 LLM 与向量库：`class MyVanna(ChromaDB_VectorStore, OpenAI_Chat)`。训练阶段把 DDL / 文档 / SQL 问答对 embedding 后存向量库；查询阶段 query embedding → 向量库语义检索 → 组装 prompt → LLM 生成 SQL。[CSDN 2401_84204207](https://blog.csdn.net/2401_84204207/article/details/147350239)、[知乎 Jackie_vip](https://blog.csdn.net/Jackie_vip/article/details/140793755)、[volcengine 7535551300660150308](https://developer.volcengine.com/articles/7533551300660150308)

**向量库与 embedder（事实）**：默认 **ChromaDB**（进程内、本地文件、默认用 sentence-transformers 做 embedding，也支持 OpenAI/Cohere/自定义 embedding）。还可换 FAISS、Pinecone、PGVector、Milvus、Weaviate。[CSDN weixin_37438128](https://blog.csdn.net/weixin_37438128/article/details/160355065)、[CSDN qq_44810930 Chroma](https://blog.csdn.net/qq_44810930/article/details/153355800)

**reranker（事实，部分）**：开源核心 Vanna 基本靠向量相似度；百度百科条目描述一种"LLM 提取关键词 → TextDB 文本匹配 + VectorDB 向量检索 → 对检索结果重排序"的变体流程，但这是企业/衍生形态，非开源主线。[baike.baidu.com/item/Vanna AI](https://baike.baidu.com/item/Vanna%20AI/67357070)

**解读**：Vanna 是"进程内 embedder + 进程内向量库"路线的典型——为了"可自托管、可离线、数据不出本地"刻意保持轻量；embedding 重模型可通过 OpenAI 兼容 API 外置。

### 1.4 LangGraph / LangChain RAG agent —— 抽象 seam + 状态图编排

**架构（事实）**：LangGraph 是状态图（StateGraph）编排器，RAG 能力由 LangChain 组件拼装：`Document Loader` → `Text Splitter` → `Embeddings` → `VectorStore` → `Retriever` → `LLM`。**`Embeddings`、`VectorStore`、`Retriever` 都是抽象基类（pluggable capability seam）**，实现可换：OpenAI/HuggingFace/Ollama/DashScope embeddings，Chroma/FAISS/Redis/PGVector/InMemoryVectorStore。Self-RAG 官方示例明确"支持本地 LLM 和嵌入模型，适合离线/隐私场景"。[CSDN weixin_31236533](https://blog.csdn.net/weixin_31236533/article/details/141304844)、[知乎 p_25038610889](https://zhuanlan.zhihu.com/p/25038610889)、[知乎 p_1899823367005111611 Self-RAG](https://zhuanlan.zhihu.com/p/1899823367005111611)、[知乎 p_1932768609312157908](https://zhuanlan.zhihu.com/p/1932768609312157908)

**进阶检索模式（事实）**：CRAG（检索评估器打分 + web 搜索回退）、Self-RAG（自反思）、Adaptive RAG（查询复杂度路由）、MultiQueryRetriever、RAG-Fusion（RRF 融合）、LongRAG（大块）。这些是**编排模式**，叠在 pluggable embedder/retriever 之上。[CSDN m0_59235945](https://blog.csdn.net/m0_59235945/article/details/139332823)、[知乎 p_717626094 C-RAG](https://zhuanlan.zhihu.com/p/717626094)、[hub.baai.ac.cn/view/37287](https://hub.baai.ac.cn/view/37287)

**解读**：LangGraph 自己不"拥有"embedder；它是把 Embeddings/Retriever 作为 capability seam 的最强先例——正是我们想要的 `ctx.embedder`/`ctx.retrieval` 形态。

---

## 2. agent harness/框架如何集成向量化

### 2.1 DeepSeek Harness 本身（我们的基座）—— 一切皆插件

**架构（事实，关键）**：dsh 是"**everything is a plugin / There is no privileged core to patch**"的微内核式 agent runtime。`ctx.llm`/`ctx.tools`/`ctx.sessions`/`ctx.agentLoop`/`Filesystem`/`Sandbox`/`Subagent provider`/`Prompt assembly` 全部可换。Cordis Runtime 提供 Plugin/Context/Service Dependency/Typed Event/Reversible Effect。"Tool 描述'我要什么能力'，Provider 决定'能力在哪里执行'"。[知乎 p_2071577828743722055 dsh 实测](https://zhuanlan.zhihu.com/p/2071577828743722055)、[知乎 question/2071348486667237276](https://www.zhihu.com/question/2071348486667237276/answer/2071356246079411307)

**解读（对我们 ⑤b 的直接含义）**：`ctx.embedder`/`ctx.retrieval` 天然就是另一个 provider/service，与 `ctx.llm`/`ctx.fs` 同构。harness 不需要"决定进程内还是外置"，它只需要定义**能力契约**，实现交给插件。这与 AgenticRec 的 `VectorBackend` 协议、WrenAI 的 `providers/embedder/`、LangChain 的 `Embeddings` 抽象完全同构。

### 2.2 Claude Code / Cline —— 刻意拒绝进程内向量 RAG（重要反例）

**Claude Code（事实）**：Boris Cherny 在 2025-05 访谈中说明，Claude Code 早期试过 RAG + 本地向量库，但内部 benchmark 发现 **agentic search（让模型自己 grep/glob/read）"性能大幅超越其他方案"**，于是放弃索引，定位为"Unix 工具"。四层架构，不建持久索引。[知乎 p_2045576810549736378 Claude Code 为什么放弃 RAG](https://zhuanlan.zhihu.com/p/2045576810549736378)、[PageIndex 受 Claude Code 启发](https://zhuanlan.zhihu.com/p/2001069445968332432)

**Cline（事实）**：官方博客明确"**故意不索引代码库**"，理由三条：(1) chunking 破坏代码逻辑完整性；(2) 索引是时间冻结快照，代码演变导致索引衰减；(3) 向量嵌入是 IP 的第二副本，安全攻击面翻倍。改用"开发者式探索"（read/grep 工具）。[知乎 p_1939797227364124371 Cline 不索引](https://zhuanlan.zhihu.com/p/1939797227364124371)、[知乎 p_1919489523823407360](https://zhuanlan.zhihu.com/p/1919489523823407360)

**Cursor（对照，事实）**：走 Codebase Indexing——Merkle 树增量索引 + Turbopuffer 向量库，**BM25 + 稠密向量混合检索**，embedding 层可换 OpenAI/VoyageAI/Gemini/Ollama。[知乎 p_2045576810549736378 表格](https://zhuanlan.zhihu.com/p/2045576810549736378)、[简书 p_1794cc9bcd5a](https://www.jianshu.com/p/1794cc9bcd5a)

**MCP sidecar 模式（事实，关键）**：当 Claude Code/Cline 用户想要向量 RAG 时，社区通过 **外部 MCP server** 注入（如 `semantic-context-mcp`、`EchoVault` 用本地 Ollama 做 embedding + 混合检索 + 暴露 MCP）。即"harness 不内建向量库，向量库作为外置 MCP sidecar"。[知乎 p_1946219539902738599 AI IDE 代码索引 MCP](https://zhuanlan.zhihu.com/p/1946219539902738599)、[CSDN EchoVault](https://blog.csdn.net/weixin_42525189/article/details/161028396)

**DCI（对照，事实）**：Direct Corpus Interaction 论文——零索引、零 embedding、纯 grep/bash 在 BrowseComp-Plus 上比 Qwen3-Embed-8B retriever 准确率高 11 点、成本低 424 美元。[CSDN yanqianglifei DCI](https://blog.csdn.net/yanqianglifei/article/details/160955996)

**解读**：coding-agent harness 主流是"不内建 embedder"（Claude Code/Cline 走 agentic search，或把向量库外置为 MCP sidecar）。但 **data agent 与 coding agent 场景不同**：data agent 要检索的是语义层条目/数据源元数据/SQL 样例，规模有限、变更可控、分块天然（一条 metric/dimension 就是一个 chunk），Cline 拒绝 RAG 的三条理由（逻辑碎片化/索引衰减/IP 副本）在 data agent 场景弱得多。因此 data agent 内建向量检索是合理的，但应走 seam 而非焊死。

---

## 3. embedding 模型 + 向量库选型（可自托管 data agent 的前沿实践）

### 3.1 embedding 模型（2025-2026 前沿）

| 模型 | 架构 | 维度 | 语言 | 许可 | 出处 |
|---|---|---|---|---|---|
| **bge-m3** | encoder-only | 1024 | 多语言 | 开源 | WrenAI 默认配置、RAGFlow 早期内置 bge-large-zh |
| **bge-large-zh** | encoder-only | 1024 | 中文 | 开源 | 长期中文默认 |
| **Qwen3-Embedding (0.6B/4B/8B)** | decoder-only | 768-4096 可调(MRL) | 119 语言 | Apache 2.0 | MTEB 多语言 SOTA 70.58，指令感知 |
| Qwen3-Reranker (0.6B/4B/8B) | decoder-only cross-encoder(point-wise) | — | 119 语言 | Apache 2.0 | 精排 |
| OpenAI text-embedding-3-small/large | — | 1536/3072 | 多语言 | 商业 | |
| Cohere Embed / Gemini embedding / Seed1.5-Embedding(字节,MoE,MRL) | — | — | 多语言 | 部分 API | |

**趋势（事实）**：MTEB 榜单前排已从 encoder-only（BGE）迁移到 decoder-only（Qwen/Gemma/Mistral）。中文场景曾默认 bge-large-zh，多语言用 bge-m3；Qwen3-Embedding 系列开源后成为新首选。[知乎 p_2042165568950851125 Embedding 从 Encoder 到 Decoder](https://zhuanlan.zhihu.com/p/2042165568950851125)、[知乎 p_1914349617895695495 Qwen3 开源](https://zhuanlan.zhihu.com/p/1914349617895695495)、[知乎 p_1916930192078804790](https://zhuanlan.zhihu.com/p/1916930192078804790)、[知乎 p_1917614404343686645 Qwen3 详解](https://zhuanlan.zhihu.com/p/1917614404343686645)、[知乎 p_1905277902477582812 Seed1.5](https://zhuanlan.zhihu.com/p/1905277902477582812)

**两阶段范式（事实）**：Embedding（双塔粗筛）+ Reranker（单塔 cross-encoder 精排）。知识库变大后单 embedding 检索会退化，rerank 能实现"数据越多效果越好"。[知乎 p_1914349617895695495 QAnything 架构](https://zhuanlan.zhihu.com/p_1914349617895695495)、[知乎 p_1995917298385573685 选型指南](https://zhuanlan.zhihu.com/p/1995917298385573685)

### 3.2 向量库（可自托管前沿）

| 向量库 | 部署形态 | 定位 | 出处 |
|---|---|---|---|
| **sqlite-vec** | 进程内嵌入 | 轻量、零依赖（从 sqlite-vss 演进，摆脱 Faiss 依赖），适合小项目/边缘 | [知乎 p_1904568799119795335](https://zhuanlan.zhihu.com/p/1904568799119795335)、[CSDN huang9604 sqlite-vec VS Weaviate VS Milvus](https://blog.csdn.net/huang9604/article/details/154648641) |
| **ChromaDB** | 进程内/本地 | 开发测试默认，默认 sentence-transformers，支持 OpenAI/Cohere/自定义 | [CSDN qq_44810930](https://blog.csdn.net/qq_44810930/article/details/153355800) |
| **zvec（阿里，Apache 2.0）** | 进程内嵌入 | "向量库版 SQLite"，基于生产级 Proxima，支持稠密+稀疏+多向量+内置 rerank+标量过滤 | [知乎 p_2015821201625347902 zvec](https://zhuanlan.zhihu.com/p_2015821201625347902) |
| **pgvector** | 外置（PG 扩展） | 已用 PG 时"一个库搞定一切"，单表建议 <100 万（2000 万时 2s+） | [知乎 p_2071164241319661655 Milvus/pgvector/Qdrant 横评](https://zhuanlan.zhihu.com/p/2071164241319661655) |
| **Qdrant** | 外置独立服务 | WrenAI 默认，生产级，Rust | [WrenAI 配置](https://zhuanlan.zhihu.com/p/1906643604983777123) |
| **Milvus** | 外置分布式 | 十亿级，生产大规模 | [CSDN asialee 146051524](https://asialee.blog.csdn.net/article/details/146051524) |
| VectorChord (PG 扩展) | 外置 | ColBERT 多向量 late-interaction rerank in PG | [腾讯云 多向量](https://cloud.tencent.com/developer/article/2706156) |

**部署形态权衡（事实）**：嵌入式进程内（sqlite-vec/Chroma/zvec）——无额外进程、无 RPC、低内存上限、业务崩溃则索引丢、会叠加业务进程内存压力；独立服务（Qdrant/Milvus/pgvector）——资源隔离、可单独调优、稳定、少量基础开销。[baijiahao 1873408534300941572 有限资源选型](https://baijiahao.baidu.com/s?id=1873408534300941572&wfr=spider&for=pc)

---

## 4. 混合检索（BM25 + 向量 + reranker）的进程内 vs 外置拆分

**前沿共识（事实）**："AI 搜索 != 向量搜索、相关性 != 相似性"。多轮搜索 + 混合搜索（向量 + 模糊 + 分词 BM25 + 精确）+ 重排是当前合理方案。[知乎 p_1944312129906779798 digoal](https://zhuanlan.zhihu.com/p/1944312129906779798)

**WeKnora（腾讯开源知识库，事实，范例）**：多路并行召回——向量语义检索 + BM25 关键词检索并行，用 **RRF（倒数排名融合，`1/(k+rank)`，k 默认 60）** 合并，再统一 rerank（阈值过滤），8 步上下文拼装。向量后端可换：pgvector/ES/Milvus/Qdrant/Weaviate/**sqlite-vec**/腾讯向量库/Doris/OpenSearch。FAQ 与文档走不同召回路径。[CSDN m0_59164520 WeKnora 拆解](https://blog.csdn.net/m0_59164520/article/details/162850263)

**Cursor（事实）**：BM25 + 稠密向量混合，Merkle 增量。[简书 p_1794cc9bcd5a](https://www.jianshu.com/p/1794cc9bcd5a)、[CSDN larva_s codebase 复刻](https://blog.csdn.net/larva_s/article/details/154654332)

**拆分模式（解读）**：混合检索的三部件（BM25、向量 ANN、reranker 模型）都可独立"进程内或外置"：
- 进程内全套：sqlite-vec(ANN) + 内置 BM25 + 小 reranker（如 bge-reranker-base 量化）——适合单机 data agent
- 外置全套：Qdrant/Milvus(ANN) + ES(BM25) + rerank sidecar/API——适合多租户生产
- 混合：进程内 ANN + 外置 reranker API（重模型走 API）——data agent 常见折中

**关键（事实）**：reranker 模型比 embedding 重得多（cross-encoder 要 query+doc 联合编码），进程内放 reranker 会显著拉低 agent 主进程；前沿实践倾向把 reranker 外置（API 或 sidecar），embedding 视规模进程内或外置。

---

## 5. 权衡：进程内 embedder vs 外置 sidecar

| 维度 | 进程内 embedder | 外置 sidecar |
|---|---|---|
| 延迟 | 无 RPC，最低 | 多一跳网络/序列化 |
| 隔离 | 重模型崩→agent 崩；内存/GPU 与 agent 抢 | 资源隔离，可独立调优/限流 |
| 部署 | 单进程，简单 | 多进程，运维复杂 |
| 安全 | 数据不出进程 | 需信任 sidecar/网络 |
| 模型更新 | 需重启 agent | sidecar 独立更新 |
| 可替换 | 换模型=换依赖/重打包 | 换 sidecar 即可 |

**前沿 agent 怎么选（事实+解读）**：
- **轻量/边缘/隐私优先** → 进程内：Vanna（ChromaDB+sentence-transformers）、zvec、EchoVault（Ollama 本地）、Self-RAG 示例（HuggingFace 本地）
- **生产/多租户/规模** → 外置：WrenAI（Qdrant 独立容器）、WeKnora（多后端）、Cursor（Turbopuffer 服务端）
- **coding-agent harness** → 多数不内建：Claude Code/Cline（agentic search 或 MCP sidecar）
- **data agent** → 多数内建但走 seam：WrenAI（embedder provider 接口 + Qdrant 外置）、SuperSonic（EmbeddingMapper SPI）、LangChain（Embeddings 抽象）

**为什么 data agent 倾向"接口在内、实现可外置"（解读）**：data agent 的检索对象（语义层条目、DDL、SQL 样例）规模小、变更受控、分块天然，Cline 拒绝 RAG 的三条理由在此弱化；但 embedding/重排模型重，进程内放会拖累 agent loop，所以把重模型外置（OpenAI 兼容 API / Ollama sidecar）+ 轻量 ANN 进程内，是前沿 data agent 的主流折中。

---

## 6. "向量化作为可插拔 capability seam"的先例

**先例充分（事实）**，至少五处：

1. **WrenAI `wren-ai-service/src/providers/embedder/`**：embedder 是 provider 类，`EMBEDDER_PROVIDER` 环境变量切换，`openai.py`/`openai_like.py`/`litellm_embedder`。retriever 是 pipeline 节点。 → `ctx.embedder`/`ctx.retrieval` 的直接先例。[CSDN m0_74825360](https://blog.csdn.net/m0_74825360/article/details/145787237)
2. **SuperSonic `EmbeddingMapper`（SPI）**：`SchemaMapper` 接口 + `BaseMapper` 抽象 + `EmbeddingMapper` 实现，`spring.factories` 自动加载，与关键词 mapper 并列。 → 检索作为可插拔 mapper。[知乎 p_1900958331763426003](https://zhuanlan.zhihu.com/p/1900958331763426003)
3. **LangChain `Embeddings`/`VectorStore`/`Retriever` 抽象基类**：langchain-core 的"最稳定、与供应商无关的核心抽象"。 → capability seam 的教科书先例。[知乎 p_2043118793287808125](https://zhuanlan.zhihu.com/p/2043118793287808125)、[知乎 p_1913974190593246240](https://zhuanlan.zhihu.com/p_1913974190593246240)
4. **Spring AI `EmbeddingModel`/`VectorStore`/`SearchRequest`**：Java 侧同构 seam。[lmnt.cn Spring AI 向量检索](http://www.lmnt.cn/article-2kvrqnet.html)
5. **AgenticRec `VectorBackend` 协议（最贴近我们）**：`backend.add(documents)`/`backend.search(query, top_k)` 最小协议；实现 `HashEmbeddingInMemoryVectorBackend`（默认零依赖）、`FaissVectorBackend`、`MilvusVectorBackend`、`ExternalVectorBackend`。原文："**InMemory 不是终点，而是 adapter seam 的默认实现**"、"让 VectorTool 不再绑定某一种召回实现，只依赖一个最小协议"。 → 与 dsh 的 `ctx.*` provider 模型几乎同构。[知乎 p_2044210733324439586 AgenticRec 第五阶段](https://zhuanlan.zhihu.com/p_2044210733324439586)
6. **Microsoft.Extensions.VectorData**：.NET 侧"统一抽象层消除向量数据库锁定风险"。[腾讯云 2609306](https://cloud.tencent.com/developer/article/2609306)

**结论（事实）**：把 embedding/retrieval 做成 capability seam 是前沿主流，不是稀薄先例。dsh 的 `ctx.embedder`/`ctx.retrieval` 完全顺应既有范式。

---

## 7. 对我们 ⑤b 检索映射的推荐（进程内 vs 外置 embedder）

### 7.1 前提约束（来自 wayfinder 上下文）
- dsh = 一切皆插件、无特权内核、**additive-only 纪律**（只加能力，不改既有特权 core）
- 我们做 **hybrid 检索**（BM25 + 向量 + reranker）
- data agent 检索对象：数据源元数据 / 语义层条目 / SQL 样例（规模有限、变更受控、天然分块）

### 7.2 推荐：seam 在内、实现分层、默认进程内、重模型外置

**A. 定义 capability seam（additive，不动 core）**
- `ctx.embedder`：契约 `embed(texts: list[str]) -> list[vec]` + `dim`/`model` 元信息
- `ctx.retrieval`（或 `ctx.vector_store` + `ctx.bm25` + `ctx.reranker`）：契约 `add(docs)`/`search(query, top_k, filters)` 返回 `[(doc, score, channel)]`
- 这两个作为 provider/service 注册到 Cordis，与 `ctx.llm`/`ctx.fs` 同构，遵循 Reversible Effect（插件卸载→索引/监听器干净消失）

**B. 默认实现：进程内轻量 backend（zero-dep，clone 即跑）**
- 仿 AgenticRec `HashEmbeddingInMemoryVectorBackend` 给一个 in-proc 默认（可基于 sqlite-vec 或纯内存 cosine），让 data agent 无需启动外部服务即可跑通检索语义
- 默认 embedding 走 `ctx.llm` 复用或一个轻量本地模型（bge-small / mxbai-embed-large 量化），reranker 默认可省（hybrid RRF 融合即可）

**C. 升级实现：重模型外置 sidecar / API（插件，可替换）**
- `OpenAICompatibleEmbedder` 插件：走 bge-m3 / Qwen3-Embedding / OpenAI（API base 可配，仿 WrenAI `openai_like_embedder`）
- `OllamaEmbedder` 插件：本地 Ollama sidecar（仿 EchoVault/Vanna 本地路线），隐私+离线
- `ExternalVectorBackend` 插件：Qdrant / Milvus / pgvector（仿 WeKnora 多后端、AgenticRec `ExternalVectorBackend`）
- `RerankerSidecar` 插件：bge-reranker-v2-m3 / Qwen3-Reranker 走 API 或独立进程（重模型不进 agent 主进程）

**D. hybrid 检索作为 retriever 组合插件（不是 core 的一部分）**
- BM25 + 向量并行 → RRF 融合（仿 WeKnora）→ 可选 reranker 精排
- 各通道都是独立插件，data agent 只依赖 `ctx.retrieval.search()` 契约，不关心后端

### 7.3 为什么这样切（对照前沿）
- **seam 在内**：所有先例（WrenAI/SuperSonic/LangChain/Spring AI/AgenticRec）都把 embedder/retriever 做成抽象 seam，dsh 的 ctx.* 模型天然适配。
- **默认进程内**：data agent 要可自托管、clone 即跑；AgenticRec 明确"InMemory 是 adapter seam 的默认实现"正是此意。Cline 拒绝 RAG 的"IP 副本"顾虑在 data agent 可由"默认进程内、数据不出进程"化解。
- **重模型外置**：reranker/cross-encoder 比 embedding 重得多，放进 agent 主进程会拖累 loop；前沿（WrenAI 把 Qdrant 外置、EchoVault 把 Ollama 做 sidecar、WeKnora 把 rerank 独立）都把重模型外置。dsh 的 additive-only 纪律也要求"重模型是可选插件而非 core 依赖"。
- **不学 Claude Code/Cline 彻底放弃 RAG**：它们是 coding agent，检索对象是频繁变动的源码、分块伤逻辑；data agent 检索对象是受控的语义层/元数据，规模小、天然分块，RAG 收益高、衰减可控。

### 7.4 需要后续核验的点（先例稀薄处，如实说明）
- WrenAI 是否内置 reranker：社区资料未明确，需查 `wren-ai-service/src/pipelines/` 源码。
- SuperSonic `EmbeddingMatchStrategy`/`Retrieval` 的具体向量后端与 embedding 模型：社区源码分析文章只到 mapper 层，未展开后端实现，需查仓库。
- zvec 的 Python 绑定成熟度（Apache 2.0 但较新）：生产前需实测。
- 本环境无法直连 GitHub（403/网络策略），以上源码片段均来自社区源码分析文章的引用，需在能访问仓库时逐字校验 `wren-ai-service/src/providers/embedder/`、`tencentmusic/supersonic` 的 `EmbeddingMapper` 及其后端、AgenticRec `agentic_rec/vector_backend.py`。

---

## 附：关键引用清单（URL）

- WrenAI 仓库：https://github.com/Canner/WrenAI （本环境 403，未直连）
- WrenAI 自定义 embedder：https://blog.csdn.net/m0_74825360/article/details/145787237 、 https://blog.csdn.net/m0_54804970/article/details/145288273
- WrenAI deepseek+aliyun 配置：https://zhuanlan.zhihu.com/p/1906643604983777123
- WrenAI pipeline 架构：https://blog.csdn.net/gitblog_00567/article/details/154565807
- WrenAI 百度百科：https://baike.baidu.com/item/Wren%20AI/67373145
- SuperSonic 仓库：https://github.com/tencentmusic/supersonic
- SuperSonic EmbeddingMapper 源码分析：https://zhuanlan.zhihu.com/p/1900958331763426003
- SuperSonic debug 技术调研：https://zhuanlan.zhihu.com/p/1910352988733699480
- SuperSonic 全面使用指南：https://blog.csdn.net/xyghehehehehe/article/details/162794320
- Vanna 仓库：https://github.com/vanna-ai/vanna
- Vanna 原理：https://blog.csdn.net/2401_84204207/article/details/147350239 、 https://blog.csdn.net/Jackie_vip/article/details/140793755
- Vanna 百度百科（含 rerank 变体描述）：https://baike.baidu.com/item/Vanna%20AI/67357070
- LangGraph Self-RAG：https://zhuanlan.zhihu.com/p/1899823367005111611
- LangGraph CRAG：https://zhuanlan.zhihu.com/p_717626094
- LangChain/LangGraph RAG 入门：https://blog.csdn.net/2301_81940605/article/details/144282495
- LangChain Embeddings/VectorStore/Retriever 抽象：https://zhuanlan.zhihu.com/p_1913974190593246240
- LangChain 框架详解：https://zhuanlan.zhihu.com/p_2043118793287808125
- dsh 一切皆插件实测：https://zhuanlan.zhihu.com/p/2071577828743722055
- dsh ctx.* 架构：https://www.zhihu.com/question/2071348486667237276/answer/2071356246079411307
- Claude Code 放弃 RAG：https://zhuanlan.zhihu.com/p_2045576810549736378
- Cline 不索引代码库：https://zhuanlan.zhihu.com/p_1939797227364124371 、 https://zhuanlan.zhihu.com/p_1919489523823407360
- Cursor/混合检索 MCP：https://www.jianshu.com/p/1794cc9bcd5a
- AI IDE 代码索引 MCP：https://zhuanlan.zhihu.com/p_1946219539902738599
- EchoVault 本地知识库 MCP：https://blog.csdn.net/weixin_42525189/article/details/161028396
- DCI 零索引 deep research：https://blog.csdn.net/yanqianglifei/article/details/160955996
- Qwen3-Embedding/Reranker 开源：https://zhuanlan.zhihu.com/p_1914349617895695495 、 https://zhuanlan.zhihu.com/p_1916930192078804790 、 https://zhuanlan.zhihu.com/p_1917614404343686645
- Embedding 架构迁移：https://zhuanlan.zhihu.com/p_2042165568950851125
- RAG 选型指南：https://zhuanlan.zhihu.com/p_1995917298385573685
- Seed1.5-Embedding：https://zhuanlan.zhihu.com/p_1905277902477582812
- sqlite-vec：https://zhuanlan.zhihu.com/p_1904568799119795335 、 https://blog.csdn.net/huang9604/article/details/154648641
- zvec：https://zhuanlan.zhihu.com/p_2015821201625347902
- pgvector/Qdrant/Milvus 横评：https://zhuanlan.zhihu.com/p_2071164241319661655
- 有限资源向量库选型：https://baijiahao.baidu.com/s?id=1873408534300941572
- WeKnora 混合召回拆解：https://blog.csdn.net/m0_59164520/article/details/162850263
- AI搜索!=向量搜索：https://zhuanlan.zhihu.com/p_1944312129906779798
- Spring AI 向量检索：http://www.lmnt.cn/article-2kvrqnet.html
- Microsoft.Extensions.VectorData：https://cloud.tencent.com/developer/article/2609306
- AgenticRec VectorBackend seam：https://zhuanlan.zhihu.com/p_2044210733324439586
- ColBERT/VectorChord 多向量：https://cloud.tencent.com/developer/article/2706156
