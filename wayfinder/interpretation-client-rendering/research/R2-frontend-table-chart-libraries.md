# R2: Frontend Table + Chart Libraries Comparison (2026)

## Summary

推荐 **TanStack Table v8/v9**（headless、~15KB gzip、完全样式自由）+ **Observable Plot** 或 **Chart.js 4**（轻量 line/bar chart、~30-60KB）。TanStack Table 的 headless 设计完美匹配 DSH 的 CSS Modules + `--dsw-*` token 纪律；对于仅需 line/bar 的 v1，Chart.js tree-shaken 到 ~40KB 是最佳平衡。

## Table Libraries Comparison

| Library | Bundle (gzip) | Virtual scroll | Sort/resize | Headless | TS-first | React 19 | License |
|---------|--------------|----------------|-------------|----------|----------|----------|---------|
| **TanStack Table v8** | ~15KB (core+react) | Via TanStack Virtual (~3KB) | ✅ built-in | ✅ 完全 headless | ✅ | ✅ | MIT |
| AG Grid Community | ~200-400KB | ✅ built-in | ✅ built-in | ❌ opinionated UI | ✅ | ✅ | MIT |
| Glide Data Grid | ~60-90KB | ✅ built-in（Canvas） | ✅ | ❌ Canvas 渲染 | ✅ | ✅ | MIT |
| react-data-grid | ~40-60KB | ✅ built-in | ✅ | ❌ opinionated UI | ✅ | ✅ | MIT |

### Detailed Assessment

**TanStack Table v8/v9** ⭐ 推荐
- **强项**：完全 headless——零 UI opinion，所有渲染由开发者 JSX+CSS 控制。这是唯一能与 DSH 的 CSS Modules + `--dsw-*` 设计 token 体系完美集成的方案。Bundle 极小（core ~10KB + react adapter ~5KB），tree-shake 友好。TypeScript-first。
- **弱项**：虚拟滚动需要额外集成 `@tanstack/react-virtual`（~3KB），需自行组装。无内置 UI = 需要写更多 JSX。
- **适配性**：满足 "headless + custom styling" 需求的唯一选项。v9（2026）进一步简化 API。

**AG Grid Community**
- **强项**：功能最全（内置 everything：虚拟滚动、列拖拽、过滤、分组、导出）。企业级验证。
- **弱项**：bundle 巨大（200KB+，即使 tree-shake 仍 ~150KB）。自带完整 CSS 体系，与 DSH 的 `--dsw-*` token 冲突——需要大量 CSS 覆盖。"opinionated" UI 不适合 inline chat card 的紧凑空间。
- **结论**：功能过剩、体积过大、样式不兼容。排除。

**Glide Data Grid**
- **强项**：Canvas 渲染 = 极致性能（10 万行 60fps）。Bundle 中等。
- **弱项**：Canvas 渲染 = 无 DOM = 无法用 CSS Modules 控制单元格样式。无法使用 `--dsw-*` token。可访问性（a11y）受限。
- **结论**：性能优秀但样式集成不可行。排除。

**react-data-grid**
- **强项**：内置虚拟滚动、合理 bundle size。
- **弱项**：自带样式（需 import CSS），定制程度中等。社区维护活跃度一般。
- **结论**：备选方案。如 TanStack Table + Virtual 集成成本过高可考虑。

## Chart Libraries Comparison

| Library | Bundle (gzip) | Line/Bar | Responsive | Animation | TS | React wrapper | License |
|---------|--------------|----------|------------|-----------|----|----|---------|
| **Chart.js 4** | ~40KB (tree-shaken line+bar) | ✅ | ✅ container-query | ✅ smooth | ✅ | react-chartjs-2 (~3KB) | MIT |
| **Observable Plot** | ~30KB | ✅ | ✅ | 无动画 | ✅ | 无官方（DOM 手动挂载） | ISC |
| ECharts 5 | ~100-300KB | ✅ | ✅ | ✅ 丰富 | ✅ | echarts-for-react (~2KB) | Apache 2.0 |
| Recharts 3 | ~50-70KB | ✅ | ✅ | ✅ | ✅ | 原生 React | MIT |
| visx | ~5-15KB per package | ✅ (需组合) | 手动 | 手动 | ✅ | 原生 React | MIT |
| lightweight-charts | ~40KB | ✅ line | ✅ | ✅ | ✅ | 无官方 | Apache 2.0 |

