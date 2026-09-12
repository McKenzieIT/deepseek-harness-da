# Next session — parallel resolve 7 open UM* tickets（workflow-driven，Cluster D+E follow-up）

> 由 `wf_fe193bed-bf7`（2026-09-13 feasibility workflow，7 并行 subagent + 1 synthesizer）产出的 concrete design。**目标**：single session 内落 4 张 + 出 3 张 decision doc（占 ~90% 价值），剩 3-4 张 defer 到下下 session apply。

---

## 0. 拓扑事实（勿重跑，直接用）

- **origin/master = `3e1ef17344`**（2026-09-13 session-close 后；4 PR chain #120/#121/#122/#123 全 merged）
- **票账**：35 = 7 open + 21 resolved + 6 archived + 1 folded
- **worktree count**：7（`.worktrees/r10/t1/g10-eval` + `dsh-resync` + `dsh-p2-present-table` + `dsh-p2-uism-vitest` + 主树）
- **CI real red-set**：{`Pack npm tarballs`} only（`Dependency layout` 已由 PR #122 Gate 4 apply 转绿）

## 1. 7 open tickets（按 workflow 分析的 collision-safety 分档）

| # | 票 | 类型 | est | user 拍板 | fannable | single-session |
|---|---|---|---|---|---|---|
| 1 | **UM-SCOPEID-RETIRE-REGRILL** | grilling | ~1 | ✅ 必需 | ❌ | ⚠ partial（grill 装得下，apply 装不下） |
| 2 | **UM-LINT-B** | grilling+apply | ~1-2 | ✅ 必需（4 axes） | ❌ | ⚠ partial（analysis 装得下，apply 需 eval-team coord） |
| 3 | **UM-FORK-README-SKELETON-RETROFIT** | task | ~1-3 | ✅ 必需（Option A/B/C） | ✅ N=65 | ✅ Y（Option C 工具化路径） |
| 4 | **UM-MERGE-INTEGRITY** | research+apply | ~1-2 | ✅ 必需（Path-1/Path-2） | ❌ | ✅ Y（Path-2 短），⚠ Path-1 大 |
| 5 | **UM4** apiproxy 重落户 | task | ~2-3 | ✅ 必需（架构选） | ❌ | ❌ N（Scope 3 race 复现+架构 fix+验证不装） |
| 6 | **UM6** docs/subsystems | task | ~1 | ✅ 必需（add-vs-exempt） | ❌ | ✅ Y |
| 7 | **UM15 slice 2/3** | task | ~2-3 | ✅ 必需（§4 policy） | ❌ | ⚠ partial（§2+§3 装得下，§4 需另 session） |

## 2. Collision matrix（哪些不能并行）

| ↓ vs → | SCOPEID | LINT-B | README | MERGE-INT | UM4 | UM6 | UM15-2/3 |
|---|---|---|---|---|---|---|---|
| SCOPEID | — | ok | ok | soft | **HIGH** | soft | soft |
| LINT-B | ok | — | ok | soft | ok | ok | **HIGH** |
| README | ok | ok | — | soft | ok | **HIGH** | ok |
| MERGE-INT | soft | soft | soft | — | soft | ok | **HIGH** |
| UM4 | **HIGH** | ok | ok | soft | — | **coupled** | ok |
| UM6 | soft | ok | **HIGH** | ok | coupled | — | ok |
| UM15-2/3 | soft | **HIGH** | ok | **HIGH** | ok | ok | — |

**禁并行 4 对**（HIGH）：UM4↔SCOPEID / UM15↔MERGE-INT / UM15↔LINT-B / README↔UM6
**串行 coupled**：UM4→UM6（UM4 若碰 packages/preset/agent-presets 触发 gen-cordis-catalog+doc-graphs regen）

## 3. Phase graph（推荐 next-session workflow）

### Phase 1 — Parallel research（7 subagents，read-only，无冲突）

