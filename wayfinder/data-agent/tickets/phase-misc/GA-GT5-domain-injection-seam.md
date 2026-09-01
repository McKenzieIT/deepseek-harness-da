# GA-GT5 — domain injection seam（ctx.domain 服务 + domain-profile.yaml）

**Type**: grilling  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-GRILL1 grill resolution](GA-GRILL1-persona-ownership.md) — C-plus 方案（2026-08-31 grilled）
**Priority**: **critical**（C2 / arch G3）

## Problem

游戏域身份硬编码在 5 个独立位置，非游戏部署 agent 身份错误且不可覆盖（除非 fork 包）。根因：系统没有 domain 注入缝。

### 5 处硬编码

| # | 文件 | 硬编码内容 |
|---|------|-----------|
| 1 | phase-gate.ts:85 `BASE_PERSONA` | `"You are a data agent for a per-game analytics platform..."` |
| 2 | prompt.ts `buildPrompt` 首行 | `"你是游戏埋点数据分析 Agent。宁可少答慢答，不可错答。"` |
| 3 | expand-query.ts:11 `EXPANSION_SYSTEM_PROMPT` | `"你是一个游戏数据分析数据仓库的搜索查询扩展器"` + 游戏 few-shot |
| 4 | b-free-react-planning.cordis.yml persona | `"You are a data agent for a per-game analytics platform..."` |
| 5 | d-bare-react.cordis.yml persona | 同上 |

## Solution: C-plus 方案

### 新增 `ctx.domain` Cordis 服务

- **包**: `packages/data/domain/`（`@deepseek-ai/dsh-domain`），additive-only 新 data 插件
- **inject**: `['scopes']`（读 active scope 的 semanticRoot 定位 domain-profile.yaml）
- **API**:
  - `persona(): string` — 管理 persona 文本
  - `nlsqlOpener(): string` — NL2SQL prompt 开头句
  - `expansionPrompt(): string` — 查询扩展 system prompt
  - `fewShots(): FewShotExample[]` — 查询扩展 few-shot 示例对
- **Fallback**: `domain-profile.yaml` 缺失 → 返回 domain-neutral 通用文本
- **Scope 切换**: 监听 `scopes/active-changed` 事件，重新从新 scope 的 semanticRoot 读取

### `domain-profile.yaml` 结构化文件

- **位置**: `{semanticRoot}/domain-profile.yaml`（和 config.yaml / events / tables 同级）
- **格式**:
  ```yaml
  persona: "You are a data agent for a per-game analytics platform..."
  nlsqlOpener: "你是游戏埋点数据分析 Agent。宁可少答慢答，不可错答。"
  expansionPrompt: "你是一个游戏数据分析数据仓库的搜索查询扩展器。..."
  fewShots:
    - question: "ARPPU是多少"
      expansion: "ARPPU ARPU 人均付费 付费人均收入 pay_amt acc_summary ..."
    - question: "昨天有多少场PVP对战"
      expansion: "PVP 对战 pvp_score 对战场次 竞技 ..."
  ```
- **git 可管理**：和语义层内容一起 review/version

### 5 处注入点适配

| # | 注入点 | 改动 |
|---|--------|------|
| 1 | phase-gate BASE_PERSONA | 从 `ctx.domain.persona()` 读取（phase-gate 仍持有 section 注册 + PHASE_INSTRUCTIONS overlay） |
| 2 | prompt.ts `buildPrompt` | 新增 `domainOpener?: string` 参数；调用方（phase-gate onAssemble）传 `ctx.domain.nlsqlOpener()` |
| 3 | expand-query.ts | `EXPANSION_SYSTEM_PROMPT` 改从 `ctx.domain.expansionPrompt()` 读取；few-shot 从 `ctx.domain.fewShots()` 读取 |
| 4 | B preset dsh-persona | `dsh-persona` 支持 `config.text` 缺失 → optional inject `ctx.domain`，读 `persona()` |
| 5 | D preset dsh-persona | 同上 |

### Intelligent 生成机制

- **触发**: On-demand 用户管理命令（对话式）
- **流程**: 用户触发 → 系统读 Ontology + 语义层（events/tables/concepts/domains.yaml）→ LLM 生成初始 domain-profile.yaml → 用户对话确认/调整 → 持久化到 semanticRoot
- **符合**: "对话式管理"常设原则

## Scope

- [ ] 新建 `packages/data/domain/` 包 + `ctx.domain` Cordis 服务
- [ ] 新建 `domain-profile.yaml` schema + io（loadDomainProfile / writeDomainProfile）
- [ ] phase-gate.ts: `BASE_PERSONA` → `ctx.domain.persona()`（soft-probe，fallback 内置）
- [ ] prompt.ts: `buildPrompt` 加 `domainOpener` 参数
- [ ] expand-query.ts: system prompt + few-shot 从 `ctx.domain` 读取
- [ ] dsh-persona: 支持 text 缺失 → optional inject `ctx.domain`
- [ ] B/D preset cordis.yml: 移除硬编码 persona text
- [ ] agent.cordis.yml / c-hybrid.cordis.yml: 无需改（phase-gate 内部改）
- [ ] 对话式 domain profile 生成管理命令（可后续 ticket）

## Blocked by

无（独立于 GA-GT1 多租户重构；ctx.domain 读 active scope 的 semanticRoot，GT1 改 per-request scope 后接口不变）

## 关联

- GA-GRILL1（本 grill 的实现落地）
- GA-GRILL2（persona 文本 i18n 由 ctx.domain 结构化对象承接；GRILL2 聚焦 prompt-template / marker / locale）
- CL7（B preset persona → 被本票吸收）
- GA-GT1（多租户 scope → domain 读 semanticRoot，接口兼容）

## Key files

packages/data/phase-gate/src/phase-gate.ts:85; packages/data/nl2sql-engine/src/prompt.ts; packages/data/tool-search-data-sources/src/expand-query.ts:11; packages/preset/persona/src/index.ts; apps/cli/config/agent-presets/data-agent/{b-free-react-planning,d-bare-react}.cordis.yml; packages/data/scope-registry/src/index.ts; packages/data/semantic-layer/src/io.ts
