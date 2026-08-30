# R5: present_table 展示层缺陷审计与优化方案

**Type**: research (AFK)
**Status**: ✅ resolved
**Blocked by**: [R7](R7-data-display-ui-patterns.md)
**Blocks**: [T4](T4-present-table-display-upgrade.md), [R6](R6-result-store-server-side.md)

## Question

当前 `ui-present-table` 数据展示实现相对 R4 前沿基线有哪些缺陷(含正确性级)?Cordis 插件实现是否合规?优化路径如何分层?

## Resolution

审计报告见 [../research/R8-data-display-optimization.md](../research/R8-data-display-optimization.md)。要点:

**Cordis 合规**:是静态 client Cordis 插件(Mode 3,`tool.call.toolview` keyed slot key=`present_table`),注册协议合规;但实现存在分级缺陷:

- **A 级(正确性,P0)**:A1 数据绑定忽略 `result_id`(扫描最近 query_data,多次查询绑错/`cr_*` 永远过期);A2 `parseTsv` 与 `query-tool renderCompleted` 真实格式不匹配——实测表头变 `["result_id: qr_xxx"]`、列名行与 elision 行混入数据(测试夹具理想化,52 测试全绿但生产错位);A3 数据源被 `maxDisplayRows=50` 截断,虚拟滚动/CSV/10000 cap 不可达,KPI 在样本上误导聚合;A4 不读 `block.isError`。
- **B 级(架构)**:G1 决策未落地(result store RPC / retry / LLM-UI 数据路径分离);host 侧 `ctx.resultCache` 已存在(全量行,`qr_/cr_`),只差 client RPC 通道(B2,毕业为 [R6](R6-result-store-server-side.md));两包间无共享契约常量(B5)。
- **C 级(工程/表现力)**:Chart.js 静态进主 chunk(README/T2 的 lazy 声明不实)、无 locale(硬编码中文)、VirtualTable 无表格语义且表头错位、图表不适配暗色主题且非数值静默为 0、表格零交互(`sort_column`/`column_types` 参数收而不用)、CSV 仅 ≥10000 行出现、无障碍缺失。

**优化路径四阶段**:Phase 0 正确性(修解析协议+result_id 绑定校验+isError+CSV+KPI 诚实化)→ Phase 1 表格基线(排序/类型对齐/locale/图表懒加载+主题/虚拟表语义)→ Phase 2 展示力(图表切换/复制 MD/SQL 折叠)→ Phase 3 架构闭合(result-cache RPC,毕业为 G2)。
