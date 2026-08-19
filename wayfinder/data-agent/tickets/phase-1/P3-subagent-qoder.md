# P3 — subagent-qoder 插件

**Type**: prototype
**Phase**: 1（P0）
**Status**: Unblocked（T1 resolved 2026-08-19）→ claimed 2026-08-19 → **resolved 2026-08-20**（wayfinder agent session：grill 三方案 A/B/C → A；建真包 `packages/subagent/subagent-qoder/`；21/21 单元 spec 绿 + P3 包 typecheck-clean）
**Depends on（软/切片，非硬阻塞）**: P12——per-user PAT **功能切片**需 P12 的 keychain+per-user 寻址；**MVP + 留接口**（caller-parameterized `resolve(ref,{userId})`）**不依赖 P12**，可立即开跑（userId 空→落 T1 全局 fallback）。P12 落地后同一 resolve 自动接 per-user PAT，不改 P3 核心。

**Question**: Qoder 作 harness subagent 插件——`query()` 委派 + `SDKMessage`→harness 流式适配（保 tool/reasoning）+ PAT auth + `resolveModel`/BYOK 控制模型。Phase 1, P0。

**Risks**: per `../../research/qoder-model-migration.md`（模型级不可达、内部不可控、Qoder 默认用己工具、Credits、流式类型松散、混淆 runtime 无 semver）。

**From T1（PAT auth 落地）**: PAT 已存 `~/.dsh/.credentials.yaml` 为 `QODER_PERSONAL_ACCESS_TOKEN`（seam file 层、doc 0600，**不**进 process.env）。本插件须 `ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))` 每操作解析 + 经 Qoder SDK `accessToken(value)` 显式传值；**不**用 `accessTokenFromEnv()`（那条要求 PAT 在 process.env，与 intranet-security-first 冲突）。等价 seam 写入 = `ctx.credentials.set(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'), '<pat>')`。前提：账号有 Credits（`query()` 跑 agent 消耗额度）。详见 T1 Finding。

**Scope（P3 不管理 PAT）**：P3 只**消费** PAT（`resolve` + `accessToken(value)`），**不**生成/轮换/删除 PAT。PAT 轮换是**人**（在 `qoder.com/account/integrations` 生成新 PAT）或 **P9 admin**（经 seam `ctx.credentials.set(ref, newValue)`）的动作；`credentials/updated` 事件热更新，P3 下次 `resolve()` 即生效、无需重启、无需 P3 参与。Qoder SDK 无 set/rotate-token API——鉴权面仅 `accessToken`/`accessTokenFromEnv`/`qodercliAuth`/`serviceAccount`，全是 call-side 消费，无 account-side 写。故"subagent 在页面上改 PAT"不成立。

**From G3（per-user PAT 设计，2026-08-19）**：PAT 解析从全局 `resolve(ref)`（T1 MVP，早期 fallback 用）演进为 **caller-parameterized `resolve(ref, { userId })`**——按登录用户从 keychain（P12）取其 PAT → `accessToken(value)`；无 per-user PAT 且 fallback 开 → T1 全局；fallback 关且无 → 拒。per-user 切片**依赖 P12**（keychain provider + per-user 寻址；未建前 P3 MVP 用 T1 全局）。scope 正交：PAT per-user（Qoder 鉴权）⊥ 数据 per-scope（pipeline 持有）。详见 G3 Finding。

## Design / Finding（resolved 2026-08-20）

**决策路径**：prototype 票先 grill 关键决策 → 派 3 subagent 并行调研 A/B/C 三方案优劣（引证 file:line + 研究笔记）→ fetch Qoder SDK `.d.ts` 钉死 load-bearing 类型 → 建 `packages/subagent/subagent-qoder/` 真包（P2 式：真包 + mock 单元 spec + key-gated live e2e 延后）。

**决策 1（适配边界）= A — Terminal-only 外部 one-shot provider（照搬 `subagent-claude-code` 先例）**。grill 三方案：A（terminal-only，drain `query()` 取终态 `result`、tool/reasoning 留 product-local、不建本地 child session、外部 one-shot not trace-enumerable）；B（本地可追溯 child Session，流式翻 harness 事件——零先例 + 幻影工具（Qoder 己工具≠harness 工具）+ 破 session 不变量 + 须 core seam 变更才干净，破 additive-only，MVP 不取）；C（hybrid terminal+side-log——P8 audit 根本不消费 Qoder 内部 trace（维度全在 harness 自己的 `subagent_qoder` 工具调用边界），side-log 退化为 A）。A 胜出。map 原写"SDKMessage→harness 流式适配保 tool/reasoning"**改释**为"正确提取终态 result 不被 naive text drain 丢"（tool/reasoning 对父/审计可见性**延后**——仅当 P8/forensic 后续确认要 Qoder 内部 trace 时另开票，届时走 core seam 变更的真 B，非硬塞进 P3 MVP）。

**`.d.ts` 钉死（`research/qoder-sdk-dts.md`）**：Qoder `SDKResultMessage` 是 **Claude 形**（`SDKResultSuccess={type:'result',subtype:'success',is_error,result:string,...}`、`SDKResultError={...,errors:string[]}`）——claude-code `successfulResult` 提取**逐字迁移**（A 调研 subagent 担心的"提取断裂"不存在）；cancel=`options.abortController`（同 claude-code，`abort()→Query.close()`）；auth=`options.auth`，`accessToken(token):AuthOptions` 返 `{type:'accessToken',accessToken:token}`，`DEFAULT_ACCESS_TOKEN_ENV_VAR="QODER_PERSONAL_ACCESS_TOKEN"`；`WIRE_PROTOCOL_VERSION="1.2.0"`，`ProtocolVersionMismatchError` 握手时（首条 `system/init`，cross-major）抛 → `start()` reject pre-publication（同 claude-code startup-catch）；`Options` 含 `model?:string`+`resolveModel?:ModelPolicyProvider`+`includePartialMessages?:boolean`(default false)。terminal-only 不设 `includePartialMessages` → `stream_event`（松散 `delta:unknown`）不发，天然规避 runtime-narrow。

