# P4c — 真 ODPS 执行路径（real pyodps sidecar + engine-wrapper guard chain + tool-query Consumer/query_data）

**Type**: prototype
**Phase**: 2
**Status**: Blocked by real MaxCompute 凭证 provisioning（ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT per scope——`~/.dsh/.credentials.yaml` 现无 ODPS 凭证，provisioning = Task 类 T1，待毕业）+ intranet reachability（P10 Mac 内网直连，待验 MaxCompute endpoint 可达）
**Blocked by**: real MaxCompute 凭证 provisioning（Task analog T1，待毕业）+ P4b（resolved——stand-in Provider 骨架就位）+ P9（resolved——per-scope 凭证寻址 (i)/(ii) 决策，待 thread `scopeId`）+ P10（resolved——intranet 形态）
**From**: P4b Deferred（`../phase-2/P4b-query-maxcompute-hardening.md`「query-trio 剩余生产 + 真实 sidecar deferred」）+ map Not-yet-specified「query-trio 剩余生产」雾（graduated 2026-08-21）+ G1b 可行性 finding（real-ODPS = execution-match 硬门）

**Question**: 把 P4b 的 stand-in（`packages/query/query-maxcompute/dev/standin-sidecar.mjs` canned-data fake ODPS——对 fast 模式恒返 `rows:[['game-x',1234]]`、`mode` 是测试旗标非 SQL 推出）换成**真 ODPS 执行路径**——(a) 真 Python pyodps sidecar（stdio MCP server，per-scope ODPS 连接 + `set_credentials` drop 真.binding）+ (b) engine-wrapper guard chain（CostGuard/TimeoutGuard/RetryGuard/OrphanReaper，A1-split `ctx.query.execute` 门，镜像 rbi `pipeline.py:run_query_async`+`core/guards/*`）+ (c) **tool-query Consumer**（model-facing `query_data` 工具 + 会话门 G1/G5 + 3-execute，镜像 rbi `execution.py`；C1 吃 SQL，NL→SQL 归 P13b）。使 da agent 的 EXECUTION 相真跑 SQL 到真 MaxCompute 返真 rows——**G1b execution-match 的硬门**。

## 为什么是 G1b 的硬门（graduated from G1b finding）

RBI 161 case 的 `expected.result_value`（样例 `reverse-bi/eval-cases/10000251/eval_10000251_037.yaml`：`expected.sql` 打 `ieu_cdm.dws_10000251_univ_acc_act_di`、`expected.result_value:{value:4336}`、`match_mode:scalar_exact`、`meta.anchor_ds:20260806`）是按真 MaxCompute `ieu_cdm` 项目、锚点日数据算出的。execution-match = 跑 agent 真 SQL 到真 ODPS 对照该值；stand-in 恒返 `[['game-x',1234]]`→永不匹配→主指标不可测。无廉价本地替代（expected 按真 ODPS 数据算；seed 本地 DB = 巨量数据工程 + 方言/schema 位移 + 改实验）。故 P4c 是 G1b 硬门，G1b re-block on P4c。

## Scope（graduated from P4b Deferred + map fog）

- **(a) 真实 sidecar（pyodps ODPS python 子进程 via stdio MCP server）** 接入——替 stand-in；per-scope ODPS 连接缓存（真 binding 非 fake Map）；`set_credentials` drop 真生效（G4 HOLE-C 语义对真连接）；OrphanReaper ODPS 孤儿作业清理（dispose 后在途作业，镜像 rbi `orphans.py`，A1-split engine-wrapper 门）。sidecar 仍是 da 程序化 raw-name 调、无一进 `ctx.tools`（P4b P1 接线不变）。
- **(b) engine-wrapper guard chain** = A1-split `ctx.query.execute` 门：CostGuard `estimate_cost` / TimeoutGuard `signal` / RetryGuard / OrphanReaper。P4b Provider=dumb raw executor 不含；`query` Service Definition 现极简 abstract 无 guard chain。**open design（待 grilling 钉）**：session gates（G1 近重复防重发 / G5 halt / budget / near-dup / cache）+ guard chain 落 `query` Def 的 concrete `execute` 还是独立 guard 插件（`tools/pre-execute`/`tools/execute` around-dispatch）——map fog 原问。
- **(c) tool-query Consumer** = model-facing `query_data` 工具（dsh-tools `defineTool` + `ctx.tools.register`，新包 `packages/query/query-tool/`，镜像 P13b `tool-search-data-sources` 先例）+ 会话门 + 3-execute（attach/poll pending→`QueryOutcome` 3-state）。C1 吃 SQL（NL→SQL 归 P13b 已 ship）。**preset 注册**：`apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 解注释 `tool-query-data` 行（现 "name TBD - P4b/Not-yet-specified"）+ bundle `cordis.patch.yml` query-engine 双行 uncomment（`@deepseek-ai/dsh-query`+`dsh-query-maxcompute`）。
- **P9 per-scope 凭证寻址**：thread `scopeId` 入 `ctx.credentials.resolve(ref,{scopeId})`（P4b prototype 全局 resolve 无 scope address；多 scope per-game 隔离需 per-scope addressing per P9 (i)/(ii) + P12 address 维度）。
- **真 e2e 验收**：cred 热更、崩溃恢复、cancel、in-flight reject ConnectionClosed 对真 MaxCompute（非 stand-in）。
- 生产硬化 polish（package.json 子包 + `lib/` 构建 + `tsconfig.host.json` references + 全闸 typecheck/lint/build/hygiene/constraints + README Model Experience/Limitations）。

## 关联

P4b（stand-in Provider 骨架 + G4 P1 接线，resolved）+ G4（控制信道+崩溃恢复，resolved）+ R6（cred 热更 (b)，resolved）+ P9（per-scope 凭证寻址 (i)/(ii)，resolved）+ P10（intranet，resolved）+ P12b（credentials keychain，resolved——ODPS 凭证可入 keychain seam）。reverse-bi 真 ODPS 执行路径（rbi-mcp query engine）为只读参照、重新实现不改（map 原则）。**下游**：G1b（实验执行）re-blocked on P4c；G1c（变体 preset）blocked on P4c（`query_data` 注册）。

## 前置

- **P4b**（resolved 2026-08-20，stand-in Provider + G4 P1 接线骨架，`../phase-2/P4b-query-maxcompute-hardening.md`）。
- **real MaxCompute 凭证**（Task analog T1，待毕业——provision ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT per scope 入 credentials seam；RBI 5 scope 的 `ieu_cdm` 项目 + per-game project/endpoint）。
