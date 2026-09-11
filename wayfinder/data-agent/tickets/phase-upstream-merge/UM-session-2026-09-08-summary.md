# UM session 2026-09-08 — upstream merge resolution summary

> Handoff doc: per-UM resolution + build state + open items + design findings. Basis for UM-ticket `## Resolution` updates, map Decisions-so-far, and the next-session prompt.

## Branch / state
- Branch: `upstream/merge-2026-09-07` (merge of upstream `d347e703` into fork `65bf3cddc9`).
- **94 conflicts resolved (unmerged 0).** `tsc -b tsconfig.host.json` passes (0 errors, down from 118). `build:official` tsdown phase BLOCKED on dsh-root `lib/types/{index,invariant,startup}.js` entries (root has no src; tsc noEmit; tsdown expects them — build-config issue, needs investigation).

## Per-UM resolution

### UM3 (id-less callId cluster) — DONE
4 files reverted to upstream byte-identical: `packages/core/session/src/index.ts`, `packages/llm/llm/src/assembler.ts`, `packages/client/ui-trajectory/src/client/trajectory-tool-definition.ts`, `packages/client/ui-chat/src/client/conversation-nodes/tool.ts`. Dropped fork's id-less tolerance; accepted upstream strict (reject empty callId + unconditional `partial.toolCallId = chunk.id` + a1271a4 source fix). DashScope (non-conformant) fixed in UM7-2.

