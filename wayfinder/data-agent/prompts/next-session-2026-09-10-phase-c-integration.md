# 📌 Session 进度（2026-09-10 实际完成）—— 优先读此节，再读下方原 plan

## 已完成

- **Phase-C step 1**：lint fix `a99d206835` FF-merge 进 master（master @ `1ce197b873`，ahead origin/master 8，未 push master）。
- **Phase-C step 2**：4 worktree 分支 merge 进 resync `upstream/resync-2026-09-08`（tip `ac6c8c6c2b`）：UM-ARCH（FF）+ UM-CORDIS（`--no-ff` `d4f2752c15`）+ R-DA-P1（`--no-ff` `e67ecc6541`，2 overlap commits git 识别为已应用）+ UM16（`--no-ff` `5cae53421f`，冲突解决）。
- **UM16 冲突解决**（`result-cache/src/types.ts` + `result-cache-memory/src/index.ts`）：取 UM16 本地 `Json` type + `readonly (readonly Json[])[]` rows，弃 CORDIS subtask 1 的 `JsonValue[][]`。决定性：`result-cache/src/index.ts`（auto-merged）`export type { Json, ... } from './types.ts'` re-export `Json` → 必须留 UM16 的 Json 定义。删 CORDIS 的 now-unused `JsonValue` import。tool-compute auto-merged 成混合态（CORDIS `as JsonValue[][]` cast + UM16 `CodeJsonValue[][]` return），留不动——build:lib:host + UM10 双绿证 typecheck 通过（`JsonValue`↔`Json` 结构兼容）。
- **拓扑已验**：master **pre-sync**（不含 synced base `8112743d69`/resync tip `2ec25f74f1`）→ 非 push 目标；resync 是 synced 线；4 分支都从 resync tip `2ec25f74f1` 分出；R-DA-admin 在更老 `merge-2026-09-07`（`558e6f4f66`）base。synced base = `8112743d69`（UM14），resync tip `2ec25f74f1` = synced base + 2 UM14 doc commit。
- **build:lib:host 绿**（pre-push gate）：`PATH="/usr/local/bin:$PATH" pnpm run build:lib:host` exit 0（`tsc -b tsconfig.host.json` + tsdown 全 host 包；PLUGIN_TIMINGS 是 perf hint 非错误）。
- **UM10 typecheck**：`tsc -b tsconfig.client.json` = **325 errors**（与 UM16 基线一致；4 merge + UM16 resolution 净增 0）。UM16 解决的 3 文件（`data/result-cache/types.ts`、`data/result-cache-memory/index.ts`、`data/tool-compute/index.ts`）= 0 error（client-verified，铁律满足）。注：`tsc -b` exit 0 despite 325（errors 全在 `*.client.spec.ts(x)` 测试文件，build-mode emit 不因测试 type error 失败）→ `build:lib:client` tsc 步"过"但 UM10 跟 325→0 才算真绿（`build:official` 未绿）。
- **Follow-on 1（UM-CONNECTION-FIXTURE-DEAD-APICLIENT）部分**：删死 `FixtureApiClient extends AbstractApiClient` subclass（`fixture.ts:3963-4105`，commit `ac6c8c6c2b`）→ 325→**287**（删 38）。pre-check 无外部 SOURCE ref（仅 stale `lib/.../fixture.d.ts` build artifact，rebuild 重生）。

## node 环境（handoff 陈旧，必读）

nvm 只装 v20+v25（**无 v24**）；`nvm use system` 报 v24.15.0 但被 nvm v25 bin shadow（PATH 顺序问题）。用 `/usr/local/bin/node` v24.15.0 直接：`PATH="/usr/local/bin:$PATH" node ...`（push/需 v24 时同此）。如要 nvm-managed v24：`nvm install 24`。

## Follow-on 1 剩余（3 error，pre-existing，非删除引入）

`fixture.ts:3735-3736` 新 api 对象的 `results` handler：`results: { get: request => err(request, {code:'result-not-found', message:..., details:{resultId}}) }`
- (a) `results` 不在 `FixtureWorkspaceApi`（错位/类型不含；同对象的 `downloads` 没报错 → FixtureWorkspaceApi 含 downloads 不含 results）。
- (b) `request` 隐式 any（需类型）。
- (c) `err` 未定义（file 无 def；`:2140` 有 `sessionErr<T>(error: ConnectionRpcFailure)` 但 session-typed）。
需 `result.get` 契约（result-cache types.ts：`'result-not-found': {resultId}` failure）+ api 对象结构 + error-helper 调查。BEFORE log `/tmp/dsh-um10-client-tsc.log`（325）含此 3 error（确认 pre-existing）。

## 未做（下 session 优先级）

