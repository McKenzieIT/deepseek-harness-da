# da Upstream Debt Registry

> Tracked debt from the `da-plugin-development-guidelines` compliance audit (2026-08-22).
> Each item records a place where da currently modifies dsh-owned source, or carries an
> in-fork anti-pattern, the reason da needs the capability, the planned resolution, and
> the interim workaround that avoids merge conflicts with `upstream`
> (`deepseek-ai/deepseek-harness`).
>
> Per rules 4.1 / 4.4 / §3.2 of `docs/da-plugin-development-guidelines.md`, da must not
> modify dsh-owned package src. The items below are the known exceptions — to be resolved
> upstream (or via a §4.2 wrapper seam) rather than reverted in-fork. All dsh-src
> modifications here are **additive / backward-compatible** (optional params, new optional
> fields, new types/exports) — none is breaking — so existing upstream callers and
> providers continue to typecheck.

---

## §1 Upstream-PR debt (dsh-owned source modified)

### D1 — Credentials per-user/scope addressing

**What was modified:**

- `packages/credentials/credentials/src/index.ts` — dsh `CredentialProvider` abstract `resolve` / `describe` / `set` / `unset` / `notifyUpdated` each gained an optional `address?: CredentialAddress` param; `CredentialAddress` re-exported from `./types.ts`.
- `packages/credentials/credentials/src/types.ts` — added the `CredentialAddress` interface; **modified the existing `credentials/updated` `SessionEventMap` member signature** to add `address?` (a §3.2 hard boundary — modifying a `SessionEventMap` member needs declaration-merging = code).
- `packages/credentials/credentials/src/brand.ts` — **NEW file** added to dsh `credentials/src/` with `UserId` / `ScopeId` brand types + factories.
- `packages/credentials/credentials-local/src/index.ts` — `assertOwnerOnly` / `renderDocument` gained `export` (private→public).

**Why (da capability needed):** da's per-user / multi-scope data-agent requires credentials to be resolved, described, and mutated *per user/scope* (a `CredentialAddress`), not just globally. The da-owned keychain provider (`credentials-keychain-host`) replaces `credentials-local` as `ctx.credentials` and must stay byte-compatible with `.credentials.yaml`, hence the re-used file-format helpers.

**Rules violated:** 4.1 (modify dsh src); 4.4 (modify dsh Service Definition interface signature + vocabulary / typed-event types); §3.2 (modify an existing `SessionEventMap` member).

**Upstream PR plan** (to `deepseek-ai/deepseek-harness`):

1. Add optional `address?: CredentialAddress` to the `CredentialProvider` abstract methods (additive, non-breaking) — general value for any multi-tenant / multi-scope deployment.
2. Move `UserId` / `ScopeId` brand primitives into `@deepseek-ai/dsh-brand` (or the `credentials` Service Definition) rather than a new dsh src file.
3. Export `assertOwnerOnly` / `renderDocument` from `credentials-local` (generally useful file-format helpers) OR extract them into the abstract `credentials` Service Definition so consumers depend on the seam, not the concrete provider.
4. The `credentials/updated` event signature change (§3.2) is the hardest — propose as a **separate architectural PR** (an event-member signature change is not a 24h-SLA mechanical merge).

**Interim workaround (avoid merge conflicts):** Keep the current additive modifications. An upstream `git merge upstream/master` will conflict **only** on the modified method signatures and the `credentials/updated` member — mechanical resolve: keep da's optional param and incorporate any upstream body changes. The new `brand.ts` file will not conflict (additive file). Minimize further edits to these files until the PR lands. If upstream renames / changes these methods before the PR lands, rebase da's optional param onto the new signature.

