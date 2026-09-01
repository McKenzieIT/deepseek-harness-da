# R9: 查询理解卡片(present_decomposition)展示层审计与优化方案

> 立场对齐:本审计沿用 [R8](./R8-data-display-optimization.md)(present_table)的分级框架(A 正确性 / B 工程 / C 表现力·架构),并参照 suggest_followups 优化回合(workspace: dsh-plugins/research/suggestion-ui-optimization.md + phase1 原型裁决)已验证的修复路径:**alias token 修复 → isError → locale → 编排重构**。用户主诉:当前卡片"编排混乱、抓不住重点"。

## 1. 现状盘点:这张卡片今天到底展示了什么

**数据面**(tool 侧 `packages/data/tool-present-decomposition/`,只读不改):

- INTERPRETATION 阶段首个交付工具(phase-gate: present_decomposition → present_table → … → suggest_followups)。
- argsRaw 字段:`summary`(意图一句话)、`metrics[{name, value, unit}]`(**value 是指标表达式/描述,不是计算结果**)、`dimensions[]`(分组轴)、`time_range`、`source?`、`filters?`、`confidence?`(0–1)。

**渲染面**(`packages/client/ui-present-decomposition/src/client/DecompositionCard.tsx`):

- 三态:skeleton(运行中)/ fallback(`block.call===null` 或 JSON 解析失败 → 纯文本)/ rich card。
- rich card 编排(自上而下):
  1. **Header**:chevron ▾ + 固定标题「查询理解」+ (confidence<0.7 时)右侧警告文字。**折叠态仅此一行,内容全失**。
  2. **Summary 段落**:13px 次级色正文(被埋在 body 第一段)。
  3. **Metrics 卡片行**:16px 大数值 + 11px 名称的"KPI 卡"样式。
  4. **Meta 四行**:维度(badges)/ 时间范围(文本)/ 数据源(文本)/ 筛选(badges),label-value 平铺。
- 无 locale 注册、不读 `block.isError`、无 isLatestTurn 概念、argsRaw 校验仅查 `summary`+`metrics`。

## 2. Cordis / dsh-plugin 合规审计

**合规项 ✅**:

- Mode 3 Repository Package 骨架完整(package.json / tsconfig / tsdown / invariant / css-modules.d.ts / README Model Experience / 三注册表面,T1 已核)。
- 注册协议正确:`inject: ['slots']` + `ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ key: 'present_decomposition' }, …))`——对已覆盖 key 的 takeover 是 slot 设计明确允许的语义(ui-tool contract:「A key the shipped composition already covers is replaced, not shared」),也是本次动态原型得以用 `priority: -1` 影子覆盖的机制依据(ui-slots:同 cell 不同 priority 时最低者渲染)。
- 组件纯 props(只见 `block`),无 ctx 泄漏;CSS Modules + clsx;中文产品文案/英文代码;15 tests。

**违规/缺陷 ❌**:

| # | 级别 | 缺陷 | 证据 |
|---|------|------|------|
| A1 | **A(正确性,渲染级)** | **CSS 引用的 8 个 alias token 全部不存在于 ui-theme**:`--dsw-alias-{border-primary, surface-primary, surface-secondary, surface-hover, state-warning-primary, content-primary, content-secondary, content-tertiary}`。无 fallback 的未定义 var → 声明在 computed-value 阶段无效 → **边框不渲染、背景透明、正文层级色全部失效(继承同色)**。卡片实际是一团无容器的等色文字。与 suggest_followups 修复前"6 个 --dsw-bg-* 不存在"同类,且数量更多。 | `DecompositionCard.module.css` 全文件 vs `ui-theme/src/styles/design-platform.css`(真实名单:`border-l1..l4`、`bg-layer-*`、`label-primary/secondary/tertiary`、`interactive-bg-hover`、`state-warn-*`) |
| A2 | **A(正确性)** | 不读 `block.isError`:工具校验失败(如 metrics 为空被 tool 侧 throw)时,若 argsRaw 仍可解析,卡片照常渲染成功态,错误被静默吞掉。与 R8-A4 同类。 | `DecompositionCard.tsx` 全文无 isError 分支 |
| B1 | B(工程) | 无 `locale: NS` 注册、无 locales.ts,文案硬编码中文——违背其余 toolview 惯例(suggestion 审计同款违规,已在 FollowupChips 修复)。 | `src/client/index.ts:8` |
| B2 | B(工程) | `parseArgs` 仅校验 `summary`(string)与 `metrics`(Array);`dimensions`/`time_range` 缺失或非数组时,`args.dimensions.map` 在 render 内 throw(整卡崩溃退到 React 边界)。R8-A2 教训:夹具理想化时 15 测试全绿也挡不住生产脏数据。 | `parseArgs` + L110 `args.dimensions.map` |
| B3 | B(交互) | 折叠态信息量为零:只剩「查询理解」三字。G1-D4 对 table 折叠卡定的是「title + KPI 摘要」,decomposition 未对标。 | header 结构 |
| C1 | C(编排,用户主诉根源) | 信息架构无层级:summary(重点)被埋、metrics 误用 KPI 结果卡样式(它们是**意图声明**不是数据结果,大数值样式误导用户以为看到了答案)、meta 四行平铺、三种粒度同权重堆叠 → "抓不住重点"。 | §1 编排 |
| C2 | C(一致性) | 与已升级的 ui-suggest-followups(border-l2 容器 + label-* 层级 + interactive-bg-hover + state-warn-*)及 ui-present-table 无共享设计语言;三张 INTERPRETATION 卡各自为政 → 对话流整体观感混乱。 | FollowupChips.module.css vs 本包 |

