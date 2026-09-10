# UM-ADAPT Sample — Seam 3/4 (webServer-lazy) Adaptive-vs-Surface

**Scope:** upstream `d347e703..upstream/master` (c389f96bf3, +449). Seams 3
(`packages/client/connection`) + 4 (`packages/client/modules`). READ-ONLY
analysis of the fork's data-agent. Date: 2026-09-08.

All facts from actual `git diff`/`grep`/`read_file` against the repo at
`/Users/mckenzie/workspace/dsh-upstream-merge`.

---

## 1. WHY — the architectural shift (not just rename + drop inject)

Both seams re-architect webServer from a **static inject dependency** (plugin
hard-requires webServer to load) to an **optional, on-demand carrier**. Verified
from `git diff d347e703..upstream/master -- packages/client/connection/src
packages/client/modules/src`:

**Seam 3 (`packages/client/connection/src/index.ts`):**
- `inject` `['webServer','credentials']` → `['credentials']`.
- The `/api` route mount moved INSIDE `ctx.inject(['webServer'], (webCtx) => {
  webCtx.effect(() => webCtx.webServer.register(route), ...) })`.
- Host comment: "Mounts the API gateway" → **"Provides carrier-neutral RPC and
  Fetch registries. When `webServer` is present, the plugin also mounts the `/api`
  browser transport."** The plugin now serves carriers WITHOUT an HTTP server.
- Host `ConnectionConfig` interface KEPT (gained `recovery?` field); the CLIENT
  export `ConnectionConfig` (in `client/connection.ts`) was RENAMED to
  `ConnectionRecoveryConfig` (new `src/recovery-config.ts`).

**Seam 4 (`packages/client/modules/src/index.ts`):**
- `ClientModuleRegistry.static.inject` `['webServer','loader']` → `['loader']`.
- Route registration now conditional-lazy: `if (ctx.get('webServer') ===
  undefined) ctx.inject(['webServer'], registerWebCarrier) else
  registerWebCarrier(ctx)`.
- NEW `fetchBundle(request: Request): Response` — serves revisioned bundles
  to a **non-HTTP carrier** directly (no webServer route needed).
- `DshClientDeclaration` interface REMOVED → `DshClientManifest` imported
  from new `@deepseek-ai/dsh-package-manifest`.
- Comment: "carrying webServer and loader" → **"carrying Loader and an optional
  Web carrier."**

**WHY summary:** webServer is demoted from a load-time hard dependency to one
optional carrier among possibly many. Carrier-neutral plugins (connection RPC,
module bundle serving) now function in non-HTTP hosts (electron IPC, etc.).
This is a structural re-architecture, not a mechanical rename.

---

## 2. Data-agent CURRENT — does it eager-depend on webServer?

**Bundle/host registration — NO.** `packages/bundle/data-agent`:
- `src/index.ts` = `export {}` (pure YAML patch carrier, no runtime API).
- `src/invariant.ts` injects only `['invariants']`.
- `cordis.patch.yml` is additive-only over `dsh-base` (disables code-agent
  surface, mounts data plugins). It does NOT list `connection` or `modules`
  rows — those come from base, not this overlay.

**Plugin-level — YES, one plugin.** `grep -rn 'webServer' packages/data`
returns exactly one plugin: `packages/data/admin/src/index.ts`:
- Line 141: `export const inject = ['storageDomain', 'credentials', 'webServer']`
- Line 238: `const dispose = ctx.webServer.register({ kind: 'prefix', path:
  '/admin/api', handler: ... })` — synchronous, inside `ctx.effect`.

This is the SAME OLD pattern (static webServer inject + synchronous register
inside effect) that seams 3 and 4 abandoned. All other ~35 data packages
inject domain services (`tools`, `schema`, `query`, `identity`, `sessions`...)
— none inject webServer.

**Type consumption — NONE.** `grep -rn 'ConnectionConfig|DshClientDeclaration|
DshClientManifest|ConnectionRecoveryConfig' packages/data packages/bundle/data-agent`
= empty. `grep dsh-client-connection|dsh-client-modules` imports = empty. The
data-agent does not consume any renamed/removed type from either seam.

**Admin is HTTP-only:** its routes (`/admin/api/login`, `/me/pat`, `/users`,
`/access-links`) are HTTP endpoints using `IncomingMessage`/`ServerResponse`.
It has no carrier-neutral use case.

---

## 3. Adaptive vs Surface

**Heuristic (step 3):** the data-agent eager-depends on webServer (admin
plugin) → CONFLICT → adaptive.

