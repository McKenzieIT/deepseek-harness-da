# Next session — parallel resolve remaining UM* + §3 re-sync kickoff（workflow-driven）

> **承接** 2026-09-13 session-2（PR #125 merged `8ace277bce` + 2 unpushed tracker commit `0a37e537a9`/`5cf164fa05` on local master）。**本 session 目标**：workflow 并行处理 4 张 open UM* 票的可并行部分 + 启动 UM15 §3 第三轮 re-sync（多 session）。
>
> **Supersedes** the prior per-ticket stubs (`next-session-2026-09-14-um4-apiproxy-rehome.md`, `next-session-2026-09-14-um15-slice-2-3.md`, `next-session-2026-09-15-b-class-4regressions-um15-firstslice.md`, `next-session-2026-09-16-um15-slice234-land-pr.md`, `next-session-2026-09-17-um15-slice5-pr.md`) — their content is consolidated + updated here with the 2026-09-13 session-2 decision-docs (now in the ticket bodies) + the RISK-MAP.md combat map.

---

## 0. 拓扑事实（session 头 30 秒核验，勿重跑）

- **origin/master** = `8ace277bce`（PR #125 merge）。**local master ahead 2**：`0a37e537a9`（4 ticket status sync）+ `5cf164fa05`（RISK-MAP.md + notes）— **unpushed tracker commits**，Phase 0 先推。
- **票账**：35 = **4 open** + 24 resolved + 6 archived + 1 folded
- **4 open**（全有 decision-doc 就位，见 §1）：UM4 · UM15 · UM-LINT-B(partial) · UM-FORK-README
- **worktree count**：7（`.worktrees/{r10-harness-goodhart,t1-exec-grader,g10-evaluation-core-publish}` + `dsh-resync` + `dsh-p2-present-table` + `dsh-p2-uism-vitest` + 主树）
- **CI real red-set**：{`Pack npm tarballs`} only（`Dependency layout` 已由 PR #122 Gate 4 转绿）
- **dsh-root build breakage**（known，UM12/UM16 tracked）：pre-push `typecheck` = `build:lib:host`（tsc + tsdown）在 master 基上 fail（dsh-root tsdown entry `lib/types/{index,invariant,startup}.js` 解析不了，主树未 build）；**dsh-resync built → 从 dsh-resync 推 A-path**（§8.5 铁律）。
- **RISK-MAP.md** + 6 seam JSON 就位（`wayfinder/data-agent/research/next-session-2026-09-14/um15-s3-seam-analysis/`）— UM15 §3 combat map 完整。
- **map.md U+FFFD = 13**（byte-splice 守恒）。

## 1. 4 open 票 + 可并行性分析

| # | 票 | 类型 | 可并行? | single-session? | decision-doc |
|---|---|---|---|---|---|
| 1 | **UM4** Scope 3 | task (observer-fix) | ⚠ partial（core impl 串行；5 fixtures 可并行） | ❌（JSONL capture 前置 + impl + tests，多 session） | ticket body (137L) |
| 2 | **UM-FORK-README** | task (zh-bug fix + wire + run) | ✅ **3 fix options 并行 judge panel** | ✅ Y（fix 选定后 wire+run ~40K） | ticket body (129L) + scaffold `scripts/gen-package-readme-skeleton.ts` (571L, UNWIRED, KNOWN-BUG) |
| 3 | **UM-LINT-B** remainder | task (waivers + durable gate) | ✅ Bucket ii/iii 并行 + gate 独立 | ✅ Y（**eval-cli ×6 仍 blocked on eval-team coord**） | ticket body (148L) |
| 4 | **UM15** §2+§4 | design+code (knownRed[] schema + expiry) | ⚠ paired（§4 blocked on §2） | ✅ Y（§2 schema ext + §4 policy 1 session） | ticket body (264L) |
| 5 | **UM15** §3 | task (3rd re-sync merge) | ❌ **串行**（git merge stateful，单工作树） | ❌（多 session；per-seam 解析已并行完成 = RISK-MAP.md） | ticket body §3 节 + RISK-MAP.md |

