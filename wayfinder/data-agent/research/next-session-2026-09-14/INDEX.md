# Next-Session Research Index — 2026-09-14

Research results for the next session's tickets. Each row links the ticket's raw JSON dump to a one-line rationale summary.

| Ticket | Recommendation | Confidence | Rationale (summary) |
|---|---|---|---|
| [scopeid](./scopeid.json) | keep-with-waiver | high | scopeId has 9 live readers across 5 packages incl. hard fail-closed dep in tool-trigger-eval; retire = tenant-leak regression; fix is 2 doc block edits |
| [lint-b](./lint-b.json) | HYBRID (FIX 7 / WAIVE 34 / KEEP 15 / durable-gate) | high | Unmatched 56 verified; A-class = 6 eval-cli tests (needs eval coord) + 1 typert fixture; B-class = 49 out-of-graph, install durable gate |
| [readme-retrofit](./readme-retrofit.json) | Option C: gen-package-readme-skeleton.ts + --check gate | high | 65 depth-4 files all resolve to kind package-reference; description sourceable from package.json (65/65 verified); tool + gate cheapest |
| [merge-integrity](./merge-integrity.json) | Path-2: keep umbrella waiver, flip pending→keep | high | Gate-3 M1-tree set is 27 files (not 9); umbrella prefix-covers all 27; per-file path would need 27 rows w/ keep(14)/drop(13) split |
| [um4](./um4.json) | Scope 2 DONE; Scope 3 observer-fix (data-agent layer) | high | apiproxy deleted; results-RPC re-home at 025db697ab verified; presetSwitches race half-fixed — turn-side `await pendingSwitch` still missing |
| [um6](./um6.json) | add-group-READMEs (embedder/query/retrieval) | high | 5 verify-subsystem-pages violations; 3 missing groups have real owning subsystem page (data-agent.md #ctxembedder + #ctxquery); 9 new files |
| [um15](./um15.json) | GO on 3rd re-sync round; land §2 with correction; defer §4 | high | 852 commits + all 6 seams touched (incl. historically-breaking seam-3=27); §2 real finding: meta-gate has no knownRed[] schema — patches unnecessary |
