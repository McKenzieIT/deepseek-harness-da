# Agent Note: Fold the four drifted repo-root resolvers in eval-cli

Status: proposed

## Problem

`packages/eval/eval-cli/src` has four hand-rolled upward-walk repo-root resolvers with no shared util: `findRepoRoot` in `main.ts:16` (keys on packages+examples), `findRepoRoot` in `compare.ts:40` (`readdirSync` includes `'packages'` only — no apps/examples check), `resolvePresetDir` (`harness-responder.ts:214`) + `resolveRepoRoot` (`harness-responder.ts:373`, keys on packages+apps, plus a second cwd-walk at `:375`), and `p15-probe.ts:80` (`join(process.cwd(), '../../../examples/k11-semantic-layer')` — no upward search at all). The drift is real, not cosmetic: `main.ts` keys on packages+examples while `harness-responder` keys on packages+apps — in a monorepo subset checkout that contains `packages/` but only one of `examples/` or `apps/`, the two resolve to different directories (`main.ts` keeps climbing, `harness-responder` returns cwd). `compare.ts`'s packages-only predicate can match a non-root directory that merely contains a `packages` entry. `p15-probe` silently points at the wrong place when run from outside `packages/eval/eval-cli`. All four are alive (`main.ts` CLI entry, `compare.ts` baseline-diff tool, `harness-responder` G1b variant boot, `p15-probe` frozen P15a evidence). No implemented Agent Note covers repo-root resolution.

## Proposal

Rehome — extract one `findRepoRoot()` into a shared eval-cli util (e.g. `src/repo-root.ts`) with a single predicate (packages+apps+examples) and have all four call sites import it; pass an explicit `--repo-root` / `presetDir` from the CLI for non-repo CWDs instead of `process.cwd()` guesses. `p15-probe` can stay frozen but should call the shared helper.

## What we give up

Four private resolvers let each entry pick its own predicate; folding commits them to one. That independence already caused partial-checkout divergence, so the lost flexibility is the flexibility to resolve different roots for the same checkout.

## Alternatives considered

**Keep four resolvers so each entry picks its own predicate.** It lost because the four predicates have already drifted (`main.ts` keys on packages+examples, `harness-responder` on packages+apps), so in a partial checkout the two resolve to different directories — the independence is what caused the divergence, and `p15-probe`'s no-search `join(cwd, '../../../examples/...')` silently points at the wrong place from another CWD.

**Standardize on a single predicate but leave the resolvers in place.** Fix the predicates in situ rather than extracting a shared helper. It lost because four copies of an upward walk with the same fixed predicate is the duplication a shared `findRepoRoot` removes, and the proposal also passes an explicit `--repo-root` for non-repo CWDs, so the shared helper plus explicit flag covers both cases without the four-way drift returning.

## Acceptance criteria

- One `findRepoRoot` in eval-cli (grep confirms `main.ts`/`compare.ts`/`harness-responder.ts`/`p15-probe.ts` import it).
- A single predicate (packages+apps+examples).
- `pnpm run lint && pnpm run typecheck` green.
- A partial checkout (`packages/` + `examples/` but no `apps/`) resolves consistently across all four sites (no divergence).

## Risks

Pure refactor at repo root (no behavior change there); fixes the partial-checkout divergence. `p15-probe` is frozen P15a evidence — updating it to use the shared helper is safe (its resolver drift still bites if re-run; the shared helper fixes it). If a non-repo CWD legitimately needs a different root, the explicit `--repo-root` / `presetDir` flag carries it (no `process.cwd()` guessing).
