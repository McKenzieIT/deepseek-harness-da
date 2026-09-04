# GA-GRILL2 — i18n / prompt-templating 架构（先 grilling 再开票）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: **Grilled**（2026-09-01 Kind 2；**2026-09-03 Kind 1**）→ 产出 Kind 2 实施票 GA-I18N-1~5 + 独立优化票 GA-I18N-R1；**Kind 1 实施方向 won't-do，研究诉求转 [GA-EXP5](GA-EXP5-language-correlation.md)**
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) — C3+H7 / arch G2 · **critical**
**Grilling prompt**: [research/grill-2-i18n.md](../../research/grill-2-i18n.md)
**Scope narrowing**: 只支持中英双语（zh/en），不含日文。

**Question**: 如何让 prompt/judge/parser/tokenizer 脱离"中文+游戏域"硬编码、支持 zh/en？

**Background**: 全仓无 i18n seam。prompt.ts:84 生成 prompt 全中文+游戏域；expand-query.ts:11 中文+游戏 few-shot；sql_semantic_judge.ts:70 中文 judge；granularity.ts:13 TREND_PATTERN 纯中文；metric-engine.ts:97 extractTimeParams 只认中文日期词；domain.ts:47 marker 【拆解】/【未完成】+ ROUTE_MARKER_REGEX 只配 CJK 全角括号（prompt 与 parser 无共享真值源→本地化只改一边就静默坏 decline 路由）；bm25-linking.ts:72 丢日文 kana（中英双语下无需改）；enrichment.ts:118 mergeRefs 用 '确定性' 前缀；types.ts:283 freshness enum 拒英文。

**Cross-ref from GA-GRILL3**（2026-09-01）：freshness enum locale-neutral token 决策由本 grilling 负责（GA-GRILL3 D5 确认 freshness 推断由 LLM enrichment 完成，但 token 命名/i18n 归属本票）。GA-GRILL3 grilling 的 5 项决策见 [GA-GRILL3](GA-GRILL3-tabledef-schema.md)；LLM 推断实验见 [GA-EXP1](GA-EXP1-llm-driven-inference-experiment.md)。

## 架构决策：两阶段分层

**Phase 1（Kind 2 — 逻辑层去中文）**：先把中文从逻辑控制路径剥离——把承载 if/regex/enum 判断的中文字符串替换为语言中立的结构化字段/枚举/多语言词表。这些改动不需要 template registry 或 locale bundle，是纯粹的结构性重构。

**Phase 2（Kind 1 — prompt 模板化）**：在 Phase 1 之上，外部化 LLM-facing prompt 文本（persona/SOP/rules/tool catalog/judge prompt/delivery 标记）。Kind 1 的 A/B/C 方案选择推迟到 Phase 2 grilling。

**理由**：Kind 2 是 bug 工厂——改 prompt 措辞或加语言就静默打断 parser/validator。Kind 1 只影响 LLM 回复质量，风险低。先解决高风险问题。

## Grilling 决策记录（2026-09-01）