### UM4 (apiproxy re-home + results-RPC + A6) — DONE
- A: 13 UD apiproxy files `git rm`'d (accept upstream deletion).
- B: results-RPC re-homed to `packages/api/remotes/` 4-mirror: `packages/data/result-cache/` gains `src/remote.ts` (`ResultsRemoteGateway extends TypertRemoteService`, `@Remote('get')`→`ctx.get('resultCache')`) + `src/client/index.ts` + `src/types.ts` + package.json exports; 4 UU api/remotes resolved. **⚠️ UM4-B invented `TypertLookupFailure` (never existed); build-fix corrected to `RemoteError` + `result-not-found` via module augmentation in `result-cache/src/types.ts`.**
- C: `result-cache-gateway` bundle row added to `data-agent/cordis.patch.yml`; fake-api `results` arms confirmed matching.
- A6: accept apiproxy deletion (fork's `presetSwitches`/`await pendingSwitch` placebo dropped — against a refuted hypothesis). B-DA1真正 fix → post-build task #10.

### UM2 (CI) — DONE
ci.yml UU resolved (upstream ci-master.yml split + fork #48 vars-driven, 15 `vars.DSH_CI_FAILOVER`; `dsh-windows-2025-16core`→`windows-latest`). issue-lifecycle.yml: #52 owner guard + a33ed4d gray-check. issue-policy.yml: #52 + a33ed4d (auto-merged). build-preview-cloudflare: owner guard. release-publish/release-vendor-publish/no-production-src: left as-is. **Deviation**: ci-master.yml used owner-guard skips (not vars-driven) for 4 fork-lacking-runner jobs (vars-driven doesn't fit skip-only jobs).

### UM5 (sqlite) — DONE
`session-persistence-sqlite` `git rm`'d (75 files; no external consumer). `python/sdk-runtime` stale `dsh-session-persistence-sqlite` dep removed (was blocking pnpm install; searched packages/ not repo root initially). examples deps sorted (jq). fs-ext native fail → UM10.

### UM6 (docs) — DONE
44 docs accept-upstream (`--theirs`). verify-translation-pairing (via tsx, bypassing broken pnpm install) confirmed paired + clean. cordis-surface regen + doc-sync deferred to final.

### UM7 (.ts + restructured) — DONE (3 sub-agents + 2 design tickets)
- **UM7-1 client-runtime**: REVERTED premature delete+repoint; minimal-patch = keep zombie `packages/client/runtime` (compat shim) + repoint stale apiproxy imports (`transportError`→`dsh-client-connection/client` [4 files]; `SESSION_SEARCH_RESULT_LIMIT`→`dsh-api-session-controller/client` [2 files]) + remove `dsh-host-apiproxy` dep. **R-DA-CLIENT-RUNTIME-DECOMMISSION** ticket opened.
- **UM7-2 DashScope + credentials**: DashScope `acceptIdentity` ported + `CallId`→`ToolCallId`/`brandString`. credentials (5 UU): `address?` KEEP + upstream `notifyUpdated`/`fanOut` merged; `credentials/updated`→`credentials/reference-updated`; `static override name='credentials'` REVERTED (no-op).
- **UM7-3**: 21 files per d5 (KEEP/REVERT/REFACTOR). AGENTS.md: 2 rules → `packages/data/AGENTS.md`; root pristine. code-runtime-python dep → `dsh-experimental-code-runtime-python` + temp-restored deleted. fixture.ts (UM4∩UM7) resolved. cards.ts (broken AU) deleted. keychain-host `parseCredentialsDocument` return-type fixed.
- **Design research**: apiproxy → modular Remote interface (api/gateway + api/{session,settings,workspace}-controller @Remote + api/remotes assembly + bundle composition). data-agent uses 4/5 modular seams; violates #3 (zombie internals vs `./client` public exports). **R-DA-UI-PRESENTER-COMPOSITION** ticket opened.

### UM8 (config) — DONE
knip.json (UD, upstream deleted): kept fork's. tsconfig.{base,client,host}.json: merged upstream's new package path-mappings + fork's data-agent + zombie mappings KEPT (zombie alive) + no dead pointers. THIRD_PARTY_NOTICES.md: accept-upstream (regen at Final).

### UM9 (ptc) — DONE
ptc.ts auto-merged; `ptc-dispatch-log` consistent (upstream + merged both — no rename, no sync).

### Build-fix (118 tsc errors → 0)
JsonValue (15)→`dsh-util-values`. rootDir/TypertForwardableEventEntry (50)→`api/remotes/tsconfig.host.json` +evidence-query reference. result-cache (5)→`TypertLookupFailure`→`RemoteError` + `result-not-found` augmentation. credentials/updated (2)→removed. DashScope (7)→deepEqualJson repoint + settings API + `string|undefined`. phase-gate/harness-responder (5)→CallId→ToolCallId + getSectionOrder + snapshotEvents(). credentials-keychain (1)→5 record stubs. code-runtime-data-python (4)→tsconfig ref + snapshotJsonValue + jsonStringBytesUpTo re-export. 40 newly-surfaced test errors (renames + Promise<Agent> async + ToolPresentationMode 'code'→'ptc') — fixed.

## Build state (FINAL gate)
- `tsc -b tsconfig.host.json`: **0 errors** ✓
- `build:official` tsdown: **BLOCKED** — `[@deepseek-ai/dsh-root] Cannot find entry: ["lib/types/{index,invariant,startup}.js"]`. Root (`dsh-root`) is a meta-package (no `src/`, never had; `lib/types/` not committed). Root `tsconfig.host.json` is `noEmit`. `tsdown.config.ts` (pre-existing) expects `lib/types/{index,invariant,startup}.js` as host-face entries — no step builds them. **Investigate**: was build:official ever green? missing gen-root-types step? clean rebuild? tsdown config?

## Open items (next session)
1. Fix build:official tsdown dsh-root `lib/types` issue → build:official green.
2. typecheck + lint green.
3. check:ci:static + check:ci:consumers not regress (GA-FORK-CI 6/7 green; translation-pairing local red doesn't count).
4. cordis-surface regen + doc-sync (gen-doc-graphs/gen-tool-catalog/gen-cordis-catalog + verify-translation-pairing).
5. THIRD_PARTY_NOTICES regen (gen-third-party-notices.ts).
6. Commit the merge (if not committed) → UM11 `gh pr create` (base master, head `upstream/merge-2026-09-07`; pass dsh-pre-push-checks).
7. Post-merge UM12 (GA-FORK-CI re-sweep: re-base a-series T7-12 + fix fork red fadeIn/publint/pwsh).
8. B-DA1 task #10 (post-build runtime systematic-debug: JSONL + fiber-lifecycle → root cause → fix).
9. R-DA refactor tickets (post-merge): R-DA-CLIENT-RUNTIME-DECOMMISSION (HIGH) + R-DA-UI-PRESENTER-COMPOSITION (MEDIUM) + LOW (DashScope sync, sqlite alignment, jsonl/fiber verify).
10. **Test for regressions + dsh web app starts** — run the web-app bundle + verify no regression.

## Design findings (data-agent strategy)
Upstream's restructure is MODULAR (apiproxy→@Remote controllers + assembly; client-runtime→split packages; sqlite→jsonl; session v2). The data-agent's migrations ARE the correct alignment (not over-patching), EXCEPT the zombie `client/runtime` (the one structural debt — R-DA-CLIENT-RUNTIME-DECOMMISSION). The data-agent should be a COMPOSED BUNDLE/PROFILE consuming upstream's public modular seams (5: bundle composition, @Remote+api-remotes, `./client` public exports, client-modules loader, api-remotes client assembly) + its OWN additive packages for gaps. It already uses 4/5; violates #3 (zombie internals vs public exports).
