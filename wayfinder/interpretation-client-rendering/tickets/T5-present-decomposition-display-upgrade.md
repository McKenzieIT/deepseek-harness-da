# T5: present_decomposition 展示层优化执行(Phase 0-2)

**Type**: task (AFK)
**Status**: open
**Blocked by**: [R9](R9-decomposition-display-optimization-plan.md)、[P1](P1-decomposition-prototype.md)(裁决口径)
**Related**: [T4](T4-present-table-display-upgrade.md)(present_table 同型回合的执行范式:协议修复→分层→测试+快照)

## Question

按 R9 方案与 P1 裁决,在 `packages/client/ui-present-decomposition/`(Mode 3)执行 Phase 0-2:

- **Phase 0 正确性**:8 个失效 alias token 全量替换(border-l2 / bg-layer-1 / bg-layer-2 / label-* / interactive-bg-hover / state-warn-*);`block.isError` → 错误态(role=alert);`locale: NS` + locales.ts;parseArgs 全字段校验(dimensions/time_range 防御,render 不再可能 throw)。
- **Phase 1 编排**:焦点行(summary 标题化 + confidence 徽标常显,折叠态保留)/ 谱系 chips 结构行 / metrics"名称—表达式"明细行。
- **Phase 2 一致性**:非最新 turn 默认折叠(isLatestTurn,对齐 FollowupChips);与 suggest-followups 升级版对齐容器/chip/层级设计语言;无障碍打磨。

验收:`pnpm run test:gui` 绿 + 覆盖率 100%(新分支全覆盖)+ `verify-client-packages` 0 违规;可见输出变化跑 `DSH_SNAPSHOT=replay pnpm run test:web`。README Model Experience 同步更新。
