# 向量 backend / BM25 / reranker 部署（TS/Node 现实核源）

> P5 调研切片 S2（重派 foreground 同步返回，首轮 background dispatch 丢失已补）。Scope：TS/Node 现实 for D4 升级层 + 生产 BM25/reranker。核源范围：仅 npm registry / GitHub raw+API / unpkg 已发布包内容 / 官方 README，2026-08 复核。标注：`[核源]`=本 pass 直接复核；`[未复核]`=未在本 pass 直接取证。不引用二手博客。

## TL;DR
- **sqlite-vec 0.1.9**：活跃维护（2026-03 发版、2026-05 仓库仍推）、纯 C 零运行时依赖、预编译二进制按平台经 npm `optionalDependencies` 分发（**无运行时联网**，满足内网）；但仍是 **0.1.x / pre-1.0**、202 open issues、0.1.9 刚修核心 DELETE 正确性 bug #274。升级层**有条件 YES**，不设为默认层。
- **BM25（TS）**：`@orama/orama` v3.1.18（零依赖、TS-native、内置 BM25+向量+Hybrid，2026-07 维护）= 主路径；`minisearch` v7.2.0（零依赖、TS-native、源码明示 **BM25+**）= 纯 BM25 轻量备选。`search-index`（native LevelDB）、`wink-bm25-text-search`（2022 停更）、`bm25`（2018 死）不选。
- **Reranker（TS）**：`@huggingface/transformers` v4.2.0 **无 reranker pipeline**（已发布包 `src/pipelines/` 无 `text-ranking`、README 任务表无该项、全文不提 rerank），且默认从 huggingface.co+CDN 拉模型=运行时 egress、后端 `onnxruntime-node` 为 native → **不在 agent 主进程跑**。外部 precedent 经核源：HuggingFace **TEI**（README 明确 "Using Re-rankers models"+"Air gapped deployment"+gRPC+Docker+支持 Qwen3/GTE/BGE）= 首选 sidecar；**infinity**（reranking REST+Docker+多模型）= 备选。
- **Q4**：`@qdrant/js-client-rest` v1.19.0（2026-08-04）、`@zilliz/milvus2-sdk-node` v3.0.4（2026-07-30）均存在且活跃 `[核源]`。

## Q1 — sqlite-vec (github.com/asg017/sqlite-vec, npm `sqlite-vec` 0.1.9)

### 维护/成熟度（核源）
- npm registry：`latest=0.1.9`，最后发布 `2026-03-31`，`modified=2026-05-18`，共 70 个版本，**零 dependencies**，license `MIT OR Apache`，未声明 engines/os/cpu `[核源 https://registry.npmjs.org/sqlite-vec]`。
- GitHub repo meta：`stars=8025`，`open_issues=202`，`archived=false`，`created=2024-04-20`，`pushed=2026-05-18`，license Apache-2.0 `[核源 https://api.github.com/repos/asg017/sqlite-vec]`。
- 最新 release `v0.1.9`（2026-03-31），release 名 "v0.1.9 Bug fix for DELETE operations"，正文："Fixes #274, which discovered that `DELETE` operations on `vec0` tables with metadata text columns that are long (>12chars) would erroneously report a `SQLITE_DONE` error." `[核源 https://github.com/asg017/sqlite-vec/releases/tag/v0.1.9]` → **0.1.x 仍在修核心写路径正确性 bug**，pre-1.0 信号明确。
- README 自述："Written in pure C, no dependencies, runs anywhere SQLite runs (Linux/MacOS/Windows, in the browser with WASM, Raspberry Pis, etc.)"；特性：`vec0` 虚拟表、float/int8/binary 向量、KNN 查询 `where <col> match '[...]' order by distance limit k` `[核源 https://raw.githubusercontent.com/asg017/sqlite-vec/main/README.md]`。

