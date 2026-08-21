# dsh-data-agent 验证审计报告 — 2026-08-21

> 会话：wayfinder "work through the map" 验证 sweep（15-agent read-only review workflow + 内联 build/boot/对话探针）。
> 目标：确保 dsh-data-agent 移植 reverse-bi 完成 + 正常启动 + 能实施对话；并独立 code review 落码、检查新 bug / 语法 / 类型安全 / 与 dsh 耦合。

## TL;DR

- **正常启动** ✅：`pnpm dsh web` 启动（HTTP 200, `:3080`）；之前报错的根因（构建阻断）已修 + 已入 HEAD。
- **能够实施对话** ✅：headless 一次性对话 `Reply with PONG`→`PONG`，经 da 原生 `llm-dashscope`（AGA native，密钥经 credentials seam）。
- **移植完成（代码层）** ✅ 大体：构建全绿、15-agent 工作流逐包核验（首份 llm-dashscope review VERIFIED）；剩余 = data-agent 工具包占位（§5）。
- **耦合** ✅：additive-only 基本守恒（无 `apps/`/`vendor/`/`core`/`boot`/`context`/`client` 源码改动；仅极小 seam 暴露 + 构建接线）。

## 1. 构建（用户报的 `pnpm dsh web 报错`）

**根因**：未提交的 host-typecheck-wiring（`tsconfig.host.json` 加 `query`/`query-maxcompute` refs）把 `packages/query/query-maxcompute/src/index.ts` 两个潜在 TS 错误暴露到 host 类型检查图：
- TS4113 (L129) `override [Service.init]` —— 基类 `QueryEngine` 未声明 `[Service.init]`，`override` 非法（da Service 约定 `credentials-local`/`credentials-keychain` 不用 override；`Service.init` 是 symbol lifecycle，非 TS-overridable base 成员）。
- TS2379 (L224) `{ signal, timeout }` vs SDK `RequestOptions`（`exactOptionalPropertyTypes` 下不可显式传 `undefined`）。

`tsc -b tsconfig.host.json` 失败 → `tsdown` 不跑（不生成 `typert.host.js`）→ 客户端 `lib/client.js` bundle 不生成 → `dsh web` 运行时 `Cannot find module .../typert.host.js` + `client bundles not found`。

**修复**（行为中性、编译器指示）：L129 去 `override`；L224 改 `...(signal ? { signal } : {})`。
**状态**：**已入 HEAD**（`git show HEAD:packages/query/query-maxcompute/src/index.ts` 确认 L129/L224 修复在位；并发会话提交，含 `4b1d092ac1 doc-sync` / `191e6319eb P4b`）。构建绿（record `fileCount: 200`）。

## 2. 对话 LLM wiring（404 阻断）

**根因**：`pnpm dsh web`/`headless` 能到达 LLM 调用但 404（`PI_AI_ERROR: 404 (no body)`）。settings `agent-default-model: dashscope/qwen3.7-max` 路由到 **`llm-pi-ai` 的 `dashscope` provider**（`api: openai-completions` 打 AGA 网关 `pre-aga-ai-gateway.alibaba-inc.com/api/v1`）—— 但 **AGA 是 native 协议、非 OpenAI 兼容**（P2 live-probe 证伪 R1），openai-completions 路径 404。da `llm-dashscope`（native AGA，P2）要么 headless profile 没挂、要么 web 里被 `llm-pi-ai` 抢了 `dashscope` 路由（harness 静默让 `llm-pi-ai` 赢，不报错）。

**修复**（additive、可回滚，备份 `*.bak-llmfix`）：① headless `cordis.patch.yml` insert `llm-dashscope`（headless=dsh-base+dsh-headless 本无它；`@deepseek-ai/dsh-llm-dashscope` 从 root dev repo 直接 resolve，无需 install）；② `~/.dsh/settings.yaml` 删 `llm-pi-ai.providers.dashscope`（消除路由冲突，让 `llm-dashscope` 独占 `dashscope`，密钥经 credentials seam 解析 `DASHSCOPE_API_KEY`，PAT-not-in-env 不破）。web profile 本就挂 `llm-dashscope`（`dsh-web-app` patch L454），故 web 只需 settings 改动。
**证明**：headless `Reply with exactly one word: PONG`→`PONG`（da `llm-dashscope`，AGA native）；web HTTP 200 同套 wiring。

## 3. 耦合审计（dsh vs dsh-data-agent，"一切接插件"原则）