1. **Follow-on 1 剩余 3 error**（results handler，见上）。
2. **Follow-on 2 UM-CLIENT-CONFIG-CLEANUP**（surface D+E ~58，纯 config）：D(44) `api/remotes/tsconfig.client.json` rootDir=`api/remotes/src` 但 project-ref 拉 `data/semantic-layer`/`evidence-query`/`audit`/`identity` src（rootDir 不匹配 → TS6059/6307，改 composite `references` 各自 rootDir 或 path maps 指 built `lib/`）；E(14) `@types/node` 缺（`data/audit` `node:crypto`、`evidence-query` `node:fs`/`node:path`、`audit/store.ts` `NodeJS`、`semantic-layer` `node:sqlite` → TS2591/2503，tsconfig `types`/`lib` 加 `@types/node`）。
3. **Follow-on 3 R-DA-TYPERT-REMOTE-REGISTRATION**（adaptive B+C+G ~81，18 包，大 sprint 多 session）：每 domain 声明 `src/remote.ts`（`@Remote('method')` marker + `XRemote` interface + `XRemoteGateway`）扩 `ClientRemote`，模板 `packages/data/result-cache/src/remote.ts:73`。fork data-agent 包（evidence-query、schema-gateway）须声明 remote 加入 `ClientRemote`。按 domain 分片。
4. **UM11 post-merge + UM12**（GA-FORK-CI re-sweep）——UM10 绿（325→0 via follow-ons）后。
5. **push（方案 D 缓）**：不发布 sync（325 client 未绿）；UM10 绿后 UM11 PR（resync→master）。**master pre-sync（非 push 目标）**；resync 是 synced 线。R-DA-admin 在更老 `merge-2026-09-07` base（未并入 resync，cross-base rebase 风险）。
6. **worktree 清理**：维持现状（不清）；收尾时清 4 个已并进 resync 的 + dsh-arch(旧) + dsh-upstream-merge(R-DA-admin rebase 后)。

## 关键 git 状态

- master `1ce197b873`（ahead origin/master 8，未 push）。
- resync `ac6c8c6c2b`（4 Phase-C merge + dead-class 删除）；dsh-resync worktree = resync 工作分支（UM10/follow-ons 在此跑，用 `PATH="/usr/local/bin:$PATH"` + v24）。
- 4 worktree 分支已并入 resync（dsh-arch-regen/dsh-cordis/dsh-rda-p1/dsh-um16）；dsh-rda-admin 未并入（更老 base）。

---

# Next-session prompt — Phase-C 集成 + push + 3 follow-on 票启动

**Session 起始日期**：2026-09-10（或用户认领当日）
**上一 session 交付**：Phase-B-clear 4/4 done + 铁律重验（UM-ARCH / UM-CORDIS 1+2 / R-DA-P1 / UM16，全在 worktree、无 PR）+ grill Q1=Plan B 记录（ticket Resolution + ADR-0002 双语）+ Q3 apiproxy-fallout research 关闭（mixed verdict ~68 surface + ~122 adaptive）+ 3 follow-on 票（UM-CLIENT-CONFIG-CLEANUP / UM-CONNECTION-FIXTURE-DEAD-APICLIENT / R-DA-TYPERT-REMOTE-REGISTRATION）+ UM1-9 triage 应用（6 archive / 1 fold / 2 leave-open）+ UM-ADAPT per-shift（seam-4→Plan B、workspace-files N/A、invariant-cleanup→UM16）。master commit `459a494ee5`（在 `fix/lint-noop-assertion-unused-disable` 分支，含 lint fix `a99d206835`）。

## ⚠️ 开场纪律（复述后停下等确认再动手）

复述以下三段，打给用户看，STOP，用户确认后再进行动。有偏差请指正。

### 核心主题（不可偏离）

destination = `deepseek-harness-da` → `deepseek-harness-data-agent`。本 flow 聚焦 **upstream-sync 维度** 三大需求。Phase-B-clear（清障）+ Phase-B-adapt grill（决策）**已 done**；本 session 推进 **Phase-C 集成**（merge 4 worktree 分支 + push + UM11 post-merge）+ **3 follow-on 票**启动（config cleanup + connection fixture + Typert Remote sprint），喂 UM10 typecheck-green。

### 上 session 关键结论（用户已确认，直接采用）

