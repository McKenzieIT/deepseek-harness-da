# P4c — 真 ODPS 执行路径（maxc-backed sidecar + guard chain + tool-query Consumer/query_data）

**Type**: prototype
**Phase**: 2
**Status**: Unblocked (2026-08-21 maxc de-risk) — real MaxCompute 凭证 + intranet reachability blocker **RESOLVED** via 本机 maxc（`~/.maxc/config_ieu_cdm.yaml.bak` valid creds、ieu_cdm 可达、case 037 expected SQL 重跑返 4336=expected.result_value，数据 preserved）。P4c buildable（maxc-backed sidecar 替 P4b stand-in，Provider 不变）。
**Blocked by**: ~~real MaxCompute 凭证 provisioning（Task analog T1）~~ RESOLVED 2026-08-21（maxc）+ ~~intranet reachability~~ RESOLVED 2026-08-21（maxc `select 1` + case SQL 成功）+ P4b（resolved——stand-in Provider 骨架）+ P9（resolved——per-scope 凭证寻址；RBI eval 全 5 scope 同在 ieu_cdm project，scope 在表名 `dws_<scope>_` 内非独立 project，单 config 覆盖）+ P10（resolved——intranet）

**From**: P4b Deferred（`../phase-2/P4b-query-maxcompute-hardening.md`「query-trio 剩余生产 + 真实 sidecar deferred」）+ map Not-yet-specified「query-trio 剩余生产」雾（graduated 2026-08-21）+ G1b 可行性 finding（real-ODPS = execution-match 硬门）+ **2026-08-21 maxc de-risk**（case 037 expected SQL → 4336 reproduced）

**Question**: 把 P4b stand-in（`dev/standin-sidecar.mjs` canned-data fake ODPS——恒返 `[['game-x',1234]]`）换成**真 ODPS 执行路径**——经本机 maxc（MaxCompute CLI v0.4.8，用户既有 auth）。maxc 已提供 execute（`query run`）/ attach·poll·cancel（`job`）/ cost estimate（`query cost`）/ cost-guard（`--cost-check`）/ row-cap（`--max-rows`）/ sync-async promote（`--wait`）/ per-project（`--project`/`--config`）/ JSON envelope——**几乎 1:1 映射 `ctx.query` seam**（execute/attach/cancel/getProgress/estimate_cost）。使 da agent 的 EXECUTION 相真跑 SQL 到真 MaxCompute 返真 rows——**G1b execution-match 的硬门**（de-risk 已证：case 037 SQL → 4336）。

## 实现状态（2026-08-21，P4c(a)+(c) landed）