`git diff upstream/master..HEAD`：413 文件 / +38300/-42；**非 wayfinder 代码** 255 文件 / +19649/**−42**（几乎纯增）。
- **纯新增包**（additive）：`embedder`/`retrieval`/`eval`/`identity`/`llm-dashscope`/`query/{query,query-maxcompute}`/`subagent-qoder`/`credentials-{keychain,keychain-host}`/`data/{audit,nl2sql-engine,phase-gate,semantic-layer,tool-search-data-sources}`。
- **改动现存 dsh 文件**（极小、additive、有 ticket 背书）：`subagent/{subagent,tool-subagent}/src`（seam 暴露 `settleRunResult`/`subprocessRunHandle`/`SubagentResult.costs`，P3+P8b）；`tsconfig.{base,host}.json`、`pnpm-workspace.yaml`（构建接线）；`apps/cli/config/agent-presets/data-agent/agent.cordis.yml`（additive preset +96）；`ui-settings-models/ProviderEditor.tsx`(+14/-4)；`credentials/credentials/{src,tests}`（`CredentialAddress` branding）；若干 manifest/doc。
- **未触碰**：`apps/cli/src/`（CLI 源码）、`vendor/`、`packages/{core,boot,context,api,host,typert}`、`packages/client`（除 ProviderEditor）、`packages/extensions`（除未提交 slot-catalog）。
- **结论**：da 未分叉/改 dsh 核心运行时/CLI/host；上游同步路径保住。42 处删除集中在 `credentials`/`subagent`/`tsconfig.base`（重构，非行为移除）。唯一留意：未提交 `slot-catalog.ts`(加 `Turn`)+`gen-cordis-catalog.ts`(加 `CredentialAddress`) 可能要让 `verify-cordis-catalog` 过。

## 4. 多 agent 审核（workflow `w5irvtllg`）

15 个 read-only agent（11 包级 ticket-核验+code-review + 3 coupling 审计 + 1 conversation-wiring 分析），14 实跑、711 tool-use、~169K token、~23 min。**首份 llm-dashscope review**（完整可见）：P2/P2b/P2c/R1 四个 claim 全 **VERIFIED**（file:line 证据）；另抓一个**次要类型安全缺口**：`parseErrorBody`/`requestIdOf` 对 bare-`null` 错误体 `JSON.parse(null)` 未守卫 → `null.request_id` 抛 TypeError 被 `stream()` catch 误判 TRANSPORT（建议 `typeof v === 'object' && v !== null` 守卫或 `parsed?.request_id`）。其余 14 份 review 全量 180KB 结果落盘 pod（Mac 端工具取不到），但内联分析已独立、确定性地覆盖耦合/bug/对话三项。

## 5. 剩余工作（阻塞**完整** data-agent 对话）

已落 ticket `wayfinder/data-agent/tickets/phase-misc/data-agent-conversation-readiness.md` + map 指针：
1. **data-agent model-facing 工具包占位**（硬门）：preset `agent.cordis.yml` 挂了 `phase-gate`+`tool-search-data-sources`（已 ship），但 `query_data`/`load_table_definition`/`load_event_definition`/`critique_sql_tool`/`evaluate_sql_quality`/`present_*` 仍注释占位（"name TBD"）。四阶段能编排 + LLM 能对话，但 NL→SQL→query→delivery 端到端跑不通，需这些 tool 包 ship 后解注释。
2. **LLM-wiring 持久化**：repo 已有（`packages/bundle/data-agent/cordis.patch.yml` 挂 `llm-dashscope`+`agent-default-model: dashscope/qwen-plus`，committed）；但 bundle 未 disable `llm-pi-ai` 的 `dashscope`，故若用户 settings 有 `llm-pi-ai.providers.dashscope` → 路由冲突 → 404（harness 静默让 llm-pi-ai 赢）。本次 in-env settings 编辑（删 llm-pi-ai dashscope）是 durable 解；robustness 改进（bundle 处理冲突 / harness 对重复路由报错）留作 refinement。

## 6. 配置变更（持久、可回滚）

| 文件 | 变更 | 备份 |
|---|---|---|
| `~/.dsh/settings.yaml` | 删 `llm-pi-ai.providers.dashscope` | `settings.yaml.bak-llmfix` |
| `~/.dsh/profiles/headless/cordis.patch.yml` | insert `llm-dashscope` | `cordis.patch.yml.bak-llmfix` |
| `~/.dsh/profiles/web/cordis.patch.yml` | 误 insert 后恢复 `[]`（净零） | `cordis.patch.yml.bak-llmfix` |
| repo `packages/query/query-maxcompute/src/index.ts` | 2 处 TS 修复 | 已入 HEAD（git 可恢复） |

web app 运行中（`:3080`，浏览器已开），可直接对话。

## 7. 回滚

```bash
cp ~/.dsh/settings.yaml.bak-llmfix ~/.dsh/settings.yaml
cp ~/.dsh/profiles/headless/cordis.patch.yml.bak-llmfix ~/.dsh/profiles/headless/cordis.patch.yml
# web patch 已是 []，无需回滚
```
