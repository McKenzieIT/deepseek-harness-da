# G2 — eval 迁 TS vs 保留 Python

**Type**: grilling
**Phase**: 4
**Status**: Resolved (2026-08-20)
**Assignee**: wayfinder session (2026-08-20)
**Blocks**: [P11 eval harness](P11-eval-harness.md)（G2 定 TS + 判分层 + 设计指针 → P11 unblocked）

**Question**: `packages/eval/`（TS）vs 保留 Python rbi-eval？影响 python/ 去留。

**Note**: R3 偏 Python（JSON-RPC SDK `Session.run()`）→ 此 grilling 有 R3 的 research 支撑；但 R3 的 TS 画像不完整（见下 Resolution 更正）。

## Resolution（resolved 2026-08-20，wayfinder "work through the map" grilling session）

**eval = TS `packages/eval/`**，重实现 rbi-eval 的编排*设计*（非其 Python 代码），包 TS SDK client `DeepSeekHarness.run()`（`@deepseek-ai/dsh-sdk-client`）作 `AgentResponder`；**判分 (ii) DELIVERY（最终答案比对）+ EXECUTION（取数结果集比对经 ODPS），不用 sqlglot、不做 SQL-form 语义匹配**；**python/ 包不修订 Q10**（= 可选客户端孪生，非 pandas 驱动）。独立对抗审查（[`../../research/g2-eval-ts-review.md`](../../research/g2-eval-ts-review.md)）9 claim 无一驳至迫使改动，决议经得住。

**对 R3 的更正（推翻其 Python 偏好，有据）**：R3 把 Python SDK 当唯一能拿 tool 轨迹的路径、TS 侧只提 ACP（剥 tool/reasoning）——这不全。`packages/sdk/client`（`dsh-sdk-client`）是 Python SDK 的**设计孪生**，`packages/sdk/README.md` 明写 *"The TypeScript SDK decision owns the client contract"*（TS 才是规范客户端、Python 是镜像）；`DeepSeekHarness.run()` 返回 `RunResult { finalResponse, events, notifications }`，`events` 含整条 root-session 事件流——`tool/call`+`tool/result` 轨迹 TS 侧同样拿得到（审查 A VERIFIED：`packages/sdk/client/src/api.ts` collect 不过滤 type）。故 agentic + DELIVERY 判分 TS 完全可行；R3 的 Python 偏好是"路径阻力"非"能力缺口"。

**grilling 三支决策**：
- **Q1 判分层 = (ii) DELIVERY + EXECUTION，不进 sqlglot**：da 四阶段（UNDERSTANDING→GENERATION→EXECUTION→DELIVERY，P7）可判分产出分三层——答案（DELIVERY，文本/表比对）、取数结果（EXECUTION，跑两条 SQL 比结果集）、SQL-form（GENERATION，sqlglot 语义匹配）。判 DELIVERY+EXECUTION 两层即够（"取数对但交付错"是分离失败模式，值得单列）；SQL-form 对 data agent 过度严格（`SELECT a,b` vs `SELECT b,a` 数据相同都该过）且 sqlglot 无 MaxCompute 方言（P6/P13）；GENERATION 若判只做数据等价=与 EXECUTION 重复。→ 判分语言无关、TS 干净。
- **Q2 语言+姿态 = (A) TS `packages/eval/` 重实现 rbi-eval 编排设计**：da 其余全 TS（llm-dashscope/query/retrieval/semantic-layer zod/phase-gate/audit/credentials）→ 单工具链；TS 是规范客户端契约走前门；reverse-bi 只读源"重新实现不改"→ 重实现编排为 da 自己的 TS、解耦 reverse-bi Python 包结构；判分 (ii) 本就 da-fresh（不移植 rbi sqlglot L1）→ 即便选 Python 也得 da-fresh 写判分，Python 复用省的只剩编排壳、而壳恰是 TS 重实现最廉价。Python 保留（复用 rbi-eval 成熟编排、作非发布测试基建对 reverse-bi 只读依赖）作对方选项，不取。
- **Q3 python/ 去留 = 不修订 Q10**：见下"python/ 包 ≠ Python 语言 runtime"。

**python/ 包 ≠ Python 语言 runtime（审查 I 关键澄清）**：
- **python/ 包**（= harness Python JSON-RPC 客户端 SDK，`packages/sdk/client` 的 Python 孪生）：可选、additive、保上游升级路径；eval=TS → da 不消费它。去留**不由 pandas 驱动**。G2 不修订 Q10（仍"前期保留 additive"）。
- **Python 语言 runtime（pandas/numpy/ML）**：用户产品意图"后续功能依赖"指此。Q9 *"code-runtime 跑 pandas 变换"*——而 code-runtime 当前**只有 TS worker-thread backend**（`packages/code-runtime/code-runtime/README.md` *"only 'typescript' has a published backend"*；`'python'` well-known 但未发布）→ Q9 的 pandas 暗示一个**未发布的 Python code-runtime backend**，是 Q9 的小 gap（surface 为指针，不阻塞 G2），属 Q9 域、与 python/ 包两回事。

