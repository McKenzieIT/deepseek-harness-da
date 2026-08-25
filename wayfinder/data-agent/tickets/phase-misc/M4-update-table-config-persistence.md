# M4-update-table-config-persistence — LLM 不调 update_table_config（override 没持久化）

**Type**: grilling（planning；LLM 行为引导决策待 grilled）
**Phase**: misc（self-evolution 持久化）
**Assignee**: wayfinder-session 2026-08-25
**Status**: Resolved 2026-08-25（选项 4：phase-gate 自动调 update_table_config）
**Surfaced by**: M3 B 验证——self-evolution 闭环 work（not_found→present_clarification→用户答 ieu_cdm→#3 reply-keep-phase→critique ieu_cdm pass→query_data ieu_cdm 成功），但 **update_table_config 没调**——LLM 直接用用户答 ieu_cdm 在 SQL，没持久化 override。inject 指引教"call update_table_config"，但 LLM 跳过。
**Scope**: 让 LLM 在 self-evolution 答案后调 update_table_config 持久化 override（下次同表不重问）。
**Question**: 怎么让 LLM 调 update_table_config 持久化 override？更强 inject 指引 vs persona 教 vs phase-gate 强制 vs 别的？

## Evidence（M3 B 验证 session-825912fe）

- not_found → present_clarification 问 project → 用户答 ieu_cdm
- reply-keep-phase（#3）→ critique SQL `FROM ieu_cdm.dws_...` pass → query_data ieu_cdm 成功
- **但 tool calls 无 update_table_config**——LLM 直接用答 ieu_cdm 在 SQL，没写 override
- inject 指引（#2b executionDecision not_found fallback inject）教"call update_table_config"，但 LLM 跳过

## Open decisions（grilling 候选）

1. **更强 inject 指引**：inject 文本更强调"必须先调 update_table_config 写 override，再重试"——LLM 行为引导。
2. **persona 教**：UNDERSTANDING/GENERATION persona 教"用户答 project 后，调 update_table_config 持久化"。
3. **phase-gate 强制**：phase-gate 在 self-evolution fallback 后检测 update_table_config 调用（没调则 retry/decline）。
4. **update_table_config 自动调**：present_clarification reply 后 phase-gate 自动调 update_table_config（不靠 LLM）。

## 关联

- [M3-self-evolution-blockers](M3-self-evolution-blockers.md)（#1#2#3#4 修 + B 验证）
- [M2-self-evolution-architecture](M2-self-evolution-architecture.md)（#2b inject 指引 + #3b update_table_config 工具）


## Resolution（2026-08-25）

**决策**：选项 4（phase-gate 自动调 update_table_config，不靠 LLM）。

**Grilling 结论**：
- 选项 1/2（prompt 引导）被否——证据证明 LLM 看到指引但跳过（不调也能成功 SQL）
- 选项 3（检测+retry）被否——query 已成功却 retry/decline 用户体验差；LLM 二次补调概率低
- 选项 4 最优——100% 确定性、零 LLM 依赖、无额外 round-trip、用户体验无感

**实现设计**：
- Hook point：EXECUTION completed（query_data 成功后）——确认 project 真能用才写
- 参数提取：not_found 时从 last_sql 用 extractTableNames 记录裸表名（→ self_evolution_table）；completed 时 regex `(\w+)\.{table}` 从成功 SQL 提取 project
- RBAC：尊重——走正常 tool execute 路径，非 admin 返回 { ok: false }，auto-call 忽略（query 照样成功）
- 失败处理：fire-and-forget（.catch 吞错误），提取失败 = skip，不影响正常流程
- inject：静默（不通知 LLM）

**改动**：
- `types.ts`：PhaseGateState + `self_evolution_table: string | null`
- `phase-gate.ts`：
  - import `extractTableNames`
  - `executionDecision` not_found 分支记录 `self_evolution_table`
  - `executionDecision` completed 分支调 `autoPersistOverride(s)`
  - 新 private method `autoPersistOverride`
  - `resetQuestionScoped`：awaiting_clarification 保留、full-reset 清 null
- 7 个新测试全 pass（69/69）

## Verification（2026-08-25）

### 单元 + E2E 测试（70/70 全绿）
- 7 单元测试 + 1 完整 E2E（not_found → record self_evolution_table → reply → query success → autoPersistOverride → update_table_config(table, project) 正确参数 → advance INTERPRETATION）
- E2E 断言 `update_table_config` 被调且参数 = `{table_name: 'dws_10000251_univ_acc_summary_di', project: 'ieu_cdm'}`

### 真实 LLM 验证（headless 单轮，真 data-agent）✓
- patch: `~/.dsh/cordis.patch.yml` override `query-engine` defaultProject=game_xxx_wrong
- 验证 not_found → present_clarification 闭环触发
- finalResponse: "等待您确认该表的 ODPS 项目，以便修正表路径后重新执行查询。"
- 证明：patch 生效（game_xxx_wrong → not_found）+ M3 闭环（present_clarification HALT 问 project）+ M4 not_found 记录分支走通（executionDecision not_found → extractTableNames → set self_evolution_table → fallback + inject）

