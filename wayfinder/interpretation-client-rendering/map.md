# wayfinder:map — INTERPRETATION client rendering

> 本地 markdown tracker。子 ticket 在 `tickets/`，研究笔记在 `research/`。本 map 是**索引**，非存储——决策详情在其 ticket。

## Destination

Ship three client-side rendering plugins (`packages/client/ui-present-table/`, `packages/client/ui-present-decomposition/`, `packages/client/ui-suggest-followups/`) that replace the generic tool-call row with rich, interactive visualizations when the INTERPRETATION-phase delivery tools fire — tables with KPI cards and charts, structured decomposition cards, and clickable follow-up suggestion chips. Follows Mode 3 (Repository Package) of `dsh-plugin-development`.

## Notes

- **域**：DSH Web UI client plugins（browser-side Cordis 插件），渲染 INTERPRETATION 阶段工具结果。
- **每会话应查 skills**：`dsh-plugin-development`（Mode 3）、`grilling`、`domain-modeling`。
- **常设原则**：
  - 三个 server-side 工具已 ship（`packages/data/tool-present-{table,decomposition}/`、`tool-suggest-followups/`）——client 插件只读它们的 tool/result 事件，不改 server。
  - 遵循 `packages/client/AGENTS.md` 全部 slot/props/styling/export 纪律。
  - 遵循 `ui-tool` 的 toolview 注册模式：`ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: '<tool_name>' }, Component))`。
  - `argsRaw`（tool call JSON）= 结构化 intent；`content`（tool result ContentBlock[]）= 渲染文本。client 从 `argsRaw` 解析 intent 渲染 UI。
  - `present_table` 的 `result_id` 引用 `query_data` 执行结果——数据行的获取路径:v1 为同 turn TSV 扫描 + result_id 校验(T4 已修协议错位);正式 result store RPC 走 [R6](tickets/R6-result-store-server-side.md)（已解:host `ctx.resultCache` 在,加 `result.get` apiproxy 一行即可,已 ship,见 [T8](tickets/T8-result-get-rpc.md)）。client 侧热缓存（折叠/展开不重发 RPC、byte-bounded LRU、事件驱动失效）见 [R5](tickets/R5-object-layer-result-cache.md)（已解：单包 `packages/client/result-cache/`）。
  - `compute` 延后（blocked on 安全计算环境）——本 map 不含。

## Decisions so far

