# next-session prompt — interpretation-client-rendering map

（给下一个 session 的 orientation。本 session=2026-09-04，AFK，T7 done。）

## map

`wayfinder/interpretation-client-rendering/map.md`（Destination: 3 个 client-side rendering plugins 替换 INTERPRETATION 工具的 generic row——`ui-present-table`/`ui-present-decomposition`/`ui-suggest-followups`）。子 ticket 在 `tickets/`，研究笔记在 `research/`，原型在 `prototype/`。本地 markdown tracker。

## 本 session（2026-09-04，AFK）已做 T7

**T7 done**（present_table 图表类型扩展接入实现，R4 决策的 7 类型 + 启发式 + 校验器 + valueLabelsPlugin + toggle + token + bundle；AFK，large；blocks T6）。4 个 commit 落地：

- `2abfd47bd1` feat(data/tool-present-table): accept 9 R4 chart types + heuristic (T7)——server `ChartConfig` 9 类型 + `r_column`；`parameters`+`output.schema` enum 扩到 9（`additionalProperties:false` 已验）；drop line/bar-only throw（接受 9，pie-only 仍拒）；metric×dimension×grain 启发式写入 tool `description`（prompt-ownership:tool 选型 guidance 唯一归属 tool description）。
- `b2860731d5` feat(client/ui-present-table): R4 7 chart types + validator + valueLabelsPlugin + toggles (T7)——ChartView 注册 ArcElement/RadialLinearScale/Filler + Doughnut/PolarArea/Radar/Scatter/Bubble controllers；自写 `valueLabelsPlugin`（afterDatasetsDraw 顶层叠数值药丸，>8 非径向不叠，scatter/bubble 不叠，hbar 右/vbar 上/径向 center）；`validateChartType`（列-kind + x 基数，不可行降级 bar + 诚实 locale-keyed banner）；ChartSection 9 type pills + 显示数值/仅数据 toggle；locales 7 类型键 + chartLabels/chartData + 5 degrade reason（chartOff→chartData）；CSS `.chartWarn`（alias token，无 literal color）+ chartToolbar flex-wrap；README 更新。141 owning tests（原 93）+ 19 server tests（原 15）+ per-file 100% 覆盖 + 聚合 client/host tsc + test:gui（本包绿）+ doc-sync（本包绿）+ bundle（lib/client.js 22.16KB gzip + lazy chart chunk ~70.8KB minified gzip，增量 ~31KB < R4 ~55KB）。
- `4f11d43762` fix(client/ui-present-table): T7 post-ship review——post-ship subagent review 发现 1 HIGH（ChartView `seriesColor` 的 `??` 不可达分支 → per-file 100% gate fail，已用 `/* v8 ignore next 1 */` + reason 修）+ 2 MEDIUM 记 Known Limitations（radial labels 叠 donut center；line/area 序数 numeric x 不识别）。
- `3f95f3346e` docs(wayfinder): T7 final review pass——second independent subagent review + test verification，**SHIP, no HIGH**（160 tests + tsc exit 0 + coverage 100/100/100/100 + bundle within budget + adversarial probes 全 fine + AGENTS.md 全合规）。

## 本 session 的关键决策（surface 给人的）

