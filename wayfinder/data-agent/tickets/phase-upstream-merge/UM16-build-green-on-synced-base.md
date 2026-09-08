# UM16 — synced base 上 fix build:official 根 entry 阻塞

**Type**: task · **Status**: open · **Phase**: upstream-merge
**Blocking**: UM14（synced base）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase B）
**= task #1 re-scoped/formalized**（resync-then-fix，不 churn——fix 是 Phase B 最后一步，不跟 re-sync 抢 tsconfig）

## Question

在 UM14 re-sync 后的 synced base 上，fix build:official 的根 entry 阻塞（fork-local, upstreamable），达 build:official green。根 entry 是 upstream 共享 breakage（base+latest 都有，449 没修，upstream master CI 自 8/13 没绿）——re-sync 修不了，必须 fork 本地 fix。

## 根因（2026-09-08 调查，已核）

- 根 tsdown `entry: ['lib/types/{index,invariant,startup}.js']` 被 ~40 个无自己 `tsdown.config.ts` 的子包继承。
- `15f2997bcb cleanup: omit unneeded invariant companions`（8/13→9/4，在 base d347e703 里）删了这批包的 `src/invariant.ts`（acp/api/attachment/boot/bundle/client 等），且这些包从未有 `src/startup.ts` → 继承 entry 找不到 `lib/types/invariant.js`/`startup.js` → "Cannot find entry" 标 `[@deepseek-ai/dsh-root]`（config 属主）。
- 置空根 entry 会暴露**第二个阻塞**：某子包 `lib/types/index.js` 未 emit（不在 tsc host graph references）→ `[UNRESOLVED_ENTRY] Cannot resolve entry module lib/types/index.js`。
- **残留不确定**（设计 fix 时坐实）：tsdown entry glob AND-vs-OR 语义 + 为什么 8/13（post-d4ccfbd80f 加 startup）还是绿的 anomaly。

## 子步

1. 坐实 tsdown entry glob 语义（AND vs OR）+ 8/13 绿的 anomaly（可能 8/13 那次 release.yml 跑了不同代码路径或 tsdown 行为不同）。
2. fix 根 entry（方向待定：置空 host entry 让根 build 只跑 typertPlugin side-effect / 或改默认 entry / 或给继承子包各自 tsdown.config.ts）。
3. fix masked 子包 emit 缺失（接进 tsconfig.host.json references 或其 tsconfig）。
4. build:official green 验证。

## Deliver

build:official green on synced base。

## Resolution

(open；resync-then-fix——fix 在 UM14 之后，不 churn)
## Session A finding (2026-09-08)

tsdown fail（on synced base `8112743d69`）：`[@deepseek-ai/dsh-root] Cannot find entry: ["lib/types/{index,invariant,startup}.js"]`（tsdown 0.22.2 resolveEntry）— root entry 是 upstream-shared breakage。Host tsc green；client tsc（`tsc -b tsconfig.client.json`）~50 errors（见 UM-flow Session A outcome — 多疑 stale typert/catalog 工件下游，CORDIS regen 后解；zombie tsconfig=R-DA）。UM16 应在 CORDIS regen + R-DA 后做 build green。

