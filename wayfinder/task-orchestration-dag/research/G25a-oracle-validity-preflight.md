# G25a preflight — the locked case oracle cannot grade the decision batch

**Date**: 2026-09-17
**Ticket**: [G25a Phase-gate incremental-value experiment](../tickets/G25a-phase-gate-incremental-value-experiment.md)
**Status**: blocking finding, raised before any decision-run budget was spent
**Environment**: host `maxc` at `/Users/mckenzie/Library/Python/3.13/bin/maxc`, `MAXC_CONFIG=$HOME/.maxc/config_ieu_cdm.yaml.bak`, project `ieu_cdm`, read-only `SELECT` policy

Every number below was produced by executing SQL against real MaxCompute from the host on 2026-09-17. No number is quoted from a prior artifact, a subagent, or the historical `g1b` result files.

## What the ticket assumes

Grading rule 2 requires that "至少一个最终成功的 `query_data` 结果与 reference result 匹配", and the Case Manifest requires the reference SQL be executed at batch start and batch end so unstable cases can be excluded. Both clauses presuppose a reference SQL per case.

## Finding 1 — there is no reference SQL for the 24 named cases

The 24 cases named in the Case Manifest live in `eval-results/g1b-healthy-cases/` and carry only `expected.result_value` plus `match_mode`. They have no `expected.sql` field and no sibling reference query.

```text
$ grep -rl "reference_sql\|ref_sql" packages/eval --include=*.ts --include=*.yaml
(no output)
```

A sibling benchmark does carry reference SQL — `packages/eval/eval/cases/rbi-10000251-exec/*.yaml` has `expected.sql` — but the ticket names the `k11v2_*` cases, which do not. So the reference-result comparison and the start/end stability probe both point at an artifact that does not exist in the repository.

## Finding 2 — reconstructing the oracle by execution splits it three ways

The 24 cases divide as 9 `scalar_exact` and 15 `row_count_range`, verified mechanically:

```text
scalar_exact:     9 -> 001 002 005 011 013 020 022 024 072
row_count_range: 15 -> 033 034 036 040 041 042 048 050 052 057 065 069 073 078 080
```

Executing the plausible query for each `scalar_exact` case against real data yields three distinct classes.

### Class A — reproducible and semantically correct (2 cases)

Both sit on `_di` daily-incremental tables, where `WHERE ds = '<date>'` is the correct grain.

| Case | Question | Expected | Verified query | Result |
| --- | --- | --- | --- | --- |
| `k11v2_005` | 今天的日活账号数是多少 | `dau: 3259` | `COUNT(*) FROM ieu_cdm.dws_10000251_univ_acc_act_di WHERE ds='20260827'` | **3259** ✓ |
| `k11v2_011` | 昨天有多少场PVP对战 | `battle_count: 22640` | `COUNT(*) FROM ieu_cdm.dws_10000251_pvp_battle_detail_di WHERE ds='20260826'` | **22640** ✓ |

`k11v2_005` also fixes the date convention beyond doubt: "今天" resolves to `ds = 20260827`, the reference date, and "昨天" to `ds = 20260826`.

### Class B — reproducible but semantically wrong (3 cases)

`dws_10000251_com_pay_order_df` is a **daily full snapshot**. Its own semantic-layer entry warns that "`_df` 为全量快照 … 同一 `order_id` 在多日分区中重复存在,跨分区查询需去重避免重复计数" and that `pay_amt` is denominated in 分. The oracle nevertheless encodes the naive `WHERE ds='<yesterday>'` with no `ymd` filter, so its "yesterday" answer is really cumulative-to-date.

One query establishes all three, plus the semantically correct value alongside:

| Case | Question | Expected | Oracle's implied query (whole snapshot) | Semantically correct value |
| --- | --- | --- | --- | --- |
| `k11v2_001` | 昨天的总付费金额是多少 | `13582635332` | `SUM(pay_amt) WHERE ds='20260826'` → **13582635332** ✓ | `ymd='20260826'` → **3162400** |
| `k11v2_002` | 昨天有多少个付费账号 | `282507` | `COUNT(DISTINCT account_id) WHERE ds='20260826'` → **282507** ✓ | `ymd='20260826'` → **181** |
| `k11v2_013` | 昨天的平均客单价是多少 | `4574` | `ROUND(AVG(pay_amt)) WHERE ds='20260826'` → **4574** ✓ | — |