- [R1: LLM agent UI rendering patterns](tickets/R1-llm-ui-rendering-patterns.md) — 数据 agent 全部 inline；follow-up chips 点击=立即提交；宽表格 horizontal scroll；旧 chips 变灰/隐藏
- [R2: Frontend table + chart libraries](tickets/R2-frontend-table-chart-libraries.md) — v1 表格用原生 `<table>`（虚拟滚动时升级 TanStack）；Chart.js 4 tree-shaken ~43KB 仅 chart intent 时加载
- [R3: DSH client rendering patterns](tickets/R3-dsh-client-rendering-patterns.md) — toolview 注册走 `tool.call.toolview` keyed slot；argsRaw 从 block.call 解析；数据行从同 turn query_data TSV 扫描；submit 通过 inject face → conversation.send；block.call===null 时 fallback generic card
- [G1: INTERPRETATION client rendering design decisions](tickets/G1-design-decisions.md) — LLM/UI 数据路径分离；horizontal scroll；数据不可用时显示提示+retry；旧 chips 完全隐藏；折叠 card 展示 title+KPI；decomposition 默认展开 <0.7 黄色提示；retry=重拉 result store；虚拟滚动 day-1 + 10000 行 cap + CSV 导出；result data 在 object layer LRU cache 管理
- [T1: Implement ui-present-decomposition package](tickets/T1-ui-present-decomposition.md) — packages/client/ui-present-decomposition/ 完成，toolview 注册 key='present_decomposition'，三态渲染（skeleton/fallback/rich card），15 tests green
- [T2: Implement ui-present-table package](tickets/T2-ui-present-table.md) — packages/client/ui-present-table/ 完成，toolview 注册 key='present_table'，TSV 解析 + KPI 聚合 + 虚拟滚动 + Chart.js lazy load + 折叠/展开 + CSV 导出，52 tests green，100% 覆盖率
- [T3: Implement ui-suggest-followups package](tickets/T3-ui-suggest-followups.md) — packages/client/ui-suggest-followups/ 完成，toolview 注册 key='suggest_followups'，inject face 提供 submit callback，chip 点击立即提交，旧 turn chips 从 DOM 移除，22 tests green，100% 覆盖率
- [R7: 前沿 agent 数据展示 UI 调研(联网核验版)](tickets/R7-data-display-ui-patterns.md) — 表格交互基线成行业标配(ChatGPT 已渲染 interactive tables);图表自动生成三条路线+必须用户可切换;透明度三路径(Genie 同卡折叠 SQL 最贴合 DSH);Actionable Insights 是下一前沿;10/14 产品经 MCP 联网核验
- [R8: present_table 展示层缺陷审计与优化方案](tickets/R8-data-display-optimization-plan.md) — Cordis 合规确认 + A/B/C 缺陷分级:A 级含 parseTsv 与真实 render 格式错位(表头变 result_id 行,实测复现)与 50 行天花板使虚拟滚动/CSV 不可达;host 侧 ctx.resultCache 已存在只差 client RPC;优化四阶段路径
- [T4: present_table 展示层优化执行(Phase 0-2)](tickets/T4-present-table-display-upgrade.md) — parseQueryData 协议修复 + result_id 精确绑定/错配提示 + isError + KPI 截断诚实化;排序/类型对齐/locale/图表懒加载+主题+切换/复制 MD/SQL 折叠;79 tests + 100% 覆盖率 + tsc 通过;result store RPC 移交 R6
- [R9: 查询理解卡片展示层缺陷审计与优化方案](tickets/R9-decomposition-display-optimization-plan.md) — 合规确认 + A/B/C 分级:A1 卡片 CSS 引用的 8 个 alias token 全部不存在于 ui-theme(边框/背景/层级失效,"混乱"的渲染级根源)、A2 不读 isError;应然编排=「查询契约」三层(焦点行/谱系 chips/指标明细)+信任带;Phase 0-3 路径;裁决经 P1 动态原型,执行入 T5
- [P1: 查询理解卡优化编排 · 动态插件原型裁决](tickets/P1-decomposition-prototype.md) — 三轮 HITL 裁决定稿:焦点行(summary 标题+置信度徽标)/谱系合行成立;悬停揭示口径否决(自洽性 bug+空间利用率);终版=指标口径常显+自适应多列网格(10 指标折 5 行)+信任带;动态原型保持挂载至 T5 折回
- [T5: present_decomposition 展示层优化执行(Phase 0-2)](tickets/T5-present-decomposition-display-upgrade.md) — P1 定稿折回仓库包:token 全修+isError+locale+parse 防御(Phase 0)、焦点行/谱系 chips/常显指标网格/折叠焦点保留(Phase 1)、非最新 turn 默认折叠(Phase 2);30 tests+100% 覆盖+tsc/bundle 绿+test:gui 全绿(4211);e2e 失败属 code-mode 工作面(交接注);qdec 原型已停用作废
- [R4: present_table chart 渲染类型扩展](tickets/R4-chart-type-expansion.md) — 留 Chart.js 4;纳入全部 native 类型(area/h-bar/scatter/doughnut/bubble/radar/polarArea,不分阶段,排除 pie-only,heatmap/sankey/treemap→独立 ECharts effort);LLM 选型=启发式(语义层 metric×dimension×grain→type)+客户端列-kind/基数校验器(不可行降级 bar);K11 语义层锚定每图展示内容;原型 prototype/index.html(v6) 演示;实测入 [T6](tickets/T6-chart-integration-testing.md)
- [R6: Result store server-side 设计调研](tickets/R6-result-store-server-side.md) — host 侧 `ctx.resultCache`（in-memory/session-scoped；`qr_`查询+`cr_`compute 不可变）已 ship 且 compute 衍生已通；rpcId apiproxy 已 ship，唯一缺口=未注册的 `result.get` RPC 行（纯机械四件，impl → [T8](tickets/T8-result-get-rpc.md)，无新决策）；分页延后（day-1 全量 get）；R5 上游已解
- [R5: Object layer result cache 实现方案](tickets/R5-object-layer-result-cache.md) — 单包 `packages/client/result-cache/`（Mode 3，SD+Provider 同包，session-scoped `ctx.results`，镜像 host 放置合二为一）；失效=(a) 事件驱动（观察 `query_data` 完成→invalidate cache[R]，`cr_` 不可变不失效，fresh-vs-folded 由时序处理）；eviction=byte-bounded LRU（`lru-cache` 进 deps，无 TTL，纠正原 count-based）；bound=`maxEntrySize ~8MB`/`maxSize ~64MB`/`max ~64`/`updateAgeOnGet`（Config 字段）；generation-token v1 跳过（missed-event 竞态记 Known Limitation）；不用 IndexedDB/WeakRef/tag 失效/HTTP-SWR/命中 clone；全程 dsh-plugin-development 合规；impl → [T9](tickets/T9-result-cache-package-impl.md)（blocked-by [T8](tickets/T8-result-get-rpc.md)）
- [T8: result.get RPC 四件实现](tickets/T8-result-get-rpc.md) — host 侧 `result.get` RPC 上线（四镜像 + results.ts/schema + api-proxy handler + `result-not-found` 错误码）；`ctx.get('resultCache')` optional，miss=`result-not-found`，wire ResultEntry 本地定义；tsc + test:gui（4214）全绿；解 [T9] miss 通路前置
- [R10: 查询理解卡与 present_table metric 身份互认](tickets/R10-decomposition-table-metric-identity.md) — 两卡 metric 独立：decomposition 纯 argsRaw 自由文本无 `result_id`，table kpi 值从 `result_id` 绑定数据计算；无共享 key/语义 id，无需 metric 联动（结论否）；P2 独立
- [T9: client result-cache 包实现](tickets/T9-result-cache-package-impl.md) — `packages/client/result-cache/` Mode 3 包 ship：`ctx.results` scope-addressed Service（byte-bounded `lru-cache` + 复合 `${sid}:${rid}` 键 + miss→T8 `result.get` RPC + `connection/reset` flush + `invalidate` API；21 tests + `test:gui` + 全 doc-sync/client 门对**本包**全绿）；per-`query_data` 失效在消费方边界实现（无 runtime 改，`Session` 拥有 event stream），消费方接线 step 6 graduated [T10](tickets/T10-consumer-fetchResult-wiring.md)，connection `FixtureApi` `results` arm T8 residual graduated [T11](tickets/T11-connection-fixture-results-arm.md)；code review（subagent）发现 4 HIGH + 5 MEDIUM + 5 LOW + 4 NIT（latent——包无消费方，T10 接线后 HIGH detonate；两项 HIGH 直击 R5 失效正确性：in-flight invalidate 竞态 + 无 single-flight），graduated [T12](tickets/T12-harden-result-cache-per-review.md) blocks [T10]
- [T11: Fix connection FixtureApiClient `results` arm (T8 residual)](tickets/T11-connection-fixture-results-arm.md) — T8 residual 的 **connection 半**补齐：fixture `results` arm（返 `result-not-found`）+ `dispatch` `result.get` case + connection 测试 fake `results` arm；connection tsc 复绿 + `test:gui` 全绿。residual 范围比 ticket 预想大（T8 加 `IApiClient.results` 坏所有 fake，非止 fixture 一个），runtime 半（共享测试基建，runtime + ui-conversation 测试都用）graduate [T13](tickets/T13-runtime-fakeapiclient-results-arm.md)、result-cache `.mock`（非 residual，T9 测试 `as unknown as ResultFetcher` cast 后访问 `.mock`）归 [T12](tickets/T12-harden-result-cache-per-review.md)；聚合 tsc 仍红但全 latent，不卡 T12（其 `tsc -b` 只看 src）