- **(a) maxc-backed sidecar ✅ DONE**：`dev/maxc-sidecar.mjs`（替 `standin-sidecar.mjs` 的 canned fake ODPS）+ `dev/maxc-smoke.mjs`（throwaway 直 SDK 验证）。smoke 经 raw MCP Client（同 `Provider.callTool` 的 `client.request(tools/call, execute)` 路径）跑 RBI case `eval_10000251_037` expected SQL → `{state:'completed', rows:[[4336]]}`（= `expected.result_value`，真 ODPS row）+ `estimate_cost` → `{input_bytes:229207}`（真 cost）。stand-in 的 `[['game-x',1234]]` → 真 `[[4336]]`。Provider（`src/index.ts`）**不变**——仅 `args` config 指 `dev/maxc-sidecar.mjs --maxc-config <cfg>`。
- **scrubbedParentEnv 保留 PATH**（`@deepseek-ai/dsh-subprocess` doc：「the canonical base every harness child starts from. PATH…」+「bare names use the provider's scrubbed PATH」）→ Provider spawn maxc-sidecar（scrubbed env）仍经 PATH 找到 bare `maxc`；Provider→maxc-sidecar→真 ODPS 集成 sound，无需 `--maxc-bin`（留作 fallback）。
- **path-A Cordis 全栈 scenario（P4b 4 scenario 对 maxc sidecar）= 可选 follow-up**：smoke 已证 sidecar+MCP+真 ODPS，Provider 不变用同 callTool 路径；Cordis 全栈 scenario（FakeCreds push ODPS refs→maxc-sidecar no-op set_credentials）补 Provider spawn 端到端，非阻塞。
- **(b) guard chain**：pending（maxc `--cost-check`/`--max-rows`/`--wait`/`job` 提供多数 guard；engine-wrapper CostGuard/TimeoutGuard/RetryGuard/OrphanReaper deferred 到 A1-split 加固，非 G1b 硬门——execution-match 只需 (a)+(c) execution path）。
- **(c) tool-query Consumer ✅ DONE**：新包 `packages/query/query-tool/`（`@deepseek-ai/dsh-query-tool`，Mode 3，镜像 P13b `tool-search-data-sources`）—— model-facing `query_data` tool（`defineTool`+`ctx.tools.register`、`inject:['tools']` 探针 `ctx.get('query')` 故加载不需 query provider、吃 `sql`+`scope_id`→`ctx.query.execute`、3-state `QueryOutcome`：completed→rows/pending→poll `getProgress` 至 settle budget 用尽诚实返 pending/failed→surface；核心流 `executeQuery`/`projectOutcome`/`pollToSettlement` pure-export）。preset `tool-query-data` 行解注释+name `@deepseek-ai/dsh-query-tool`；bundle query 行解注释 mount **仅 provider** `@deepseek-ai/dsh-query-maxcompute`（seam `dsh-query` abstract class，mount 会实例化 broken service；provider 跨 peerDep 拉 seam，镜像 llm-dashscope 只 mount provider 不 mount seam）+ bundle `package.json` 加 dep；`tsconfig.base.json` `@deepseek-ai/dsh-*` wildcard 加 `./packages/query/*/src`（gate source-resolution bare→src）。verify：per-pkg `tsc -b`✅、`verify-cordis-config`✅(132)、vitest 12/12✅、smoke `query-tool-smoke.ts` boot Cordis ctx+FakeCreds+Provider(maxc-sidecar)+capture `query_data` def（proxy ctx 委托 `ctx.get('query')`→真 provider）→`def.execute`(case 037 SQL) 断言 4336（**经 tool 路径非直 sidecar**）✅、README/i18n hygiene gates✅（model-experience/limitations/translation-pairing 本 pair/translation-prompt）。
- **真 e2e 验收**：smoke = case 037→4336（execution-match 真测，已过）；P4b 4 scenario 对 maxc = path-A follow-up。

## maxc de-risk（2026-08-21，决断性）

- `maxc query run "select 1" --json` → success（default config project=`hdyl_data_sg_dev`，lazada SG endpoint）。
- `maxc --config ~/.maxc/config_ieu_cdm.yaml.bak session show` → project=`ieu_cdm`（config 有效）；`... query run "select 1"` → success（ieu_cdm 可达 + creds valid）。
- **case 037 execution-match 重现**：`maxc --config .../config_ieu_cdm.yaml.bak query run "SELECT COUNT(DISTINCT user_id) AS dau FROM ieu_cdm.dws_10000251_univ_acc_act_di WHERE ds='20260805' AND act=1" --json` → `dau:4336` = `expected.result_value`（锚点日 2026-08-06 数据 preserved）。→ execution-match 经 maxc **可测**、数据未 drift。
- **scope 简化**：RBI 5 scope（10000147/10000251/10000312/10000329/10000334）全在 `ieu_cdm` project（scope 在表名 `dws_<scope>_` 内，非独立 project）→ **单 config（config_ieu_cdm.yaml.bak）覆盖全 eval 集**，无 per-scope cred 复杂性（生产 per-game 隔离另论，非 eval 需）。
- maxc JSON envelope（`status`/`data.result.{rows,schema,row_count}`/`pagination`/`error.{code,message,recoverable}`）→ 直接可消费作 execution-match 比对 + infra-failure 分类（对齐 P11b `classifyExecutionFailure`）。

## Scope（maxc-revised；graduated from P4b Deferred + map fog）