### Node 集成方式（核源 = 已发布包源码）
`sqlite-vec` npm 包本体是 ~1.5KB 的 JS dispatcher，**不含二进制**；二进制在按平台分包里。取自已发布 `index.cjs` `[核源 https://unpkg.com/sqlite-vec@0.1.9/index.cjs]`：
```js
const supportedPlatforms = [["darwin","x64"],["linux","x64"],["darwin","arm64"],["win32","x64"],["linux","arm64"]];
function getLoadablePath() {
  const packageName = `sqlite-vec-${os}-${arch}`;                 // e.g. sqlite-vec-linux-x64
  return require.resolve(`${packageName}/vec0.${ext}`);          // vec0.so | vec0.dylib | vec0.dll
}
function load(db) { db.loadExtension(getLoadablePath()); }
module.exports = { getLoadablePath, load };
```
- `index.d.ts` 契约：`load(db: { loadExtension(file, entrypoint?): void }): void` `[核源 https://unpkg.com/sqlite-vec@0.1.9/index.d.ts]`。
- `package.json` `optionalDependencies` 声明 5 个平台包（`sqlite-vec-darwin-x64/linux-x64/darwin-arm64/windows-x64/linux-arm64` 均 `0.1.9`）`[核源 https://unpkg.com/sqlite-vec@0.1.9/package.json]` → npm 安装时自动落匹配平台二进制，**不在运行时联网**（egress 安全，前提 node_modules vendored/锁版本）。
- 平台二进制包确实 ship 预编译扩展：`sqlite-vec-linux-x64@0.1.9` 内含 `vec0.so`（159816 bytes）`[核源 https://unpkg.com/sqlite-vec-linux-x64@0.1.9/?meta]`；5 个平台包均在 0.1.9 有发布。

**better-sqlite3 路径（推荐）**：`sqliteVec.load(db)` 调 `db.loadExtension(...)`。`better-sqlite3` v13.0.3（2026-08-05 发布，deps `node-addon-api`，engines `node>=22`）活跃维护，其 `Database` 暴露 `.loadExtension(path, entrypoint?)` `[核源 https://registry.npmjs.org/better-sqlite3]`。用法：
```ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
const db = new Database(':memory:');
sqliteVec.load(db);                         // 加载 vec0 扩展
db.exec("create virtual table vec_examples using vec0(sample_embedding float[8])");
const rows = db.prepare(
  "select rowid, distance from vec_examples where sample_embedding match ? order by distance limit 2"
).all('[0.89,0.54,0.82,0.96,0.35,0.01,0.52,0.17]');
```
- `bun:sqlite` / `libsql`(`@libsql/client` v0.17.4, 2026-06-15 活跃 `[核源]`) / `node:sqlite` 亦在 sqlite-vec 官方 Node 文档（`alexgarcia.xyz/sqlite-vec/js.html`）覆盖范围内；**该 js.html 页面本 pass 未取回正文**（curl 返回空，疑站点策略），Node API 以上述已发布源码 `index.cjs` 为准 `[未复核 js.html 内容]`。

### 已知 caveat（核源）
1. **平台受限**：仅 darwin-x64/darwin-arm64/linux-x64/linux-arm64/win32-x64 五个 glibc/darwin/win 组合有预编译；**Alpine/musl 无预编译**，需自行编译或换 glibc 基础镜像 `[核源 index.cjs supportedPlatforms]`。
2. **pre-1.0**：0.1.x、202 open issues、最近仍在修 DELETE 正确性 bug #274 → 不应视为 1.0-stable，升级 minor 前需回归 `[核源 release v0.1.9]`。
3. **非纯 JS**：是 native C loadable extension（.so/.dylib/.dll），依赖平台二进制在位；与 D4 默认"纯 JS in-mem cosine 零依赖/clone-and-run"是不同 tier，不可替代默认层。
4. egress：**无运行时联网**（二进制经 npm 装入 node_modules）；满足内网默认，前提是 vendored/锁版本 node_modules。

## Q2 — BM25 in TS/Node

| 包 | 最新版 | 最后发布 | 依赖 | TS-native | 维护 | BM25 | 取舍 |
|---|---|---|---|---|---|---|---|
| `@orama/orama` | 3.1.18 | 2026-07-27(mod)/2025-12(v) | **零** | 是 | 活跃 | 是(BM25+Full-Text+Vector+Hybrid) | **主路径** |
| `minisearch` | 7.2.0 | 2025-09-16 | **零** | 是(lucaong/minisearch, TS 源) | 维护(<12mo) | 是(**BM25+**) | 纯BM25备选 |
| `search-index` | 6.0.2 | 2026-08-14 | classic-level/browser-level 等(native LevelDB) | 是 | 活跃 | 是 | 非0依赖/有native → 不选 |
| `wink-bm25-text-search` | 3.1.2 | 2022-11-21 | wink-nlp 等 | 否(JS) | **停更3.5y** | 是 | 不选 |
| `bm25` | 0.1.1 | 2018-12-16(v)/2022(mod) | lodash | 否 | **死** | 是 | 不选 |

