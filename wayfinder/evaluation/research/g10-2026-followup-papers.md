# G10 相关方向 2026 年后续文献侦察

日期：2026-09-09

本侦察补充 [R10 认读](harness-goodhart-papers.md)。它记录 2026 年新增的一手论文候选、相对 R10 的新增证据和 ticket 分流。这里只做文献路由；正式采信仍由对应 research ticket 全文认读、机械复核官方实现后完成。

## 结论

新增论文不推翻 R10 的所有权结论：Benchmark 拥有任务与正确性语义，Harness 拥有交互，Environment 拥有执行状态。它们补强的是 adapter parity、interface validity、run finality、污染披露、judge construct validity、重复可靠性、持久多轮和 live benchmark 生命周期。

直接影响 G10 的研究集中到 [Benchmark adapter parity、interface censoring 与 run isolation](../tickets/R10b-harness-measurement-validity.md)。污染检测进入 [R5](../tickets/R5-contamination-papers.md) 与 [R17](../tickets/R17-contamination-audit.md)；fresh pack 生命周期进入 [G5](../tickets/G5-dynamic-case-pipeline.md)；跨时间 Goodhart 进入 [R21](../tickets/R21-goodhart-audit.md)；judge 与统计分别进入 [R3](../tickets/R3-judge-calibration-papers.md)、[R8](../tickets/R8-pairwise-judge-papers.md) 和 [R4](../tickets/R4-significance-papers.md)；持久多轮进入 [R6](../tickets/R6-trajectory-papers.md)，重复可靠性实验进入 [R22](../tickets/R22-consistency-at-k.md)。

## 一、直接补强 G10

### Harbor Adapters and Harbor-Index — [arXiv:2609.04298](https://arxiv.org/abs/2609.04298)

新增证据：大规模统一 benchmark 需要具名 adapter、来源 identity、oracle/reference validation、原实现与适配实现 parity experiment，以及 task defect audit。它把“可加载”提升为“测量语义等价”。

G10 增量：Benchmark Adapter 成为正式模块；pack identity 固定来源、版本和内容摘要；`k11-v2` 与 RBI 先成为独立 pack，再编译到共享 envelope；迁移验收增加 parity、oracle 和 provenance preservation。

### Interface-Induced Trajectory Censoring — [arXiv:2609.03966](https://arxiv.org/abs/2609.03966)

新增证据：固定模型、case、seed、executor 与 scorer，只改变 serving adapter，合法 tool call 仍可能被 template/parser 组合静默吞掉。Observed tool-call rate 属于 model-interface stack，不只是模型。

G10 增量：Harness/adapter identity 是语义配置；运行证据分 raw emission、parsed action、execution 与 observation；template/parser/tool schema 需要组合 preflight；interface mismatch 不能记为模型失败。

### When Is an Agent Evaluation Over? Outcome Finality and Cross-Unit Separation — [arXiv:2608.14940](https://arxiv.org/abs/2608.14940)

新增证据：正确解释一次评测需要 outcome finality 与 cross-unit separation。停止输出不等于副作用完成；前一 run 的状态也可能污染后一 run。

G10 增量：Environment interface 表达 pending/final/indeterminate；记录 delayed effects、namespace、reset、cleanup 和跨 run 隔离证据；未满足 finality 时不产生最终 pass/fail。

### HarnessDev — [arXiv:2609.01437](https://arxiv.org/abs/2609.01437)

新增证据：Harness 本身是影响性能和成本的可版本化 artifact；在开发任务上改进不保证迁移到 heldout 或不同 runtime model。

G10 增量：固定 harness artifact identity；公开开发材料与隐藏评测材料隔离；Harness 变更报告 development/heldout transfer，而不是只报告开发集得分。

### DAREBench — [arXiv:2609.06059](https://arxiv.org/abs/2609.06059)

新增证据：评分应引用实际 tool、workspace artifact 与 trajectory evidence，不能只根据模型最终声称完成任务。

分流：吸收 evidence-based audit 到 G10 验收，不单独开票。Deterministic verifier 优先；judge 与执行证据冲突时进入 audit/failure。

### Evaluation Context Protocol — [arXiv:2608.19263](https://arxiv.org/abs/2608.19263)

