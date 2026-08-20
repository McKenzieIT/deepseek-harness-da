# T2 — AGA-embeddings live-probe

**Type**: task
**Phase**: 2
**Assignee**: wayfinder-session 2026-08-20
**Status**: Resolved (2026-08-20) — live-probe 6 探针实证 AGA-embeddings NO
**Surfaced by**: P5（resolved 2026-08-20）

**Question**: DashScope text-embedding（`text-embedding-v3`/`v4`）经内网 AGA 网关是否可达？AGA 是 relay 层——公网 DashScope 有 embeddings **不**意味着 AGA 中转提供。须像 P2 探 chat 一样 live-probe，定 intranet 重 embedder 走 AGA（省 sidecar）还是须独立推理服务。

**Background**（来自 P5 / `research/vector-embedder-intranet.md`）：
- 公网 DashScope text-embedding API 存在（v3 1024/8192tok/batch 10、v4 +sparse+instruct、qwen3.7 128k；既 OpenAI 兼容 `/v1/embeddings` 又 native DashScope `dashscope.TextEmbedding.call`）——存在性印证（docs.aliyun.com 述百炼 OpenAI 兼容）、精确规格 SECONDARY（`help.aliyun.com/zh/model-studio/text-embedding` 本环境 403）。
- AGA（内网网关）已 live-确认暴露 DashScope **chat**（P2，native AGA 协议非 OpenAI 兼容：无 `[DONE]`、`incremental_output` delta、`requestId` 在错误体）；**embeddings 是否被 relay = UNVERIFIED、默认期望 NO**（AGA 非公开产品；公开阿里网关是 Higress≠AGA；用户域订正：内部 AI 网关中转层，公网能力不继承）。
- P5 C 决策：默认 `FakeHashEmbedder`（与 AGA 无关）；外置 embedder 插件是通用 OpenAI 兼容 `/v1/embeddings`。**T2 结果只决定"有无干净内网外置 embedder 插件"**（yes → DashScope-via-AGA 省一个 sidecar；no → 须独立 Infinity/TEI/Ollama sidecar 跑 bge-m3/Qwen3）。

**Task**（AFK 需 AGA 访问 + DashScope key；否则 HITL checklist）：
1. 探 AGA base URL 的 embeddings 路由（`/v1/embeddings`？native AGA embeddings 路径？是否存在）。
2. 录请求/响应形（OpenAI 兼容 `input`/`data[].embedding` 还是 native AGA `input`/`embeddings`/`output` 信封）。
3. 接受哪些模型名（`text-embedding-v3`/`v4`？Qwen3 变体？）+ 返回维度（验 SECONDARY 表：v3=1024、v4=1024/1536/2048、qwen3.7 可配）。
4. 是否尊重 `dimensions`/`text_type`{query,document}/`instruct`。
5. 错误体形（`requestId`？同 P2 chat？）。
6. 顺带从不限网络重抓 `help.aliyun.com/zh/model-studio/text-embedding` 一手验精确规格（P5 surfaced tension）。

**Resolved answer records**：
- (a) AGA-embeddings yes/no + 协议形/模型名/维度；
- (b) DashScope text-embedding 精确规格一手核验；
- (c) intranet 重 embedder 走 AGA 还是须独立 sidecar（更新 map Not-yet-specified「intranet 重 embedder 部署形态」）。

## Finding (resolved 2026-08-20)

**live-probe 6 探针实证**（预发 AGA 网关 `https://pre-aga-ai-gateway.alibaba-inc.com`，key 经 credentials seam 文件 `~/.dsh/.credentials.yaml` 不入库/不进 env/不打印；探针 `/tmp/probe-aga-embeddings.mjs` throwaway mirror P2）：

- **(a) AGA-embeddings = NO**。`GET /api/v1/models` 200（10 chat 模型、无 `text-embedding-*`）+ chat pong 200（native generation、`request_id` 在体 `3c3669af…`、控制证 key/AGA 可达非鉴权）+ **4 端点变体全 404**（native `/api/v1/services/embeddings/text-embedding/text-embedding` v3/v4 + OpenAI 兼容 `/v1/embeddings` + compat-mode `/compatible-mode/v1/embeddings`；体空+无 request_id+~50-61ms）。404 形态=**网关级路由未找到**（P2 实证服务级错误把 request_id 放体；本 404 体空无 request_id = 网关在到达 DashScope 服务前拒）→ **AGA 选择性 relay chat generation、不含 embeddings**。
- **(b) DashScope text-embedding 规格（SECONDARY，官方 docs 本环境 403 同 P5）**：v3/v4 默认 1024 维+自定义（v3 min 32/v4 MRL 截断）、batch 10、native 信封 `{model,input:{texts},parameters}`→`{output:{embeddings:[{embedding,text_index}]},usage,request_id}`、参数 `dimensions`/`text_type{query,document}`(仅 native)/`instruct`(v4)、公网 compat-mode `/compatible-mode/v1/embeddings`（AGA 无中转）。多 SECONDARY 源交叉；live 探针 404 形态是 primary 实证。
- **(c) intranet 重 embedder = 独立推理 sidecar，非 AGA**。落 P5 `ctx.embedder` 外置档 `InfinityEmbedder`（OpenAI 兼容 `POST /v1/embeddings {model,input}`→`data[].{embedding,index}`，跑 bge-m3/Qwen3-Embedding）；serving 框架/模型（Infinity/TEI/Ollama + bge-m3/Qwen3）= 用户部署 ops、map 不裁定；`InferenceError`→BM25-only 降级；seam 契约不变、P13 引擎逻辑（首期 BM25-only）不变。**省 sidecar 指望落空**（P5 fog yes 分支证伪）。

**佐证**：P13 Q2「AGA 不提供向量模型已确认」从推断/默认期望升级为 live-probe 实证（4×404 + chat 200 控制证非鉴权）。

## Assets
- `../research/t2-aga-embeddings-probe.md`（live-probe 6 探针实证 + 404 形态释读 + 决策 + SECONDARY 规格，primary=cited）。
- `/tmp/probe-aga-embeddings.mjs`（throwaway 探针 mirror P2，只读 credentials seam、绝不打印 key；不入库）。

## Unblocks / 毕业雾
- 毕业 map Not-yet-specified「intranet 重 embedder 部署形态」→ 决策落定（独立 sidecar 非 AGA），入 map Decisions so far；残余「serving 框架/模型选型」= 用户部署 ops（非 map 架构决策），雾留薄残余条。
- P13 F3 向量侧 swap 保持既定走向（T2 确认非 AGA → 用户自部署就绪后换 P5 `ctx.retrieval` 真 embedder，seam 契约不变）。

