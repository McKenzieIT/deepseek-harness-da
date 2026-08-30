# T4: present_table 展示层优化执行(R8 Phase 0-2 前端部分)

**Type**: task (AFK)
**Status**: ✅ shipped
**Blocked by**: [R7](R7-data-display-ui-patterns.md), [R8](R8-data-display-optimization-plan.md)
**Blocks**: none(result store RPC 走 [R6](R6-result-store-server-side.md),不阻塞本票)

## Question

执行 R8 优化方案的 Phase 0-2(纯 client 侧,不动 host 包、不改 composition):

- **Phase 0 正确性**:修 parseTsv 协议(剥离 `result_id:` 首行与 elision 行,提取 resultId/totalRows/truncated);按 `result_id` 校验绑定(不匹配继续向前扫,全不匹配显示"结果不匹配"而非错绑);`block.isError` 错误态;CSV 任意行数可导出;KPI 截断诚实标注。
- **Phase 1 表格基线**:列排序(类型感知,`sort_column` 初始序)+数字列右对齐(`column_types`);locale 注册(zh/en,对齐 suggest-followups 惯例);ChartView `React.lazy` 懒加载(兑现 README/T2 既有声明);图表主题适配(CSS 变量取色)+非数值断点;VirtualTable 改共享列宽的 grid 布局 + ARIA 表格语义。
- **Phase 2 展示力(轻量)**:图表类型切换(line/bar/隐藏);复制为 Markdown 表格;SQL 折叠透明区(从匹配的 query_data 节点 argsRaw 提取)。
- **护栏**:测试夹具改用真实 `renderCompleted` 输出格式(含 `result_id:` 行与 elision 行),补齐新行为测试,保持覆盖率门槛。

验证:`vitest run packages/client/ui-present-table` 全绿 + `tsc` 类型检查通过。

## Resolution

`packages/client/ui-present-table/` 升级完成。shipped:

- **Phase 0 正确性**:`parseQueryData` 理解真实 `renderCompleted` 格式(`result_id:` 首行 / elision 标记 / `(N rows)` 尾行为元数据,不再混入表头与数据行);按 `args.result_id` 精确绑定候选 query_data 节点(≤6 个回扫,旧格式回退最近节点,id 全不匹配显示 mismatch 卡而非错绑);`block.isError` 错误横幅;CSV 任意行数可导出;截断结果 KPI 加"基于截断样本"提示、行数显示 `shown / total`。
- **Phase 1 表格基线**:列排序(asc→desc→none 循环,`sort_column` 初始降序,`column_types` 声明优先/值嗅探兜底的类型感知比较);数字列右对齐;`present.table` locale 命名空间(zh/en,register + LocaleNamespaceMap);ChartView `React.lazy` 真懒加载;图表轴/图例颜色读主题 CSS 变量;非数值单元格渲染为断点(null)而非静默 0;虚拟表改共享 grid 列模板 + role/aria-rowcount 表格语义。
- **Phase 2 展示力**:图表类型切换工具栏(折线/柱状/隐藏);复制为 Markdown;SQL 折叠透明区(从绑定节点的 argsRaw 提取)。
- **护栏**:测试夹具改用真实 render 格式;79 tests 全绿,per-file 100% 覆盖率门槛通过,`tsc -b` 无错;README 同步更新(含诚实化 lazy-load 声明)。

未做(移交 [R6](R6-result-store-server-side.md)):result store RPC、retry 按钮、服务端 KPI、全量数据拉取——当前扫描+result_id 校验为过渡 fallback。

执行备注:会话中另一并行工作流曾回退本包未提交改动,已从会话历史完整恢复并重新验证(79/79 + 覆盖率 + tsc);本票产出随本次提交入库。