- **(a) maxc-backed sidecar**（替 `dev/standin-sidecar.mjs`）：Node MCP sidecar，同 standin 的 MCP 协议（initialize/notifications/initialized/tools/call）+ 同 7 工具（execute/attach/cancel/get_progress/estimate_cost/set_credentials/invalidate_scope），但 `execute` shells to `maxc --config <cfg> query run "<sql>" --json`（parse rows/schema/row_count）、`attach`/`cancel`/`get_progress` shells to `maxc job`、`estimate_cost` shells to `maxc query cost`。**set_credentials/invalidate_scope → no-op**（maxc 自持 auth 于 config 文件、da 不推 cred——P4b per-call set_credentials 对 maxc 不适用；scope→config 映射在 sidecar spawn/路由层）。**P4b Provider（raw SDK Client + StdioClientTransport + P1 接线 + lazy re-spawn + crash-loop）不变**——仅 sidecar 二进制换 fake→maxc。
- **(b) guard chain**：maxc 内建 `--cost-check <CU>`（CostGuard abort）+ `--max-rows`（result cap）+ `--wait <s>`（sync→async promote，pending/attach 语义）+ `maxc job`（attach/poll/cancel）→ 多数 guard 由 maxc 提供；engine-wrapper 仍需 OrphanReaper（dispose 后 maxc async job 孤儿——`maxc job` kill）+ RetryGuard（maxc transient error 重试，区分 infra vs model attempt，对齐 G1 Q9 infra-flakiness 门）。**open design（待 grilling 钉）**：session gates（G1 近重复防重发 / G5 halt / budget）落 `query` Def concrete `execute` 还是独立 guard 插件——maxc 简化 guard 但未消此问。
- **(c) tool-query Consumer** = model-facing `query_data` 工具（dsh-tools `defineTool` + `ctx.tools.register`，`packages/query/query-tool/`，镜像 P13b `tool-search-data-sources`）+ 3-execute（attach/poll pending→`QueryOutcome` 3-state）+ 会话门；C1 吃 SQL（NL→SQL 归 P13b）。preset 注册：`apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 解注释 `tool-query-data` 行 + bundle `cordis.patch.yml` query-engine 双行 uncomment。
- **真 e2e 验收**：P4b 4 scenario（cred 热更/崩溃恢复/cancel/控制工具非 model-callable）对 maxc sidecar（set_credentials→no-op 调整）+ case 037→4336 作 execution-match 真测（非 stand-in canned）。

## 为什么是 G1b 硬门（de-risk 已证可解）

RBI 161 case `expected.result_value` 按 ieu_cdm 锚点日数据算出；execution-match = 跑 agent 真 SQL 到 ieu_cdm 对照。stand-in 恒返 canned → 不可测。**maxc de-risk 2026-08-21 证 maxc 可跑 case SQL 返 expected（4336）→ 硬门可解**。无廉价本地替代（seed 本地 DB = 巨量数据工程 + 方言/schema 位移）——maxc 是最简真路径。

## 关联

P4b（stand-in Provider + G4 P1 接线，resolved）+ G4（控制信道+崩溃恢复，resolved）+ P9（per-scope 凭证寻址，resolved）+ P10（intranet，resolved）。maxc（本机 CLI，用户自持 auth/config）= 真 ODPS access 点（替代 P4b 原设的 pyodps+独立 cred provisioning）。**下游**：G1b re-blocked on P4c（建）；G1c（变体 preset）blocked on P4c（query_data 注册）。⚠️ **并发**：query-maxcompute 包有并发 session 在改（untracked `tsconfig.json` 出现）——P4c build 须协调/避撞（不同时改 query-maxcompute src）。

## 前置

- **P4b**（resolved 2026-08-20，stand-in Provider + G4 P1 接线骨架，`../phase-2/P4b-query-maxcompute-hardening.md`）。
- ~~real MaxCompute 凭证 provisioning（Task analog T1）~~ → **RESOLVED 2026-08-21**（本机 maxc `~/.maxc/config_ieu_cdm.yaml.bak` valid creds + ieu_cdm reachable + case 037→4336 reproduced）。