| Label | Ticket | Deliverable |
|---|---|---|
| `research-scopeid` | UM-SCOPEID-RETIRE-REGRILL | keep-with-waiver vs retire decision matrix + regen cascade cost |
| `research-lint-b` | UM-LINT-B | 56 unmatched → 3-bucket table + 4-axis decision |
| `research-readme-retrofit` | UM-FORK-README-SKELETON-RETROFIT | Option A/B/C recommend + per-package kind inference + description policy |
| `research-merge-integrity` | UM-MERGE-INTEGRITY | ui-settings-models F==B&U!=B blob walk + Path-1/Path-2 recommend + §2.4.bis scope call |
| `research-um4` | UM4 | Scope 3 race repro under pure upstream + observer vs Remote-serialization architecture recommend |
| `research-um6` | UM6 | add-3-group-READMEs vs GROUPS_WITHOUT_SUBSYSTEM_PAGE exemption recommend |
| `research-um15-slice-2-3` | UM15-slice-2-3 | §2 manifest patch draft + §3 cadence measurement (commits/days/seam) + §4 waiver-expiry sketch |

**budget**：~250-350K

### Phase 2 — Batched user 拍板 gate

一次 consolidated document 呈现 7 张 decision matrix。用户逐条批准/否决。

**关键决策点**：
1. **UM-SCOPEID**：keep-with-waiver（0 apply cost）vs retire（6-site tsc break + tenant-leak #19 regression risk + 5-generator regen cascade）
2. **UM-LINT-B**：(a) A-class eval-cli 4 sub-options + (b) eval coord timing + (c) B-class 49 policy + (d) durable gate install
3. **UM-README-RETROFIT**：Option C 工具化（推荐，~40K）vs Option A hand-craft（~150K + drift risk）vs Option B 部分
4. **UM-MERGE-INTEGRITY**：Path-1（drop parent + per-file waivers）vs Path-2（leave parent + byte-verify note）+ §2.4.bis in-scope vs defer
5. **UM4 Scope 3**：先验证 race 是否仍复现 → 若复现：observer-fix at data-agent vs Remote-serialization
6. **UM6**：add-group-READMEs（3 bilingual triplets + 2 link edits）vs exempt in verify-subsystem-pages.ts
7. **UM15 slice 2/3**：apply §2 only / §2+§3 / all-three + waiver-expiry policy

**budget**：~30-50K

### Phase 3 — Parallel apply（3 collision-safe worktree）

**Worktree A — packages/*/*/README.\*（fully disjoint）**
- `UM-FORK-README-SKELETON-RETROFIT`（Option C 工具化：写 `scripts/gen-package-readme-skeleton.ts` + 一次跑覆盖 65 包 = 130 files）
- Fallback：Option A 分 8 subagent fanout by package group（if 用户 override）

**Worktree B — docs/subsystems + group READMEs（可与 A 并行）**
- `UM6`：3 group README triplets + 2 link edits + regen cordis-catalog/doc-graphs
- Single-thread（小 scope）

**Worktree C — upstream-sync.json + gate-coverage.manifest.json（SERIAL within）**
- Step 1: `UM-MERGE-INTEGRITY` apply（Path-1 或 Path-2）
- Step 2: `UM15-slice-2-3 §2` manifest consumption（5 Cluster D decisions）
- Step 3: `UM15-slice-2-3 §3` cadence measurement
- **CHECKPOINT**：if remaining budget <200K after Step 2, stop and defer Step 3

**budget**：~150-230K total

### Phase 4 — Serial coordination points

- UM6 regen (`docs/subsystems/data-agent.md`) 需在 UM4 apply 前 land（记 baseline SHA），或让 UM4 未来 apply 独占 regen（若 UM6 不碰 data-agent.md）——Phase 1 `research-um6` verify

### Phase 5 — Verify + commit + push A path

Per worktree：
1. `pnpm run check:ci:static`（对 baseline 37-38/9-10；不新增失败）
2. `verify-package-dependencies` / `verify-gate-coverage` / `verify-upstream-sync-record` / `verify-doc-graphs` / `verify-translation-pairing` 全绿
3. Commit atomically per ticket（每 ticket 一个 commit，不合并）
4. Push A 路径：从 `dsh-resync` worktree 推 `feat/tracker-2026-09-14-<X>` → PR → `gh pr merge --merge`

### Phase 6 — Decision-doc handoff（4 张 defer）

Write to ticket bodies for **follow-up session** apply：
- **UM-SCOPEID-RETIRE-REGRILL**：retire-apply plan + 5-generator regen cascade steps（if retire chosen）
- **UM4 Scope 3**：chosen architectural path + implementation plan + fixture list
- **UM-LINT-B**：bucket resolution plan + eval-team coord ask
- **UM15-slice-2-3 §4**：waiver-expiry apply plan