新增证据：portable evaluation wire protocol、manifest、JSON Schema、CLI validation 与 conformance harness 的具体提案。

限制：仍属早期协议，缺少充分互操作性和经验验证，也未覆盖 hidden material、adapter parity、environment finality 和 pack provenance。只作为 wire seam 参考，不作为本仓权威 schema。

## 二、污染与动态 benchmark

### Benchmark Contamination: A Taxonomy Organized by Defeated Mitigation — [arXiv:2608.29463](https://arxiv.org/abs/2608.29463)

新增证据：按绕过的缓解措施区分 direct、derivative、temporal、distributional 与 acquired contamination。Private test 主要关闭 direct exposure；运行中获得反馈或答案属于 score/run 属性。

G10 增量：benchmark provenance 与 run provenance 分开；run 记录 evaluation strata、elicitation budget、contamination controls 和 regeneration status，允许 `unknown`。

### Soft Contamination Means Benchmarks Test Shallow Generalization — [arXiv:2602.12413](https://arxiv.org/abs/2602.12413)

新增证据：字符串去重会漏掉语义近重复；同 benchmark 的 heldout 可能只测 benchmark-local shallow generalization。

分流：R5 全文认读，R17 测 train/heldout/fresh 的 lexical/semantic distance、相似度分桶表现与 derivation lineage。

### Combating Data Laundering in LLM Training — [arXiv:2604.01904](https://arxiv.org/abs/2604.01904)

新增证据：Synthesis Data Reversion 在不知道原 laundering transformation 时，搜索能重新显现记忆信号的合成变换，用于黑盒事后审计。

分流：R5/R17；G10 只保证 schema 能保存 `source_item → derived_item → transformation_family → generator/prompt/version`。

### When Is Benchmark Contamination Detectable? — [arXiv:2608.07914](https://arxiv.org/abs/2608.07914)

新增证据：`not detected` 可能意味着干净，也可能意味着 detector 无功效。审计需要 clean/seen controls、detector calibration、样本量规划、transport gate 与 abstain。

分流：R17 的结果至少区分 `detected | not_detected_with_power | inconclusive`。

### LiveClin — [arXiv:2602.16747](https://arxiv.org/abs/2602.16747)

新增证据：live benchmark 需要采集窗口、固定更新周期、evaluation set replacement、公开发布节奏与 private monitoring，而不是只给 case 加 `fresh: true`。

分流：G5 拥有 fresh pack 生产、轮换、隔离、发布和退役；G10 只提供 pack/version/time 接口。

### FutureSim — [arXiv:2605.15188](https://arxiv.org/abs/2605.15188)

新增证据：按真实时间顺序释放信息和反馈，观察 agent memory、搜索和策略如何在评测期间适应 benchmark。

分流：R21 研究 acquired contamination 与 evaluation-time adaptation；G10 提供可重放 Harness/Environment identity。

## 三、Judge、统计与重复可靠性

### A Judge Should Know What Changed — [arXiv:2608.24419](https://arxiv.org/abs/2608.24419)

新增证据：Judge validation 同时需要 invariance 与 construct sensitivity。对无关表面变化稳定，不代表能识别真正质量变化。

分流：R3/R8；为 SQL 建立等价变换和最小语义错误的成对探针。

### Agreement Metrics for LLM-as-Judge Evaluation — [arXiv:2606.00093](https://arxiv.org/abs/2606.00093)

新增证据：judgment scale、case inclusion、tie/invalid/abstention、aggregation 和 bootstrap unit 会显著改变 agreement 结论。

分流：R4/R3；Benchmark Pack 需要声明 estimand、aggregation、sampling/cluster unit、coverage 与可重建 verdict。

### Accuracy, Stability, and Repeated-Run Reliability — [arXiv:2606.00920](https://arxiv.org/abs/2606.00920)

新增证据：单次正确率与每题多次全部成功的稳定覆盖率可能产生不同排序，直接补强本仓 strict `pass^k`。

分流：R4/R22；结果保存逐 attempt vector，同时报告标准 `pass@n` 和 strict `pass^k`。

### AgentJudgeBench — [arXiv:2608.26623](https://arxiv.org/abs/2608.26623)

新增证据：Agentic tool-calling judge 需要理解 workflow DAG、依赖关系和中间工具步骤；普通文本 judge 的可靠性结论不能直接外推。

