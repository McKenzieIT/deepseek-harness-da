# Upstream 449-Commit Impact Survey (d347e703..upstream/master = c389f96bf3)

Range: 2026-09-04 → 2026-09-08. Total scale: **4345 files changed, +90046/-19843**.

All facts from actual `git log`/`git diff`/`git ls-tree` against the repo at
`/Users/mckenzie/workspace/dsh-upstream-merge` (worktree of deepseek-harness-da,
upstream = deepseek-ai/deepseek-harness).

---

## 1. Thematic Survey

### Conventional-commit type breakdown (449 subjects)
| type | count | | type | count |
|---|---|---|---|---|
| fix | 130 | | perf | 8 |
| test | 76 | | chore | 8 |
| docs | 37 | | revert | 2 |
| feat | 25 | | release | 1 |
| refactor | 20 | | **merge commits** | **~130** |
| ci | 10 | | freeform | 2 |

~130 of 449 are merge commits (feature-branch integrations). The largest
feature branches merged: `codex/subprocess-native-containment`,
`feat/electron`, `worktree-sidebar`, `xtr/durable-inbox-recovery`,
`dshw/pr-deepseek-harness-deepseek-harness-2672`.

### Subsystem breakdown (scope frequency)
- **subprocess**: 122 subjects — native process containment (win32 primitives,
  systemd scopes, PTY launcher, runner lifecycle). Largest subsystem by far;
  almost entirely fix/test/docs on one feature branch.
- **session / session-format / session-persistence / session-reference**: ~30
  subjects — streaming v0→v2 migration, frozen persistence reads, durable
  inbox recovery, spill fixes.
- **web / sidebar / dockkit / textpreview / workspace-files**: ~25 subjects —
  the "worktree-sidebar" feature branch: tab navigation, fullscreen shell,
  reversible docking engine, paged file reader, lazy file tree.
- **agent-loop**: 9 subjects — inbox projection ownership, message freezes,
  teardown paths.
- **desktop / electron**: ~12 subjects — electron packaging, host fetch
  handlers, app versions, windows build.
- **connection**: 5 subjects — handshake recovery, retry factors.
- **client / modules / manifest**: ~5 subjects — manifest type centralization.

### Top ~15 architectural commits actually IN the 449 range
(listed by impact; file/line counts from `git show --shortstat`)

1. `e9f1b6c53e` Merge codex/subprocess-native-containment (142 files) — native
   process containment feature-branch integration.
2. `0348599f04` Merge dshw/pr-2672 (142 files) — durable inbox recovery branch.
3. `5c8e1b53de` Merge fix/ci-node-compile-cache-data-disk (99 files) — CI
   node-compile cache on data disk.
4. `31b3f3bc44` Merge feat/electron (92 files) — **desktop/electron packaging**
   lands apps/desktop + apps/desktop-host.
5. `de01754f1e` Merge #3588 worktree-sidebar (72 files) — sidebar/dockkit
   rework feature branch.
6. `bd4199f48c` test: cover filesystem resources and Sidebar domain behavior
   (103 files, +10675/-1649) — largest single-commit test addition.
7. `b67e0a838c` feat(sidebar): tab navigation + fullscreen shell (31 files,
   +3779) — NEW sidebar shell.
8. `9e7c570094` feat(dockkit): reversible docking engine + pointer
   interactions (29 files, +4526) — NEW packages/client/ui-dockkit.
9. `d10af0654f` feat(textpreview): paged file tabs + retained reader state
   (19 files, +1607) — NEW packages/client/ui-sidebar-textpreview.
10. `4ce4f0bac4` feat(workspace-files): dual-face file API + Host-resolved
    resources (20 files) — **NEW packages/api/workspace-files** (4469 lines
    across the seam).
11. `9f2b07cea8` feat(remotes): expose workspace file operations to the Client
    (4 files) — workspaceFilesRemote mounted in api-remotes assembly.
12. `4d56cbc3d3` refactor(manifest): centralize package manifest types — **NEW
    packages/util/package-manifest**; `DshClientDeclaration` → `DshClientManifest`.
