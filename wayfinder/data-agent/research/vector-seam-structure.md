# 向量能力 seam 结构与粒度（前沿核源）

> P5 调研切片 S1（重派 foreground 同步返回，首轮 background dispatch 丢失已补）。Scope：seam 结构 + 粒度，验证 D1。**非** consumer-model（`retrieval-consumer-model.md` 已覆盖）。范围：仅前沿**核源**（GitHub raw / 官方仓库源码、官方文档）。2026-08。
> 取证方式：fetcher 域名层封禁 `github.com`/`raw.githubusercontent.com`/`cdn.jsdelivr.net`（claude.ai WebFetch 全部 "Unable to verify domain"；aone-agent WebFetch 对 jsDelivr data API 返 403）。改用**本机 curl 直连** raw.githubusercontent.com / data.jsdelivr.com CDN 绕过。GitHub Contents API 在未授权 60/h 限流内取目录，超限后切 raw/jsDelivr。**可信度标注**：每条附 primary URL。无法定位处显式标注。二级来源（博客）标 `secondary`。

## 取证关键事实（影响引用）
- **LangChain 默认分支是 `master`**（非 `main`）：raw `main` 全 404，`master` 200。
- **WrenAI 已重构**：当前 `main` HEAD **已删除 `wren-ai-service/`**（`.gitmodules` 0 字节、非子模块；raw `main` 下 `wren-ai-service/*` 全 404；`Canner/wren-ai-service` 独立仓库也 404）。题目所指 `src/providers/embedder/`、`table_retriever` 属**旧架构**，核源从最近仍含该结构的发布 tag **0.29.2** 取证。当前 `main` 改用 wren-core + LanceDB 混合检索。
- **SuperSonic 默认分支 `master`**；嵌入/检索栈建立在**内嵌的 langchain4j**（`dev.langchain4j.*` 包）之上。
- **AgenticRec 仓库**：`github.com/guoxun/AgenticRec`（默认 `main`）。此前 note 无法 primary-verify，现 primary 核证。知乎专栏为作者本人写的 `secondary` 系列（佐证、非核源）。

## Q1 — WrenAI（Canner/WrenAI）

