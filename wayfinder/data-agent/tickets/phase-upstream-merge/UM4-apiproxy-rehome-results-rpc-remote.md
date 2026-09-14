# UM4 — apiproxy 重落户：results-RPC → packages/api/remotes；presetSwitches → data-agent（A6）

**Type**: refactor
**Phase**: upstream-merge
**Status**: open
**Assignee**: unclaimed
**Blocked by**: ~~UM1, UM3~~ → **已解除（2026-09-10 重评）**：UM1/UM3 均 archived（done via re-sync `8112743d69`），R-DA-CLIENT-RUNTIME-DECOMMISSION Phase-1+2 亦已 resolved。**本票现 unblocked。**
> **重评注（2026-09-10，UM10 线 A）**：UM10 实测发现本票的 results-RPC re-home **留了尾巴**——`packages/bundle/data-agent/cordis.patch.yml` mount 了 `@deepseek-ai/dsh-result-cache/src/remote.ts`（result-cache-gateway，本票从 apiproxy re-home 的产物），但 ① bundle `package.json` 只声明 `dsh-result-cache-memory`、缺 `@deepseek-ai/dsh-result-cache`；② `tsconfig.base.json` 缺 `@deepseek-ai/dsh-result-cache/src/*` 映射。这是 `verify-cordis-config` 红的根因，`git blame` 该 mount 行 → `6b7610d45a`（upstream-merge commit），属本票域而非 Phase-2。**注意包名易混**：`packages/data/result-cache` = `@deepseek-ai/dsh-result-cache`；`packages/client/result-cache` = `@deepseek-ai/dsh-client-result-cache`。
**Blocks**: UM6, UM7, UM8（knip 死指针依赖此）
**Related**: d5 A6（`.tmp/audit/d5-upstream-impact.md` line 14）；[T8-result-get-rpc](../../../interpretation-client-rendering/tickets/T8-result-get-rpc.md) + [T9](../../../interpretation-client-rendering/tickets/T9-result-cache-package-impl.md)/[T10](../../../interpretation-client-rendering/tickets/T10-consumer-fetchResult-wiring.md)/[T11](../../../interpretation-client-rendering/tickets/T11-connection-fixture-results-arm.md)/[T12](../../../interpretation-client-rendering/tickets/T12-harden-result-cache-per-review.md)/[T13](../../../interpretation-client-rendering/tickets/T13-runtime-fakeapiclient-results-arm.md) 簇、[B-DA1](../phase-misc/B-DA1-preset-switch-tool-interrupt-race.md)、[harness-package-removal research](../../research/harness-package-removal.md)；upstream `4f00a8b refactor(api): remove ApiProxy package` + Remote controllers 迁移链

## 背景

upstream `4f00a8b refactor(api): remove ApiProxy package` 删了整个 `packages/host/apiproxy`（ls-tree 确认 upstream 已无此目录）。前导：`ce3391e retire migrated unary routes`、`fd7f206 !: remove settings and credentials RPCs`、`6e40876 !: remove directory-picker RPCs`、`243f662 delete the goal unary domain`。替代：`packages/api/remotes/`（`src/{client/index.ts,index.ts,remote-events.ts,types.ts}`）+ `refactor(connection): own RPC transport contracts` + `refactor(api): converge the Remote failure vocabulary` + `refactor(client): consume migrated Remote namespaces`。

fork 的 `packages/host/apiproxy/src/api-proxy.ts`（grep 确认 fork 仍有）含两块：
- **(a) presetSwitches 并发重写**（d5 A6 / B-DA1 partial-fix）：`swapPreset` 同步预留 slot（`:3024`）+ recompose `await queued` + turn `await pendingSwitch`（`:2397`）。Comment 自承 driver："a mid-flight rebind destabilizes the agent's scope observers"（data-agent scopeId）。
- **(b) additive `results.get` RPC 域**（d5 line 14 判 LEGITIMATE-EXTENSION / KEEP）：`results.ts`/`results.schema.ts`/`rpc-map.ts`/`fetch/client.ts`/`fetch/handler.ts`/`api-proxy.ts` handler/`index.ts`——"textbook additive domain"。T8-T13 整 R5 数据线 premised on 它。