13. `a84a8da9e1` refactor(session-format): introduce streaming migration stages.
14. `46196d6f95` perf(session-format): stream released v0-to-v2 migrations.
15. `508831624f` chore(web): assemble Sidebar domains and register workspace
    packages (25 files) — sidebar domain registration.
16. `1bd26370cc` + `1e04fcff35` fix(connection): recover stalled handshakes +
    validate retry factors — connection recovery-config refactor.
17. `08cfbd8970` chore(api): remove stale session-controller file dependencies
    (6 files) — session-controller cleanup.

### CRITICAL CORRECTION — the task's three "named" commits are NOT in the 449
All three are **ancestors of d347e703 (the base)**, confirmed via
`git merge-base --is-ancestor`:

| commit | subject | in 449? | real status |
|---|---|---|---|
| `64a963da0b` | feat: add TypeRT remote gateway infrastructure | **NO** | pre-existing at base. Its `packages/host/api-gateway` dir **never reached the main line** — absent at both d347e703 and upstream/master. Surviving TypeRT artifacts: `packages/api/gateway` (exists at both ends) + `packages/client/connection/src/{rpc.ts,rpc-host.ts}` (stable, **unchanged** in the 449). |
| `4f00a8b82a` | refactor(api): remove ApiProxy package | **NO** | pre-existing at base. `packages/host/apiproxy` absent at both ends. |
| `15f2997bcb` | cleanup: omit unneeded invariant companions | **NO** | pre-existing at base. Removed `src/invariant.ts` from acp/api-gateway/api-remotes/controllers; already done before the 449 window. |

`git log --oneline d347e703..upstream/master | grep -c` for each = **0**.

---

## 2. Seam Impact

### Seam 1 — bundle composition (`packages/bundle/*`)
- **Commits touched**: 40
- **Diff stat**: 31 files, +185/-97
- **What changed**: `cordis.patch.yml` updates across base/headless/sdk-app/sdk-minimal/web-app;
  `package.json` dep bumps; README refresh. `web-app/cordis.patch.yml` +44 lines
  (new plugin patches for sidebar/dockkit/resources/workspace-files).
- **API breaks**: none. Patch-yml + dep changes only.
- **Data-agent impact**: **LOW**. The fork's `packages/bundle/data-agent` is
  fork-added; upstream's bundle changes are additive patch entries. No
  collision. The fork may want to mirror new web-app patch entries if it
  extends the web-app bundle, but data-agent bundle is independent.

### Seam 2 — @Remote + api-remotes + controllers
Paths: `packages/api/{remotes,gateway,session-controller,settings-controller,workspace-controller,workspace-files}`
- **Commits touched**: 37
- **Diff stat**: 58 files, +4469/-127
- **What changed**:
  - **NEW `packages/api/workspace-files`** (dual-face file API): 400-line
    `src/index.ts`, client remote (`src/client/{index,remote,provider,change-feed,types}.ts`),
    types, 10 test files, tsconfig.client/host.json, tsdown.config.ts. Exposes
    workspace file operations (list/read/stat/changes) to the Client.
  - `feat(remotes): expose workspace file operations to the Client` (9f2b07cea8)
    — workspaceFilesRemote added.
  - `chore(api): remove stale session controller file dependencies` (08cfbd8970)
    — 6 files, -20 lines of stale deps.
  - settings-controller + workspace-controller: package.json version bumps only.
  - docs refresh for session-controller.
- **API breaks**: none to existing remotes/controllers. The new workspace-files
  remote is **additive**.
- **Data-agent impact**: **MEDIUM**. The fork just did the @Remote re-home in
  UM4. The new `workspaceFilesRemote` must be added to the fork's api-remotes
  client assembly mount loop, and `@deepseek-ai/dsh-api-workspace-files` dep +
  tsconfig alias added, or the fork's assembly diverges from upstream's. No
  existing-remote breaks, so current @Remote consumption is safe.