## 4. Context budget（~500-800K total）

| Phase | Tokens |
|---|---|
| Phase 1: 7 parallel research | ~250-350K |
| Phase 2: Decision batch | ~30-50K |
| Phase 3 Worktree A（README C）| ~40-60K |
| Phase 3 Worktree B（UM6）| ~30-50K |
| Phase 3 Worktree C（MERGE-INT + §2 + §3）| ~80-120K |
| Phase 5 verify + commit + push × 3 worktree | ~60-100K |
| Phase 6 handoff docs | ~30-50K |
| Buffer | ~70K |
| **Total** | **~590-780K** ✓ |

## 5. Session outcome 承诺

**Land**：4 张（UM-FORK-README-SKELETON-RETROFIT + UM6 + UM-MERGE-INTEGRITY + UM15 §2+§3）
**Decision doc + apply plan delivered**：3 张（UM-SCOPEID / UM4 / UM-LINT-B / UM15 §4）
**Ticket 转移**：35 → 目标 **35 - 4 resolved = 31 total but ledger 变 3 open + 25 resolved + 6 archived + 1 folded**（若 4 全落）

## 6. Risk map（3 主要 + mitigation）

**Risk 1 — Worktree C serialization stall**
- 触发：MERGE-INT Path-1 blob walk 吃 ~80-100K，UM15 §2+§3 无预算
- Mitigation：Phase 1 `research-merge-integrity` 预算 blob walk；apply 时 mechanical waiver-row insert；hard checkpoint <200K stop

**Risk 2 — README Option A/B 选择 explode fanout**
- 触发：用户选 Option A hand-craft 65 描述 → ~150K + description drift
- Mitigation：Phase 1 明确 Option C 成本 breakdown；fallback：Option A with TODO placeholders（mechanical mass-write，可 scripted）

**Risk 3 — UM6 regen coupling with deferred UM4**
- 触发：UM6 regen `docs/subsystems/data-agent.md` → 未来 UM4 apply 再 regen 冲突
- Mitigation：record UM6 baseline SHA；alternative：UM6 skip regen if not-touching-data-agent.md（Phase 1 verify）；explicit coord note in UM6 commit

## 7. Workflow tool call skeleton（paste-ready）

```javascript
// PHASE 1: 7 parallel research (all readOnlySafe)
Workflow({
  script: `
export const meta = {
  name: 'um-parallel-apply-phase1-research',
  description: '7 parallel read-only research for 7 open UM* tickets',
  phases: [{ title: 'Research', detail: '7 concurrent subagent, no writes' }],
};