核源：`[https://registry.npmjs.org/@orama/orama]`、`[https://registry.npmjs.org/minisearch]`、`[https://registry.npmjs.org/search-index]`、`[https://registry.npmjs.org/wink-bm25-text-search]`、`[https://registry.npmjs.org/bm25]`。

- **Orama**：README 明列 Full-Text search / Vector Search / Hybrid Search / BM25 链接（`docs.orama.com/docs/orama-js/search/bm25`）；schema 支持 `vector[<size>]`，`mode: 'vector'|'hybrid'|'fulltext'`；零 dependencies、Apache-2.0、engines `node>=20` `[核源 https://raw.githubusercontent.com/oramasoftware/orama/main/README.md + registry]`。→ 与 `ctx.embedder`/`ctx.retrieval` 的 hybrid seam 天然对齐：**单包覆盖 BM25 召回 + 向量召回 + 混合**，是 TS 内嵌 BM25 的主路径。
- **MiniSearch**：repo `github.com/lucaong/minisearch` `[核源 npm repository 字段]`；README "Modern search result ranking algorithm"+"Zero external dependencies"；源码 `src/MiniSearch.ts` 第 166-171 行注释："**BM25+ algorithm parameters.** Customizing these is almost never necessary, and finetuning them requires an understanding of the **BM25** scoring model."，并有 `bm25?: BM25Params` 选项 `[核源 https://raw.githubusercontent.com/lucaong/minisearch/master/src/MiniSearch.ts]`。→ 零依赖、TS-native、确为 **BM25+**；只做 BM25（不需要向量/hybrid）时的轻量备选。
- search-index 虽活跃但依赖 `classic-level`(native LevelDB binding)、`engines node>=22`，非轻量/有 native，不符合"小/零依赖"偏好 `[核源 registry deps]`。

**现实结论**：TS/Node 进程内 BM25，主路径 **Orama**（自带 hybrid，与向量 seam 同包），轻量备选 **MiniSearch**（纯 BM25+，零依赖）。两者均零依赖、TS-native、可 clone-and-run，符合 D4 默认层调性。

## Q3 — Reranker in TS/Node

### transformers.js 现状：`@xenova/*` 已弃用 → `@huggingface/transformers`
- `@xenova/transformers` latest 2.17.2，**最后发布 2024-05-29，停更** `[核源 https://registry.npmjs.org/@xenova/transformers]` → 旧名，勿用。
- `@huggingface/transformers` latest 4.2.0，最后发布 2026-04-22，仓库 `pushed=2026-08-19`（活跃），stars 16260，deps 含 `onnxruntime-node`/`onnxruntime-web`/`@huggingface/tokenizers`/`sharp` `[核源 https://registry.npmjs.org/@huggingface/transformers + https://api.github.com/repos/huggingface/transformers.js]` → 迁移目标。

### 能否跑 bge-reranker-v2-m3 / Qwen3-Reranker？→ 无一等公民 reranker pipeline
- 已发布包 `@huggingface/transformers@4.2.0` 的 `src/pipelines/` 文件清单（unpkg meta）枚举所有 pipeline 文件：audio-classification、automatic-speech-recognition、background-removal、depth-estimation、document-question-answering、feature-extraction、fill-mask、image-classification、image-feature-extraction、image-segmentation、image-to-image、image-to-text、object-detection、question-answering、summarization、**text-classification**、text-generation、text-to-audio、text2text-generation、token-classification、translation、zero-shot-* —— **无 `text-ranking`/reranker 文件** `[核源 https://unpkg.com/@huggingface/transformers@4.2.0/?meta]`。
- README "Supported tasks/models" 任务表列出 fill-mask / question-answering / sentence-similarity / summarization / text-classification / text-generation / text2text-generation / token-classification / translation / zero-shot-classification / feature-extraction 等，**无 reranker/text-ranking 任务行** `[核源 https://raw.githubusercontent.com/huggingface/transformers.js/main/README.md 行161+]`。
- 全 README grep `rerank|bge-reranker|text-ranking|cross-encoder` → **0 命中** `[核源 同上 README]`。

→ **结论**：transformers.js v4.2.0 没有一等公民 reranker pipeline。`bge-reranker-v2-m3` 在原理上是 XLM-RoBERTa 序列分类头（输出 relevance score），只能被**强塞进 `text-classification` pipeline**，且依赖 HF hub 上存在 transformers.js 兼容的 ONNX 导出——这是一条**未文档化、脆弱**的路径，非受支持用法。`Qwen3-Reranker` 是 Qwen3 生成式 LLM reranker（靠 instruct prompt + logit 抽取得分），transformers.js 无 rerank 任务、text-generation 也无法产出 relevance score → **不可跑**。