## 3. 应然:查询理解卡的编排原则

**定位:这张卡是「查询契约」,不是「结果卡」。** 用户扫它要回答三问:理解成什么了(焦点)?按什么口径(结构)?多大把握(信任)?

三层层排 + 一条信任带:

1. **焦点行(常驻,含折叠态)**——summary 是标题,不是段落。eyebrow 小字「查询理解」标识卡片身份;主文本 = summary(超长截断);右缘 confidence 徽标(常显数值,如 `置信度 0.86`;<0.7 转 warn 色 + 提示文案)。折叠时保留焦点行 + 时间范围/维度微缩 chips——一眼回溯"那次理解了什么"。
2. **结构行(谱系 chips,单行 wrap)**——时间 ⏱ → 维度 → 筛选 → 源,合并为一条带前缀小字的 chip 行,消灭 4 行 label-value 表;维度与筛选用不同 chip 形态(实底 vs 描边)区分语义。
3. **明细行(metrics 语义降级)**——指标不再是 16px KPI 卡,改为紧凑明细行:`名称 — 表达式 (单位)`,名称主色、表达式次级色等宽感;它是"将要计算什么",与 present_table 的真 KPI 卡拉开视觉档次。
4. **信任带**——confidence 徽标常显(数值化,不只失败才出现);<0.7 → 容器 warn 描边 + 行内提示;`isError` → role=alert 错误行(对齐 FollowupChips ErrorState)。

修复基线(先于一切编排):A1 token 全量替换为真实 alias;A2 isError;B1 locale;B2 parse 全字段防御。

## 4. 优化路径(分层,对齐 R8/T4 节奏)

- **Phase 0 正确性(P0)**:8 token → `border-l2`/`bg-layer-1`/`bg-layer-2`/`label-*`/`interactive-bg-hover`/`state-warn-*`;isError 分支;locale seat;parseArgs 全字段校验。无编排变化——卡片先"能被看见"。
- **Phase 1 编排重构**:§3 三层+信任带落地;折叠态保留焦点行;metrics 明细化。
- **Phase 2 降噪与一致性**:非最新 turn 默认折叠(isLatestTurn,对齐 FollowupChips 的旧轮降级方向);容器/列表/chip 与 suggest-followups 升级版对齐;无障碍打磨(aria/键盘)。
- **Phase 3 联动(远期,雾)**:decomposition 声明 ↔ present_table KPI 互认;置信度低时的"改口径"快捷修正通道(依赖 suggest_followups 回流)。

**明确不建议做**:不把 metrics 保留 KPI 大卡样式(语义错位);不默认折叠最新 turn(G1-D5 透明度优先决策维持);不 takeover 相邻工具卡片(只优化本 key)。

## 5. 原型验证方式(P1)

动态客户端插件(Mode 1)双贡献:
1. `tool.call.toolview` key=`present_decomposition` + `priority: -1` 影子覆盖真实流量;
2. `shell.overlay` 演示面板:「现状如实(broken token) / 仅修 token / 优化编排」三列对照 × 2 场景(常规 / 低置信+模糊),供直接裁决。

裁决后按 T5 折回 Mode 3 仓库包(测试 + 快照),原型作废——沿用 suggest_followups 回合的 VERDICT→折回→作废流程。