### Detailed Assessment

**Chart.js 4** ⭐ 推荐（v1）
- **强项**：tree-shaking 后仅 line+bar 控制器 ~40KB。`react-chartjs-2` wrapper 成熟稳定。Canvas 渲染 = 高性能。内置 responsive（container resize 自动适配）。动画平滑自然。hover tooltip 内置。
- **弱项**：Canvas 渲染 = tooltip 需要定制才能与 `--dsw-*` token 对齐（但有 HTML tooltip plugin）。不如 SVG 方案可样式化。
- **适配性**：v1 仅需 line+bar + hover tooltip，Chart.js 是最佳 bundle/功能平衡。

**Observable Plot**
- **强项**：极轻量（~30KB）。SVG 输出 = 可用 CSS 控制样式。声明式 API 极简洁。Grammar-of-graphics 风格。
- **弱项**：无 React wrapper（需手动 `useRef` + DOM 操作 + cleanup）。无动画。无内置交互（hover tooltip 需自行实现）。
- **适配性**：如果对"零动画 + 手动 tooltip"可以接受，是最轻方案。但 v1 的 chart 交互需求（hover data point）使其集成成本偏高。

**ECharts 5**
- **强项**：功能最全（30+ 图表类型、动画、交互、主题）。tree-shaking 支持。中文文档完善。
- **弱项**：即使 tree-shake，line+bar 仍 ~100KB+（渲染器+坐标系+组件）。Canvas 渲染。配置复杂。
- **结论**：功能过剩。如未来需要高级图表（热力图、桑基图）可升级。v1 排除。

**Recharts 3**
- **强项**：原生 React 组件（非 wrapper）。SVG 渲染 = 可 CSS 控制。API 简洁。
- **弱项**：bundle ~50-70KB（含所有图表组件）。性能中等（SVG = 数据点多时慢）。大数据降采样需自行实现。
- **适配性**：备选方案。比 Chart.js 大但样式控制更好。

**visx (Airbnb)**
- **强项**：极致轻量（按需 import）。SVG + React 原生。完全可控样式。
- **弱项**：极底层——需要自行组合坐标轴、比例尺、图例。开发成本高。无内置 responsive/animation/tooltip。
- **结论**：适合"需要完全定制"的高级场景。v1 的 line/bar 不值得这个开发成本。

**lightweight-charts (TradingView)**
- **强项**：金融图表优化。Canvas 高性能。
- **弱项**：专为金融时序设计。无通用 bar chart。API 不 React-first。
- **结论**：领域不匹配。排除。

## KPI Card Patterns

无需第三方库——纯 CSS + React 组件。

### 行业模式（Metabase / Superset / Grafana）

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  ▲ 12.5%        │  │  ▼ -3.2%        │  │    —            │
│  1,234,567      │  │  89,012         │  │  456            │
│  总 DAU         │  │  付费用户数     │  │  新增注册       │
│  sum(dau)       │  │  avg(pay_cnt)   │  │  count(reg)     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**布局**：
- 水平 flex wrap（3-4 cards per row，responsive）
- 每个 card：趋势箭头/百分比 → 大数字（主值）→ 标签 → 聚合描述
- Card 高度固定 (~80px)，宽度 flex-grow

