# Grilling: management persona 归属与 domain 注入

## 决策待压力测试
dsh-data-agent 的 management persona 应归谁持有、如何让非游戏部署覆盖？候选：
- **A**. phase-gate 继续持有 persona，加 `PhaseGateConfig.personaText` 字段（register 时读，默认中性）。
- **B**. phase-gate 放弃 persona 所有权，移到 `agent.cordis.yml` 的 dsh-persona 行（config-supplied，部署覆盖）。
- **C**. persona 从 active semantic-layer scope 元数据动态注入（`domainPersona`），phase-gate 只持有骨架。

## 背景（根因）
`packages/data/phase-gate/src/phase-gate.ts:85` `const BASE_PERSONA='You are a data agent for a per-game analytics platform'`，`:958` 注册时直接用；`PhaseGateConfig`（index.ts）只暴露 scopeId/budget，**无 personaText**。`PHASE_INSTRUCTIONS`（:93）烤入 `ods_*/dws_*/game.role.online/DAU/MAU/pay_amt`。NL2SQL prompt（`packages/data/nl2sql-engine/src/prompt.ts:84`）`你是游戏埋点数据分析 Agent`；expansion（`packages/data/tool-search-data-sources/src/expand-query.ts:11`）`GAME data-warehouse search query expander` + 游戏 few-shot；B preset（`apps/cli/config/agent-presets/data-agent/b-free-react-planning.cordis.yml:24`）也 ship 同一 game persona。非游戏部署 agent 身份错误且不可覆盖（除非 fork 包）。

## 影响面 / 约束
- 影响 GA-GT1（scope 元数据是否承载 domain）、GA-GRILL2（i18n 共享 persona 文本）、CL7（B preset persona）。
- 项目处于开发期、无兼容负担（per map 常设原则），可推翻重来。
- additive-only 倾向，但 persona seam 可能需触 phase-gate 核心。

## 任务（对抗式 grill，不和稀泥）
逼问每个候选的致命缺陷：A 下默认中性 persona 是否够用（游戏部署会不会退化）？B 下部署忘了配 persona 会怎样——fail-loud 还是 silent wrong？C 下 scope 元数据缺 domain 时 fallback 是什么？哪些假设最危险（"persona 必须由插件持有"？"scope 一定有 domain 元数据"？）？有没有被忽略的第四选项（如 persona 完全从 prompt 模板库加载，phase-gate 不持有任何 persona 文本）？能否找到一个让非游戏部署"开箱即对"且游戏部署不退化的方案？逼出一个可执行设计方向。

## 可读文件（mcp__local__read_file/grep，路径 /Users/mckenzie/workspace/deepseek-harness-da）
packages/data/phase-gate/src/{phase-gate.ts,index.ts,domain.ts}; packages/preset/persona/src/; packages/bundle/data-agent/src/; apps/cli/config/agent-presets/data-agent/*.cordis.yml; packages/data/nl2sql-engine/src/prompt.ts; packages/data/tool-search-data-sources/src/expand-query.ts; wayfinder/data-agent/map.md（常设原则）
