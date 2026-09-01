# GA-GRILL2 — i18n / prompt-templating 架构（先 grilling 再开票）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: **Grilled**（2026-09-01）→ 产出 Kind 2 实施票 GA-I18N-1~5 + 独立优化票 GA-I18N-R1
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

### Kind 1（Phase 2 — 部分 grilled，实验待跑）

| 票号 | 标题 | 备注 |
|------|------|------|
| [GA-EXP2](GA-EXP2-prompt-language-experiment.md) | Prompt 语言实验：中文 vs 英文 vs 混合 | 5 variant A/B/C/D/E 对比，K11-v2 168 case，数据驱动决策 |

**已达成的 Kind 1 决策**：
- 域身份（persona / nlsqlOpener / expansionPrompt / fewShots）由 [GA-GT5](GA-GT5-domain-injection-seam.md) `ctx.domain` 承接，不在 Kind 1 范围
- prompt-template registry（原始方案 A）否决——业界无先例，过度工程
- sql_semantic_judge.ts judge prompt 需改英文——2026 研究（arxiv 2607.14480）证实 LLM-as-judge 存在结构性语言偏差，GA-EXP2 Variant E 量化后执行
- 用户可见 delivery 标记（【发现】/【注意】）随项目级 i18n 语言切换

**待 GA-EXP2 数据决定**：
- prompt.ts 结构性内容（TOOL_CATALOG / SOP / 八规则 / 诚实拒绝）保留中文还是改英文
- "Respond in the user's language" 指令是否影响 SQL 生成质量

**Key files**: packages/data/nl2sql-engine/src/{prompt.ts:84,conventions.ts:33,granularity.ts:13,metric-engine.ts:97,bm25-linking.ts:72}; packages/data/tool-search-data-sources/src/{expand-query.ts:11,index.ts:303}; packages/eval/eval-runner/src/sql_semantic_judge.ts:70; packages/data/phase-gate/src/domain.ts:47; packages/data/semantic-layer/src/{enrichment.ts:118,types.ts:283}
