# Experiment audit log — data-agent retrieval-quality decisions

> **Durable ledger of experiments (probes / measurements) whose results informed a
> data-agent decision.** Per AGENTS.md ("Decision-informing experiments are
> audited"): every such experiment persists **setup + measured numbers + verdict
> + deciding-ticket pointer** here — not only in ticket prose or throwaway
> script output. The probe script is committed alongside; this log is the
> evidence future sessions cite when revisiting a decision.
>
> Append-only. One entry per experiment run; a re-run appends a dated row
> noting what changed. Keep the numbers verbatim from the probe output (do not
> paraphrase a finding into a round number).

## Conventions for each entry

- **Setup**: corpus source + size, case set + gold-derivation, scope, config
  (embedder / tokenizer / idf / field-weights / topK), and what is varied.
- **Results**: the measured numbers (strict / loose / coverage / ambiguity).
- **Verdict**: what the experiment settled + which decision it informed.
- **Fidelity**: any port-vs-shipped divergence (tokenizer / idf / floor / field
  weights) — flag it so a later session knows what a re-measure must hold
  constant.
- **Pointer**: deciding ticket + probe script path + commit.

---

## 2026-08-21 — D2c real-RBI baseline (shipped-logic, no upgrade)

- **Setup**: reverse-bi scope 10000147, 1966-event corpus, 37 eval cases (31
  with gold; gold derived from `expected.sql` `event='X'`). Probe =
  `prototypes/d2c-retrieve-baseline/run_real_rbi.py` (python port of shipped
  `HybridRetriever`: BM25 k1=1.5/b=0.75, idf `max(0, log((n-d+0.5)/(d+0.5)))`,
  RRF k=60, FIELD_WEIGHTS `{id:3,desc:1,metric:4}`, embedder `tokenize.ts` =
  CJK **bigram-only**). Variants: DEFAULT HYBRID (BM25+FakeHash+RRF), BM25-only
  (InferenceError degrade), DEFAULT+FakeReranker.
- **Results**:

  | config | strict | loose | ambiguity |
  |---|---|---|---|
  | DEFAULT HYBRID (BM25+FakeHash+RRF) | 10/31=32.3% | 32.3% | 8/37=21.6% |
  | BM25-only (degrade) | 13/31=41.9% | 41.9% | 21.6% |
  | DEFAULT+FakeReranker | 8/31=25.8% | 25.8% | 21.6% |

- **Verdict**: default prefetch recall 32.3% << 85-90% regress bar; ambiguity
  21.6% > 15% → **keep (b) escape-hatch decisively confirmed** (not borderline).
  FakeHash hybrid < BM25-only (F1); FakeReranker harmful (F2, 25.8%<32.3%);
  synonym/implicit miss (人气/消费 zero lexical overlap) = escape-hatch
  use-case (F3); zero-score floor stable-sort noise — not a production recall
  estimate (F5). Informed [D2c](../tickets/phase-misc/D2c-retrieve-tool-keep-regress.md).
- **Fidelity caveat**: ported `HybridRetriever` (embedder **bigram-only**
  tokenizer), NOT the actual default prefetch `Bm25Linker` (nl2sql-engine,
  unigram+bigram) — exact % may differ; qualitative stack conclusion stable.
  Settled by the 2026-08-21 D2e re-measurement below.
- **Probe**: `prototypes/d2c-retrieve-baseline/run_real_rbi.py`.

## 2026-08-21 — D2d re-frame probe (enrichment variants, §7 HybridRetriever port)

- **Setup**: same scope 10000147 / 31 gold cases. Probe =
  `prototypes/d2c-retrieve-baseline/probe_hypotheses.py` (self-contained; ports
  `HybridRetriever` + enriches the corpus `description` slot to faithfully
  simulate "enrich the production corpus feed via P6b ctx.schema ->
  retrieval-inproc RetrievalCorpusItem"). BM25-only (FakeHash is noise per F1).
  Variants: base / +params_fields (name+desc) / +terminology slang / +domain /
  params+term / all / topK sweep; each × {BM25-only, hybrid}.
- **Results** (BM25-only, the clean isolator):

  | variant | strict | loose | Δ vs base |
  |---|---|---|---|
  | base (id+desc+metrics; 1 event has metrics) | 41.9% | 41.9% | — |
  | +params_fields | 54.8% | 54.8% | +12.9pp (F4 confirmed) |
  | +terminology slang | 48.4% | 51.6% | +6.5pp (2nd bridge §7 missed) |
  | params+term (best) | 58.1% | 61.3% | +16-19pp |
  | +domain | 54.8% | 58.1% | **HURTS** (coarse name → false-pos, lost item.add/shop.buy) |
  | topK=20 | 51.6% | 51.6% | modest |
  | FakeHash-hybrid (any variant) | strictly < BM25-only | | F1 real-scale re-confirmed |

- **Verdict**: retrieval-quality problem is a **3-layer gap stack** (not §7's
  single-cause F4): (i) FakeHash-as-default self-harm [config] (ii) thin
  corpus-feed [data] (iii) CJK synonym semantic gap [needs real embedder].
  cheap-fix ceiling = BM25-only + params + term = 58.1% strict << 85-90% bar →
  keep (b) re-confirmed on corrected basis; flip needs real embedder. Informed
  [D2d](../tickets/phase-misc/D2d-retrieval-quality-reframe.md); graduated
  [D2e](../tickets/phase-misc/D2e-corpus-enrichment.md).
- **Fidelity caveat (same as D2c)**: HybridRetriever port (bigram-only
  tokenizer); real default is Bm25Linker (unigram+bigram). Settled by the D2e
  re-measurement below.
- **Probe**: `prototypes/d2c-retrieve-baseline/probe_hypotheses.py`.

## 2026-08-21 — D2e Bm25Linker-fidelity re-measurement (the REAL default path)

- **Setup**: same scope 10000147 / 31 gold cases. Probe extension =
  `probe_hypotheses.py` `main_linker_fidelity` — faithful port of the shipped
  `Bm25Linker` (`packages/data/nl2sql-engine/src/bm25-linking.ts`): tokenize =
  ASCII id + CJK **unigram AND bigram**; BM25Okapi k1=1.5/b=0.75, idf
  `log(1+(n-d+0.5)/(d+0.5))` (Lucene, always >0); `score>0` filter (no
  zero-score floor noise); FIELD_WEIGHTS `{name:3,description:1}`, metric×1.
  Variants: base/params/term/params+term (pack-into-description ×1) + a
  weighting variant (params+term×3, simulating FIELD_WEIGHTS weighting = BM25
  token repetition) + topK sweep — all BM25-only on the real default path.
- **Results** (Bm25Linker / BM25-only):

  | variant | strict | loose |
  |---|---|---|
  | base | 41.9% | 41.9% |
  | +params_fields | 51.6% | 51.6% |
  | +terminology | 64.5% | 64.5% |
  | params+term (pack ×1) | **54.8%** | **58.1%** |
  | params+term×3 (weighted) | 54.8% | **54.8%** ← weighting HURTS loose |
  | base topK=10 | 58.1% | 58.1% |
  | base topK=20 | 64.5% | 67.7% |

- **Tokenizer reconciliation** (params+term, BM25-only):
  - HybridRetriever port (bigram-only, §7): 58.1% strict / 61.3% loose
  - Bm25Linker (unigram+bigram, real default): 54.8% strict / 58.1% loose
  - The ~3pp gap conflates 4 diffs — tokenizer (bigram-only vs unigram+bigram),
    idf (`max(0,log)` vs `log(1+x)`), `score>0` floor filter, field weights
    (`{id:3,desc:1,metric:4}` vs `{name:3,desc:1,metric×1}`); the latter 3 are
    negligible for this 1966-event corpus (1 event has metrics; idf differs only
    for >50%-df tokens). The §7 port **overestimates ~3pp** via bigram-only +
    floor noise.
- **Verdict**:
  1. **Mapping form = pack-into-description ×1** (probe-measured best). Weighting
     (×3) refuted — equal-strict, worse-loose (BM25 tf-saturation + length
     normalization dilutes id/desc). The "weighting might be higher" hypothesis
     was disproven by measurement.
  2. **D2d tokenizer-fidelity caveat quantified**: real default floor = 54.8%
     strict / 58.1% loose (NOT the §7 port's 58.1%/61.3% — overestimated ~3pp).
     Qualitative stack conclusion stable; honest cheap-fix ceiling ≈ 54.8/58.1
     on the real default. Still <<85-90% → keep (b) unaffected.
  3. **term-only anomaly (not shipped)**: 64.5% on real default but 48.4% on the
     §7 port — rank FLIPS across tokenizers → 31-case small-sample noise, not a
     robust signal. params+term raises the floor on BOTH tokenizers (robust) →
     shipped. term-only + topK tuning deferred to a larger-case-set re-test
     ([D2g](../tickets/phase-misc/D2g-corpus-recall-larger-caseset-retest.md)).
- **Informed**: [D2e](../tickets/phase-misc/D2e-corpus-enrichment.md) (mapping
  form + content + tokenizer-fidelity reconciliation). The shipped enriched
  corpus faithfully reproduces the `params+term` variant → 54.8/58.1 applies to
  shipped code.
- **Probe**: `prototypes/d2c-retrieve-baseline/probe_hypotheses.py` (commit
  f4addb12c9); run `cd ~/workspace/reverse-bi && uv run python <path>`.

## 2026-08-21 — D2g larger-case-set re-test (term-only / topK robustness)

- **Setup**: reverse-bi ALL 5 scopes (10000147 + 10000251 + 10000312 + 10000329 +
  10000334) = 4217-event corpus (1966 + 446 + 1468 + 314 + 23), 205 eval cases
  (37 + 49 + 47 + 48 + 24), **113 with-derivable-gold** (31 + 18 + 25 + 18 + 21;
  gold derived from `expected.sql` `event='X'` + `event IN (...)` — same method
  as D2e/D2c). Probe extension =
  `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py`
  — copies the faithful `Bm25Linker` port from `probe_hypotheses.py`
  `main_linker_fidelity` (CJK unigram+bigram tokenizer, BM25Okapi k1=1.5/b=0.75,
  Lucene idf `log(1+(n-d+0.5)/(d+0.5))`, `score>0` filter, FIELD_WEIGHTS
  `{name:3,description:1}`, metric×1) + the variant builders (pack-into-description
  ×1) + gold derivation, generalized to a per-scope `scope` arg + aggregate.
  Variants: base / +params_fields / +terminology (term-only) / params+term (pack
  ×1, the shipped D2e form) + topK sweep (5/10/20/30) on base/term/params+term —
  all BM25-only on the REAL Bm25Linker default (NOT the §7 HybridRetriever port).
  Goal: settle whether D2e's term-only 64.5%-vs-48.4% cross-tokenizer flip was
  31-case noise or a robust signal, and whether topK tuning changes it.

- **Results** (Bm25Linker / BM25-only; per-scope topK=5):

  | variant | scope | strict | loose | coverage |
  |---|---|---|---|---|
  | base | 10000147 | 13/31=41.9% | 41.9% | 41.9 |
  | params | 10000147 | 16/31=51.6% | 51.6% | 51.6 |
  | term | 10000147 | 20/31=64.5% | 64.5% | 64.5 |
  | params+term | 10000147 | 17/31=54.8% | 58.1% | 56.5 |
  | base | 10000251 | 13/18=72.2% | 72.2% | 72.2 |
  | params | 10000251 | 72.2% | 72.2% | 72.2 |
  | term | 10000251 | 15/18=83.3% | 88.9% | 86.1 |
  | params+term | 10000251 | 83.3% | 83.3% | 83.3 |
  | base | 10000312 | 17/25=68.0% | 68.0% | 68.0 |
  | params | 10000312 | 68.0% | 68.0% | 68.0 |
  | term | 10000312 | 19/25=76.0% | 76.0% | 76.0 |
  | params+term | 10000312 | 68.0% | 68.0% | 68.0 |
  | base | 10000329 | 15/18=83.3% | 88.9% | 86.1 |
  | params | 10000329 | 13/18=72.2% | 72.2% | 72.2 |
  | term | 10000329 | 17/18=94.4% | 94.4% | 94.4 |
  | params+term | 10000329 | 83.3% | 88.9% | 86.1 |
  | base | 10000334 | 13/21=61.9% | 71.4% | 67.9 |
  | params | 10000334 | 61.9% | 71.4% | 67.9 |
  | term | 10000334 | 16/21=76.2% | 85.7% | 82.2 |
  | params+term | 10000334 | 61.9% | 71.4% | 67.9 |

  Aggregate (all 5 scopes, topK=5, 113 gold — D2e had 31):

  | variant | strict | loose | coverage |
  |---|---|---|---|
  | base | 71/113=62.8% | 74/113=65.5% | 64.4 |
  | +params_fields | 72/113=63.7% | 65.5% | 64.8 |
  | +terminology (term-only) | **87/113=77.0%** | **90/113=79.6%** | 78.6 |
  | params+term (pack ×1, shipped) | 77/113=68.1% | 81/113=71.7% | 70.1 |

  topK sweep (aggregate):

  | variant | topK | strict | loose |
  |---|---|---|---|
  | base | 5 | 62.8% | 65.5% |
  | base | 10 | 70.8% | 75.2% |
  | base | 20 | 77.9% | 81.4% |
  | base | 30 | 78.8% | 84.1% |
  | term | 5 | 77.0% | 79.6% |
  | term | 10 | 82.3% | 85.8% |
  | term | 20 | **85.0%** | **87.6%** |
  | term | 30 | 85.8% | 89.4% |
  | params+term | 5 | 68.1% | 71.7% |
  | params+term | 10 | 78.8% | 83.2% |
  | params+term | 20 | 81.4% | 85.8% |
  | params+term | 30 | 81.4% | 86.7% |

  Per-case strict flips (term vs params+term, topK=5): term-only gained 13,
  params+term-only gained 3 (net term +10). term-only's gains are CJK-synonym
  bridges (道具产出→item.add, 道具消耗→item.use, 商城购买→shop.buy, 道具变动
  →game.item.change, 创角→game.role.create, 死亡→game.role.die) that
  params+term's extra param-field text dilutes via BM25 tf-saturation + length
  normalization. params+term's 3 gains are where the param field name itself
  disambiguates (user.login, recharge, dungeon.enter).

- **Verdict**: **(A) term-only ROBUST — the D2e flip was NOT 31-case noise.**
  On 113 gold cases (3.6x), term-only beats params+term by +8.9pp strict /
  +7.9pp loose at topK=5; term-only wins or ties strict in all 5 scopes; the gap
  persists at every topK (narrows from +8.9pp@5 to +3.6pp@20 but never reverses);
  net per-case flips +10. term-only is the higher-recall enrichment form on the
  shipped Bm25Linker (unigram+bigram) path. topK=20 still helps all variants
  (base +15.1pp; term +8.0pp; params+term +13.3pp) — term@topK=20 = 85.0/87.6 is
  the best overall. **D2e's shipped decision (params+term) is NOT reversed** —
  params+term stays shipped for its cross-tokenizer floor robustness (term-only
  was NOT re-measured on the §7 bigram-only port at scale, per the ticket's
  "real-default-only" scope; the 48.4% §7 flip remains untested at 113 cases).
  But a future build ticket is warranted: make term-only a selectable enrichment
  form and/or raise default topK toward 20, since on the actual shipped tokenizer
  term-only is robustly higher-recall. Mechanism = same as D2e's ×3-weighting-
  hurts-loose finding: param-field text dilutes the terminology-slang CJK-synonym
  bridge via BM25 tf-saturation + length normalization.

- **Fidelity**: faithful Bm25Linker port (CJK unigram+bigram, `log(1+x)` idf,
  `score>0`, `{name:3,desc:1,metric×1}`); the 10000147 per-scope row reproduces
  the D2e-audited numbers EXACTLY (base 41.9 / params 51.6 / term 64.5 /
  params+term 54.8-strict-58.1-loose), confirming port fidelity. Probe =
  `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py` (copies the port +
  variant builders + gold derivation verbatim from `probe_hypotheses.py`
  `main_linker_fidelity`, generalized to a per-scope `scope` arg + aggregate; BM25
  index built once per (scope,variant) and reused across the topK sweep —
  bit-identical to rebuilding since `search()` takes topK as a param). Multi-scope
  caveat: terminology.yaml coverage differs per scope (events-with-slang: 15/6/
  26/6/3 for scopes 10000147/10000251/10000312/10000329/10000334; 0.8%-13% of each
  scope's event corpus) — term-only's benefit scales with coverage but is positive
  in all 5 scopes. Slang injection is per-scope only (no cross-scope bleed),
  mirroring how the shipped Bm25Linker consumes a per-scope corpus feed. NOT
  re-measured: the §7 HybridRetriever bigram-only port (the 48.4% flip number) —
  all variants here are BM25-only on the REAL default, per the ticket.

- **Pointer**: [D2g](../tickets/phase-misc/D2g-corpus-recall-larger-caseset-retest.md)
  (resolve); probe = `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py`;
  run `cd ~/workspace/reverse-bi && uv run python <path>`. Supersedes the D2e
  term-only/topK open question; D2e's params+term decision stands.

## 2026-08-21 — D2f live-activation smoke (shipped corpus.ts over real RBI)

- **Setup**: SHIPPED tool-search execute path (getEnrichedLinker + D2f
  corpusVersion version-check) + shipped semantic-layer io
  (loadRetrievalCorpus / getCorpusVersion / loadEvents) + shipped Bm25Linker,
  over REAL RBI scope 10000147 (1966 events + terminology.yaml). ctx.schema =
  a shell delegating loadRetrievalCorpus/corpusVersion to the real io over RBI
  (the only mock; mirrors the tool-search spec S9 pattern). Base corpus for
  A/B = id + base-description only (no packed params_fields/slang). Probe =
  `prototypes/d2c-retrieve-baseline/d2f_live_activation_probe.ts` (tsx; run
  `cd <repo> && pnpm exec tsx <path>`).
- **Results** (verbatim from the probe):
  - [1] enriched corpus size: 1966. role.online base description = `玩家上线`;
    enriched description packs params_fields (roleId 角色id, fforce 战力,
    coinList.gold 充值元宝, ...) + terminology slang (日活, DAU, 留存 — the
    role.online-mapped slangs). slang "日活" packed? true | params "角色id"
    packed? true.
  - [2] A/B "充值": enriched top-1 = recharge (score 19.899); base recharge?
    yes (recharge base desc contains 充值 — the hit is enriched-BOOSTED, not
    enriched-only; enrichment packs 充值 ~4×: slang 充值 + params_field
    充值金额 + coinList.gold 充值元宝 + coinList.sendgold 充值赠送元宝 →
    higher tf → higher score). enriched top 10: recharge 19.899, rechargeerror
    16.429, recharge.material 15.349, recharge.takereturn 15.082, role.online
    13.795, gm.decgold 13.351, refund.process 12.626, rechargeact.getreward
    12.051, recharge.rcv 11.922, gmrecharge 11.039.
  - [3] params_field "角色" (hits via packed 角色id field): slgc.createuser
    0.932, te.quit 0.929, te.presettle 0.924, cha.autosu 0.922,
    ladder.chgscore 0.922.
  - [4] single-slang "日活" hits: user.login, sh.updatespeed,
    leaguegactive.add, fest.hummer, summerholiday.bath. role.online in these?
    false — the packed role.online doc is very long (~40 params_fields + slang)
    so BM25 length-norm dilutes its score and "活" matches activity events
    (fest/summerholiday) instead; role.online is NOT a clean single-slang hit.
    Consistent with D2e's length-norm finding.
  - [verdict] activation CONFIRMED: enriched non-empty (1966) + slang+params
    packed (true) + 充值->recharge top-1 enriched (true).
- **Verdict**: the D2e shipped enriched corpus is LIVE at runtime — the
  shipped corpus.ts packs params_fields (field name + description) +
  terminology slang into the indexed description (visible in role.online: base
  `玩家上线` -> enriched with 角色id/战力/日活/DAU/留存 that the base lacks),
  and the SHIPPED tool-search execute path (getEnrichedLinker + D2f
  corpusVersion version-check) builds + caches the enriched Bm25Linker over the
  real 1966-event corpus. The cache-invalidation wiring (D2e-deferred) is
  TDD-verified (corpus.spec Test A io counter + Test B Service.corpusVersion;
  search-data-sources.spec S10 version-check rebuild). Informs
  [D2f](../tickets/phase-misc/D2f-activate-corpus-enrichment.md).
- **Fidelity caveat**: this is a SMOKE activation confirm (non-empty + packing
  visible + 充值->recharge top-1), NOT a full 31-case recall re-measurement. The
  floor (54.8% strict / 58.1% loose) is D2e-audited via probe_hypotheses.py
  (RBI-YAML-simulated, faithful python port of corpus.ts). This probe uses the
  SHIPPED TS corpus.ts over real RBI directly — same corpus.ts logic as the D2e
  simulation -> floor holds by construction; D2f did not re-run the 31-case
  measurement on live. The single-slang "日活"->role.online is NOT a clean hit
  (BM25 length-norm on the long packed doc); the full measurement accounts for
  this. The ctx.schema shell is the only mock (delegates to real io); a full
  bundle boot (real SemanticLayerService via cordis.patch.yml mount) is not
  exercised here — the Service.corpusVersion() method is TDD-verified directly
  (Test B) instead.
- **Probe**: `prototypes/d2c-retrieve-baseline/d2f_live_activation_probe.ts`.