## 2. Collision matrix（哪些不能并行）

worktree 触面：
- **A UM-FORK-README**：`scripts/gen-package-readme-skeleton.ts` + `package.json` + `scripts/run-gates.ts` + `scripts/gate-coverage.manifest.json` + 130 README files
- **B UM-LINT-B**：`.oxlintrc.json`(部分已 land) + `scripts/run-oxlint.ts` + `scripts/gate-coverage.manifest.json` + `upstream-sync.json`(waivers)
- **C UM4**：`packages/preset/agent-presets` + `packages/data/preset-autojoin` + `packages/core/scope` + tests
- **D UM15 §2+§4**：`scripts/verify-gate-coverage.ts` + `scripts/upstream-sync-record.ts` + `scripts/gate-coverage.manifest.json`

| ↓ vs → | A README | B LINT-B | C UM4 | D UM15§2/4 |
|---|---|---|---|---|
| A README | — | **HIGH** (manifest) | ok | **HIGH** (manifest + run-gates) |
| B LINT-B | HIGH | — | ok | **HIGH** (manifest) |
| C UM4 | ok | ok | — | ok |
| D UM15§2/4 | HIGH | HIGH | ok | — |

**关键碰撞**：A、B、D **三方共碰 `scripts/gate-coverage.manifest.json`**（+ A↔D 共碰 `run-gates.ts`）。不能三 worktree 并行改同一 manifest。
**禁并行 1 对**：A↔D（HIGH，manifest + run-gates）
**串行 coupled**：A/B/D 的 manifest 编辑必须**在一个 worktree 内串行**或**集中到 dedicated manifest worktree**。
**C (UM4) fully disjoint** → 可独占 worktree 并行。

## 3. Phase graph（推荐 workflow）

### Phase 0 — Push 2 unpushed tracker commits（A-path，unblock origin/master）

从 `dsh-resync` worktree 推 `feat/tracker-2026-09-15-um-doc-sync`（2 commit）→ PR → `gh pr merge --merge`。docs-only，pre-push 门绿（dsh-resync built）。**~5 min**。

### Phase 1 — Parallel design/recon（5 read-only agents，无冲突）

| Label | Ticket | Deliverable |
|---|---|---|
| `design-um4-observer-fix` | UM4 | finalize observer-fix impl plan + JSONL capture protocol（turn/end.reason.reason.kind === 'disposed' vs 'error'）+ 5 fixture 设计 |
| `design-um-fork-readme-fix` | UM-FORK-README | 3 fix options (F1 rename zh 概述→Overview / F2 EN-side convergence / F3 accept-16-manual) 各自 detailed impl + test plan，供 Phase 3 judge panel |
| `design-um15-s2-schema` | UM15 §2 | `knownRed[]` schema extension for `verify-gate-coverage.ts` + Check 4 design + `gate-coverage.manifest.json` knownRed entry drafts (client-ui-i18n + doc-standard) |
| `design-um15-s4-expiry` | UM15 §4 | waiver-expiry policy (expiresAfterSyncs/expiresOn) for `upstream-sync-record.ts` Waiver interface + known-red-expiry (blocked on §2，先 design) |
| `recon-um-lint-b-eval-cli` | UM-LINT-B | 查 eval-team coord 是否就绪；若就绪，`tsconfig.tests.json` sub-option b impl plan；若否，确认 Bucket ii/iii + durable gate 仍可独立 land |

**budget**：~150-200K（5 agents，read-only）

### Phase 2 — User 拍板 gate