### Seam 3 — ./client public exports (`packages/client/connection/*`)
- **Commits touched**: 16
- **Diff stat**: 15 files, +580/-95
- **What changed (BREAKS)**:
  - `src/index.ts` (host plugin, +51/-95 restructure): `inject` changed
    `['webServer','credentials']` → `['credentials']`. webServer is now
    **optional / lazy-injected** via `ctx.inject(['webServer'], ...)`. The
    `/api` route mount moved inside the lazy inject. Comment changed from
    "Mounts the API gateway" → "Provides carrier-neutral RPC and Fetch
    registries."
  - **NEW `src/recovery-config.ts`**: `ConnectionRecoveryConfig` interface +
    `ConnectionRecoveryConfigSchema` (backoff timing, generation-ready
    timeout). New `__DSH_CONNECTION_RECOVERY__` page global injected.
  - **NEW `src/client/fixture.ts`** (196 lines): `createFixtureConnectionRpc`.
  - `src/client/index.ts`: public export **RENAMED** `ConnectionConfig` →
    `ConnectionRecoveryConfig`. `resolveConnectionConfig` imported from new
    recovery-config. `ClientTransportGlobal` gained
    `__DSH_CONNECTION_RECOVERY__?: unknown`.
  - `fix(connection): recover stalled handshakes and keep retrying` (1bd26370cc)
    + `fix(connection): validate retry factors and clarify timeout recovery`
    (1e04fcff35).
- **API breaks**: **YES**. (1) `inject` array changed — any fork code that
  registers client-connection expecting webServer in the inject array must
  adapt. (2) Client-side `ConnectionConfig` export renamed to
  `ConnectionRecoveryConfig`.
- **Zombie `packages/client/runtime`**: **0 commits** in range. **ABSENT at
  both d347e703 and upstream/master** (`git cat-file -t …:packages/client/runtime`
  → fatal: not a valid object name / does not exist). The zombie is entirely
  fork-local. The fork's own commit `be531688f3` "refactor(client): migrate
  consumers and remove Runtime" handles decommission. Upstream made **zero**
  further changes to runtime.
- **Data-agent impact**: **HIGH**. If the fork imports `ConnectionConfig`
  from `packages/client/connection/client`, it breaks (rename). If the fork
  registers the connection plugin with `inject: ['webServer', 'credentials']`,
  it must drop `webServer` (now lazy). The TypeRT RPC files (`rpc.ts`,
  `rpc-host.ts`) are stable/unchanged — safe to consume.

### Seam 4 — client-modules loader (`packages/client/modules/*`)
- **Commits touched**: 11
- **Diff stat**: 7 files, +68/-49
- **What changed (BREAKS)**:
  - `src/index.ts`: **`DshClientDeclaration` interface REMOVED** (16 lines
    deleted), replaced by `DshClientManifest` imported from
    `@deepseek-ai/dsh-package-manifest` (the NEW centralized package from
    commit 4d56cbc3d3). `parseDshClient` return type changed.
  - `ClientModuleRegistry.static.inject` changed `['webServer','loader']` →
    `['loader']`. webServer now optional. Comment: "carrying webServer and
    loader" → "carrying Loader and an optional Web carrier."
  - `package.json` +3 deps; `tsconfig.json` +1 ref.
- **API breaks**: **YES**. `DshClientDeclaration` type removed; any fork code
  referencing it must switch to `DshClientManifest`. The inject change mirrors
  seam 3.
- **Data-agent impact**: **MEDIUM-HIGH**. If the fork's data-agent loader
  references `DshClientDeclaration` or relies on webServer being in the
  module-registry inject array, it breaks. Add `@deepseek-ai/dsh-package-manifest`
  dep.

### Seam 5 — api-remotes client assembly (`packages/api/remotes/src/client/*`)
- **Commits touched**: 9 (to packages/api/remotes)
- **Diff stat (remotes only)**: 4 files, +12/-3
- **What changed**: `src/client/index.ts` — `workspaceFilesRemote` imported
  from `@deepseek-ai/dsh-api-workspace-files/remote` and **added to the
  `apply()` mount loop** alongside the existing remotes. New type re-exports:
  `export type {} from '…/dsh-api-workspace-files/remote'` + `/types`.
  `package.json` gained `@deepseek-ai/dsh-api-workspace-files` workspace dep;
  version bumped 0.1.3-alpha.1 → 0.1.3-alpha.2. `ClientRemote` type still
  re-exported from `@deepseek-ai/dsh-api-gateway/client` (unchanged).
