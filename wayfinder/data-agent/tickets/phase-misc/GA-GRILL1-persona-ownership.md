# GA-GRILL1 — persona 归属与 domain 注入（grilled → resolved）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Resolved（2026-08-31 grilled → C-plus 方向确认）
**Source**: [audit report](../../research/generalization-audit-2026-08-31.md) — C2 / arch G3 · **critical**
**Grilling prompt**: [research/grill-1-persona.md](../../research/grill-1-persona.md)
**Implementation ticket**: [GA-GT5 domain injection seam](GA-GT5-domain-injection-seam.md)

## 原始问题

management persona 应归谁持有、如何让非游戏部署覆盖？

## Grill 结论：C-plus 方案

原始候选 A（PhaseGateConfig.personaText）和 B（dsh-persona 行 config-supplied）被淘汰——它们结构上只能到管理 persona（3 处），够不着 prompt.ts 和 expand-query.ts（共 5 处游戏硬编码）。原始 C 需扩展为结构化对象 + 专用服务。最终方向：

### 7 项决策

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | 覆盖范围 | 全部 5 处注入点（phase-gate BASE_PERSONA、prompt.ts 开头、expand-query.ts system prompt + few-shot、B/D preset persona） |
| 2 | 数据来源 | active scope 的 `semanticRoot/domain-profile.yaml`（结构化对象） |
| 3 | 读取接缝 | 新建 `ctx.domain` Cordis 服务（`packages/data/domain/`），提供 `persona()` / `nlsqlOpener()` / `expansionPrompt()` / `fewShots()` 等类型化 API |
| 4 | Fallback | 文件缺失 → domain-neutral 通用文本（"You are a data agent for an analytics platform"） |
| 5 | 生成机制 | On-demand + 对话式：用户触发管理命令 → 系统读 Ontology + 语义层 → LLM 生成初始 domain config → 用户确认/调整 → 持久化 |
| 6 | 物理存储 | `semanticRoot/domain-profile.yaml`，git 可管理 |
| 7 | 包归属 | `packages/data/domain/`（新 data 插件），additive-only |

### 5 处注入点适配

| # | 注入点 | 当前来源 | 改为 |
|---|--------|---------|------|
| 1 | phase-gate BASE_PERSONA (phase-gate.ts:85) | 硬编码常量 | `ctx.domain.persona()`（phase-gate 仍持有 section 注册） |
| 2 | NL2SQL prompt 开头 (prompt.ts) | 硬编码中文 `'你是游戏埋点数据分析 Agent'` | `buildPrompt` 新增 `domainOpener` 参数，调用方传 `ctx.domain.nlsqlOpener()` |
| 3 | 查询扩展 (expand-query.ts:11) | 硬编码中文 + 游戏 few-shot | 读 `ctx.domain.expansionPrompt()` + `ctx.domain.fewShots()` |
| 4 | B preset persona (b-free-react-planning.cordis.yml) | dsh-persona config.text 硬编码 | dsh-persona 支持 text 缺失 → 读 `ctx.domain.persona()` |
| 5 | D preset persona (d-bare-react.cordis.yml) | 同上 | 同上 |

### 淘汰的候选及原因

- **A**（PhaseGateConfig.personaText）：只修 phase-gate 的 BASE_PERSONA，prompt.ts 和 expand-query.ts 仍硬编码。范围不足。
- **B**（移到 dsh-persona 行）：同理，只到管理 persona section。
- **原始 C**（scope 元数据单 domainPersona 字段）：形态不足——5 处要的内容形态不同（prose / 句子 / few-shot 例子对），一个字符串喂不了全部。

### 关键假设与压力测试

| 假设 | 结论 |
|------|------|
| "persona 是唯一游戏硬编码" | 否，共 5 处 |
| "scope 一定有 domain 元数据" | 否 → domain-neutral fallback |
| "一个字符串够用" | 否 → 结构化对象 |
| "domain 身份静态" | 是，on-demand 对话式更新；语义层变化不自动重推 |

### 对其他票的影响

- **GA-GT1**（多租户 scope）：scope 元数据不直接承载 domain（改为 semanticRoot 下 domain-profile.yaml），GT1 的 ScopeDefinition 重构不涉及 domain 字段。
- **GA-GRILL2**（i18n）：persona 文本的中英文问题由 ctx.domain 结构化对象承接（nlsqlOpener 可按 locale 提供）。GRILL2 的 prompt-template/locale-bundle 设计仍需独立 grill，但 persona 文本不再在其范围内。
- **CL7**（B preset 'per-game' persona）：被 GA-GT5 实现吸收，CL7 不再需要单独修。
- **CL6**（scopeId 默认 'game-1'）：独立于本设计，仍在 CL-batch 范围。

## Key files

packages/data/phase-gate/src/{phase-gate.ts:85,93,index.ts}; packages/preset/persona/src/index.ts; apps/cli/config/agent-presets/data-agent/{b-free-react-planning,d-bare-react}.cordis.yml; packages/data/nl2sql-engine/src/prompt.ts; packages/data/tool-search-data-sources/src/expand-query.ts:11; packages/data/scope-registry/src/index.ts (ScopeDefinition.semanticRoot)