一次 consolidated document 呈现 5 design。用户逐条批准。**关键决策点**：
1. **UM-FORK-README fix option**：F1（推荐，rename zh 概述→Overview）/ F2 / F3 — 决定 Phase 3 Worktree A 的 judge panel 是否需要跑（若用户直接选 F1，跳过 judge panel，单 agent impl）
2. **UM4 JSONL capture**：是否本 session 先跑 capture（new-conversation → select 取数模式 → send，捕获 `~/.dsh/storages/sessions/<id>.jsonl`）— 若捕获到 'disposed'，observer-fix 确认；若 'error'，需追加 Hypothesis B (LLM wiring) fix
3. **UM-LINT-B eval-cli**：eval-team ack 到了？若到，本 session land；若否，defer
4. **UM15 §2+§4**：批 schema ext + expiry policy 一起 land
5. **UM15 §3**：本 session 是否启动第三轮 re-sync（多 session，stateful）— 若启动，Phase 4 kickoff

**budget**：~30-50K

### Phase 3 — Parallel apply（2 collision-safe worktree；A/B/D manifest 串行）

**Worktree C — UM4 Scope 3（fully disjoint，可独占并行）**
- Step 1: JSONL capture（prerequisite；若 Phase 2 确认 'disposed'）
- Step 2: `pendingSwitch(sessionId)` read-only accessor on AgentPresets（`packages/preset/agent-presets/src/index.ts`，additive）
- Step 3: `agent/pre-step` guard in `packages/data/preset-autojoin`（await `pendingSwitch` before first turn）
- Step 4: scope-observer rebind-hardening（`packages/core/scope`，snapshot `scopeChainOf` up-front across await）
- Step 5: 5 fixtures（**可并行 5 subagent**，见 §7 nested workflow）
- **NOT single-session** — 可能只 land accessor + guard + 2-3 fixtures，余 defer

**Worktree M — A/B/D 串行（manifest + run-gates collision，单 worktree）**
- Step 1: **UM-FORK-README**（若用户 Phase 2 选 F1 直接 → impl fix + wire + run 130 files + verify；若选 judge panel → 跑 §7 nested 3-option workflow 选 winner 再 wire+run）
- Step 2: **UM-LINT-B**（Bucket ii 34 WAIVE globs + Bucket iii 15 KEEP notes + durable gate extend `run-oxlint.ts`）— manifest 编辑接 Step 1
- Step 3: **UM15 §2**（knownRed[] schema ext + Check 4 + 2 knownRed entries）— manifest 编辑接 Step 2
- Step 4: **UM15 §4**（waiver-expiry policy，paired with §2）— `upstream-sync-record.ts` Waiver interface ext
- **CHECKPOINT**：if remaining budget <150K after Step 2, defer Step 3/4 到下下 session

**budget**：~200-300K total（Worktree C ~80-120K + Worktree M ~120-180K）

### Phase 4 — UM15 §3 第三轮 re-sync kickoff（separate，multi-session，SERIAL merge）

**NOT a parallel workflow** — `git merge` 是单工作树 stateful，不能拆到多 worktree。但 per-seam 冲突**解析**已并行完成（RISK-MAP.md）。本 session 的 §3 工作是：

1. 创建 resync branch（`upstream/resync-2026-09-15` or 续用 `dsh-resync`）
2. `git merge c291e7961a51`（NEW = upstream tracking ref）
3. **按 RISK-MAP.md 建议序**逐 seam 解冲突（seam-4 → seam-2 → seam-5 → seam-1 → seam-3 → seam-6）— **串行**，单工作树
4. 每 seam 解完跑该 seam 的 testHotspots（RISK-MAP.md 每 seam 列了）
5. **CHECKPOINT**：本 session 最多 land seam-4 + seam-2（~1.5 session 量）；余 4 seam defer 到后续 session

**若用户 Phase 2 不批 §3 启动**：Phase 4 跳过，本 session 只 land Phase 3 的 4 票。

**budget**：~150-250K（2 seam 的解冲突 + verify）

### Phase 5 — Verify + commit + push A path