- **grill = Plan B**（ADR-0002 `docs/adr/0002-ui-presenter-composition-plan-b.{md,zh.md}`）：keep `tool.call.toolview`（upstream slot）+ repoint imports + re-home `blockText` + 解 `isLatestTurn` gap；**非 Plan A**（architecturally misplaced——presenter 是 tool-name sub-view 由 `ToolCallTree` 渲染，非 view-tab/node-kind；`projectBlock` 不算 isLatestTurn/blockText）。Phase-2（4 presenter 迁移）+ Round 2（isLatestTurn gap 解法，lean 给 `ToolCallOwnerProps` 加 `isLatestTurn: boolean` 由 `ToolCallTree` 传下）留 Phase-2 session。
- **Phase-B-clear 4/4 done**（worktree 内、未 PR）：
  - UM-ARCH：`dsh-arch-regen` @ `038d8b51ce`（`chore/um-arch-regen-2026-09-09`，`verify-architecture-graph` green；PR 待 Phase-C）。
  - UM-CORDIS：`dsh-cordis` @ `cc6d9e714e`+`193b018827` + cherry-pick `c153769387`+`86f6b9f927`（`task/um-cordis-regen-2026-09-09`）；subtask 3 deferred——blocked by RootOwnerProps homing。
  - R-DA-P1：`dsh-rda-p1` @ 5 `[R-DA-P1]` commits（`refactor/rda-client-runtime-phase1-2026-09-09`）。
  - UM16：`dsh-um16` @ 3 `[UM16]` commits（`task/um16-root-entry-2026-09-09`，`build:lib:host` green on node 24；`build:official` 未绿——325 apiproxy errors 独立 workstream）。
- **Q3 mixed verdict**：`build:lib:client` 325 errors = `4f00a8b82a` apiproxy-removal fallout；~68 surface（config D rootDir+E @types/node；F UM16-owned）+ ~122 adaptive（A fixture.ts dead AbstractApiClient + B/C/G Typert Remote adoption 18 包）；types REPLACED not moved（无 repoint target，已验）。3 follow-on 票已开。

### 本 session 推进的两条线

**Phase-C 集成（主线）**：merge 4 worktree 分支（UM-ARCH + UM-CORDIS + R-DA-P1 + UM16）进 synced base/master → push UM-ARCH PR + R-DA-admin（node 24）→ UM11 post-merge cleanup → UM10 typecheck-green（3 follow-on 票喂它）。

**3 follow-on 票（并行）**：UM-CLIENT-CONFIG-CLEANUP（surface D+E ~58，小）+ UM-CONNECTION-FIXTURE-DEAD-APICLIENT（adaptive A 41，小）+ R-DA-TYPERT-REMOTE-REGISTRATION（adaptive B+C+G ~81，18 包，大 sprint）。

## 环境 & 纪律

- 主仓 `/Users/mckenzie/workspace/deepseek-harness-da`（当前分支 `fix/lint-noop-assertion-unused-disable` @ `459a494ee5`；merge 到 master 前确认）。
- worktree 仍在：`dsh-arch-regen`、`dsh-cordis`、`dsh-rda-p1`、`dsh-um16`、`dsh-resync`（`upstream/resync-2026-09-08` @ `2ec25f74f1` = synced base）、`dsh-rda-admin`（`refactor/rda-admin-lazy-webserver-2026-09-08` @ `9ba8638eac`，base `merge-2026-09-07`）、`dsh-arch`（旧 `chore/um-arch-impl-2026-09-08` @ `672b60a5d2`）。
- **node v24 必需**（`nvm use system`）：tsdown/build:official/pre-push 在 v24 跑；v25 崩 rolldown（SIGABRT exit 134）+ 破 fs-ext（node-gyp）。push 时 `nvm use system && git push`（pre-push 跑 `build:lib:host`）。
- **主 session 强制用 `mcp__local__*`**（built-in Read/Write/Edit/Bash/Grep/Glob 全 BLOCKED）；subagent 也须用。**`mcp__local__grep` 不可靠（false zero-matches）—— 一律用 `mcp__local__bash` 的 `grep -rEl`/`rg`**（曾因此误判 `ConversationViewRegistry` 不存在）。
- runner 早期 flaky（mid-batch 断连致首批 8 subagent 静默死）；重连后稳定；**foreground 同步返回比 background 异步通知更可靠**（background 通知在 runner 稳定时也工作）。subagent prompt 内置 5× retry + "NO MCP-LOCAL ACCESS" 快速失败。
- **CLAUDE.md 铁律**：subagent 报告 = 未验证断言；主 session 至少重导 1 条关键断言才进产物。
- 提交纪律：`[prefix]` 独立 commit；push 用 node 24；不 `--no-verify`（lefthook pre-push 跑 typecheck）。
- `.tmp` 未被 gitignore——`git add` 用具体 path（不 `add -A`，免提交 subagent scratch `.tmp/next-*.md`）。

## Phase-C 集成步骤（主线）

