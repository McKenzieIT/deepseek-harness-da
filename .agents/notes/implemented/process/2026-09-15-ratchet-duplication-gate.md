# Agent Note: Ratchet the duplication gate from the inherited baseline

Status: implemented

English | [中文](2026-09-15-ratchet-duplication-gate.zh.md)

## Problem

The duplication gate exited nonzero whenever jscpd found any clone, but the first effective CI run after the workflow repair found 89 existing clones across `packages/` and `scripts/`. The same result reproduced on `origin/master`, so unrelated pull requests could not make the gate green. The corpus also admitted root `scripts/**/*.spec.ts` files even though `**/tests/**` already expressed that test duplication is outside this production-code gate.

## Decision

The jscpd corpus excludes `**/*.spec.ts` and `**/*.spec.tsx` while continuing to scan production TypeScript, TSX components, repository scripts, and type declarations. Excluding the root specs removes two clones; the retained corpus reports 87 clones and 1,364 duplicated lines out of 404,202 lines, or 0.337455%. The gate uses jscpd's native `threshold` at 0.338%, the smallest three-decimal ceiling above that measured baseline, and removes `exitCode` because that option makes any detected clone fail before the threshold can act.

The percentage is a ratchet, not an acceptance claim. Existing clones remain visible in every report, production type declarations and component boilerplate remain eligible debt, and a cleanup that lowers the measured percentage should lower the threshold in the same change. The current corpus has less headroom than one minimum six-line clone, so the negative-control fixture crosses the threshold and exits nonzero. If corpus growth later makes percentage dilution material, [T16](../../../../wayfinder/repo-infra/tickets/T16-duplication-gate-89-clones.md) requires replacing this native threshold with a stable clone-baseline comparator rather than weakening the ceiling.

## Alternatives considered

**Refactor all inherited clones before restoring CI.** The 87 retained clones span unrelated UI, data, LLM, evaluation, and repository-script owners. Folding them into one gate-repair pull request would create broad behavior risk, hide the responsibility of each owning package, and continue fail-fast masking of later CI gates.

**Exclude type declarations or TSX component boilerplate.** Both can expose real ownership drift or missing shared primitives, so broad exclusions would erase useful signal. Only test specifications are excluded consistently with the existing `**/tests/**` rule.

**Disable the nonzero exit or set a loose threshold.** That would turn the gate into an informational report. The 0.338% ceiling preserves a blocking signal immediately above the measured baseline.

## Consequences

Pull requests no longer fail solely because they inherit the current clone inventory, while new duplication cannot consume more than the deliberately tiny headroom without failing the gate. Reports continue to enumerate the debt, and future simplifications can reduce both the count and threshold. The gate remains an aggregate percentage check rather than an exact clone fingerprint; a later comparator is justified only if measured corpus growth allows new clones to hide below the ceiling.
