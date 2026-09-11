# R10b — Benchmark adapter parity、interface censoring 与 run isolation 一手认读

日期：2026-09-10  ·  票：[R10b — Benchmark adapter parity、interface censoring 与 run isolation 认读](../tickets/R10b-harness-measurement-validity.md)  ·  分支：`research/R10b-harness-measurement-validity`

本文回答 R10b 的六个“必须回答”问题，并给 [G10 — Data-domain Evaluation Core](../tickets/G10-harness-bhe-split.md) 及其 downstream implementation tickets 提供验收约束。全文把论文与官方实现直接支持的内容放在“来源事实”，把 DSH 应如何设计放在“本仓设计推论”；外部来源没有规定的 npm 包名、字段拼写、Cordis 插件边界和迁移顺序不冒充论文结论。

## 核验方法与版本

论文身份由 2026-09-10 下载的 arXiv Atom 元数据、PDF 首页和正文交叉核验；正文以对应 PDF 的固定版本认读。论文声明了官方 artifact 时，再检查固定 commit 的官方仓库。Harbor v2 的 Atom 作者元数据存在解析异常：`Yujun (Audrey) Mao` 被拆成两个 author entry，并漏掉 PDF v2 首页作者块中的若干作者，因此下表对 Harbor 只列首作并以 PDF 作者块为准，不复制失真的 Atom 全名单。