Per worktree（C + M）：
1. `pnpm run check:ci:static`（对 baseline 39/9；不新增失败）
2. 相关 verify-* 全绿
3. Commit atomically per ticket（每 ticket 一个 commit，`-F` + 显式路径）
4. Push A 路径：从 `dsh-resync` worktree 推 `feat/tracker-2026-09-15-<X>` → PR → `gh pr merge --merge`

### Phase 6 — Decision-doc handoff + map snapshot

- 未 land 的余量写进对应 ticket body（UM4 余 fixtures / UM-LINT-B eval-cli / UM15 §3 余 4 seam / UM-FORK-README 若 judge panel 未决）
- map.md session-close snapshot（byte-splice，核 U+FFFD=13 + 字节数守恒）
- 票账 delta 记录

## 4. Context budget（~550-850K total）

| Phase | Tokens |
|---|---|
| Phase 0: push 2 tracker commits | ~10K |
| Phase 1: 5 parallel design | ~150-200K |
| Phase 2: Decision batch | ~30-50K |
| Phase 3 Worktree C（UM4）| ~80-120K |
| Phase 3 Worktree M（README+LINT-B+§2+§4）| ~120-180K |
| Phase 4 §3 kickoff（2 seam）| ~150-250K |
| Phase 5 verify + commit + push × 2 worktree | ~60-100K |
| Phase 6 handoff + map | ~30-50K |
| Buffer | ~70K |
| **Total** | **~700-970K**（若 Phase 4 不启动，~550-720K）✓ |

## 5. Session outcome 承诺

**Land（若全顺）**：4 张（UM-FORK-README GREEN + UM-LINT-B remainder + UM15 §2+§4 + UM4 partial-accessor）
**§3 kickoff（若用户批）**：seam-4 + seam-2 解冲突 land（2/6 seam）
**Decision doc + apply plan delivered**：UM4 余 fixtures + UM-LINT-B eval-cli + UM15 §3 余 4 seam
**Ticket 转移**：35 → 目标 **35 - 3 resolved = 32 total = 1 open + 25 resolved + 6 archived + 1 folded**（若 UM-FORK-README + UM-LINT-B(→resolved, eval-cli defer 另票) + UM15 §2+§4(→resolved) 全落；UM4 仍 open partial）

## 6. Risk map（4 主要 + mitigation）

**Risk 1 — Worktree M manifest collision stall**
- 触发：A/B/D 三方改 `gate-coverage.manifest.json`，Step 1-4 串行吃预算
- Mitigation：Phase 1 `design-um15-s2-schema` 先出 manifest edit draft；apply 时 mechanical insert；hard checkpoint <150K stop Step 3/4

**Risk 2 — UM-FORK-README judge panel explode**
- 触发：用户选 3-option judge panel → 3 subagent 各 impl+test → ~80-100K
- Mitigation：Phase 1 明确 F1 成本 breakdown（推荐）；用户大概率直接选 F1 跳过 panel

**Risk 3 — UM4 JSONL capture 失败**
- 触发：capture 不到 'disposed'（turn/end.reason.kind 为 'error' 或缺）→ Hypothesis B (LLM wiring) 介入，UM4 膨胀
- Mitigation：Phase 2 先决；若 capture 失败，UM4 defer 整张到专项 session，本 session 不 land UM4

**Risk 4 — UM15 §3 merge 冲突超出 RISK-MAP 预测**
- 触发：RISK-MAP.md 基于 BASE..NEW，但 merge 实际冲突可能多/少
- Mitigation：按 RISK-MAP 建议序（seam-4 trivial 先做 smoke-test）；seam-3 LOW severity（27 commits 是 surgical fixture.ts，非 UM14 dual-refactor）；seam-6 最难（6 breaking，out-of-seam call-site co-adapt）放最后

## 7. Workflow tool call skeleton（paste-ready）

```javascript
// PHASE 1: 5 parallel design/recon (all readOnlySafe)
Workflow({
  script: `