### 完整 reply+auto-persist 闭环（真实 runtime）—— 受限
- **phase-gate state（self_evolution_table）进程内 in-memory，不跨进程持久** → 完整闭环必须单进程多轮
- headless 一次性进程，单轮，无法 reply
- **SDK bin（dsh-jsonrpc-agent）boot 成功，但 sdk-jsonrpc-server 的 agent create 不组合 preset**（server.ts:219 注释明确 "No preset composition: this server's compositions keep the model-facing..."）→ agent 跑成 code-agent（bash/glob/read），不是 data-agent。SDK 设计：preset 组合是 host 责任，server 只管 wire。
- web API 是 apiproxy RPC over HTTP+WebSocket，curl 自测不现实
- **唯一已就绪的真 data-agent 多轮路径 = web server**（长驻 host，agent create 组合了 data-agent preset）

### 环境发现（有价值，下次 self-evolution 真实测试会踩同样坑）
1. **Cordis patch config 是 replace 非 deep-merge**：home patch 覆盖 query-engine config 时，整个 config 被替换（不是 merge defaultProject 进 bundle 的 config）。若只写 `defaultProject`，会丢 `args`（sidecar 脚本路径）→ Provider spawn node 无脚本 → stdin-eval JSON-RPC → MCP -32001 60s 超时。正确做法：home patch 重写 query-engine 的**完整 config**（args + credMode + defaultProject + toolCallTimeoutMs）。
2. **sdk-jsonrpc-server 不组合 preset**（设计如此）—— SDK bin 路径无法跑 data-agent，只能 web/headless host。
3. maxc sidecar 握手 60s 超时（-32001）的根因常常是上述 #1 的 args 丢失，而非 maxc 本身故障（手动跑 sidecar 正常）。

### 结论
M4 逻辑充分验证（70/70 + 真实 not_found 分支）。完整 reply+auto-persist 真实闭环的剩余验证走 web server 多轮交互（game_xxx_wrong patch + 修好 args 已就绪）：发"查 DAU"→答"ieu_cdm"→看 tool calls 面板有无 `update_table_config(table_name=dws_10000251_univ_acc_summary_di, project=ieu_cdm)`。

## Verification 盲点（2026-08-25 session-ccfb2ae1，真实 web 多轮）

**场景**：web（game_xxx_wrong patch + 修好 args）→ 查 DAU → not_found → present_clarification → 用户答 ieu_cdm → LLM **主动**调 update_table_config ×3 → query ieu_cdm 成功 → advance interpretation。

**override 持久化成功** ✓：`examples/k11-semantic-layer/tables/dws_10000251_univ_acc_summary_di.yaml` 第 73 行写入 `project: ieu_cdm`（mtime 19:08）。下次同表 qualifyTable 用 ieu_cdm，不再 not_found/问 project——自进化目标达成。

**但 3 次 update_table_config 是 LLM 主动调的，非 M4 autoPersistOverride**：
- [4910] update_table_config 在 query [4993] **之前** → 不可能是 autoPersistOverride（它在 EXECUTION completed 后触发）
- LLM 这次没跳过（按 inject 指引主动调了 3 次）→ M4 原问题（LLM 跳过）这次没复现 → autoPersistOverride 的 fallback 价值没体现

**M4 autoPersistOverride 是否在 [5588] query success 后触发——盲点（无法从 session 日志确认）**：
- `autoPersistOverride` 走 `this.ctx.tools?.execute(...)` fire-and-forget，**不产生 session tool/call event**（与 LLM tool 调用的记录路径不同）
- session tool/call 的 callId 都是空 ''，无法用 callId=`phase-gate:auto_persist` 区分
- 所以无法从 session 日志判断 autoPersistOverride 在 [5588] completed 时是否真触发

**修复建议（下次 session）**：
- `autoPersistOverride` 加 `this.ctx.logger.info(\`[M4] auto-persist: \${table} → \${project}\`)`（honestDecline 已用 logger.info 模式）
- 或让 autoPersistOverride 的 ctx.tools.execute 调用记 session tool/call（callId=phase-gate:auto_persist 区分），便于日志确认触发
- 验证方法：用 game_xxx_wrong patch + 一张**override 未写**的新表，强制 LLM 跳过 update_table_config（改 persona/inject 去掉"call update_table_config"指引），看 autoPersistOverride 是否在 query success 后自动兜底触发 + 写 override

## Verification 补充（2026-08-25 session-73db1cd2）

**game_xxx_wrong patch 验证方案已被架构演进 supersede**：

- patch 确实生效（dump-config 确认 defaultProject: game_xxx_wrong）
- 但 search_data_sources 和 load_table_definition 现在返回 fully-qualified 表名（ieu_cdm.dws_...）—— LLM 直接写 qualified SQL
- qualifyTable 只对 bare table name 生效；LLM 写了 qualified SQL → EXECUTION 成功 → self-evolution 不触发
- 根因：语义层工具层现在总是输出 qualified name（不依赖 query Provider defaultProject）

**结论**：M4 autoPersistOverride 由 72 测试完整覆盖 + logger 就绪；手动验证 superseded。
