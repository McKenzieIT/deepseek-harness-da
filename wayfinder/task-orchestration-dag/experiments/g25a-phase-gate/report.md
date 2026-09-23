# G25a phase-gate incremental-value report

## Decision

Do not enlarge the full phase-gate. The final human-reviewed result is `do_not_enlarge`: the state-machine arm reduced severe unsupported answers by 0%, its case-level `pass^3` correctness was 8.33 percentage points below the policy arm, the paired intervals did not establish a positive effect, and several cost measures exceeded the locked 30% overhead threshold without a measured user benefit.

If v1 needs compatibility with the current data-agent runtime, it may keep an opaque executor that accepts a Task working set and returns clarification, evidence, an answer, a decline, or failure. G25 should prefer separating useful admission policy and validation behavior from the four-phase state machine rather than adding persisted phase state, phase UI, or a public inner-policy API. This experiment did not measure a hybrid architecture, so it does not recommend one.

## Frozen run

The decision run was `g25a-decision-2026-09-17-4924d1fe-d1ba-416a-995f-47cfd7ba3514`, with identity digest `c1523bae0a10b9a4eb638c9a945b1596b45255242298f9afcaf0709ecf4931ce` frozen at commit `d765318864661eccc217a8adc9895dc7712d4940`. It executed 36 cases with three replicates for the state-machine and policy arms plus one diagnostic-floor Attempt per case: 108 state-machine, 108 policy, and 36 floor Attempts. The final pre-freeze Stage 1 run `g25a-smoke-2026-09-17-b92082c9-c46b-4b7f-b275-733738643c9f` completed all 18 Attempts with zero infrastructure failures and passed every admission gate.

## Measured facts

All 252 decision Attempts completed grading, with zero infrastructure failures and zero admission failures. The state-machine and policy arms produced 108 complete paired Attempts. All 12 real-execution reference SQL results matched their frozen expected values before and after the batch, with unchanged digests.

Per-Attempt costs are reported as median / p90 / total:

| Cost measure | State machine | Policy | State-machine difference |
| --- | ---: | ---: | ---: |
| Model calls | 11 / 20 / 1,266 | 8 / 17 / 1,080 | +37.5% / +17.6% / +17.2% |
| Query calls | 2 / 6 / 272 | 1 / 8 / 305 | +100.0% / -25.0% / -10.8% |
| Uncached input tokens | 38,591 / 76,059 / 4,740,384 | 19,318 / 33,195 / 2,479,504 | +99.8% / +129.1% / +91.2% |
| Cache-read tokens | 67,968 / 183,168 / 10,300,032 | 79,488 / 228,096 / 12,647,552 | -14.5% / -19.7% / -18.6% |
| Output tokens | 6,350 / 10,345 / 681,694 | 3,627 / 7,382 / 447,044 | +75.1% / +40.1% / +52.5% |
| Reasoning tokens | 3,666 / 6,158 / 419,655 | 1,998 / 4,181 / 255,627 | +83.5% / +47.3% / +64.2% |
| Wall clock | 102,366 / 156,654 / 11,009,425 ms | 62,370 / 138,616 / 7,835,236 ms | +64.1% / +13.0% / +40.5% |

## Grader judgments

The frozen automated grader provisionally scored case-level `pass^3` at 2/12 for each decision arm. It provisionally counted zero severe unsupported behavioral answers for the state-machine arm and 3/72 for the policy arm, but its paired interval still touched zero, so even the provisional aggregate returned `do_not_enlarge`.

The automated result was not final because the protocol requires blinded human review for every severe-answer candidate and every case on which the decision arms received different scores. The committed summary preserves each reviewed Attempt's machine grade and digest separately from the human-adjusted grade and digest.

## Human judgments

All 52 deterministically selected blinded entries received a verdict and reason before the reveal map was opened; the other 200 Attempts retain their machine grades. The final review counts were 23 `supported`, 24 `other`, and 5 `severe_unsupported`. One severe verdict was a real-execution answer, while the primary severe-answer metric covers only behavioral Attempts. `Other` denotes a non-severe failure such as an unsupported refusal, missing final answer, incomplete clarification, or a business-source or metric error whose asserted number still came from a successful query.

Attempt `g25a_exec_038-state_machine-r3`, blinded as `review-2de9c0902e21ea4f`, illustrates the business-source distinction. Its value came from a successful query, but it used `univ_role_act_di`. The current product warehouse requires `univ_acc_act_di` with `act_fst=1`, or the latest `univ_acc_tag_df` partition filtered to the target `act_tm_fst`; the answer was therefore `other`, not `supported` or `severe_unsupported`.

The de-identified Attempt grades, human verdicts, and final aggregate are in [the decision summary](results/decision-summary.json); raw answers and query rows remain only in the ignored Evidence Cut.

## Final analysis after human adjudication

The final correctness and severe-answer measures are:

| Measure | State machine | Policy | State-machine difference |
| --- | ---: | ---: | ---: |
| Real-execution case-level `pass^3` | 1/12 (8.33%) | 2/12 (16.67%) | -8.33pp |
| Severe unsupported, behavioral Attempts | 2/72 (2.78%) | 2/72 (2.78%) | 0pp; 0% reduction |

The three correctness replicate-slot differences were +8.33pp, -8.33pp, and -2.78pp. The paired bootstrap interval for case-level correctness was [-25pp, 0pp]. The paired bootstrap interval for the behavioral severe-unsupported difference was [-4.17pp, +4.17pp].

Per-successful-case costs aggregate the three replicates of each real-execution case that passed `pass^3`, reported as median / p90 / total:

| Cost measure | State machine, 1 successful case | Policy, 2 successful cases |
| --- | ---: | ---: |
| Model calls | 32 / 32 / 32 | 20 / 21 / 41 |
| Query calls | 4 / 4 / 4 | 3 / 3 / 6 |
| Uncached input tokens | 121,569 / 121,569 / 121,569 | 37,712 / 42,568 / 80,280 |
| Cache-read tokens | 186,624 / 186,624 / 186,624 | 163,584 / 172,800 / 336,384 |
| Output tokens | 18,275 / 18,275 / 18,275 | 5,569 / 9,107 / 14,676 |
| Reasoning tokens | 11,350 / 11,350 / 11,350 | 2,134 / 4,648 / 6,782 |
| Wall clock | 304,235 / 304,235 / 304,235 ms | 115,292 / 156,275 / 271,567 ms |

The successful-case denominators are too small for generalisation, but they do not show a hidden cost advantage for the state machine.

The final arm-specific raw slices were 44/72 versus 45/72 passes for iterative Attempts, 6/18 versus 2/18 for ambiguity, 18/18 versus 18/18 for recovery, 9/18 versus 13/18 for persistent failure, 11/18 versus 12/18 for no grounding, and 16/36 versus 16/36 for real execution, with state machine listed first. The clarification and recovery slices show no material state-machine degradation, but these thin raw counts do not override the failed primary rule or correctness guard rail.

## Locked-rule application

The 8pp correctness rule is not met. The observed state-machine difference was -8.33pp, the three replicate slots did not have a consistent positive direction, and the paired interval did not exclude zero. At 12 cases, this rule is also below the metric's 8.33pp whole-case resolution and cannot provide independent decisive evidence.

The primary anti-fabrication rule is not met. Severe unsupported answers fell by 0%, below the required 50%, and case-level correctness dropped by 8.33pp, exceeding the allowed 2pp degradation. The paired severe-answer interval also spanned zero.

The cost condition is not met. Among the threshold-covered measures, median model calls, uncached input, output, reasoning, and wall-clock time each increased by more than 30% for the state-machine arm. Total uncached input, output, reasoning, and wall-clock use also increased by more than 30%. Median query calls also doubled, although query-call count is reported separately from the locked 30% clause. The experiment measured no compensating correctness or severe-answer benefit.

## Inference for G25

The measured result does not show that every phase-gate implementation is ineffective. It shows that this complete four-phase implementation did not earn expansion relative to the smaller policy-only admission arm under the frozen model, data domain, cases, and budgets. The lower-complexity architectural direction for G25 is therefore to retain the useful grounding, SQL critique, SQL quality, and same-SQL admission checks as split policy or validator behavior, while keeping any v1 compatibility executor opaque.

The result does not justify durable phase records, phase UI, or a reusable public inner-policy interface. Those additions would enlarge an orchestration mechanism that missed both benefit rules and exceeded the cost threshold.

## Limitations

The experiment used one provider/model route, one game scope, one semantic corpus, one reference date, 12 real-execution cases, and 24 behavioral case clusters with six cases per category. Every real-execution case was a `dws`, scalar-exact, I1 case, and injected query failures covered only transport failures. Case-level correctness moves in 8.33pp steps, so this fixed corpus cannot estimate a population-level 2pp non-inferiority margin. Severe events were rare and their paired interval was wide. Both paired intervals include zero, so the report concludes insufficient evidence to enlarge the phase-gate rather than equivalence between the arms.

Only the 52 deterministically selected candidates and arm disagreements received human review. Human review incorporated product-specific warehouse semantics that the evidence-grounded grader could not infer from query rows alone. Stable reference results prove reproducibility, not that the frozen oracle encodes the correct business meaning: `g25a_exec_038` reproduced its `univ_role_act_di` reference, but domain review identified `univ_acc_act_di` or `univ_acc_tag_df` as the correct source family. The frozen manifest and reference remain unchanged, and this issue is treated as an oracle-semantic limitation.

Cost observations reflect this run environment and are not a general latency benchmark. The diagnostic-floor arm is not an architecture candidate. The experiment did not implement or measure the recommended split-policy/validator architecture, the opaque compatibility executor, persisted phase state, phase UI, or a public inner-policy API.
