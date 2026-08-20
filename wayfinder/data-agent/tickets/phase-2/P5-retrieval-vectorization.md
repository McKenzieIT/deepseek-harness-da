# P5 — 检索/向量化插件

**Type**: prototype
**Phase**: 2
**Status**: Resolved（2026-08-20；grilling D1-D6 + rbi 源码镜像 + 4 篇 cited research + prototype 验证）

**Question**: `ctx.embedder` + `ctx.retrieval` seam + 默认轻量进程内 backend（sqlite-vec/in-mem + 轻量 embedder）+ 重模型可选外置插件（bge-m3/Qwen3-Embedding/Qwen3-Reranker）+ hybrid（BM25+向量→RRF→rerank）。

**Research**: `vectorization-frontier.md`（初版二手 landscape）+ `vector-rbi-mirror.md`（rbi 源码镜像靶）+ `vector-embedder-intranet.md`（embedding SOTA/DashScope/AGA/hybrid RRF）+ `retrieval-consumer-model.md`（pipeline-internal vs agent-tool 处方）+ `vector-seam-structure.md`（S1，pending 落地）+ `vector-backend-ts.md`（S2，pending 落地）。

## Resolution（resolved 2026-08-20）

**Locked decisions**（grilling D1-D6 + rbi 源码 + cited research + prototype 验证）：

- **A（D1 seam 面/粒度）**：mirror rbi-retrieval/semantic——`ctx.embedder` + `ctx.retrieval` 两 seam；hybrid（BM25+vec+RRF(k=60)）= retrieval provider 内部组合，**不**提 `ctx.bm25`/`ctx.vector_store`/`ctx.reranker` 为顶层 seam；reranker = peer pluggable protocol（RRF 后注入，镜像 rbi `unified_search.py` 层 + `RERANKER_NOISE_FLOOR/REJECT_FLOOR`），非顶层 `ctx.reranker`。rbi `embedder.py` Embedder+Reranker 同模块 peer 协议 + `load_embedder/load_reranker` 工厂坐实。〔research/vector-rbi-mirror.md, vector-embedder-intranet.md〕
- **B（D2 retrieval consumer-model）**：**(c) guided agentic hybrid**——(a) pipeline-internal 默认（四阶段 stage 消费 `ctx.retrieval`：intent 取候选表/指标、generate 取 SQL 样例）+ (b) additive `retrieve` tool escape-hatch（D2 (c)，agent 按需二次检索）；system prompt "优先信任预取、缺口明显才调 retrieve"；**keep/regress 作 evals 驱动可逆决策**（确定性预取召回 ≥85-90% + 歧义 <15% → 回归 (a)）。WrenAI 同构先例选 (c)（`context.py` 内嵌 AGENTS.md 5 步剧本 ≈ dsh 四阶段 1:1 投影 + `recall_queries`/`get_context` MCP 工具），Text2SQL 文献（CHESS/DIN-SQL/DAIL-SQL/RESDSQL/C3）证 (a) 为核心、无一做生成期自由 retrieve 工具。〔research/retrieval-consumer-model.md〕
- **C（D3 默认 embedder）**：mirror rbi `load_embedder()` 三档——`FakeHashEmbedder`（默认零依赖 sha256 stub、无 egress）/ 外置 OpenAI 兼容 HTTP 插件（`InfinityEmbedder`，POST `/v1/embeddings`、进程不载模型灭冷载）/ in-proc bge-m3（`SentenceTransformerEmbedder`/transformers.js + 预打包 ONNX，可选）；`InferenceError`(unavailable/timeout/not_ready/dim_mismatch)→degradation→BM25-only；进程级 env-fingerprint 单例缓存 + `peek_cached_embedder` 不触构造。**AGA-embeddings（DashScope text-embedding 经内网 AGA）= UNVERIFIED、默认期望 NO、独立 live-probe**（像 P2 探 chat；AGA 是 relay 层，公网 DashScope 有 embeddings ≠ AGA 中转提供）；intranet 重 embedder 须独立推理 sidecar（chat 搭 AGA、embeddings 未必）。〔research/vector-embedder-intranet.md〕
- **D（D4 默认 backend）**：TS-aware——默认纯 JS in-mem cosine（zero-dep/clone-and-run/无 native build/intranet-safe，小受控语料百-千级够快 N×dim mults trivial）；sqlite-vec（vec0 经 better-sqlite3 loadable ext，npm 0.1.9）= 升级档（native KNN/可选 disk 持久化，native dep 非零依赖，production 升级）；Qdrant/Milvus = 外置（多租户/规模）；**seam 契约不变只换默认 retrieval-inproc provider 存储**。rbi 用 sqlite-vec 于 in-memory `:memory:`（rebuild cheap with FakeHash），TS zero-dep 默认 = 纯 JS in-mem（rbi "in-memory 向量索引"的 TS 等价、免 native dep）。〔rbi retrieval.py + npm self-check；S2 复核 0.1.9 成熟度 pending〕
- **E（D5 包布局）**：镜像 P4 `query/{query,query-maxcompute,query-tool}` + `credentials/{credentials,credentials-local}`——`packages/embedder/{embedder(seam + Reranker peer protocol), embedder-fakehash(默认 provider), embedder-http(外置), embedder-transformers?(可选 in-proc)}` + `packages/retrieval/{retrieval(seam), retrieval-inproc(默认 hybrid provider), retrieval-tool(escape-hatch), retrieval-sqlitevec/qdrant?(外置 backend)}`；reranker peer-protocol ride 在各 embedder provider 包（镜像 rbi `embedder.py` Embedder+Reranker 同模块）；与 scaffold `cordis.patch.yml` 预留 "retrieval"/"embedder" 两 slot 一致。
- **F（D6 prototype）**：`../../prototypes/p5-retrieval-vectorization/`（throwaway node，`run.mjs`+`sidecar.mjs`，`node run.mjs --demo` **EXIT=0、6 scenario 全绿**）；stub fidelity 镜像 rbi `embedder.py`（Embedder/Reranker Protocol + FakeHash/FakeReranker + InfinityEmbedder/Reranker + load_* + InferenceError）+ `retrieval.py`（HybridRetriever BM25+vec+RRF + rrf_fuse + _clamp_bm25_scores）+ `constants.py`（RRF_K=60）+ `unified_search.py`（reranker RRF 后精修）；D4 in-mem cosine（非 sqlite-vec，TS 绑定 pending S2）；**非真 Cordis 接线**（真 Service Definition 注册是生产步骤，如 P4）。6 scenario：index→search / hybrid RRF>单通道 / embedder 换源 / reranker 注入 / 降级 / retrieval-tool escape-hatch。注：FakeHash 弱语义（hash-based），排序质量低是预期——prototype 证 seam+hybrid 机制，非检索质量（真质量需 C 外置真 embedder 插件）。

