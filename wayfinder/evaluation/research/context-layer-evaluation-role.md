# R10c — Context Layer 在 evaluation 中的作用与位置

日期：2026-09-10  ·  票：[R10c — Semantic/ontology context layer 在 evaluation 中的作用与位置](../tickets/R10c-context-layer-evaluation.md)  ·  分支：`research/R10c-context-layer-evaluation`

本文回答 semantic layer、ontology、knowledge graph 与更广义 Context Layer 应怎样进入 agent evaluation，并给 [G10 — Harness Benchmark/Harness/Environment 拆分](../tickets/G10-harness-bhe-split.md)、T9 和 [T12 — eval 包级重组](../tickets/T12-eval-package-consolidation.md) 提供验收输入。全文严格区分三类内容：论文直接支持的**来源事实**、仓库已经产生的**DSH 证据**、以及仍需 G10 裁定的**架构推论**。

## 结论先行

**Context Layer 不应成为与 Benchmark、Harness、Environment 并列的第四种执行角色。它应是独立版本化的 capability，由 composition root 装配，并通过显式 projection 接口被 Harness 和必要的 Environment adapter 消费。**

原因不是 Context Layer 不重要，而是其内部包含两种不同职责：一端是语义快照、ontology/schema、关系、术语、provenance 与 policy 等受治理知识；另一端是 retriever、ranker、子图选择、序列化和 token budget 等把知识投射给具体调用者的策略。把两者整体塞进 Benchmark，会使 benchmark ground truth 与被测 context 实现发生循环；塞进 Harness，会把 context 改进误报成 Harness 改进；塞进 Environment，则会把“世界状态和可执行资源”与“对世界的语义解释及检索策略”混为一谈。单列为第四 peer 又会暗示它和 B/H/E 一样只承担一种稳定角色，无法表达同一快照向 model、tool、critic、grader 提供不同最小投影的事实。

因此建议采用以下关系：

```text
Benchmark Pack ──声明任务、ContextRequirement、private grading material
       │
Composition Root ──冻结 Benchmark / Harness / Environment / Context identity
       │
       ├── Harness ──请求 ModelContextProjection，并决定注入时机与交互流程
       ├── Environment ──提供权威资源状态；必要时请求 ExecutionContextProjection
       └── Grader ──在运行结束后读取 private material 与 GraderEvidenceProjection

Context Capability
  ├── SemanticSnapshot：定义、ontology、关系、术语、policy、provenance
  └── ProjectionPolicy：retriever、ranker、过滤、子图、序列化、预算
```

Benchmark 可以携带一个不可变的 context fixture，或声明必须使用的 snapshot/profile，但这只是复现实验的输入，不代表 Benchmark 拥有生产 Context Layer。Harness 只拥有“何时请求、怎样把已返回投影放进模型交互”的编排；它不拥有语义事实、retrieval relevance 或 enrichment。Environment 只拥有数据库、文件、服务、时间与 side effect 等可执行世界状态；它可以提供构建语义快照的权威来源，但不拥有其 ontology 与 projection policy。Grader 可以读取运行后证据，却不能把 hidden expected 注入 Context Layer。

## 一手来源事实

### Dynamic Ontology：ontology 的效果必须拆成 schema、graph、functions 与 refinement

