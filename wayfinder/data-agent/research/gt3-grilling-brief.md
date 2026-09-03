# GA-GT3 Grilling Brief — Evidence Pack

> Research-only. No decisions made. No ticket / map / source file modified.
> Repo HEAD: `84eddd4b6d`. Working tree is dirty and **volatile**: `git status --short | wc -l` returned **181** at the start of this research and **171** at the end, with no writes from me other than this file — something else is editing the tree concurrently. Treat all working-tree line numbers as verified-at-research-time, and re-verify before editing.
> All line numbers below are **working-tree** line numbers, verified by `grep -n` at research time.

## 0. Sharpest Open Questions For The Human

1. **Item 5 is not a one-line change.** The ticket says "默认 `mergeExisting=true`（防抹 curated join）——可先做这一行". But the explicit tool path passes `false` **explicitly**, not by default: `packages/data/semantic-layer/src/index.ts:628`. Flipping the substrate default at `enrichment.ts:330` alone changes **nothing** for the `discover_relations` agent tool. Do you accept that item 5 is minimum 2 edits (substrate default + Service call site), and 3 if you also want the events path?
2. **Do you actually want to lose the ability to delete a bad ref?** `mergeRefs` is union-only — it never removes. Replace mode is the *only* way re-discovery can drop stale refs. CL-18 Phase 1 removed 18 noise refs from `gacha_result_statis_di` (23→5) — under an unconditional `mergeExisting=true` that class of cleanup can never be done by re-running discovery. Is the answer (a) merge-by-default and accept manual deletion only, (b) merge-by-default + an explicit `replace: true` escape hatch on the tool, or (c) origin-aware replace (drop `deterministic`/`llm`, keep `manual`/`undefined`)?
3. **Does D1 (`primary_key.length > 0` routing) actually fix anything on K11 without also fixing the exclude-column story?** 18 K11 DIM tables put `ds` in `primary_key` (CL-18 root cause). Broadening the inventory to "any table with non-empty primary_key" adds every DWS table that declares a PK to the inventory too — and `buildExcludeColumns` is a *calling-layer* concern the substrate does not know about. Does the inventory generalization make the noise-join blast radius bigger before EXP1 tells us anything?
4. **D1 vs the target-side filter.** D1 talks about the *inventory* side (`buildDimInventory`). But there is a second `kind` gate on the *target* side: `enrichment.ts:345` `if (r.data.kind === 'dim') continue`. D2 says dim→dim must participate. So item 1 as written in the ticket (inventory only) is **insufficient to satisfy D2** — the target-side skip must go too. Is that in scope for GT3 or a separate ticket?
5. **If the target-side skip is removed, what stops self-joins?** With inventory = "any table with PK" and no target-side `kind` filter, every table matches itself (its own PK columns are its own columns). Is a `table_name !== dim.table_name` guard part of item 1, and is that decidable now or does EXP1 own it?
6. **Item 4 (`kind` enum) and item 1 (routing) are separable — should they even be in the same ticket?** If D1 makes routing depend on `primary_key`, then `kind` becomes a pure label, and adding `ods`/`entity`/`flat` becomes a *cosmetic/validation* change with a measurable YAML-migration cost. Do you want item 4 deferred to a labeling ticket so items 1/2/5/6 can land without a data migration?
7. **Item 6 (empty-inventory short-circuit): short-circuit what, exactly?** Return early with a message and write nothing, or still write and add a warning? These have opposite consequences for the data-loss story. If item 5 lands, item 6 becomes cosmetic-only (nothing is destroyed anymore); if item 5 does not land, item 6 is the actual data-loss guard. Are they being scoped as alternatives or as complements?

## 1. Summary Table

