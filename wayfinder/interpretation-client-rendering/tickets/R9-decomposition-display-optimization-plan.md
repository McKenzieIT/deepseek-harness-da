# R9: 查询理解卡片(present_decomposition)展示层缺陷审计与优化方案

**Type**: research (AFK)
**Status**: ✅ resolved
**Blocked by**: [T1](T1-ui-present-decomposition.md)(实现基线)、suggest_followups 优化回合(dsh-plugins workspace: research/suggestion-ui-optimization.md + prototypes/phase1-chips 裁决)
**Blocks**: [P1](P1-decomposition-prototype.md), [T5](T5-present-decomposition-display-upgrade.md)

## Question

当前 `ui-present-decomposition`(查询理解卡)相对设计规范与 suggest_followups 优化回合的基线有哪些缺陷(含正确性级)?Cordis/dsh-plugin 实现是否合规?"编排混乱、抓不住重点"的根源是什么,应然编排与分层优化路径如何?

## Resolution

审计报告见 [../research/R9-decomposition-display-optimization.md](../research/R9-decomposition-display-optimization.md)。要点:

**Cordis 合规**:Mode 3 骨架与注册协议合规(`tool.call.toolview` keyed takeover 语义明确);但存在分级缺陷:

- **A 级(正确性)**:A1 **CSS 引用的 8 个 alias token 全部不存在于 ui-theme**(border-primary/surface-*/content-*/state-warning-primary)→ 边框/背景/文字层级全部失效,卡片实际渲染为一团无容器等色文字——"混乱/抓不住重点"的渲染级根源,与 suggest_followups 修复前同类;A2 不读 `block.isError`,失败调用静默渲染成功卡。
- **B 级**:无 locale seat;parseArgs 仅校验 summary+metrics,脏数据可致 render 内 throw;折叠态信息量为零(未对标 G1-D4 的"折叠保留摘要"精神)。
- **C 级(编排)**:summary 被埋、metrics 误用 KPI 结果卡样式(实为意图声明)、meta 四行平铺三种粒度同权重堆叠;与已升级 FollowupChips 无共享设计语言。

**应然编排**:卡片定位=「查询契约」非「结果卡」;三层+信任带——焦点行(summary 作标题+confidence 徽标常显,含折叠态)/ 结构行(时间→维度→筛选→源合并谱系 chips)/ 明细行(metrics 降级为"名称—表达式"行)/ isError 错误行。

**优化路径**:Phase 0 正确性(token 全量替换+isError+locale+parse 防御)→ Phase 1 编排重构 → Phase 2 降噪一致性(非最新 turn 折叠+跨卡设计语言)→ Phase 3 联动(雾)。
