# P5b — 检索/向量化 生产硬化

**Type**: prototype
**Phase**: 2
**Assignee**: wayfinder-session 2026-08-20
**Status**: Resolved（2026-08-20；5 决策 grilled → 真 packages/{embedder,retrieval}/ 落地 + additive swap P13b search_data_sources 软回退；33/33 spec + per-pkg tsc clean + cordis-config 132 pass；P13b 引擎逻辑+接口不变）
**Graduated from**: P13b grilling Q1（P5/P6 生产 gap：P5 仅 prototype resolved，生产包未 ship）
**Blocked by**: P5（resolved, prototype）、P13b（resolved，local `RetrievalLinker` contract consumer）

**Question**: P5 prototype（`prototypes/p5-retrieval-vectorization/`）→ 生产 `ctx.retrieval` seam + 真 provider（hybrid BM25+vec+RRF k=60 + bge-m3/Qwen3 embedder [用户自部署经 OpenAI 兼容插件，T2: AGA-embeddings NO live-probe 实证]），替换 P13b 本地 `RetrievalLinker` 薄默认（additive swap，seam 契约不变，P13b 引擎逻辑不变）。

**Design**: P5 6 决策 + P13b Q1 contract（`RetrievalLinker.retrieve(query, {topK, mode}) → readonly RetrievalHit[]`，`RetrievalHit{id, score, payload, mode}`——见 `packages/data/nl2sql-engine/src/bm25-linking.ts`）。生产 `packages/{retrieval,embedder}/...`（镜像 P4/credentials）。P13b `Bm25Linker` 默认 → 真 `ctx.retrieval` provider swap（additive，`RetrievalLinker` 接口不变）。embedder 外置（P5 `InfinityEmbedder`，OpenAI 兼容 `POST /v1/embeddings`）/in-proc bge-m3/sqlite-vec/Qdrant 升级档（P5 既定梯）；`InferenceError`→BM25-only 降级。P5b 也声明 `ctx.embedder` seam。

**Research**: → `../../research/{vector-rbi-mirror.md, vector-embedder-intranet.md, retrieval-consumer-model.md, vectorization-frontier.md, vector-seam-structure.md, vector-backend-ts.md, t2-aga-embeddings-probe.md}` + P5 ticket + P13b ticket Q1。

## Resolution（resolved 2026-08-20）

P5 prototype → 生产 `packages/{embedder,retrieval}/`（5 包，镜像 P4/credentials）+ additive swap P13b `search_data_sources` 工具软回退。**3 subagent 调研 grounding**（A cordis seam 语义 / B rbi 镜像保真 / C 包落地机制）+ **5 open decisions grilled（推荐→采纳）** + 33/33 spec + per-pkg tsc clean + cordis-config 132 pass。

**5 决策（grilled 推荐→确认）**：
- **#1 swap 机制（crux）→ (a) 软回退·async seam·仅换工具**：`ctx.retrieval.retrieve` async `Promise<readonly RetrievalHit[]>`（支持 InfinityEmbedder HTTP；FakeHash 返 `Promise.resolve` 保 Protocol 统一），`RetrievalHit{id,score,payload:unknown,mode}` 形状匹配 P13b。**P13b RetrievalLinker/Bm25Linker/engine/eval 全不碰**（字面 接口不变+引擎逻辑不变+9/9 green）。生产 swap 落 `search_data_sources` execute：`ctx.get('retrieval')` 安全探测（subagent A 实证 cordis `reflect.ts`：直接 `ctx.retrieval` 未注册抛 `"cannot get property retrieval without inject"`；`ctx.get` 返 undefined 无副作用；`import type{}` 仅类型增强不注册 provider）→有则 await 真 hybrid，无则同步 Bm25Linker（现状）。`inject=['tools']`（不列 retrieval，免阻塞加载）。eval 留 Bm25Linker（P13 BM25-only 诚实门值）。bundle retrieval/embedder 行 opt-in（注释，类 G3c）→默认 boot 无 ctx.retrieval=Bm25Linker（无回归），激活（hybrid-by-default vs Bm25Linker）留 D2c keep/regress。
- **#2 包结构 → 两组 dir·seam+provider 拆**：`packages/embedder/{embedder(seam+Reranker peer+InferenceError+tokenize), embedder-fakehash(FakeHash+FakeReranker 默认), embedder-http(InfinityEmbedder+InfinityReranker 外置)}` + `packages/retrieval/{retrieval(seam), retrieval-inproc(hybrid provider)}`。镜像 P4/credentials；pnpm-workspace `packages/*/*` wildcard 覆盖（无需改）；省 `static Config`（config 原样透传，镜像 credentials-keychain injectable instance 模式）。
- **#3 embedder 后端 → FakeHash + InfinityEmbedder NOW；bge-m3/sqlite-vec/Qdrant DEFER**：默认 FakeHash（零依赖 sha256 stub）+ InfinityEmbedder（OpenAI 兼容 `POST /v1/embeddings`+`/rerank`，opt-in，config url+model+timeout，**无 auth now**——T2 用户自部署；auth-token 经 credentials seam deferred；injectable fetch 测试免端口）。in-proc bge-m3/sqlite-vec/Qdrant 留 P5 既定梯。**覆盖 subagent C 的 defer 建议**（T2 闭环+P5 locked design+原型已 ship+InferenceError 降级须真 async embedder 测）。
- **#4 ctx.embedder seam → 声明**：abstract `EmbedderService extends Service`（dim/modelId/embed async）+ Reranker peer protocol（modelId/rerank async，**非顶层 seam**，RRF 后注入）+ InferenceError 4 kinds（unavailable/timeout/not_ready/dim_mismatch）→BM25-only 降级。retrieval-inproc `static inject=['embedder']`。
- **#5 retrieve-tool escape-hatch → DEFER**：D2c 票 owns keep/regress（evals 驱动）。P5b 只 ship pipeline-internal（seam+provider+工具软回退），model-facing `retrieve` tool = D2c。