| ID | 问题 | 决策 | 理由 |
|---|------|------|------|
| D1 | enrichment.ts `startsWith('确定性')` 控制 derivation 覆盖 | `DimensionRefSchema` 加 `origin: z.enum(['deterministic','llm','manual']).optional()`，`mergeRefs` 基于 `origin` 判断覆盖优先级 | 结构化字段一劳永逸，derivation 退化为纯文案；additive optional 零迁移；字段名 `origin` 比 `derivation_source` 更通用，避免和 `derivation` 文案字段混淆 → **[GA-I18N-1](GA-I18N-1-origin-field.md)** |
| D2 | types.ts freshness enum `['静态参考','T+1','']` | Q+P 混合：enum 改 `'static_reference'\|'T+1'\|''`，`.preprocess()` 映射旧值 `'静态参考'`→`'static_reference'` | 仓库内仅 1 个 test fixture 含 `静态参考`；运行时 2 处消费方纯透传无逻辑分支；preprocess 兼容生产环境旧 YAML → **[GA-I18N-2](GA-I18N-2-freshness-enum.md)** |
| D3 | granularity.ts TREND_PATTERN 纯中文正则 | 加英文正则分支（多语言词表）；recall 提升（突破 85% 天花板）另开票 | K11-v2 实测：当前 zh recall=85%/precision=95%；影响为 soft（_di 加权+rule 9 注入，非硬路由）；加 en 分支平移同水位 → **[GA-I18N-3](GA-I18N-3-trend-pattern-bilingual.md)**；recall 提升 → **[GA-I18N-R1](GA-I18N-R1-trend-recall-improvement.md)** |
| D4 | metric-engine.ts extractTimeParams 纯中文日期词 | 同 D3 模式：加英文关键词→handler 映射 | 结构同构，keyword→date-computation 映射扩展英文分支即可 → **[GA-I18N-4](GA-I18N-4-time-params-bilingual.md)** |
| D5 | domain.ts 内部控制标记中文内容 | 内部 token 统一英文内容+全角括号（`【decompose】`/`【incomplete】`）+呈现层 strip；用户可见标记（【发现】/【注意】）归 Kind 1 项目级 i18n | 标记是 opaque token 非自然语言；英文内容防误翻译+和 ROUTE_MARKER 对齐；strip 层防泄漏 → **[GA-I18N-5](GA-I18N-5-marker-english-strip.md)** |
| D6 | BM25 tokenizer CJK 范围缺日文假名 | 中英双语下当前范围够用，不改 | `[一-鿿]` 覆盖中文汉字，ASCII regex 覆盖英文——中英双语无盲区 |

## 产出票

### Kind 2 实施票（Phase 1）

| 票号 | 标题 | 影响包 | 依赖 |
|------|------|--------|------|
| [GA-I18N-1](GA-I18N-1-origin-field.md) | DimensionRef `origin` 字段 | semantic-layer, phase-gate(enrichment 消费方) | 无 |
| [GA-I18N-2](GA-I18N-2-freshness-enum.md) | freshness enum locale-neutral 迁移 | semantic-layer, tool-load-table-definition | 无 |
| [GA-I18N-3](GA-I18N-3-trend-pattern-bilingual.md) | TREND_PATTERN 中英双语 | nl2sql-engine | 无 |
| [GA-I18N-4](GA-I18N-4-time-params-bilingual.md) | extractTimeParams 中英双语 | nl2sql-engine | 无 |
| [GA-I18N-5](GA-I18N-5-marker-english-strip.md) | 内部控制标记英文化 + strip | phase-gate | 无 |

### 独立优化票

| 票号 | 标题 | 备注 |
|------|------|------|
| [GA-I18N-R1](GA-I18N-R1-trend-recall-improvement.md) | trend 检测 recall 提升（突破 85%） | 需探索 LLM intent 分类或 UNDERSTANDING 结构化输出 |

### Kind 1（Phase 2）— **实施方向已关闭 won't-do（2026-09-03 grilled）**

见下方「Kind 1 重新评估」章。研究诉求由 [GA-EXP5](GA-EXP5-language-correlation.md) 承接。

| 票号 | 标题 | 备注 |
|------|------|------|
| [GA-EXP2](GA-EXP2-prompt-language-experiment.md) | Prompt 语言实验：中文 vs 英文 vs 混合 | 5 variant A/B/C/D/E 对比，K11-v2 168 case，数据驱动决策 |

**已达成的 Kind 1 决策**：
- 域身份（persona / nlsqlOpener / expansionPrompt / fewShots）由 [GA-GT5](GA-GT5-domain-injection-seam.md) `ctx.domain` 承接，不在 Kind 1 范围
- prompt-template registry（原始方案 A）否决——业界无先例，过度工程
- sql_semantic_judge.ts judge prompt 需改英文——2026 研究（arxiv 2607.14480）证实 LLM-as-judge 存在结构性语言偏差，GA-EXP2 Variant E 量化后执行
- 用户可见 delivery 标记（【发现】/【注意】）随项目级 i18n 语言切换

