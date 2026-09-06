# R1: 53 missing .zh.md deferred — next batch + schedule

Branch: (none yet — follow-up)

## Question

⑤ triaged 55 missing .zh.md, translated 2 (adr-0001 + da-product-brief, PR #10 merged). 53 deferred. Which to translate next, schedule, and who reviews?

## Context (the 53)

- **22 `.agents/notes/**`** — internal; i18n norm discourages mass agent translation; consider whether internal notes need bilingual at all.
- **8 docs/** remaining (KEY user-visible): da-upstream-debt (132L), da-architecture (146L), da-experiment-recording (146L), da-pr-workflow (153L), da-plugin-development-guidelines (267L), superpowers/plans ×3.
- **21 packages/*/README.md** — short (21-75L each), tractable per-doc.
- **2 wayfinder/** — research/prototype READMEs.

## Recommended next 3-5

da-upstream-debt (132L, KEY — upstream debt registry), da-architecture (146L, KEY), da-pr-workflow (153L, KEY). Use `pnpm run gen-translation-brief <pair>` (extended workflow) for the longer ones.

## Strategy

Routine counterpart updates by the working agent (one pass); big generated updates via `gen-translation-brief` (user-invoked). The 22 .agents/notes — defer (or decide internal notes don't need bilingual).
