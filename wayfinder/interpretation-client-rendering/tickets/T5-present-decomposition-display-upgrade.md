# T5: present_decomposition 展示层优化执行(Phase 0-2)

**Type**: task (AFK)
**Status**: ✅ resolved(2026-09-01,本会话执行)
**Blocked by**: [R9](R9-decomposition-display-optimization-plan.md)、[P1](P1-decomposition-prototype.md)(裁决口径)
**Related**: [T4](T4-present-table-display-upgrade.md)(present_table 同型回合的执行范式:协议修复→分层→测试+快照)

## Question

按 R9 方案与 P1 裁决,在 `packages/client/ui-present-decomposition/`(Mode 3)执行 Phase 0-2。

## Resolution

全部落地,P1 三轮裁决口径逐条折回:

**Phase 0 正确性**
- A1 token 修复:`DecompositionCard.module.css` 全量重写为真实 alias(`border-l2`/`bg-layer-1`/`bg-layer-2`/`bg-skeleton`/`label-primary|secondary|tertiary`/`interactive-bg-hover`/`state-warn-*`/`state-error-primary`/`state-business-primary`)。
- A2 `block.isError` → `role="alert"` 错误框(标题/详情/提示行,对齐 FollowupChips ErrorState)。
- B1 locale:`src/client/locales.ts`(zh 源 + en 全量,`present.decomposition` namespace)+ `ctx.locale.register` + 注册带 `locale: NS`;manifest 补 locale peer+dev 与 `dsh.client.inject` 行,tsconfig 补 `../locale` reference。
- B2 parseArgs 防御:全字段校验归一(非数组 dimensions/filters→[]、非字符串 time_range→''、越界 confidence→undefined、非法 metric 条目跳过、空 unit/source→缺省),脏数据一律降级 text fallback,render 不可能 throw。

**Phase 1 编排(P1 定稿)**
- 焦点行:eyebrow「查询理解」+ summary 标题(省略+title)+ 置信度徽标常显数值(<0.7 warn 徽标+容器描边+警示行)。
- 谱系 chips:时间→维度(实底)→筛选(虚线)→来源(描边)单行 wrap,全缺省时整行不渲染。
- 指标常显网格:`repeat(auto-fill, minmax(190px,1fr))`,名称(+单位)上行、mono 口径下行(省略+title),caption「将计算 · N 项」,复合 key 防碰撞。
- 折叠态保留焦点行 + 时间/维度 mini chips(≤3)。

**Phase 2 一致性**
- `useSession` latest-turn 探测:非最新 turn 默认折叠,用户 toggle 永远优先(`toggled ?? !isLatest`)。
- header `aria-expanded` + focus-visible outline;与 FollowupChips 的容器/chip/列表语言对齐。

**验证阶梯**
- 组件/apply/invariant specs:**30 tests 全绿**;per-file 覆盖率 **100%**(stmts/branch/funcs/lines,含 #300 纪律分支:折叠↔展开、场景切换、脏数据分支)。
- `tsc -b` 该包项目 0 错误(exactOptionalPropertyTypes 以条件展开满足);`tsdown` bundle 绿。
- `verify-client-packages`:本包 **0 违规**(见下方交接注)。
- `pnpm run test:gui`:**306 文件 / 4211 passed / 1 skipped,全绿**。
- `DSH_SNAPSHOT=replay pnpm run test:web`:build 绿;**5 个 e2e spec 失败,均与本包无关**——`code-mode-round`(缺 code runtime:"mode 'code' requires a code runtime …")与 `smoke-real`(provider request 10s 超时,真实 API 环境);`apps/web/tests` 无任何场景引用 `present_decomposition`,本卡改动对 e2e 快照不可见。
- README Model Experience 重写为新卡片语义;P1 动态原型(qdec-1)已 `cordis_stop`,按 P1 决议标记作废,真实流量由本包接管。

**交接注(非本票范围,AGENTS 规定记录)**:`verify-client-packages` 在 ui-context-layer / ui-present-table / ui-semantic-layer 报既有违规(并发工作面);`code-mode-round`/`smoke-real` e2e 失败同属该工作面/环境,留待其所属 PR 窗口清扫。