**rbi 镜像保真（subagent B）**：rbi 全同步（短命 MCP subprocess 阻塞无害）→ TS 全链路 async（Node 事件循环+HTTP fetch）——rbi 实现细节非设计意图，TS 必须异步。BM25 对齐 rbi k1=1.5/b=0.75（原型 1.2 修正）；RRF k=60 rank 1-indexed；`_clamp_bm25_scores` idf>=0；FIELD_WEIGHTS 简化 {id:3,description:1,metric:4}（rbi 更丰富 field_name/desc/domain 留 P6b ctx.schema）；RERANKER_NOISE_FLOOR=0.1（REJECT_FLOOR/no_strong_match 留 consumer）。reranker RRF 后精修（noise floor 过滤）。

**包解析 / lock race**：跨包 import 经 tsconfig.base 加 2 specific path 条目（`@deepseek-ai/dsh-embedder/src/*` + `@deepseek-ai/dsh-retrieval/src/*`，镜像 host-directory-picker/* 先例）解析到 source——**免 pnpm install / pnpm-lock 触动**（并发 host-typecheck-wiring session 正活跃改 tsconfig.host + pnpm-lock web 重构，1083 行 lock diff；P5b 不 entangle）。tsconfig.host refs for embedder/retrieval DEFER（并发正改 tsconfig.host；P5b bar 经 per-pkg tsc + tsconfig.base paths 已满足）。

**Assets**：
- `packages/embedder/{embedder,embedder-fakehash,embedder-http}/`（seam + 2 provider；src + tests + tsconfig + invariant + package.json）。
- `packages/retrieval/{retrieval,retrieval-inproc}/`（seam + hybrid provider；`hybrid.ts` 纯 HybridRetriever + BM25Okapi + rrfFuse + cosine + buildCorpus）。
- `packages/data/tool-search-data-sources/src/index.ts`（软回退 swap：`ctx.get('retrieval')` + `projectHit`；+ tests S8）+ tsconfig ref `../../retrieval/retrieval` + package.json dsh-retrieval dep。
- `tsconfig.base.json`（+2 specific path 条目）。
- `packages/bundle/data-agent/cordis.patch.yml`（retrieval/embedder 行 opt-in 注释，填确认包名 `dsh-embedder-fakehash`/`dsh-retrieval-inproc`，删 TBD-P5）。

**Validated**：33/33 spec（embedder 15 + retrieval 10 + tool 8 含 S8 swap 验 ctx.retrieval 注册→用真 provider）+ per-pkg tsc clean + verify-cordis-config 132 pass。

**P13b 9/9 影响**：P5b **不碰** nl2sql-engine（RetrievalLinker/Bm25Linker/engine/eval 全不变）。当前工作树 nl2sql-engine spec 8/10（S7/S8 eval-gate 失败）是**并发 host-typecheck-wiring session 的 critic-dedup 重构在途**所致——隔离证实（revert P5b 的 tsconfig.base 2 path 条目后 nl2sql-engine 仍 8/10；nl2sql-engine 不 import 任何 P5b 包）→ P5b 无辜。P5b commit diff 不含 nl2sql-engine。

**Unblocks**：D2c（retrieve-tool keep/regress，evals 驱动——P5b 提供真 hybrid provider + 软回退能力；D2c 决定激活）；**清 P13b Q1 毕业 fog「本地 RetrievalLinker 薄默认」**（P5b 真 provider additive swap 已就位，opt-in 激活即替薄默认）。in-proc bge-m3/sqlite-vec/Qdrant 升级档 + retrieve-tool model-facing tool + embedder auth-token 经 credentials seam + tsconfig.host refs = follow-up。
