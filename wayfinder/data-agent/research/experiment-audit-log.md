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
