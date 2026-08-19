# Qoder Agent SDK 1.0.24 — .d.ts 类型事实核验

> 子任务：为 P3（subagent-qoder）钉死 Qoder SDK 关键类型，化解 Option A 调研 subagent 标记的 load-bearing 不确定性。方法：`npm pack @qoder-ai/qoder-agent-sdk@1.0.24` 解包到 /tmp（throwaway，不入 repo），逐个读 `dist/**/*.d.ts`，字面量值经 `dist/index.js`（minified）交叉验证。本文为 `qoder-model-migration.md` 的类型补遗——后者分析了 .d.ts 但未钉死 `result` 字段 / Options `abortController` / auth option key。
> 日期：2026-08-19。包 `@qoder-ai/qoder-agent-sdk@1.0.24`，tarball shasum `a9b8b39e1e63fe50ea4c7db91b77282aef7fe851`，80 文件。协议真相源 `dist/protocol/`；`dist/types/*` 多为 re-export shim。

## TL;DR — 5 项 load-bearing 不确定性全部化解，皆利好"照搬 claude-code 先例"

| 不确定性（A 调研 subagent 标记） | .d.ts 实证 | 对 P3 Option A 的影响 |
|---|---|---|
| `result` 消息是否带最终文本？形状？ | **带，Claude 形**（`subtype:'success'`/`is_error`/`result:string`） | claude-code `successfulResult` 提取**直接迁移**，无需重键 assistant |
| cancel 通道（abortController? signal?） | **`options.abortController: AbortController`**（非 signal） | 同 claude-code，`abort()→Query.close()` |
| auth option key + accessToken 返回 | **`options.auth`**，`accessToken(token):AuthOptions` 返 `{type:'accessToken',accessToken:token}` | PAT→`accessToken(value)`→`options.auth`，非 `accessTokenFromEnv` |
| ProtocolVersionMismatch 何时抛 | **握手时**（首条 `system/init`，cross-major） | startup-catch（start() reject pre-publication） |
| options.model / resolveModel | **两者皆有**（`model?:string`、`resolveModel?:ModelPolicyProvider`） | MVP 用 `options.model`，resolveModel/BYOK 留接口 |

→ **Option A 对 Qoder 端到端先例可证**（extraction/cancel/dispose/settle/protocol-mismatch 全抄 `subagent-claude-code`）；唯一真新设计是 PAT 经 credentials seam + resolveModel/BYOK（若接）。wire 既已 .d.ts 钉死，无需 live 探针即可建真包+mock 单元 spec；live e2e key-gated 待 PAT+Credits（同 P2）。

## 1. `result` 消息 — 带最终文本，Claude 形（关键）

`dist/protocol/messages.d.ts:97-136`：
- `SDKResultSuccess = { type:'result'; subtype:'success'; is_error:boolean; result:string; stop_reason:string|null; total_cost_usd:number; total_credits?:number; usage; modelUsage; permission_denials; num_turns; duration_ms; duration_api_ms; error_code?:number; terminal_reason?:string|null; fast_mode_state?; uuid; session_id }` — **`result:string` 是最终文本**。
- `SDKResultError = { type:'result'; subtype:'error_during_execution'|'error_max_turns'|'error_max_budget_usd'; is_error:boolean; errors:string[]; ... }`（无 `result` 字段，错误时取 `errors[]`）。
- `SDKResultMessage = SDKResultSuccess | SDKResultError`。

→ claude-code `successfulResult`（`subtype==='success' && !is_error && result.trim()`，`packages/subagent/subagent-claude-code/src/run.ts:92-95`）**逐字适用** Qoder；error subtype → `settleRunResult` `'error'`。A subagent 担心的"提取断裂"不存在。

## 2. SDKMessage 联合 — 27 成员，顶层 type 判别