**Surfaced tensions**（→ map Not-yet-specified / 新 ticket）：
- **AGA-embeddings live-probe**：DashScope text-embedding 经内网 AGA = UNVERIFIED（AGA 非公开、relay 可能仅 chat）；须像 P2 探 chat 一样 live-probe（探 AGA base URL 的 embeddings 路由/协议形/接受模型名/`dimensions`/`text_type`/错误体）；默认期望 NO（探得 yes 是 bonus，省一个 sidecar）。→ 新 ticket **T2**（task）。
- **intranet 重 embedder 部署形态**：chat 走 AGA、embeddings 未必 → intranet 用真 embedder 须独立推理服务（Infinity/TEI/Ollama sidecar 跑 bge-m3/Qwen3-Embedding）；部署依赖，production 定（T2 结果定走向）。→ map Not-yet-specified。
- **sqlite-vec 0.1.9 成熟度**：S2 调研 pending（TS 绑定存在经 npm self-check；0.1.9 稳定性/Chroma/zvec TS/BM25 TS lib/reranker TS 详查待 S2 落地）；**不阻塞决策结构**（默认 in-mem + sqlite-vec 升级，0.1.9 嫩否只推迟升级档）。→ S2 落地后回填此条。
- **DashScope text-embedding 精确规格**：`help.aliyun.com/zh/model-studio/text-embedding` 本环境 403；精确模型名/维度/batch = SECONDARY；生产 pin config 前 + AGA live-probe 时从不限网络重抓或用 DashScope key 直调 `/v1/embeddings` 验。→ 并入 T2 live-probe。
- **D2 (c) keep/regress 可逆**：是否保留 (b) escape-hatch = evals 驱动（确定性预取召回 ≥85-90% + 歧义 <15% → 回归 (a)）；待 P11 eval harness 就绪后判。→ map Not-yet-specified。

---

## S1/S2 落地回填（2026-08-20，post-resolution）

S1（`vector-seam-structure.md`）+ S2（`vector-backend-ts.md`）重派 foreground 同步返回（首轮 background dispatch 丢失，已补）。**不改变已锁决策**，回填如下：