phase('Research');
const results = await parallel([
  () => agent('Read-only research for UM-SCOPEID-RETIRE-REGRILL: inspect packages/core/agent-loop/src/tool-calls.ts, packages/core/tools/{src/ptc.ts,src/index.ts}, packages/data/tool-{retrieve,search-data-sources}/src/index.ts, upstream-sync.json scopeId waivers, GA-GT1 Phase-5b tenant-leak #19 history. Produce keep-with-waiver vs retire decision matrix + concrete downstream cost. NO WRITES.', { label: 'research-scopeid', schema: SCOPEID_SCHEMA }),
  () => agent('Read-only research for UM-LINT-B: classify 56 unmatched files into buckets (i)/(ii)/(iii) per Cluster D §2 framework. Read scripts/tsconfig.*, packages/eval/eval-cli/tsconfig.json, .oxlintrc.json. Reproduce OXC_LOG=debug oxlint count in resync tree (read-only). Produce bucket table + 4-axis decision options. NO WRITES.', { label: 'research-lint-b', schema: LINTB_SCHEMA }),
  () => agent('Read-only research for UM-FORK-README-SKELETON-RETROFIT: enumerate all 65 fork packages missing frontmatter (find packages -mindepth 3 -maxdepth 3 -name README.md + check YAML head), inspect packages/bundle/data-agent/README.{md,zh.md} reference. Read scripts/doc-standard.spec.ts expectedKind() logic. Produce Option A/B/C recommend + per-package kind inference table + description policy. NO WRITES.', { label: 'research-readme-retrofit', schema: README_SCHEMA }),
  () => agent('Read-only research for UM-MERGE-INTEGRITY: enumerate divergent ui-settings-models test files via git ls-tree + blob byte-compare (F==B & U!=B walk on M2=HEAD). Read UM15 §2.4.bis spec. Produce per-file keep/drop rationale table + Path-1/Path-2 recommend + §2.4.bis scope decision. NO WRITES.', { label: 'research-merge-integrity', schema: MERGEINT_SCHEMA }),
  () => agent('Read-only research for UM4 Scope 3: verify Scope 2 resolved (commit 025db697ab). Read packages/api/remotes, packages/data/apiproxy, packages/data/result-cache/src/remote.ts, packages/bundle/data-agent/cordis.patch.yml, T8-T13 tickets + B-DA1. Attempt A6 presetSwitches race repro under pure upstream Remote arch (read logs). Produce race-still-reproduces boolean + observer vs Remote-serialization architectural recommend + implementation sketch. NO WRITES.', { label: 'research-um4', schema: UM4_SCHEMA }),
  () => agent('Read-only research for UM6: read docs/subsystems/*.md, scripts/verify-subsystem-pages.ts GROUPS_WITHOUT_SUBSYSTEM_PAGE list (line 17-24), packages/{data,eval,embedder,query,retrieval}/README.* current state. Produce add-group-READMEs vs exemption recommend + 3 group triplet drafts + link-edit locations. NO WRITES.', { label: 'research-um6', schema: UM6_SCHEMA }),
  () => agent('Read-only research for UM15-slice-2-3: measure cadence (git rev-list c389f96bf3a9..c291e7961a51 --count + seam-touch count per §3 formula + calendar days). Verify PR #122 UM-C-GATES merged (soft-lock). Read scripts/verify-gate-coverage.ts, scripts/gate-coverage.manifest.json, scripts/upstream-sync-record.ts. Produce §2 manifest patch draft (5 Cluster D entries) + §3 third-round-trigger go/no-go + §4 waiver-expiry policy sketch + split proposal. NO WRITES.', { label: 'research-um15', schema: UM15_SCHEMA }),
]);

return { research: results.filter(Boolean) };
`,
});

// PHASE 2: user 拍板 — 主 session AskUserQuestion or direct present

// PHASE 3: 3 collision-safe worktree apply (parallel)
// [use isolation: 'worktree' per subagent or Skill dispatching-parallel-agents]

// PHASE 5: verify + commit + push A path per worktree
```

## 8. 铁律（same as parent sessions + 特化）

1. 仅用 `mcp__local__*`；从不 `--no-verify`
2. commit `-F` + 显式路径
3. `.worktrees/r10/t1/g10-eval` + `wayfinder/evaluation/` + `wayfinder/task-orchestration-dag/` **完全 hands-off**
4. `edit_file` BLOCKED on `wayfinder/data-agent/map.md` → node Buffer byte-splice；splice 后核 U+FFFD count=13 + 字节数守恒
5. 推非 master ref 从 `dsh-resync` worktree 推；PR 走 A 路径（`gh pr merge --merge`）
6. **特化**：worktree isolation 时用 `isolation: 'worktree'` 或 `EnterWorktree`；每 worktree apply 完 verify + commit + exit 前不 push（主 session 集中 push）

## 9. 前置校验（session 头 30 秒）

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git status --short   # 期望：clean（可能有 G13/task-orchestration 无关文件，ok）
git rev-parse master origin/master  # 期望：一致 = 3e1ef17344
git log --oneline -5   # 期望：8ccf93d269 / e21114fad4 / 3e1ef17344 / 2f4398b20b / a06a7bf554
git worktree list | wc -l  # 期望：7
node -e 'const b=require("fs").readFileSync("wayfinder/data-agent/map.md"); let n=0; for(let i=0;i+2<b.length;i++){if(b[i]===0xEF&&b[i+1]===0xBF&&b[i+2]===0xBD)n++;} console.log("U+FFFD:",n);'  # 期望：13
```

## 10. Reference

- **workflow run**: `wf_fe193bed-bf7`（2026-09-13）7 parallel + 1 synth，249K tokens
- **synthesizer output**（保留在 workflow archive）：full phase graph + JavaScript skeleton + collision matrix + risk map
- **上一 session close snapshot**：`wayfinder/data-agent/map.md` §Cluster D + 后续 landscape entries（2026-09-13 4 条 byte-splice）