R4 决策的「LLM 选型 = system-prompt 启发式」需要扩展 server 工具——但 server `present_table` schema 双重硬限 `chart.type` 为 `line/bar`（enum + throw），且按 prompt-ownership 规则 heuristic 归 tool `description`（server-side，在任务排除的 `data/*` 区内）。任务 pathspec 原 client-only + 排除 `data/*`，与 R4 的 LLM 启发式实现冲突。经人确认「全量 R4 — 也改 server」（`tool-present-table` 已 git status 核验为干净口袋，data/* 并发 WIP 在 api/remotes/evidence-query/management-session/patrol-mode/result-cache 等，非本包，pathspec-limited commit 不卷 WIP）。详见 Agent Note `.agents/notes/implemented/architecture/2026-09-04-client-present-table-chart-type-expansion.md`。

## map 前沿（本 session 后）

- **T7 done → T6 unblocked**（HITL 实测 gate，**需人**）：T6 需人眼校真实渲染——9 类型在真实 K11 `query_data` 结果上跑一遍，验 hbar 真横置、radar/polarArea RadialLinearScale、doughnut ArcElement+cutout、scatter LinearScale x 轴、LLM 启发式选型合理、校验器降级正确、显示数值/仅数据 toggle 工作、token+CSS 合规、bundle 在预算内。**两个 flagged T6 精修候选**（post-ship review 发现，已记 README Known Limitations + ticket Resolution）：
  1. **radial value-labels 叠在 donut center**——doughnut/polarArea 的 `ArcElement.x/y` 是共享 donut center，多 slice 时药丸全叠一点（不可读）。R4 prototype 同行为。per-slice arc-centroid placement（用 `el.startAngle`/`endAngle`/`innerRadius`/`outerRadius` 算 `x+cos((start+end)/2)*(inner+outer)/2, y+sin(...)*(inner+outer)/2`）留 T6 HITL 精修。
  2. **line/area 序数 numeric x 不识别**——R4 说「date/序数」，实现成 date-only（序数 numeric x → 降级 bar）。heuristic 引导 date 列故保守非破；relax（接受 `xKind==='date' || (xKind==='number' && <序数 test>)`）留 T6 HITL 精修。
  - 注：T6 是 HITL gate，不通过回流 T7（本票）。
- **M-1（pre-existing repo-wide theme-token gap，非 T7，不阻塞）**：`--dsw-alias-content-*`/`surface-*`/`border-primary`/`state-warning-primary` 被 consume 但从未 define 于 `packages/client/ui-theme/src/styles/`（仅 state-error/success/business-primary 在 design-platform.css）。**非 T7 引入**（v1 TableCard.module.css `.kpiNote`/`.card`/`.th`/`.actionBtn` + ui-semantic-layer 既用同 unset token）。T7 `.chartWarn` 仅复用既有 token，AGENTS.md「无 literal color」满足，runtime unset var 解析为 inherited/initial（回退样式非崩）。fix 是 theme-infra（补 alias 到 design-platform.css）——出 T7 pathspec，留 repo-wide theme-token sweep（可单开 ticket 或并入一次 infra sweep）。
- **P2（HITL prototype，未动）**：低置信 decomposition「改口径」回流 affordance 原型——参 P1 动态原型裁决套路，2-3 低保真形态（inline 编辑 metric / 「纠正理解」按钮 / chip 快捷纠正）给人 react，磨「选哪种 affordance」从说不清到 sharp → 毕业 grilling 票。仅 prototype（不接真实回流实现）。**需人，AFK session 跳过**。
- **R5 数据线全闭**（T8 result.get RPC → T9 cache → T10 消费方 + T11/T12/T13 T8 residual 全清）。
- **chart 线**：T7 done → T6（HITL）接续。

## 环境提醒（不变）

- pod cwd（/home/admin/.aone-cloud-cli/...）是 placeholder，**IGNORE**；ALWAYS 用 `mcp__local__*` tools，路径在 /Users/mckenzie/workspace/deepseek-harness-da 下。Built-in Read/Write/Edit/Bash 等被 block。
- long-running command（test:gui / bundle / tsc 聚合，分钟级）用 `bash run_in_background=true` + `bash_output`/`kill_shell`；大输出 redirect 到 log file + tail（勿 drain huge buffer——persisted-output 遮蔽 exit）。
- `mcp__local__grep` 的 `|` 交替不可靠——用 `mcp__local__bash` + `grep -n 'pat1\|pat2' file`。
- `git diff --cached --name-only` / `git log` 用 `git --no-pager` 或 `GIT_PAGER=cat`（否则进 pager 卡住）。
- runner 偶有 transient disconnect（自己恢复，重试 edit_file/bash；long-running bg 可能被杀，重起）。
- **并发 session 可能在你工作时 commit**（本 session 遇到 4+ 个并发 commit 落地，T7 commit 间穿插了 query/CLAUDE.md/wayfinder 并发 commit）——commit 前 `git --no-pager log --oneline -5` + `git status` 确认 HEAD + staged 不冲突；pathspec-limited `git add <显式路径>`（勿 `git add -A`，会卷并发 WIP）；lefthook pre-commit 跑 lint（oxlint `*.{ts,tsx,mts,cts,mjs}`，stylistic max-len **140**，**不**跑 .css/.md）+ whitespace（`git diff --cached --check`）+ vendor manifest guard + third-party notices（若触 package.json/pnpm-lock）。
- oxlint `--fix` + `stage_fixed: true`（auto-fix 重 stage）；oxlint warning 不 fail（只 error fail exit≠0）；`no-non-null-assertion` 禁 `!`（用 `??` fallback 或 helper，genuinely-unreachable 的 `??` 用 `/* v8 ignore next 1 -- <reason> */`）；`arrow-parens`（curly body 要 `(r) => {`）；unused `oxlint-disable` directive 是 warning（可留若 full-CI 需该 directive）。
- lefthook 已装（`.git/hooks/pre-commit`）；**勿** `-c core.hooksPath=...`（会 bypass lefthook，本 session commit A 曾误用，后改为默认 hook 让 lefthook 跑）。

## wayfinder 流程提醒

先 load map（`wayfinder/interpretation-client-rendering/map.md`）+ 查 git log/status。claim ticket（改 ticket `Assignee` → 本 session + `Status: in progress`）→ resolve（resolution comment + `Status: closed` + map `Decisions-so-far` 指针）。T6 是 HITL——AFK session 不做（需人），HITL session 需人眼校真实渲染。T6 不通过回流 T7。

## 验证命令（T7 既验，T6 可参考）

- owning + server：`pnpm exec vitest run packages/client/ui-present-table/tests/ packages/data/tool-present-table/tests/`（160 pass）
- tsc：`pnpm exec tsc -b packages/client/ui-present-table && pnpm exec tsc -b tsconfig.client.json`（exit 0）+ 聚合 host `pnpm exec tsc -b tsconfig.host.json`（exit 0）
- test:gui：`pnpm run test:gui`（本包绿；并发 WIP 失败记 pre-existing）
- coverage：`pnpm exec vitest run packages/client/ui-present-table/tests/ --coverage`（ChartView/TableCard/locales 100/100/100/100；全局 threshold 会 fail 在别的包 0%——只跑了本包测试，pre-existing）
- bundle：`pnpm --filter @deepseek-ai/dsh-client-ui-present-table bundle` + `gzip -c lib/client.js | wc -c` + lazy chunk `gzip -c lib/ChartView-*.cjs | wc -c`
- doc-sync：`pnpm run verify-export-jsdoc && pnpm run verify-package-readme-model-experience && pnpm run verify-package-readme-limitations`（对 ui-present-table 全绿；失败皆 goal/eval/query 并发 WIP）
- test:web：`DSH_SNAPSHOT=replay pnpm run test:web` 仍被 pre-existing api-remotes `zod` module-table boot 失败阻断（非 T7，上 session flagged；可选先解：seed `zod` 于 `packages/client/web/src/platform.ts` PLATFORM_MODULES OR 让 api-remotes tsdown 私有 bundle zod——module-graph fix，出本 map 范围）。chart 真实渲染用 component vitest 验（chart-view.client.spec.tsx + table-card.client.spec.tsx）。