### 运行时 egress（关键，违反内网默认）
- README 原文："By default, Transformers.js uses **hosted pretrained models** [from Hugging Face Hub] and **precompiled WASM binaries** [from CDN]" `[核源 README 行137]` → **默认即运行时联网拉模型/WASM**，违反内网默认。
- 可禁用：README 同段给出 `env.allowRemoteModels = false;` + `env.localModelPath = '/path/to/models/';` + `env.backends.onnx.wasm.wasmPaths = '/path/to/files/';` `[核源 README 行144-152]` → 需**预绑 ONNX 模型并禁远端**才满足内网；且后端 `onnxruntime-node` 是 **native** binding `[核源 registry deps]` → 即使预绑，也是 native 推理 + 模型体积/成本不轻。

### 外部 precedent（核源）
- **HuggingFace TEI（text-embeddings-inference）**：README TOC 明列 "Using Re-rankers models"、"Using Sequence Classification models"、"Air gapped deployment"、"gRPC"、"Docker Images" `[核源 https://raw.githubusercontent.com/huggingface/text-embeddings-inference/main/README.md]`。正文："TEI is a toolkit for deploying and serving open source text embeddings and **sequence classification models**"；支持矩阵含 "Nomic, BERT, CamemBERT, XLM-RoBERTa, JinaBERT, Mistral, Alibaba GTE, **Qwen2**, MPNet, ModernBERT, **Qwen3**, Gemma3" `[核源 README 行66-72]`；"To deploy Text Embeddings Inference in an **air-gapped** environment, first download the weights and then mount them inside the container using a volume." `[核源 README 行384-387]`。→ **首选 reranker sidecar**：air-gapped 友好、gRPC、Docker、原生支持 Qwen3/GTE/BGE 系。
- **infinity（michaelfeil/infinity）**：README "Infinity is a high-throughput, low-latency REST API for serving text-embeddings, **reranking models**, clip, clap and colpali"，MIT；backends PyTorch/optimum(ONNX/TensorRT)/CTranslate2 + FlashAttention，CUDA/ROCM/CPU/MPS；Docker `michaelf34/infinity`；OpenAI 对齐 `[核源 https://raw.githubusercontent.com/michaelfeil/infinity/main/README.md 行24-31]`。→ 备选 reranker sidecar（多模型 mix-and-match）。
- vLLM rerank / DashScope rerank / Jina rerank：vLLM 有 score/rerank 能力、DashScope 有 `gte-rerank` API、Jina 有 rerank API——**本 pass 未直接取其官方文档正文**（Jina 页面为 JS 渲染，仅取回标题）`[未复核 vLLM/DashScope/Jina 官方文档正文]`。TEI+infinity 已足够作为核源 precedent。

### "reranker 重 → 外部 sidecar/API，不进 agent 主进程"是否 frontier 共识？
- **核源事实支撑**：TEI 与 infinity 作为**专用 reranker 服务**存在（Docker/gRPC/动态批/FlashAttention/air-gapped），正是业界把 reranker 推理独立成服务的直接证据；cross-encoder 对每对 (query, doc) 跑完整 transformer 前向、复杂度 O(pairs)，重于双塔 embedding 检索——架构常识。
- **"共识"定性**：本 pass 将其表述为**基于核源事实的综合判断**，非逐字引用。对 dsh 内网：reranker = 独立 TEI/infinity 容器（air-gapped 挂载权重）作为 `ctx.retrieval` 的 reranker seam，agent 主进程仅发 HTTP/gRPC，**不内嵌 transformers.js 跑 cross-encoder**。

## Q4 — Qdrant / Milvus TS clients（确认）
- `@qdrant/js-client-rest` latest **1.19.0**（2026-08-04 发布），deps `@qdrant/openapi-typescript-fetch`+`undici`，engines `node>=22` `[核源 https://registry.npmjs.org/@qdrant/js-client-rest]` → Qdrant 官方 TS REST 客户端，活跃。（Qdrant 另有 gRPC 客户端 `@qdrant/js-client-grpc`，本 pass 未在 npm 复核版本 `[未复核]`。）
- `@zilliz/milvus2-sdk-node` latest **3.0.4**（2026-07-30 发布），deps `@grpc/grpc-js`+`@grpc/proto-loader` 等，license Apache-2.0 `[核源 https://registry.npmjs.org/@zilliz/milvus2-sdk-node]` → Milvus 官方 Node SDK，活跃。
→ D4 外部 tier 的 TS 客户端**均存在且活跃**，确认。

