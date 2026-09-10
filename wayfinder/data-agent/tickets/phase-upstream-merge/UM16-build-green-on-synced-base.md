# UM16 — synced base 上 fix build:official 根 entry 阻塞

**Type**: task · **Status**: resolved（2026-09-10，UM10 线 A）· **Phase**: upstream-merge
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

**[2026-09-10] RESOLVED — `pnpm run build:official` GREEN on synced base（exit 0）。**

2026-09-09 本票记为 resolved-partial：`build:lib:host` green on node 24，但 `build:official` 仍报 **325 apiproxy-removal errors**，划为「独立 workstream」。[UM10](UM10-verify-typecheck-lint-ci-gates.md) 线 A（2026-09-10）实测：那 325 条已被 Phase-2（`eb9e4cf05c`）+ Follow-on-3-B 全部消化，**唯一残留阻塞是 1 个 spec 类型错误**——`evidenceQueryBridge.client.spec.ts:29` 的 `satisfies EvalDeltaReport` 挂错层级（挂在内层 `summary` 上）。修掉后 `build:official` 直接 green。

- 修复 commit：`ecaa56c848`（resync branch `upstream/resync-2026-09-08`）。
- node v24.15.0 强制（v25 crashes tsdown/rolldown——本票原 critical finding，仍成立）。
- 根 entry 阻塞（本票原根因，upstream 共享 breakage）由 2026-09-09 的 3 个 `[UM16]` commits 解决，本次未再触。

**Deliver 达成**：build:official green on synced base。本票关闭；`build:official` 已可作为 UM11/UM12 的构建前提。