两块现在都在 upstream 已删的包里。

## Scope

1. **接受 upstream 删除 `packages/host/apiproxy`**（fork 侧丢该包）。
2. **重落户 results-RPC 域**（保 additive 工作）：把 `result.get` RPC 按 upstream 的 Remote 模式迁进 `packages/api/remotes/`——四镜像（`remotes/src` 的 namespace + `remote-events` + transport + client/server 半）。参 upstream `refactor(apiproxy): retire migrated unary routes` + `refactor(client): consume migrated Remote namespaces` 的迁移模式。
3. **A6 presetSwitches 并发**：upstream 已无 apiproxy → "在纯 upstream 验证 race"已无意义。改：在 **data-agent 层**做 observer rebind-safe（让 scopeId observer 不被 mid-flight rebind 打断），OR 在 Remote 层重做 preset-swap 序列化。先核 race 是否在纯 upstream Remote 架构下复现（B-DA1 复现路径）。
4. **更新 T8-T13 + B-DA1 + R5/R6 + harness-package-removal**：加 upstream-supersession addendum（re-home 落此票）——本批 PR 已加 addendum。
5. **knip.json**：清 `packages/host/apiproxy` 死指针（UM8 接力）。

## Resolution

### [2026-09-10 Phase C 并行] Scope 2（results-RPC 重落户）**收口** — `verify-cordis-config` GREEN

commit **`025db697ab`** `[UM4] fix(bundle): close the results-RPC re-home tail`（resync 树）。

**实测**：`verify-cordis-config: 144 config files passed.`（此前 2 errors）。

两条声明补齐（均为**手写区**，不是 regen）：

| # | 改动 | 为什么是手写 |
|---|---|---|
| ① | `packages/bundle/data-agent/package.json` 加 `"@deepseek-ai/dsh-result-cache": "workspace:^"` 到 **`dependencies`** | checker 的 `bundlePluginDependencyErrors` 只读 `manifest.dependencies`（不看 dev/peer）。range `workspace:^` 由 `scripts/verify-package-dependencies.ts:601` 的 `WORKSPACE_RANGE` 断言 |
| ② | `tsconfig.base.json` 加 `"@deepseek-ai/dsh-result-cache/src/*": ["./packages/data/result-cache/src/*"]` | 该 `/src/*` 块在 **130–132 行**，位于 `gen-tsconfig-paths` 生成区（**307–509 行**）**之上**；且该生成器只产 bare package alias，**永远不会**产 `/src/*` key。故手改，不 regen |

**包名陷阱已从磁盘 `name` 字段核实**：`packages/data/result-cache` = `@deepseek-ai/dsh-result-cache`（就是这个）；`packages/client/result-cache` = `@deepseek-ai/dsh-client-result-cache`（不是这个）。

**非回归已验**（依赖声明能波及的 4 门，逐门跑）：`constraints`、`verify-package-dependencies`（**74 violations，与 UM12 记录的 74 逐字匹配**）、`verify-package-invariants`、`verify-runtime-closure`（失败链 `dsh-python-runtime-closure -> @deepseek-ai/dsh-phase-gate -> @deepseek-ai/dsh-scope-registry` 与 UM12 记录**逐字节相同**）—— 全部维持原红，且**没有一条失败行指向 `bundle/data-agent` 的依赖声明**（那两条提到 bundle/data-agent 的分别是 version 不匹配和 empty install function，均为 UM12 已记录项）。

### ⚠ 订正 UM12 记的第三个错误：**不是仓库缺陷**

`apps/cli/tests/profiles/acp/cordis.yml: root must be a Loader entry array` **是本地 checkout 假象**，不属本票也不属仓库：

- 该文件是 **upstream 的 symlink**（`git ls-files -s` mode `120000` → `../../../../../snapshots/acp/escalation-approved/cordis.yml`），作者 `4125514a08` Tianyi Cui。
- `~/.gitconfig` 设了 **`core.symlinks=false`**，git 把它落成一个 59 字节的、内容为目标路径的普通文件 → `readFileSync` 得到字符串而非数组。
- **CI 不受影响**（fresh checkout，`core.symlinks` 默认 true）。
- 修法是修 checkout（`git config core.symlinks true` + 重新 checkout 这些路径），**不产生任何 tracked 改动**；改那个文件反而是错的 —— 会把 upstream 的 symlink 变成 fork 的普通文件。
- 本 session 已修 resync 树全部 **10 个**坏 symlink（工作树操作，未 commit），修完该错立即消失，余下 2 个错正是 ① ②。