`dist/protocol/messages.d.ts:459`。顶层 `type`：`assistant`/`user`/`result`/`system`/`stream_event`/`prompt_suggestion`/`cloud_agent_event`。terminal-only 保留 `result`（取终态），余皆噪声。`system` 子类靠 `subtype` 二级判别：`init`（握手）/`status`/`api_retry`/`model_queue_status`/`hook_started`/`hook_progress`/`hook_response`/`task_notification`/`task_started`/`task_progress`/`task_updated`/`background_tasks_changed`/`session_state_changed`/`session_title_changed`/`files_persisted`/`elicitation_complete`/`memory_generation`/`memory_consumption`/`permission_denied`/`compact_boundary`/`control_request_progress`。`if (m.type!=='result') continue`（claude-code `run.ts:117`）逐字适用。

## 3. SDKAssistantMessage + ContentBlock

`dist/protocol/messages.d.ts:17`：`SDKAssistantMessage = { type:'assistant'; message:BetaMessage; parent_tool_use_id:string|null; isApiErrorMessage?:true; request_id?:string; error?; aborted?:true; uuid; session_id }`。
`dist/protocol/common.d.ts:53`：`BetaMessage = { id?; type?:'message'; role:'assistant'; content:ContentBlock[]; model?; stop_reason?; stop_sequence?; usage?; [key:string]:unknown }`。
`common.d.ts:12`：`ContentBlock = { type:string; text?; id?; name?; input?; content?; source?; tool_use_id?; is_error?; [key:string]:unknown }` — **松散 bag**（非判别联合），`text`/`tool_use`/`thinking` 靠 `type` 字段运行时区分。terminal-only 不读 assistant（取 `result.result`），故无 runtime-narrow 成本。

## 4. Options（query options）

`dist/types/options.d.ts:63-340`。关键字段（行号在该文件）：
- `abortController?: AbortController`(:68) — cancel 通道（同 claude-code）
- `auth?: InternalAuthOptions`(:91) — 鉴权
- `model?: string` — 平台模型 id
- `resolveModel?: ModelPolicyProvider`(:286) — pull 模式回调
- `resolveModelTimeoutMs?: number`(default 500)
- `includePartialMessages?: boolean`(:216, default false)
- `cwd?`/`systemPrompt?`/`maxTurns?`/`allowedTools?`/`disallowedTools?`/`permissionMode?`/`tools?`/`mcpServers?`/`settingSources?`/`env?`/`stderr?`/`plugins?`/`skills?`/`extensions?`
- `pathToQoderCLIExecutable?`/`spawnQoderCLIProcess?`/`transport?` — 进程/worker 传输
- `controlRequestTimeoutMs?`(default 60000)/`closeGraceMs?`(default 2000)/`loadTimeoutMs?`

→ cancel=`abortController`（同 claude-code）；auth=`options.auth`；`model`+`resolveModel` 皆有。

## 5. query() + Query 控制方法

`dist/query/query.d.ts:47`：`query(params:{ prompt:string|AsyncIterable<SDKUserMessage>; options?:Options }): Query`，`Query extends AsyncGenerator<SDKMessage,void>`。
`options.d.ts:345-501` Query 方法（节选）：`interrupt()`（仅断当前 turn，返仍 queued 的 UUID）、`close()`（teardown）、`setModel(model?)`、`getAvailableModels({fetchStrategy?,uid?})`、`listByokProviders()`、`validateByokModel(input)`、`streamInput(stream)`、`[Symbol.asyncDispose]()`、`initializationResult()`、`accountInfo()`、`getUsageInfo()`、`getContextUsage()` 等。
`abortController` docstring：`abort()` → closes session + ends message iteration。index.js 实现：构造绑 `signal.addEventListener('abort', ()=>{ this.close()... })`。
→ cancel/teardown = `abortController.abort()`（自动触发 `close()`）或 `Query.close()`；`interrupt()` 非 teardown。

## 6. accessToken / accessTokenFromEnv + auth

