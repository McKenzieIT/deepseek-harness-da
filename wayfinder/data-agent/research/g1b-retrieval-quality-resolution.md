# G1b-retrieval — Resolution Notes (2026-08-26)

## What was fixed

### 1. BM25 Tokenizer (commit 9f2f650b50)

**Root cause**: `tokenize()` used regex `[A-Za-z_][A-Za-z0-9_]*` which captured entire
snake_case identifiers as single tokens (`dws_10000251_acc_summary_df` → 1 token).
Query "acc summary" never matched because `acc` ≠ `dws_10000251_acc_summary_df`.

**Fix**:
- Split underscore-joined identifiers into sub-tokens + keep the whole token
- Add hybrid name-match bonus (BM25 + table-name coverage scoring)
- Support 2-char prefix matching for abbreviated queries ("ch"→"churn")
- Expand BM25 candidate pool (topK×10, min 50) for better re-ranking

**Result**: Recall@5 on g1b-30cases: **0% → 86.7%** (26/30 cases)

### 2. Eval match_modes format mismatch (same commit)

**Root cause**: `match_modes.ts` expected envelope format (`{value: X}`, `{min:, max:}`)
but g1b-30cases used direct format (`{total: 12345}`, `{min_rows:, max_rows:}`).
This caused ALL result comparisons to fail with "malformed result_value" regardless of
whether the SQL actually produced correct results.

**Fix**: Accept both envelope and direct formats; add loose numeric equality for
ODPS string/number comparison; handle scalar arrays in set_equal/ordered_subset.

## Current state (post-fix)

| Metric | Before | After |
|--------|--------|-------|
| BM25 Recall@5 | 0% | 86.7% (26/30) |
| delivery_match | 0% (decline/empty) | 100% (all 5 tested cases) |
| execution_match | 0% | 0% (bottleneck shifted) |

## Why execution_match is still 0%

The bottleneck shifted from **retrieval** to **LLM SQL generation quality**.
Evidence from direct engine trace (k11_049):
- BM25 correctly surfaces target table as rank 1 ✓
- LLM generates SQL with issues:
  - Reasoning text leaks into SQL (e.g., `-- Wait, DATEDIFF returns int...`)
  - Non-ODPS date functions used (GETDATE(), DATEDIFF not MaxCompute dialect)
  - Wrong table selected from candidates (model picks similar but wrong table)

**This is NOT a retrieval or eval-infra issue.** It's model quality with qwen3.5-flash
on MaxCompute-specific SQL generation. Possible next steps:
1. Try qwen3.7-max (better SQL quality)
2. Improve prompt grounding (MaxCompute dialect examples in the prompt)
3. Increase pass_k=3 (more attempts)
4. Add SQL post-processing to strip reasoning leakage

## 4 remaining BM25 misses (not fixable with BM25 alone)

| Case | Issue |
|------|-------|
| k11_067 | Inherently ambiguous: "progression" matches 5+ tables, no "toy" hint |
| k11_107 | Multi-table query (needs 2 tables simultaneously) |
| k11_108 | "role tag" matches 5+ tables equally (no disambiguating signal) |
| k11_109 | Multi-table query |

These need query expansion (LLM-based) to resolve. BM25 alone cannot disambiguate.