### 仍未收口

**Scope 3（A6 presetSwitches 并发 / B-DA1 race）未做** —— 本票不能整体 resolved。upstream 已无 apiproxy，需在 data-agent 层做 observer rebind-safe 或在 Remote 层重做 preset-swap 序列化，且需先核 race 在纯 upstream Remote 架构下是否复现。Scope 4（T8-T13 addendum）已在前批 PR 加；Scope 5（knip 死指针）归 UM8（已 archived，knip 当前不在任何 gate/workflow 里，无门可抓）。

**→ 本票状态：Scope 2 resolved，Scope 3 仍 open。UM6 的前置（UM4）就是 Scope 2，已解除。**

---

### [2026-09-09 triage] → Status: leave-open (R-DA/Phase-2). synced base 仍 track `packages/host/apiproxy/src/api/results.{ts,schema.ts}`（2 fork-only 文件，results-RPC re-home 待 `packages/api/remotes/`）；upstream `c389f96bf3` 无 `packages/host/apiproxy`；presetSwitches race re-validation under new Remote arch = R-DA + Phase-2。详 `.tmp/next-5-triage.md`。

---

### (original pre-triage)
（待落地后填：results-RPC 重落户后的 remotes 路径 + A6 race 在新架构下的处置）

---

## [2026-09-13] Phase-1 research → Phase-6 decision-doc (Scope 3 apply plan, DEFERRED)

Source: `wayfinder/data-agent/research/next-session-2026-09-14/um4.json` (high-confidence read-only research, 7-agent parallel workflow `wf_20a421e5-b09`).

### Scope 2 — VERIFIED RESOLVED (no action)

Commit `025db697ab` ('[UM4] fix(bundle): close the results-RPC re-home tail') is an ancestor of HEAD `8310c46514` (`git merge-base --is-ancestor`). The two hand-written hunks are present in-tree:

- `packages/bundle/data-agent/package.json:52` — `@deepseek-ai/dsh-result-cache: workspace:^` in dependencies
- `tsconfig.base.json:133` — `@deepseek-ai/dsh-result-cache/src/*` → `./packages/data/result-cache/src/*` (hand-written, sits ABOVE the gen-tsconfig-paths region)