- **API breaks**: none. Purely additive (new remote mounted).
- **Data-agent impact**: **LOW-MEDIUM**. Additive. The fork's api-remotes
  client assembly must add `workspaceFilesRemote` to stay in sync, but
  existing remotes (agentPresets, commands, settings, goals, llm, dynamic,
  pluginInventory, messageFeedback, fileUploads, sessionReferences, subagents,
  session, workspace) are all unchanged.

---

## 3. Data-Agent Package Impact (`packages/data/*`)

- **`packages/data` at upstream/master**: **DOES NOT EXIST**.
  `git cat-file -t upstream/master:packages/data` → fatal: Not a valid object
  name. `git log --oneline d347e703..upstream/master -- packages/data/` → **0 commits**.
- **Overlap**: **ZERO**. The fork's `packages/data/*` (audit, evidence-query,
  semantic-layer, phase-gate, nl2sql-engine, result-cache, schema-gateway,
  tool-*, preset-autojoin, scope-registry, etc.) are entirely fork-added.
  Upstream has no competing `packages/data`. No collision possible.
- **`packages/bundle/data-agent`**: also fork-added; upstream's
  `packages/bundle/` has {acp-app, base, headless, sdk-app, sdk-minimal, web-app}
  — no data-agent bundle.

---

## 4. Build/Config Impact

`git diff --stat d347e703..upstream/master -- <config-paths>`: 6 files, +55/-7.

### `tsconfig.base.json` (+17 lines, 0 removals)
**All additive path-mappings** (no existing alias removed):
- `@deepseek-ai/dsh-spill-policy/notice` → packages/spill/spill-policy/src/notice.ts
- `@deepseek-ai/dsh-host-open-in-app` (+ `/shared`)
- `@deepseek-ai/dsh-client-ui-dockkit`
- `@deepseek-ai/dsh-client-ui-sidebar-right` (+ `/client`)
- `@deepseek-ai/dsh-client-ui-sidebar-textpreview` (+ `/client`)
- `@deepseek-ai/dsh-api-workspace-files` (+ `/types`, `/client`)
- `@deepseek-ai/dsh-client-resources` (+ `/client`)
- `@deepseek-ai/dsh-client-ui-sidebar-files` (+ `/client`)
- `@deepseek-ai/dsh-client-ui-open-in-app`
- `@deepseek-ai/dsh-package-manifest` → packages/util/package-manifest/src

**Collision with fork's UM8 tsconfig additions**: **NONE**. The fork added
path-mappings for data-agent + zombie packages; upstream's 449 additions are
all for NEW sub-packages not present in the fork's alias set. The merge is
purely additive on both sides — no key conflicts. The fork must simply merge
in these 11 new aliases.

### `tsconfig.client.json` (+14 lines)
- Comment update: "packages/client tests" → "packages/client tests and top-level Client benchmarks".
- NEW include globs: `benchmarks/**/*.client.{ts,tsx}`, `benchmarks/support/**/*.ts`.
- NEW project references: `packages/code-runtime/code-runtime-worker-thread`,
  `packages/client/ui-dockkit`, `ui-sidebar-right`, `ui-sidebar-textpreview`,
  `ui-sidebar-files`, `ui-open-in-app`, `packages/client/resources`,
  `packages/api/workspace-files/tsconfig.client.json`.

### `tsconfig.host.json` (+17 lines)
- NEW include globs: `apps/desktop/{scripts,tests}/**/*.ts`, `benchmarks/**/*.ts`,
  `apps/web/tests/sidebar-right.e2e.ts`.
- NEW exclude: `benchmarks/**/*.{client.ts,client.tsx}`.
- NEW project references: `packages/util/package-manifest`,
  `packages/api/workspace-files/tsconfig.host.json`, `packages/host/open-in-app`.
- Comment: "Under packages/client" → "Under packages/client and benchmarks".

### `tsdown.config.ts` (+4 lines)
- `workspace` array now **conditional on build face**: when NOT client face,
  includes `apps/desktop` + `apps/desktop-host`. Client face unchanged.