分流：R8；保存 judge 是否使用 ground truth、输入 trajectory 版本与任务难度。

## 四、第二层候选：不直接阻塞 G10

### Judging the Judges — [arXiv:2604.23178](https://arxiv.org/abs/2604.23178)

新增证据：系统比较 position、verbosity、style 等偏差与多种缓解策略，提示 bias 强度和方向依赖 judge model/version；position swap 不能替代 style 与结构化格式控制。

分流：R3/R8。G10 只保证 run provenance 能记录 judge model、prompt、decoding、position order、长度与格式特征。

### CARE: Confounder-Aware Aggregation — [arXiv:2603.00039](https://arxiv.org/abs/2603.00039)

新增证据：多个 judge 可能共享 style、verbosity 或训练来源等 latent confounder，简单 majority/average 不会自动抵消相关错误。

分流：R8。若未来使用 judge panel，schema 保存 per-judge verdict、judge family 和配置；G10 不负责实现聚合模型。

### Efficient Evaluation with Statistical Guarantees — [arXiv:2601.20251](https://arxiv.org/abs/2601.20251)

新增证据：adaptive item selection 需要保持 frequentist coverage，并记录 selection probability/history；固定预算下的高效抽样不能沿用均匀样本公式。

分流：R4。G10 只保证 case-level result 可寻址并可携带抽样 provenance。

### Benchmark² — [arXiv:2601.03986](https://arxiv.org/abs/2601.03986)

新增证据：benchmark 自身需要周期性审计 ranking consistency、discriminability 和 capability alignment；“fresh”但所有模型都失败的 slice 同样没有可用区分力。

分流：R4/R21，作为 benchmark-health audit，不替代 paired CI 与 power analysis。

### Cross-View Correspondence Is a Measurement Intervention — [arXiv:2608.17713](https://arxiv.org/abs/2608.17713)

新增证据：把不同 trajectory/view 对齐的 correspondence 不是中性预处理；过弱映射会制造敏感性，过强映射会制造不变性，多个最优映射可能使 credit 无法识别。

分流：R6/R4。需要保存 correspondence policy/version，并在用于 trajectory credit 前验证 nuisance removal 与 response preservation。

### Excess Separability — [arXiv:2608.12652](https://arxiv.org/abs/2608.12652)

新增证据：污染 detector 也可能被 nuisance confounder 驱动；过高 separability 不自动等于发现真实污染。

分流：R5/R17，作为 detector validity 的候选方法；由于依赖内部表示，不是当前 provider-only 路径的近期实现前置。

### Auditing LLM Benchmarks with Item Response Theory — [arXiv:2605.30504](https://arxiv.org/abs/2605.30504)

新增证据：item difficulty、discrimination 与标签质量可以用于 benchmark audit，但继承的标签错误会污染后续结论。

分流：R4/R17。先完成 ground-truth 修复，再考虑 IRT；不能用 IRT 美化坏标签。

## 五、持久多轮与 trajectory

### EvoCode-Bench — [arXiv:2605.24110](https://arxiv.org/abs/2605.24110)

新增证据：从正确 reference state 开始的单轮任务会高估真实持久多轮能力；workspace、session、累计 verifier 和旧需求回归都是测量对象。

分流：R6；G10 只保证 Harness/Environment protocol 能携带 state lineage。

### How Do LLM Agents Actually Get the Flag? — [arXiv:2608.26237](https://arxiv.org/abs/2608.26237)

新增证据：最终拿到答案不等于通过预期机制完成任务；需要区分真实执行、直接暴露、记忆、外部查找、猜测和无证据声明。

分流：R6，并向 R9 提供 mechanism-aware failure evidence；不改变 G10 所有权。

## 六、建议的研究顺序

1. 先完成 R10b，因为其结论可能改变 G10 的接口和硬验收。
2. G10 决策时吸收 contamination disclosure，但不等待污染 detector 实验。
3. R5 完成后由 R17 执行 semantic/laundering/power audit。
4. G5 决定 fresh pack 生命周期，R21 再执行 chronological Goodhart 测量。
5. R3/R8/R4 分别锁定 judge validity、pairwise evidence 与统计协议。
6. R6 研究 persistent multi-turn，R22 测 repeated reliability。