## D4 upgrade-readiness verdict

**sqlite-vec 0.1.9 → 升级层：YES（有条件），不要设为默认层。**
- 条件：(1) 锁定 `sqlite-vec@0.1.9` + 对应平台二进制包 `sqlite-vec-<os>-<arch>@0.1.9`（npm `optionalDependencies` 会自动装，但 vendored node_modules 时务必确认目标平台 `vec0.so/.dylib/.dll` 在位）；(2) 目标平台限于已预编译 5 组（linux-x64/linux-arm64/darwin-x64/darwin-arm64/win32-x64；**Alpine/musl 无预编译**→换 glibc 镜像或自行编译）；(3) 默认层仍保留纯 JS in-mem cosine 作 clone-and-run/零依赖回退；(4) 视为 pre-1.0：跨 minor 升级前跑回归（0.1.9 刚修了 `vec0` DELETE 正确性 bug #274，核心写路径仍有在修的信号）。
- 应 **defer** 的场景：大语料 / 高并发写 / 无法锁定平台镜像 / 无法接受 pre-1.0 行为变更 → 直接走外部 tier（Qdrant/Milvus）或等 1.0。
- 理由：8k stars、Apache-2.0、纯 C 零运行时依赖、2026-03 仍活跃、预编译二进制经 npm 分发（无运行时联网，满足内网）、与 better-sqlite3 v13.0.3 配合只需 `sqliteVec.load(db)`；但 0.1.x、202 open issues、最近仍在修核心 DELETE 正确性 bug → 对"受控小语料、读多写少、可锁版本"的内网升级层可上（yes），对"生产关键/大规模"应 defer。

**推荐 BM25（TS 路径）：`@orama/orama` v3.1.18 为主路径。**
- 零依赖、Apache-2.0、TS-native、2026-07 仍维护、单包内置 Full-Text(BM25) + Vector + Hybrid → 与 `ctx.embedder`/`ctx.retrieval` 的 hybrid seam 同包对齐，省一个集成点。
- `minisearch` v7.2.0（BM25+，源码明示）为零依赖 TS-native 纯 BM25 备选（不需要向量/hybrid 时）。
- 不选：`search-index`（native LevelDB 依赖）、`wink-bm25-text-search`（2022 停更）、`bm25`（2018 死）。

**推荐 Reranker（TS 路径）：不在 agent 主进程跑；外部 sidecar/API。**
- `@huggingface/transformers` v4.2.0 无 reranker pipeline（已发布包 `src/pipelines/` 无 `text-ranking`；README 任务表与全文均无 rerank）→ 无法一等公民跑 bge-reranker-v2-m3/Qwen3-Reranker，强塞 `text-classification` 为未文档化脆弱路径；且默认从 huggingface.co+CDN 拉模型=运行时 egress（须 `env.allowRemoteModels=false`+预绑 ONNX 才合规），后端 `onnxruntime-node` 为 native → 不符"agent 主进程轻量"。
- 首选 sidecar：**HuggingFace TEI**（README 明确 "Using Re-rankers models"+"Air gapped deployment" 挂载权重+gRPC+Docker+支持 Qwen3/GTE/BGE）；备选 **infinity**（reranking REST+Docker+多模型）。两者 = "reranker 独立服务化"的核源 precedent。
- 落地：dsh 内网部署一个 TEI/infinity 容器（air-gapped 挂载权重）作为 `ctx.retrieval` 的 reranker seam，agent 仅发 HTTP/gRPC。"reranker 是重 cross-encoder → 外部 sidecar、不进 agent 主进程"在核源层面成立（专用 server 存在 + cross-encoder O(pairs) 成本）——基于核源事实的综合判断。

**tier 总结**：默认层 = 纯 JS in-mem cosine（零依赖/clone-and-run）；升级层 = sqlite-vec 0.1.9（有条件 yes，better-sqlite3 + 预编译二进制，无运行时联网）+ Orama BM25/hybrid（同进程）；reranker 与外部向量库 = 外部 tier（TEI/infinity sidecar + Qdrant/Milvus TS 客户端）。