export const meta = {
  name: 'um-remaining-phase1-design',
  description: '5 parallel read-only design/recon for 4 open UM* tickets + UM15 §3 readiness',
  phases: [{ title: 'Design', detail: '5 concurrent subagent, no writes' }],
};

const REPO = '/Users/mckenzie/workspace/deepseek-harness-da';
const READONLY = [
  'You are a READ-ONLY design subagent. Repo at ' + REPO + '.',
  'NO WRITES. Never create/edit/delete files. Never run git mutating commands. Never --no-verify.',
  'Use mcp__local__* (read_file/list_dir/glob/grep/stat/bash READ-ONLY). bash: export PATH=/usr/local/bin:$PATH; export CI=true; cd ' + REPO + '.',
  'HANDS-OFF: .worktrees/{r10-harness-goodhart,t1-exec-grader,g10-evaluation-core-publish}, wayfinder/evaluation/, wayfinder/task-orchestration-dag/.',
  'CONTEXT FIRST: read the ticket .md under wayfinder/data-agent/tickets/phase-upstream-merge/ (each has a 2026-09-13 Phase-6 decision-doc) + the relevant research JSON under wayfinder/data-agent/research/next-session-2026-09-14/.',
  'OUTPUT: Return ONLY the structured object per your schema. Concrete: file paths, line numbers, SHAs.',
].join('\\n');

phase('Design');
const results = await parallel([
  () => agent(READONLY + '\\n\\nTICKET: UM4 Scope 3 (wayfinder/data-agent/tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md, decision-doc at end). GOAL: finalize the observer-fix impl plan. INSPECT: packages/preset/agent-presets/src/index.ts (@Remote select handler, private switches Map :684), packages/api/session-controller/src/commands.ts:294 (prompt()), packages/data/preset-autojoin/src/index.ts (agent/created seam), packages/core/scope/src/index.ts (scopeChainOf/scopeParentOf). PRODUCE: (a) pendingSwitch accessor impl (additive, leaves @Remote select untouched); (b) preset-autojoin pre-step guard impl (await pendingSwitch before first turn); (c) scope-observer rebind-hardening sketch; (d) JSONL capture protocol (new-conversation → select 取数模式 → send → read ~/.dsh/storages/sessions/<id>.jsonl turn/end.reason.reason.kind); (e) 5 fixture designs. schema: UM4_DESIGN_SCHEMA', { label: 'design-um4', schema: UM4_DESIGN_SCHEMA }),
  () => agent(READONLY + '\\n\\nTICKET: UM-FORK-README (wayfinder/data-agent/tickets/phase-upstream-merge/UM-FORK-README-SKELETON-RETROFIT.md, decision-doc at end + scaffold scripts/gen-package-readme-skeleton.ts with KNOWN-BUG note). GOAL: detailed impl for 3 zh-bug fix options. INSPECT: scripts/gen-package-readme-skeleton.ts (insertSkeleton hasSummary check :368, the zh 概述/Overview collision). PRODUCE 3 options: F1 (rename existing zh ## 概述 → ## Overview, insert Summary 概述, rebuild TOC, re-thread anchors), F2 (EN-side convergence: rename EN ## Overview → ## Summary, drop separate Summary), F3 (accept 16 as manual, generator handles 49 clean). Each: impl steps + which files + test plan + pairing-impact. schema: README_FIX_SCHEMA', { label: 'design-readme-fix', schema: README_FIX_SCHEMA }),
  () => agent(READONLY + '\\n\\nTICKET: UM15 §2 (wayfinder/data-agent/tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md §2 节). GOAL: knownRed[] schema extension design. INSPECT: scripts/verify-gate-coverage.ts (coverage-only, no knownRed), scripts/gate-coverage.manifest.json (exemptions[] shape), scripts/run-gates.ts (enrollment). PRODUCE: (a) knownRed[] schema (script/rationale/ticket/expiry?/reopenTrigger) + Check 4 design (assert every knownRed names an enrolled gate); (b) 2 knownRed entry drafts (verify-client-ui-i18n 83 KNOWN-RED intranet-zh, doc-standard 2 KNOWN-RED 65-pkg skeleton gap); (c) manifest patch draft. schema: UM15_S2_SCHEMA', { label: 'design-um15-s2', schema: UM15_S2_SCHEMA }),
  () => agent(READONLY + '\\n\\nTICKET: UM15 §4 (wayfinder/data-agent/tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md §4 节). GOAL: waiver-expiry policy design (blocked on §2, design only). INSPECT: scripts/upstream-sync-record.ts (Waiver interface :61, collectGitFailures :184+ note→failure semantics). PRODUCE: (a) expiresAfterSyncs/expiresOn field design for Waiver; (b) keep/drop/pending expiry semantics (keep→fail on expiry/zero-hit-N; drop→hard expiry tied ticket; pending→shortest fuse >1 sync); (c) known-red-expiry (blocked on §2 knownRed[]); (d) calibration questions for human. schema: UM15_S4_SCHEMA', { label: 'design-um15-s4', schema: UM15_S4_SCHEMA }),
  () => agent(READONLY + '\\n\\nTICKET: UM-LINT-B remainder (wayfinder/data-agent/tickets/phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md, decision-doc at end). GOAL: recon eval-team coord + finalize Bucket ii/iii + durable gate. INSPECT: .oxlintrc.json (fixtures/** 已 widened 09-13), scripts/run-oxlint.ts (98L, spawnSync oxlint CLI), scripts/gate-coverage.manifest.json. PRODUCE: (a) eval-cli ×6 tsconfig.tests.json sub-option b impl plan (gated on eval-team ack — report whether ack is obtainable this session); (b) Bucket ii 34 WAIVE per-glob list with rationale; (c) Bucket iii 15 KEEP notes; (d) durable gate impl (extend run-oxlint.ts to parse OXC_LOG Unmatched file: + fail if any intersects strict-override globs; enroll in gate-coverage manifest). schema: LINTB_RECON_SCHEMA', { label: 'recon-lint-b', schema: LINTB_RECON_SCHEMA }),
]);