OaK 将 task-oriented schema、实例化 knowledge graph、schema-adapted function catalog 和迭代 refinement 组成 ontology kernel。agent 的 trajectory 保存 operator trace、function output 与 final answer；每轮先按 benchmark 官方协议评分，再由 judge 联合检查 schema、graph、functions、trajectory 与 task score，反馈下一轮修订。论文在 TravelPlanner、CRMArenaPro 和 ToolQA 上报告 full system 优于 ReAct、AFlow、MemP、ReCode 与 AgentSquare，并用去除 function composition、function module、iterative refinement 的 ablation 说明“有图”不等于“图能支持任务”。TravelPlanner 的三 seed 结果为 final pass 55.90±2.13，论文据此排除单一幸运 seed 的解释。[论文 §3.2、§4.1–4.5、Figure 2–5、Table 1–4](https://arxiv.org/pdf/2608.22974)

这篇论文直接支持两点。第一，ontology 不是一段 prompt：schema、graph、projection/function 与改进循环是可分别失效的组件。第二，final score 只能说明整个 kernel 有效，不能辨认增益来自 schema coverage、graph edges、function composition 还是训练反馈。论文用 training data 和 judge feedback 修改 kernel；如果同一 benchmark 的 hidden/final cases 或其派生反馈进入该循环，结果只能解释为 benchmark-adapted system，而不能解释为独立 heldout transfer。PDF 未声明可核验的官方代码或数据仓库，因此本次只能核对论文文本，不能复查实现和 run artifact。

### Answer Path：先测必要证据是否到达，再讨论格式和噪声

该研究用 gold SPARQL 构造 oracle subgraph，在六个模型、两个 KGQA benchmark、16 个实验和 30,841 次 trial 上分别改变 answer path、distractor、serialization、triple order、subgraph size 与 grounding instruction。固定 context 体积时，把非 answer-path triples 换成无关实体材料只改变 +0.003 F1；删除 answer path 则损失大部分 graph context 收益。serialization 和 ordering 在多跳条件下没有稳定收益，而 grounding instruction 会显著抑制 parametric recall：无事实时 strict instruction 把 F1 从 0.299 降到 0.035。作者还撤回了一个“深层 graph context 有害”的初步结论，因为 context/no-context 两臂使用了不同 instruction，且 scorer 对输出格式敏感。[论文 Table I、§III–VII、§IX Limitations、§X Conclusion](https://arxiv.org/pdf/2609.10237)

来源事实要求 evaluation 将至少四件事分开：answer-path/必要事实 recall、distractor precision、model 对已给 context 的利用、grounding instruction 与 scorer 的交互。该论文没有真实 retriever，precision 是人工构造 context 的属性；它不能直接证明生产 retriever 的表现，也不能证明静态注入结论适用于 agent 自主多轮检索。PDF 对实验代码只给出不完整的作者 GitHub 根路径，本次未找到可固定 revision 的官方 artifact。

### OntologyBench：grounding、relation 与 composition 不是同一种 retrieval 能力

OntologyBench 从生物医学 ontology 构造三层任务：Tier 1 concept grounding、Tier 2 relational retrieval、Tier 3 三 phenotype 组合到 disease 的 compositional retrieval，共 471,854 个训练 relevance pair 和 125,744 个 evaluation pair。主指标为 nDCG@10，并补充 MRR 与 Hit@k。Table 2 显示 embedding 在若干 grounding task 上较强，但 relational/compositional task 明显更弱；Tier-3 最强列出的 embedding nDCG@10 为 0.313，而 ontology-aware Phenomizer-style reference 为 0.739。Tier-3 规则化错误分析中，58.5% 为只匹配部分 phenotype 的 aggregation failure，另有 generic phenotype bias、related-disease confusion 与 semantic drift。[论文 §3、§4.4、§5、Table 1–4、Appendix G–H](https://arxiv.org/pdf/2609.08174)

论文同时公开了 split-integrity 限制：同一 task 的 directed query-target pair 无重叠，但 reciprocal task 可复用底层 relation，concept 和 association 也会跨 task 重现，因此它测量的是共享 ontology vocabulary 内的 transductive multi-task transfer，不是 unseen entity/relation 的 inductive generalization。[论文 §3.3、Limitations](https://arxiv.org/pdf/2609.08174) 官方 GitHub 在本次检查时可解析到 commit `7d65ca19993c30e3f6e4caca188edbc23512b628`，数据另由 Hugging Face 发布；本次未克隆执行。

### OntoKG-EQ：ontology 的主要价值可能是治理与 provenance，而不是 accuracy

OntoKG-EQ 用五个冻结 competency questions 约束 ontology 范围，并把 market data、derived metrics、SHACL validation、SPARQL、typed findings 与 explanation evidence bundle 组成可复算系统。三个市场只替换数据和小型 adapter，ontology、shapes、queries 与 rules 保持不变。其认真构建的 relational/SQLite baseline 返回相同 analytics；论文明确把 graph 的价值定位在治理、provenance、自解释结构和 portability，而不是改变数值答案。系统还用 validated evidence bundle 作为 reference，测八个开放模型转写同一证据时的 provenance coverage，并通过 component ablation、八种 fault injection 和用户研究分别检查结构组件、错误拒绝与可感知信任。[论文 §3.1、§4、§7.1–7.7、Table 3–7](https://arxiv.org/pdf/2609.08869)

这说明“最终答案与 SQL baseline 相同”不能推出 ontology 无价值；如果目标包含可审计性，必须单独测 evidence coverage、provenance soundness、shape conformance 与 fault rejection。官方 [GitHub](https://github.com/furqan-nr/OntoKG) 本次可解析到 commit `5035e0ba7aeee7b9bbecb6311eafb339591a8636`，论文也给出 [Zenodo 归档](https://doi.org/10.5281/zenodo.21569316)；本次未运行 artifact。

### Auditable by Construction：accuracy 相同时，traceability 与 leakage 仍可不同

KDAF 在 FinanceBench 145 题上比较 zero-context、BM25、concept-weighted lexical、ungrounded graph traversal 与 ontology-grounded CARP。所有 retrieval 条件的 correctness 约 10–12%，KDAF 与 BM25 差值为 −0.007，95% CI [−0.021, 0.000]，不足以用 accuracy 为 ontology 成本辩护；但 KDAF citation traceability F1 为 0.515，比 ungrounded graph 高 0.027、比 BM25 高 0.052，两个 paired bootstrap interval 均排除零。两种 graph retrieval 的跨主体 evidence 为 0/426 和 0/424，而 lexical baseline 的跨主体比例为 16.8% 和 20.2%。[论文 §4.1–4.2、Table 1–4](https://arxiv.org/pdf/2608.20661)

更重要的是其测量纪律：预注册 calibration/evaluation split；记录 graph snapshot digest、builder version、model/config/run identity；以 machine-readable artifact 执行 retrieval leakage audit、trace audit、row parity 与 package completeness；负向 provenance audit 曾发现“路径可解析但 citation id 被覆盖”的真实缺陷。作者也承认当前 trace completeness 对最终未选候选的拒绝理由记录不完整，FinanceBench 单文档问题不足以测 relational semantics。[论文 §4.1、§5.2–5.5、Limitations/Future Work](https://arxiv.org/pdf/2608.20661) 可复现材料声明归档于 [Zenodo DOI 10.5281/zenodo.22022068](https://doi.org/10.5281/zenodo.22022068)；PDF 未给 GitHub repository。

### Query-Side Attacks：端到端坍塌必须定位到 linking、retrieval、reasoning 或 generation

该研究把 GNN-KGQA 分成 entity linking、subgraph retrieval、GNN reasoning、answer generation 四阶段，并用经 KG denotation 验证的 answer-preserving query perturbation 做 stage isolation。Compositional Restructuring 下，超过 99% 的端到端 collapse 归因于 subgraph construction；即使 gold answer 仍存在于 74% 的 retrieved subgraph，拓扑和可达性变化也会使答案不可用。把 clean subgraph 固定后，GNN reasoning 接近 baseline，说明仅看“gold node 是否被检索到”仍会把 retrieval topology failure 错算成 reasoner failure。[论文 §3.3–4.2、§5–6、Figure 2、Table 1–3](https://arxiv.org/pdf/2608.25922)

来源事实支持 perturbation 必须保持答案语义不变、每次只攻击一个阶段，并同时记录 entity seeds、subgraph overlap/topology、reasoner candidate 与 final answer。论文给出的 artifact 是匿名 4open.science 链接，本次未能作为 Git remote 解析，因此没有固定 commit。

### 三个成熟锚点：只支撑分解，不替代上述 2026 证据

[STaRK](https://arxiv.org/abs/2404.13207) 把 textual properties 与 relational structure 同时纳入 semi-structured retrieval，在 Amazon、MAG 和 Prime 三域分别报告 Hit@1、Hit@5、Recall@20 与 MRR，并比较纯 text、纯 structure、融合和 LLM reranking。它支持“检索必须分别覆盖文本语义和关系约束，不能只用单一相似度指标”的分解；但它仍是 retrieval benchmark，不直接测 tool execution 或 agent finality。[论文 §2–3、Table 2–7](https://arxiv.org/pdf/2404.13207)

[RAGChecker](https://arxiv.org/abs/2408.08067) 将整体 response precision/recall/F1 与 retriever 的 claim recall/context precision，以及 generator 的 faithfulness、context utilization、hallucination、self-knowledge、relevant/irrelevant noise sensitivity分开。其 8 个 RAG system、10 个 dataset 的分析显示扩大 context 往往提高 recall 和 faithfulness，却降低 utilization、增加 noise sensitivity。[论文 §3.3、§4.3–4.4、Table 3、Figure 6–10](https://arxiv.org/pdf/2408.08067) 它支持 Context Layer 需要 component metrics，但其 claim extraction/checking 仍依赖模型，不应替代可执行 ground truth。

[BIRD](https://arxiv.org/abs/2305.03111) 把 large database content、external knowledge 与 execution accuracy 放在同一个 database-grounded Text-to-SQL benchmark 中，并由 benchmark 提供 question、database、evidence 与 gold SQL。[论文 §3–4](https://arxiv.org/pdf/2305.03111) 它支持两项所有权判断：任务需要的 public external knowledge 属 Benchmark material；SQL 的实际数据库执行属 Environment observation。BIRD 不支持把生产 semantic snapshot 或 retrieval policy归 Benchmark，因为其 evidence 是固定 case 输入，而不是待比较的独立 context implementation。

## 本仓已有证据及其边界

### 已证实的 component-level 作用

[CL-5 原型实验](../../semantic-layer/research/cl5-retrieval-gradient-experiment-report.md) 用 80 个原始 case 和 40 个 alias-dependent case 测 `covered_assets` 的 Recall@20。continuous-blend 从 L0 的 0.388 随 alias coverage 增至 L3 的 0.533；Strategy B 在 L1–L3 固定 0.467，因为它只能 boost 已在 BM25 结果中的候选。该实验还发现 CJK/ASCII tokenizer 影响 47/120 query。它证明 alias、graph candidate introduction 和 tokenizer 可独立改变 retrieval，但实现是原型重写、L2/L3 alias 手工构造、没有真实生产 pipeline，不能作为端到端结论。

[CL-7 生产管线实验](../../semantic-layer/research/cl7-production-pipeline-experiment-report.md) 纠正了原型结论：生产 corpus 中 alias candidate 分数远低于 BM25，被 topK 截断；在 B 与 C 都采用 median-floor 后，两者 120/120 完全相同，L1→L3 enrichment 才带来 Recall@20 0.629→0.804。它证明“算法名称变化”可以是假差异，候选进入与 rank/cap 才是实际机制，也证明实验必须记录 corpus、score scale、topK 和 production code path。

[CL-9](../../semantic-layer/tickets/CL9-batch-enrichment-dws-coverage.md) 将 DWS alt-label coverage 提到 85.2%，初次 enrichment 却使 Recall@20 从 0.744 降到 0.684；删除高频泛化 label 并做冲突消解后才恢复到 0.750。该结果直接否定“coverage 越高越好”，说明 enrichment quality、distinctiveness 与 corpus-level collision 必须进入 component evaluation。

### 已有 end-to-end 数字不能隔离 Context Layer 因果

CL-8/CL-9 曾记录 no-SQL-judge 下 80/80 或 154/168 的高 pass rate；[CL-10 报告](../../semantic-layer/research/cl10-voice-eval-experiment-report.md) 启用 SQL semantic judge 后，168 case 总体降到 66.1%，original 70.0%、alias 80.0%、voice execution 64.7%。但 evaluation map 已裁定旧百分数整体失效：case schema、真实数仓连接、expected SQL 和 event expected 存在多重污染。因此这些结果只能证明“某个历史 protocol 下 Context Layer 与整个 solver 联合表现如何”，不能证明 Context Layer 的独立贡献，更不能拿来比较模型或 Harness。

另一个重要本仓事实是 `contextPrefetched` 曾改变 tool-call emission 与 DELIVERY 评分入口。它说明 model-visible context 不只是知识内容，也会改变 agent trajectory 和下游 evaluator 可见形态。Context projection、Harness 注入时机和 grader parser 必须分别记入 identity，不能把它们合成一个“semantic layer enabled”布尔值。

### 既有前沿文档不是 evaluation 证据

[Context Layer 2026 前沿参考](../../semantic-layer/research/context-layer-2026-frontier.md) 与 [R9 前沿审计](../../semantic-layer/research/r9-context-layer-frontier-audit.md) 对产品定义和架构方向有价值，但其中包含厂商叙述、新闻式 benchmark 和二手材料。它们可以提出候选能力，不能承担 G10 的 measurement validity 依据。本票以一手论文和本仓可复核实验重新建立 evaluation 结论。

## 为什么最终 accuracy/pass rate 不足

同一个最终分数至少混合六个问题：Context source 是否含必要事实；retriever 是否找到了事实；projection 是否保留关系与 provenance；Harness 是否正确注入且 parser 没有 censor trajectory；model 是否使用了 context；grader 是否读懂输出并用正确 ground truth 裁决。论文与本仓各自给出了反例：answer path 缺失与 distractor precision 的价值不同；gold answer 在 subgraph 中也可能拓扑不可达；ontology 与 SQL baseline accuracy 相同但 provenance 明显不同；enrichment coverage 上升可以降低 recall；context 注入会改变 tool-call 形态；judge 开关可把历史“100%”降为 70%。

所以报告必须至少同时给出：

- **Context availability**：必要事实、关系、policy 是否存在于冻结 snapshot。
- **Retrieval/projection**：answer-path recall、relation/composition coverage、context precision、provenance completeness、预算与截断。
- **Context utilization**：模型是否引用、执行或遵循已提供证据，是否越过 evidence 使用 parametric prior。
- **Robustness**：同义改写、关系重述、distractor、错误 edge、stale fact 和预算变化下的稳定性。
- **Outcome**：execution correctness、task pass、cost、latency、finality 与 separation。
- **Attribution**：错误属于 source、retrieval、projection、Harness interface、model、Environment 还是 grader。

## 四层 evaluation 设计

### 第一层：Component evaluation

冻结 Benchmark case、semantic snapshot 和 projection policy，不调用生成模型，分别检查：schema/ontology conformance；concept grounding；relation/path retrieval；compositional retrieval；answer-path recall；context precision；provenance resolution；policy filtering；index completeness；token/latency cost。对每个候选记录 source entity、relation path、score components、accept/reject reason 和最终 projection 位置。OntologyBench、STaRK、KDAF 与本仓 CL-5/CL-7/CL-9 都属于这一层的不同切面。

成功不能只写平均 Recall@20。应按 grounding/relation/composition、alias-dependent、multi-hop、domain、context budget 与 provenance requirement 分层，并报告 missing-relevant、partial-constraint match、generic-label collision、semantic drift 和 unreachable-answer 等 failure class。

### 第二层：Counterfactual evaluation

在相同 Benchmark、case、model revision、Harness、Environment、seed/sampling、grounding instruction、tool schema 和 grader policy 下，只替换 Context profile。最低配对矩阵为：

```text
none
schema/text only
ontology relations without retrieval adaptation
full snapshot + production projection
oracle answer-path projection（只作上界，不作产品成绩）
```

各臂匹配 context token budget；若无法匹配，单独报告 budget-response curve。分别比较 component delta、trajectory delta、execution outcome、provenance 与成本。任何由 gold SQL、hidden expected 或 answer path 生成的 oracle context 必须标成 oracle upper bound，不能并入 production headline。

### 第三层：Perturbation evaluation

每次只改变一个可归因因素：query alias/synonym、relation paraphrase、compositional restructuring、无关实体/边插入、泛化 label collision、错误或 stale edge、provenance 缺失、policy 冲突、context truncation 和 ordering。语义保持型 query perturbation 必须用 source KG/database 或人工复核确认答案不变；数据事实 perturbation 则必须更新 expected，并作为 mutation sensitivity 而非 robustness 运行。

输出按 source resolution → entity linking → candidate retrieval → subgraph/path → projection → model use → execution → grading 分阶段。只报告 end-to-end delta 会重复 KGQA attack 所揭示的归因错误。

### 第四层：End-to-end evaluation

用生产 composition root 运行真实 model、Harness、Context capability 和 Environment，保存 raw emission → parsed action → execution → observation → grader evidence，同时把每次 context request 的 input、candidate set、selected projection、model-visible hash 与 provenance chain 关联到 trajectory。主结果仍由 Benchmark 的 execution/grader policy决定；Context Layer 的价值以 paired outcome delta、错误迁移、traceability、leakage、cost 和 latency共同报告。

随机系统使用预先声明的 paired repeats 和 CI；train、heldout、fresh 各自冻结 snapshot。只有 run identity 全同而 context profile 不同时，差值才可归因于 Context Layer。

## Leakage 与循环评估控制

1. **Private material 不可达**：hidden expected、gold SQL、solution、private tests 和 grader rationale 只能由 Benchmark private grading入口读取；Context builder、enrichment、retriever、ranker和 Harness dependency graph 均不可导入。
2. **先冻结后揭盲**：semantic snapshot、ontology、alias、retriever/ranker、projection policy 与 enrichment model/prompt 在 heldout/fresh case 揭示前冻结。运行中 judge feedback 不得写回当前 cohort 的 Context Layer。
3. **反馈跨 cohort 生效**：若系统允许动态 ontology/enrichment，写回必须形成新 snapshot id，只能在后续预声明 cohort 评估；当前 run 记录 adaptation event 并与后续 run 分开。
4. **来源 lineage 审计**：每个 semantic assertion 记录 authoritative source、抽取/人工编辑过程、时间范围与 builder identity；对 case question、expected、reference SQL、judge rationale 做 exact/near-duplicate 和派生链检查。
5. **关系泄漏审计**：不仅查相同 query-document pair，还查 reciprocal edge、同 target、同 answer path、由 gold query 反推的 alias，以及跨 task 共享 association。OntologyBench 的 transductive 限制应显式成为 split label，而非埋在说明中。
6. **双盲 grading**：Context Layer 只产生 public/model-visible projection 和 run-time provenance；grader 在 run 完成后读取 private material。grader evidence 不得回流 retriever，也不得成为同批 enrichment training signal。
7. **负向审计必须能失败**：加入故意的 hidden-field import、wrong provenance id、cross-entity evidence、stale edge、missing reject reason 和 contaminated alias fixture，证明 gate 会拒绝，而不是只报告成功率。
8. **声明被测对象**：若 context 是 benchmark 专门构造或用 gold answer path 生成，结果命名为 oracle/context-assisted upper bound；若评测的是冻结生产 snapshot，则发布完整 snapshot identity。两者不得混为“model score”。

## Run identity 新增字段

R10b 已要求固定 Benchmark、Adapter、Harness、model/interface stack、Environment 与 grader。R10c 还要求加入一个独立的 `contextIdentity`，至少包含：

- semantic snapshot id、content digest、source revisions、effective time 与 tenant/domain scope；
- ontology/schema version、relation set digest、reasoner/rule profile、SHACL 或其他 validation profile；
- terminology/alias/enrichment digest，以及 builder model、prompt、source corpus 和人工批准记录；
- retriever、embedding model、index build digest、ranker/reranker、candidate cap、topK 与 score normalization；
- projection policy id/version、allowed relation/path、hop limit、filter/policy profile、serialization、ordering、context budget 与 truncation；
- grounding instruction、projection consumer（model/tool/critic/grader）和注入时机；
- 每次请求的 selected item ids、relation paths、provenance ids、model-visible context hash、token count 与 cache/memory snapshot；
- context preflight、conformance、leakage audit 和 finality 状态。

`contextEnabled: true`、一个 ontology filename 或 Harness commit 都不足以重建结果。相同 Harness 配不同 semantic snapshot 或 projection policy是不同 solver identity；相同 snapshot 配不同 injection/serialization 也是不同 run identity。

## 给 G10、T9、T12 的明确更新

### G10 必须裁定

- [ ] 采用本文结论：Context Layer 是独立版本化 capability，不是第四 peer；composition root 显式注入 `ContextProvider`/`ContextProjection`，Benchmark、Harness、Environment 都不得私自实现第二份 retrieval/projection。
- [ ] Benchmark 拥有 `ContextRequirement`、public task evidence、oracle/counterfactual fixture 声明与 private grading material；它不拥有生产 semantic snapshot 或 retriever policy。
- [ ] Harness 只拥有 context 请求时机、consumer 与对话注入；Context capability 返回 typed projection 和 evidence。Harness 不修改 semantic facts，不把 hidden material传入请求。
- [ ] Environment 拥有权威数据库/文件/服务状态和执行 observation；Context source adapter 可读取它的 public metadata/data snapshot，但 ontology、ranker和 projection policy 仍由 Context capability 拥有。
- [ ] Shared eval protocol 新增 `contextIdentity`、context request/projection evidence、component failure discriminant，以及 `source_missing | retrieval_miss | projection_loss | context_ignored | context_conflict | context_invalid` 等可扩展分类。
- [ ] 规定 oracle projection、production projection 与 no-context counterfactual 的命名和聚合隔离；任何 hidden-derived context 都不得进入产品 headline。
- [ ] Context Layer 的动态写回形成新 snapshot，只对后续 cohort 生效；heldout/fresh 的 freeze 顺序与 Goodhart audit 共用。

### T9 实施验收

T9 尚未建立本地 ticket 文件；父 session 创建或重定后，应加入：

- [ ] 实现唯一的 context protocol 与 projection evidence schema；Benchmark adapter 只能声明 requirement/fixture，Harness adapter 只能消费 projection，Environment adapter 只能提供权威 source observation。
- [ ] 为同一 case 支持 no-context、text/schema-only、relations-only、production 和 oracle profile 的 paired execution，且除 `contextIdentity` 外其余 run identity 可机械比较。
- [ ] component fixture 覆盖 grounding、relation、composition、provenance、policy、预算与 reject reason；production path 测试避免 CL-5 原型与 CL-7 实现不一致。
- [ ] 加入 semantic-preserving perturbation、wrong/stale edge mutation、generic alias collision、cross-entity leakage、hidden material import 和 grader-feedback writeback 的拒绝测试。
- [ ] 持久化每次 context request 的 candidates、selected items、relation paths、scores、provenance、model-visible hash 和 token count，并关联 raw→grader 五阶段 evidence。
- [ ] 重建 baseline，不引用已宣布失效的历史 pass rate；Context attribution 使用 paired repeats、预声明 slice 与 CI。

### T12 包级重定

- [ ] 包重组不得把 Context implementation 并入通用 Harness runtime。共享包只承载协议、identity 和 evidence types；semantic-layer provider、retriever/ranker 与 source adapters 保持可独立版本化。
- [ ] 禁止通过 re-export 让 Harness 直接读取 ontology internals 或 Benchmark private material；静态依赖检查覆盖这两种越权。
- [ ] CLI 与 Cordis host 共享同一 composition path，不能一个走真实 Context projection、另一个内联 schema/prompt。
- [ ] 合包前后用相同 frozen `contextIdentity` 跑 component fixture 与 paired end-to-end parity；import 编译通过不等于 context measurement parity。

## 分流到 semantic-layer evaluation

不要重开已经完成的 CL-5、CL-7、CL-9；它们作为历史 component evidence 和失败案例保留。建议由 semantic-layer map 新开以下决策/实验票：

1. **Context evaluation protocol**：把 grounding/relation/composition/provenance 指标、projection trace 和 production-path fixture统一为一个可被 evaluation composition root 调用的协议；吸收 CL-5/CL-7 的 fidelity caveat。
2. **Context counterfactual matrix**：在修复后的 execution grader 上运行 none / schema-only / relations-only / production / oracle 五臂 paired experiment，替代历史单臂 pass rate。
3. **Context perturbation and leakage audit**：覆盖 query synonym/restructure、wrong/stale edge、alias collision、reciprocal-relation leakage、hidden-derived enrichment 与 cross-entity evidence。
4. **Adaptive ontology holdout policy**：定义 enrichment feedback 的 snapshot lifecycle、train/heldout/fresh freeze 与跨 cohort 生效规则；OaK 式 judge refinement只能在这个政策下评估。
5. **Projection budget and grounding controls**：路由给现有 [R10 — token/attention/cache 优化](../../semantic-layer/tickets/R10-token-attention-cache-optimization.md) 与 [R11 — eval prompt switch 实验](../../semantic-layer/tickets/R11-eval-prompt-switch-experiment.md)，分别处理 budget/serialization 和 matched grounding instruction；两票不得用最终 pass rate替代 component attribution。

## 最终判断

截至 2026-09-10，一手研究已经足以回答“Context Layer 在 evaluation 中有没有独立作用”：有，而且作用至少覆盖必要事实可达性、关系/组合约束、provenance、结构验证、policy enforcement、robustness 与 auditability；这些维度可能在最终 accuracy 不变时仍显著改善，也可能在 coverage 上升时恶化。研究也足以否定“把 ontology 加进 prompt 后看 pass rate”的评测方法。

架构上最稳妥的结论不是 B/H/E/C 四等分，而是 **B/H/E 三种评测角色 + 一个独立版本化 Context capability**。Benchmark 声明需要什么并守住 private ground truth；Context capability 决定从哪个冻结语义快照、按什么 policy 投射；Harness 决定何时让模型看到该投影；Environment提供权威世界状态并执行动作；Grader 在结束后使用私有证据裁决。只有这五条责任链分别留痕，Context 改进才不会被误报为 model、Harness 或 benchmark 改进。

## 来源缺口

- OaK PDF 未给官方代码、数据或逐 run artifact，judge-driven refinement 和 ablation 只能按论文陈述核验。
- Answer Path PDF 给出的作者代码地址不完整；论文使用 oracle subgraph、没有真实 retriever，不能外推生产 retrieval。
- OntologyBench 与 OntoKG-EQ 有公开仓库；本次只核验远端 HEAD 和论文声明，未执行代码或重算表格。
- Auditable by Construction 给出 Zenodo DOI，但 PDF 未给源码仓库；本次未下载归档。
- Query-Side Attacks 的匿名 artifact URL 本次不能作为 Git remote 解析，未固定 commit。
- STaRK、RAGChecker 与 BIRD 只用于成熟的 evaluation decomposition 锚点；它们不覆盖 agent Environment finality、跨 run isolation 或动态 ontology feedback。
- 本仓旧 end-to-end 数字受已记录的 case、judge、真实执行和 protocol 污染；本票不把它们恢复为有效 baseline。
