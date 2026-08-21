# data-agent model-facing 工具包 shipping 聚合（query_data / load_* / present_*）

> 聚合 ticket：串起 data-agent 四阶段 pipeline 的 model-facing 工具包 shipping，使全链路 NL→SQL→query→delivery 可跑。每工具指向其 resolving ticket；本票跟踪整体 + 依赖解锁序。
> 背景：2026-08-21 验证 sweep（`data-agent-conversation-readiness.md`）—— preset `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` 挂了 `phase-gate` + `tool-search-data-sources`（已 ship），但 `query_data`/`load_*`/`critique_sql`/`evaluate_sql_quality`/`present_*` 是注释占位（"name TBD — uncomment when the package ships"）→ 全链路跑不通。

## Question / 目标

把 data-agent 四阶段 pipeline 的 model-facing 工具包从注释占位 ship 成可调用——使 da agent 能 NL→SQL→query→delivery 端到端（G1b execution-match 的前提）。每工具指向其 resolving ticket；本票跟踪整体进度 + 依赖解锁序，不重复各子项 ticket 的决策详情。

## 工具清单 + resolving tickets + 状态

| 工具 | 阶段 | resolving ticket | 状态 |
|---|---|---|---|
| `query_data` | EXECUTION | [P4c](../phase-2/P4c-real-odps-execution-path.md) | **进行中**：P4c(a) maxc-backed sidecar 落 `36d78f43b7`（真 ODPS case 037→4336 通，Provider 不变）；**(c) tool-query Consumer = `query_data` = pending 子项**（model-facing tool + preset 注册 + 会话门 G1/G5 + 3-execute 镜像 rbi `execution.py`） |
| `load_table_definition` / `load_event_definition` | UNDERSTANDING/GENERATION | [P6b](../phase-2/P6b-semantic-layer-hardening.md) | semantic-layer Service + substrate 已 ship（commit 88524504f8）；**load_* model-facing tool 包 = deferred follow-up**（P6b note "load_* tool 包 = follow-up"）—— 独立 tool 包（`@deepseek-ai/dsh-tool-load-table-definition` / `dsh-tool-load-event-definition`），走 `defineTool` + `ctx.tools.register`，底层调 `ctx.schema.load_*` substrate（live-ODPS provider deferred 但 substrate 可用） |
| `critique_sql_tool` / `evaluate_sql_quality` | GENERATION | [P13b](../phase-3/P13b-nl2sql-engine-prod-hardening.md) | **gate-only by design（不 ship 为 model-facing tool）**——critic 折进 phase-gate 的 `sql_syntax_gate` slot（`critiqueSql`/`sqlSyntaxGate` 返 `GateResult`）；P13b Q4 "evaluate_sql_quality drop; preset critique/evaluate 行留 commented"。故本聚合**不含**（记为 out-of-scope by design） |
| `present_*`（decomposition/table/...） | INTERPRETATION delivery | （P13b/P7b 注 "INTERPRETATION delivery tools → a later ticket"，**未建**） | **未建 ticket**——交付工具（report/Excel/文本呈现）；无硬依赖，可独立 ship。需新建子项 ticket |

## 依赖 + 解锁序

1. **`load_*`**（UNDERSTANDING/GENERATION schema grounding）→ 解锁 GENERATION 用真 schema（替 P13b 的 corpus 空薄默认）；依赖 P6b `ctx.schema` substrate（已 ship；live-ODPS provider deferred 但 load_* 可先用 substrate）。
2. **`query_data`**（EXECUTION）→ 解锁真 SQL 执行；依赖 P4c(c)（maxc sidecar 已通，Provider 不变；剩 tool-query Consumer + preset 注册 + 会话门）。
3. **`present_*`**（INTERPRETATION delivery）→ 解锁交付；无硬依赖，独立 ship。
4. critique/evaluate：不 ship（gate-only）——确认 P13b Q4 决议保持。

## 共性（所有 model-facing tool 的 ship 模式）

- 走 `@deepseek-ai/dsh-tools` 的 `defineTool` + `ctx.tools.register`——P13b `search_data_sources` 已 grounded 该 API（首个 model-facing tool，commit 0e1a0fdf25），复用同模式。
- 每工具独立 tool 包 `packages/data/dsh-tool-<name>/`，镜像 `tool-search-data-sources` 三件套形态（src + tests + package.json + tsconfig.json 2 级 extends `../../../tsconfig.base.json`）。
- preset `agent.cordis.yml` 对应行从注释解注释 + 填 `name`（package ship 后；行 id 已占位）。
- phase-gate guard 白名单（UNDERSTANDING/GENERATION/EXECUTION/INTERPRETATION_TOOLS）已按 RBI roster 名占位——注册即 callable，未注册=不可 call（非 broken mount）。

## Resolution

未解——本票跟踪聚合 shipping。子项分别由 P4c(c) / P6b load_* follow-up / 新建 present_* 票驱动。**全 ship 后 + LLM-wiring 持久化**（见 `dashscope-default-llm-plugin.md`）→ 全 data-agent 对话可跑（G1b execution-match 前提；G1b re-blocked on P4c + 工具包 + P11c + G1c）。〔相关：`data-agent-conversation-readiness.md`、`2026-08-21-verification-audit.md`、`tickets/phase-misc/G1c-variant-presets-tool-roster.md`〕