| 来源 | 已核验元数据 | 版本与日期 | 本次检查的官方 artifact |
| --- | --- | --- | --- |
| Harbor Adapters / Harbor-Index | *Harbor Adapters and Harbor-Index: Infrastructure and a Curated Meta-Dataset for Large-Scale Agentic Evaluation*；首作 Lin Shi | [arXiv:2609.04298v2](https://arxiv.org/abs/2609.04298v2)；首发 2026-09-03，v2 更新 2026-09-09 | [Harbor `191d1b9`](https://github.com/harbor-framework/harbor/tree/191d1b989bbba1d77c2db23e17aec308d7c08046)；[Harbor-Index `5399ea1`](https://github.com/harbor-framework/harbor-index/tree/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3) |
| Interface-Induced Trajectory Censoring | *Interface-Induced Trajectory Censoring*；Wenbo Wang | [arXiv:2609.03966v1](https://arxiv.org/abs/2609.03966v1)；2026-09-03 | [官方复现仓库 `9cfaaad`](https://github.com/nebula-1999/Interface-Induced-Trajectory-Censoring/tree/9cfaaad17d702c70e1430f9e1413803507d8f2f6) |
| Outcome Finality | *When Is an Agent Evaluation Over? Outcome Finality and Cross-Unit Separation*；Avyay M. Casheekar、Hariganesh Tangirala | [arXiv:2608.14940v3](https://arxiv.org/abs/2608.14940v3)；首发 2026-08-14，v3 更新 2026-08-27 | 论文未给配套代码仓库；以 v3 的定义、Table 1–3、Appendix B–C 为准 |
| HarnessDev | *HarnessDev: Can LLMs Create and Evolve Their Own Agent Harness?*；Yuhao Wu、Jingyuan Zhang、Jiajun Shi、Xinping Lei、Qingshui Gu、Yuxuan Zhang、Zexuan Wang、Chen He、Chen Huang、Maojia Song、Zhiyuan Zeng、Shaowen Wang、Jinkai Liu、Yunfeng Shi、Jiaheng Liu、Shen Yan、Wenhao Huang、Ge Zhang、Wenxuan Zhang | [arXiv:2609.01437v1](https://arxiv.org/abs/2609.01437v1)；2026-09-01，PDF 内署 2026-09-02 | [作者项目页](https://self-developing-agents.github.io/) 发布图表和结果叙述，但未发现 HarnessDev 代码仓库链接 |
| DAREBench | *DAREBench: Deployment-Aware and Reliable Evaluation of Models as Agents*；Yu Liu、Zhilin Liu、Zhiwei Yang、Shaojie Zhang、Zheyuan Deng、Tingwei Huang、Zhenbo Luo、Lei Jiang、Yanbing Liu、Pei Fu | [arXiv:2609.06059v1](https://arxiv.org/abs/2609.06059v1)；2026-09-05 | 论文给出 `SeerRay-Lab/DAREBench`，但该 GitHub 仓库在 2026-09-10 无可读取 refs |
| Evaluation Context Protocol | *The Evaluation Context Protocol (ECP): A Portable Contract for AI Agent Evaluation*；Aniket Wattamwar、Manav Anandani、Mrunal Kakirwar | [arXiv:2608.19263v1](https://arxiv.org/abs/2608.19263v1)；2026-08-18 | [官方仓库 `5ed8638`](https://github.com/evaluation-context-protocol/ecp/tree/5ed863811e79fa708481d3213fd733391033d593)；规范仍标 Experimental |

## 一手来源事实

### Harbor：adapter parity 是测量语义等价，不是加载 smoke test

Harbor 把 task 标准化为 instruction、environment、tests、solution；adapter 的工作不止是改字段，而是迁移来源 benchmark 的 task content、运行环境和评分逻辑。其 construction workflow 要求先重构任务、重建或对齐 environment、接入 verifier 与 tests、让 oracle solution 达到预期通过率，再进行与原实现对照的 parity experiment。[论文 §2、Figure 1、Appendix D.3](https://arxiv.org/pdf/2609.04298v2#page=3)

Parity 实验固定 agent、model、tool set、prompt template、decoding parameters 与 execution configuration；默认两侧各运行三个 trials，报告 mean ± sample SEM。全量过贵时可以采用按难度或子域随机分层、官方小 split，或有理由的 curated subset，但必须记录 selection criterion、样本规模和具体 task IDs。无法完全一致时，adapter 不能用“已能运行”代替 parity，而应逐 benchmark 披露 external-service nondeterminism、upstream oracle defect、custom agent 不可移植或 grader/environment 修复等差异。[论文 Appendix D.4.1–D.4.4](https://arxiv.org/pdf/2609.04298v2#page=34)

官方 Harbor artifact 把这套要求落到可审计文件：例如 `adapters/abc-bench/adapter_metadata.json` 与 [`adapters/abc-bench/parity_experiment.json`](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/adapters/abc-bench/parity_experiment.json) 记录原侧和 Harbor 侧的配置、逐轮分数、均值、task-level agreement、Cohen’s kappa、agent/model 版本、任务规模、PR 和数据链接。该实例还解释两侧环境差异，说明 aggregate mean 接近只是最低证据，不是 parity 的全部定义。

Harbor-Index 把 verifier 与 agent environment 分开。固定 commit 的 [`ADAPTATIONS.md`](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/ADAPTATIONS.md) 明示当前 80 个任务都使用 `environment_mode = "separate"`，tests、gold answers 和 judge dependencies 位于隔离 verifier environment，agent 仅通过声明的 artifacts 交付结果；同文件还记录 oracle 缺失、失效和修复历史。发布工作流 [`.github/workflows/github-release.yml`](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/.github/workflows/github-release.yml) 由 `harbor-index-<version>` tag 生成 release，附 oracle attestation、dataset manifest 和 image digest set。这里的关键事实是 benchmark release 与 grader material 有自己的版本和完整性证据，不能由 Harness 的代码版本代替。

### Interface-Induced Trajectory Censoring：接口故障必须先于能力评分辨认

论文把 agent tool trajectory 分为 intent、emitted format、server parse、actual execution、multi-turn rescue 五层。固定 weights、cases、decoding、seeds、executor 与 scorer，只替换 serving adapter 配置，同一模型在 BFCL v4 的 `simple_python / multi_turn_base` 从 `0.00` 变为 `0.96 / 0.19`；在 τ-bench retail 上，server-parsed calls 从 0 变为 636，至少执行一次工具的任务从 0 变为 103。HTTP 200 与空 `tool_calls` 因而不能证明模型没有调用意图或没有发出可接受调用。[论文 Abstract、Figure 1、§4.1–§4.2、Table 1、Table 11](https://arxiv.org/pdf/2609.03966v1#page=1)

BFCL 的 2×2 template/parser 实验是关键机制证据：documented template 配 hermes parser、documented template 配 dedicated parser、dedicated template 配 hermes parser 都是 0/200，只有 dedicated template 与 dedicated parser 的组合达到 196/200。两件组件各自在其约定 envelope 内可工作，单独修一侧却没有收益，因此可观察结果属于 model × serialization × template × parser × execution stack，而不是 model 的单变量属性。论文进一步展示 schema-layer wrong-tool 与 token-layer failure，并在 §6 要求固定 serving-stack version、model revision、parser 和 template hashes。[论文 §4.1、Table 1、§4.3–§4.6、§6](https://arxiv.org/pdf/2609.03966v1#page=7)

官方 [`preflight_toolcall.py`](https://github.com/nebula-1999/Interface-Induced-Trajectory-Censoring/blob/9cfaaad17d702c70e1430f9e1413803507d8f2f6/preflight_toolcall.py) 用同一 canonical request 依次测试 `tool_choice:auto` 与 `required` positive control，校验非空 tool call、声明内函数名以及可解析的 arguments。脚本退出码 0 表示 auto 路径可用；1 表示 required 通过但 auto 没有合规调用，需要检查 raw output 并离线重解析；2 表示连 required 路径也失败，正式 evaluation 不应启动。该 98 行脚本验证的是 interface stack 的最低可用性，而非 benchmark task 本身的正确率。

作者保存 raw output 并独立重解析，把 request-error arms 排除出 pass-rate 比较，只保留 error-rate census。论文也明确承认部分 RL training arms 未保存完整 raw rollout，所以无法区分“模型从未尝试”与“尝试被 parser censor”；Appendix A 还保留错误 provenance 与被 supersede 的轨迹文件，而不是覆盖历史。这直接说明 raw emission、parser verdict、execution 和 score 不能压成一个最终布尔值。[论文 §3.1、§3.3、Appendix A、§6](https://arxiv.org/pdf/2609.03966v1#page=5)

### Outcome Finality：停止、定案和独立样本是三个判断

论文定义 outcome finality：在预先声明的 outcome、observation period 和 system boundary 内，现有证据已经固定标签，任何相关后续事件都不能改变该标签；否则结果必须是 unresolved。它另定义 cross-unit separation：前一 run 不得改变后一 run 的相关初始条件或 outcome。等待 delayed write 达到 terminal 可以建立 finality，却可能把写入留给下一 run；namespacing 可以隔离下一 run，却不自动令当前 outcome 定案；reset 只有在 pending effect 不会重写且恢复结果被系统观察验证时才构成证据。[论文 §2、Table 1](https://arxiv.org/pdf/2608.14940v3#page=3)

固定 schedule 的 replay 给出构造性反例：非零延迟写入在 endpoint snapshot 下为 0/150 success，等待 reconciliation 后为 150/150；shared state 使 run A 影响 run B 150/200 次，而 namespacing、verified reset 与 no-write control 都是 0/200。作者明确说这些数字证明机制可发生，不估计真实 benchmark 的 prevalence。[论文 §4.1–§4.2、Table 2](https://arxiv.org/pdf/2608.14940v3#page=5)

Completion argument 必须写明 score 所声称的 outcome、observation period、system boundary 与 analysis unit；interaction stop rule 与真正 scoring observation；endpoint 后仍可能活动或跨 run 的 processes、queues、callbacks、credentials、stores、external resources、artifacts 和 memory；以及每条 route 如何终止、取消、隔离、重置并由何种系统证据验证。关闭不了 route 时，只能缩小 claim、给出足以固定标签的 bound、标 unresolved，或把相连 runs 合并为一个 analysis unit。[论文 §6](https://arxiv.org/pdf/2608.14940v3#page=8)

Appendix C 的 Table C.1 提出 open-effects record：run/task/stream identity、initiating trace event、resource/controller、stable observation handle、`pending | terminal | cancelled | persistent | unknown` status、possible transitions、cross-run scope、最近 verification 与 analysis disposition。agent 自报可帮助发现 effect，但空自报不能证明没有 effect；最终判断需要来自 resource owner、orchestrator 或其他权威系统 observation。[论文 Appendix C、Table C.1](https://arxiv.org/pdf/2608.14940v3#page=18)

### HarnessDev：Harness 是冻结、具名并跨 executor 检验的 artifact

HarnessDev 把被评对象从单次答案改为可运行 Harness `H`：creator model `L_C` 在 development environment `D` 中生成或修改 `H`，冻结后由 runtime/executor model `L_E` 执行 downstream tasks，再由 evaluator `J` 评分。该分解明确区分 creator、development environment、frozen Harness、executor 和 evaluator；同一比较中固定 `L_E` 与 `J`，避免把 creator 的开发工具或 executor 的能力误记为 Harness 质量。[论文 §3.1、Figure 1、Table 1](https://arxiv.org/pdf/2609.01437v1#page=4)

Creation 只公开 specification 和 1–3 个 development cases，hidden tasks、answers 与 official scores 不进入开发循环。Evolution 的正式 candidate 必须冻结为一个 commit，并让同一 commit 完整完成 SWE-Pro-100 和 Terminal-Bench-89 两条腿后才进入 official trajectory；probe、partial leg、stopped run 和 invalid instance 均排除。全部开发结束后，再对每个正式版本运行从未向 creator 显示、与反馈集 disjoint 的 SWE-Pro-630 heldout。[论文 §3.2、Table 2](https://arxiv.org/pdf/2609.01437v1#page=5)

Self-Eval 令 `L_E = L_C`，测量 model–Harness co-design；Unified-Eval 使用固定 Gemini 3.1 Pro 执行所有 Harness，以尽量隔离 Harness 差异。论文结果显示 Harness 改进对 executor 有绑定性，feedback-set 增益只部分迁移到 heldout，64 个可比较 switches 中 feedback 与 heldout 同方向仅 34 次，且部分 fixed-executor lineage 在 heldout 退化。Harness 名称或 model family 因而不足以唯一标识一个测量结果。[论文 §3.4、§4.2–§4.3、Tables 3–4、Figure 8](https://arxiv.org/pdf/2609.01437v1#page=6)

每次运行保留 frozen Harness source、trajectory、result 和 metrics；Harness 自报 `success` 不进入 score，SWE-Pro 的 authority 是真实 repository diff，Terminal-Bench 的 authority 是 final environment state。Figure 3 把 Harness control layer 与 scorer-readable artifacts 分开，提供了“执行证据由 Harness 产生、正确性由独立 evaluator 判定”的具体先例。[论文 §3.3–§3.4、Figure 3](https://arxiv.org/pdf/2609.01437v1#page=6)

### DAREBench：grader 要读 trajectory 与最终 artifact，并审计 unsupported positive

DAREBench 把 task 表为 instruction、initial workspace、tools、artifact contract、task-specific scorer 与 time budget；无法定义显式 artifact contract 或可靠 scorer 的候选会在 construction 阶段过滤。评分模式在 task construction 时固定为 automated、LLM judge 或 hybrid；自动评分检查必需 artifact 的存在与内容，开放任务的 judge 读取 task prompt、trajectory summary、final artifacts 与人工 rubric，hybrid weights 也是任务定义的一部分。[论文 §3.1–§3.3、Figure 2、Table 8](https://arxiv.org/pdf/2609.06059v1#page=5)

Pilot 发现 primary judge 会给 empty output、无实质操作、缺失 artifact 或 pseudo-tool-call 的 run 正分。正式 audit 先用 deterministic rules 高召回筛选可疑 positive，再由不同模型家族的 meta-judge 读取完整 task prompt、execution trajectory、final artifacts、rubric、original score 与理由；确认 unsupported 后归零。7,587 个 model–task runs 中有 3,340 个 judge/hybrid calls，筛出 182 个候选，最终确认并移除 143 个 unsupported positives；100 条分层人工复核中，meta-judge 校正后的 MAE 为 0.049，primary judge 为 0.098。[论文 §3.3、§4.3、Table 3、Appendix C、Table 5、Figures 8–9](https://arxiv.org/pdf/2609.06059v1#page=6)

论文首页声称代码位于 `SeerRay-Lab/DAREBench`，但 2026-09-10 对该 GitHub URL 的 refs 查询为空。因此这里只采信论文可核对的协议和实验数字，不把 233-task manifests、audit rules、prompt files 或复现脚本视作已有代码 artifact 支持。[论文首页](https://arxiv.org/pdf/2609.06059v1#page=1)

### ECP：portable wire protocol 可参考，但尚不是完整测量协议

ECP 提出 Runtime 与 Agent 间的 JSON-RPC 协议；manifest 声明 scenarios、steps、limits 与 graders，Agent 返回 public output、evaluator-safe context、tool calls 和 logs。论文自己把工作定位为 design/artifact proposal，而非受控实证研究；versioning/deprecation、sealed heldout manifest、signed evidence，以及至少两个独立实现通过同一 conformance profile 都列在 future work。[论文 §IV–§VIII、Table I](https://arxiv.org/pdf/2608.19263v1#page=4)

固定 commit 中，[`spec/protocol.md`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/spec/protocol.md) 标 `Version: 0.7.0-draft` 与 `Status: Experimental`，而 [`README.md`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/README.md) 的 package line 是 `0.9.0`。参考 runtime 的 [`runtime/python/src/ecp_runtime/runner.py`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/runner.py) 为每个 scenario 创建 fresh agent process；timeout、crash、transport 或 protocol error 有独立 `exit_reason`。[`runtime/python/src/ecp_runtime/audit.py`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/audit.py) 记录 run id、manifest SHA-256、runtime version、agent metadata、limits、timestamps、step latency、exit reason、usage 与 totals，说明 portable envelope 至少应携带 provenance 和完整性标识。

但 `agent/reset` 只返回布尔 `true`，[`runtime/python/src/ecp_runtime/conformance.py`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/conformance.py) 只验证返回值为真；协议没有资源清单、pending-effect handle、possible transitions 或 reset 后状态证明。ECP 因而可以作为 wire envelope 和 audit 字段的旁证，不能替代 Outcome Finality 所要求的 completion argument 与 cross-run separation evidence。

## 六个必须回答的问题

### 1. Legacy benchmark adapter 如何证明与原实现 parity

#### 来源事实

“能加载”“能跑完”或“oracle 在新 verifier 上通过”都不足以证明 parity。Harbor 的两条证据链互补：oracle/reference validation 证明 adapted task 接受已知正确结果；matched multi-trial experiment 再证明原实现与 adapter 在同一 agent、model、tool set、prompt/template、decoding、execution configuration 和 task set 下给出相容测量。报告需包含逐 trial 与逐 task 结果、mean ± uncertainty、missing/invalid cases、selection provenance 和已知环境差异；三阶段 review 还检查 schema、文档、环境可复现性、语义改写和 parity 结果。[Harbor Appendix D.3–D.4](https://arxiv.org/pdf/2609.04298v2#page=33)

Harbor 的官方 catalog 同时证明 parity 允许诚实的 benchmark-specific 变体：有的跑全量，有的按难度或子域分层，有的只做 transitive parity，有的因无 oracle 而使用替代 evidence。来源支持的是“证据必须足以审计，偏差必须显式”，而不是“所有 benchmark 固定三次、固定 SEM 或固定阈值”。[Harbor Appendix D.4.3–D.6、Tables 3–5](https://arxiv.org/pdf/2609.04298v2#page=35)

#### 本仓设计推论

G10 应把 adapter parity 定义成可失败、可复查的迁移状态机，而非 Boolean smoke gate：

1. 固定 source benchmark revision、adapter revision、canonical case ids 和转换产物 digest。
2. 先运行 oracle/reference validation；无 oracle 时必须声明替代证据、覆盖范围和 residual risk，不能伪造 `100% oracle pass`。
3. 原侧与新侧使用同一 frozen Harness artifact、runtime model revision、interface stack、sampling/tool policy，并把无法匹配的 Environment 差异写入 record。
4. 至少比较 aggregate metric、case-level verdict agreement、error/timeout/invalid 分布和 grader evidence；随机系统重复运行并报告 uncertainty，阈值在看结果前确定。
5. 任一侧出现 unexplained missing case、字段丢失、infra error、grader semantic drift 或 private material 暴露时，状态必须是 `invalid` 或 `parity_unresolved`，不得标 `validated`。

### 2. Oracle/reference、hidden tests、solution 与 comparator policy 由谁拥有

#### 来源事实

Harbor task schema 把 tests 与 solution 放在 benchmark task，adapter 迁移 scoring logic；Harbor-Index 再用 separate verifier environment 隔离 tests、gold answers 与 judge dependencies。HarnessDev 禁止 creator/Harness 读取 hidden tasks、answers、patches、private scorer internals 和 official heldout feedback，权威 evaluator 读取 repository diff 或 final environment state，而不是 Harness 自报状态。DAREBench 则在 task construction 阶段固定 artifact contract、task-specific scorer、rubric、scoring mode 与 hybrid weights。[Harbor §2、Appendix D.3](https://arxiv.org/pdf/2609.04298v2#page=3)；[Harbor-Index `ADAPTATIONS.md`](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/ADAPTATIONS.md)；[HarnessDev §3.2–§3.4、Figure 3](https://arxiv.org/pdf/2609.01437v1#page=5)；[DAREBench §3.1–§3.3](https://arxiv.org/pdf/2609.06059v1#page=5)

#### 本仓设计推论

- **Benchmark pack 拥有** source record、split、task material、reference/oracle、hidden tests、solution、rubric、metric、comparator policy 的选择与参数，以及 aggregate semantics。通用 comparator/grader implementation 可以在共享包，但只能由 Benchmark 显式 resolve。
- **Harness 拥有** model interaction：prompt/context assembly、turn loop、tool exposure、parser/recovery 和 trajectory capture。它只接收 public `PreparedTask`，不得读取 private grading material，也不得决定“什么算对”。
- **Environment 拥有** workspace、process/service、tool execution、resource/network policy、side effects 与 lifecycle evidence。它可以承载 verifier process，但不拥有 correctness semantics。
- **Grading boundary 拥有** 对 private material 的受控读取，输出 verdict、evidence 与 policy identity。solution 仅用于 oracle/parity 或受控评分，不进入普通 model run。

Shared task-material protocol 因而至少要有类型和运行时都隔离的 public execution view 与 private grading view。单一对象靠调用约定“不要读 `expected.sql`”不构成隔离；`match_modes` 从枚举迁移为 policy object 时，default resolution 也应归 Benchmark，不能藏在 Harness `run()` 或 comparator 内部。

### 3. Raw emission、parsed action、execution、observation 和 grader evidence 是否持久化

#### 来源事实

Interface Censoring 的反例表明，同一个 HTTP 200 + empty `tool_calls` 可能表示模型没尝试、模型发出 parser 不认识的合法 envelope、template 未注入 tools、schema 诱发 wrong tool，或 token budget 在 envelope 前耗尽。只有 raw provider output、离线 emitted-intent classification、server parser result、actual dispatch、observation 与 task score 分开保存，才能定位损失层；未保存完整 raw rollouts 的 RL arms 被作者明确列为无法消歧的限制。[论文 Figure 1、§3.1、§4.6、Appendix A、§6](https://arxiv.org/pdf/2609.03966v1#page=2)

DAREBench 的 unsupported-positive audit 需要 trajectory、真实工具行为与 final artifacts；HarnessDev 保存 frozen source、trajectory、result 和 metrics；Outcome Finality 还要求把 endpoint 后的 pending effect 与后续 system observation 关联。ECP 只给 `tool_calls`、logs 与 evaluator-safe context，没有 raw provider bytes、parser decision、真实 Environment execution 或 open-effects record，所以不能替代完整阶段证据。[DAREBench §3.3、Appendix C](https://arxiv.org/pdf/2609.06059v1#page=6)；[HarnessDev §3.4](https://arxiv.org/pdf/2609.01437v1#page=6)；[Outcome Finality Table C.1](https://arxiv.org/pdf/2608.14940v3#page=18)；[ECP `spec/protocol.md`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/spec/protocol.md)

#### 本仓设计推论

五个阶段都应成为 durable evidence，但不要求保存隐藏 chain-of-thought：

1. **raw emission**：provider 返回的 assistant text/tool-call payload、finish reason、request/response ids、截断与错误；敏感内容可加密或分级，但需保存可重放 bytes 或 content-addressed blob。
2. **parsed action**：parser identity/version、输入 raw event id、成功或失败、tool name、arguments 与 schema-validation result；`no_action`、`parse_failed`、`invalid_action` 不得折成同一空数组。
3. **execution**：dispatch id、Environment run/namespace、请求、start/end、exit/timeout/cancel 状态及产生的 open-effect handles。
4. **observation**：返回 Harness/模型的 observation、截断策略、artifact/location digest 与关联 execution id。
5. **grader evidence**：所读 artifacts/state snapshot、grader/comparator/judge identity、rubric/policy、逐项判断、raw score 与 audited score。

缺少其中任何关键阶段时，run 对相应结论只能标 `unverifiable`；不能把证据缺失静默归为 model failure。事件名、blob backend、保留期、脱敏和授权策略是实现选择，但 model failure、interface censoring、Environment failure 与 grader false positive 必须可区分是跨 benchmark 硬要求。

### 4. Template/parser/tool schema 组合 preflight 如何定义失败语义

#### 来源事实

Interface Censoring 的 Table 1 证明单独检查 template 或 parser 都会漏掉组合不兼容；`required` positive control 也只能证明 pipeline 接受受约束输出，不能证明 `auto` 下模型自然使用同一格式。官方 preflight 因而在真实 serving endpoint 上，对同一 canonical schema 分别运行 `auto` 和 `required`，检查 call 是否存在、名称是否属于声明、arguments 是否可解析；raw output 必须保留供离线判断。[论文 §3.2、§4.1、§4.6、§5、Table 1](https://arxiv.org/pdf/2609.03966v1#page=5)；[官方 `preflight_toolcall.py`](https://github.com/nebula-1999/Interface-Induced-Trajectory-Censoring/blob/9cfaaad17d702c70e1430f9e1413803507d8f2f6/preflight_toolcall.py)

#### 本仓设计推论

Preflight identity 必须覆盖 `model/provider revision × serving stack/version × chat-template hash × serializer mode × parser id/version × tool-schema digest × tool-choice policy`。最低流程与失败语义是：

1. 静态渲染真实 template + schema，确认工具声明未被删除或改写。
2. 用 `required` 发 canonical request，要求返回声明内 tool name 与 schema-valid arguments。
3. 在 disposable Environment 中实际 dispatch，并验证 observation 能返回下一轮；只 parse 不 execution 不算通过。
4. 用 `auto` 重跑并保存 raw emission。若 raw 中有合规调用而 server parse 为空，判 `interface_incompatible`，正式 batch 不得开始。
5. HTTP/transport error、malformed response、wrong tool、argument schema failure、dispatch failure 或 observation loss 判 `preflight_failed`；整组 configuration invalid，不生成模型能力分。
6. `required` 通过、`auto` 无调用且 raw 中也无合规调用，只能判 `auto_inconclusive`。Benchmark 若要求自主 tool selection 可选择阻塞，否则允许继续但不得把 preflight 自身写成 case incorrect。

逐工具还是按 schema family、canonical prompt 内容、允许何种 parser repair，以及 `auto_inconclusive` 是否阻塞是 benchmark/interface-specific；preflight failure 不进入 task-score 分母则是硬要求。

### 5. Outcome finality、pending effect、namespace/reset/cleanup 与 cross-run separation 如何进入 Environment interface

#### 来源事实

Outcome Finality 的硬区分是：Harness stop rule 不等于 outcome finality，也不等于下一 run 独立。Table 2 的 delayed-write 和 shared-state replay 分别证明“等到当前结果稳定”与“阻止结果跨 run 传播”需要不同证据。Table 3 对十个公开协议的审查还发现，reset 或 deliberate retention 较常被记录，但 pending operations、reset 覆盖资源和恢复验证通常不完整；因此仅有 `cleanup()` 名称或 Boolean success 不足以支持独立样本推断。[论文 §4–§5、Tables 2–3](https://arxiv.org/pdf/2608.14940v3#page=5)

#### 本仓设计推论

Environment interface 必须显式提供：

- 预先声明的 system boundary、outcome observation period 与 analysis-unit/stream identity；
- per-run namespace，以及 credential、process tree、queue/job、store、external account、artifact 与 memory 的 scope；
- `listOpenEffects()` 或等价 evidence，返回 stable handle、status、possible transitions 与 cross-run route；
- `settle` / `cancel` / `finalize`，返回 `final | unresolved` 与 authority-backed observation，而不是把 Harness 停止当完成；
- `reset` / `cleanup` 后的 verification report，说明恢复了什么、何时观察、哪个 authority 证明；
- `dispose` 后仍未 terminal 的 effect 及其 analysis disposition。

可能改变 verdict 的 effect 未 terminal、未取消或未被足够收窄时，grader 不得输出 final success/failure；可能跨 run 的 route 未隔离时，runs 不得按 independent trials 聚合。若 persistence 是任务本身，则用显式 stream/group id，把相连序列作为 analysis unit。等待时长、取消策略、namespace 技术和 declared boundary 内包含哪些资源由具体 benchmark 决定。

### 6. Harness artifact/version、runtime model 与 heldout transfer 如何进入 run identity

#### 来源事实

HarnessDev 的测量单位是 frozen Harness artifact，而不是“某模型生成的一段代码”。正式 Evolution candidate 要以同一 commit 完成完整 benchmark pair；heldout 只在开发结束后对冻结版本运行；Self-Eval 与 fixed-executor Unified-Eval 分开报告。论文观测到换 executor 会改变初始分数、Harness 排名和改动收益，因此 creator、Harness artifact 与 runtime model 都不能相互替代。[论文 §3.1–§3.4、Table 1、Figure 8](https://arxiv.org/pdf/2609.01437v1#page=4)

Interface Censoring 又要求精确 model revision、serving stack、template 与 parser identity；ECP audit 提供 run id、manifest digest、runtime/agent metadata 和 limits 的 wire-level 最小先例，但不包含完整 Benchmark/Harness/Environment identity。[Interface Censoring §5–§6](https://arxiv.org/pdf/2609.03966v1#page=12)；[ECP `audit.py`](https://github.com/evaluation-context-protocol/ecp/blob/5ed863811e79fa708481d3213fd733391033d593/runtime/python/src/ecp_runtime/audit.py)

#### 本仓设计推论

每个可比较 run 的不可省略 identity 至少包括：

- benchmark pack name/version/content digest、source revision、case id/revision 与 split (`train | heldout | fresh`)；
- adapter name/version/content digest 与 parity evidence id；
- Harness artifact name/version/commit/content digest；生成或演化产物另记 creator model、development environment 与 lineage parent；
- runtime model provider、精确 model id/revision、endpoint/serving-stack version、sampling 与 seed；
- template、serializer、parser、tool schema 与 tool-policy digest；
- Environment provider、image/content digest、resource/network policy、namespace/stream identity；
- grader/comparator/judge/rubric policy identity、trial index、start/end 和 `complete | degraded | invalid` 状态。

Heldout transfer 必须比较**同一 frozen Harness artifact**，且 heldout 在冻结前不可向开发过程暴露。至少分别保存 `(Harness, self runtime, feedback)`、`(同 Harness, self runtime, heldout)` 与 `(同 Harness, fixed runtime, heldout)`；缺腿、commit 不同或 Environment/grader identity 不同的组合不能拼成 transfer 结论。fixed runtime 的数量、heldout 规模与聚合方式是 benchmark-specific choice。

## 跨 benchmark 硬要求与 benchmark-specific choices

### 必须跨 benchmark 保持的测量要求

1. Adapter validation 同时包含 source provenance、oracle/reference check、原实现对照、case-level evidence、uncertainty 和显式 unresolved/invalid 状态。
2. Public task material 与 private grading material 在类型、依赖和运行时访问上隔离；Harness 不拥有 correctness policy。
3. Raw emission、parsed action、execution、observation 与 grader evidence 可关联、可回放、可审计；缺失不能伪装成 model failure。
4. Preflight 绑定完整 interface-stack identity，失败发生在评分前，且不进入能力分母。
5. Environment 对 finality 和 separation 分别举证；Boolean reset、进程退出或 Harness stop 均不是充分证明。
6. 每个 score 绑定 frozen Benchmark、Adapter、Harness、runtime model、interface stack、Environment 和 grader identity。
7. Heldout/fresh 在 artifact 冻结前不可见；feedback、heldout 与 cross-runtime transfer 不能跨 commit 拼接。

### 不应由 G10 写死的 benchmark-specific choices

- parity 的重复次数、SEM/bootstrap/paired test、容差、全量或分层 subset，以及是否接受 transitive parity；
- oracle 的具体形式、无 oracle 时的替代 validation、grader 是 rule/execute/judge/hybrid 及其权重；
- artifact 路径、task-specific scorer、finality observation window、等待/取消策略、namespace 技术与 persistent-session analysis unit；
- 每个 model family 的 template/parser repair、`auto_inconclusive` 是否阻塞、逐 tool 还是逐 schema-family preflight；
- raw evidence 的加密、分级访问与保留期，只要授权审计仍可完成且缺失显式标记；
- heldout 数量、fixed executor 选择、transfer statistic 与 aggregate metric，只要冻结、隔离和 identity 规则不变。

## 结论与来源缺口

六篇来源共同排除一种宽松实现：把 benchmark 转成 runner 可读取的 JSON 就宣称语义未变；把 HTTP 200 + empty `tool_calls` 计为模型失败；把 Harness stop 当 outcome final；把 `reset(): true` 当 cross-run separation；或只用 model name + benchmark name 标识结果。G10 应把 adapter parity、private-material isolation、interface preflight、五阶段 evidence、Environment completion proof 和 frozen run identity 提升为一等协议。

本次认读仍有以下一手来源缺口：

1. DAREBench 论文点名的 GitHub 仓库在 **2026-09-10** 无 refs，因此无法用代码核验 233-task manifests、deterministic audit rules、judge prompts 或复现实验。
2. HarnessDev 项目页发布图表、结果数字和方法叙述，但在 **2026-09-10** 未提供 HarnessDev 代码仓库、冻结 Harness artifacts、hidden split manifests 或逐 run logs 的链接；实现细节只能以论文为证。
3. Outcome Finality v3 未提供官方代码仓库，其 replay harness 与 12 项 implementation checks 只能从 Appendix B 的描述核验。
4. ECP 是 early proposal：论文明确缺少受控 empirical validation，官方规范仍为 Experimental，独立实现互操作、sealed manifests、signed evidence 与稳定 versioning 尚属 future work；不能把它当成成熟 cross-benchmark standard。
5. Harbor 论文的 Harbor-Index 1.0 是 82 tasks，而固定 commit 的 README/`ADAPTATIONS.md` 是移除两个 SWE-Lancer Manager tasks 后的 80 tasks；任何采用都必须绑定 release tag 和 content/image digests，不能只写浮动名称 `Harbor-Index`。Harbor Atom 作者元数据与 PDF v2 作者块也不一致。

## G10 决议后的最终承接关系

这些 measurement-validity 要求由 foundation-first implementation chain 分别承接。下表给出最终 owner；后续实施以 owner ticket 为准，不按旧 package 名或旧 runner 边界分配责任。

| 要求 | 最终 owner |
| --- | --- |
| Legacy loader 保留 reference/provenance，未知字段 fail loud | [T11 — Loader provenance strip](../tickets/T11-loader-provenance-strip.md) |
| Execution artifact、grader facts 与 model/infra/case failure 分离 | [T1 — Execution grader implementation](../tickets/T1-exec-grader-impl.md) |
| Protocol identities、public/private views、Environment finality/separation、repositories 与 stores | [T9 — Evaluation foundations](../tickets/T9-evaluation-foundations.md) |
| K11/RBI canonical Pack migration、oracle/reference validation、matched parity 与逐 case diagnostics | [T14 — Data-analysis extension 与 canonical Pack migration](../tickets/T14-data-analysis-extension-pack-migration.md) |
| 真实 production composition、interface-stack preflight、五阶段 evidence 与完整 Run Identity Graph | [T15 — Product Evaluation Controller 与 external CLI](../tickets/T15-evaluation-controller-cli.md) |
| Private-material reachability gate、最终 package graph、consumer migration 与 legacy deletion | [T12 — Final Evaluation package graph 与 legacy cutover](../tickets/T12-eval-package-consolidation.md) |
| 新协议下的完整 baseline、coverage accounting 与历史结果不可比声明 | [R25 — New Evaluation stack baseline re-anchor](../tickets/R25-evaluation-rebaseline.md) |

## 验收清单

### Cross-ticket design obligations

- [ ] 定义 versioned canonical task-material protocol；public execution material 与 private grading material 有不同类型、不同依赖入口和运行时访问权限，unknown grading field 或 lossy conversion fail loud。
- [ ] Benchmark 明确拥有 source provenance、split、reference/oracle、hidden tests/solution、grader/comparator policy 和 aggregation；Harness 不读取或推断这些内容，Environment 不取得 correctness ownership。
- [ ] Harness 明确拥有 prompt/loop/tool/parser 与五阶段 evidence capture，但 `parse_failed`、`interface_incompatible`、infra failure、grader failure 和 model failure 保持不同 discriminant。
- [ ] Environment interface 明确 outcome period、system boundary、namespace/stream、pending effects、settle/cancel/finalize、verified reset/cleanup 与 `unresolved`；`reset(): true` 不足以证明 separation。
- [ ] Run identity 包含 frozen Benchmark/Adapter/Harness digest、runtime model revision、完整 interface-stack digest、Environment image/config、case/split 与 grader policy；score/result 以该 identity 为键。
- [ ] 定义 `preflight_failed | interface_incompatible | auto_inconclusive` 语义；前两者使 configuration invalid，不进入能力分母，第三者由 Benchmark policy 决定是否阻塞。
- [ ] 定义 legacy parity record：原/新两侧 revisions/config、task ids、oracle 结果、逐 trial/逐 case 结果、不确定性、missing/invalid、已知偏差、review 状态与 artifact links。
- [ ] 定义 `final | unresolved | invalid` 与 ordinary fail 的区别；只有 final 且 separated 的 run 默认按独立 trial 聚合，persistent task 使用显式 analysis-unit id。
- [ ] 定义 heldout/fresh 的访问边界和冻结顺序；feedback、heldout、fixed-runtime transfer 结果不得跨 Harness commit 或 identity component 拼接。
- [ ] 明确 ECP 仅可参考 wire envelope 与 audit fields；其 draft reset 和不完整 phase/finality evidence 不得成为本仓协议的替代品。

### Downstream implementation 必须承载

- [ ] **T14**：`k11-v2` 与 `rbi-10000251-exec` 先保留各自 source schema/provenance，再无损编译到 canonical envelope；`expected.sql`、`meta.anchor_ds`、`tier`、split 与 policy 各有 round-trip 或拒绝丢失测试。
- [ ] **T14**：Benchmark adapter 具有 oracle/reference validation 与 original-vs-adapted parity fixture/runner；没有 parity evidence 的 pack 不得标 `validated`，差异只能标 `parity_unresolved` 或带审计说明的 accepted deviation。
- [ ] **T15**：持久化 raw emission、parsed action、execution、observation、grader evidence 及关联 ids；测试覆盖合法调用被 parser 丢弃、wrong tool、argument schema failure、未 dispatch、observation loss 与 judge unsupported positive。
- [ ] **T15**：Batch 前运行真实 model/provider/template/parser/schema/Environment 组合 preflight；失败使整组 configuration invalid，且不会创建 case incorrect 记录。
- [ ] **T9/T15**：Environment tests 覆盖 delayed effect、timeout 后 descendant、namespaced isolation、verified reset、cleanup failure、external resource route 与 intentional persistent stream；证明 unresolved/connected runs 不进入 independent pass 指标。
- [ ] **T15**：每个输出携带完整 run identity；同 case 的不同 Harness commit、model revision、template/parser、Environment digest 或 grader policy 不会被错误 merge、cache-hit 或 aggregate。
- [ ] **R25**：重建 baseline；不得把新 protocol 的结果与已经宣布失效的旧 168-case / 39-case 百分数声称直接可比。
- [ ] **T15/T12**：若实现改变 model-visible transcript 或 product-user-visible output，同 PR 更新真实 runnable example、keyless snapshot，并按仓库规则同步 TypeScript/Python SDK projection。

### T12 重定后的包级验收必须新增或修订

- [ ] 包重组保持依赖方向：Benchmark/private grading material 不因合包进入 Harness runtime dependency graph，Environment 不获得 comparator/grader policy ownership。
- [ ] CLI 与 Cordis service 若共享 runtime，只共享 orchestration、protocol types、evidence persistence 与 statistics implementation；Benchmark policy resolution 仍是显式输入。
- [ ] 合并前后以相同 frozen run identity 和 parity fixtures 验证行为；不得用“包数量减少”“imports 编译通过”或 smoke test 替代测量语义等价证据。
- [ ] Public/private task views、interface preflight、finality/separation、run identity 与 evidence schema 各有唯一 owner；仓外 consumer 不能通过 re-export 或深层 import 绕过这些入口。
- [ ] 静态 gate 证明 hidden tests、reference、solution、oracle artifacts 与 private scorer internals 不可从普通 Harness dependency graph 到达，并包含一个故意越界的拒绝用例。
- [ ] Package move 保留 artifact/version provenance 与历史 parity links；旧 import path 被删除而非 compatibility shim，新的 release/content digest 成为重建结果的唯一身份。
