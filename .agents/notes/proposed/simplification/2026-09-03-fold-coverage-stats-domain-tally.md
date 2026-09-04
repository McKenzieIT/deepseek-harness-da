# Agent Note: Fold the drifted coverage-stats domain-tally into a shared helper

Status: proposed

## Problem

The same "load tables/events/metrics + safeParse + ensure(domain) + tally" domain-tally loop is re-implemented in three live sites: `packages/data/schema-gateway/src/index.ts:147` `listDomains` + `:175` `getCoverageStats`; `packages/data/evidence-query/src/index.ts:349` `coverageQuery`; `packages/data/tool-list-domains/src/index.ts:45` `listDomainsResult`. The drift is real: `evidence-query:344` comments "delegates to the same logic as SchemaGateway.getCoverageStats()" but **re-implements** it (does not delegate) and adds a `confirmation.status` breakdown (`tallyConfirmation` `:395`); `tool-list-domains:6` comments "Mirrors the SchemaGateway.listDomains() logic" but adds concept metadata (`loadConcepts`, alt_labels at `:84`) the others lack; schema-gateway has neither. All surfaces are live (consumed by `useSchemaGateway.ts:46` `listDomains`, `useEvidenceQuery.ts:87` `coverageQuery`, the `list_domains` tool, `patrol-mode:433`, and the live-verify scripts), so this is a fold, not a removal.

## Proposal

Fold the domain-tally into a shared `SemanticLayerService` helper (e.g. `tallyDomainCounts(root)`) in semantic-layer or a small shared util; each caller keeps its own enrichment (confirmation status / concepts) on top of the shared base.

## What we give up

Three private copies let each site tweak its tally independently; folding commits them to one base shape. The divergence (confirmation breakdown, concepts) is real per-site enrichment, not a bug — the shared base must not flatten it.

## Alternatives considered

**Keep three copies because each site has different enrichment.** evidence-query adds a confirmation-status breakdown, tool-list-domains adds concept metadata, schema-gateway has neither — so a shared helper might flatten these. It lost because the drift is the per-site re-implementation of the same base tally (the comments say "delegates to" / "mirrors" while re-implementing); the proposal keeps each caller's enrichment on top of a shared base that takes an options bag, so the per-site differences survive without the duplicated base loop.

**Centralize into schema-gateway as the owner.** Schema-gateway is one of the three sites, so make it the canonical home. It lost because schema-gateway lacks the concept/confirmation enrichment the other two carry, and the proposal's shared `tallyDomainCounts` lives in `SemanticLayerService` (the natural owner of the domain tally) so all three callers import it on equal footing rather than two depending on a sibling tool package.

## Acceptance criteria

- One `tallyDomainCounts` definition; grep confirms the three sites import it.
- schema-gateway `listDomains`/`getCoverageStats`, evidence-query `coverageQuery`, and tool-list-domains `listDomainsResult` produce byte-identical domain-count output for a fixed K11 corpus (snapshot parity).
- Each caller's enrichment (concepts, confirmation breakdown) still renders.

## Risks

The three sites serve different consumers with different enrichment — the shared base must accept an options bag, not a fixed shape, or it flattens the concept/confirmation hooks. Add or update snapshot-parity tests before the fold to catch any count shift. If tool-list-domains's concept metadata is load-bearing for downstream UI, the helper must thread it through.