**GA-EXP2 数据已出（2026-09-02）— Kind 1 语言决策锁定**：
- prompt.ts 结构性内容（TOOL_CATALOG / SOP / 八规则 / 诚实拒绝）→ **保留中文**（英文 prompt 灾难性退化 -41.1%，72.0%→31.0%）
- "Respond in the user's language" → **不测**（B 已灾难性退化，C variant 无边际价值）
- judge prompt 语言 → **无所谓**（E vs A +0.0%，judge 语言无系统性偏差）
- ~~**Kind 1 英文化方向关闭**~~ → ~~**GA-EXP4 重新打开**（qwen3.7-max EN 退化仅 -3.0%…）~~ → **2026-09-03 更正**：该 -3.0% **不显著**（McNemar p=0.332），pass^k 下为 +1.2pp（p=0.875）；正确结论是**零结果**（无可检出语言效应，n=168 的 MDE≈5.4–10.1pp）。零结果仍支持「英文可行」，但 Kind 1 **实施方向已 won't-do**（见下方「Kind 1 重新评估」K1-D1）；研究诉求转 [GA-EXP5](GA-EXP5-language-correlation.md)。EXP2 的 -41.1% 是 qwen-plus 能力问题**这一条依然稳健显著**。域身份注入已归 GA-GT5 `ctx.domain`
- 退化与前沿文献矛盾 → [GA-EXP3](GA-EXP3-en-prompt-degradation-root-cause.md) 根因分析 → [GA-EXP4](GA-EXP4-qwen37max-en-prompt-crossval.md) 交叉验证（qwen-plus 特定，模型升级后 Kind 1 可行）
- 详见 [EXP2 实验报告](../../research/exp2-results-report.md)

**Key files**: packages/data/nl2sql-engine/src/{prompt.ts:84,conventions.ts:33,granularity.ts:13,metric-engine.ts:97,bm25-linking.ts:72}; packages/data/tool-search-data-sources/src/{expand-query.ts:11,index.ts:303}; packages/eval/eval-runner/src/sql_semantic_judge.ts:70; packages/data/phase-gate/src/domain.ts:47; packages/data/semantic-layer/src/{enrichment.ts:118,types.ts:283}

---

## Kind 1 重新评估（2026-09-03 grilled）→ **实施方向 won't-do；研究诉求转 GA-EXP5**

**证据材料**: [kind1-grilling-brief.md](../../research/kind1-grilling-brief.md) · [model1-baseline-analysis.md](../../research/model1-baseline-analysis.md)

### 触发与实际驱动

GA-EXP4 以「qwen3.7-max 下英文退化仅 -3.0%」重新打开 Kind 1。grilling 中澄清：**真实驱动是研究性的**——验证 prompt / 语义层 / harness 之间的语言相关性、评估模型对语言的效果，**不是**交付一个 i18n 功能。这个澄清决定了产出形式。

### 决策

