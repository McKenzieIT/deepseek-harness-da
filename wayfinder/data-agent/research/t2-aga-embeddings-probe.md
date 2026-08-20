# T2 · AGA-embeddings live-probe（内网重 embedder 走 AGA 还是独立 sidecar）

> 研究问题：DashScope text-embedding（`text-embedding-v3`/`v4`）经内网 AGA 网关是否可达？AGA 是 relay 层——公网 DashScope 有 embeddings **不**意味着 AGA 中转提供。须像 P2 探 chat 一样 live-probe，定 intranet 重 embedder 走 AGA（省 sidecar）还是须独立推理服务。本笔记用 live 探针实证回答，并佐证 P13 Q2「AGA 不提供向量模型已确认」。

## TL;DR

**AGA 不中转 text-embedding——live-probe 实证 NO。** 6 个探针（2026-08-20，预发 AGA 网关，key 经 credentials seam 文件 `~/.dsh/.credentials.yaml`、不入库/不进 env/不打印）：

- `GET /api/v1/models` → 200，模型清单 10 个全 **chat generation**（`qwen-flash`/`qwen-plus`/`qwen-plus-latest`/`qwen3-max`/`qwen3.5-{flash,plus}`/`qwen3.6-{flash,plus}`/`qwen3.7-{max,plus}`），**无任何 `text-embedding-*`**（与 P2 同清单，AGA 目录不广告 embedding 模型）。
- chat pong（native `/api/v1/services/aigc/text-generation/generation`）→ **200**，`request_id` 在体（`3c3669af-…`），usage 正常 → **key 有效、AGA 可达、native chat 协议通**（控制组通过：embeddings 的 404 非鉴权/非不可达问题）。
- 4 个 embeddings 端点变体全 **404 Not Found**：native `/api/v1/services/embeddings/text-embedding/text-embedding`（v3 + v4 dim=256）、OpenAI 兼容 `/v1/embeddings`、compat-mode `/compatible-mode/v1/embeddings`。404 体空、**无 `request_id`**、~50–61ms。
- 404 的形态钉死是**网关级路由未找到**：P2 实证 DashScope 服务级错误把 `request_id` 放**错误体**；本探针的 404 **体空 + 无 request_id** = AGA 路由表根本不暴露 embeddings 服务路径（在到达 DashScope 服务前被网关拒）。chat 路径被路由（200），embeddings 路径不路由（404）→ **AGA 选择性 relay chat generation、不含 embeddings**。

**决策 (c)**：intranet 重 embedder **走独立推理 sidecar，非 AGA**。与 P5 / rbi 一致：外置 OpenAI 兼容 embedder 插件（`InfinityEmbedder` wire `POST /v1/embeddings {model,input}`→`data[].{embedding,index}`），跑 `BAAI/bge-m3`/`Qwen3-Embedding`；具体 serving 框架（Infinity/TEI/Ollama）+ 模型 = 用户部署选择，map 不裁定。**P13 Q2「AGA 不提供向量模型已确认」由本 live-probe 实证佐证**（默认期望 NO 兑现）。

## 1. 探针实证（primary source）

6 个请求，预发 AGA 网关 `https://pre-aga-ai-gateway.alibaba-inc.com`，2026-08-20，key 经 credentials seam 文件（len=16，不进 env/不打印/不入库）。探针脚本 `/tmp/probe-aga-embeddings.mjs`（throwaway，mirror P2 `/tmp/probe-dashscope.mjs`，每请求 15s 超时，绝不打印 key、redact `Bearer` 回显）。原始输出见会话探针结果。

### 1.1 C1 GET /api/v1/models（控制：可达性 + 目录）
- 200，379ms。body：`{"models":["qwen-flash","qwen-plus","qwen-plus-latest","qwen3-max","qwen3.5-flash","qwen3.5-plus","qwen3.6-flash","qwen3.6-plus","qwen3.7-max","qwen3.7-plus"]}`。
- → 10 个模型，**全 chat generation，无 `text-embedding-*` / 无 qwen3-embedding**。与 P2 实测清单一致（P2 亦 10 个 chat 模型）。AGA 模型目录不广告 embedding 模型（circumstantial NO，非 conclusive——目录可能按设计只列 chat，故下文直探 embeddings 端点）。