**Refinement — admin's webServer is HTTP-justified, but the verdict holds.**
The admin plugin's eager webServer is NOT the carrier-neutral anti-pattern
(connection/modules had carrier-neutral use cases; admin does not). However,
the decision rule is explicit: eager webServer → adaptive. The 5-criterion
guard (step 4) does NOT grant an exemption — criterion 2 ("no fork workaround
against the new logic") under the joint-shift framing means a fork-added plugin
keeping the OLD eager pattern while upstream standardizes on lazy is itself the
workaround to retire. Keeping admin eager would leave a standing fork
divergence from the new convention with no carrier-neutral justification strong
enough to override it (admin gains graceful no-webServer load for free).

**Verdict: ADAPTIVE for both seams.** Not because the specific type/inject
breaks touch the data-agent (they do not — see §2), but because the JOINT
architectural shift requires the fork's one eager-webServer plugin to align.

The adaptive work is a **single shared refactor** (admin lazy-webServer),
not two separate refactors. Seam 3 supplies the canonical pattern to mirror
(`ctx.inject(['webServer'], (webCtx) => webCtx.effect(...))`); seam 4 supplies
the conditional variant (`ctx.get('webServer') === undefined ? inject : call`).
Seam 4's `DshClientManifest` type break is a pure no-op for the data-agent
(not consumed), and its `fetchBundle` carrier-neutral method is N/A for admin
(HTTP-only routes have no Request-based carrier equivalent).

---

## 4. 5-Criterion Guard

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Clean public-seam consumption (no zombie internals, no bypassing lazy) | PASS after refactor | Today admin bypasses lazy (eager inject). Refactor: drop `webServer` from inject, wrap `ctx.webServer.register` in `ctx.inject(['webServer'], (webCtx) => webCtx.effect(...))` mirroring seam 3. No zombie internals (admin imports no removed types). |
| 2 | No fork workaround against the new logic | PASS after refactor | Keeping eager webServer in a fork-added plugin IS the workaround. Refactor retires it. Admin's HTTP-justification does not override — it makes the refactor low-risk (behavior unchanged when webServer present), not unnecessary. |
| 3 | Verifiable | PASS | `dsh --profile <da> --dump-config` confirms admin loads with `inject=['storageDomain','credentials']`; routes register only when webServer present; `admin.spec.ts` (line 7/45/48) already asserts inject contains webServer — that test assertion must be UPDATED to assert lazy registration instead. |

---

## 5. Per-Shift Table

| shift | why (architectural) | data-agent current | conflict / align | adaptive vs surface | feeds ticket |
|---|---|---|---|---|---|
| **Seam 3** — `connection` inject `['webServer','credentials']`→`['credentials']`; `/api` route → `ctx.inject(['webServer'], ...)`; client `ConnectionConfig`→`ConnectionRecoveryConfig` | webServer demoted to optional carrier; connection now carrier-neutral RPC+Fetch (works w/o HTTP host) | admin plugin eager-injects webServer + synchronous `ctx.webServer.register` (line 141/238). Data-agent imports NO connection type. | CONFLICT (admin mirrors seam 3's old pattern); type rename = no-op (not consumed) | **ADAPTIVE** — refactor admin to lazy webServer (mirror seam 3's `ctx.inject(['webServer'], ...)`); update `admin.spec.ts` inject assertion | **R-DA** (adaptive data-agent refactor) |
| **Seam 4** — `modules` inject `['webServer','loader']`→`['loader']`; route → conditional lazy; NEW `fetchBundle(request)`; `DshClientDeclaration`→`DshClientManifest` | module registry carrier-neutral (serves bundles via `fetchBundle` w/o webServer); manifest type centralized to `dsh-package-manifest` | admin plugin eager-injects webServer (same old pattern). Data-agent imports NO modules type; bundle lists no modules row (from base). | CONFLICT (admin mirrors seam 4's old pattern); type rename + fetchBundle = no-op (admin HTTP-only, not consumed) | **ADAPTIVE** — same single admin refactor as seam 3 (mirrors modules' conditional-lazy variant); fetchBundle carrier-neutral method N/A for HTTP-only admin. No type-import work. | **R-DA** (adaptive) |

**Shared adaptive work (addresses both seams):**
File: `packages/data/admin/src/index.ts`
1. `export const inject = ['storageDomain', 'credentials', 'webServer']` →
   `['storageDomain', 'credentials']` (drop webServer).
2. In `apply()`'s `ctx.effect`, wrap `registerRoutes`' `ctx.webServer.register(...)`
   in `ctx.inject(['webServer'], (webCtx) => { webCtx.effect(() => disposeRoutes,
   'admin: routes') })` (mirror seam 3), OR the conditional variant
   (`if (ctx.get('webServer') === undefined) ctx.inject(...) else ...` per seam 4).
3. Update `packages/data/admin/tests/admin.spec.ts` (lines 7, 45, 48): replace
   `expect(inject).toContain('webServer')` with an assertion that routes register
   lazily only when webServer is present.

**Surface-level (UM14) companion work — NOT adaptive:**
- `tsconfig.base.json`: merge the 11 new upstream path-mappings (incl.
  `@deepseek-ai/dsh-package-manifest` → seam 4 dep). No key conflicts with
  fork's UM8 data-agent aliases (additive both sides). This is mechanical merge,
  feeds UM14.
- The data-agent does NOT need `@deepseek-ai/dsh-package-manifest` as a runtime
  dep (admin doesn't consume `DshClientManifest`); only the tsconfig alias is
  required for the modules package itself to resolve (owned by base).

---

## 6. Summary

- **Specific breaks are no-ops for the data-agent:** zero type consumption
  (`ConnectionConfig`/`DshClientDeclaration`/`ConnectionRecoveryConfig`/
  `DshClientManifest` all absent); the changed inject arrays belong to the
  connection/modules plugins (provided by base, internal to those plugins).
- **Adaptive verdict holds via the joint shift:** the data-agent's ONE
  eager-webServer plugin (`packages/data/admin`) mirrors the exact old pattern
  both seams retire. Per the decision rule (eager webServer → adaptive) and
  criterion 2 (no fork workaround against the new logic), admin must be
  refactored to lazy webServer — a single refactor covering both seams.
- **Both seam3 and seam4 = ADAPTIVE**, feeding **R-DA** (adaptive data-agent
  refactor). The surface-only work (tsconfig alias merge) feeds **UM14**.
- **Risk: LOW.** Admin is HTTP-only and the data-agent always runs with a
  webServer, so the lazy refactor is behavior-preserving (routes still register
  when webServer present); it adds graceful no-webServer load + convention
  alignment as the only behavior delta.

---

## 7. Resolution (Session C, 2026-09-08)

Verdict **implemented** in Session C: admin lazy-webServer refactor, mirroring
seam 3 (`packages/client/connection`).

- **Commit**: `9ba8638eac` on branch `refactor/rda-admin-lazy-webserver-2026-09-08`
  (worktree `../dsh-rda-admin`, base `upstream/merge-2026-09-07`).
- **Changes** (per §5):
  1. `inject` — dropped `'webServer'` → `['storageDomain', 'credentials']`.
  2. Route registration wrapped in
     `ctx.inject(['webServer'], (webCtx) => webCtx.effect(() => registerRoutes(webCtx, …), 'admin: routes'))`,
     nested inside the existing domain-open `ctx.effect` so routes register
     only after the async `storageDomain.open` (fail-closed preserved). Route
     disposal rides the webServer carrier fiber; Cordis LIFO disposes it before
     `domain.close()` (same routes-then-domain order as the prior explicit
     `disposeRoutes()` + `domain.close()`).
  3. `domain` + `identityService` made `const` in-effect — the outer `let`s were
     reset on dispose, so TS couldn't narrow them inside the inject closure
     (the one real typecheck catch; vitest doesn't typecheck, so tsc found it).
- **Seam 4 variant**: N/A for admin (HTTP-only; no `fetchBundle`/non-HTTP
  carrier) — uses the seam 3 unconditional `ctx.inject(['webServer', …])` shape.
- **Verification**: `vitest run packages/data/admin` → 16/16 (inject assertion
  `not.toContain('webServer')` + a harness with memory-backed `storageDomain` +
  no-op `credentials` asserting (a) admin loads & opens its domain without a
  webServer, (b) registers `/admin/api` when one is present); bounded
  `tsc -b packages/data/admin/tsconfig.json` clean; full
  `tsc -b tsconfig.host.json` exit 0; lefthook pre-commit `lint (staged)` /
  `whitespace` / `vendor manifest guard` all pass.
- **Branch-rationale correction**: the session prompt's claim "d347e703 has the
  seam 3 lazy pattern to mirror; seam 3 unchanged d347e703..latest" is **wrong**
  — `d347e703` is the *pre-refactor* base (eager webServer); the lazy pattern
  was *added* in `d347e703..upstream/master`; `upstream/merge-2026-09-07`
  (`558e6f4f66`) lacks seam 3/4 (behind `upstream/master`, not an ancestor). The
  pattern was mirrored from `upstream/master` (read-only via `git show`). The
  branch decision still holds: admin is fork-only and byte-identical on both
  branches, so the refactor lands cleanly on `merge-2026-09-07` and stays
  isolated from UM14.
- **Out of scope (unchanged)**: the 45-pkg client-runtime decommission
  (`R-DA-CLIENT-RUNTIME-DECOMMISSION`) is a separate ticket, blocked-by UM14 —
  untouched.
- **Deferred verification**: `dsh --profile <da> --dump-config` (criterion 3's
  strongest form) was not run (the CLI is not built in the worktree); covered
  by the vitest behavior tests + tsc + the inject assertion.
- **Next (future session, not this one)**: after UM14 re-sync completes,
  clean-rebase this branch onto the synced branch.