**旧架构（tag 0.29.2，核源核证）——embedder 是 provider 接口 + 可换实现；retrieval 是 pipeline node；pipeline 内无 reranker。**
- `src/core/provider.py` 定义三条 ABC provider seam：`class EmbedderProvider(metaclass=ABCMeta)`（`get_text_embedder`/`get_document_embedder`）、`class DocumentStoreProvider(metaclass=ABCMeta)`（`get_store`/`get_retriever`，向量库+retriever seam 二合一）、`class LLMProvider`。→ embedder 与 document-store/retriever 是**分离的两条 provider seam**。 [raw provider.py@0.29.2](https://raw.githubusercontent.com/Canner/WrenAI/0.29.2/wren-ai-service/src/core/provider.py)
- `src/providers/loader.py`：`@provider(name)` 装饰器注册进 `PROVIDERS` 字典，`get_provider(name)` 按名取——**可插拔 provider 注册表**。 [raw loader.py@0.29.2](https://raw.githubusercontent.com/Canner/WrenAI/0.29.2/wren-ai-service/src/providers/loader.py)
- `src/providers/embedder/litellm.py`：`@provider("litellm_embedder")` + `class LitellmEmbedderProvider(EmbedderProvider)`；Haystack 契约 `@component class AsyncTextEmbedder` + `@component.output_types(embedding,meta)` + `async def run(self, text)`；另 `AsyncDocumentEmbedder.run(documents)`。→ **embedder 契约 = Haystack `@component` 的 `run()`**，provider seam 返回 Haystack 组件。 [raw litellm.py@0.29.2](https://raw.githubusercontent.com/Canner/WrenAI/0.29.2/wren-ai-service/src/providers/embedder/litellm.py)
- `src/providers/embedder/__init__.py`：**空文件**（实现经 `@provider` 注册，无显式 export）。 [raw __init__.py@0.29.2](https://raw.githubusercontent.com/Canner/WrenAI/0.29.2/wren-ai-service/src/providers/embedder/__init__.py)
- `src/providers/document_store/qdrant.py`：`class AsyncQdrantDocumentStore(QdrantDocumentStore)`、`class AsyncQdrantEmbeddingRetriever(QdrantEmbeddingRetriever)`——**向量库 = Qdrant**，作 DocumentStoreProvider 实现。 [raw qdrant.py@0.29.2](https://raw.githubusercontent.com/Canner/WrenAI/0.29.2/wren-ai-service/src/providers/document_store/qdrant.py)
- `src/pipelines/retrieval/sql_pairs_retrieval.py`：`class SqlPairsRetrieval(BasicPipeline)` + `async def run(self, query, project_id=None)`——**retrieval 是 pipeline node**（`BasicPipeline` 子类）。步骤 `count_documents→embedding→retrieval→filtered_documents→formatted_output`。**grep `rerank|Rerank|JoinMode|RRF` 无命中**——pipeline 内**无 reranker**，纯向量召回+过滤+格式化。 [raw sql_pairs_retrieval.py@0.29.2](https://raw.githubusercontent.com/Canner/WrenAI/0.29.2/wren-ai-service/src/pipelines/retrieval/sql_pairs_retrieval.py)

**最小契约汇总**：embedder provider seam = `EmbedderProvider.get_text_embedder() -> AsyncTextEmbedder`（Haystack `@component run(text)->{embedding,meta}`）；retriever seam = `DocumentStoreProvider.get_retriever()`；retrieval pipeline node = `BasicPipeline.run(query, project_id)`。

**当前 `main` 架构（重构后）**：`.wren/memory/` = LanceDB 索引，"LanceDB-backed retrieval layer"，`schema_items`/`query_history` 两 collection；依赖 `lancedb`+`sentence-transformers`。README "local LanceDB memory index (hybrid retrieval)"。→ **混合检索内聚进单一 LanceDB memory 层**，embedder/retriever 不再是顶层 provider seam。 [README@main](https://raw.githubusercontent.com/Canner/WrenAI/main/README.md) ｜ [architecture.md@main](https://raw.githubusercontent.com/Canner/WrenAI/main/docs/core/reference/architecture.md)

## Q2 — SuperSonic（tencentmusic/supersonic）

**`EmbeddingMapper` SPI 用 `EmbeddingMatchStrategy` 召回；向量库后端 = 内嵌 langchain4j `EmbeddingStore`（`EmbeddingStoreFactory`+`EmbeddingStoreType` 五选一）；embedding 模型 = `S2OnnxEmbeddingModel`（进程内 ONNX BERT 双编码）。无 reranker seam。**
- `MatchStrategy.java`：`interface MatchStrategy<T extends MapResult>`，唯一方法 `match(ChatQueryContext, terms, detectDataSetIds)`——**召回 SPI 接口**。 [raw MatchStrategy.java@master](https://raw.githubusercontent.com/tencentmusic/supersonic/master/headless/chat/src/main/java/com/tencent/supersonic/headless/chat/mapper/MatchStrategy.java)
- `BaseMatchStrategy.java`：抽象基类。实现族：`EmbeddingMatchStrategy`/`BatchMatchStrategy`/`DatabaseMatchStrategy`/`HanlpDictMatchStrategy`/`SearchMatchStrategy`/`SingleMatchStrategy`。
- `EmbeddingMapper.java`：`class EmbeddingMapper extends BaseMapper`，`doMap()` 经 `ContextUtils.getBean(EmbeddingMatchStrategy.class)` 取策略、`getMatches(...)`，结果用 `dev.langchain4j.store.embedding.Retrieval.getLongId(...)` 解析。 [raw EmbeddingMapper.java@master](https://raw.githubusercontent.com/tencentmusic/supersonic/master/headless/chat/src/main/java/com/tencent/supersonic/headless/chat/mapper/EmbeddingMapper.java)
- `EmbeddingMatchStrategy.java`：`class EmbeddingMatchStrategy extends BatchMatchStrategy<EmbeddingResult>`，Javadoc "**EmbeddingMatchStrategy uses vector database to perform similarity search against the embeddings**"；内部含 `useLlm` LLM 后置过滤——**LLM 后过滤，非独立 reranker seam**。 [raw EmbeddingMatchStrategy.java@master](https://raw.githubusercontent.com/tencentmusic/supersonic/master/headless/chat/src/main/java/com/tencent/supersonic/headless/chat/mapper/EmbeddingMatchStrategy.java)
- **向量库后端（填前 note 缺口）**：`EmbeddingStoreFactory.java`（`interface EmbeddingStoreFactory { EmbeddingStore<TextSegment> create(String collectionName); }`——向量库 SPI）[raw](https://raw.githubusercontent.com/tencentmusic/supersonic/master/common/src/main/java/dev/langchain4j/store/embedding/EmbeddingStoreFactory.java) + `EmbeddingStoreType.java`（`enum { IN_MEMORY, MILVUS, CHROMA, PGVECTOR, OPENSEARCH }`）[raw](https://raw.githubusercontent.com/tencentmusic/supersonic/master/common/src/main/java/dev/langchain4j/store/embedding/EmbeddingStoreType.java) + `EmbeddingStoreFactoryProvider.java`（按 enum 路由到 InMemory/Milvus/Chroma/Pgvector/OpenSearch factory）[raw](https://raw.githubusercontent.com/tencentmusic/supersonic/master/common/src/main/java/dev/langchain4j/store/embedding/EmbeddingStoreFactoryProvider.java)。
- 召回结果 POJO `Retrieval.java`：`{id, similarity, query, metadata}`。 [raw Retrieval.java@master](https://raw.githubusercontent.com/tencentmusic/supersonic/master/common/src/main/java/dev/langchain4j/store/embedding/Retrieval.java)
- **embedding 模型**：`S2OnnxEmbeddingModel.java`：`class S2OnnxEmbeddingModel extends AbstractInProcessEmbeddingModel`，基于 `OnnxBertBiEncoder`+`PoolingMode`，"Any BERT-based model ... converted to ONNX"，进程内推理。 [raw S2OnnxEmbeddingModel.java@master](https://raw.githubusercontent.com/tencentmusic/supersonic/master/common/src/main/java/dev/langchain4j/model/embedding/S2OnnxEmbeddingModel.java)

**结论**：SuperSonic 把 embedder 模型（`S2OnnxEmbeddingModel`，配置可换 zhipu/qianfan/dashscope/localai）与**向量库 seam**（`EmbeddingStoreFactory`/`EmbeddingStoreType`）与**召回 seam**（`MatchStrategy`）分开；**reranker 不作顶层 seam**（仅 `EmbeddingMatchStrategy` 内 LLM 后过滤）。

## Q3 — LangChain（langchain-ai/langchain，分支 `master`）

**四条独立 ABC seam；reranker（`BaseCrossEncoder`）是独立 ABC，但作为可注入组件被 retriever/compressor 消费，非顶层 runtime 阶段。**
- `Embeddings(ABC)` [embeddings.py:8]：`embed_documents(list[str])->list[list[float]]`、`embed_query(str)->list[float]`；async `aembed_*` 默认实现。 [raw embeddings.py](https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/embeddings/embeddings.py)
- `VectorStore(ABC)` [vectorstores/base.py:43]：`similarity_search` + 另一 `@abstractmethod`；`add_texts`/`add_documents`/`delete(ids)`/`embeddings` property；`class VectorStoreRetriever(BaseRetriever)`。 [raw base.py](https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/vectorstores/base.py)
- `BaseRetriever(RunnableSerializable, ABC)` [retrievers.py:55]：`_get_relevant_documents(self, query, *, run_manager)->list[Document]`；对外走 Runnable `invoke/ainvoke`。 [raw retrievers.py](https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/retrievers.py)
- `BaseCrossEncoder(ABC)` [cross_encoders.py:6]：`score(text_pairs: list[tuple[str,str]])->list[float]`——**reranker 的独立 ABC**。 [raw cross_encoders.py](https://raw.githubusercontent.com/langchain-ai/langchain/master/libs/core/langchain_core/cross_encoders.py)
- **消费方式（核源限制说明）**：langchain-core `BaseCrossEncoder` 是纯打分接口，设计为**注入到 reranker compressor/transformer**（如 `ContextualCompressionRetriever` 取 `document_compressor`，后者包装 `BaseCrossEncoder`）。该 consumer 类文件在当前树已迁移（langchain 正迁 `langchain_v1`），`cross_encoder_rerank.py` 候选路径在 `master` raw 全 404，且 langchain flat-list 超 jsDelivr 50MB 上限无法枚举 → **consumer 文件位置未能 primary 定位**。但 ABC 级事实（独立 seam + 纯函数式打分，注定被注入而非 runtime 直调）已核证。

→ LangChain = **4 条顶层 ABC**（embedder / vector-store / retriever / cross-encoder reranker）。reranker 在 core 层是独立 seam，但语义上是**可注入策略**，与 rbi "reranker = peer-protocol injected AFTER RRF" 同向，**只是把它显式提成 ABC**。

## Q4 — AgenticRec（github.com/guoxun/AgenticRec，分支 `main`）

**仓库已定位并 primary 核证；`VectorBackend` Protocol = `add`/`search`；默认 `InMemoryVectorBackend` 用 `HashEmbedding`（注：prior note 的 "HashEmbeddingInMemoryVectorBackend" 命名不精确，实际是 `InMemoryVectorBackend` + `HashEmbedding` 两个类）。**
- `agentic_rec/vector_backend.py` 全文核证：
  - `class VectorBackend(Protocol)`：`name: str`；`add(self, documents: Sequence[Dict]) -> None`；`search(self, query: str, top_k: int=50) -> List[VectorHit]`——**最小 vector-backend 协议**。
  - `class HashEmbedding`：`__init__(dim=64)`，`encode(text)->List[float]`（md5 分桶 + 符号 ±1 + normalize，零依赖）。
  - `class InMemoryVectorBackend`（`name="in_memory_vector"`）：`add` 用 `HashEmbedding.encode` 入索引，`search` brute-force cosine——**默认后端**。
  - `class ExternalVectorBackend`（`name="external_vector"`）：基适配器，子类只需实现 `search`（`add` 可选，"many production vector stores are built offline"）。
  - `class FaissVectorBackend(ExternalVectorBackend)` / `class MilvusVectorBackend(ExternalVectorBackend)`：占位适配器。
  - `@dataclass class VectorHit`：`{id, score, payload}`。
  - 模块 docstring："vector-backend seam ... default backend is an in-memory ANN-style index with hash embeddings; production users can implement the same interface for Faiss, Milvus, or an internal vector service."
  [raw vector_backend.py@main](https://raw.githubusercontent.com/guoxun/AgenticRec/main/agentic_rec/vector_backend.py)
- 包内文件清单（API 枚举核证）：`agentic_rec/{__init__,agents,bench,collab,core,gating,llm,pipeline,service,tools,vector_backend}.py`——无独立 reranker/bm25 模块；`tools.py` 为 `VectorTool`（消费 `VectorBackend`），`agents.py` 含 `RecallAgent`/`RerankAgent` 等（`RerankAgent` 是**peer agent**，不是顶层 seam）。
- `secondary` 佐证：作者知乎专栏《AgenticRec 第五阶段：可插拔向量后端》描述与源码一致。 [secondary: zhihu.com/p/2044210733324439586](https://zhuanlan.zhihu.com/p/2044210733324439586)

→ AgenticRec = 单一 `VectorBackend` 协议 seam（embedder 内化进 `HashEmbedding`，非独立 seam）；无 BM25/RRF seam；无顶层 reranker seam（`RerankAgent` 是 peer agent，非组件 seam）。与 rbi 同向。

## Q5 — 粒度横向对比（核源）

| 系统 | embedder seam | 向量库/store seam | 检索/recall seam | BM25/hybrid 组合位置 | reranker 处置 |
|---|---|---|---|---|---|
| **WrenAI**（旧 0.29.2） | `EmbedderProvider` ABC（`@provider` 注册，litellm impl） | `DocumentStoreProvider` ABC（Qdrant impl，含 retriever） | `BasicPipeline` node | pipeline 内纯向量召回，无显式 BM25+RRF | **无**（grep 无 reranker） |
| **WrenAI**（现 main） | `sentence-transformers` local（内化于 memory 层） | LanceDB（memory 层内） | `wren memory fetch/recall` CLI | **混合检索内聚进 LanceDB memory 层** | **无顶层 seam** |
| **SuperSonic** | `S2OnnxEmbeddingModel`（ONNX 进程内；配置可换） | `EmbeddingStoreFactory`+`EmbeddingStoreType`（5 后端） | `MatchStrategy` SPI（6 策略） | 多策略并行召回，无顶层 BM25+RRF seam | **无 seam**（`EmbeddingMatchStrategy` 内 LLM 后过滤） |
| **LangChain** | `Embeddings` ABC | `VectorStore` ABC | `BaseRetriever` ABC（Runnable） | `EnsembleRetriever`/RRF 作 retriever 组合（复合于 retriever 内） | **`BaseCrossEncoder` 独立 ABC**（注入到 compressor/transformer，consumer 文件未定位） |
| **AgenticRec** | `HashEmbedding`（内化于 backend） | `VectorBackend` Protocol（in-memory/Faiss/Milvus 适配器） | `VectorTool` 消费 backend（`RecallAgent`） | 单一 `backend.search`，无 BM25+RRF seam | **无 seam**（`RerankAgent`=peer agent） |
| **Spring AI 2.0** | `EmbeddingModel` 接口 | `VectorStore` 接口（`extends VectorStoreRetriever`） | `VectorStore.similaritySearch`（并入 store seam） | 无顶层 BM25 seam（`spring-ai-rag` 的 `RetrievalAugmentor`+`DocumentTransformer` 变换） | **无顶层 reranker ABC**（经 `DocumentTransformer` 注入） |
| **MS Extensions.VectorData** | `IEmbeddingGenerator`（**独立库** `Microsoft.Extensions.AI.Abstractions`） | `VectorStore` 抽象类 + `VectorStoreCollection<TKey,TRecord>` | `IVectorSearchable.SearchAsync`（并入 collection） | **hybrid 内聚于 collection**：`IKeywordHybridSearchable.HybridSearchAsync(searchValue, keywords, ...)` | **API 无 reranker 类型**（grep 全空） |

**关键观察**：
1. **embedder 与 vector-store/retrieval 作为分离的顶层 pluggable seam**：6/6 系统均如此。唯一内化 embedder 的是 WrenAI-现与 AgenticRec（小语料/本地优先，embedder 内化进 memory/backend），但二者仍把"检索/store"与"embedder"概念分离。
2. **BM25+vec+RRF 的组合位置**：前沿**不**把 BM25/vector-store/reranker 拆成三个顶层 seam；而是把混合检索**内聚进单一检索 provider**——MS VectorData 最典型（`IKeywordHybridSearchable.HybridSearchAsync` 在 collection 内同时吃 vector+keywords），WrenAI-现（LanceDB hybrid 内聚）、AgenticRec（单 `backend.search`）同向。LangChain `EnsembleRetriever`(RRF) 也是 retriever 内复合，非顶层 BM25 seam。
3. **reranker 是否一等 seam**：5/6 系统无顶层 reranker seam（WrenAI/SuperSonic/AgenticRec/Spring AI/MS VectorData 均无 `Reranker` 抽象；rerank 行为以 LLM 后过滤 / `DocumentTransformer` / peer-agent 形式内聚或注入）。**唯一例外是 LangChain**：它在 langchain-core 显式定义 `BaseCrossEncoder` ABC。但它是纯打分函数（`score(text_pairs)`），**消费方式是注入到 retriever/compressor**，而非 runtime 顶层阶段被直调——语义上是"可注入策略/peer-protocol"，不是 `ctx.reranker` 式顶层 seam。

## D1 validation verdict

**前沿核源确认 rbi 模式是主流**——三条均成立：
1. **embedder + retrieval 两条分离的顶层 seam**：6/6 系统核证（WrenAI `EmbedderProvider`/`DocumentStoreProvider`、SuperSonic `EmbeddingModel`/`EmbeddingStoreFactory`/`MatchStrategy`、LangChain `Embeddings`/`VectorStore`/`BaseRetriever`、AgenticRec `VectorBackend`、Spring AI `EmbeddingModel`/`VectorStore`、MS VectorData `IEmbeddingGenerator`/`VectorStore`）。
2. **BM25+vec+RRF 内聚于单一 retrieval provider，而非拆成三个顶层 seam**：MS VectorData（`IKeywordHybridSearchable` 内聚 hybrid）、WrenAI-现（LanceDB hybrid 内聚）、AgenticRec（单 `backend.search`）显式核证；SuperSonic/LangChain/Spring AI 均无顶层 BM25 seam。
3. **reranker = 可注入 peer-protocol，非顶层 `ctx.reranker` seam**：5/6 系统无 reranker 抽象；rerank 行为以 LLM 后过滤 / `DocumentTransformer` / peer-agent 注入。

**反例讨论（唯一接近反例）**：LangChain 在 langchain-core 把 reranker 提成独立 ABC `BaseCrossEncoder`——这是 6 个前沿里**唯一**把 reranker 显式做成"顶层一等 seam（ABC）"的。**但它仍以可注入组件被消费**（注入到 compressor/transformer，不被 runtime 直调为顶层阶段），与 rbi "reranker-injectable peer-protocol" 同向；只是命名上比 rbi 更"一等"。**严格意义的反例（把 `ctx.reranker` 作为与 embedder/retrieval 并列的顶层 runtime seam）在前沿核源中不存在**。D1 锁定方向（embedder/retrieval 两 seam + hybrid 内聚 + reranker 注入）与前沿一致；LangChain 提示：若团队希望 reranker 在 core 层有显式协议类型，LangChain 的 `BaseCrossEncoder` 是可参考的"轻度一等"形态，但**不必**将其提升为 `ctx.reranker` 顶层 seam。

**未核证/限制**：LangChain `BaseCrossEncoder` 的 consumer 文件（`CrossEncoderReranker` 等）因 langchain 正迁 `langchain_v1` 且 flat-list 超 jsDelivr 50MB 上限，未能在当前树 primary 定位——其"注入式消费"结论基于 ABC 纯函数签名（`score(text_pairs) -> list[float]`）的设计推断 + LangChain 历史 API，标为高度可信但非文件级 primary。其余断言均附核源 URL。