**S1 验证 D1**（前沿 6/6 系统核源确认 rbi 模式主流）：
- embedder + retrieval 两分离 seam：WrenAI `EmbedderProvider`/`DocumentStoreProvider`、SuperSonic `S2OnnxEmbeddingModel`/`EmbeddingStoreFactory`/`MatchStrategy`、LangChain `Embeddings`/`VectorStore`/`BaseRetriever`、AgenticRec `VectorBackend`（`guoxun/AgenticRec` 定位核证，默认 `InMemoryVectorBackend`+`HashEmbedding`）、Spring AI `EmbeddingModel`/`VectorStore`、MS VectorData `IEmbeddingGenerator`/`VectorStore`。
- BM25+vec+RRF 内聚单一 retrieval provider 非三顶层 seam：MS VectorData `IKeywordHybridSearchable.HybridSearchAsync`、WrenAI 现 LanceDB hybrid、AgenticRec 单 `backend.search` 显证。
- reranker = 可注入 peer-protocol 非顶层 seam：5/6 无 reranker 抽象（WrenAI/SuperSonic/AgenticRec/Spring AI/MS VectorData）；LangChain `BaseCrossEncoder` 是唯一独立 ABC 但**作可注入组件被 compressor/transformer 消费**，同向 rbi，**非** `ctx.reranker` 顶层 seam。**严格反例不存在**。
- SuperSonic 向量库后端缺口填上：`EmbeddingStoreType`{IN_MEMORY,MILVUS,CHROMA,PGVECTOR,OPENSEARCH} + `S2OnnxEmbeddingModel`(进程内 ONNX BERT)；无 reranker seam（仅 `EmbeddingMatchStrategy` 内 LLM 后过滤）。

**S2 精化 D4 + 生产细节**（`vector-backend-ts.md`）：
- **sqlite-vec 0.1.9 升级档 = 有条件 YES**（非默认）：活跃维护（2026-03 发版）、纯 C 零运行时依赖、预编译二进制经 npm `optionalDependencies` 分发（**无运行时联网**，内网安全前提 vendored node_modules）；`sqliteVec.load(db)` 经 `better-sqlite3` v13.0.3 `loadExtension`。**条件**：锁 0.1.9+平台二进制；5 预编译平台（linux-x64/arm64、darwin-x64/arm64、win-x64，**无 Alpine/musl**→glibc 镜像）；默认层留纯 JS in-mem；**pre-1.0**（202 open issues、0.1.9 刚修核心 DELETE 正确性 bug #274）→ 跨 minor 升级跑回归。**→ surfaced tension「sqlite-vec 0.1.9 成熟度」RESOLVED：升级层有条件 yes，默认层仍 in-mem。**
- **BM25 TS 主路径 = `@orama/orama` v3.1.18**（零依赖、TS-native、单包内置 BM25+Full-Text+Vector+Hybrid，与 hybrid seam 同包对齐，省一集成点）；`minisearch` v7.2.0（源码明示 BM25+）纯 BM25 备选。不选 search-index（native LevelDB）/ wink-bm25（2022 停更）/ bm25（2018 死）。
- **Reranker TS = 不进 agent 主进程**：`@huggingface/transformers` v4.2.0 **无 reranker pipeline**（`src/pipelines/` 无 text-ranking、README 无 rerank 任务、grep 0 命中）；`@xenova/transformers` 已弃用停更；默认从 HF CDN 拉模型=egress + `onnxruntime-node` native。→ **外部 sidecar**：**HuggingFace TEI** 首选（README 明确 "Using Re-rankers models"+"Air gapped deployment" 挂载权重+gRPC+Docker+支持 Qwen3/GTE/BGE）、**infinity**(`michaelfeil/infinity`) 备选。**→ surfaced tension「intranet 重 embedder/reranker 部署」refined：TEI/infinity 容器 air-gapped 挂载权重作 `ctx.retrieval` 的 reranker seam，agent 仅 HTTP/gRPC。**
- Qdrant/Milvus TS 客户端确认：`@qdrant/js-client-rest` v1.19.0（2026-08）+ `@zilliz/milvus2-sdk-node` v3.0.4（2026-07）均活跃 → D4 外置 tier TS 客户端就绪。

**D4 tier 总结（S2 精化后）**：默认层 = 纯 JS in-mem cosine（+ Orama BM25/hybrid 同进程，零依赖）；升级层 = sqlite-vec 0.1.9（有条件 yes，better-sqlite3+预编译二进制，无运行时联网）；外置层 = reranker TEI/infinity sidecar + 向量库 Qdrant/Milvus（TS 客户端就绪）。