**样式**：
- 大数字：`font-size: var(--dsw-font-size-2xl)`, `font-weight: 600`
- 趋势：绿色↑ / 红色↓ / 灰色—
- 标签：`color: var(--dsw-color-text-secondary)`
- Card 背景：`var(--dsw-color-surface-secondary)`，`border-radius: var(--dsw-radius-md)`

**数据源**：`present_table` 的 `kpi_columns` 字段（含 column index + aggregation + label + format）。Client 对 query_data 返回的行数据做 client-side 聚合（sum/avg/max/min/count）。

## Recommendation

### Table: **TanStack Table v8**
- 理由：headless = CSS Modules 完全控制；15KB 极小；TypeScript-first；虚拟滚动通过 @tanstack/react-virtual 补充
- 集成：`@tanstack/react-table` + `@tanstack/react-virtual`（可选，>100 行时启用）
- 总 bundle 贡献：~18KB gzip

### Chart: **Chart.js 4**（tree-shaken）
- 理由：line+bar 仅 ~40KB；内置 responsive + animation + tooltip；react-chartjs-2 wrapper 稳定
- 集成：`chart.js`（按需 import LineController, BarController, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip）+ `react-chartjs-2`
- 总 bundle 贡献：~43KB gzip
- 降采样：Chart.js 内置 `decimation` plugin 支持 >1000 点自动降采样

### KPI: 纯 CSS 组件
- 零外部依赖
- 使用 `--dsw-*` token 体系
- Client-side 聚合（对 ≤50 行数据做 sum/avg/max/min/count——非 heavy computation）

### 总额外 bundle 成本
- TanStack Table：~18KB
- Chart.js + wrapper：~43KB
- **Total: ~61KB gzip**（可接受——对比 AG Grid 单独 200KB+）

### Future 升级路径
- 如需更多图表类型 → 切换到 ECharts（additive，不改 API 表面）
- 如需 10 万行性能 → 考虑 Glide Data Grid（需放弃 CSS Modules 控制）
- 如需完全 SVG 样式控制 → 切换到 Recharts 或 visx

## DSH 现有前端兼容性评估

### 现有依赖现状

DSH 客户端包 third-party 依赖极度克制——绝大多数仅 `clsx`。唯一图表/表格相关依赖：
- `@tanstack/react-virtual ^3.14.9`（`ui-trajectory` 包，虚拟滚动）

**TanStack 生态已有先例**——引入 `@tanstack/react-table` 是同生态扩展，非全新依赖链。

### Bundle 隔离机制保证零影响

DSH client plugin 架构（`tsdown.client.ts`）：

```
PLATFORM_MODULES（全局共享 externals）：
  react, react-dom, @deepseek-ai/cordis, ui-slots, ui-primitives

每个 dynamic plugin 的 lib/client.js：
  ← 自行 inline-bundle 其 dependencies 中的非 platform 库
  ← 通过 __ModuleLoader__.load({id, factory}) 注册
  ← 按需加载（首次 tool result 出现时才 fetch）
```

意味着：
1. **Chart.js / TanStack Table 只 bundle 进 `ui-present-table/lib/client.js`** — 不污染其他包
2. **按需加载** — 只有 data-agent INTERPRETATION 工具触发时才下载，普通用户零开销
3. **无全局 external 注册** — 不进 `PLATFORM_MODULES`，不需要 `dsh.client.external` 声明
4. **per AGENTS.md §4**: "Ordinary installed libraries stay in `dependencies`"——bundled into artifact

### 兼容性矩阵

| 维度 | TanStack Table | Chart.js 4 | 风险 |
|------|---------------|------------|------|
| React ^18.2.0 兼容 | ✅ v8/v9 支持 18+19 | ✅ react-chartjs-2 v5 支持 18 | 无 |
| CSS 冲突 | 无（headless，零 CSS 输出）| 无（Canvas 渲染，零 DOM/CSS）| 无 |
| TypeScript | TS-first | ✅ @types/chart.js 内置 | 无 |
| `--dsw-*` token 兼容 | 完全兼容（开发者 CSS Modules）| 不适用（Canvas）| 无 |
| 现有插件影响 | 零（新 toolview key 注册）| 零 | 无 |
| verify-client-packages | `dependencies` 中的普通库 ✅ | 同上 ✅ | 无 |
| 首屏性能 | 零影响（dynamic 按需加载）| 零影响 | 无 |