**§4.2 alternative (if upstream declines):** Build `packages/credentials/credentials-addressed` — a da-owned wrapper `Service` (`ctx.addressedCredentials`, `inject: ['credentials']`) that layers address-aware resolution over the **unmodified** `ctx.credentials`, with a da-owned companion event (`credentials-addressed/updated`, a plain emitter — **not** a Cordis typed event, since §3.2 also forbids adding *new* `SessionEventMap` members). da Consumers inject `'addressedCredentials'`. This fully reverts the dsh modifications.

---

### D2 — Subagent continuable-children + cost telemetry

**What was modified:**

- `packages/subagent/subagent/src/index.ts` — dsh `SubagentRuntime` gained ~9 new public methods (`startContinuable`, `followup`, `interrupt`, `reportFrom`, `registerContinuableSetup`, `drainContinuableDescendants`, `drainContinuableChildren`, `listChildren`, `listDescendants`) + constructor wiring of `SubagentContinuationManager` / `SubagentActivationSetupRegistry` + session-projection registration.
- `packages/subagent/subagent/src/types.ts` — added `SubagentCosts` + optional `costs?` on `SubagentResult` (**modifies the dsh `SubagentResult` vocabulary type**), `ContinuableCreateRequest` / `ContinuableCreateSpec` / `ResolvedSubagentStartRequest` types, optional `prepareContinuable?` on `SubagentProvider`.
- `packages/subagent/tool-subagent/src/index.ts` — dsh Consumer `tool-subagent` (the **named** forbidden example in rule 4.4) modified: `backgroundMode: 'one-shot' | 'continuable'` config, per-child `persona` / `toolFilter`, `ForegroundToolResult.costs?`, output-schema `costs` field.

**Why (da capability needed):** da's Qoder subagent provider (`subagent-qoder`, da-owned) needs (a) **continuable / background subagents** (spawn a long-running Qoder task, follow up, interrupt) and (b) **per-subagent cost / credits telemetry** (per-user Qoder Credits reconciliation — "G3 driver"). The continuable-children capability is arguably general; the cost model is da-specific.

**Rules violated:** 4.1 (modify dsh src); 4.4 (modify dsh Service Definition interface + vocabulary types + the named Consumer `tool-subagent`).

**Upstream PR plan** — split into two PRs:

1. **Continuable subagents** (general value): add the `ContinuableCreate*` types + `prepareContinuable?` + the `SubagentRuntime` continuable methods as additive, non-breaking. Provider-opt-in (providers that don't implement `prepareContinuable` keep one-shot behavior).
2. **Cost telemetry**: `SubagentResult.costs?` + `SubagentCosts` — propose as additive (providers that don't report costs leave it undefined). The `tool-subagent` Consumer changes (`backgroundMode`, costs surfacing) ship only if (1) lands upstream; otherwise da keeps them in a da-owned sibling Consumer.

**Interim workaround (avoid merge conflicts):** Additive optional fields / methods — upstream merges conflict only on the modified `SubagentResult` type and the `SubagentRuntime` / `tool-subagent` method surfaces. Mechanical resolve: keep da's additions and incorporate any upstream body changes. The continuable / cost surface is large; avoid further in-place edits until the PR lands. If upstream restructures `SubagentRuntime` before the PR lands, rebase da's continuable methods onto the new structure.

**§4.2 alternative:** Build `packages/subagent/subagent-continuable` — a da-owned wrapper (`ctx.continuableSubagents`, `inject: ['subagents', 'agents']`) layering continuable orchestration over the unmodified one-shot `SubagentRuntime`; define `DaSubagentResult = SubagentResult & { costs?: SubagentCosts }` owned by `subagent-qoder`; ship a da-owned sibling Consumer `tool-subagent-qoder` via `defineTool` (inject `['subagents', 'tools']`), leaving the dsh `tool-subagent` untouched.

---

### D3 — ProviderEditor registry-driven adapter-family UI

**What was modified:**

- `packages/client/ui-settings-models/src/client/ProviderEditor.tsx` — dsh client src modified to add a `'dashscope'` `EditorLayout` union member, `if (ns === 'llm-dashscope') return 'dashscope'` string-matching in `layoutOf`, a `DASHSCOPE_PUBLIC_BASE_URL` constant, and `family === 'dashscope'` branches in the placeholder + `DeepSeekModelsEditor` routing.

**Why (da capability needed):** da's `llm-dashscope` provider needs a settings-UI layout (DashScope-specific fields / base-URL) in the `dsh web` Models page. dsh's `ProviderEditor` has no registry for adapter-family layouts — layouts are hardcoded per family in the shared component.

**Rules violated:** 4.1 (modify dsh client src); §1.5 / §3.1 (hardcoded product-specific branch in shared dsh logic instead of composition / registration).

**Upstream PR plan:** Propose a **registry-driven adapter-family UI**: each LLM adapter package contributes its own layout (field set + base-URL placeholder) via a registration call (e.g. `ctx.modelsUi.registerFamily({ ns, layout, fields })` or a `defineModelEditorFamily()`), and `ProviderEditor` renders the registered family instead of hardcoding. `llm-dashscope` then registers its own `'dashscope'` layout. General improvement — any third-party LLM adapter gets a custom UI without editing dsh.

**Interim workaround (avoid merge conflicts):** Keep the current additive `'dashscope'` branch (non-breaking). Upstream merges conflict only on the `EditorLayout` union and the `layoutOf` / placeholder / editor branches. Mechanical resolve: keep da's family and incorporate any upstream layout changes. If upstream refactors `ProviderEditor` before the PR lands, rebase da's family onto the new structure.

**§4.2 alternative:** Limited — `ProviderEditor` is dsh UI with no injection seam, so a da wrapper cannot contribute a layout without the registry. This item is therefore **upstream-PR-only** (no clean §4.2 wrapper); the additive branch is the interim until the registry PR lands.

---

## §2 In-fork deferred anti-patterns (NOT upstream-PR)

> These are anti-patterns in **da-owned** code (no dsh source modified). They do not need an
> upstream PR. They are recorded here because the correct fix is a structural refactor the
> team has **explicitly deferred** (per in-code comments); they are tracked for a future
> follow-up, not force-fixed against the deferral.

### D4 — nl2sql-engine Service Definition does provider I/O (§6:io-in-definition)

**What (da-owned):** `packages/data/nl2sql-engine/src/index.ts` — `Nl2sqlEngineService` (the `ctx.nl2sql` seam owner / Service Definition) imports `loadConventions` from the concrete `@deepseek-ai/dsh-query-maxcompute/src/conventions.ts` Provider and calls it in its constructor (`this.conventions = loadConventions(config.conventionsEngine ?? 'maxcompute')`). `loadConventions` does provider-specific file I/O (`readFileSync` of maxcompute's `conventions.yaml`), so the seam-owning Definition is coupled to a concrete Provider and leaks I/O into the abstract layer.

**Why:** Single-engine (MaxCompute) today; the conventions loader lives in the maxcompute Provider and is shared by nl2sql + a future query-guard consumer.

**Rules violated:** §6 row 2 (io-in-definition — I/O only in Provider); §4.4 (Definition imports a concrete Provider's internal). da-owned→da-owned, so **not** a dsh-source violation; lower-stakes than §1.

**Correct-approach target:** Restructure nl2sql into a 3-role seam — an abstract `Nl2sqlEngineService` Definition (no I/O; declares `abstract getConventions(): EngineConventions`), a `MaxComputeNl2sqlProvider` that implements `getConventions()` (owns the `conventions.yaml` read) and `static inject`s itself, and the bundle patch mounting the provider. The Definition then only owns the vocabulary; swapping the query engine leaves the nl2sql seam agnostic.

**Deferred because:** The team explicitly deferred this ("the shared query-package loader ideal is deferred until a second consumer / engine arrives — P13b grilling Q1/Q3", per `conventions.ts`). Single-engine today means the seam-swap concern is theoretical; a premature 3-role restructure would add a provider package + bundle-patch change + test updates for no current consumer.

**Interim:** No merge-conflict risk (da-owned code). Re-evaluate when a second query engine or query-guard consumer arrives. If forced now, the refactor is: new `MaxComputeNl2sqlProvider` class + abstract `getConventions()` + bundle patch `insert` of the provider + test updates.

---

## Audit summary

| ID | Cluster | Rule | Severity | Resolution | Status |
|---|---|---|---|---|---|
| — | web-app bundle `llm-dashscope` insert | 4.3 | — | **not a current violation** — master tip (494839a98c) verified clean: insert added at `4104471fb1`, removed before tip; the scan finding was an agent-checked-out worktree artifact, not a committed violation | N/A (false positive — see Audit-accuracy note) |
| D1 | credentials addressing | 4.1 + 4.4 + §3.2 | HIGH | upstream PR (or §4.2 `credentials-addressed` wrapper) | DEBT — not reverted |
| D2 | subagent continuable + costs | 4.1 + 4.4 | HIGH | upstream PR (or §4.2 `subagent-continuable` wrapper) | DEBT — not reverted |
| D3 | ProviderEditor dashscope UI | 4.1 + §1.5 / §3.1 | HIGH / MED | upstream PR (registry-driven UI) | DEBT — not reverted |
| D4 | nl2sql io-in-definition | §6 + 4.4 | HIGH | in-fork 3-role refactor (deferred by team) | DEBT — deferred |

**Coupled catalog entries (downstream of D1/D2):** `packages/extensions/tool-cordis/src/api-catalog.ts` additive `SERVICE_API` / `TYPE_API` rows document da's new seams (audit / embedder / identity / nl2sql / schema + their types) and the D1/D2 changed signatures. The da-seam-documentation rows are additive registration (allowed). The signature-documenting rows update in lockstep when D1/D2 land upstream or move to §4.2 wrappers — not independent debt.

**Clean / no-action:** `bundle/headless`, `bundle/base` (zero changes); `bundle/data-agent` (sanctioned disable+insert+config-override); all `scripts/gen-*` + manifests (additive registration); agent presets (§4.5 da-owned location); `packages/query/query-tool` `setTimeout` (transient self-resolving timer, not a leak — optional abort-awareness hardening only); `packages/data/phase-gate/src/phase-gate.ts` + `packages/data/tool-load-event-definition/src/index.ts` working-tree edits (da-owned; `tool-load-event-definition` adds a tool output field + helper types, **not** a new `SessionEventMap` member → no §3.2 breach).

---

## Audit-accuracy note

The phase-1 dimension-3 scan reported a rule-4.3 violation: `packages/bundle/web-app/cordis.patch.yml` appending an `llm-dashscope` insert. **Verification against the committed master tip (494839a98c) shows this was a false positive.** The insert was added by commit `4104471fb1` (`feat(web-app): mount llm-dashscope provider`) and removed before the tip — the master-tip `cordis.patch.yml` ends at `default: standard` with no insert block, `git show 494839a98c:packages/bundle/web-app/cordis.patch.yml` is clean, and `git diff upstream/master...HEAD -- packages/bundle/web-app/cordis.patch.yml` (committed net) is empty. The scan's `git diff` showed the insert because an inspecting agent checked out `4104471fb1`'s historical version into the working tree, tainting the worktree; the committed state was already clean. No revert was needed (none was applied — the fix branch's PR diff is this doc only).

Lesson for phase 3: reviewers must verify findings against the **committed** state (`git show <tip>:<path>`, `git diff upstream/master...HEAD -- <path>`), not the working tree, since scan agents can taint the worktree by checking out historical commits during inspection.

D1, D2, D3, D4 above were all re-verified against the committed master tip (content counts + net diff) and are **real** committed violations / anti-patterns.
