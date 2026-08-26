# G1: INTERPRETATION client rendering design decisions

**Type**: grilling (HITL)
**Blocked by**: [R1](R1-llm-ui-rendering-patterns.md), [R2](R2-frontend-table-chart-libraries.md), [R3](R3-dsh-client-rendering-patterns.md)
**Blocks**: [T1](T1-ui-present-decomposition.md), [T2](T2-ui-present-table.md), [T3](T3-ui-suggest-followups.md)

## Question

Stress-test and resolve the following design decisions for the INTERPRETATION client rendering plugins:

1. **渲染位置**：inline 对话流 vs 独立 side panel？
   - 倾向：inline（toolview slot 天然 inline；side panel 需 layout 改动超出 scope）
   - 但 table 宽时 inline 会 overflow——truncate + expand？还是 horizontal scroll？

2. **present_table 的 result_id 数据不可用时**：
   - 场景：session restore 后缓存过期、或 query_data 执行失败后 present_table 仍被调用
   - 选项：(a) 显示 "数据已过期" placeholder + retry 按钮 (b) fallback 到 text rendering (c) 隐藏整个 card

3. **suggest_followups 交互**：
   - 点击 chip 后行为：填入 composer 并提交？还是仅填入不提交让用户确认？
   - 旧 chips 处理：当新 turn 产生新 followups，旧的 (a) 保留灰色不可点击 (b) 完全移除 (c) 折叠到 "earlier suggestions"

4. **多轮累积 table 折叠/分页**：
   - 多次 present_table 在同一 session：每个都全展示？还是只展开最新的，旧的折叠为 summary card？
   - 分页：表格内部分页 vs 整个 card 折叠

5. **present_decomposition 可见性**：
   - 对普通业务用户：默认展示（增加透明度）还是折叠/debug-only？
   - confidence < 0.5 时特殊 UI？

6. **Session 恢复数据完整性**：
   - event window truncation 导致 `call` 为 null（无 argsRaw）——是否需要 fallback 渲染？
   - 策略：(a) 从 content text 反向解析 (b) 显示 generic card (c) 不渲染（该 tool call 太旧了）

7. **大数据量前端性能**：
   - 10000 行 table 的性能预算（首屏 <200ms？虚拟滚动？）
   - chart 数据点 >1000 时降采样策略
