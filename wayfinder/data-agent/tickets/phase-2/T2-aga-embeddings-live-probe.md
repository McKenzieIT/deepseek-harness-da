# T2 — AGA-embeddings live-probe

**Type**: task
**Phase**: 2
**Status**: Unblocked
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
