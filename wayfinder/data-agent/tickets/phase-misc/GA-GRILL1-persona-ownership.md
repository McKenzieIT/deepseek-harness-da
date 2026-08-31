# GA-GRILL1 — persona 归属与 domain 注入（先 grilling 再开票）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open（grill 后转 G 票）
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) — C2 / arch G3 · **critical**
**Grilling prompt**: [research/grill-1-persona.md](../../research/grill-1-persona.md)

**Question**: management persona 应归谁持有、如何让非游戏部署覆盖？候选 A（phase-gate 加 personaText 字段）/ B（移到 dsh-persona 行 config-supplied）/ C（从 scope 元数据动态注入 domainPersona）。

**Background**: phase-gate.ts:85 const BASE_PERSONA='per-game analytics platform'，:958 注册时直接用；PhaseGateConfig 无 personaText；PHASE_INSTRUCTIONS(:93) 烤入 ods_*/dws_*/game.role.online/DAU/MAU；NL2SQL prompt(:84) + expansion(:11) + B preset 也 ship game persona。非游戏部署 agent 身份错误且不可覆盖。

**Key files**: packages/data/phase-gate/src/{phase-gate.ts:85,93,958,index.ts}; packages/preset/persona/src/; apps/cli/config/agent-presets/data-agent/*.cordis.yml; packages/data/nl2sql-engine/src/prompt.ts:84; packages/data/tool-search-data-sources/src/expand-query.ts:11