`dist/auth.d.ts:2`：`DEFAULT_ACCESS_TOKEN_ENV_VAR:string`、`DEFAULT_SERVICE_ACCOUNT_ENV_VAR:string`、`accessToken(token:string):AuthOptions`、`accessTokenFromEnv(envVar?:string):AuthOptions`、`qodercliAuth():AuthOptions`、`serviceAccount(credentials):ServiceAccountAuthOptions`、`serviceAccountFromEnv(envVar?):ServiceAccountAuthOptions`、`jobToken(fetchJobToken):JobTokenAuthOptions`。
`dist/types/auth.d.ts:9`：`AuthOptions = { type:'accessToken'; accessToken: string | {envVar:string} } | { type:'qodercli' } | ServiceAccountAuthOptions`；`InternalAuthOptions = AuthOptions | JobTokenAuthOptions`。
字面量（index.js 交叉验证）：`DEFAULT_ACCESS_TOKEN_ENV_VAR = "QODER_PERSONAL_ACCESS_TOKEN"`；`accessToken(t)` 返 `{type:'accessToken',accessToken:t}`；`accessTokenFromEnv()` 默认读 env `QODER_PERSONAL_ACCESS_TOKEN`。`options.auth` docstring：缺 auth 则 `query()` 抛 `auth_not_configured`（spawn qodercli 前）。
→ P3 PAT：`ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN')) → accessToken(value) → options.auth`；**不用 `accessTokenFromEnv()`**（依赖宿主 env，与 intranet-security-first / PAT-not-in-process.env 冲突，T1 已定）。

## 7. WIRE_PROTOCOL_VERSION + ProtocolVersionMismatchError

`dist/protocol/version.d.ts:24`：`WIRE_PROTOCOL_VERSION:"1.2.0"`。
`dist/core/errors.d.ts:31`：`ProtocolVersionMismatchError extends Error { cliProtocolVersion:string; sdkProtocolVersion:string }`。
`dist/query/query-runner.d.ts:165`（docstring）+ index.js：`validateProtocolHandshake(initMessage)` 在 readMessages 循环收到 `type:'system' && subtype:'init'` 消息时调；**cross-major 不匹配抛 `ProtocolVersionMismatchError`**，CLI minor 更旧只记 warning；CLI 未发 `protocol_version`（老版本）只 warning 不抛（向后兼容）。
→ 错配在**握手时**（startup，agent loop 未产输出前）→ start() reject（pre-publication，provider 回滚），同 claude-code startup-catch。

## 8. resolveModel（pull 模式）

`dist/types/model-policy-provider.d.ts:24`：
- `ModelPolicyContext = { purpose:QoderModelPurpose; sessionId:string; turnIndex:number; availableModels:ModelInfo[] }`（`QoderModelPurpose` 含 `'main'|'plan'|'task'|'compact'|'title'|'suggestion'|'generate'|'hook_prompt'|'subagent'|'web_fetch'|'image_gen'|'compression'|'utility'`）。
- `ModelPolicyResult = { model: string | (CustomModel & { model:string }); parameters?:Record<string,unknown>; taskId?:string; subTask?:string }` — **平台 id 字符串 或 BYOK CustomModel**。
- `ModelPolicyProvider = (ctx:ModelPolicyContext) => ModelPolicyResult | Promise<ModelPolicyResult>` — 同步或异步皆可。
- 超时：`resolveModelTimeoutMs`（default 500）未返 → 抛 `ModelPolicyTimeoutError`（`dist/core/errors.d.ts:27`），**不静默兜底**（index.js：`Promise.race([resolve, setTimeout→reject])`）。
→ MVP 不接 resolveModel（用 `options.model`）；留接口：未来动态选模型或 BYOK 时 wire 回调。

## 9. CustomModel（BYOK）

`dist/protocol/control.d.ts:495`：`CustomModel = { provider:string; api_key:string; model?:string; url?:string; style?:string }`，`style` SDK 默认 `"openai"` 再转发。方向 = host 模型+key 灌进 Qoder（SDK 抽 `model` 作 id，余字段作 `custom_model` 上 wire，CLI 路由到第三方 provider）。BYOK 经 `resolveModel` 返 `CustomModel & {model}` 触发。配套：`Query.validateByokModel(input):Promise<boolean|null>`、`Query.listByokProviders():Promise<BYOKProviderInfo[]|null>`。