### `scripts/run-gates.ts` (+8 lines)
- NEW `'ci-bench'` mode + `bench` gate (`pnpmScript('bench', 'test:bench')`).

### `scripts/build.ts` + `scripts/client-build-environment.ts`
- **Unchanged** (exist at both ends, not in the 449 diffstat).
- `packages/typert/generator/package.json`: 1-line change (version bump).

---

## 5. Top Changes Most Likely to Impact the Data-Agent (ranked by severity)

1. **BREAK (HIGH)** — `packages/client/connection` inject + export rename
   (seam 3): `inject` `['webServer','credentials']`→`['credentials']`;
   client public export `ConnectionConfig`→`ConnectionRecoveryConfig`. Any
   fork code importing `ConnectionConfig` from `client/connection/client`
   or registering the plugin with the old inject array breaks. Migration:
   rename import; drop webServer from inject (now lazy).

2. **BREAK (MEDIUM-HIGH)** — `packages/client/modules` `DshClientDeclaration`
   → `DshClientManifest` (seam 4): interface removed, replaced by centralized
   type from new `@deepseek-ai/dsh-package-manifest`. `ClientModuleRegistry.inject`
   `['webServer','loader']`→`['loader']`. Migration: switch type import; add
   package-manifest dep.

3. **ADAPT (MEDIUM)** — NEW `packages/api/workspace-files` + `workspaceFilesRemote`
   in api-remotes client assembly (seams 2 + 5): the fork's UM4 @Remote re-home
   must incorporate the new remote (dep + tsconfig alias + mount-loop entry)
   or its client assembly diverges from upstream. Additive, not a break.

4. **MERGE (MEDIUM)** — `tsconfig.base.json` +11 new path-mappings + client/host
   tsconfig new project refs: no key conflicts with fork's UM8 data-agent/zombie
   aliases (additive both sides), but the fork must merge them. Missing
   `@deepseek-ai/dsh-package-manifest` alias would break seam-4 migration.

5. **BUILD (MEDIUM)** — `tsdown.config.ts` workspace now includes
   `apps/desktop` + `apps/desktop-host` (non-client face); NEW apps/desktop
   (9631 lines, electron main/project-manager/seed-store). Fork's full-workspace
   build must handle the new apps. If the fork only builds client face, no impact.

6. **ADAPT (LOW-MEDIUM)** — session-format streaming v0→v2 migration
   (`a84a8da9e1`, `46196d6f95`): if the data-agent persists/restores sessions,
   the streaming migration stages affect restore paths. Session-telemetry-otel
   got significant changes (+7108/-2765 across packages/session/*).

7. **ADAPT (LOW)** — `packages/bundle/web-app/cordis.patch.yml` +44 lines:
   if the fork's data-agent bundle extends web-app, mirror the new patches.
   data-agent bundle itself is independent.

8. **NONE (INFO)** — subprocess native containment (122 commits, largest
   subsystem): process isolation/containment; no data-agent surface overlap.

9. **NONE (INFO)** — zombie `packages/client/runtime`: 0 upstream commits in
   range; absent at both base and tip. The fork's R-DA-CLIENT-RUNTIME-DECOMMISSION
   is entirely fork-internal; upstream has nothing further to change.

10. **NONE (INFO)** — TypeRT gateway (`64a963da0b`), ApiProxy removal
    (`4f00a8b82a`), invariant-companions (`15f2997bcb`): all pre-existing at
    base d347e703, NOT in the 449. The surviving TypeRT RPC (`rpc.ts`,
    `rpc-host.ts` in client/connection) and `packages/api/gateway` are stable.

### Net assessment
The 449's impact on the data-agent layer is **moderate and mostly additive**:
2 real breaks (seam 3 connection inject/rename, seam 4 manifest type rename),
1 sync requirement (workspace-files remote), and config merges that are
collision-free. The fork's own `packages/data/*` and `packages/bundle/data-agent`
have **zero overlap** with upstream. The zombie runtime is unchanged by
upstream (already gone). The biggest risk is the seam-3/seam-4 inject-array
changes, which mirror each other (webServer made optional/lazy) — a deliberate
architectural shift toward carrier-neutral plugins that the fork's
data-agent host registration must follow.
