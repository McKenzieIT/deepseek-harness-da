# Grilling: i18n / prompt-templating 架构

## 决策待压力测试
如何让 prompt/judge/parser/tokenizer 脱离"中文+游戏域"硬编码、支持 zh/en/ja？候选：
- **A**. 建 prompt-template registry（locale×domain）+ locale bundle + `{{persona}}/{{rules}}/{{tool_catalog}}` 插值（mirrors conventions seam）。
- **B**. 直接把每个 prompt 抽到 config 文件（YAML/TS），部署覆盖，无 registry/locale bundle。
- **C**. 词库（trend/time-param/marker）用 locale-keyed lexicon map vs LLM intent 分类；marker（`【拆解】`/`【未完成】`）prompt 与 parser 共享真值源。

## 背景（根因）
全仓无 i18n/templating 层。`packages/data/nl2sql-engine/src/prompt.ts:84` 生成 prompt 全中文+游戏域（persona/SOP/8 rules/tool catalog），唯一外部化的是 dialect slice（conventions）。`expand-query.ts:11` `EXPANSION_SYSTEM_PROMPT` 中文+游戏 few-shot（ARPPU/PVP/钻石/大R），默认启用。`packages/eval/eval-runner/src/sql_semantic_judge.ts:70` judge prompt 中文，锚 K11 `总量/趋势/分布/占比`。`granularity.ts:13` `TREND_PATTERN` 纯中文；`metric-engine.ts:97` `extractTimeParams` 只认中文日期词。`packages/data/phase-gate/src/domain.ts:47` `DECOMPOSITION_MARKER='【拆解】'`、`INCOMPLETE_MARKER='【未完成】'`、`ROUTE_MARKER_REGEX` 只配 CJK 全角括号——**prompt 教的 token 与 parser 无共享真值源**（本地化只改一边就静默坏 decline 路由）。`bm25-linking.ts:72` tokenize 只匹配 CJK Unified Ideographs，丢日文 hiragana/katakana；`tool-search-data-sources/index.ts:303` cjkRe 同。`enrichment.ts:118` `mergeRefs` 用中文前缀 `'确定性'` 判派生源。`types.ts:283` freshness enum `['静态参考','T+1','']` 拒英文。

## 影响面 / 约束
- 最大 G 票，影响几乎所有 prompt-bearing 包；与 GA-GRILL1（persona）共享 prompt 文本、GA-GRILL3（freshness 中文 enum）耦合。
- CL4（kana）、CL5（确定性前缀）、CL9（conventions 中文段头）、CL10/11/12（中文 marker/gloss）皆 fold 入此。
- additive-only 倾向，但 prompt 外部化可能需新包/registry。

## 任务（对抗式 grill，不和稀泥）
逼问：A registry 是否过度工程（部署只有 zh 时 registry 是负担）？B config-per-prompt 是否碎片化（28 个 prompt 28 个 config？一致性谁保证）？C LLM intent 分类是否引入非确定性（trend 判错→选错表）？marker 共享真值源——是 locale bundle 还是结构化字段（`definition.derivation_source` 而非中文前缀）？BM25 tokenizer 加 kana 够还是该上形态学（nodejieba/kuromoji）？哪些假设最危险（"locale 三套够"？"prompt 与 parser 必须共享 config"）？被忽略的第三选项——**先把"中文"从逻辑层赶到呈现层**：marker→enum、derivation→source 字段、freshness→enum token、trend/time-param→结构化字段或 LLM 判，让中文只出现在面向用户的文案里？逼出可执行方向。

## 可读文件（mcp__local__read_file/grep，路径 /Users/mckenzie/workspace/deepseek-harness-da）
packages/data/nl2sql-engine/src/{prompt.ts,conventions.ts,granularity.ts,metric-engine.ts,bm25-linking.ts}; packages/data/tool-search-data-sources/src/{expand-query.ts,index.ts}; packages/eval/eval-runner/src/sql_semantic_judge.ts; packages/data/phase-gate/src/domain.ts; packages/data/semantic-layer/src/{enrichment.ts,types.ts}
