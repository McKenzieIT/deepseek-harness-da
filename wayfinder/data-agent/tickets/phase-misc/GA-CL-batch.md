# GA-CL-batch — 18 条 CL 清理（通用性审计）

**Type**: cleanup (batch)  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [tickets doc](../../research/generalization-audit-tickets-2026-08-31.md) §C — 15 medium + 3 low

批量 CL 清理（按文件分组，建议合并到相关 G 票分支一起做）：

| # | 文件:line | 问题 | 修复 |
|---|---|---|---|
| CL1 | semantic-layer/src/index.ts:339 | getRelationGraph 单条悬挂引用即抛 | skip+warn；收集到 health-check |
| CL2 | eval-cli/src/compare.ts:76 | classifyCase k11v2 子串分桶 | 从 case dimensions 取 |
| CL3 | eval/src/text_sim.ts:23 | char-trigram 阈值 0.35 不可注入 | 可注入 opts + 英文 word-level 预设 |
| CL4 | nl2sql-engine/src/bm25-linking.ts:72; tool-search-data-sources/src/index.ts:303 | tokenizer 丢日文 kana | CJK regex 加 hiragana/katakana |
| CL5 | semantic-layer/src/enrichment.ts:118 | mergeRefs '确定性' 前缀判定 | 加结构化 source 字段 |
| CL6 | phase-gate/src/index.ts:70 | scopeId 默认 'game-1' | 默认中性或必填 |
| ~~CL7~~ | ~~apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:24~~ | ~~B preset 默认 'per-game' persona~~ | ~~→ absorbed by [GA-GT5](GA-GT5-domain-injection-seam.md) (ctx.domain seam)~~ |
| CL8 | llm-wiring-plugin.ts:36; expand-query.ts:27; eval-cli/main.ts:65 | LLM 默认 Qwen/DashScope 无 fail-loud | 集中部署 config + fail-loud |
| CL9 | nl2sql-engine/src/conventions.ts:33 | renderConventionsPrompt 中文段头 | 段头抽 locale bundle |
| CL10 | tool-suggest-followups/src/index.ts:63 | '≤8 中文字符' 约束 | locale-neutral '≤~20 chars' |
| CL11 | phase-gate/src/phase-gate.ts:118 | INTERPRETATION 中文 marker | locale-configurable 或中性符号 |
| CL12 | tool-load-event-definition/src/index.ts:354 | '埋点' gloss | 'instrumented event' |
| CL13 | eval/eval/cases/generate-k11.mjs | K11-only case 生成器 | 文档化 + scope-agnostic 模板 |
| CL14 | semantic-layer/src/snapshot.ts:173 | snapshot 缓存无界 | LRU / scope 移除清理 |
| CL15 | eval-cli/src/context.ts:221,375 | 重复中文扩展 prompt + [粒度] | 引用单一源 + localize |
| CL16 | nl2sql-engine/src/engine.ts:109; stand-in-odps.ts | OdpsExecutor 命名 | 重命名 SqlExecutor |
| CL17 | nl2sql-engine/src/index.ts:29; prompt.ts:18 | EngineConventions leaky import | 移入抽象 dsh-query 包 |
| CL18 | client/ui-semantic-layer/src/client/hooks/useLayoutMode.ts:23 | B→A autoFlipThreshold=3 不可配 | 暴露 host config |

**关联**: CL4/CL5/CL9/CL10/CL11/CL12 fold 入 GA-GRILL2；CL16/CL17 fold 入 GA-GT2；CL2/CL13 fold 入 GA-GT4；CL7 absorbed by GA-GT5。