### 1.2 C2 chat pong（控制：key 有效性 + native 推理可用）
- 200，2277ms。body：`{"output":{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"Sure! Here's a simple text-based version of **Pong**…"}}]},"usage":{"input_tokens":9,"output_tokens":175,"total_tokens":184,"prompt_tokens_details":{"cached_tokens":0}},"request_id":"3c3669af-2814-9c1d-96d9-321c1372df82"}`。
- → native generation 通，`request_id` 在**体**顶层（非响应头，同 P2），usage 带 `prompt_tokens_details.cached_tokens`。**key 有效、AGA 可达、推理 scope 通** → embeddings 端点的 404 是「路径不存在」而非「鉴权失败/不可达」。

### 1.3 E1 native text-embedding v3
- `POST /api/v1/services/embeddings/text-embedding/text-embedding`，body `{model:"text-embedding-v3", input:{texts:["ping"]}, parameters:{}}`。
- **404 Not Found**，61ms。`content-type` 空、body 0 字节、**无 `request_id`**（体空无、头无）。
- → DashScope native text-embedding 服务路径在 AGA 不存在。

### 1.4 E2 native text-embedding v4 + dimensions
- 同 E1 路径，body `{model:"text-embedding-v4", input:{texts:["ping"]}, parameters:{dimensions:256}}`。
- **404 Not Found**，54ms。体空、无 `request_id`。
- → v4 同样不可达（排除「仅 v3 未挂、v4 可用」可能）。

### 1.5 E3 OpenAI 兼容 /v1/embeddings
- `POST /v1/embeddings`，body `{model:"text-embedding-v3", input:"ping"}`（OpenAI 兼容信封）。
- **404 Not Found**，59ms。体空、无 `request_id`。
- → AGA 不暴露 OpenAI 兼容 embeddings 端点（与 P2「AGA 非 OpenAI 兼容、是 native」一致——chat 都不走兼容模式，embeddings 亦无）。

### 1.6 E4 compat-mode /compatible-mode/v1/embeddings
- `POST /compatible-mode/v1/embeddings`，body 同 E3。
- **404 Not Found**，50ms。体空、无 `request_id`。
- → 公网 DashScope 的 `https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings` 兼容端点在 AGA 无对应中转（公网能力不继承，同 P2）。

### 1.7 404 形态释读（网关级 vs 服务级）
- P2 实证：DashScope **服务级**错误（如顶层 tools 被丢、模型不存在等）把 `request_id` 放**错误体**（`{code,message,request_id}`）。
- 本探针 4 个 embeddings 404 **体全空 + 无 request_id + ~50-61ms 极快** → 是 **AGA 网关路由层**在请求到达 DashScope 服务前就拒掉（路径未注册），非 DashScope 服务返回的业务错误。
- → 钉死：AGA 路由表根本不挂 embeddings 服务路径；chat 路径挂了（C2 200）。**AGA 是选择性 relay**（挂 text-generation，不挂 text-embedding），非全量 DashScope 代理。

## 2. 对 P13 / P5 的佐证

| 项 | P13 Q2 / P5 fog 线 | 本探针（本文）|
|---|---|---|
| AGA 提供向量模型？ | 「已确认 NO」（P13 Q2，未 live-probe 前为推断） | **live-probe 实证 NO**：4 端点变体全 404 + 目录无 embedding 模型 + chat 控制通 |
| embeddings relay 形态 | 「未验证、默认期望 NO」（P5 README） | NO 兑现：路径不存在（网关级 404） |
| intranet 重 embedder 走向 | 「用户自部署经 P5 外置 embedder，非 AGA relay」（P5/P13 fog） | 决策落定：**独立 sidecar，非 AGA** |
| 公网能力是否继承 AGA | P2「公网能力不继承」（chat：AGA 非 OpenAI 兼容镜像） | embeddings 同律：公网 DashScope 有 embeddings，AGA 不中转 |