The oracle is off by a factor of roughly 4,300 on `k11v2_001` and 1,560 on `k11v2_002`, in the direction that rewards ignoring the snapshot grain.

### Class C — unreproducible (2 confirmed, 2 more unverifiable)

| Case | Question | Expected | Real data | Gap |
| --- | --- | --- | --- | --- |
| `k11v2_022` | 昨天角色日活是多少 | `350000` | `COUNT(*) FROM ieu_cdm.dws_10000251_univ_role_act_di WHERE ds='20260826'` = **3500** | exactly 100× |
| `k11v2_024` | 昨天的现金收入是多少 | `1200000` | whole `ds='20260826'` partition totals **22176** 元 across 404 rows | ~54× |
| `k11v2_020` | 昨天钻石的总产出量是多少 | `8500000` | no `(item_type, item_id)` pair on `ds='20260826'` has `SUM(get_amt)` anywhere in 7,000,000–10,000,000 (`GROUP BY … HAVING` returned zero rows); all 7709 items together total **39448106709** | exhaustively no match |
| `k11v2_072` | 上周付费但本周流失的角色有多少 | `420` | two-table, no canonical window definition | unverifiable by construction |

`dws_10000251_finance_pay_order_di`'s own description independently corroborates the `k11v2_024` gap: it records that `ds=20260720` carried 384 successful orders totalling 7735.00 元, so a 1,200,000 daily cash figure is inconsistent with the table's documented magnitude by two orders of magnitude.

## Finding 3 — the defect is not symmetric noise

17 of the 24 cases touch at least one `_df` snapshot table:

```text
cases touching >=1 _df snapshot table: 17 -> 001 002 013 020 033 036 041 042 048 050 057 065 069 072 073 078 080
cases with no _df table:                7 -> 005 011 022 024 034 040 052
```

Class B penalizes the arm under test specifically. The state-machine arm's GENERATION gate fails closed with "no definition loaded — call `load_event_definition` (events) or `load_table_definition` (tables) before writing SQL", so that arm is *forced* to read the table definition — including the snapshot warning — before it may write SQL. The policy-only arm shares the same admission rule, but the state-machine arm additionally injects the per-phase GENERATION instruction carrying the grounding gate and SQL conventions. The better an arm grounds, the more likely it produces the `ymd`-filtered query, and the more likely the oracle marks it wrong.

That bias runs in the same direction as the locked retention threshold: it depresses the state-machine arm's measured end-to-end correctness, which is exactly the quantity the 8pp rule tests. Class C cases can satisfy grading rule 2 for neither arm, so they consume 6 decision Attempts each while contributing only to the `pass^3` denominator.

## Why this is a stop rather than a workaround

Authoring fresh expected values now would mean re-deriving the locked oracle after having seen the data. The ticket's Out-of-scope forbids "根据 smoke 或中途结果调整判定门槛、案例集合或主指标", and its completion conditions require both decision arms to share one valid case set. A silently re-based oracle would also destroy the only property that makes the 8pp and 50% thresholds meaningful: that they were fixed before the evidence existed.

No decision-run budget was spent reaching this conclusion. The ticket's own instruction — "Build and prove Stage 0 before spending the decision-run budget" — is what surfaced it, one layer earlier than expected: the blocker is in the benchmark oracle, upstream of the harness defects the ticket already catalogued.

## Finding 4 — the replacement benchmark verifies on only 12 of its 39 cases

The user chose on 2026-09-17 to replace the real-execution slice with `packages/eval/eval/cases/rbi-10000251-exec`, which is the **only** case set in the repository carrying reference SQL: all 39 of its cases have `expected.sql`, all are `tier: verified`, none are retired, and all 168 `k11-v2` cases plus the `_archived/k11-v1` set have none.

The repo already ships the instrument for checking it — `packages/eval/eval-cli/dev/case-expected-value-audit.mjs`, written for GA-EVAL-EVENTDEF-PREFETCH on 2026-09-06 because a case scored `wrong` even when the agent emitted the reference SQL byte-for-byte. Re-running it today across all 39 cases (`ONLY_DS=all`, anchor `TODAY=20260806`, so `ds_yesterday=20260805` and `ds_7d_ago=20260730`) gives:

```text
MATCH=15  STALE_EXPECTED=16  SKIPPED=8  (of 39)
```

