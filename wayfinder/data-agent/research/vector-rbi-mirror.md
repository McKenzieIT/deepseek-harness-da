# rbi-retrieval 向量 seam 镜像规格（P5 移植靶）

> P5 ⑤b 移植 reverse-bi 的检索/向量化能力。本笔记记录 rbi 源码（read-only, `/Users/mckenzie/workspace/reverse-bi`）中 P5 要镜像的 seam 契约与组成，作 prototype stub-fidelity 镜像靶 + 决策 backfill 依据。**非**前沿调研（前沿见 `vector-seam-structure.md` / `vector-backend-ts.md` / `vector-embedder-intranet.md`）。rbi = 我们移植的源，对决策是**驱动级**依据（强于前沿 survey）。

## 源位置（read-only）
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/embedder.py` — Embedder/Reranker Protocol + 实现 + load 工厂（**P5 ctx.embedder 直接镜像靶**）
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/retrieval.py` — `HybridRetriever` + `rrf_fuse`
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/layer.py` — SQLite `reverse_bi.db`+WAL + sqlite-vec + `load_embedder`/`load_reranker` + top-k(BM25+sqlite-vec+RRF)
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/constants.py` — `RRF_K=60`, `RERANKER_NOISE_FLOOR=0.1`, `RERANKER_REJECT_FLOOR=0.2`
- `libs/rbi-retrieval/src/rbi_retrieval/semantic/unified_search.py` — `UnifiedSearchIndex`（RRF 复刻）
- `libs/rbi-retrieval/src/rbi_retrieval/planner.py` — pipeline 阶段调 `UnifiedSearchIndex` 取 top-K（**D2 证据**）
- `libs/rbi-retrieval/src/rbi_retrieval/degradation.py` — Infinity 推理面宕→BM25-only 降级

## Embedder Protocol（→ `ctx.embedder` seam）
```python
class Embedder(Protocol):
    @property
    def dim(self) -> int: ...           # 实例 lifetime 内固定
    @property
    def model_id(self) -> str: ...      # 模型+backend 稳定身份（cache version tagging, D9）
    def embed(self, texts: list[str]) -> list[list[float]]: ...  # 每文本一定宽向量, 按序
```
实现（工厂 `load_embedder()`，进程级 env-fingerprint 单例缓存，优先级 **fake→infinity(HTTP)→sentence-transformers→fake 降级**）：
- **`FakeHashEmbedder`**(dim=256 默认)：确定性 stdlib sha256 hash、L2-normalized、**零外部依赖**。sentence-transformers 不可用 OR `RBI_EMBEDDER=fake` 时用。= **clone-and-run 默认 stub**（正合 S3 结论"默认须是零下载 stub，真 embedder 全作可选外置插件"）。
- **`SentenceTransformerEmbedder`**(BAAI/bge-m3)：in-process 真语义，经 sentence-transformers，device 可配(`RBI_EMBEDDER_DEVICE`)。
- **`InfinityEmbedder`**：HTTP embedder 打外置 OpenAI-兼容推理服务（Infinity 主、TEI 备），POST `/v1/embeddings`。**进程内不载模型**（P1 灭冷载）。`InferenceError` typed(unavailable/timeout/not_ready/dim_mismatch)→degradation state machine。
- `peek_cached_embedder()`：observability 读 model_id **绝不触发构造**（避免冷载 GB 级模型）。

## Reranker Protocol（→ peer pluggable，**非**顶层 seam）
```python
class Reranker(Protocol):
    @property
    def model_id(self) -> str: ...
    def rerank(self, query: str, texts: list[str]) -> list[float]: ...  # 每文一相关性分, 高=更相关
```
实现（工厂 `load_reranker()`，同缓存+优先级）：`FakeReranker`（query-token 召回率、零依赖、测试）/ `CrossEncoderReranker`(BAAI/bge-reranker-v2-m3、in-proc)/ `InfinityReranker`(HTTP `/rerank` 外置)。

## HybridRetriever（→ `ctx.retrieval` 默认 provider 内部组成）
- BM25（jieba tokenize，共享 `tokenize()`）+ sqlite-vec（dense）→ RRF(`RRF_K=60`, Cormack 2009) → 可选 Reranker 精排
- `RERANKER_NOISE_FLOOR=0.1`（per-candidate noise bar, matching.py）/ `RERANKER_REJECT_FLOOR=0.2`（aggregate reject, unified_search.py）
- 共享 `tokenize()`：jieba CJK 分词（无 jieba 退 char-bigram）+ ASCII lowercasing；BM25 与 FakeHashEmbedder 共用
- 同义词扩展 `expand_query_tokens`（BM25 召回）+ `canonicalize_query`（cross-encoder reranker 评分前改写为 canonical 拼写，从 `resources/semantic-layer/synonyms.yaml` 加载）→ 属语义层数据(P6)，P5 prototype stub

## 对 P5 决策的坐实（rbi = 移植源 = 决策驱动）
- **D1 seam 粒度**：rbi = `Embedder` + `Reranker` 两 peer Protocol 同模块 + `HybridRetriever` 内部组合 BM25+sqlite-vec+RRF+reranker。**不**提 bm25/vector_store/reranker 为顶层 seam。reranker = peer protocol（可注入）非顶层 seam。→ 坐实 Q1 推荐。
- **D2 retrieval 调用**：`planner.py`(pipeline 阶段) 调 `UnifiedSearchIndex` 取 top-K tables/events 喂 LLM → **pipeline-internal，非 agent-facing tool**。（注：rbi-mcp 有 `rbi_mcp.tools.retrieval` MCP 工具，但纯逻辑已按 ADR-0027 抽到 rbi-retrieval；我 data-agent retrieval 喂 pipeline/语义层，无 `retrieval-tool` 包。）
- **D3 默认 embedder 来源（内网安全张力）**：rbi = `FakeHashEmbedder`(默认零下载 stub) → `InfinityEmbedder`(外置 HTTP OpenAI-兼容) → in-proc bge-m3(可选)。`InferenceError`→BM25-only 降级。→ 完全解 D3：默认 FakeHash（零 egress），外置 = 任何 OpenAI-兼容 `/v1/embeddings`（含 DashScope-via-AGA **若** AGA-embeddings live-probe 确认，见 S3 `vector-embedder-intranet.md`）；**D3 不被 AGA-embeddings 阻塞**（默认与 AGA 无关，AGA 只决定有无干净内网外置插件）。
- **D4 默认向量 backend**：rbi = sqlite-vec over SQLite(`reverse_bi.db`+WAL)。**但 rbi 是 Python**（sqlite-vec 有 Python 绑定）；我 harness 是 **TS** → sqlite-vec TS 绑定是否可用 = **S2 待定**。若 S2 确认 TS 绑定可用→镜像 rbi(sqlite-vec over harness SQLite)；否则默认 = 纯内存 cosine(零依赖)，sqlite-vec/Qdrant 作外置插件。**seam 契约不变，只换默认 provider 存储**。

## 待 prototype 镜像时读全
`retrieval.py`(`HybridRetriever` 全) + `layer.py`(sqlite-vec 接线) — prototype 阶段 stub-fidelity 镜像（如 P4 镜像 `OdpsExecutor`/`ScopeConnection`）。grilling 阶段已有 embedder.py + layer.py 注释 + constants.py 足够。