**决策 2（resolveModel/BYOK MVP）= (b) `options.model` from config**（平台模型 id，消耗 PAT 持有者 Credits）；`resolveModel` pull 回调 + BYOK（`CustomModel{provider,api_key,model?,url?,style?}`→route Qoder 调用到 harness 自有 LLM）**留接口延后**（SDK option 已在，未来动态选模型/BYOK 时 wire 回调，无需现在写）。"用 Qoder 内置模型当主 LLM"无干净路径早已 ruled out（map Out of scope）。

**决策 3（PAT 接入）= T1 落实**：`ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))`（MVP 不传 address → P12 fallback → T1 全局）→ `accessToken(value)` → `options.auth`；**不用 `accessTokenFromEnv()`**。per-user `{userId}` = P9 登录态落地后同 resolve 自动接（不改 P3 核心）。

**传输**：Qoder 默认 `WorkerTransport`（混淆 `dist/_worker/qoder-worker-runtime.obf.mjs`、install 时 postinstall 下载、pin `qoderCliVersion 1.1.25`）——与 claude-code 的 `ProcessTransport`（host PATH `claude`）不同；subagent-qoder 用默认 WorkerTransport（SDK 自管 runtime），`Query.close()` 是全部 teardown。部署须知 postinstall 下载 + `QODERCLI_PATH`/`QODER_SKIP_DOWNLOAD` override + 混淆无 semver 兜底。注：pnpm 的 approve-builds 门**忽略了** Qoder SDK 的 postinstall（worker runtime 未下载）——mock 单元测试不需它；live e2e 前需 `pnpm approve-builds` 或 `QODERCLI_PATH` 指向已装 qodercli。

**包结构（additive-only）**：`packages/subagent/subagent-qoder/`——`package.json`（`@qoder-ai/qoder-agent-sdk@1.0.24` 作 **peerDep+devDep 非 runtime dep**——repo **不 bundle** @qoder-ai（license=`SEE LICENSE IN LICENSE` 非 permissive、obfuscated worker），绕开 `gen-third-party-notices` 的 `nonPermissiveRuntime` supply-chain 门（@qoder-ai 作 devDep 披露为 "dev tooling, not distributed"，THIRD_PARTY_NOTICES.md 重生成 exit 0）；opt-in 部署 mount subagent-qoder 时自装 @qoder-ai + 自负 supply-chain（合 "subagent-qoder opt-in"）；peer `dsh-credentials`/`dsh-llm`/`dsh-session`/`dsh-subagent`/`dsh-timeout`/`dsh-invariants`/`cordis`；**无** `dsh-subprocess`（WorkerTransport 无外部进程））。备选 (a) 保留 runtime dep + owner-authorize `isOwnerAuthorizedRuntime`（owner 拍板分发 @qoder-ai 混淆 worker 的 supply-chain 责任）未取（不分发更稳）。、`tsconfig.json`、`src/index.ts`（provider `qoder` + `Config{model?,disposeGraceMs?}` + `QODER_PERSONAL_ACCESS_TOKEN` ref + `apply`）、`src/run.ts`（`QoderRunSpec`/`textTask`/`successfulResult`/`consumeQoderQuery`/`disposeQoderQuery`/`qoderQueryOptions`/`startQoderRun`——镜像 claude-code 的 `consumeClaudeQuery`/`successfulResult` + 复用共享 `settleRunResult`/`subprocessRunHandle` from `dsh-subagent`）、`src/invariant.ts`（companion，仓库 test-invariant host 要求）、`tests/subagent-qoder.spec.ts`、`README.md`。`tsconfig.host.json` 加 reference（P2 同样把 llm-dashscope 加进去了）。

**验证**：21/21 单元 spec 绿（vitest，full-mock `@qoder-ai/qoder-agent-sdk` 的 `query`+`accessToken`；mock SDKMessage fixtures 验 success/error result/missing result/noise 过滤/protocol mismatch/cancel/pre-abort/auth-unconfigured/PAT-resolve/dispose）；P3 包 typecheck-clean（scoped `tsc --noEmit` 绿 + host `tsc -b tsconfig.host.json` 仅剩 pre-existing `credentials.spec.ts:77` exactOptional 错——P12 的 `address?` feature，committed `c4a6111c4a`，`git diff HEAD` 空**证明非 P3 引入/未碰**，out of P3 additive scope（core credentials 测试），P12-followup）。wire 既已 `.d.ts` 钉死，**无需 live 探针**即可建包+mock spec（同 P2 先把 wire 探实）。

**延后**：live Qoder e2e（key-gated `skipIf !QODER_*`，需 PAT+Credits，验证 worker runtime 下载 + `result` 运行时形状 + Credits 消耗）；`resolveModel`/BYOK 回调 wiring（未来动态选模型/BYOK-to-harness-LLM）；tool/reasoning 可追溯（core seam 变更，仅 P8/forensic 确认需要时）；per-user `{userId}` 切片（P9 登录态）。

**解锁下游**：`qoder` provider 现可经 `dsh-tool-subagent`（`provider: qoder`）挂载 → P7 四阶段 preset 的 subagent 面可挂 `subagent_qoder` 工具行（P7 自行决定挂载/默认 disable）。