**P13 Q2「AGA 不提供向量模型已确认」此前是基于 P5 fog「默认期望 NO」+ 目录推断；本探针用 live 4×404 + chat 200 控制实证佐证，从「推断/默认期望」升级为「live-probe 实证」。** P5/P13 引擎逻辑（首期纯 BM25-only + 向量侧升级=用户自部署经 P5 外置 embedder）不变。

## 3. 给 dsh-data-agent 的推荐方案（决策 c）

**intranet 重 embedder = 独立推理 sidecar，非 AGA relay。** 落 P5 `ctx.embedder` seam 的外置档（`InfinityEmbedder`）：

- **wire**：OpenAI 兼容 `POST /v1/embeddings`，body `{model, input: texts}` → `data[].{embedding, index}`（镜像 rbi `InfinityEmbedder` + P5 prototype `InfinityEmbedder`，已是 seam 既定外置档）。
- **serving 框架**（用户部署选择，map 不裁定）：Infinity（rbi 默认名、bge-m3 友好）/ TEI（rbi backup 名）/ Ollama（可跑 embedding）三选一，按部署环境（GPU/CPU、规模、是否需 rerank 同栈）定；rbi `load_embedder` 已支持 `RBI_EMBED_URL` + `RBI_EMBED_MODEL`（默认 `bge-m3`）配置。
- **模型**：`BAAI/bge-m3`（rbi/P5 默认，多语、1024 维、8192 tok、dense+sparse+colbert）或 `Qwen/Qwen3-Embedding-{0.6B,4B}`（2560 维可截、MRL、instruct）。两者皆 OpenAI 兼容 `/v1/embeddings` 可服务。选型属用户部署 ops，非 map 架构决策。
- **降级**：`InferenceError`（unavailable/timeout/not_ready/dim_mismatch）→ BM25-only（rbi/P5 既定梯），sidecar 不可用时 retrieval 不死。
- **P5 seam 契约不变**：`ctx.embedder`（`embed(texts)→vec[]` + `dim`/`model_id`）+ `ctx.retrieval`（hybrid BM25+vec+RRF）。sidecar 是 `InfinityEmbedder` 的一个 deployment，seam 无感。P13 引擎逻辑（首期 BM25-only）不变，向量侧 swap 是 seam 透明替换。

**为何不走 AGA**：AGA 经本探针实证不中转 embeddings（4×404 + 目录无 embedding 模型 + chat 控制通证非鉴权问题）；即便公网 DashScope 有 text-embedding，AGA 不继承（P2 同律）。无干净内网 AGA-embeddings 路径 → 须独立 sidecar。**省 sidecar 的指望落空**（P5 fog「省一个 sidecar」的 yes 分支证伪）。

## 4. DashScope text-embedding 精确规格（SECONDARY 一手核验）

**一手核验状态**：官方 `help.aliyun.com/zh/model-studio/text-embedding` 在本环境 **403**（与 P5 环境同；WebFetch + builtin crawler 均被企业网拦）。故下表规格为**多源 SECONDARY**（CSDN/知乎多文交叉印证），非官方一手；live 探针的 404 形态是本笔记的 **primary** 实证。