## 10. BetaRawMessageStreamEvent（松散，terminal-only 忽略）

`dist/protocol/common.d.ts:64`：`{ type:string; index?; delta?:unknown; content_block?:ContentBlock; message?:BetaMessage; usage?:BetaUsage; [key:string]:unknown }`。承载于 `SDKPartialAssistantMessage = { type:'stream_event'; event:BetaRawMessageStreamEvent; parent_tool_use_id; uuid; session_id }`（`messages.d.ts:182`）。`includePartialMessages` default false → terminal-only 不设则不发 `stream_event`，松散类型天然隔离。

## 对 P3 的结论

Option A（terminal-only，照搬 `subagent-claude-code` 先例）对 Qoder **端到端先例可证**：A 调研 subagent 标记的 5 项 load-bearing 不确定性（result 形状 / cancel 通道 / auth key / protocol mismatch 时机 / model+resolveModel）全部由 .d.ts 钉死，且皆利好"逐字迁移 claude-code"——`consumeClaudeQuery`/`successfulResult`（键 `result.result`）/`settleRunResult` never-reject/`subprocessRunHandle` 幂等 dispose/`abortController` cancel/`options.auth` 全部直接复用。唯一对 Qoder 的新设计：
1. **PAT 经 credentials seam**：`ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'), {userId?})`（MVP 无 address → T1 全局）→ `accessToken(value)` → `options.auth`（非 `accessTokenFromEnv`，T1）。
2. **resolveModel/BYOK**：MVP 用 `options.model`（config 平台模型 id，消耗 Credits）；`resolveModel` pull 回调 + BYOK（`CustomModel`→harness LLM）留接口，未来动态/BYOK 时 wire。
3. **传输层**：Qoder 默认 `WorkerTransport`（混淆 `dist/_worker/qoder-worker-runtime.obf.mjs`，install 时 postinstall 下载，pin `qoderCliVersion 1.1.25`）——与 claude-code 的 `ProcessTransport`（host PATH 上 `claude` 可执行）不同；subagent-qoder 用默认 WorkerTransport（SDK 自管 runtime），部署须文档化 postinstall 下载 + `QODERCLI_PATH`/`QODER_SKIP_DOWNLOAD` override + 混淆无 semver 兜底风险。

wire 既已 .d.ts 钉死，**无需 live 探针即可建真包 + mock 单元 spec**（simulated SDKMessage fixtures：success result / error result / protocol mismatch / cancel / missing result / noise）。live e2e key-gated 待 PAT+Credits（同 P2 的 `skipIf !QODER_*` 模式）。

## 来源

- primary：`@qoder-ai/qoder-agent-sdk@1.0.24` tarball 解包 .d.ts（shasum `a9b8b39e1e63fe50ea4c7db91b77282aef7fe851`，80 文件），fetch 到 /tmp（throwaway，不入 repo）。关键文件：`dist/protocol/messages.d.ts`、`dist/protocol/common.d.ts`、`dist/protocol/control.d.ts`、`dist/protocol/version.d.ts`、`dist/types/options.d.ts`、`dist/types/auth.d.ts`、`dist/types/model-policy-provider.d.ts`、`dist/auth.d.ts`、`dist/core/errors.d.ts`、`dist/query/query.d.ts`、`dist/query/query-runner.d.ts`；字面量值经 `dist/index.js`（minified）交叉验证。
- 增补：`wayfinder/data-agent/research/qoder-sdk-ts.md`（SDK 形态总览）、`qoder-model-migration.md`（.d.ts 初分析，本文补遗其未钉死的 result/Options/auth 细节）。
- 先例：`packages/subagent/subagent-claude-code/src/run.ts`（`consumeClaudeQuery`/`successfulResult`/`settleRunResult`）、`src/index.ts`、`src/out-of-process.ts`（`subprocessRunHandle`/`NO_START_CAPABILITIES`）；`packages/subagent/subagent/src/types.ts`（SubagentProvider/Run/Result 契约）；`docs/subsystems/subagent.md`（外部 one-shot "not trace-enumerable"、provider 契约）。