The mount is live: `packages/bundle/data-agent/cordis.patch.yml:237-238` mounts `id: result-cache-gateway` name `@deepseek-ai/dsh-result-cache/src/remote.ts` (comment: 're-homed from apiproxy's results domain'). The gateway source `packages/data/result-cache/src/remote.ts` (`ResultsRemoteGateway extends TypertRemoteService`, `@Remote('get')`) is registered in `packages/api/remotes/src/client/index.ts` as `resultCacheRemote`.

### apiproxy — FULLY DELETED (premise confirmed)

`packages/host/apiproxy` is gone from git (`git ls-files` + `git ls-tree -r HEAD` both empty; upstream `4f00a8b 'refactor(api): remove ApiProxy package'` applied). `packages/data/apiproxy` never existed (the stub prompt's mention was a false lead). apiproxy is referenced only from `packages/bundle/data-agent/cordis.patch.yml` (the re-home mount) and `packages/client/result-cache` (client types).

### Scope 3 — STILL OPEN; race DOES still reproduce under pure-upstream Remote arch

**raceStillReproduces: TRUE** (by architecture trace; the definitive runtime JSONL capture B-DA1 asked for remains unproduced — see prerequisite below).

The B-DA1 race mechanism is INTACT and only HALF-fixed under the Remote arch:

1. `recompose()` remains a pure synchronous scope re-link (`packages/preset/agent-presets/src/index.ts:650` → `binding.rebind()` → `packages/core/scope/src/index.ts:78` `scopeParents.set()`, a WeakMap write, zero side effects, no disposal). Confirms B-DA1 Hypothesis-A refutation still holds: recompose does NOT cancel the agent.
2. The three-and-only-three abort sources are unchanged: `machine.cancel({kind:'disposed'})` (`packages/core/agent-loop/src/index.ts:591`); `agent.cancel({kind:'user'},{keepInbox:true})` (`packages/api/session-controller/src/commands.ts:486`); `agent.cancel({kind:'hook'...})` (`packages/data/phase-gate/src/phase-gate.ts:897`, 300s stall watchdog, impossible on first message). The `@Remote('select')` handler never calls `agent.cancel` — so the first-turn abort is disposal from a fiber-lifecycle edge, exactly as B-DA1 concluded.
3. **THE CRITICAL GAP**: the original apiproxy fix had TWO halves (d5 line 14): (a) swapPreset synchronous slot reservation + recompose awaits queued (`:3024`), and (b) the TURN PATH `await pendingSwitch` so prompts wait for in-flight switches (`:2397`). Under the Remote arch, ONLY half (a) was re-homed — the private `switches` Map in AgentPresets (`:684`, `:697-704`) serializes select-vs-select. Half (b) is GONE: `packages/api/session-controller/src/commands.ts:294` `prompt()` resolves the agent and dispatches (`agent.steer`/`agent.followup`) with NO await of any in-flight preset switch. The `switches` Map is `private` (`agent-presets/src/index.ts:684`) with no cross-package accessor, so session-controller physically cannot await it. `git grep` for `pendingSwitch`/`switches.get`/`awaitSwitch`/`drain` across session-controller src = zero hits.

### Architectural recommendation: OBSERVER-FIX (data-agent layer), NOT Remote-serialization

**Chosen: observer-fix.** Four grounds:

1. **Locality of blame**: d5 line 14 explicitly diagnosed the driver as 'a mid-flight rebind destabilizes the agent's scope OBSERVERS' — a data-agent scopeId concern — and prescribed branch (b) 'make data-agent observers rebind-safe so upstream preset-swap serialization stays as-is' UNLESS the race is proven in pure upstream. It is NOT proven in pure upstream: the select-side serialization already shipped generically and passes its tests; only the data-agent-specific observer fragility + the missing prompt-await remain.
2. **Minimal upstream drift**: Remote-serialization forces session-controller (generic) to couple to agent-presets switch state, creating exactly the kind of fork-vs-upstream divergence the whole UM* phase is trying to eliminate; observer-fix confines the coupling to the da-scoped preset-autojoin wrapper.
3. **Clean seam exists**: preset-autojoin is the documented da §4.2 wrapper on `agent/created`, and a narrow additive accessor on AgentPresets is a smaller, more auditable change than reworking the shared prompt/select boundary.
4. **Reversibility**: if a future pure-upstream repro emerges, the select-half is already generic and the prompt-await can be promoted upstream later; starting data-agent-local is the lower-regret path.

### Implementation sketch (apply in a follow-up session)

1. Add a narrow read-only accessor to AgentPresets in `packages/preset/agent-presets/src/index.ts`:
   `pendingSwitch(sessionId: string): Promise<unknown> | undefined { return this.switches.get(sessionId) }` (additive; leaves `@Remote('select')` and the private `switches` Map semantics untouched).
2. In the data-agent-scoped wrapper `packages/data/preset-autojoin/src/index.ts` (or a small sibling da plugin), add an `agent/pre-step` (or prompt-admission) guard that, for the session's first turn, does `const p = ctx.agentPresets.pendingSwitch(sessionId); if (p) await p` before the turn's first step assembles — restoring the deleted apiproxy `turnAgentFor await pendingSwitch` (`:2397`) in the DATA-AGENT layer rather than in generic session-controller.
3. Harden the standing-mount / scope observer so any parent-chain read that can span an await snapshots `scopeChainOf` up-front (read `packages/core/scope/src/index.ts` `scopeChainOf`/`scopeParentOf` usage in the standing-mount lifecycle and guard the await-spanning read).
4. **PREREQUISITE (do FIRST)**: capture a live session JSONL `turn/end.reason.reason.kind` on the B-DA1 repro (new-conversation → select 取数模式 → send) to confirm `'disposed'` (validates this fix) vs `'error'` (would additionally require the DashScope/LLM wiring fix, Hypothesis B — orthogonal). The reproduction is currently established by architecture trace only, NOT by a captured trajectory; residual uncertainty on whether the field abort is 'disposed' vs an orthogonal LLM 'error' persists until this capture lands.
5. Add regression tests (see fixtureList below). Commit with `-F` and explicit paths per tracker discipline.

### Fixture list (new tests to add)

- `packages/preset/agent-presets/tests/remote.spec.ts` — ADD 'switch racing a turn-start / concurrent select + prompt' (currently only `:380` select-vs-select serialization and `:399` agent-preset/locked exist; the actual B-DA1 scenario is untested). Assert the prompt awaits the in-flight switch and the first turn sees the FINAL tool set.
- `packages/preset/agent-presets/tests/session.spec.ts` — cover the new `pendingSwitch` accessor contract (returns the in-flight guard while a select is queued, undefined after settle).
- `packages/data/preset-autojoin/tests/` — ADD a test that the `agent/pre-step` (or prompt-admission) guard awaits `AgentPresets.pendingSwitch` before the first step, and that no tool-call block is left interrupted when a select races the first prompt.
- `packages/core/scope/tests/` (dsh-scope) — ADD a rebind-during-chain-walk test: an observer whose chain read spans an await must not observe a torn parent chain after `binding.rebind()`.
- `packages/client/connection/src/client/fixture.ts` — ADD a preset-switch-vs-first-prompt scenario arm so the UI-level 'Interrupted: interrupted' synthesis (`trajectory-tool-definition.ts:197` / `ui-conversation` tool) can be asserted as NOT firing post-fix (this fixture already carries preset and `turn/end` aborted scenarios around lines 2678, 2827-3003).
- A captured real session JSONL under `~/.dsh/storages/sessions/<id>.jsonl` (repro evidence, not a repo fixture) confirming `turn/end.reason.reason.kind === 'disposed'` — the still-missing runtime proof B-DA1 requires.

### singleSessionFeasible: FALSE

Not single-session feasible (the stub prompt itself scopes UM4 at ~2-3 sessions with Scope 2 already spent; Scope 3 spans agent-presets + preset-autojoin + dsh-scope + session-controller boundary reasoning + new tests + a runtime repro capture). Defer to a dedicated follow-up session.

### Rehome targets (two distinct)

- Scope 2 (DONE): results-RPC → `packages/data/result-cache/src/remote.ts` as a Typert `@Remote` gateway, registered via `packages/api/remotes/src/client/index.ts`.
- Scope 3 (OPEN): presetSwitches SELECT-half already lives in the upstream-generic `packages/preset/agent-presets`. The remaining observer-fix / prompt-serialization work should land in the DATA-AGENT-SCOPED wrapper `packages/data/preset-autojoin` (the da §4.2 wrapper that hooks `agent/created`) OR in the dsh-scope observer layer — NOT back in the generic agent-presets `@Remote` handler. Both agent-presets and preset-autojoin are already data-agent bundle deps (`package.json:37` and `:50`).

---

## [2026-09-14] 整票 DEFER —— 用户明确决定。**下一个 session 不要重新论证这件事。**

**Status 保持 `open`。本 session 零代码落地，这是有意的，不是没做完。**

### 决定

用户在 2026-09-14 session 明确指示：**UM4 整票 defer 到一个专项 session**，本 session 不启动 Scope 3 的任何实现。

### 为什么（唯一理由，不是预算问题）

上面 [2026-09-13] decision-doc 的 §Implementation sketch 第 4 步把 **JSONL capture 定为 PREREQUISITE（do FIRST）**，而这条前置**只能由人执行，agent 结构上做不到**：

它要求驱动一次**交互式 DSH 会话** —— 开新会话 → 在 UI 里选「取数模式」preset → 发一条消息 → 然后去读落盘的 session transcript。这不是一条能在 shell 里跑的命令，也不是能靠读代码替代的东西：它要的是一条**真实运行时轨迹**。agent 手上只有 `mcp__local__*`（文件读写 + bash），没有办法点 UI、没有办法驱动一个交互式 harness 会话。

而按本票**自己的** Risk-3 mitigation（见上一版 prompt §6 Risk 3 与本票 decision-doc 的 §Fixture list 末条）：**capture 不到 `'disposed'`，observer-fix 的根因就是未验证的**。当前 `raceStillReproduces: TRUE` 只是**架构 trace 结论**，不是捕获到的轨迹。两种可能后果完全不同：

| capture 结果 | 含义 | 后续 |
|---|---|---|
| `'disposed'` | observer-fix 的根因假设成立 | 按 decision-doc §Implementation sketch 1-3 步实现 + 5 fixtures |
| `'error'` | 是**正交**的 Hypothesis B（DashScope/LLM wiring），不是 fiber-lifecycle disposal | observer-fix **修错了东西**；UM4 scope 膨胀，需先修 LLM wiring |
| 字段缺失 | 既不证实也不证伪 | 需要换 repro 路径或加 instrumentation |

在没有 capture 的情况下写 accessor + guard + 4 处 fixture，是在给一个未确认的根因造 5 个测试。**所以本 session 选择什么都不落，而不是落"大概对"的一半。** 这与 decision-doc 自己的 `singleSessionFeasible: FALSE` 判定一致。

### 解锁本票所需的精确 capture 协议（照做即可，勿再设计）

由**人**执行，agent 只能在 capture 落盘后接手分析：

1. 启动 DSH（data-agent bundle），**新建一个会话**（new conversation —— 必须是新会话，300s stall watchdog 那条 abort 源在首条消息上不可能触发，这是排除干扰项的关键）。
2. 在 preset 选择器里选 **取数模式**。
3. **立刻**发一条消息（重点是让 `@Remote('select')` 的 switch 与首个 turn 的 prompt 竞争 —— 这就是 B-DA1 的 race window；等 switch settle 完再发就复现不出来）。
4. 观察 UI 是否出现 `Interrupted: interrupted`（B-DA1 的现场症状）。
5. 读 transcript：

   ```sh
   ls -t ~/.dsh/storages/sessions/*.jsonl | head -1        # 最新会话
   ```

   在该 `<id>.jsonl` 里找 **`turn/end`** 事件，取字段 **`reason.reason.kind`**（注意是**双层** `reason.reason`，不是 `reason.kind`）。

   ```sh
   grep -a 'turn/end' ~/.dsh/storages/sessions/<id>.jsonl | tail -1
   ```

6. 把该 `kind` 的字面值贴回本票。**`'disposed'` / `'error'` / 缺失** 三种走上表三条不同路径。

**捕获到之后**，实现路径已经完全写好、不需要再设计：见上面 [2026-09-13] decision-doc 的 §Implementation sketch（1. `pendingSwitch(sessionId)` additive accessor on `packages/preset/agent-presets/src/index.ts` → 2. `packages/data/preset-autojoin` 的 `agent/pre-step` guard → 3. `packages/core/scope` observer rebind-hardening）+ §Fixture list（5 个 fixture，全部带 file path）+ §Architectural recommendation（observer-fix vs Remote-serialization 的四条取舍，已决 observer-fix）。

### 本 session 未做的事（明示，避免下 session 误以为做过）

- ❌ 未跑 JSONL capture（结构上做不到，见上）
- ❌ 未加 `pendingSwitch` accessor
- ❌ 未加 `preset-autojoin` pre-step guard
- ❌ 未做 scope observer rebind-hardening
- ❌ 未加 5 个 fixture 中的任何一个
- ✔ Scope 2（results-RPC 重落户）仍 resolved（`025db697ab`，见上），本次未触

### 下 session 的形态

一个**专项 session，且必须有用户在场**做第 3 步的交互。开场第一件事就是 capture；capture 不出结果就**停下问用户**，不要转而去写实现。

---

## [2026-09-20] Gate ① capture — INCONCLUSIVE（race 未复现，turn completed 正常）

**Status 保持 `open`。Scope 3 仍未启动。**

### Capture 结果

用户在 web UI 新建会话 → 选取数模式 → 发"查询DAU"。结果：

```
session: ~/.dsh/sessions/--Users-mckenzie-avatar-X63--/session-9c886b6a-c7d3-4245-a87e-744438e862de/
turn 1 | outer: completed | nested: (none)
```

**Race 未复现**：turn 正常完成，UI 未显示 `Interrupted: interrupted`，无 `disposed` abort，无 `error`。

### 含义

B-DA1 race 是概率性的 —— 在给定 session 里 race window 可能被错过。本次 capture **既不能确认也不能证伪** observer-fix 根因。对照历史基线（272 个 turn/end）：`completed` 205 / `error` 38 / `aborted` 14（全 nested `user`）/ `interrupted` 9 / `blocked` 5 / `max-tokens` 1 —— `completed` 是**最常见**的结果，不代表 race 不存在。

### 按票内纪律

票明写「capture 出不来结果就停下问用户，不要转而去写实现」。本 session 选择：**defer Scope 3**，把"race 未复现"这个事实记进票，不实现 observer-fix。

### 启动环境的 3 个真实缺陷（本 session 修好，但都不是 repo fix）

启动 web UI 遇到 3 个 blocker，逐个解决后 capture 才能跑：

| # | 缺陷 | 票 | 临时修法 |
|---|---|---|---|
| 1 | `ui-present-table` client bundle code-split，module table 不兼容（52 包里唯一）| [UM-DEFECT-PRESENT-TABLE-SPLIT](UM-DEFECT-PRESENT-TABLE-SPLIT.md) | `--patch` overlay disable 该行 |
| 2 | 无任何 bundle/profile 配 `agent-presets.roots`，da 两个 preset 无根可扫 | [UM-DEFECT-PRESET-ROOTS](UM-DEFECT-PRESET-ROOTS.md) | overlay 加 roots 配置 |
| 3 | bundle/data-agent/package.json 漏声明 `dsh-tool-resolve-term`（共 11 个 undeclared）| [UM-DEFECT-PRESET-DEPS](UM-DEFECT-PRESET-DEPS.md) | `~/.dsh/profiles/node_modules/` 建 symlink |

三处都是用户配置 / node_modules symlink，**仓库零改动**。

### 一个需要更正的判断

本 session 早期跑了 `pnpm dsh --profile headless "Reply with exactly: OK"` 并宣称「definitive validation」。这是**错的**。`packages/data/preset-autojoin` 对 `agent/created` 用 `void listener(event).catch(...)` fire-and-forget 派发，mount 失败被默默吞掉，agent **不带 persona** 也能跑完。headless exit 0 是假阴性。子 agent 实测：摘掉 symlink 后 headless 仍然 exit 0 无任何错误。

### 给下一个 session 的指引

- 本 capture 结果不足以决定 Scope 3 走向。下一个 HITL session 应**多试几次**（B-DA1 race 是非确定性的）或加 instrumentation。
- 启动 web UI 必须跑 `pnpm dsh --profile web --patch /tmp/dsh-disable-present-table.patch.yml`（overlay 修了 3 个 blocker）。`pnpm dsh` = `node --import tsx/esm apps/cli/src/bin.ts`（tsx 才能解 bundle 里 `/src/*.ts` mount）。
- 跑在 `dsh-resync`（`upstream/resync-2026-09-08`, `83be9786e1`），不是主树。主树 0/58 client 包有 `lib/client.js`，`pnpm dsh web` 直接 `MissingClientBundleError`。Race 相关代码两树逐字节相同。
- capture 读回命令（票里那条路径/格式/字段三处都错，跑不通）：
  ```sh
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  D=$(ls -td ~/.dsh/sessions/*/*/ | head -1); echo "session: $D"
  zstd -dc "$D/session.jsonl.zstd" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  for(const l of s.split("\n")){if(!l.trim())continue;let o;try{o=JSON.parse(l)}catch{continue}
  if(o.type!=="turn/end")continue
  console.log("turn",o.data?.turn,"| outer:",o.data?.reason?.kind,"| nested:",o.data?.reason?.reason?.kind??"(none)")}})'
  ```
- 历史基线：272 个 turn/end，`disposed` **从未出现过**。若 capture 出现 `disposed`，那是第一次，强信号。
- `zstd` 在 `/opt/homebrew/bin`（不在 `/usr/local/bin`），PATH 要加。
- `turn/end` 字段路径是 `data.reason.reason.kind`（不是 `reason.reason.kind`，`data.` 是事件 envelope）。

### 本 session 未做的事

- ❌ 未加 `pendingSwitch` accessor
- ❌ 未加 `preset-autojoin` pre-step guard
- ❌ 未做 scope observer rebind-hardening
- ❌ 未加 5 个 fixture 中的任何一个
- ✔ Scope 2（results-RPC 重落户）仍 resolved（`025db697ab`），本次未触

### 第二次 capture（更激烈触发）— 仍未复现

用户试了更激烈的触发方式：**先切到创造模式，立刻切回取数模式，然后发消息"查询DAU"**。目的是制造两次 switch 扩大 race window。

结果：turn 仍然 `completed`。agent 正常工作 —— 定位到数据源（DAU = game.role.online 事件，hdyl_data_sg.ods_10000334_all_view 表），返回 `route:proceed` 并正常停止。

**两次 capture 总结**：

| # | 触发方式 | 结果 |
|---|---|---|
| 1 | 新建会话 → 选取数模式 → 发消息 | `completed`，race 未复现 |
| 2 | 切到创造模式 → 立刻切回取数模式 → 发消息 | `completed`，agent 正常工作 |

### 决定：defer 到 AFK session

两次不复现 ≠ race 不存在，但**不值得为了复现再花一个 session**。当前取数模式能用（第二次 capture 证明 agent 能正常定位数据源）。

**AFK session 的 UM4 Scope 3 指引**：

> 两次 HITL capture 都未复现（`completed`）。架构 trace 仍指向 `commands.ts:294` 不等 `pendingSwitch`，但上游可能已在后续 commit 补了。AFK session 选择：
> ① 先加 instrumentation（在 `preset-autojoin` 的 `agent/pre-step` 打印 `pendingSwitch` 状态到 session log）再让下一个 HITL session 试；
> ② 按现有 trace 直接实现 observer-fix（承担"给未确认根因造测试"的风险）；
> ③ defer 到下次 upstream sync 再看。
>
> **推荐 ①**。

本 session 未实现 observer-fix、未加 5 个 fixture、未加 `pendingSwitch` accessor。Scope 3 完整 defer。

## [2026-09-21] Scope 3 instrumentation 落地（accessor + debug log），capture 仍 defer

**Status 保持 `open`。** AFK session 按 [2026-09-20] 节推荐的 ① 加 instrumentation。

commit `75da97a139` `[UM4 Scope 3] add pendingSwitch accessor + preset-autojoin debug instrumentation`（master，additive，2 files +22/-2）：

1. `packages/preset/agent-presets/src/index.ts` — 加 narrow read-only accessor `pendingSwitch(sessionId): Promise<unknown> | undefined { return this.switches.get(sessionId) }`。不动 `@Remote('select')`、不动 private `switches` Map 语义。
2. `packages/data/preset-autojoin/src/index.ts` — `createAutojoinListener` 接受可选 `logger`，listener 体首行加 debug log：`preset-autojoin: pendingSwitch=%s for session %s`（in-flight / settled）。sessionId 防御性解 `agent.ctx.session?.id ?? agent.id ?? 'unknown'`。全 optional chaining，degrade gracefully。

`tsc --noEmit` 两包 green。pre-commit hooks 绿。

**capture 仍 defer**：本 session 是 AFK，无人驱动交互式 DSH 会话。accessor + log 已就位，下个 HITL session 跑 web UI repro 时 session log 能看到 switch 有没有尝试过——即使 race 不复现（前两次 capture 都 `completed`），instrumentation 也能区分"race 没发生"vs"switch 没被触发"。

**未做**：observer-fix 本体（pre-step guard await pendingSwitch + scope observer rebind-hardening + 5 fixture）仍 defer，等 capture 出 `disposed` / `error` / 缺失三种结果之一再定（见 [2026-09-13] decision-doc §Implementation sketch 第 4 步 PREREQUISITE）。