**审查 9 claim**（[`../../research/g2-eval-ts-review.md`](../../research/g2-eval-ts-review.md)）：A（TS 暴露全 tool 轨迹）/B（R3 漏看 TS SDK）/G（llm-replay 语言无关）VERIFIED；C（(ii) 语言无关但 DELIVERY 策略未定）/D（rbi 判分 L1=7 断言(3 sqlglot)+L2=4 维 LLM-judge+L3=5 步；da (ii) 是 L1 严格子集、不漏必要非 sqlglot 能力）/E（最小编排~600-800 行 TS、完整~1500+、vs Python 复用~3000 行省~50%）/F（rbi EvalCase BI 专属、仅 result_value+match_mode+turns 可复用）/H（finalResponse 非因果归属+无 mid-turn cancel，TS/Python 逐行对称）PARTIAL（被低估成本/待补设计点）；I（python/ 永久依赖 pandas/numpy）REFUTED 反向强化 Q10=(i)。对称 HOLE（H1 finalResponse 错配 / H2 无 mid-turn cancel）不改变 TS-vs-Python——两边同 wire，选 TS 不引入新 HOLE。

## Design（P11 接线指针，P11 实现期落实）

`packages/eval/`（TS，additive，镜像其余 da 包），重实现 rbi-eval 编排设计（R3 [`../../research/r3-multiturn-eval-hook.md`](../../research/r3-multiturn-eval-hook.md) 带 path:line 详记）：

- **AgentResponder**：`respond(req) = { reply: harness.run(req.message).finalResponse, events: run().events }`，包 TS `DeepSeekHarness`（`@deepseek-ai/dsh-sdk-client`，spawn runtime 子进程，`await using`/`close()` reap）。
- **编排重实现**：`MultiTurnSession` 状态机（scripted turns + terminal question，`next_input`/`submit_response`）、`_turn_matches_expectation`（token/bigram 重叠 ≥0.35 防 derail）、`drive_session` 循环、`run_multi_turn_case(pass_k)`、`pass_k_verdict`（取首失败 attempt 防 flakiness）。~600-800 行最小、~1500+ 完整。
- **pass_k**：k 独立 `DeepSeekHarness`/session（`session_id = f"{run_id}:{case_id}:{k}"`），`passed = all(attempts pass)`。
- **多轮**：同 `harness.session(id)` 句柄多次 `run()`（session 日志持久、历史累积；注意 `finalResponse` 是 interval 内最后 assistant 文本非因果归属该 prompt——脚本化单 prompt 模式不触发，H1）。
- **确定性**：`@deepseek-ai/dsh-llm-replay` 经被 spawn 的 runtime `cordis.yml` 加载（语言无关，审查 G），录制 JSONL 回放 LLM 流、无 key 可复现。
- **判分 (ii)**：EXECUTION = 5 match_mode 直译（纯 dict/行比较，审查 C/D），跑 da 自己的 ODPS（`ctx.query.execute`）拿实际结果集比对；DELIVERY 分层——数值走 EXECUTION 的 scalar_exact，文本走 token/bigram fuzzy ≥0.35（仿 rbi `_turn_matches_expectation`），复杂语义走 LLM-judge（仿 rbi `scoring/judge.py` 注入式 LLMProvider，可经 `llm-dashscope`）。
- **EvalCase = da-fresh schema，不套 P6 zod-mirror**（审查 F1 纠正：P6 镜像 SDK 协议通用，EvalCase BI 专属——`behavior`/`dimensions`/`scope_id`/`sql_steps`/`anchor_ds` 不可复用；仅借 `result_value`+`match_mode`+`turns`）。
- **超时**：无 mid-turn cancel（与 Python 同 wire 对称，H2）→ `Promise.race` 包装 wall-clock 超时；失控 turn 放弃 = 关 runtime 重启。
- **已知 trade-off（非 bug）**：丢 rbi L1 的 SQL 卫生断言 `field_coverage`/`limit_reasonable`/`partition_compliant`（sqlglot-bound），记入决议避免日后当 bug。

**解锁**：P11 eval harness 迁移（unblocked，design 按上述 TS 指针）。**影响 Q10**：不修订（python/ 包 = 可选客户端孪生，eval=TS 使 da 不消费它，既非 keep-也非裁-理由；pandas/numpy/ML 永久性属 Python 语言 runtime=Q9 域）。