| 项 | 规格（SECONDARY，多源印证）|
|---|---|
| 模型 | `text-embedding-v3`/`v4`（v1/v2 渐淘汰；v4 最新）|
| 默认维度 | v3=1024、v4=1024（v2=1536）|
| 可调维度 | v3/v4 自定义任意（v3 min 32；v4 推荐 256/512/768/1024），MRL 截断不损性能 |
| batch | 10 texts/批 |
| native 信封 | req `{model, input:{texts:[...]}, parameters:{}}` → resp `{output:{embeddings:[{embedding,text_index}]}, usage, request_id}`（与 chat `{input:{messages},parameters}`→`{output:{choices},usage,request_id}` 同构）|
| OpenAI 兼容 | 公网 `POST https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings` `{model, input, dimensions}` → `{data:[{embedding,index}]}`（**AGA 无此中转，本探针 E4 404**）|
| 参数 | `dimensions`（维度）；`text_type`{query,document}（**仅 native SDK/API，OpenAI 兼容不支持**）；`instruct`（v4 任务指令；空则 text_type 无效）|
| 一手缺口 | 官方 docs 403，未直读；上述维度/batch/参数来自多 SECONDARY 源交叉。live 探针仅证 AGA NO，未拿到真实 embedding 向量（AGA 不服务）。|

**对 data-agent 的影响**：data-agent 不直连公网 DashScope（intranet-security-first，无公网出口）；即便要 DashScope embedding 也须经 AGA，而 AGA NO → 公网 DashScope embedding 规格**对 intranet 部署无可用路径**。故 intranet 重 embedder 必自部署 sidecar（§3），DashScope 规格仅作「公网有什么」背景知识。

## 5. 剩余决策（待用户确认）

1. **首期是否上向量侧**：P13 首期纯 BM25-only（已 ship）；向量侧升级时机 = evals 驱动（D2 (c) keep/regress 可逆，待 P11 eval harness 就绪）。T2 不强制现在上 sidecar，只定走向。
2. **sidecar 框架/模型选型**：Infinity/TEI/Ollama + bge-m3/Qwen3-Embedding——属用户部署 ops（依赖 GPU/CPU/规模/rerank 同栈需求），非 map 架构决策，留给部署期。
3. **sidecar 托管形态**：独立进程（rbi `RBI_EMBED_URL` 外置）还是 da 同栈插件？rbi/P5 既定「外置 OpenAI 兼容 HTTP sidecar」（`InfinityEmbedder` 经 URL），保持既定即可（additive，与 P4b sidecar 模式同构）。

## 来源（Sources）

- **primary**：会话内 live 探针 `/tmp/probe-aga-embeddings.mjs` 输出（2026-08-20，预发 AGA 网关，6 请求；key 经 `~/.dsh/.credentials.yaml` credentials seam 文件、不入库/不进 env/不打印）。〔本文 §1 引用其原始输出〕
- `wayfinder/data-agent/research/p2-dashscope-wire.md`（AGA native 协议实证 + 模型清单 `GET /api/v1/models` + `request_id` 在错误体 + 公网能力不继承）。
- reverse-bi `libs/rbi-retrieval/src/rbi_retrieval/semantic/embedder.py`（`Embedder` Protocol + `FakeHashEmbedder`/`SentenceTransformerEmbedder`(bge-m3) + `InfinityEmbedder`(OpenAI 兼容 `/v1/embeddings`) + `InferenceError` 降级梯 + `load_embedder` 工厂 + `RBI_EMBED_URL`/`RBI_EMBED_MODEL` 配置）。
- P5 prototype `wayfinder/data-agent/prototypes/p5-retrieval-vectorization/{run.mjs,sidecar.mjs,README.md}`（`ctx.embedder`+`ctx.retrieval` seam + `InfinityEmbedder` 镜像 rbi wire + 「AGA-embeddings UNVERIFIED, expect NO」门）。
- P5 vector-rbi-mirror / vector-embedder-intranet research notes（DashScope text-embedding 公网存在性 + 精确规格 SECONDARY + AGA 未验证）。
- P13 ticket Finding/Design Q2（「AGA 不提供向量模型已确认」+ 首期纯 BM25-only + 向量侧用户自部署）。
- web SECONDARY（官方 help.aliyun.com 403，多源交叉）：text-embedding v3/v4 维度/batch/参数/native 信封/compat-mode 端点（CSDN/知乎多文，2025-2026）。