return { design: results.filter(Boolean) };
`,
});

// PHASE 2: user 拍板 — AskUserQuestion (UM-FORK-README fix option + UM4 JSONL + eval-cli ack + §3 kickoff)

// PHASE 3 Worktree M Step 1 (UM-FORK-README) — IF user chose judge panel (not direct F1):
// nested 3-option workflow: 3 agents each impl F1/F2/F3 in a worktree, 1 judge picks winner
// (if user chose F1 directly, single agent impl — skip the panel)

// PHASE 3 Worktree C Step 5 (UM4 fixtures) — 5 parallel fixture agents:
// Workflow({ script: \`
//   phase('Fixtures');
//   const fixtures = await parallel([
//     () => agent('Add remote.spec.ts switch-racing-turn-start test...', { label: 'fx:remote-race', schema: FX_SCHEMA }),
//     () => agent('Add session.spec.ts pendingSwitch accessor test...', { label: 'fx:pendingSwitch', schema: FX_SCHEMA }),
//     () => agent('Add preset-autojoin pre-step guard test...', { label: 'fx:preset-autojoin', schema: FX_SCHEMA }),
//     () => agent('Add dsh-scope rebind-during-chain-walk test...', { label: 'fx:scope-rebind', schema: FX_SCHEMA }),
//     () => agent('Add connection/fixture.ts preset-switch-vs-first-prompt arm...', { label: 'fx:connection-fixture', schema: FX_SCHEMA }),
//   ]);
//   return { fixtures: fixtures.filter(Boolean) };
// \` });

// PHASE 4 §3: NOT a workflow (serial git merge, guided by RISK-MAP.md)

// PHASE 5: verify + commit + push A-path per worktree (from dsh-resync)
```