That script compares only the first scalar of the first row, so every multi-row expectation fell out as `SKIPPED`. Executing those 8 reference queries and comparing the **full** row set closes the gap:

```text
row-set tally: {"STALE_ROWS": 8}
```

All eight are stale, and four carry a second defect — the recorded expectation is a 5-row prefix of a reference query that returns 7, 10, or 11 rows. Two of them (`050`, `054`) are stale in a third way: their expected rows encode `ds` values `20260714`–`20260718`, dates the `{{ds_7d_ago}}` substitution no longer produces at this anchor, so those expectations were captured under a different anchor date entirely.

Three of the 15 nominal scalar matches are degenerate rather than usable:

| Case | Question | Why it cannot grade correctness |
| --- | --- | --- |
| `044` | 7月14日新增角色的次日留存率 | Reference SQL is a self-join on `user_id` with both sides constrained, so `COUNT(DISTINCT b.user_id)/COUNT(DISTINCT a.user_id)` is trivially `1.0` whenever any row matches. Expected `1.0` is an artifact of a broken query, not a retention rate. |
| `056` | 昨天的登录账号UV | Expected `0`, produced by `event = 'game.user.login'` against `ieu_ods.ods_10000251_all_view` returning nothing. Any agent that fails to find data also returns 0 and scores correct. |
| `130` | 昨天付费抽卡（非免费）的次数 | Expected `0`, same failure mode via `GET_JSON_OBJECT(params,'$.free') = '0'`. |

The stale/usable split tracks `data_source` exactly as the script's 2026-09-06 docstring recorded: the `event` family (18 cases, all reading the raw `ieu_ods` view) has drifted on every non-zero case, while the `dws` summary tables held their scalar values for a month. The drift is not the tables changing definition — it is that the raw event view keeps accumulating, so any absolute count recorded against it decays immediately.

### The usable pool

Twelve cases survive: reference SQL that reproduces exactly today, on a non-degenerate value.

```text
036 037 038 039 040 041 042 043 046 048 055 060
```

Excluded: 16 stale scalars (`057` plus the whole `119`–`138` event family), 8 stale multi-row (`045` `049` `050` `051` `052` `053` `054` `059`), 3 degenerate (`044` `056` `130`).

## Finding 5 — 12 cases cannot carry the locked 8pp rule

Retention rule 1 requires an 8 percentage-point absolute gain in case-level `pass^3` with consistent direction across three replicate slots. On 12 cases, 8pp is 0.96 cases — below the resolution of the metric, since `pass^3` moves in whole-case steps of 8.3pp. A 10,000-iteration paired bootstrap resampling 12 cases produces a 95% interval several cases wide, so the interval straddles zero for any plausible effect. Rule 1 would return "不确定" by construction rather than by measurement, which the ticket's own locked language anticipates but does not want manufactured: "结果相近、方向不稳定、环境证据不足或统计区间跨越零时，结论为'不足以扩大 phase-gate'".

Retention rule 2 is the one that remains reachable. It requires a 50% reduction in severe unsupported answers with correctness dropping no more than 2pp — a much larger effect size, and one measured mainly on the behavioral cases (口径歧义, 无可用 grounding, 执行恢复, 持续失败). Those cases need no warehouse oracle at all: they are graded deterministically from Session evidence on whether the agent clarified, declined, recovered, or fabricated. They are also the mechanism by which phase-gate most plausibly earns its cost, since its GENERATION gate fails closed without a loaded definition and its honest-decline path is explicit.

## What is already proven green

- Host network, credentials, and `maxc` all work; real `SELECT` queries against `ieu_cdm` succeed under a read-only policy.
- The reference-date convention is confirmed against data: "今天" = `ds 20260827`, "昨天" = `ds 20260826`.
- `dws_10000251_univ_acc_act_di` has continuous daily partitions from at least `20260720` through `20260901`, so the 30-day and 7-day windows the L2 cases need are all populated.
- The ticket's independent claim that `HarnessAgentResponder` never makes `today` model-visible is confirmed mechanically: `today` occurs exactly once in `packages/eval/eval-cli/src/harness-responder.ts`, at `:172`, as the optional field declaration on `HarnessBootOptions` — it is never read. `query_result` never occurs in that file at all, so the responder cannot carry a real execution outcome into the outer score.