| # | Scope item | Current behavior (file:line) | Blast radius | Gating | Open question |
|---|---|---|---|---|---|
| 1 | `buildDimInventory` only scans `kind='dim'` | `packages/data/semantic-layer/src/enrichment.ts:252-266`, gate at **:256** `if (!r.success \|\| r.data.kind !== 'dim') continue` | 2 direct callers (`enrichment.ts:333`, `:483`); exported from `src/index.ts:123`; a second, separate target-side gate at `enrichment.ts:345` | **partially gated** — see §6 | Does item 1 include removing the target-side `kind==='dim'` skip (needed for D2)? What guards self-joins? |
| 2 | `discoverRelationsDeterministic` exact PK-name equality only | `packages/data/semantic-layer/src/enrichment.ts:73-96`, match at **:78** `dim.primary_key.filter(pk => colNames.has(pk) && !(excludeColumns?.has(pk)))` | Mirror fn `discoverEventRelationsDeterministic` at `:375-394` (match at :380); 5 unit tests in `tests/enrichment.spec.ts:61-95`; 3 in `tests/discover-relations.spec.ts:118-170` | **EXP1-gated** — it *is* Phase 2 Arm A | Heuristic (`_id`/`_key` suffix) vs LLM (D5 says LLM-driven primary, heuristic fallback). Adding heuristics now pre-commits to the arm EXP1 exists to measure — but `llmCall` is unmounted in production, so the LLM arm cannot ship at all today. Bridge or sunk cost? |
| 3 | LLM prompts hardcode "DWS fact table" | `packages/data/semantic-layer/src/enrichment.ts:165` (table) and `:412` (event, `Discover dimension (DIM) join relations for the event`) | Prompt-string only; no test asserts the literal (verify §7) | **partially gated** — see §6 | If D5 moves to LLM-driven inference, is rewording these prompts wasted work vs. rewriting the prompt layer wholesale under EXP1? |
| 4 | `kind` enum gains `ods`/`entity`/`flat`; unmarked imports default `ods` | `packages/data/semantic-layer/src/types.ts:279` `kind: z.enum(['dws','dim']).default('dws')`; DIM constraint at `:289-292` | §4 — repo-wide read/write/validate sites + YAML file counts | **EXP1-gated** (per ticket's own "依赖 GA-GRILL3" + D1) | Should item 4 be split out entirely? It is the only item with a data-migration cost. |
| 5 | Default `mergeExisting=true` | `enrichment.ts:330` (`mergeExisting = false`), applied at **:348**; overridden explicitly to `false` at `src/index.ts:628`; `true` only at `src/index.ts:686` (on-write hook) | §2 — 3 call sites, 1 test (`tests/enrichment.spec.ts:241`) | **independent** (decidable now) | See open questions 1 & 2. Also: is `undefined`-origin legacy YAML supposed to be treated as `manual` on the *replace* path too? |
| 6 | Empty-inventory short-circuit + clear message | No such check exists. `enrichment.ts:333` `const dimInventory = buildDimInventory(semanticLayer)` — result length is never inspected; loop at `:337` runs regardless | Return-type change or message plumbing through `tool-discover-relations/src/index.ts:166` + `formatDiscoverRelations` at `:179-194` | **independent** (decidable now) | Short-circuit = write nothing, or write + warn? Alternative to item 5 or complement? |

## 2. Item 5 — The Alleged Data-Loss Path

### VERDICT: **REAL BUG. NOT mitigated by the GA-I18N-1 `origin` field.**

The `origin` protection lives **inside `mergeRefs`**, and `mergeRefs` is only reached on the branch where `mergeExisting === true`. On the replace branch, existing refs are never read at all — `existingRefs()` is not called, so `origin` is never consulted. Manual refs are discarded wholesale.

### The single load-bearing line

`packages/data/semantic-layer/src/enrichment.ts:348`

```ts
const refs = mergeExisting ? mergeRefs(existingRefs(t.raw), discovered) : discovered
```

Followed immediately by the unconditional write, `enrichment.ts:350`:

```ts
await writeTable(semanticLayer, t.table_name, { ...t.raw, dimension_refs: refs })
```

There is no `if (refs.length > 0)` guard and no `if (discovered.length > 0)` guard before the write. `written += 1` happens on every non-throwing table (`:351`); `enriched` is only incremented when `refs.length > 0` (`:352`) — which is exactly the audit's "reports `enriched:0` while writing `[]`" signature.

### Concrete call chain (replace mode — the destructive one)

1. Agent tool `discover_relations` → `packages/data/tool-discover-relations/src/index.ts:166`
   `const res = await schema.discoverRelations(validated.length > 0 ? { tables: validated } : {})`
2. `SemanticLayerService.discoverRelations` → `packages/data/semantic-layer/src/index.ts:623-629`, terminating at **:628**
   `return enrichAllDwsTablesFromLayer(this.semanticRoot, this.llmCall, opts.tables, false, buildExcludeColumns)`
   — the 4th positional arg is `mergeExisting`, **hardcoded `false`**.
3. `enrichAllDwsTables` → `packages/data/semantic-layer/src/enrichment.ts:326-330`, signature default `mergeExisting = false` at **:330**.
4. `enrichment.ts:348` → `refs = discovered` (existing refs dropped).
5. `enrichment.ts:350` → `writeTable(..., { ...t.raw, dimension_refs: refs })` overwrites the YAML key.

**Consequence:** a table with 5 hand-curated `dimension_refs` whose join keys the deterministic round cannot rediscover (differently-named FK, e.g. `fact.user_id` → `dim_user.id`) ends up with `dimension_refs: []` after one `discover_relations` call, with the tool reporting `enriched 0 ... (written N)`.

### Why the `origin` field does not save it

`packages/data/semantic-layer/src/enrichment.ts:101-103` defines the priority ladder, and `:137` is the only consumer:

```ts
const ORIGIN_PRIORITY: Record<string, number> = { deterministic: 0, llm: 1, manual: 2 }
function originPriority(origin: string | undefined): number {
  return origin != null ? (ORIGIN_PRIORITY[origin] ?? 2) : 2
}
...
if (r.derivation && (!ex.derivation || originPriority(r.origin) > originPriority(ex.origin))) {
```

`:137` is inside `mergeRefs` (`:117-149`). `mergeRefs` has exactly three call sites in the substrate:
- `enrichment.ts:236` — `discoverRelationsFor`: `mergeRefs(det, llm)` (round-1 vs round-2, both machine-generated; nothing to do with existing YAML)
- `enrichment.ts:348` — the `mergeExisting === true` branch only
- `enrichment.ts:441` — `discoverEventRelationsFor`: `mergeRefs(det, llm)` (same as :236)
- `enrichment.ts:497` — event `mergeExisting === true` branch only

So `origin` protects curated refs **only** when someone already chose merge mode. It is a *derivation-text* protection within a merge, not an *existence* protection against a replace. GA-I18N-1's own resolution notes confirm the intent was override priority, not deletion protection (`wayfinder/data-agent/tickets/phase-misc/GA-I18N-1-origin-field.md`, "Resolution" §2, describing only `mergeRefs` override semantics).

### Which paths are safe today

| Entry point | `mergeExisting` | Safe? | Evidence |
|---|---|---|---|
| On-write hook `enrichOnWrite` | `true` (explicit) | **Safe** | `packages/data/semantic-layer/src/index.ts:686`, with the comment at `:680-682` stating the rationale |
| Service `discoverRelations()` (→ `discover_relations` agent tool) | `false` (explicit) | **Destructive** | `packages/data/semantic-layer/src/index.ts:628` |
| Service `discoverEventRelations()` (→ events `external_refs`) | omitted → default `false` | **Destructive** | `packages/data/semantic-layer/src/index.ts:649`, default at `enrichment.ts:480` |
| `scripts/seed-event-external-refs.ts` | omitted → default `false` | **Destructive** | `scripts/seed-event-external-refs.ts:19` `await enrichAllEvents(root, undefined)` |
| Direct substrate calls in tests | varies | n/a | `tests/enrichment.spec.ts:211,224,233,246,294,307,315` |

Note the **events path is worse than the tables path**: `discoverEventRelations` at `index.ts:649` does not even pass the argument, and no on-write hook exists for events (documented as deferred at `index.ts:636-644`). So there is no merge-mode entry point for events at all.

### Strongest counter-argument (present this to the human)

Replace mode is not gratuitous — it is the **only** mechanism by which re-discovery can *remove* a ref. `mergeRefs` unions `join_keys` and never deletes a `dim_table` entry (`enrichment.ts:126-145`: every baseline entry is unconditionally seeded into the map at `:120-123`, and the `added` loop only inserts or augments). CL-18 Phase 1 needed exactly this deletion capability: `wayfinder/semantic-layer/map.md:135` records "`gacha_result_statis_di` 清除 18 条噪声 refs（23→5）". Under an unconditional `mergeExisting=true`, that cleanup is impossible via the tool and must be done by hand-editing YAML.

The design intent is documented as deliberate in `.agents/notes/implemented/feature/2026-08-22-semantic-layer-ai-native-enrichment.md:29`:

> **On-write hook replaces dimension_refs.** Rejected (code-review B2): the auto-trigger would wipe human-curated joins; the hook merges instead (`mergeExisting=true`), while the explicit `discoverRelations` entry still replaces (re-discover, G3 direct-write).

i.e. the split (auto=merge, explicit=replace) was a *considered* decision, not an oversight. GT3 item 5 proposes to reverse half of it. The grilling question is whether "explicit tool call = user asked for a refresh, so replace is correct" survives the fact that the LLM agent, not a human, decides when to call `discover_relations`.

**Refined verdict:** the *mechanism* is a real, unmitigated data-loss path (an agent-invoked tool destroys curated data with no confirmation and a misleading `enriched: 0` report). The *fix as written in the ticket* ("默认 `mergeExisting=true`，可先做这一行") is **wrong/incomplete** — it does not touch `index.ts:628` and it removes the only deletion path. Option (c) in open question 2 (origin-aware replace: drop `deterministic`+`llm`, retain `manual`+`undefined`) preserves both properties and is a natural extension of the `origin` field that GA-I18N-1 already shipped.

## 3. Items 1, 2, 6 — Current Behavior

### Item 1 — `buildDimInventory` scans only `kind='dim'`

`packages/data/semantic-layer/src/enrichment.ts:252-266`. The gate is `:256`:

```ts
export function buildDimInventory(semanticLayer: string): DimInventoryEntry[] {
  const out: DimInventoryEntry[] = []
  for (const t of loadTables(semanticLayer)) {
    const r = TableDefinitionSchema.safeParse(t.raw)
    if (!r.success || r.data.kind !== 'dim') continue
```

**Ticket is correct on the fact, incomplete on the fix.** There are **two** `kind` gates in the enrichment path, not one:

| Gate | Line | Effect | Ticket covers it? |
|---|---|---|---|
| Inventory side | `enrichment.ts:256` `r.data.kind !== 'dim'` | only DIMs can be a join *target* | Yes (item 1) |
| Target side | `enrichment.ts:345` `if (r.data.kind === 'dim') continue // only DWS` | DIMs are never enriched *as a source* | **No** |

D2 in GA-GRILL3 says "K11 是雪花模型——dim→dim 关系必须参与 enrichment", citing "当前 enrichment.ts:311 `kind==='dim'` continue 跳过全部" — that is the **target-side** gate (now `:345`). So satisfying D2 requires removing `:345`, which the GT3 scope text does not mention. **Item 1 as written does not satisfy D2.**

Note the type name is also load-bearing documentation debt: the inventory entry type is `DimInventoryEntry` (`enrichment.ts:38-43`) and the substrate's public export surface names it as such (`src/index.ts:123`, `lib/types/enrichment.d.ts:112`). Generalizing the concept without renaming leaves `DimInventoryEntry`/`dim_table`/`dws_column` naming across `DimensionRefSchema` (`types.ts:190-198`) describing a star schema that no longer exists — a rename touches the on-disk YAML key `dws_column`, i.e. a data migration. Not in GT3 scope; flag it.

Under D1 the replacement predicate is `primary_key.length > 0`. Current schema allows an empty PK for non-DIM tables (`types.ts:280` `primary_key: z.array(z.string()).default([])`) and *requires* non-empty only for DIM (`types.ts:289-292` superRefine, message `DIM 表 primary_key 不能为空`). On K11, 162 of 321 table YAMLs declare `primary_key` (§4) — so D1's predicate would grow the inventory from 159 entries to ~162, and would also make ~3 `kind: dws` tables joinable targets.

### Item 2 — deterministic round is exact PK-column-name equality only

`packages/data/semantic-layer/src/enrichment.ts:73-96`; the whole matcher is `:78`:

```ts
const colNames = new Set(targetDef.columns.map(c => c.name))
const refs: DimensionRef[] = []
for (const dim of dimInventory) {
  const pks = dim.primary_key.filter(pk => colNames.has(pk) && !(excludeColumns?.has(pk)))
  if (pks.length === 0) continue
```

Confirmed: `Set.has` on raw column names. No suffix/prefix normalization, no case folding, no type check. The emitted `join_keys` are necessarily symmetric — `{ dws_column: pk, dim_column: pk }` (`:82`) — so the data model *can* express `fact.user_id → dim_user.id` (the two fields are independent) but the deterministic round *never produces* an asymmetric pair. Only the LLM round can (`parseLlmRefs`, `enrichment.ts:210-218`).

The event mirror is `discoverEventRelationsDeterministic` at `:375-394`, matching against `Object.keys(eventDef.params_fields)` (`:378`) with the same symmetric-pair construction at `:386`. Any FK heuristic must be added in **both** places or the paths diverge.

**Tension with D5 (present both sides):**
- *For adding heuristics now*: the LLM round is optional and `llmCall` is **not mounted in production** — `docs/superpowers/plans/2026-08-22-phase2-ontology-nl2sql-metrics.md:7` states "production mount deferred — `ctx.schema`/`ctx.llm` are not yet mounted in any bundle". So today the deterministic round is the *only* round that ever runs in production. Zero heuristics = zero relations for any non-identically-named FK, forever.
- *Against*: D5 explicitly reorients to "LLM-driven 推断为主、启发式为 fallback". Investing in `_id`/`_key` suffix heuristics builds out the component D5 demotes, and the heuristic baseline EXP1 already measured is **43.75% avg with failure modes F1-F7** — a number that argues heuristics are not the answer.
- The synthesis question for the human: is item 2 a *bridge* (ship heuristics now because LLM is unmounted) or *sunk cost* (wait for EXP1)? These have different answers and the ticket does not distinguish them.

### Item 6 — no empty-inventory short-circuit exists

`packages/data/semantic-layer/src/enrichment.ts:333`:

```ts
const dimInventory = buildDimInventory(semanticLayer)
```

`dimInventory.length` is **never** inspected anywhere in the file (`grep -n "dimInventory" enrichment.ts` → construction at `:333` and `:483`, forwarding into `discoverRelationsFor`/`discoverEventRelationsFor`, prompt building at `:159`/`:403`, and iteration inside the two deterministic rounds). The loop at `:338` (tables) / `:488` (events) runs unconditionally, and the write at `:350` is unconditional. Confirmed: **the audit's claim is accurate** — empty inventory ⇒ every table gets `dimension_refs: []` written with `enriched: 0`.

The tool-facing message surface is `formatDiscoverRelations` at `packages/data/tool-discover-relations/src/index.ts:179-194`; it can only report `enriched`/`written`/`errors` because that is the entire return shape (`enrichment.ts:331-332`). So item 6 requires either widening the substrate return type (a breaking change to 4 call sites + `lib/types/enrichment.d.ts:143`) or smuggling the message through `errors[]` (which would make a normal empty-scope run look like a failure). Neither is free; the ticket implies it is.

## 4. Item 4 — `kind` Enum Blast Radius

### 4.0 Disambiguation warning

A naive repo-wide `grep kind` is useless here: at least **four unrelated** `kind` fields exist.
- `TableDefinition.kind` = `'dws'|'dim'` — the one GT3 changes (`types.ts:279`).
- Asset kind = `'table'|'event'|'metric'|'concept'|'unknown'` — `tool-edit-definition/src/index.ts:40,143,244`, `tool-revert-edit/src/index.ts:39,150`, `ui-semantic-layer/src/client/types.ts:8` (`AssetKind`).
- `MetricDefinition.kind` = `z.literal('metric')` — `types.ts:146`.
- `last_failure_kind`, `ChatNodeKind`, `cancel({kind:'hook'})` etc. — unrelated.

**`packages/data/phase-gate` does NOT read `TableDefinition.kind` at all.** Every `kind` hit in `packages/data/phase-gate/src/` is `last_failure_kind` (`phase-gate.ts:352,475,946,1003`, `types.ts:52,59`, `domain.ts:265`), a gate-config kind (`domain.ts:143`), or an agent-message kind (`phase-gate.ts:802,890`). **Blast radius on phase-gate: zero.** (The task brief asked me to include it — this is a negative result, not an omission.)

### 4.1 Write / validation sites (the closed sets that would break)

| Site | Line | Shape | Consequence of adding `ods`/`entity`/`flat` |
|---|---|---|---|
| `packages/data/semantic-layer/src/types.ts` | **:279** | `kind: z.enum(['dws','dim']).default('dws')` | The change itself. Note: the *default* also has to flip to `'ods'` per item 4 — a **behavior change for 159 existing K11 YAMLs** (§4.3). |
| `packages/data/semantic-layer/src/types.ts` | :289-292 | `superRefine`: `if (t.kind === 'dim') { if (t.primary_key.length === 0) addIssue('DIM 表 primary_key 不能为空') }` | Only DIM is PK-constrained. If routing moves to `primary_key.length > 0` (D1), this validation becomes the *only* thing forcing a PK to exist — and it applies to exactly the kind that D1 stops caring about. Semantics invert. |
| `packages/data/semantic-layer/src/io.ts` | :555 | `kind: 'dim'` written by the DIM YAML generator (docstring `:541`) | Unchanged, but it is the only writer that emits an explicit kind. |
| `packages/data/semantic-layer/src/io.ts` | :654 | comment `// DWS/merge keep skipValidation (generation pre-validates; DWS has no kind constraint)` | The "DWS has no kind constraint" assumption is what lets non-DIM writes skip validation. Adding kinds with their own constraints invalidates the comment's premise. |
| `packages/data/schema-gateway/src/types.ts` | :79 | `readonly kind: 'dws' \| 'dim' \| 'event' \| 'metric'` | **Closed union — compile break.** |
| `packages/client/ui-context-layer/src/client/types.ts` | :22 | `kind: 'dws' \| 'dim' \| 'event' \| 'metric'` | **Closed union — compile break.** |
| `packages/client/ui-context-layer/src/client/graph-styles.ts` | :14, :17, :59 | `NodeKind` union + `KIND_COLORS: Record<NodeKind, string>` + `nodeStyle(kind: NodeKind, ...)` | **Closed union + exhaustive Record — compile break.** New kinds need colors. Re-exported publicly at `ui-context-layer/src/client/index.ts:42`. |

### 4.2 Read sites (silent behavior changes — the dangerous ones)

| Site | Line | Code | Consequence |
|---|---|---|---|
| `packages/data/tool-search-data-sources/src/index.ts` | **:98** | `if (k === 'dws' \|\| k === 'dim') return 'table'` | **Highest-risk silent regression.** A table with `kind:'ods'` falls through to `return 'source'` (`:100`), so it is no longer typed as a table in agent-facing search results. No compile error, no test failure — just wrong labels for the agent. |
| `packages/data/semantic-layer/src/basic-index.ts` | :110-119, esp. **:115** | `const kindStr = typeof k === 'string' ? k : 'dws'` in `tableCountByKind` | Absent-kind default is hardcoded `'dws'` **independently of the zod default**. If item 4 flips the schema default to `'ods'`, this function silently disagrees with the schema for every YAML lacking a `kind:` key — i.e. 159 K11 files. Two sources of truth for the same default. |
| `packages/client/ui-context-layer/src/client/graph-animations.ts` | :418 | `const kind = (data.kind ?? 'dws') as NodeKind` | Third hardcoded `'dws'` default, plus an unchecked `as NodeKind` cast — a new kind reaches `KIND_COLORS[kind]` and yields `undefined` at runtime with no type error. |
| `packages/data/tool-load-table-definition/src/index.ts` | :247, :249 | `${table.kind === 'dim' ? ' (dim)' : ''}` | Display-only. New kinds render with no annotation (degraded, not broken). `kind` is passed through as open `readonly kind?: string` at `:110`/`:135` and declared `{ type: 'string' }` in the output schema at `:330` — **already open**, so no break here. |
| `packages/data/nl2sql-engine/src/metric-engine.ts` | :38-45 | docstring "whose `kind` is 'dws'/'dim'"; code tests only `inner?.kind === 'metric'` | Code is safe (metric-only check). Docstring goes stale. |
| `packages/client/ui-semantic-layer/src/client/types.ts` | :8-13 | `export type TableKind = string` with comment "Known values are 'dws' \| 'dim' \| 'dwd' \| 'ods' \| 'ads'; the bare `string` keeps the type open" | **Already open, and already anticipates `ods`.** Precedent for option B (open string) — worth putting to the human: one client layer has *already* decided this. |
| `packages/data/semantic-layer/src/enrichment.ts` | :256, :345 | the two routing gates | The whole point of D1 — see §3. |

### 4.3 Migration cost: YAML files by `kind` (measured)

Counted with `grep -rl "^table_name:"` / `grep -rh "^kind:"` over `examples/`:

| Bucket | Count |
|---|---|
| Table YAML files under `examples/` (files containing `^table_name:`) | **321** |
| `kind: dim` | **159** |
| `kind: dws` | **3** |
| **No `kind:` key at all** (→ zod default `'dws'` today) | **159** |
| Files declaring `primary_key:` | **162** |

All 321 live in `examples/k11-semantic-layer/`; `examples/x63-semantic-layer/` has **0** table YAMLs (so the "second scope" that would exercise generalization is currently empty — worth asking the human what x63 is for). Repo-wide outside `examples/` adds only 1 more `dim` + 1 more `dws` (160 / 4 total).

**The migration number that matters: 159 files silently change meaning.** Today they parse as `kind:'dws'` (via `types.ts:279` default) and therefore (a) enter DWS enrichment as targets (`enrichment.ts:345` does not skip them) and (b) count as `dws` in `tableCountByKind` (`basic-index.ts:115`). Item 4's "unmarked imports default `ods`" flips (a) and (b) for all 159 at once, with no file edit and no diff to review. Note the near-exact coincidence — 159 unmarked and 159 `kind: dim` — worth confirming with the human whether the 159 unmarked files are in fact intended DWS tables or an import that never got labeled.

Also note: `162` files declare `primary_key` while only `159` are labeled `dim`. So D1's predicate and the current `kind='dim'` predicate select **nearly the same set** on K11 (Δ≈3). That is an argument that D1 is low-risk *on this scope* — and simultaneously an argument that D1 buys almost nothing measurable on this scope. Both framings should go to the human.

## 5. Consumers

### `buildDimInventory` — 2 internal callers, 1 public export

| Caller | Line |
|---|---|
| `enrichAllDwsTables` | `packages/data/semantic-layer/src/enrichment.ts:333` |
| `enrichAllEvents` | `packages/data/semantic-layer/src/enrichment.ts:483` |
| Public re-export | `packages/data/semantic-layer/src/index.ts:123`; declared at `packages/data/semantic-layer/lib/types/enrichment.d.ts:112` and `lib/types/index.d.ts:54` |

No caller outside `semantic-layer` was found (`grep -rn buildDimInventory` across the repo, excluding `node_modules`/`lib`/`dist`, returns only the above plus docs/plan prose). So generalizing it is **internally contained** — but it *is* a published export, so the `DimInventoryEntry` name and semantics are part of the package's public API.

### `discoverRelationsDeterministic` — 2 internal callers, tests, 1 public export

| Caller | Line |
|---|---|
| `discoverRelationsFor` | `packages/data/semantic-layer/src/enrichment.ts:238` (result merged at `:242`) |
| Public re-export | `packages/data/semantic-layer/src/index.ts:118` |
| Tests (direct) | `packages/data/semantic-layer/tests/enrichment.spec.ts:63,71,78,85,90`; `packages/data/semantic-layer/tests/discover-relations.spec.ts:141,155,168` |

No production consumer outside the substrate.

### `enrichAllDwsTables` / `enrichAllEvents` — the full consumer chain

```
discover_relations agent tool
  packages/data/tool-discover-relations/src/index.ts:166  schema.discoverRelations({tables})
    → packages/data/semantic-layer/src/index.ts:628        enrichAllDwsTables(..., false, buildExcludeColumns)   [REPLACE]

Service on-write hook (syncWrite / updateTableMeta)
  packages/data/semantic-layer/src/index.ts:677 enrichOnWrite(names)
    → packages/data/semantic-layer/src/index.ts:686        enrichAllDwsTables(..., true,  buildExcludeColumns)   [MERGE]

Service discoverEventRelations()
  packages/data/semantic-layer/src/index.ts:649             enrichAllEvents(root, llmCall, events)               [REPLACE — arg omitted]

Batch seeding script
  scripts/seed-event-external-refs.ts:19                    enrichAllEvents(root, undefined)                     [REPLACE — arg omitted]
```

Additional surfaces that describe (not call) these functions and would go stale:
- `packages/extensions/tool-cordis/src/api-catalog.ts:1285, 1307, 1313` — agent-facing API descriptions, all three hardcode "DWS→DIM".
- `scripts/gen-tool-catalog.ts:667` — "discover_relations is the ENRICHMENT-phase AI-native DWS->DIM join discovery entry".
- `docs/subsystems/data-agent.md:295,331,344` and `docs/subsystems/data-agent.zh.md:295,331,344`.
- `packages/data/tool-discover-relations/src/index.ts:222-229` — the tool's own `description` string that the model reads.

**Who can trigger the destructive path:** `discover_relations` is a mounted agent tool, not a human-only CLI. `packages/data/management-session/src/index.ts:10` documents the management session as gating tools to "discover_relations, edit_definition, trigger_eval, …", and `packages/core/tools/tests/gen-tool-catalog.spec.ts:32` asserts `discover_relations` is in the generated catalog. So the model decides when replace-mode runs. This is the load-bearing fact for item 5: it is not "the human explicitly asked for a refresh".

## 6. Gating Classification vs GA-EXP1

### EXP1 status (verified)

`wayfinder/data-agent/tickets/phase-misc/GA-EXP1-llm-driven-inference-experiment.md` — header line 3: `**Status**: Open`, `**Blocked by**: 无`. Four phases declared; implementation order at the "实施顺序" block requires Phase 1 → 2 → 3 → 4, with Phase 3 explicitly conditional: "仅在 H1 确认后" / "Phase 2 先跑；Phase 3 仅在 Phase 2 确认 LLM 推断可行后展开".

Phase 1 artifacts that exist: `wayfinder/data-agent/research/exp1-phase1/` contains `ground-truth-20.yaml`, `judge-calibration-report.md`, `run-judge-calibration.ts`. The heuristic baseline is recorded at `judge-calibration-report.md:21` (`| **Average** | **25%** | **62.5%** | **43.75%** |`) and restated at `:187` ("Heuristic baseline: quantified at 43.75% average accuracy"). Failure modes **F1-F7** are tabulated at `judge-calibration-report.md:27-33`. The report's own §2.5 is titled "Calibration expectations (**pre-run** estimates)" (`:156`) and §3.2 "Next steps (Phase 2 execution)" (`:191`) still reads "**If** judge accuracy ≥ 85%: proceed to Phase 2" (`:194`) — confirming the calibration run itself was **never executed** and Phases 2/3/4 have not started. Consistent with the brief's premise.

### What GT3 needs from EXP1, mapped to EXP1 structure

| GT3 need | EXP1 locus | Available today? |
|---|---|---|
| inference mode (LLM vs heuristic) | Phase 2, arms Baseline / A / B / C | **No** — Phase 2 not started |
| enrichment↔ontology coupling depth | Phase 3, Levels A / B / C (D3) | **No** — Phase 3 gated behind Phase 2 |
| validation of decoupling `kind` from routing | D1 — listed under "**Grilling 已确认决策（实验前置）**", i.e. *pre-confirmed before the experiment*; Phase 3 **Level A** is literally `inventory 来源: primary_key.length > 0（全表）` | **Partly yes** — the decision is made; only its *sufficiency* is measured |

### Per-item classification

| # | Item | Classification | Justification |
|---|---|---|---|
| 1 | inventory → any non-empty `primary_key` | **partially gated** | The *decision* is not gated: D1 is a pre-experiment confirmed decision (`GA-EXP1...md`, D1 row; `GA-GRILL3...md`, D1 row), and EXP1 Phase 3 **Level A** *is* this implementation — it is the control arm, so it must exist before Phase 3 can run. **Independent part:** change `enrichment.ts:256` to the PK predicate, remove the target-side skip at `:345` (needed for D2), add a self-join guard. **Gated part:** whether Level A alone is *sufficient* (H2/H3 — graph-reading and transitive iteration) is exactly what Phase 3 measures; do not build Level B/C now. |
| 2 | FK naming heuristics (`_id`/`_key`) | **EXP1-gated** | This is verbatim EXP1 Phase 2 **Arm A** ("改进启发式: canonicalize + `_id`/`_key`/`_pk`/`id`"), an experimental arm whose value is the thing under test against Arm B/C. Shipping it now pre-commits to the arm before measurement, and F3 (`judge-calibration-report.md:30`: "`endsWith('_id')` doesn't match bare `id`, `code`") already documents the arm's known blind spots. **Counter-argument to put to the human:** `llmCall` is not mounted in production (`docs/superpowers/plans/2026-08-22-phase2-ontology-nl2sql-metrics.md:7`), so the LLM arm cannot ship *at all* today; a heuristic bridge may be the only thing that works before EXP1 lands. |
| 3 | schema-model-agnostic prompts | **partially gated** | **Independent part:** deleting the words "DWS fact table" from `enrichment.ts:165` and generalizing `:412` is a pure string edit with **zero test coverage** (§7) — no test asserts the literal. **Gated part:** EXP1 Phase 2 ships an entire replacement prompt (the "Prompt 设计（Phase 2 B/C arm）" block, single-call multi-field inference with a guard table) and Phase 3 Level B injects graph/domain context into the prompt. Rewriting the prompt's *structure* now is likely thrown away. |
| 4 | `kind` enum + `ods`/`entity`/`flat`, default `ods` | **EXP1-gated** | Two independent reasons. (a) The GT3 ticket itself says "依赖 GA-GRILL3", and GRILL3's D4 resolves only the *shape* (closed enum + `toPromptContext`), not the *values*. (b) **The two tickets disagree on the vocabulary**: GT3 scope says `ods`/`entity`/`flat`; EXP1's Phase 2 prompt asks the model for `fact/dimension/staging/entity/flat/unknown` and its guard table says "kind: 值必须 ∈ allowed enum（或 'unknown'）" — so the allowed set is an EXP1 *output*. Freezing an enum now guarantees a second migration. Also the highest migration cost of any item (§4.3: 159 YAML files change meaning silently). |
| 5 | default `mergeExisting=true` | **independent** | Nothing in EXP1 (any phase, any hypothesis, any arm) references `mergeExisting`, replace-vs-merge, or ref deletion. Verified by reading the full EXP1 ticket. It is a pure write-safety decision, decidable today. This is the one item that should not wait. |
| 6 | empty-inventory short-circuit + message | **independent** | Same reasoning: no EXP1 dependency. Note its *value* is contingent on item 5 (§0 q7), not on EXP1. |

**Aggregate:** 2 independent (5, 6), 2 partially gated (1, 3), 2 EXP1-gated (2, 4). The two independent items are the two write-safety items — i.e. **the entire safety-relevant half of GT3 can proceed while EXP1 is Open**, which raises the question of whether GT3's `Blocked by: GA-EXP1` should be narrowed to a sub-ticket rather than blocking the whole ticket.

## 7. Tests

### Files covering enrichment / relation discovery

| File | Scope | Count |
|---|---|---|
| `packages/data/semantic-layer/tests/enrichment.spec.ts` | the substrate: deterministic rounds, `mergeRefs` + origin priority, `discoverRelationsFor`, `enrichAllDwsTables`, `enrichAllEvents`, prompts, `parseLlmRefs` | 12 `describe` blocks, ~30 tests |
| `packages/data/semantic-layer/tests/discover-relations.spec.ts` | Service wiring (`ctx.schema.discoverRelations`), on-write hook, CL-18 `excludeColumns` | 4 `describe` blocks, 10 tests |
| `packages/data/tool-discover-relations/tests/discover-relations.spec.ts` | the agent tool: name validation, not-mounted fallback, arg forwarding, rendering | 11 tests (`S1`-`S11`) |
| `packages/data/semantic-layer/tests/alt-labels-enrichment.spec.ts` | the alt_labels twin pipeline | not enumerated |
| `packages/data/semantic-layer/tests/llm-wiring-integration.spec.ts` | `setLlmCall` seam; note `:149` "internally via `enrichAllDwsTables`; we test the Service method path" | not enumerated |
| `packages/data/semantic-layer/tests/k11-graph.spec.ts`, `k11-seed.spec.ts` | real-K11 joins as fixtures | not enumerated |

### Which tests constrain which option

| Test | file:line | Constrains |
|---|---|---|
| **`'skips DIM tables (only enriches DWS)'`** — asserts `res.enriched === 0` for a layer containing only `dim_server` | `packages/data/semantic-layer/tests/enrichment.spec.ts:222-227` | **Item 1 — this is the single test that hard-codes the star-schema assumption.** Under D1+D2 (inventory = any non-empty PK, target-side skip removed) `dim_server` becomes both an inventory entry and an enrichment target, and its own PK `server_id` is one of its own columns → a self-join ref → `enriched` becomes 1 → **this test fails**. It must be rewritten, and its rewrite is where the self-join-guard decision gets forced. |
| 5 exact-name matching tests, incl. `'dims with empty primary_key are skipped'` (`:77`) and `'composite PK matches only the columns present in the DWS'` (`:83`) | `enrichment.spec.ts:62-95` | **Item 2** — any FK heuristic must leave all 5 green. Note `:77` shows the "non-empty PK" predicate is *already* enforced inside the matcher, so D1's inventory change is partly redundant with existing behavior. |
| 3 CL-18 `excludeColumns` tests + 2 `buildExcludeColumns` tests | `packages/data/semantic-layer/tests/discover-relations.spec.ts:135,145,161,174,195` | **Items 1 & 2** — the noise-join defense. Broadening the inventory increases the candidate set these guard against; `:161` explicitly pins "no excludeColumns (backward compat) → ds-only match still produced". |
| **`'mergeExisting=true preserves curated refs the deterministic round does not rediscover'`** | `enrichment.spec.ts:241-252` | **Item 5 — and note what it does NOT do.** It passes `true` explicitly (`:246`). **There is no test asserting replace-mode behavior**, i.e. no test pins "default replaces existing refs". Consequence: flipping the default at `enrichment.ts:330` breaks **zero tests**. That is cheap — and also means the current destructive contract is untested and undocumented in the suite. Also note the curated fixture ref (`:245`) carries **no `origin` field**, confirming the `undefined`→`manual` legacy path is what is exercised. |
| `'writes dimension_refs into DWS tables, preserves other fields'` (calls `enrichAllDwsTables(dir)` with default args) | `enrichment.spec.ts:202,211` | **Item 5** — survives a default flip because the fixture's pre-existing `dimension_refs` is `[]`. |
| `'discoverRelations writes dimension_refs into DWS tables'`, `'…with tables? filter'` | `discover-relations.spec.ts:56,66` | **Item 5** — exercise the `index.ts:628` replace path but with empty pre-existing refs, so they too survive a flip. |
| 6 `mergeRefs` origin tests (`origin=undefined` not overridden, `manual` not overridden, `deterministic`→`llm`, `llm`→`manual`) | `enrichment.spec.ts:118,128,136,144` (+ `:97,111`) | **Item 5** — these are the tests people will point to as "already mitigated". They only exercise `mergeRefs` in isolation; **none of them goes through `enrichAllDwsTables` in replace mode**, which is exactly why the mitigation claim fails (§2). |
| `'buildLlmPrompt includes target columns + dim inventory'` (`:185`) and `'includes event name + params + dim inventory'` (`:336`) | `enrichment.spec.ts:186-190, 337-341` | **Item 3** — assert only that `dws_pay_order_di`, `server_id`, `dim_10000251_server_info` appear. **Neither asserts the literal "DWS fact table"**, so item 3's string change is test-free. |
| `S6 apply registers discover_relations (name + description + output + execute)` | `packages/data/tool-discover-relations/tests/discover-relations.spec.ts:100` | **Items 3 & 6** — touches the tool `description` and output schema; a return-type widening for item 6's message would land here plus `S9`/`S10`/`S11` (`:124,132,138`). |
| `expect(catalog).toContain('discover_relations')` | `packages/core/tools/tests/gen-tool-catalog.spec.ts:32` | **Item 6** — the generated catalog is asserted; a description change requires regenerating via `scripts/gen-tool-catalog.ts:658-667`. |
| No test found for item 4 | — | **Item 4** — `grep` found no test asserting the `kind` enum's closed membership or the `'dws'` default. `tableCountByKind` (`basic-index.ts:110-119`) also appears untested. So the enum change is **unprotected by tests** — the 159-file silent reclassification (§4.3) would not be caught. This is the strongest argument for deferring item 4. |

## 8. Working-Tree Caution (`git status --short` per reported file)

| File | Status | Delta vs HEAD |
|---|---|---|
| `packages/data/semantic-layer/src/enrichment.ts` | ` M` modified | +12/-12, **cosmetic only**: removes defensive `?? []` / `?? {}` fallbacks (`targetDef.columns ?? []` → `targetDef.columns`, `dim.primary_key ?? []` → `dim.primary_key`, `eventDef.params_fields ?? {}` → `eventDef.params_fields`) and adds `: unknown` to a `JSON.parse` result. **No logic change to `mergeExisting`, `mergeRefs`, `buildDimInventory`, or either `kind` gate.** All findings above hold for both HEAD and working tree; line numbers are working-tree. |
| `packages/data/semantic-layer/src/index.ts` | ` M` modified | +4/-5 across 4 hunks at HEAD lines ~214, ~551, ~978, ~1006. **None touch `discoverRelations` (:623-629), `discoverEventRelations` (:646-650), or `enrichOnWrite` (:677-686)** — verified by grepping the diff for `mergeExisting`/`discoverRelations`/`enrichOnWrite` (no hits). Line numbers shifted by at most 1 vs HEAD. |
| `packages/data/semantic-layer/src/types.ts` | clean | — |
| `packages/data/tool-discover-relations/src/index.ts` | clean | — |
| `wayfinder/data-agent/tickets/phase-misc/GA-GT3-enrichment-generalization.md` | clean | — |
| `wayfinder/data-agent/tickets/phase-misc/GA-GRILL3-tabledef-schema.md` | clean | — |
| `wayfinder/data-agent/tickets/phase-misc/GA-EXP1-llm-driven-inference-experiment.md` | clean | — |
| `packages/data/semantic-layer/tests/enrichment.spec.ts` | ` M` modified | +5/-5. Diff greps for `kind`/`dws`/`dim`/`mergeExisting`/`origin` show only **type-annotation removals** (`... } as TableDefinition` → `... }` on DIM fixture literals). No test name, assertion, or fixture *value* changed. All §7 citations valid for both HEAD and working tree. |
| `packages/data/semantic-layer/tests/discover-relations.spec.ts` | clean | — |
| `packages/data/tool-discover-relations/tests/discover-relations.spec.ts` | clean | — |
| `packages/data/semantic-layer/src/io.ts` | ` M` modified | +1/-1; the changed line contains none of `kind`/`dws`/`dim`. `:555` (`kind: 'dim'`) and `:654` unchanged in content; line numbers may shift ≤1. |
| `packages/data/tool-search-data-sources/src/index.ts` | ` M` modified | +6/-3; **none** of the changed lines contain `kind`/`'dws'`/`'dim'`. The load-bearing `:98` (`if (k === 'dws' \|\| k === 'dim') return 'table'`) is unchanged in content; its line number may differ from HEAD by ≤3. |
| `packages/data/tool-load-table-definition/src/index.ts` | ` M` modified | +1/-0; the added line contains no `kind`. `:247`/`:249` unchanged in content; numbers may shift ≤1. |
| `packages/data/semantic-layer/src/basic-index.ts` | clean | — |
| `packages/data/schema-gateway/src/types.ts` | clean | — |
| `packages/client/ui-context-layer/src/client/graph-styles.ts` | clean | — |
| `packages/data/management-session/src/index.ts` | clean | — |
| `wayfinder/data-agent/research/exp1-phase1/judge-calibration-report.md` | clean | — |

Untracked/modified files I did **not** revert, stage, or commit — nothing in the working tree was altered by this research except the brief itself.

## 9. Gaps — NOT INVESTIGATED

- `packages/client/ui-semantic-layer` runtime consumers of `TableKind` beyond the type alias (`types.ts:8-13`) — only the type declaration was read; UI components rendering kind badges were not enumerated.
- `packages/data/semantic-layer/tests/alt-labels-enrichment.spec.ts`, `llm-wiring-integration.spec.ts`, `k11-graph.spec.ts`, `k11-seed.spec.ts` — listed but individual tests not enumerated; some may incidentally depend on the `kind='dim'` inventory or on replace-mode. **Run these before landing items 1 or 5.**
- Whether any *eval* fixture under `packages/eval/` encodes `kind` values — grep hit 228 `kind:`-ish lines repo-wide across `packages/`, dominated by asset-kind and fixture noise; not disambiguated per-file beyond §4.
- The `dws_column`/`dim_table` on-disk YAML key rename implied by a full de-star-ification (flagged in §3, cost not estimated).
- `examples/x63-semantic-layer/` contains **0** table YAMLs — I could not determine whether it is an intentionally-empty second scope or an incomplete fixture.

## 10. Ticket Line-Number Drift (verified)

| Ticket claim | Actual | Verdict |
|---|---|---|
| `enrichment.ts:71` | `:73` = `export function discoverRelationsDeterministic(`; `:78` = the PK match | drifted ~+2 |
| `enrichment.ts:144` | `:137` = the `originPriority` override check inside `mergeRefs` (was the `startsWith('确定性')` line pre-I18N-1) | drifted ~-7 |
| `enrichment.ts:151` | `:159` = `export function buildLlmPrompt`; `:165` = the "DWS fact table" literal | drifted ~+8 |
| `enrichment.ts:226` | `:252` = `export function buildDimInventory`; `:256` = the `kind !== 'dim'` gate | drifted ~+26 |
| `enrichment.ts:316` | `:326` = `enrichAllDwsTables`; `:330` = `mergeExisting = false`; `:348` = the replace line; `:350` = the write | drifted ~+12 |
| `enrichment.ts:348` | `:348` = the replace ternary — **coincidentally still exact** | ok |
| `types.ts:278` | `:279` = `kind: z.enum(['dws','dim']).default('dws')` | drifted +1 |
| `tool-discover-relations/src/index.ts:184` | `:166` = the `schema.discoverRelations(...)` call; `:179` = `formatDiscoverRelations`; `:184` is now a `lines.push` inside the formatter | drifted; the load-bearing line is `:166` |
| `tool-discover-relations/src/index.ts:221` | `:221` = `name: 'discover_relations'`; the "DWS→DIM" description literal spans `:222-229` | approximately correct |
