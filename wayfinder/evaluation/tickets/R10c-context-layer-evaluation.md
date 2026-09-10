# R10c — Semantic/ontology context layer 在 evaluation 中的作用与位置

**Type**: research  ·  **Status**: **Resolved (2026-09-10)**
**Assignee**: McKenzieIT  ·  **Claimed**: 2026-09-10
**产物**: [`../research/context-layer-evaluation-role.md`](../research/context-layer-evaluation-role.md)
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: 无
**Blocks**: [G10 — Harness B/H/E 拆分](G10-harness-bhe-split.md)
**Mode**: AFK
**Branch**: `research/R10c-context-layer-evaluation`

## Question

截至 2026-09-10，一手研究如何测量 semantic layer、ontology、knowledge graph 与更广义 context layer 对 agent evaluation 的作用？在 G10 的 Benchmark / Harness / Environment 分解中，context layer 应由谁拥有、怎样注入、怎样版本化，以及怎样避免把 context 改进误报为 model 或 Harness 改进？

## 必须回答

- 现有研究分别怎样测量 context retrieval、ontology reasoning、grounding、provenance 与 downstream task outcome。
- 为什么只有最终 accuracy/pass rate 无法判断 semantic/context layer 是否有效。
- Context source、context projection/retrieval policy、model-visible context 与 grader evidence 分别由谁拥有。
- Semantic snapshot、ontology/schema、retriever/ranker、projection policy 和 context budget 怎样进入 run identity。
- 怎样通过 component、counterfactual、perturbation 与 end-to-end 四层实验隔离 context layer 的贡献。
- 怎样防止 ontology、knowledge graph、retrieval corpus 或 enrichment feedback 泄漏 hidden ground truth，形成循环评估。
- 对 G10、T9/T12 以及 semantic-layer evaluation 后续票给出明确验收与分流建议。

## 待认读一手来源

- Toward Effective and Reliable LLM Agents via Dynamic Ontology (`2608.22974`)
- The Answer Path and the Grounding Instruction in LLM Question Answering over Knowledge Graphs (`2609.10237`)
- OntologyBench (`2609.08174`)
- OntoKG-EQ (`2609.08869`)
- Auditable by Construction (`2608.20661`)
- Query-Side Attacks on GNN-Based KGQA (`2608.25922`)
- 与本仓既有 `wayfinder/semantic-layer/` 实验和 context-layer 研究交叉核对

## 产出

`../research/context-layer-evaluation-role.md`。严格区分来源事实、本仓已有证据和架构推论，并明确 context layer 在 Benchmark / Harness / Environment 之间的位置。

## Resolution comment (2026-09-10)

认读产物见 [`../research/context-layer-evaluation-role.md`](../research/context-layer-evaluation-role.md)。一手研究已足以确认 Context Layer 对 evaluation 有独立作用，但作用不只表现为最终 pass rate：它分别影响必要事实与 answer path 的可达性、relation/composition constraint、provenance、结构验证、policy enforcement、robustness 与 auditability。Ontology 可能在 accuracy 不变时提高 traceability，也可能因 alias collision、错误 edge 或 candidate omission 在 coverage 增长时降低真实 recall。

架构裁定是 **B/H/E 三种评测角色 + 一个独立版本化 Context capability**，而不是 B/H/E/C 四个平级执行角色。Context capability 拥有 semantic snapshot、ontology、relations、terminology、provenance、retriever/ranker 与 projection policy；Benchmark 拥有 `ContextRequirement`、counterfactual/oracle 声明和 private ground truth；Harness 只拥有 context 请求时机与模型注入；Environment 拥有权威世界状态；Grader 在运行后读取私有材料。

Context 作为被测对象、运行输入和测量辅助时必须分开。Shared eval protocol 新增 `contextIdentity` 与 request/projection evidence；评测分 component、counterfactual、perturbation、end-to-end 四层。任何用 gold SQL、hidden expected 或 answer path 构造的 context 都只能作为 oracle upper bound，不能进入 production headline。动态 enrichment 写回形成新 snapshot，只对后续预声明 cohort 生效。
