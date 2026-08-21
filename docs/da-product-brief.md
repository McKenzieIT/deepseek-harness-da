# dsh-data-agent 产品简介

## 一句话

自然语言取数 Agent：将业务问题转为 SQL，执行，结构化交付。

## 核心场景

用户提出个性化数据问题（如"K11 最近 7 天 DAU + 付费情况"）→ Agent 经语义层检索相关表/事件 → 生成 SQL → 执行查询 → 结构化返回结果。覆盖标准看板无法满足的个性化、临时性数据需求。

## 四阶段管道

| 阶段 | 输入 | 输出 | 核心机制 |
|---|---|---|---|
| UNDERSTANDING | 用户自然语言 | 候选数据源 + 定义 | 意图路由 + 语义检索 + 消歧 |
| GENERATION | 数据源上下文 | 验证过的 SQL | NL→SQL prompt + critic 闸门 |
| EXECUTION | SQL | 查询结果（3-state） | MaxCompute sidecar + Guard Chain |
| INTERPRETATION | 查询结果 | 结构化交付 | present_table + suggest_followups |

## 与 dsh 的关系

- **dsh** = 通用 agent harness（Cordis 插件化框架）
- **dsh-data-agent** = dsh 上的一个 bundle + preset（数据取数专用）
- 通过 **additive-only** 方式叠加，不修改 dsh 核心
- 保持与 upstream dsh 的同步升级能力（daily merge）

## 能力来源

reverse-bi（upstream `track2data`，AI 原生游戏取数平台）为只读能力参考源。能力重新实现于 dsh 插件体系上，不 fork reverse-bi。

## 技术栈

- **框架**：Cordis（vendored plugin framework）
- **LLM**：DashScope / AGA AI Gateway（qwen3.7-max）
- **查询引擎**：MaxCompute（via stdio sidecar）
- **语义层**：YAML substrate + per-scope registry
- **检索**：BM25 + 向量（hybrid RRF）
- **安全**：mTLS 反代 + 工具门禁 + per-user credentials keychain

## 当前状态

四阶段脚手架 + seam 实现已 ship。端到端对话管道尚未可用（语料未接入、critic 未 ship、delivery 未 ship）。详见 `wayfinder/data-agent/map.md`。