| ID | 决策 | 理由 |
|---|---|---|
| K1-D1 | **Kind 1 作为「把 prompt 改英文」的实施方向 → won't-do** | ① 原始价值已由 Kind 2 兑现（逻辑层去中文是 bug 工厂，已解）；剩余为纯可读性。② **无运行时 i18n seam**——仓库唯一的 i18n 机制是 `*.i18n.yaml` + `scripts/verify-translation-pairing.ts`，那是**文档双语对照的 git blob 哈希记录**，prompt 插不进去；而 template registry 方案本票早已否决为过度工程。故现实的 Kind 1 = 中文字面量换英文字面量，不增加 seam、不支持 locale 切换。③ Destination 是内网、per-game 隔离的中文游戏取数 agent，**无非中文部署诉求**（已确认）。④ 「趁便宜先做」不成立——活代码 `prompt.ts` 共 **782 个汉字**（913 含 CJK 标点，约一屏散文），将来真需要时仍是一天的活，现在做不省未来的钱，只是提前承担质量风险。 |
| K1-D2 | **研究诉求转 [GA-EXP5](GA-EXP5-language-correlation.md)**（2×2×2 三轴全因子） | 已测的语言变量只占模型所见中文的 **0.2%**（`prompt.ts` 782 汉字 + conventions 35 vs 语义层 **440,988** 汉字）。GA-EXP3 的「跨语言干扰」归因**从无对照组**——动态内容语言从未被变过。 |
| K1-D3 | **窄 scope（只英文化 boilerplate）否决** | 纯 boilerplate 占比很小（原估 13.6%，该比例基于一个已被证伪的分母，未重算；结论不依赖精确值），且中文核心规则**按名字引用 boilerplate 标题**——`见方言规范` 出现在 `prompt.ts:54`、`:56`（`renderCoreRules` 的规则 1/3 内）与 `:145`（日期块），三处均指向 `conventions.ts:25` 发出的 `# 方言规范（…）`。翻标题会让中文规则体里的指针悬空，而「保留中文核心规则」又禁止修它。另：`TOOL_CATALOG` 并非 boilerplate，它内嵌规范性约束（`prompt.ts:119` 的 `不得硬编码`、`:91` 的 `仅 SELECT，必带分区过滤`（`TOOL_CATALOG` 定义在 `:88`））。且**代码里没有可供拆分的结构**——prompt 是单个模板字符串，「boilerplate vs 核心规则」只存在于阅读者脑中，无法用测试固定。 |
| K1-D4 | **conventions 是否永久英文化 → 暂不决定**，作为 GA-EXP5 轴 ③ | conventions i18n 是 **248 个汉字跨三个包**且**随每个新引擎适配器增长**（`nl2sql-engine/src/conventions.ts` 35 结构 + `query-maxcompute/conventions.yaml` 83 + `query-postgres/src/conventions.ts` 130）。GA-GT2 刚把 conventions 划归引擎所有，英文化会新增「每个适配器作者须写英文」的义务。测完再定。 |
| K1-D5 | **本票原「Kind 2 风险高、Kind 1 风险低」的判断是反的**，记录以免复用 | 本票原文：「Kind 2 是 bug 工厂→先做；Kind 1 只影响 LLM 回复质量，**风险低**」。按「静默损坏」看无误，但按**可测量的质量风险**看完全颠倒——Kind 1 是**唯一能动 pass rate 的那半**，EXP2 证明它能动 **-41pp**。两阶段分层的执行顺序仍属正确（先解静默损坏），但风险描述须修正。 |

### 一并更正的事实（原 Kind 1 重开依据被削弱但结论不变）

GA-EXP4 的 `-3.0%` **不显著**（McNemar p=0.332）；pass^k 下为 +1.2pp（p=0.875）；序数 Wilcoxon p=0.749；flaky 差异 p=0.427。n=168 的 **MDE ≈ 5.4–10.1pp**。

**正确结论是零结果**——qwen3.7-max 上 prompt 语言无可检出影响。而零结果**比 `-3.0%` 更有力地支持「Kind 1 技术上可行」**；Kind 1 关闭是**价值判断**（无诉求、无 seam、收益不可度量），**不是技术不可行**。若将来出现真实非中文部署诉求，重开的技术门槛已知很低（`prompt.ts` 782 个汉字，且约 82% 的英文译文已存在于 `exp2-prompts-en.ts`，但需修其三个缺陷，见 GA-EXP5）。

### 顺带产出

- `buildEvalPrompt`（`prompt.ts:180`）是**生产死代码**（`engine.ts:35` 只导入 `buildPrompt`；引用全在测试与 barrel export）→ 折进 [GA-CL-batch](GA-CL-batch.md) CL19，但**已按 code review 下调为低价值**：原写的「含 27% 中文」「复制了第二份八规则、无测试保证一致」两条经复核**均证伪**——实测占比约 10.9%，且 `renderCoreRules` 是 `buildPrompt`/`buildEvalPrompt` 共享的同一函数（`prompt.ts:53`，nl2sql-4 已 dedup），`tests/prompt.spec.ts` 还逐字节 pin 住两者输出
- eval 功效不足是横切问题 → [GA-EVAL-EXPAND](GA-EVAL-EXPAND-case-set-power.md)