### `@tanstack/react-virtual` 重复问题

`ui-trajectory` 已 bundle 一份 `@tanstack/react-virtual`（~3KB gzip）。若 `ui-present-table` 也用虚拟滚动，会 bundle 第二份私有拷贝。

- **影响**：~3KB 重复（两个独立 `lib/client.js` 各含一份）
- **AGENTS.md 规则**：§"Silence means a private copy" — 合规
- **是否需要提升为 shared**：否。两包独立加载时机不同，共享收益 < 维护成本
- **替代方案**：如确实需要共享，可将 `@tanstack/react-virtual` 加入 `PLATFORM_MODULES` 或创建一个 shared wrapper。但当前规模不值得。

### React 19 升级前瞻

- `@tanstack/react-table` v9：已声明 React 19 支持
- `react-chartjs-2` v5：React 18 only；v6（如有）需确认 React 19。fallback：直接用 Chart.js API + `useRef`（无 wrapper 依赖）
- **建议**：v1 用 `react-chartjs-2` v5；React 19 升级时评估是否切换到 bare `chart.js` + useRef 模式（~20 行代码，零 wrapper 依赖）

### 零外部依赖替代方案

若要彻底避免新 third-party：

| 组件 | 零依赖方案 | 成本 | 推荐？ |
|------|-----------|------|--------|
| Table | 纯 `<table>` + CSS Modules | 低（~50 行） | ✅ v1 可行（<50 行无需虚拟滚动） |
| Virtual scroll | 自实现 IntersectionObserver + window | 中（~150 行） | ❌ 不值得（TanStack 3KB 已验证） |
| Chart (line/bar) | 纯 SVG `<path>` + `<rect>` | 高（~300 行，无 tooltip/animation）| ❌ 体验不可接受 |
| KPI cards | 纯 CSS + React | 低 | ✅ 无需库 |

**混合推荐**：
- v1 表格 ≤50 行：纯 `<table>` + CSS Modules（零依赖）
- 虚拟滚动（>100 行时才启用）：`@tanstack/react-virtual`（3KB，已有先例）
- 图表：Chart.js（43KB，唯一合理选择）
- KPI：纯 CSS

**这意味着 TanStack Table core 其实可以不引入**——v1 的 50 行 display cap 用原生 `<table>` 足够。只有当 result cache service 建成（未来支持 >50 行数据）时才需要 TanStack Table 的 headless 能力。

### 修正后的 v1 依赖建议

| 新依赖 | 用途 | gzip size | 条件 |
|--------|------|-----------|------|
| `chart.js` (tree-shaken) | line/bar chart | ~40KB | 仅 `ui-present-table` 有 `chart` intent 时 |
| `react-chartjs-2` | Chart.js React wrapper | ~3KB | 同上 |
| `@tanstack/react-virtual` | 虚拟滚动（>100 行） | ~3KB | 仅未来 result cache 支持大数据时 |

v1 实际额外 bundle：**~43KB**（仅 Chart.js）——且只在有 chart intent 的 `present_table` 调用中加载。无 chart intent 时甚至可以动态 import 延迟加载 Chart.js。

## Sources

- TanStack Table docs: https://tanstack.com/table/v8
- Chart.js docs: https://www.chartjs.org/docs/latest/
- DSH `packages/client/tsdown.client.ts`（bundle 机制）
- DSH `packages/client/web/src/platform.ts`（PLATFORM_MODULES）
- DSH `packages/client/AGENTS.md`（dependency declaration rules）
- Bundlephobia（sizes approximate, based on training data + community reports）