**schemas**（define inline before the Workflow call）：UM4_DESIGN_SCHEMA, README_FIX_SCHEMA（with options:[F1,F2,F3] array）, UM15_S2_SCHEMA, UM15_S4_SCHEMA, LINTB_RECON_SCHEMA — each `{type:object, properties:{...}, required:[...]}`，照 Phase-1 的 7-schema 风格（recommendation + confidence + concrete files/lines）。

## 8. 铁律（same as parent sessions + 特化）

1. 仅用 `mcp__local__*`；从不 `--no-verify`
2. commit `-F` + 显式路径
3. `.worktrees/{r10,t1,g10}` + `wayfinder/evaluation/` + `wayfinder/task-orchestration-dag/` **完全 hands-off**
4. `edit_file` BLOCKED on `wayfinder/data-agent/map.md` → node Buffer byte-splice；splice 后核 U+FFFD count=13 + 字节数守恒
5. 推非 master ref 从 `dsh-resync` worktree 推（**master 基有 dsh-root build breakage，主树 pre-push typecheck fail**）；PR 走 A 路径（`gh pr merge --merge`）
6. **特化**：Phase 3 Worktree M（A/B/D manifest collision）**必须单 worktree 串行**，不可拆 3 worktree 并行改 `gate-coverage.manifest.json`
7. **特化**：Phase 4 §3 是 serial git merge，**不是 workflow**——per-seam 解析已并行完成（RISK-MAP.md），merge 本身单工作树串行
8. UM-FORK-README 若跑 judge panel：3 subagent 各用 `isolation: 'worktree'`（并行改同一 generator 文件会冲突）

## 9. 前置校验（session 头 30 秒）

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git status --short   # 期望：clean（可能有 G13/task-orchestration 无关文件，ok）+ local master ahead 2
git rev-parse master origin/master  # 期望：origin/master=8ace277bce；local master ahead 2
git log --oneline -3   # 期望：5cf164fa05 / 0a37e537a9 / 8ace277bce
git worktree list | wc -l  # 期望：7
node -e 'const b=require("fs").readFileSync("wayfinder/data-agent/map.md"); let n=0; for(let i=0;i+2<b.length;i++){if(b[i]===0xEF&&b[i+1]===0xBF&&b[i+2]===0xBD)n++;} console.log("U+FFFD:",n);'  # 期望：13
ls wayfinder/data-agent/research/next-session-2026-09-14/um15-s3-seam-analysis/RISK-MAP.md  # 期望：存在
```

## 10. Reference

- **本 session 产出**：PR #125（`8ace277bce`，6 commit）+ 2 unpushed tracker（`0a37e537a9` + `5cf164fa05`）
- **4 open ticket decision-docs**：`wayfinder/data-agent/tickets/phase-upstream-merge/{UM4,UM15,UM-FORK-README-SKELETON-RETROFIT,UM-LINT-B-UNMATCHED-PROGRAMS}.md`（每张末尾有 2026-09-13 Phase-6 decision-doc）
- **UM15 §3 combat map**：`wayfinder/data-agent/research/next-session-2026-09-14/um15-s3-seam-analysis/RISK-MAP.md` + `seam-{1..6}.json`
- **Phase-1 research provenance**：`wayfinder/data-agent/research/next-session-2026-09-14/{INDEX.md, scopeid.json, lint-b.json, readme-retrofit.json, merge-integrity.json, um4.json, um6.json, um15.json}`
- **README-retrofit scaffold**：`scripts/gen-package-readme-skeleton.ts`（571L, UNWIRED, KNOWN-BUG note at top）
- **上 session plan**（本 session 消费的）：`wayfinder/data-agent/prompts/next-session-2026-09-14-parallel-7-tickets.md`
- **map.md session-2 snapshot**：`wayfinder/data-agent/map.md` [2026-09-13] session-2 entry（line ~534）