## Not yet specified

(暂无——原三条雾已全部毕业为票:chart 精度扩展 → [R4](tickets/R4-chart-type-expansion.md),object layer cache → [R5](tickets/R5-object-layer-result-cache.md),result store server-side → [R6](tickets/R6-result-store-server-side.md))

原「查询理解↔table KPI 互认 + 改口径回流」雾(自 R9)已毕业:语义层 → [R10](tickets/R10-decomposition-table-metric-identity.md)(结论:两卡 metric 身份独立——decomposition 为纯 argsRaw 自由文本无 `result_id`,table kpi 值从 `result_id` 绑定数据计算;无共享 key/语义 id,无需 metric 联动);UX 层(低置信改口径 affordance 形态)→ [P2](tickets/P2-decomposition-revision-prototype.md)(prototype,open;R10 既不 block 也不 bind P2,且「无 link」收窄 P2 scope)。

## Out of scope

- `compute` 工具的客户端渲染（blocked on 安全计算环境 research）
- result data caching service 的设计/实现（data infra 层面，非 client 插件责任）
- 对话流整体 redesign（only INTERPRETATION tools 的 toolview 替换）
- ECharts 迁移与 heatmap/sankey/treemap（非 native Chart.js 类型；R4 决定推迟到独立 effort，不并入本 map）