1. **确认主仓分支**：`fix/lint-noop-assertion-unused-disable` @ `459a494ee5`——merge 到 master 再开始 Phase-C，或在该分支继续（用户定）。
2. **merge 4 worktree 分支**：UM-ARCH + UM-CORDIS + R-DA-P1 + UM16 的 commits 合进 synced base（`upstream/resync-2026-09-08`）或 master。注意：R-DA-P1 的 2 删除已 cherry-pick 进 dsh-cordis（merge 时 git 处理同 patch，无冲突）；UM16 的 root-entry fix 是 pre-push 解锁关键（所有 synced-base-derived 分支 push 都需它）。
3. **push UM-ARCH PR**：`dsh-arch-regen` 分支 push（node 24，pre-push `build:lib:host` green）+ `gh pr create`。
4. **push R-DA-admin**：`dsh-rda-admin` @ `9ba8638eac` push（node 24）+ `gh pr create`。注意它在更老 base `merge-2026-09-07`——可能需 rebase 到 synced base 或确认 UM16 root-entry fix 覆盖（跨 base cherry-pick 风险）。
5. **UM11（PR synced+改造+build-green）**：merge 后跑 post-merge cleanup。
6. **UM10（typecheck-green gate）**：跑 `tsc -b tsconfig.client.json`（node 24）确认 325 errors（或 raw resync 206）—— 喂 3 follow-on 票修。

## 3 follow-on 票（并行，喂 UM10）

- **UM-CLIENT-CONFIG-CLEANUP**（surface D+E ~58）：tsconfig rootDir/project-ref topology（`api/remotes/tsconfig.client.json` rootDir 不匹配）+ `@types/node` 缺。小，AFK-safe。
- **UM-CONNECTION-FIXTURE-DEAD-APICLIENT**（adaptive A 41）：删 `connection/src/client/fixture.ts:3967-4101` 死 `FixtureApiClient extends AbstractApiClient` + override、留 `ClientConnectionRpc`。小（fixture 已半迁）。
- **R-DA-TYPERT-REMOTE-REGISTRATION**（adaptive B+C+G ~81，18 包）：每 domain 声明 `src/remote.ts`（`@Remote('method')` marker + `XRemote` interface + `XRemoteGateway`）扩 `ClientRemote`，模板 `packages/data/result-cache/src/remote.ts:73`。**大 sprint，多 session**——建议分批认领（按 domain 分片）。fork data-agent 包（evidence-query、schema-gateway）须声明 remote 加入 `ClientRemote`。

## Deferred（非本 session）

- **Phase-2（4 presenter 迁移 per Plan B）+ Round 2（isLatestTurn gap 解法）**：另开 session，需 QA。Plan B 执行体见 R-DA-UI-PRESENTER-COMPOSITION ticket Resolution + ADR-0002。
- **UM-CORDIS subtask 3（gen-client-catalog）**：blocked by RootOwnerProps homing（R-DA decommission step）——先解 `RootOwnerProps` 归属（R-DA-P1 指出 true owner=ui-slots SlotCore、true occupant=ui-layout AppFrame；当前在 zombie `runtime/slots.ts` re-export at `runtime/index.ts:38`）再跑 subtask 3。
- **UM-ADAPT 剩余 shifts**（agent-inbox durable projection、subprocess native containment、session-format v0→v2 migration）：UM15 训练样本，低优先。
- **count discrepancy**：UM16 报 325 vs raw resync tsc 206（delta = UM16 Commit 1 删 runtime apiproxy ref 后 ambient 可见性消失，暴露更多 bare-ref）；非决策阻塞，可在 dsh-um16 worktree 重跑 `tsc -b tsconfig.client.json` 确认。

## 下一 session 认领时的自检清单

- [ ] 复述三段（destination / Phase-C 集成 + 3 follow-on / 上 session 结论）
- [ ] 用户 OK 后，确认主仓分支（merge `fix/lint-noop-assertion-unused-disable` to master，或继续该分支）
- [ ] Phase-C：merge 4 worktree 分支（注意 UM16 root-entry fix 覆盖所有 push）+ push UM-ARCH PR + R-DA-admin（node 24，`nvm use system`）
- [ ] UM11 post-merge cleanup + UM10 typecheck-green（确认 325 errors，喂 3 follow-on）
- [ ] 3 follow-on 票：启动 UM-CLIENT-CONFIG-CLEANUP + UM-CONNECTION-FIXTURE-DEAD-APICLIENT（小，并行 subagent）；R-DA-TYPERT-REMOTE-REGISTRATION 分批认领（按 domain 分片）
- [ ] 重导关键断言（铁律：subagent 报告 = 未验证断言，主 session 重跑 ≥1 条 verify）
- [ ] 更新 `map.md` + UM-flow（Decisions so far 加 Phase-C 结果 + follow-on 进度）
