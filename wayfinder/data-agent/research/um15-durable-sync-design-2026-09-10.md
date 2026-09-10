# UM15 — durable upstream-sync 工程方法 设计草案

> 来源:S4 subagent,2026-09-10 并行 session。原样落盘自 subagent 返回值,**未经主 session 复核** —— 文中每条 `file:line` 引用 S4 自称已读,但主 session 仅复核了其中与 UM12/UM-MERGE-INTEGRITY 交叉的几条。落盘目的是防止重导成本(再花一整个 subagent)。落地实现前需按 UM15 票的 Scope 逐条验。
> 主 session 已复核的子集:① `core.symlinks=false` 不影响本设计;② merge 双向有损见 [UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md),其「merge 完整性 gate」结论与本文 §2.4 一致。

**用户 2026-09-10 选定首片 = staleness + regen 清单 + meta-gate**（见 map.md Not-yet-specified）。本文覆盖全部 6 块;首片是其中 §1+§6。

---

## 0. Ground truth: what this repo actually provides today

| Fact | Evidence |
|---|---|
| Remotes are `origin` = `McKenzieIT/deepseek-harness-da`, `upstream` = `deepseek-ai/deepseek-harness` | `git remote -v` |
| **No git notes exist at all.** `refs/notes/**` is empty | `git for-each-ref 'refs/notes/**'` → 0 rows |
| A **custom ref namespace precedent exists**: `refs/dsh/translation-pairing/snapshots/*`, 2610 refs, content-addressed, used to pin blobs against GC | `scripts/translation-pairing-git.ts:6`; rationale in `docs/i18n/README.md:18` |
| **No "last synced upstream SHA" record exists** in any tracked file, note, or ref | grep for `last[-_ ]?synced\|upstream-sha\|sync-base` across `*.ts *.json *.md *.yml *.sh` returns only prose in UM13/UM-flow |
| `git merge-base HEAD upstream/master` returns **exactly `c389f96bf3`** — the documented synced base | verified; matches UM14 Resolution |
| Both upstream merges are real 2-parent merges with a machine-parseable subject: `Merge upstream deepseek-ai/deepseek-harness <sha> into deepseek-harness-da (upstream-{merge,resync} YYYY-MM-DD)` | `8112743d69`, `6b7610d45a` |
| **The fetched `upstream/master` ref is itself stale.** `git ls-remote upstream HEAD` = `2377c272a8`; fetched ref = `5dda764ed3`; `FETCH_HEAD` mtime = 2026-09-09 19:08 | verified live |
| Fork is **430 behind / 819 ahead** *as of the stale fetched ref* — i.e. already worse than the 449 that triggered UM13 | `git rev-list --count c389f96bf3..upstream/master` |
| **No scheduled workflow exists.** Zero `schedule:` triggers across all 20 workflows | `grep -l 'schedule:' .github/workflows/*.yml` → none |
| `.tmp/` is gitignored, and **all of UM13's evidence files are gone** (`upstream-resync-conflicts.md`, `upstream-449-impact.md`, `d5-upstream-impact.md`, `next-5-triage.md`) | `.gitignore:61`; `ls .tmp/` |
| 164 package scripts, of which **50 `verify-*`** and **15 `gen-*`**; 204 files in `scripts/` | `package.json` |
| `verify-architecture-graph` exists at `package.json:167` and appears in **no** aggregate, **no** workflow, **no** hook | `grep -n architecture scripts/run-gates.ts` → no match; same for `.github/`, `lefthook.yml` |

Two documented claims are **empirically false today**, and both shaped the pain:

1. `docs/da-plugin-development-guidelines.md:262` §7 states the sync cadence is "**daily automated merge（CI）；conflict → Issue，24h SLA**". No automation exists. The actual record is two hand-driven merges 5.5 hours apart on 2026-09-08, after a 4-day blind spot.
2. The same §7 states "**规则 4.1 保证：因为 da 不改 dsh 源码，merge 冲突只发生在构建接线文件**". `docs/da-upstream-debt.md` §1 records three HIGH items (D1/D2/D3) where the fork *does* modify dsh src. My live overlap computation confirms the guarantee is false: of 41 overlap files, only 14 are build-wiring; **9 are dsh-owned `src/`**.

**Design consequence:** UM15 must not assume any mechanism exists. It must also correct §7 rather than build on it.

---

## 1. Staleness detection  ← **首片之一**

### 1.1 Where the last-synced SHA lives

Three real options, evaluated against this repo:

| Option | Works? | Verdict |
|---|---|---|
| **`git merge-base HEAD upstream/master`** (compute, don't record) | Yes — verified to return `c389f96bf3` exactly | **Primary computation.** Zero new state, cannot drift, correct by construction for real merges. |
| **Tracked file** (e.g. `upstream-sync.json`) | Yes | **Adopt as the audit/intent record**, not as the computation. |
| **Git notes** (`refs/notes/upstream-sync`) | Technically yes, but `refs/notes/*` is not pushed or fetched by default, no note exists today, and no tooling in this repo reads notes | **Reject.** Invisible in PR review; silently absent on a fresh clone. |
| **A doc paragraph** | This is the status quo | **Reject.** UM13's own evidence proves prose records rot: the numbers survived, the analysis did not. |

**Recommendation.** `merge-base` is the *computation*; a tracked file is the *declaration of intent*. They serve different jobs and the file's value is that it can disagree with `merge-base` — which is exactly the alarm you want.

`merge-base` alone has two failure modes, both real:
- If a future sync is ever squash-merged or rebased, there is no second parent, `merge-base` regresses to an older commit, and "N behind" silently over-reports forever.
- `merge-base` cannot distinguish "we deliberately synced to X and accepted its state" from "X happens to be the common ancestor."

So: `upstream-sync.json` (tracked, root or `docs/`) records `{ upstreamSha, upstreamRef, syncedAt, mergeCommit, commitsBehindAtSync, impactReport }`. A gate asserts `upstreamSha === git merge-base HEAD upstream/master`. Divergence between the two is itself the signal that history was rewritten.

### 1.2 Computing "N commits behind" — and the trap

```sh
git fetch upstream --prune                      # MANDATORY, see below
BASE=$(git merge-base HEAD upstream/master)
BEHIND=$(git rev-list --count "$BASE"..upstream/master)
AHEAD=$(git rev-list --count upstream/master..HEAD)
```

**The trap, verified live:** without the fetch, this reads a stale remote-tracking ref. Right now `upstream/master` points at `5dda764ed3` while the actual remote HEAD is `2377c272a8`. A staleness detector that skips the fetch will under-report by an unbounded amount and will produce a *false green* — precisely the failure mode UM15 exists to prevent.

For a fetch-free cheap probe (useful in a local `preflight`), `git ls-remote upstream HEAD` gives the remote tip in one round trip; if it differs from `upstream/master`, report `stale-ref` rather than a number. Never report a number computed from an unfetched ref.

### 1.3 Surfacing

Three channels, each doing a job the others cannot:

| Channel | What it does | Why here |
|---|---|---|
| **Local command** `pnpm run upstream-status` | Fetches, prints `behind/ahead`, base SHA, days since sync, threshold verdict. Exit 0 always. | The only channel that works today with zero infra. Must be non-failing so it is safe to run anywhere. |
| **Gate** `verify-upstream-sync-record` in `ci-static` | Asserts `upstream-sync.json` agrees with `merge-base`; **does not** check N-behind | N-behind must never gate a PR: upstream moves independently of the PR author, so a behind-count gate would fail unrelated PRs and get disabled within a week. Record *consistency* is author-controlled and therefore gateable. |
| **Scheduled job** | Fetches and opens/updates a single tracking Issue when past threshold | The actual staleness alarm. **But: no `schedule:` workflow exists in this repo, and CI has been red on both sides** (upstream master red since 8/13 per UM13; fork 22/45 static gates red per UM12). Adding a cron to red CI produces noise nobody reads. → **Decision 1.** |

**Thresholds.** I recommend threshold on *both* axes because they fail differently:
- `commits_behind > 150` — below the ~430/449 range where the human demonstrably lost the thread, and above ordinary daily churn.
- `days_since_sync > 14` — catches slow-drift periods that a commit count misses.
- **Hard stop: `seam_commits > 0`** on any of the 6 seams (§2.2). A single commit touching `packages/client/connection` is worth more attention than 200 touching `packages/subprocess`. The 449-commit window's actual damage was 2 seam breaks, not 449 commits.

Threshold values are calibration, not architecture — they belong in `upstream-sync.json` so they are reviewable.

---

## 2. Change-impact analyzer

This is the core deliverable: a faithful automation of the method UM13 actually ran. I reproduced every stage of that method against the current tree; the commands below are verified, not proposed.

### 2.0 Method extracted from UM13 (what the human actually did, in order)

1. Establish `merge-base` as the analysis base (`d347e703`).
2. Compute fork-diverged file set with a **tree diff**, not a commit walk.
3. Compute upstream-touched file set with `git log --name-only`.
4. Intersect → conflict *candidates*.
5. **Filter artifacts**: candidates with 0 real upstream commits (7 of 57) → 50 real.
6. Bucket by risk class: build-critical / data-agent / docs / other.
7. Rank by upstream churn: `git rev-list --count BASE..upstream/master -- <file>`.
8. Separately, classify content by subsystem and map to the 5 named seams, each with a BREAK/ADAPT/LOW verdict.
9. Verify the data-agent-package invariant is 0.
10. Recommend sequencing.

Decision points in that flow: (5) is-this-an-artifact, (6) which-bucket, (8) break-vs-adopt, (10) sequencing. Steps 1–4, 7, 9 are pure mechanism. **The analyzer automates 1–4, 7, 9 completely; 5 and 6 are rule-driven; 8 and 10 route to a human.**

### 2.1 Conflict-overlap — the exact plumbing

The subtlety UM15 names: the fork's history *contains* upstream's history, so "commits the fork authored" is not the same question as "files the fork changed." The wrong instinct is `git log HEAD ^upstream/master --name-only` (commit-authorship). That answers a different question and will include files the fork touched and then reverted, while missing files changed by a conflict resolution inside a merge commit.

The right computation is a **tree diff against the merge base**, which is what git's own 3-way merge will do:

```sh
BASE=$(git merge-base HEAD upstream/master)

# Files whose fork-tip content differs from the last-synced upstream tree.
# Two-dot on an ancestor BASE == three-dot; both are the merge base here.
git diff --name-only "$BASE"..HEAD | sort -u > fork-side.txt

# Files any upstream commit in the window touched.
git log --name-only --pretty=format: "$BASE"..upstream/master \
  | sed '/^$/d' | sort -u > upstream-side.txt

comm -12 fork-side.txt upstream-side.txt > candidates.txt
```

Why the tree diff is correct: a file conflicts iff both sides changed it relative to the base. `git diff BASE..HEAD` is exactly "the fork side changed it", regardless of *who* authored the change or how many merge commits it passed through. This is also the repo's own documented idiom — `docs/da-upstream-debt.md` (Audit-accuracy note) instructs reviewers to use `git diff upstream/master...HEAD -- <path>` for "committed net", after a scan agent was misled by a tainted working tree. **The analyzer must read committed state only** (`git show <rev>:<path>`), never the worktree; the working tree right now contains 84 untracked generated `.d.ts` files (UM-DATA-SRC-DTS-POLLUTION) that would corrupt any worktree-based scan. → **主 session 注 2026-09-10:此 84 已在本 session 清掉,工作树现在 0 行;但"analyzer 读 committed state only"这条铁律不变。**

Live result on the current tree: **fork-side 2929, upstream-side 2443, overlap 41, of which 0 are artifacts** (every one has ≥1 real upstream commit). UM13's window produced 2988 / 4567 / 57 / 7-artifacts → 50. Same pipeline, different window.

**Artifact filter (step 5).** A candidate with zero real upstream commits is a merge-mechanics artifact, not a conflict:
```sh
git rev-list --count "$BASE"..upstream/master -- "$f"   # 0 ⇒ artifact
```

**Bucketing (step 6).** UM13 bucketed by hand. The buckets are derivable from path plus one derived set — the generated-artifact inventory (§6.1). Live classification of the current 41:

| bucket | n | resolution policy |
|---|---:|---|
| BUILD-WIRING (`tsconfig*`, `pnpm-*`, `*/package.json`, `.gitignore`, `vitest.config.ts`) | 14 | additive-union both sides; §5 rule M1 |
| **GENERATED** (in the generator OUT inventory) | **7** | **never hand-merge — take either side, then regenerate**; §5 rule M4 |
| DSH-SRC (`packages/*/src/*`) | 9 | cross-reference `da-upstream-debt.md`; §5 rules M2/M3 |
| SCRIPTS | 5 | additive-union; these are generator sources, so a conflict here implies a regen |
| TESTS | 4 | usually accept-upstream; §5 rule M5 |
| CI | 2 | keep fork gates, union upstream jobs |

The 7 GENERATED entries (`docs/module-graph.{md,zh.md,i18n.yaml}`, `docs/tool-catalog.md`, `THIRD_PARTY_NOTICES.md`, `packages/extensions/tool-cordis/src/api-catalog.ts`, `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`) are **17% of the conflict surface that should never be hand-merged at all**. UM14 already discovered this in practice — the merge commit body records "slot-catalog.ts + api-catalog.ts taken from fork; regen blocked" and "README.i18n.yaml hashes recomputed." Formalizing it converts 7 judgment calls into 0.

**Ranking (step 7).** `git rev-list --count BASE..upstream/master -- <f>`, descending. Current top: `pnpm-lock.yaml` 48, `tool-cordis/src/api-catalog.ts` 38, `scripts/gen-cordis-catalog.ts` 14, `tsconfig.host.json` 11, `client/connection/src/client/fixture.ts` 10.

### 2.2 Seam-impact

The 6 seams are curated in `scripts/gen-architecture-graph.ts:63-98` (`SEAM_MANIFEST`). Commit counts per seam-owning path are a one-liner each:

```sh
git rev-list --count "$BASE"..upstream/master -- <seam paths>
```

Live, current window:

| seam | owning path(s) | commits | note |
|---|---|---:|---|
| 1 bundle-composition | `packages/bundle/` | 11 | additive per UM13 |
| 2 remote-api | `packages/api/gateway`, `packages/api/remotes` | 13 | |
| 3 client-connection | `packages/client/connection` | 13 | the seam that broke last time |
| 4 client-modules | `packages/client/modules` | 1 | |
| 5 remote-assembly | `packages/api/remotes/src/client` | 0 | |
| 6 remote-workspace-files | `packages/api/workspace-files` | 2 | adopted in UM14 |

The seam path table must be **derived from `SEAM_MANIFEST`, not re-hardcoded**, or it drifts. `SEAM_MANIFEST` gives package short names; `collectPackageGraph` gives `short → rel`. That mapping is already in the generator.

**Break-vs-adopt classification.** This is where honesty is required, because the architecture graph **cannot see the breaks that mattered**:

- Seam 3's break was `ConnectionConfig` → `ConnectionRecoveryConfig` plus `inject ['webServer','credentials']` → `['credentials']`.
- Seam 4's break was `DshClientDeclaration` → `DshClientManifest`.

Both are *symbol-level* changes inside a package-to-package edge that did not change. `gen-architecture-graph.ts` resolves every import to a package short name (`resolveDshSpecifier`, `:167-172`) and discards the imported symbols and the subpath. A graph diff across those commits is **empty**. UM14's own merge commit confirms the real discovery mechanism was the compiler: *"Persona seam surface migration (tsc-discovered)"*.

So break detection needs three signals, in increasing cost:

1. **Export-surface diff (cheap, git-only).** For each seam-owning package, diff its `package.json#exports` map and the exported-declaration list of its entry files between `BASE` and `upstream/master` via `git show`. A removed or renamed exported name that the fork imports = **BREAK, high confidence**. This is the signal that would have caught seams 3 and 4 without a build.
2. **Inject-signature diff (cheap, AST on two blobs).** Extract `inject = [...]` / `static inject` arrays from seam packages at both revisions. A shrunk inject array is the lazification signature (seam 3) and is the exact shape UM-ADAPT criterion 4 cares about.
3. **`tsc` after a trial merge (expensive, authoritative).** The ground truth, and the only complete one. Belongs in the *merge* step, not the *impact* step.

The analyzer should report (1) and (2) as **candidate breaks with evidence**, and explicitly state that absence of a candidate break is not proof of no break — only (3) is. Reporting "0 breaks" from graph diff alone would recreate exactly the false-confidence failure UM15 was chartered to eliminate.

### 2.3 data-agent package overlap

```sh
grep -E '^packages/(data/|bundle/data-agent/)' upstream-side.txt | wc -l
```
Live result: **0** — the invariant holds, as UM13 found. Note this must be computed against `upstream-side.txt` (all upstream-touched files), not against the overlap: overlap being 0 is weaker, since it would also be 0 if the fork had never touched its own packages.

**A non-zero result means one of three things**, and they need different responses:
- Upstream independently created a package at a colliding path → **naming collision**; the fork must rename, and this is a `grilling` (it touches every import and the bundle).
- The fork's data-agent packages were upstreamed → the fork should *delete* its copies, not merge them.
- A path-classification bug in the analyzer (e.g. upstream adds `packages/data/` for an unrelated purpose).

Because all three are contract-level events rather than mechanical merges, non-zero should **halt the automated pipeline** and emit a `grilling` candidate, not a `task`.

### 2.4 Architectural shift detection + adaptive-vs-surface verdict

**What the architecture graph is, precisely.** From reading `gen-architecture-graph.ts` end to end:

*Nodes*: 332 packages, one per `packages/*/*/package.json` whose `name` starts `@deepseek-ai/dsh-` (`scripts/package-graph.ts:36-37`, verified: `ls -d packages/*/*/ | wc -l` = 332 = depmap row count).
*Node attributes*: `short`, `group`, compiler face (from `tsconfig.{host,client}.json` `references`, `:129-146`), peer deps, cross-imports, seam role, undeclared-import count.
*Edges*: `-->` peerDependencies; `-.->` cross-package **value** import declared in no deps field; `==>` the @Remote wire (seam-2 emitter → seam-5 assembly → seam-3 carrier).
*Derived from*: package manifests; `tsconfig.{host,client}.json` references; a host-face TypeScript Program (`:399`); a source-text scan for `@Remote(` / `extends TypertRemoteService` (`:212-221`); `packages/api/remotes/src/client/index.ts` parsed line-wise by regex (`:224-234`); the curated `SEAM_MANIFEST`.

**What it does NOT encode** — this list is the analyzer's boundary condition:

- **Imported symbol names and subpaths.** Every specifier collapses to a package short name (`:167-172`). Renames, removals, and signature changes are invisible. *This is the big one.*
- **Type-only imports** are excluded from the graph (present in the table marked `*`).
- **Client→Client value imports** are under-reported — the Program is host-face only, stated in the header comment and in the rendered prose.
- **Cordis runtime wiring**: `cordis.patch.yml` rows, mount order, `inject` arrays, `disabled`/`config` overlays. Seam-1 is marked by *group membership* (`p.group === 'bundle'`), not by composition content.
- **`apps/*`, `vendor/*`, `python/*`, non-`dsh-` packages.**
- **Dynamic imports**; `@Remote` emitters are a text scan, not checker-resolved (stated at `:206-211`).
- **Versions**, tool schemas, config schemas, event surfaces.
- **The data-agent→upstream dependency table with the VIOLATION row.** UM-flow describes it as part of UM-ARCH's output, but the generated graph has no such table — it has one flat 332-row depmap with a `seam role` column. The violation semantics live only in `UM-flow-2026-09-08.md` prose. **The graph cannot answer "is this consumption a violation?" today.**
- **`seam-6` is a phantom.** `SEAM_MANIFEST` declares it with `implementations: []` and `mode: 'pending'`, and its note still reads "workspace-files dir absent" — but `packages/api/workspace-files` exists in HEAD. Verified marking counts in the committed graph: seam-1 → 7 packages, seam-2 → 21, seam-3 → 1, seam-4 → 1, seam-5 → 1, **seam-6 → 0**. UM-ARCH's Resolution claims "workspace-files 已 authoritative"; that is true of the *package inventory* (it appears as a node and as an emitter/assembly member) but **false of the seam marking**. Any analyzer that reads seam membership off the graph will see the workspace-files seam as nonexistent. This is a small, real bug that UM15 depends on and should fix as a precondition.

**Cheap architectural-shift detection — the git-only trick.** I verified which generated artifacts are committed in upstream's tree at both revisions:

| artifact | in `upstream/master` | in `c389f96bf3` | consequence |
|---|---|---|---|
| `docs/module-graph.md`, `docs/tool-catalog.md`, `docs/config-catalog.md`, `docs/persistence-catalog.md`, `docs/cordis-api/inherited.md`, `tool-cordis/src/api-catalog.ts`, `cordis-client-runner/src/client/{slot-catalog,api-catalog}.ts`, `scope/src/scoped-events.generated.ts`, `session-format-catalog/src/generated.ts`, `session/src/known-event-types.ts`, `THIRD_PARTY_NOTICES.md` | yes | yes | **diffable with `git show`, zero execution** |
| `docs/architecture-graph.md`, `scripts/gen-architecture-graph.ts` | **no** | **no** | **fork-only** — must be generated to compare |

This is the highest-leverage finding for the analyzer. Upstream commits its own machine-readable architecture surface, and it is verified-fresh by upstream's own gates, so:

```sh
git diff "$BASE" upstream/master -- docs/tool-catalog.md docs/config-catalog.md \
  docs/persistence-catalog.md docs/cordis-api/inherited.md \
  packages/extensions/tool-cordis/src/api-catalog.ts \
  packages/core/scope/src/scoped-events.generated.ts   # ... etc
```

gives an **execution-free architectural shift report** at *symbol* granularity — the Cordis `ctx` API surface, the tool schemas, the event surface, the client slot registry — precisely the granularity the architecture graph lacks. `tool-cordis/src/api-catalog.ts` already sees 38 upstream commits in this window, and it is a `SERVICE_API`/`TYPE_API` table; diffing it *names the changed seam methods*.

The architecture graph, being fork-only, must be *generated* at each upstream revision to be diffed. Its inputs are all in-tree (manifests, tsconfigs, sources) and the import scan is documented as AST-only with no checker (`:174-177`), so a `--rev` mode running in a detached worktree looks feasible without `pnpm install` — **but I did not run it, and `TypeScriptProject` constructs a real Program, so this is an inference, not a verified capability.** See Decision 4.

**The 5 UM-ADAPT criteria — decidability, verbatim:**

| # | criterion (verbatim) | mechanically decidable? | how the tool should behave |
|---|---|---|---|
| 1 | 每移位识别 upstream **why**（不只 surface diff） | **No.** Intent is not in the tree. | **Route.** Assemble the evidence bundle automatically: commit cluster by subsystem, conventional-commit types, PR titles/bodies, the named commits. Human writes the *why*. |
| 2 | 判 data-agent 当前架构**是否与新逻辑冲突**（不只编译过） | **Asymmetric.** Can *prove conflict exists* (fork imports a removed symbol; fork's inject array no longer matches). Cannot prove *absence* — and the criterion text explicitly rejects "it compiles" as sufficient. | **Decide the positive, route the negative.** Emit `conflict-proven` with evidence, or `conflict-not-proven` — never `no-conflict`. |
| 3 | 改造后达成**干净 seam 消费**（public 契约，不用 zombie 内部、不绕过新 lazy 模式） | **Mostly yes.** "Public 契约" is decidable from `package.json#exports` vs actual import specifiers. "不用 zombie 内部" is decidable given a zombie package list. "不绕过新 lazy 模式" is partly decidable via inject-array comparison. | **Decide**, as a lint-shaped check. This is the one criterion to fully automate. Note the graph's existing `undeclared?` column is a *related but different* property (declared-in-manifest, not public-export-respecting). |
| 4 | **不用 fork workaround 对抗新逻辑** | **No.** "Fighting the new logic" is semantic. | **Route with smells.** Detectable: re-adding a removed inject; re-eager-injecting a lazified service; `as any`/`as never`/`as unknown` at a seam boundary; a fork-local re-export mirroring a deleted upstream export. Present as suspicion, never as verdict. |
| 5 | **可验证**（行为符合新逻辑，不只编译过） | **No as correctness; yes as coverage.** Can decide "does a non-type test exercise the changed seam path". | **Route, with the coverage answer attached.** Emit `behavioral-test-absent` as a hard finding — that *is* mechanically decidable and it is the actionable half. |

Net: **1 of 5 decidable (criterion 3), 1 decidable-negative-only (2), 1 decidable-as-proxy (5), 2 evidence-assembly-only (1, 4).** The tool's verdict vocabulary must therefore be `{adaptive-proven, surface-proven, needs-human}` with `needs-human` as the default, plus UM-ADAPT's own real-world fourth value `needs-adaptive-but-mechanical` (used for the invariant-cleanup shift, routed to UM16) and `not-applicable` (used for workspace-files). Reusing that vocabulary keeps the automation aligned with the human precedent rather than inventing a new scale.

### 2.4.bis merge 完整性门（主 session 补，来自 UM-MERGE-INTEGRITY）

S4 的原草案没有这一节。主 session 在 [UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md) 发现:**`tsc` 绿 ≠ merge 无损** —— 2026-09-07 merge 既丢了 upstream 文件、又复活了 upstream 已删包,两个方向都逃过编译器(丢的文件没有 fork 侧 importer;多的包能独立编译),所以 `build:official` 绿对 merge 完整性**什么都没证明**。

durable 方法须含一道**纯 git plumbing 的 merge 完整性 gate**,与「gate 是否变红」正交:

- **upstream 删除应用检查**:对每个「upstream 在窗口内删除的路径」,断言 merge 后该路径不存在(除非有显式 keep-fork 豁免记录)。
- **upstream 文件保留检查**:对每个「upstream 在窗口内存在且未删除的路径」,断言 merge 后仍存在(除非有显式 fork-drop 豁免记录)。

两者都不需要构建,且**恰好抓住编译器结构上抓不到的那一类损失**。这道 gate 存在的话,本 session 的两类问题会在 merge 当天被抓到。

---

## 3. Ticket generation workflow

### 3.1 Pipeline

```
fetch → staleness → impact-analyzer → impact report (TRACKED)
      → ticket candidates (draft files, not committed)
      → human review/edit/merge/reject
      → tickets created + flow doc + upstream-sync.json updated
```

**The impact report must land in a tracked path.** UM13's reports went to `.tmp/` (`.gitignore:61`) and are gone; only the ticket summaries survive. Precedent for the right location: `wayfinder/data-agent/research/` holds 59 tracked research notes, including `um-arch-design-2026-09-08.md` and `um-adapt-seam34-sample-2026-09-08.md` cited from tickets. → `wayfinder/data-agent/research/upstream-impact-<BASE>..<NEW>-YYYY-MM-DD.md`, keyed by the SHA pair so it is reproducible and never overwritten.

Pairing obligation check: `scripts/translation-pairing.manifest.json` names only 4 `wayfinder/` paths (`data-agent/prototypes/`, one research README, `evaluation/tickets/README.md`, `task-orchestration-dag/prototype/README.md`). The upstream-merge ticket directory and general research notes are **not** paired, so generated tickets and reports incur no `.zh.md` + `.i18n.yaml` obligation. (The `tickets/README.md` index *is* paired — so if generation touches that index it must update all three files, and `*.i18n.yaml` carries the custom merge driver per `.gitattributes`.)

### 3.2 Ticket template (matched to this repo's actual shape)

Derived from `UM-LINT-TYPEAWARE-CORDIS`, `UM12`, `UM-ARCH`, `UM15`, `UM-ADAPT`. There is no ticket template in `wayfinder/_templates/` — it contains only `session-prompt.md` — so the shape below is reverse-engineered from live tickets:

```markdown
# <ID> — <one-line title, Chinese-primary with English technical terms>

**Type**: <research|prototype|grilling|task|chore|refactor> · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: — / [<ID>](<file>.md)
**Blocks**: [<ID>](<file>.md)（<why>）
**Graduated from**: [<source>](<file>.md)（<date> <what produced it>）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase <X>）

## Question
<the decision or unknown, stated so it can be answered. For grilling: enumerate
the candidate options (A)/(B)/(C) with the cost of each — see UM-LINT-TYPEAWARE-CORDIS.>

## 证据基线（<generator> <date> 实测，勿重导）
<machine-produced counts + file:line + the exact commands, so the next session
does not re-derive. This section is what the analyzer fills.>

## Scope / 子步
1. …

## Deliver
<artifact list>

## 判据
<what counts as done>

## Resolution
(open)
```

Conventions the generator must honor, all observed:
- `**Blocked by**` / `**Blocks**` are relative markdown links and **must be acyclic** — UM11↔UM12 deadlocked on a cycle and needed manual repair (`UM12`, Blocked-by revision note). The generator must reject a cycle at emit time.
- `**Graduated from**` cites the producing ticket + date.
- The "证据基线 … 勿重导" ("don't re-derive") section is a repo idiom worth keeping: it is how a generated ticket stays cheap for the next session.
- Commit prefix for work on a ticket is `[<TICKET-ID>] …` (verified: `[UM10]`, `[UM16]`, `[R-DA-P1]`, `[UM-CORDIS]`, `[Follow-on-3-B]`, `[Phase-C]`).

### 3.3 Mapping rules: finding → ticket type

| Impact finding | Type | Precedent |
|---|---|---|
| Overlap in BUILD-WIRING or GENERATED bucket | **no ticket** — merge manual rule M1/M4 + regen checklist | UM8 archived as "config-divergence mission complete" |
| Overlap in DSH-SRC ∩ a recorded `da-upstream-debt` item, upstream body changed only | **task** | `da-upstream-debt.md` D1/D2/D3 "mechanical resolve: keep da's addition, incorporate upstream body" |
| Overlap in DSH-SRC ∩ debt item, upstream **restructured** the surface | **research** → then **grilling** if >1 compliant shape | D1's "if upstream renames these methods before the PR lands, rebase onto the new signature" |
| Overlap in DSH-SRC, comment-only / test-only churn | **chore** (revert to upstream) | UM7 bucket 3, "~12 UNNECESSARY-DIVERGENCE churn reverted by re-sync" |
| Seam BREAK, candidate detected | **research** (per-shift adaptive analysis) | UM-ADAPT is exactly this ticket |
| Seam BREAK where ≥2 architecturally different compliant designs exist | **grilling** | R-DA-UI-PRESENTER-COMPOSITION (Plan A vs Plan B, resolved to B + ADR-0002) |
| Seam BREAK, single compliant shape, non-trivial code | **prototype** | R-DA Phase-2 |
| Seam BREAK, verdict `needs-adaptive-but-mechanical` | **task** | UM-ADAPT routed invariant-cleanup → UM16 |
| NEW seam, additive, adoption mechanical (dep + alias + mount-loop) | **task** | UM14 sub-step 4, workspace-files |
| NEW seam, adoption value unclear | **research** | UM-ADAPT lists workspace-files as "多半 adaptive 采纳" |
| data-agent package overlap ≠ 0 | **grilling** (halt) | no precedent — contract-level event |
| Generated artifact stale after sync | **no ticket** — regen checklist | UM10 fixed 5 stale catalogs inside one commit |
| Gate red post-sync, cause known, fix mechanical | **task** | UM12 per-gate disposition |
| Gate red post-sync, "how does this count as passing" is the question | **grilling** | UM-LINT-TYPEAWARE-CORDIS (A/B/C options) |
| Gate red post-sync, cause unknown | **research** | UM12 "待逐门归因" rows |
| Generator writes into tracked `src/` and pollutes lint | **task** with "locate the producer, not just gitignore" | UM-DATA-SRC-DTS-POLLUTION |

**Human confirmation is mandatory and should be cheap.** Emit candidates as files under `.tmp/` (untracked, deliberately) plus a single tracked review checklist in the impact report. The human's act of confirmation is `git mv` into `tickets/phase-upstream-merge/` + adding the row to `tickets/README.md`. Never auto-commit tickets: the mapping table above encodes judgment about *which* type, and a wrong type mis-routes a whole session (grilling = HITL, research/task = AFK, per `tickets/README.md`).

---

## 4. Cadence — options for the human  ← **待 grilling**

Frame: `docs/da-plugin-development-guidelines.md:262` §7 already **declares** "daily automated merge (CI); conflict → Issue, 24h SLA." Nothing implements it. So the first cadence question is not "what should it be" but "do we honor, amend, or retract the existing written commitment." Retracting silently is the worst option — it is how the 449 happened.

| Option | Mechanics | Pros | Cons |
|---|---|---|---|
| **(a) Daily automated merge** (honor §7 as written) | Cron: fetch, attempt merge on a bot branch, open Issue on conflict | Conflict surface stays ~5 files; no 449 events; §7 becomes true | Needs a scheduled workflow (**none exists**); upstream master has been red since 8/13 and fork static is 22/45 red, so "did the merge break it?" is unanswerable; every conflict is an unscheduled interrupt; the fork is 819 commits ahead with active multi-session work in flight |
| **(b) Periodic (weekly/biweekly) scheduled sync session** | Cron runs *staleness + impact only*; a human claims a sync session | Bounded, batched, schedulable; impact report is ready before the session; matches how work actually happens here (worktree per ticket) | Windows of 100–300 commits; seam breaks discovered late-ish |
| **(c) On upstream release** | Trigger on new `dsh-v*` tag | Aligns to a coherent upstream state; upstream *does* tag (`dsh-v0.1.5-alpha.1` = `5dda764ed3`) | Release-tag spacing is not commit-count-bounded — `c389f96bf3` → `5dda764ed3` is one release and **430 commits**. Verified: this option alone would not have prevented the incident |
| **(d) Threshold-triggered** | Alarm at `behind > N` **or** `seam_commits > 0` **or** `days > D` | Fires on the metric that actually predicts pain; cheap; no merge automation needed | Needs a place to run; thresholds need calibration; alarm without an owner is ignored |
| **(e) On-demand only** (status quo) | Human runs `pnpm run upstream-status` | Zero infra | This is exactly what failed. Requires someone to remember |

**Recommendation: (d) + (b), and amend §7.** Threshold-triggered *detection* on a fixed cadence, with *execution* batched into a claimed session. Concretely: a weekly detector that opens/updates one tracking Issue when any threshold trips, plus a `seam_commits > 0` hard trip that escalates regardless of count. Then amend §7 to describe this, deleting the "daily automated merge / 24h SLA" claim and the false "conflicts only in build-wiring" guarantee.

Reject (a) for now, on evidence: automated merge requires a green baseline to attribute breakage against, and neither side is green. Revisit (a) after UM12 lands a known-good gate baseline. Reject (c) as a *primary* trigger — measured, it does not bound the window — but keep the release tag as useful *metadata* on the sync (sync to a tag, not a floating tip, so the synced base is nameable).

**This is Decision 2, and it is the one that most needs the human.**

---

## 5. Merge-assistance discipline (executable manual)

Sources: the `8112743d69` merge-commit body (the most detailed record that exists), UM7's d5 four-bucket classification, `docs/da-upstream-debt.md` per-item "Interim workaround (avoid merge conflicts)", `docs/da-plugin-development-guidelines.md` §4.1–§4.4.

### 5.1 The decision procedure

Note first: UM13 predicted 50 real conflicts; the merge commit records **"All 36 conflicts resolved (21 UU + 15 AU)"**. The prediction was an over-estimate by 14 and split into a content class (UU) and an add/add-or-rename class (AU) that the file-overlap method does not distinguish. The manual must handle AU (upstream directory renames — 15 of 36 here, all `.agents/notes/proposed/simplification` → `rejected/simplification`) as a separate, near-mechanical class. Rename-heavy windows will otherwise dominate the conflict count and look scarier than they are.

For each conflicted path, in order — first match wins:

| rule | condition | action |
|---|---|---|
| **M0** | AU (add/add or rename/rename) from an upstream directory rename | **Accept upstream's location.** Move fork-only files into the new location. Mechanical. |
| **M1** | Path is build-wiring (`tsconfig.{base,host,client}.json`, `pnpm-workspace.yaml`, `*/package.json` deps, `tsconfig.*.json` refs) | **Additive-union both sides**, de-duplicate. Never choose. Verified idiom: *"tsconfig.host.json: additive-union both path-glob + project-list hunks, de-dup apps/cli"*; §7 *"构建接线冲突：机械解——保留双方"*. Exception: **`package.json#version` keeps fork** (*"package.json keeps fork version 0.1.0-rc.8"*). |
| **M2** | Path is in the generated-artifact inventory (§6.1) | **Do not merge.** `git checkout --ours` (or `--theirs`, immaterial), mark resolved, and add the owning generator to the mandatory post-merge regen list. Verified idiom: *"slot-catalog.ts + api-catalog.ts taken from fork; regen blocked by …"* and *"README.i18n.yaml hashes recomputed"*. |
| **M3** | Path is dsh-owned `src/` **and** the hunk is a recorded `da-upstream-debt` addition (D1/D2/D3) | **Hand-merge, additive-only: keep the fork's addition, take upstream's body.** Verbatim policy: *"Mechanical resolve: keep da's optional param and incorporate any upstream body changes."* If upstream *restructured* the surface, do **not** force the addition in — stop and open a ticket (D1: *"rebase da's optional param onto the new signature"*). |
| **M4** | Path is dsh-owned `src/` and the fork hunk is comment-only or test-only churn | **Accept upstream** (revert fork churn). UM7 bucket 3: *"~12 UNNECESSARY-DIVERGENCE churn reverted by re-sync"*. |
| **M5** | Path is a test/spec and the fork change is not load-bearing | **Accept upstream.** *"2 specs take upstream hooks"*. |
| **M6** | Path is CI (`.github/workflows/*`) | **Union**: keep fork-only gates, take upstream job changes. *"build-preview-cloudflare.yml (keep fork CI gate + runner)"*. |
| **M7** | Path is a *generator source* (`scripts/gen-*.ts`) with additive fork entries | **Union both additive hunks**, then regenerate the outputs. *"gen-cordis-catalog.ts: union 2 additive hunks (fork data-agent + upstream service/type entries)"*. |
| **M8** | Anything else, or M3 with a restructured upstream surface | **Stop. Do not resolve.** Emit a ticket candidate. This is the escape hatch that keeps the manual honest. |

### 5.2 The additive-only rule

`docs/da-plugin-development-guidelines.md:132` §4.1: *"da 的所有功能通过新增包 + composition 实现，不修改 dsh 已有包的 src/ 目录。唯一允许的例外：构建接线文件（tsconfig refs、generator manifests）的 additive 行。"*

Merge-time corollaries:
- A conflict resolution may **add** to a dsh surface; it may not **change** upstream semantics. `da-upstream-debt.md` states every §1 item is *"additive / backward-compatible (optional params, new optional fields, new types/exports) — none is breaking"*.
- A resolution that requires editing upstream logic is not a resolution — it is a §4.2 wrapper-seam ticket (`:138`) or an upstream PR.
- New fork files never conflict (*"The new brand.ts file will not conflict (additive file)"*), which is the mechanical argument for preferring new files over edits.
- §3.2 hard boundary: modifying an existing `SessionEventMap` member is not additive even when it looks like adding an optional field (D1 flags this explicitly). Adding a *new* member is also forbidden. Merge-time: any conflict inside a `SessionEventMap` declaration is automatically **M8**.

### 5.3 The UM1–UM9 pattern, generalized

UM1–UM9's real content is the **d5 four-bucket triage** (UM7 background): classify every fork-modified upstream file into LEGITIMATE-EXTENSION (~45, KEEP + re-verify it still compiles) / DATA-AGENT-COUPLED (~8, REFACTOR into fork-owned packages) / UNNECESSARY-DIVERGENCE (~12, REVERT) / UPSTREAM-LOGIC-CHANGE (3, route to a dedicated ticket). That maps 1:1 onto keep-fork / hand-merge-then-refactor / accept-upstream / open-a-ticket, and it is the durable artifact: **the buckets are a property of the fork's divergence, not of one merge window.** Sustained, the bucket assignment per divergent file should be a tracked table (an extension of `da-upstream-debt.md`) so each sync consults it instead of re-triaging 2929 files. UM7's triage note says the 68-file bucketing was *"reconciled by `c389f96bf3` merge"* — i.e. the work was done and the table was thrown away.

### 5.4 Two mechanisms this repo already has that the manual should reuse

1. **A custom git merge driver, fail-closed, registered per-worktree.** `.gitattributes` maps `*.i18n.yaml merge=dsh-translation-pairing`; `scripts/install-lefthook.mjs:31-34` registers `merge.dsh-translation-pairing.{name,driver}` in worktree-local git config; `scripts/merge-translation-pairing-driver.sh` falls back to `git merge-file` and **exits 1 to leave index stages unresolved** when the runtime is unavailable, because *"a clean text merge is still unverified pairing metadata."* This is exactly the shape M2 needs: a `merge=dsh-generated-artifact` driver over the generated-artifact inventory that resolves by *scheduling regeneration* and refuses to report success until the generator has run. Reusing an existing, reviewed pattern beats inventing one.
2. **A dry-run before the real merge.** The merge commit cites *"dry-run um14-merge-dryrun-2026-09-08 8-step order"*. That ref no longer exists (verified: no `dryrun` ref in `for-each-ref`). The dry-run is the mechanism that turned 36 conflicts into an ordered 8-step plan; it should be a named script producing a tracked plan, not an ephemeral branch.

---

## 6. Regeneration checklist + verification-surface coverage  ← **首片之二**

### 6.1 Package add/remove ⇒ regeneration checklist

Every row below was established by reading the generator. "Inventory-sensitive" means the generator's output can change when a package is added or removed even if no source file changes.

| generator | output(s) | reads the package inventory? | trigger |
|---|---|---|---|
| `gen-architecture-graph` | `docs/architecture-graph.md` (`:41`) | **YES** — `collectPackageGraph` (`:395`) → `globSync('packages/*/*/package.json')` (`package-graph.ts:37`); plus per-package `package.json` reads (`:247`); plus `tsconfig.{host,client}.json` `references` (`:129-146`); plus a host-face Program (`:399`) | **add/remove/rename/move any package; change any peerDep; change a face tsconfig ref** |
| `gen-module-graph` | `docs/module-graph.md` (`:15`) | **YES** — `collectPackageGraph` (`:118`) | same |
| `gen-doc-graphs` | `docs/subsystems/*` (writes via `:1630`) | **YES** — `collectPackageGraph` (`:1558`) + `TypeScriptProject` (`:1343`) | same |
| `gen-tsconfig-paths` | `tsconfig.base.json` generated alias region (`:27`) | **YES** — `readdirSync` walk of `packages/<group>/<dir>` (`:74-79`); also keys off presence of `src/invariant.ts` | **add/remove/rename a package; add/remove a package's `src/invariant.ts`** |
| `gen-config-catalog` | `docs/config-catalog.md` (`:18`) | **YES** — `globSync('packages/*/*/package.json')` (`:625`) | add/remove a package that declares config |
| `gen-tool-catalog` | `docs/tool-catalog.md` (`:121`) | **YES** — completeness guard globs `packages/*/tool-*` (`:960`) and **fails if a tool package is missing from the boot manifest** | **add/remove a `packages/*/tool-*` package** |
| `gen-cordis-catalog` (= `gen-cordis-api`, an alias: `gen-cordis-api.ts` imports and calls `main` from `gen-cordis-catalog.ts`) | `docs/cordis-api/inherited.md` (`:45`), `packages/extensions/tool-cordis/src/api-catalog.ts` (`:46`), `docs/subsystems/*` (`:44`) | **Indirectly** — globs `packages/*/*/src/**/*.{ts,tsx}` (`:1057`) | add/remove any package **with sources**; any Cordis service/type change |
| `gen-client-catalog` | `cordis-client-runner/src/client/slot-catalog.ts` (`:29`) | **Indirectly** — `SOURCE_GLOBS = packages/*/*/src/**/*.{ts,tsx}` (`:32`) | same. *This is the second artifact UM10 found stale from the Phase-2 package deletion.* |
| `gen-persistence-catalog` | `docs/persistence-catalog.md` (`:16`), `core/session/src/known-event-types.ts` (`:17`) | **Indirectly** — globs `packages/*/*/src/**/*.ts` (`:176`, `:253`, `:299`) | same |
| `gen-scoped-events` | `core/scope/src/scoped-events.generated.ts` (`:23`) | **Indirectly** — `TypeScriptProject` (`:377`), i.e. `tsconfig.host.json` refs | add/remove a package **referenced by `tsconfig.host.json`** |
| `gen-cordis-inspect-catalog` | `cordis-client-runner/src/client/api-catalog.ts` (`:10`) | Indirectly (Cordis surface) | Cordis API change |
| `gen-third-party-notices` | `THIRD_PARTY_NOTICES.md` (`:18`) | **YES** — `workspaceMembers('pnpm-workspace.yaml')` → manifest globs (`:151`, `:135-155`); also `python/*/pyproject.toml` (`:587`), `vendor/README.md` (`:444`) | **add/remove a workspace member; change `pnpm-workspace.yaml`; change any external dep** |
| `gen-session-format-catalog` | `session-format-catalog/src/generated.ts` (`:9`) | **Narrowly** — globs `packages/session/session-format-v*-to-v*/package.json` (`:68`) | add/remove a session-format migration package only |
| `gen-translation-brief` | (authoring aid, no gate) | no | n/a |

Non-generator gates that are also inventory-sensitive and will go red on a package add/remove — these belong on the same checklist even though they are not `gen-*`: `verify-package-paths` (globs `packages/*/*` to build the real-package set, `:43`), `verify-application-entrypoints` (`:95`), `verify-package-dependencies` (`:24`), `verify-package-invariants` (`package-invariants.ts:51`), `verify-runtime-closure` (`:202`), `verify-cordis-config` (`:364`, `:470`), `verify-client-packages` (`:13`), `verify-subsystem-pages` (`:73`), `verify-node-next-types` (`:40`), `verify-package-readme-{model-experience,limitations}`, `publint-all` (`:53`), `project-reference-faces` (`:15`).

**The checklist, as a formal artifact.** A package add/remove/rename invalidates, at minimum:

```
tier 1 — ALWAYS (direct inventory readers):
  gen-architecture-graph, gen-module-graph, gen-doc-graphs,
  gen-tsconfig-paths, gen-config-catalog, gen-third-party-notices
tier 2 — IF the package has sources:
  gen-cordis-catalog (≡ gen-cordis-api), gen-client-catalog,
  gen-persistence-catalog, gen-scoped-events (if in tsconfig.host refs)
tier 3 — IF the package matches a narrow pattern:
  gen-tool-catalog          (packages/*/tool-*)
  gen-session-format-catalog (packages/session/session-format-v*-to-v*)
tier 4 — non-gen gates to re-run: the 13 listed above
```

This is exactly the list that would have caught the Phase-2 `packages/client/runtime` deletion. UM10 found **two** tier-1/tier-2 artifacts stale from that deletion (`architecture-graph` and `slot-catalog`), of which only `slot-catalog` was in-group.

Mechanization: the checklist should not be a markdown list a human consults. `gen-*` scripts already declare their inputs in code. The durable form is a **manifest** (`scripts/generator-inputs.manifest.json`) mapping each generator to input globs, with a spec asserting each generator's declared inputs match what it reads — and a `pnpm run regen-for-package-change` that runs the union. A doc-only checklist has the same failure mode as §7: it will be true when written and false in a month.

### 6.2 Verification-surface coverage as a verified property

**The failure class, generalized:** a `verify-*` script's existence was taken as evidence that the property is checked. Nothing verified that any aggregate *runs* it. Coverage of the verification surface was assumed rather than checked.

**Verified current state.** Of 50 `verify-*` scripts, **45 are reachable from `scripts/run-gates.ts`** by script name, script file, or spec file. Five are not:

| script | actually covered elsewhere? |
|---|---|
| `verify-no-production-src-on-master` | **Yes** — dedicated workflow `.github/workflows/no-production-src-on-master.yml:86` + wired in `lefthook.yml`. Deliberately out-of-group. |
| `verify-npm-install-layout` | **Yes** — `.github/workflows/release.yml:87`. Deliberately out-of-group. |
| `verify-cordis-api` | **Effectively yes** — it is `gen-cordis-api.ts --check`, and `gen-cordis-api.ts` only imports and calls `main` from `gen-cordis-catalog.ts`, which *is* covered as `verify-cordis-catalog`. A benign duplicate alias. |
| `verify-third-party-notices` | **No.** Not in any aggregate, workflow, or hook. |
| `verify-architecture-graph` | **No.** The known instance. |

So the genuinely-unaccounted set is **2**, and both are `--check` freshness gates on generated artifacts. That is not a coincidence — it is the pattern: **when someone adds a generator, they add `gen-X` and `verify-X` to `package.json` and forget that aggregate membership is a separate edit in a separate file.** `gen-architecture-graph.ts` was added by fork commit `ce734798d7` ("feat(scripts): gen-architecture-graph generator + verify gate") — the commit message says "verify gate", and a gate was indeed created; it just was not enrolled anywhere.

> **主 session 补 2026-09-10**:S3 的独立复核给出更精确的盲区清单 —— 真盲区**两个**(`verify-architecture-graph` + `verify-cordis-api`),其中 `verify-cordis-api` 是**一条已回归的成文不变量**:`.agents/notes/archived/process/2026-07-21-doc-sync-through-gate-scheduler.md:16` 明文断言它在 `docSyncLeafGates` 里,而今天 `cordis-api` 字符串在 `run-gates.ts` 里不存在。另 `verify-npm-install-layout` 是**半个洞**(只在 release workflow,PR 不跑)。这条要单独开票。

**The mechanism: a meta-gate.** `verify-gate-coverage` — enumerate every `verify-*` and `check:*` script in `package.json`; enumerate every gate reachable from `gatesForMode(mode)` for every mode; diff; fail on any script in neither the aggregates nor an explicit exemption list. Exemptions live in a tracked manifest with a required `reason` and `coveredBy` field, so `verify-no-production-src-on-master` and `verify-npm-install-layout` are *decided* exemptions rather than accidental gaps, and `verify-cordis-api` is recorded as an alias.

Feasibility is verified, with one required precondition:
- `gatesForMode` and `Mode` are **exported** (`scripts/run-gates.ts:232`, `:24`) — a meta-gate can import and enumerate.
- **But there is no runtime list of modes.** The mode list is duplicated three times: the `Mode` type union (`:24-41`), the `parseMode` switch (`:135-152`), and the error string (`:156`). A meta-gate that hardcodes a fourth copy would itself drift — the same bug one level up. **Precondition: export `const MODES = [...] as const` and derive `type Mode = typeof MODES[number]`**, collapsing three copies to one and giving the meta-gate a trustworthy enumeration. Small, mechanical, and it makes the meta-gate's own correctness structural rather than aspirational.

**Where the meta-gate goes.** `ci-static` — it is a fast, pure-JS, build-free check, and `ci-static` is the aggregate a sync sweep runs. Also add it to `hygiene` (pre-push).

**Second-order finding on why this one slipped.** `docs/architecture-graph.md` *is* touched by an in-group gate — `verify-mermaid` globs `docs/**/*.md` (`scripts/verify-mermaid.ts:18-22`) and is in `docSyncLeafGates`. So its Mermaid *syntax* is gated while its *freshness* is not, which makes it look covered. It is also an **orphan document**: nothing in `docs/`, `README.md`, or any subsystem page links to `docs/architecture-graph.md`, and it is absent from `scripts/doc-budgets.manifest.json` (which lists `docs/architecture.md`, a different file). Partial coverage plus zero inbound links is the profile of an artifact that will go stale unnoticed. → the coverage manifest should assert *freshness* coverage specifically, not "some gate reads this path."

**Where the sweep runs after a sync.** UM12's disposition is the model: `check:ci:static` (45 gates) + `check:ci:consumers` + `test:coverage` + `test:snapshot`, plus — and this is the UM15 addition — **every out-of-group gate named in the coverage manifest's exemption list**, because "out of group" must not mean "out of the sync sweep." A `pnpm run check:sync-sweep` aggregate that composes `ci-static` + the exempted gates + the tier-1..3 regen `--check`s makes the post-sync obligation one command instead of a remembered list.

---

## Decisions the human must make

**1. Where does the staleness detector run, given that no scheduled workflow exists and both sides' CI are red?**
- (a) First `schedule:` workflow in `.github/workflows/` → opens/updates one tracking Issue. *Pro:* actually autonomous. *Con:* first cron in a repo with 22/45 static gates red; a red-CI notification channel gets muted.
- (b) Local-only `pnpm run upstream-status`, plus `verify-upstream-sync-record` in `ci-static` for record consistency. *Pro:* zero new infra, works today. *Con:* relies on someone running it — the exact failure that produced the 449.
- (c) (b) now, (a) after UM12 delivers a green-or-known-red baseline.
- **Recommendation: (c).** Ship the deterministic half immediately; gate the cron on a baseline that makes its output meaningful. Note (b) alone is *insufficient* and should be explicitly labelled interim.

**2. Cadence.** Options (a)–(e) in §4 with measured tradeoffs. **Recommendation: threshold-triggered detection (d) on a weekly tick + batched execution in a claimed session (b), and amend `docs/da-plugin-development-guidelines.md` §7** to delete the unimplemented "daily automated merge / 24h SLA" and the falsified "conflicts only in build-wiring" guarantee. Sub-decisions: threshold values (`behind > 150`? `days > 14`? `seam_commits > 0` as a hard trip?) and whether to sync to release tags rather than floating tips.

**3. Record format for the synced SHA.** (a) `merge-base` only — no new state, but cannot detect rewritten history or express intent. (b) Tracked `upstream-sync.json` + a gate asserting it equals `merge-base`. (c) Git notes. **Recommendation: (b).** Reject (c): `refs/notes/*` is not pushed/fetched by default, no note exists in this repo today, and nothing here reads notes. The *point* of (b) is that the file can disagree with `merge-base` — that disagreement is the alarm.

**4. How does the analyzer obtain the architecture graph at an arbitrary upstream revision?** `docs/architecture-graph.md` and its generator are **fork-only** (absent from `upstream/master` and from `c389f96bf3`), so there is nothing to `git show`.
- (a) `gen-architecture-graph --rev <sha>` in a detached worktree. Inputs are all in-tree and the import scan is documented AST-only, so it *may* work without `pnpm install`. **Unverified — I did not run it.**
- (b) Skip graph-diff entirely; rely on the execution-free diff of upstream's own committed generated artifacts (§2.4), which is *richer* at symbol granularity than the graph, plus the export-surface diff.
- (c) Full worktree + `pnpm install` per revision. Correct, slow, and `gen-tool-catalog` *boots* plugins, so this is the only option that yields a complete artifact set.
- **Recommendation: (b) as the default, (a) as an opt-in `--deep` after a spike proves it runs install-free.** (b) is where the real signal is, and it costs nothing. Do not build (c) speculatively.

**5. Precondition — fix `SEAM_MANIFEST` seam-6 before the analyzer depends on it.** Verified: seam-6 is declared with `implementations: []` and a note claiming workspace-files is absent, and it marks **0 of 332** packages, while `packages/api/workspace-files` exists and is an active @Remote emitter/assembly member. Options: (a) fix as part of UM15; (b) re-open UM-ARCH; (c) analyzer reads seams from its own manifest instead of the graph. **Recommendation: (a)** — one-line manifest edit plus a regen; (c) would fork the seam definition into two drifting copies.

**6. Is `verify-gate-coverage` allowed to fail the build on day one?** It will immediately flag `verify-architecture-graph` and `verify-third-party-notices`. Options: (a) enroll both in `doc-sync`/`ci-static` first, then land the meta-gate green; (b) land the meta-gate with both pre-listed as exemptions and burn them down; (c) land it as warn-only. **Recommendation: (a).** Both are cheap `--check` gates; enrolling them is the actual fix, and a meta-gate that ships already-yellow teaches everyone to ignore it. Explicitly reject (c).

**7. Scope of UM15's own deliverable.** UM15 is `grilling→prototype` and names three deliverables (design doc / tooling / process docs). The pieces are separable and have very different costs: staleness (~small), regen checklist + meta-gate (~small, highest value per §6), conflict-overlap analyzer (~medium, fully specified, verified commands), seam/export-surface diff (~medium), adaptive-verdict routing (~large, mostly evidence-assembly). Options: (a) all at once; (b) ship staleness + regen-checklist + meta-gate first, defer the analyzer; (c) analyzer first. **Recommendation: (b)** — §6 is the piece that prevents a *recurrence of a known past failure*, and it is the cheapest. The analyzer prevents a slower, better-understood failure. Also: promote `da-upstream-debt.md` into the durable bucket table (§5.3) as part of the first slice, since the next sync consumes it.

> **用户 2026-09-10 已定 = (b)。** 即 §1+§6 先做,analyzer 后续。这条 grilling 决策已落地到 map.md Not-yet-specified。

**8. Where does the impact report land, and does it need i18n?** `.tmp/` is gitignored and UM13's reports are gone. **Recommendation: `wayfinder/data-agent/research/upstream-impact-<BASE>..<NEW>-<date>.md`**, tracked, keyed by SHA pair. Verified: the pairing manifest names only 4 `wayfinder/` paths and none is this directory, so **no `.zh.md`/`.i18n.yaml` obligation** — but confirm, because `tickets/README.md` *is* paired and ticket generation touches that index.

---

## Implementation sketch

New files, all in the repo's existing `scripts/` flat layout (204 files, `<verb>-<noun>.ts` + colocated `.spec.ts`, per `scripts/AGENTS.md`):

| file | in | out | notes |
|---|---|---|---|
| `scripts/upstream-sync-record.ts` | `upstream-sync.json`, `git merge-base` | parsed record + consistency verdict | shared module, no side effects |
| `scripts/upstream-status.ts` | `git fetch`/`ls-remote`, record | stdout report, exit 0 | `pnpm run upstream-status`. Must refuse to print a number from an unfetched ref |
| `scripts/verify-upstream-sync-record.ts` | above | exit 1 on record ≠ merge-base | → `ci-static` + `hygiene` |
| `scripts/upstream-impact.ts` | `BASE`, `upstream/master` | markdown report → `wayfinder/data-agent/research/`, plus JSON | the analyzer; sections = §2.1–2.4 |
| `scripts/upstream-impact-seams.ts` | `SEAM_MANIFEST`, two revs | per-seam commit counts + export-surface/inject diffs | imported by the above |
| `scripts/upstream-ticket-candidates.ts` | impact JSON | draft `.md` files in `.tmp/` + a tracked review checklist | applies §3.3; rejects blocking cycles |
| `scripts/generator-inputs.manifest.json` | — | generator → input globs + output paths + trigger tier | the §6.1 checklist, as data |
| `scripts/verify-generator-inputs.spec.ts` | manifest + generator sources | fails if a generator reads an undeclared inventory input | keeps the manifest honest |
| `scripts/gate-coverage.manifest.json` | — | exemption list with `reason` + `coveredBy` | 3 initial entries (`no-production-src-on-master`, `npm-install-layout`, `cordis-api` alias) |
| `scripts/verify-gate-coverage.ts` | `package.json` scripts × `gatesForMode(m) for m of MODES` | exit 1 on unaccounted gate | **the meta-gate** → `ci-static` + `hygiene` |
| `scripts/upstream-merge-dryrun.ts` | `BASE`, `upstream/master` | ordered resolution plan (M0–M8 per path) → tracked file | makes UM14's ephemeral dry-run durable |

Modified:
- `scripts/run-gates.ts` — export `const MODES = [...] as const`; `type Mode = typeof MODES[number]`; `parseMode` becomes `MODES.includes(raw)`. Collapses 3 duplicated lists to 1 (Decision 6 precondition). Add `verify-architecture-graph` + `verify-third-party-notices` to `docSyncLeafGates`; add `gate-coverage`, `upstream-sync-record`, `generator-inputs` to `ciSharedStaticGates`. New mode `sync-sweep` = `ci-static` + exempted gates + tier-1..3 `--check`s.
- `package.json` — `upstream-status`, `upstream-impact`, `upstream-merge-dryrun`, `verify-gate-coverage`, `verify-upstream-sync-record`, `regen-for-package-change`, `check:sync-sweep`.
- `.gitattributes` + `scripts/install-lefthook.mjs` — register `merge=dsh-generated-artifact` over the generated-artifact inventory, mirroring the `dsh-translation-pairing` fail-closed driver (`scripts/merge-translation-pairing-driver.sh`).
- `scripts/gen-architecture-graph.ts` — fix seam-6 `implementations` + note (Decision 5); optional `--rev` (Decision 4).
- `docs/da-plugin-development-guidelines.md` §7 — replace with the chosen cadence; delete the falsified build-wiring-only guarantee.
- `docs/da-upstream-debt.md` — extend with the durable d5 bucket table (§5.3).

Data shapes:

```jsonc
// upstream-sync.json
{ "upstreamRemote": "upstream", "upstreamRef": "refs/heads/master",
  "upstreamSha": "c389f96bf3a9b6807cb71ed6bdad5849be0df6d8",
  "upstreamTag": "dsh-v0.1.4-alpha.x", "syncedAt": "2026-09-08",
  "mergeCommit": "8112743d6934fecbcf679e6ec438041da4a48a4e",
  "commitsBehindAtSync": 449, "conflictsResolved": { "uu": 21, "au": 15 },
  "impactReport": "wayfinder/data-agent/research/upstream-impact-d347e703..c389f96bf3-2026-09-08.md",
  "thresholds": { "commitsBehind": 150, "days": 14, "seamCommits": 1 } }
```

```jsonc
// upstream-impact.json (analyzer output)
{ "base": "…", "head": "…", "upstream": "…",
  "behind": 430, "ahead": 819, "refFresh": false,
  "forkSideFiles": 2929, "upstreamSideFiles": 2443,
  "overlap": [ { "path": "tsconfig.host.json", "upstreamCommits": 11,
                 "bucket": "build-wiring", "rule": "M1" } ],
  "dataAgentOverlap": 0,
  "seams": [ { "key": "seam-3", "commits": 13,
               "candidateBreaks": [ { "kind": "export-removed",
                                      "symbol": "ConnectionConfig",
                                      "forkImporters": ["…"] } ],
               "verdict": "needs-human" } ],
  "shifts": [ { "artifact": "packages/extensions/tool-cordis/src/api-catalog.ts",
                "changedRows": 38,
                "criteria": { "c1": "route", "c2": "conflict-not-proven",
                              "c3": "pass", "c4": "route", "c5": "behavioral-test-absent" },
                "verdict": "needs-human" } ],
  "regen": ["gen-architecture-graph", "gen-module-graph", "gen-cordis-catalog"] }
```

---

## What I verified vs. what I assumed

### Verified by reading the file or running read-only git

- `verify-architecture-graph` at `package.json:167`; **absent** from `scripts/run-gates.ts`, `.github/`, `lefthook.yml` (grep, no match).
- 50 `verify-*`, 15 `gen-*`, 164 total scripts (`package.json`); 12 `check:ci:*` aggregates, all `tsx scripts/run-gates.ts <mode>`.
- 45/50 `verify-*` reachable from `run-gates.ts`; the 5 unreachable ones and their actual coverage (`no-production-src-on-master.yml:86`, `release.yml:87`, and `gen-cordis-api.ts` being a 9-line re-export of `gen-cordis-catalog.ts`'s `main`).
- `gatesForMode` exported (`:232`), `Mode` exported (`:24`), **no runtime MODES array**; list duplicated at `:24-41`, `:135-152`, `:156`.
- `collectPackageGraph` globs `packages/*/*/package.json` — `scripts/package-graph.ts:36-37`.
- Every generator row in §6.1 — I opened each `scripts/gen-*.ts` and read the cited line.
- `ts-project.ts:38-56` reads `tsconfig.<face>.json` and recurses `projectReferences`.
- Architecture-graph structure and omissions — read `gen-architecture-graph.ts` in full, including the `--check` path (`:412-425`).
- **332 packages** = depmap rows = `ls -d packages/*/*/ | wc -l`. Seam marking counts 7/21/1/1/1/**0**; seam-6 marks zero packages while `packages/api/workspace-files` exists in `HEAD`.
- `docs/architecture-graph.md` + `scripts/gen-architecture-graph.ts` **absent** from `upstream/master` and `c389f96bf3` (`git cat-file -e`); the 12 other generated artifacts present in both.
- `verify-mermaid.ts:18-22` globs `docs/**/*.md`; nothing links to `docs/architecture-graph.md`; not in `doc-budgets.manifest.json`.
- No git notes; `refs/dsh/translation-pairing/snapshots/*` = 2610 refs; `scripts/translation-pairing-git.ts:6`; `docs/i18n/README.md:18`.
- No `last-synced` record anywhere (grep across `*.ts *.json *.md *.yml *.sh`).
- `git merge-base HEAD upstream/master` = `c389f96bf3`; 430 behind / 819 ahead; `git ls-remote upstream HEAD` = `2377c272a8` ≠ fetched `5dda764ed3`; `FETCH_HEAD` mtime 2026-09-09 19:08.
- Overlap pipeline reproduced end to end: 2929 / 2443 / 41 / 0 artifacts / 0 data-agent; per-file upstream commit counts; the 6-way bucket classification (14/9/7/5/4/2).
- Seam commit counts 11/13/13/1/0/2 via `git rev-list --count`.
- `8112743d69` body: 36 conflicts (21 UU + 15 AU), the 8-step dry-run reference, the per-file resolution vocabulary, "**Persona seam surface migration (tsc-discovered)**", the deferred catalog regen.
- Merge-subject convention, 2 instances; no `dryrun` ref survives.
- `.gitignore:61` = `.tmp/`; UM13's four evidence files absent from `.tmp/`.
- No `schedule:` trigger in any of 20 workflows.
- `.gitattributes` `*.i18n.yaml merge=dsh-translation-pairing`; `install-lefthook.mjs:31-34`; `merge-translation-pairing-driver.sh` fail-closed exit 1.
- `docs/da-plugin-development-guidelines.md` §4.1 `:132`, §4.2 `:138`, §4.3 `:164`, §4.4 `:172`, §7 `:262` (quoted verbatim).
- `docs/da-upstream-debt.md` D1–D4 + the per-item "Interim workaround" + the Audit-accuracy note prescribing `git show <tip>:<path>` / `git diff upstream/master...HEAD`.
- `translation-pairing.manifest.json` names exactly 4 `wayfinder/` paths.
- No doc anywhere enumerates the gate surface (`grep -rl 'check:ci:static' docs/ .agents/` → 2 archived notes only).
- Ticket header shape and commit-prefix convention, from 8 tickets + `git log`.

### Inferred, not verified — treat as claims to test

1. **`gen-architecture-graph --rev` can run without `pnpm install`.** Based on the header comment saying the import scan is AST-only and on the inputs all being in-tree. But `TypeScriptProject` builds a real Program. **Not run. Decision 4 depends on it — spike before committing.**
2. **Export-surface diff would have caught seams 3 and 4.** Structurally it should (both were renames of exported names the fork imports), and the merge commit confirms `tsc` found them. I did not implement the diff and confirm it fires on `c389f96bf3^..c389f96bf3`.
3. **Threshold values (150 / 14 days / seam>0).** Calibration guesses anchored on 430/449 and the 4-day blind spot. No statistical basis.
4. **Effort sizings in Decision 7** ("small"/"medium"/"large") are judgment, unmeasured.
5. **The generated-artifact conflict class is stably ~17%.** One window (7/41); UM13's window had a different composition. Directionally supported by both, not established.
6. **Cordis-surface diff granularity.** I verified `tool-cordis/src/api-catalog.ts` is generated, committed at both revisions, and has 38 upstream commits in the window. I did **not** read its diff to confirm it names changed *methods* usefully — I inferred that from `da-upstream-debt.md` describing it as `SERVICE_API`/`TYPE_API` rows.
7. **`docs/subsystems/*` is the complete output set of `gen-doc-graphs`.** I saw `writeFileSync(resolve(root, doc.rel), …)` at `:1630` but did not enumerate `doc.rel`. The output list may be broader.
8. **A `merge=dsh-generated-artifact` driver can schedule regeneration and refuse resolution.** By analogy to the translation-pairing driver's fail-closed exit-1. Not prototyped.
9. **The out-of-group count is exactly 2 genuinely-uncovered gates.** My reachability test counts script-name, script-file, and spec-file textual references in `run-gates.ts`. A gate invoked by some other indirection would be a false negative. S3's independent list is authoritative; reconcile before landing the exemption manifest.
10. **UM12's "22 remaining gates" vs the 45-gate `ci-static` count.** I read UM12's table and the aggregate composition but did **not** run any aggregate (S3 owns execution), so I did not confirm the 23-passed/22-failed split.
