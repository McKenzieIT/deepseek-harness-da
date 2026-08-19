# 先例研究：把插件化 agent harness 改造成领域 agent（deepseek-harness → data-agent）

> 研究日期 2026-08-19。来源：web 检索（GitHub/社区文章）+ 本地 `deepseek-harness-da` 源码实证。事实与推断已标注。完整报告见会话 transcript（subagent 的 write_file 当时被分类器阻断，本文件为精简持久化）。

## TL;DR
- deepseek-harness 开源仅 6 天（2026-08-13，rc.5，~15 万 star / ~1.5 万 fork），官方明示 "THERE WILL BE COMPATIBILITY-BREAKING CHANGES"，pre-release、无外部消费者。
- **几乎所有高星衍生都不 fork core**，而是 out-of-tree `dsh.bundle` / Skill / MCP 插件叠加。官方契约："Plugins, not loop changes"（插件优先、不动 core）。
- 主导改造模式 = (a) 叠加 profile/bundle/preset + (c) 在 seam 上写领域插件，不动 core。最强成熟先例 **Koishi**（同根 Cordis，4 年 / 4000+ 插件，100% plugin-first）。
- 唯一 fork-core 样本 **Roo Code（fork Cline + modes）已于 2026-05-15 归档**——fork-and-diverge 反例。
- dsh 内置四 preset（code/cordis/minimal/standard）+ `examples/headless-agent/e2b.cordis.yml`（换 provider、留 bash + model-facing tools）= 我们 Q4 拓扑的现成 overlay 模板。
- **data-agent / NL2SQL 方向无"fork harness"先例**：WrenAI / SuperSonic / Chat2DB / Vanna / 帆软 FineChatBI / 网易有数 / 数势 / Aloudata 全是独立产品，自带语义层 + 治理栈。**NL2SQL 成败在语义层（MDL / 指标层 / Text2DSL），不在 harness。**

## 对 Q4 拓扑（保 core、筛 code-agent、加 data-agent）的相关性
- 与社区主导模式完全同向。但"fork"应理解为"另立产品仓库 + 选择性挂载 preset/bundle"，而非"改 core 源码"。
- **关键原则：da 改动 additive-only**——preset overlay + data 工具插件 + persona，不改 / 不删 core。"筛 code-agent" = 在 data-agent preset 里不挂载这些工具（非物理删）。这保升级路径（上游 rc 更新不会碾过 da 私改）。
- **语义层须作为 data-agent 插件包内一等公民**——NL2SQL 成败在语义层。

## 风险点
1. pre-release 上游会 breaking → core 不动，只暴露在 `ctx.tools` / `ctx.agentPresets` / `ctx.persona` 等稳定 seam。
2. preset 不能发布 process-global service（mount 拒绝）。
3. 模型可见 ⟺ 已日志（喂回模型的结果须经 session event）。
4. capability seam 三角色要齐（Definition / Provider / Consumer）。
5. 语义层一等公民（见上）。

## 局限
- `github.com` / `api.github.com` 在本环境被网络策略阻断（WebFetch 域名校验失败、curl 沙箱 exit 1）；fork 排名与 Roo Code archived 未机器直验，标"高度可信但未交叉核对"。
- dsh 6 天窗口使"fork-core 改造为领域 agent"样本结构上不可能存在；"先例稀薄"是结构性事实，非检索失败。

## 引用（精选；完整清单见 transcript）
- 本地：`AGENTS.md`、`packages/preset/README.md`、`packages/bundle/README.md`、`examples/headless-agent/{README,composition,cordis,e2b.cordis}.yml`
- Koishi：koishi.chat / github.com/koishijs/koishi
- Roo Code（archived）：github.com/RooCodeInc/Roo-Code
- WrenAI：github.com/Canner/wren-ai
- SuperSonic：github.com/tencentmusic/supersonic
- dsh 生态文章：CSDN / 知乎 / 腾讯云 / 百家号 / 新浪 多篇
