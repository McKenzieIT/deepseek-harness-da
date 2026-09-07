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

## 2026-08-21 — D2h live variant + topK wiring (shipped corpus.ts over real RBI)

- **Setup**: SHIPPED semantic-layer (`corpus.ts` `buildRetrievalCorpus` variant
  branching + `io.loadRetrievalCorpus` passthrough + `SemanticLayerService`
  `corpusVariant` config) + SHIPPED `tool-search-data-sources` execute
  (`getEnrichedLinker`, `defaultTopK` raised 5->20) + shipped `Bm25Linker`, over
  REAL RBI scope 10000147 (1966 events + terminology.yaml). A real
  `SemanticLayerService` (NOT a shell) carries the mount-time `corpusVariant`
  config -> `loadRetrievalCorpus` -> io -> `corpus.ts`; tool-search's
  `ctx.get('schema')` returns the Service. `ctx.reflect.provide` is the only mock
  (Service ctor; mirrors `corpus.spec` Test B). Probe =
  `prototypes/d2c-retrieve-baseline/d2h_variant_topk_probe.ts` (tsx; run
  `cd <repo> && pnpm exec tsx <path>`).
- **Results** (verbatim from the probe):
  - [1] default (params+term) Service — role.online: base description `玩家上线`;
    enriched packs params (角色id etc. ~40 fields incl serverId/roleId/coinList.*)
    + slang (日活/DAU/留存). params "角色id" packed? true | slang "日活" packed?
    true. corpusVariant config: params+term.
  - [2] term-only Service — role.online: enriched description = `玩家上线 日活
    DAU 留存` (desc + slang ONLY, NO params). params "角色id" packed? false |
    slang "日活" packed? true. corpusVariant config: term-only. variant switched
    the corpus? true.
  - [3] default topK (no top_k) — 充值 query: params+term 20 candidates /
    term-only 20 candidates (cap <=20; pre-D2h default was 5 -> would be <=5).
    params+term top-1: recharge (score 19.899) | term-only top-1: recharge
    (score 19.445).
  - [4] D2g bridge signals (top-1 params+term vs term-only):
    "道具产出" (D2g maps to item.add): params+term top-1=hallow.onekey |
    term-only top-1=slgc.drawmineresource.
    "商城购买" (D2g maps to shop.buy): params+term top-1=leagueguild.rndshopbuy
    | term-only top-1=shop.buy.
    "创角" (D2g maps to game.role.create): params+term top-1=guild.create |
    term-only top-1=guild.create.
  - [verdict] D2h wiring CONFIRMED: default packs params+slang (true) +
    term-only drops params keeps slang (true) + variant switches corpus (true).
- **Verdict**: the D2h build is LIVE on the shipped code over real RBI — the
  mount-time `corpusVariant` config threads config -> Service -> io -> `corpus.ts`
  (term-only drops the `params_fields` slice, keeps desc + slang; default
  params+term preserves the D2e-shipped form), and the default prefetch topK is
  raised 5->20 (a 充值 query returns 20 candidates, not 5). The
  `商城购买`->shop.buy bridge is a LIVE confirmation of the D2g verdict (A)
  mechanism: term-only's slang bridge ranks the expected event higher while
  params+term's extra param-field text dilutes it via BM25 length-norm
  (params+term retrieves leagueguild.rndshopbuy instead). Informs
  [D2h](../tickets/phase-misc/D2h-corpus-term-only-selectable-topk.md).
- **Fidelity caveat**: this is a SMOKE build-wiring confirm (variant switches
  packed slices + topK=20 cap + 1 live bridge signal), NOT a 113-case recall
  re-measurement. The recall numbers (term-only 77.0% strict / term@topK=20
  85.0% / params+term 68.1% / 81.4%) are D2g-audited via
  `d2g_larger_caseset.py` (a faithful python port of `corpus.ts` = `corpus.ts`
  logic) -> hold by construction; this probe exercises the shipped TS
  `corpus.ts` variant branching directly over real RBI. The
  `道具产出`/`创角` bridges do NOT resolve on scope 10000147 (item.add /
  game.role.create likely absent or slang-missing in this scope; D2g bridges
  span 5 scopes, 10000147 has 15 events-with-slang). The real bundle boot
  (`SemanticLayerService` via `cordis.patch.yml` mount) is not exercised here —
  the corpusVariant config -> Service -> io path is TDD-verified directly
  (`corpus.spec` Service-config test). The single live bridge (shop.buy) is
  corroboration, not a measured recall floor.
- **Probe**: `prototypes/d2c-retrieve-baseline/d2h_variant_topk_probe.ts`.

---

## E-DA4 — delegate_query Nl2sqlEngine feasibility probe

**Date**: 2026-08-26
**Ticket**: [E-DA4](../tickets/phase-misc/E-DA4-delegate-query-engine-probe.md)
**Probe**: `packages/data/tool-scope-routing/dev/delegate-probe.ts`

### Setup

Standalone probe script verifying P-DA4's decision to use direct `Nl2sqlEngine`
instantiation for `delegate_query` (rather than subagent/independent Cordis root).
Five experiments exercised against the X63 (overseas-prod, `hdyl_data_sg`) and K11
(domestic-prod, `ieu_ods`) semantic layers using scripted LLM + StandInOdps.

### Data (verbatim output)

```
Experiment 1: corpus size=23, top hit: game.role.online(21.10) — correct
Experiment 2: critic REJECTS without event_view injection; PASSES with augmented corpus
Experiment 3: X63=overseas-prod/hdyl_data_sg, K11=domestic-prod/ieu_ods — distinct
Experiment 4: conventions load, buildPrompt length=4292 chars, all config assertions pass
Experiment 5: Promise.all parallel run — both ok, no cross-contamination
Result: 24/24 assertions passed
```

### Verdict

**P-DA4 approach confirmed viable.** Direct `Nl2sqlEngine` instantiation per-scope
works end-to-end with independent corpus/linker/deps. Key implementation requirement
surfaced:

1. **Critic candidateTables injection**: The engine's `table_not_in_candidates` critic
   rule rejects SQL referencing the event view (`ods_10000334_all_view`) because event
   corpus items use event names (`game.role.online`) as IDs. Fix: `delegate_query` must
   inject the scope's `event_view.view_name` as a synthetic corpus item before building
   the `Bm25Linker`. This is a one-line augmentation, not an architectural change.

2. **ODPS cross-workspace**: workspace-qualified SQL (`hdyl_data_sg.ods_10000334_all_view`)
   is the routing signal. If overseas-prod and domestic-prod use different ODPS endpoints,
   a per-scope `OdpsExecutor` config adapter is needed — complexity uplift but not a blocker.

### Fidelity caveat

- Uses `ReplayLlm` (scripted SQL) + `StandInOdps` — proves pipeline wiring, not
  real LLM generation quality or real ODPS execution.
- X63 corpus is events-only (23 items, no DWS tables); K11 corpus has 445 items
  including tables. The probe confirms isolation, not recall parity.
- Real ODPS cross-workspace execution (experiment 3) requires live MaxCompute
  credentials for both environments — deferred to integration testing.

## 2026-09-03 — pass^k semantics re-baseline (preliminary, 30-case subset)

**Semantics change**: `runner.ts` `bestOfKVerdict` -> `passKVerdict` (any->every: all k attempts must pass for `correct`) + `executionMatch` defaults to `false` when neither executor nor sqlJudge can verify (was `true`). Both changes landed + committed.

**Result (30-case subset of k11-v2, pass-k=3, aga/qwen3.7-max, SQL semantic judge enabled)**:
- pass_rate = **63.3%** (19 correct / 30 total, 11 wrong, 0 declined, 0 infra_failure)
- Results JSON: `eval-results/a4fbd262-202d-4a5f-bfb1-f754ce07e60b.json`
- vs best-of-k baseline 73.8% (168 cases): -~10pp — the flakiness pass^k is designed to expose (best-of-k: any-of-3 passes; pass^k: all-3 must pass).

**Root cause + fix (credentials seam)**: the re-baseline initially returned "no content" for every case. Root cause: the eval CLI's Cordis ctx did not mount a credential provider -> `ctx.get('credentials')=undefined` -> llm-dashscope `resolveApiKey` fell back to `process.env.DASHSCOPE_API_KEY` (unset after the gate-fix that reads `~/.dsh/.credentials.yaml` instead) -> `MISSING_CREDENTIAL` -> the llm/stream waterfall masked the throw as an empty response. **Not** an AGA non-SSE issue (AGA streams SSE via the adapter's `X-DashScope-SSE: enable` header; an earlier curl probe without that header misdiagnosed it). Fix: mount `LocalCredentialProvider` in `context.ts:boot()` (engine responder ctx) + `main.ts` judge ctx + harness-responder, + add `static override name='credentials'` to `LocalCredentialProvider` so programmatic `ctx.plugin()` registers it under the `credentials` service name. -> resolveApiKey reads `~/.dsh/.credentials.yaml` via the seam -> key resolved -> AGA SSE -> SQL generated -> pass^k verdict. No `process.env` involved (intranet-security-first).

**Pending**: full 168-case pass^k re-baseline (the 30-case subset is preliminary; the full run was interrupted at 100/168 when the long session's background shell was reaped). Debug logs (`console.error('[ADAPTER-DBG]...')` in adapter.ts/index.ts/harness-responder.ts) to be cleaned + rebuilt.

## 2026-09-03 — pass^k 168-case re-baseline (DEFINITIVE, post-contamination-rerun)

**Semantics**: `runner.ts` `passKVerdict` (all k=3 attempts must pass for `correct`) + `executionMatch=false` when neither executor nor sqlJudge can verify. Both landed + committed (unchanged from the 30-case preliminary).

**Setup**: K11-v2 full 168 cases, `--pass-k 3 --concurrency 4 --provider aga --model qwen3.7-max --skip-health-gate`, SQL semantic judge enabled, `--responder engine`, `--scope-id k11`, qwen3.7-max (thinking model). Three result artifacts:
- `rebaseline-passk-168.json` — the initial conc=4 full run (contaminated, raw).
- `rebaseline-contam-rerun.json` — the 63 contaminated cases rerun clean at conc=4 (0 no-content).
- `rebaseline-passk-168-merged.json` — the definitive merge (105 genuine cases from the initial run + 63 clean rerun).
Credentials via `LocalCredentialProvider` seam (`~/.dsh/.credentials.yaml`), NOT `process.env` (intranet-security-first).

**Results (DEFINITIVE merged, 168 cases)**:

| Category | Cases | Correct | Rate |
|---|---|---|---|
| Original | 80 | 48 | 60.0% |
| Alias | 40 | 16 | 40.0% |
| Voice EXEC | 30 | 14 | 46.7% |
| Voice DELIVERY | 18 | 10 | 55.6% |
| **Total** | **168** | **88** | **52.4%** |

- pass_rate = **52.4%** (88 correct / 80 wrong / 0 declined / 0 unjudged / 0 infra_failure)

**Contamination + correction (READ BEFORE CITING)**: The initial conc=4 run was contaminated by **recurring AGA empty-response bursts** under machine load (concurrency=4 AGA streams + Qoder IDE + `pnpm dsh web` (PID 21923) + a concurrent MCP-runner pod crash (`468ef200bdcd`)). 63/168 cases (38%) had ≥1 empty-attempt (all 48 Voice cases + 12 Alias + 3 Originals), **raw pass_rate=33.9%** (57/168) — deflated by infra, not model quality. **NOT the credentials-seam bug**: `LocalCredentialProvider` was mounted in `context.ts:boot()` + `main.ts` judge ctx (+ has `static override name='credentials'` at `packages/credentials/credentials-local/src/index.ts:208`), and 105 cases produced real SQL throughout (550 empty responses were AGA stream empties, not MISSING_CREDENTIAL — the seam resolved the key for 100+ real-SQL cases). The 105 clean cases (no empty attempts: 57 correct + 48 wrong) were verified genuine — the 48 wrong had real outputs (semantically-wrong SQL / legitimate Chinese declines like `无法回答该问题` / tool-call emissions like `<tool_call...>`), not infra-garble. The 63 contaminated cases were **rerun clean at conc=4** (`rebaseline-contam-rerun`, 0 no-content, 2547.7s, 31/63=49.2% correct) after AGA recovered post-bridge-restart, and merged with the 105 → **definitive 52.4%**.

**Contrast (verdict-semantics + protocol caveats)**:
- vs 30-case preliminary 63.3% (2026-09-03): full 168 is lower — the 30-case subset was easier (early originals).
- vs best-of-k 168-case 73.8% (`10320fe2`) / 88.1% (`exp4-arm-a`): **-21.4pp / -35.7pp** — the flakiness pass^k is designed to expose (best-of-k: any-of-3 passes; pass^k: all-3 must pass). These are NOT directly subtractable (different verdict semantics).
- vs pass^k contaminated raw 33.9%: the +18.5pp to 52.4% is the contamination correction (63 infra-failed cases → clean rerun).

**Verdict**: The definitive pass^k baseline for qwen3.7-max on K11-v2 (168 cases, SQL semantic judge, conc=4, no executor) is **52.4%**. This replaces the 30-case preliminary 63.3% (non-representative subset). It invalidates direct comparison with the best-of-k 73.8%/88.1% numbers (pass^k is strictly lower by design). The 63-case contamination is a measurement-fidelity warning: **eval runs at concurrency=4 under machine load are vulnerable to AGA empty-response bursts** — conc=1 (clean) is infeasible (~16h); future runs should use lower concurrency (conc=2-3) or ensure the machine is unloaded, AND the result JSON should record `verdict_semantics` + `concurrency` + `model` + `pass_k` (GA-EVAL-REBASELINE item 4 — `RunResult.config` field, still pending) so contaminated runs are detectable from the artifact, not just this audit log.

**Fidelity**: pass^k semantics (`passKVerdict` all-must-pass + `executionMatch=false`-when-unverifiable), both committed. SQL semantic judge enabled (default; threshold 0.6 = 3/5 dimensions). No executor (`query_result` null for all attempts — judge-only for EXEC cases; the 18 Voice DELIVERY cases scored by `delivery_match` alone, `result_value: null` → execution block skipped). The 63-rerun was conc=4 (same as original) post-AGA-recovery → 0 empties → clean; the 105 kept cases had 0 empty attempts → genuine. Merge = 105 kept + 63 rerun, `summary` recomputed. Merged artifact `rebaseline-passk-168-merged.json` carries `run_id`/`timestamp`/`cases`/`summary`/`merge_notes` — still NO `config` field (item 4 pending), so attribution still depends on this log entry.

**Pointer**: [GA-EVAL-REBASELINE](../tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md) (work item 2: re-run 168 cases under pass^k — resolved). Artifacts: `packages/eval/eval-cli/eval-results/rebaseline-passk-168.json` (contaminated raw, 33.9%), `…/rebaseline-contam-rerun.json` (63 clean rerun, 49.2%), `…/rebaseline-passk-168-merged.json` (definitive merged, 52.4%). Logs: `/tmp/eval-rebaseline.log` (initial run), `/tmp/eval-contam.log` (63-rerun).

## 2026-09-04 — GA-EVAL-CLEAN-RERUN item 1: uniform clean conc=3 pass^k 168-case baseline (DEFINITIVE single artifact, config-stamped)

**Semantics**: `runner.ts` `passKVerdict` (all k=3 attempts must pass) + `executionMatch=false` when unverifiable (unchanged from 2026-09-03 definitive).

**Setup**: K11-v2 full 168 cases, `--pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --today 20260903 --responder engine --scope-id k11`, SQL semantic judge enabled, **single uniform clean run (NO merge — replaces the 2026-09-03 hybrid)**. Concurrency=3 (user-chosen over the ticket's conc=4): after stopping `pnpm dsh web` (PID 21923) + the orphaned probing Chrome, machine load was still ~5 — dominated by AliEntSafe security scan (~62% CPU, root-owned, unkillable) + DingTalk + the real Chrome; conc=4 under this unkillable load risked the mid-run AGA empty-burst that contaminated 63/168 on 2026-09-03 (the ticket's first-poll gate can't catch mid-run bursts). conc=3 honors the README "prefer 2-3" the prior session wrote, and pass^k per-case concurrency-independence keeps the verdict comparable. `--today 20260903` PINNED (not system date): the 2026-09-03 hybrid used system date 9/3 = 20260903 (k11v2_001 SQL `ds='20260902'` = yesterday-from-9/3); on 9/4 system date would shift "yesterday"→9/3 (`ds='20260903'`), breaking date-relative-case comparability — pinning 20260903 replicates the prior protocol's date resolution exactly (a 1-case smoke confirmed: ds='20260903' still returned the expected 1500000 for k11v2_001, so the data is date-stable here, but pinning removes the variable for all 168). Credentials via `LocalCredentialProvider` seam (`~/.dsh/.credentials.yaml`), NOT process.env.

**Results (single clean artifact `rebaseline-passk-168-clean.json`, 587KB, config-stamped)**:

| Category | Cases | Correct | Rate |
|---|---|---|---|
| Original | 80 | 54 | 67.5% |
| Alias | 40 | 20 | 50.0% |
| Voice EXEC | 30 | 19 | 63.3% |
| Voice DELIVERY | 18 | 11 | 61.1% |
| **Total** | **168** | **104** | **61.9%** |

- pass_rate = **61.9%** (104 correct / 64 wrong / 0 declined / 0 unjudged / 0 infra_failure)
- **config field (GA-EVAL-REBASELINE item 4 anti-recurrence, LIVE)**: `{provider:"aga", model:"qwen3.7-max", pass_k:3, concurrency:3, sql_judge:true, verdict_semantics:"pass^k", responder:"engine", scope_id:"k11", today:"20260903", query_expansion:true, with_query:false, skip_health_gate:true}` — all 12 RunConfig fields; the run's protocol/semantics/concurrency/date are self-describing from the artifact (a contaminated or mis-attributed run is now detectable from its JSON alone — the exact gap that made the 2026-09-03 63-case contamination undetectable from the artifact).

**Contamination (0 AGA burst)**: 3 scattered empty attempts across 504 (0.6%) — k11v2_025 (attempt 2), k11v2_voice_017 (attempt 3), k11v2_voice_042 (attempt 2); 3 distinct cases, NOT clustered. This is normal AGA flakiness (an occasional empty response), NOT the 2026-09-03 contamination burst (63/168 = 38%, clustered under conc=4+IDE+dsh web+MCP pod crash). The artifact is a single clean conc=3 artifact with no burst contamination (monitored truly-empty across ~20 polls, all 0).

**vs 2026-09-03 hybrid 52.4%**: **+9.5pp** (61.9% vs 52.4%). Two-sample 95% MDE at n=168 ≈ 10.5pp → +9.5pp is WITHIN MDE (not statistically significant; on the high end). Per-category deltas all within their per-category MDE (Original +7.5pp/n=80, Alias +10.0pp/n=40, Voice EXEC +16.7pp/n=30, Voice DELIVERY +5.6pp/n=18 — small n → wide MDE). The uniform positive shift across all 4 categories is consistent with (a) model non-determinism — pass^k amplifies per-attempt variance, and the 2026-09-03 run happened to be a lower sample — and (b) conc=3 producing cleaner AGA responses than the prior conc=4 hybrid (less concurrency contention → fewer subtle quality degradations), since the prior conc=4 ran under IDE + dsh web + MCP-pod-crash load while this conc=3 ran with dsh web stopped + AGA stable. NOT a protocol/semantics/schema/prompt change (verified: schema/engine/prompt clean in git; cfbb710b50→990b93b6c6 unchanged for examples/k11-semantic-layer, nl2sql-engine, semantic-layer, system-prompt, agent).

**Build finding (IMPORTANT correction to GA-EVAL-REBASELINE item 4 / this ticket's prereq)**: `packages/eval/eval-runner/lib/index.js` was NOT stale w.r.t. item 4. The 2026-09-03 `tsc -b` emit (`lib/types/runner.js`, 9/3 22:21) already captured item-4's `passKVerdict` config-spread (`...options?.config !== void 0 ? { config: options.config } : {}`), and tsdown bundled it into `lib/index.js` (verified by grepping the bundle's runBatch result region). The ticket's verify `grep -c 'verdict_semantics' lib/index.js > 0` is WRONG: the `verdict_semantics` string lives in `eval-cli/src/main.ts:363` (RunConfig construction, tsx-live) + `eval-runner-service/index.ts:452`, NEVER in `eval-runner/runner.ts` (which only spreads `options.config`) — so eval-runner's bundle grep's 0 even when fresh. The CORRECT wiring (verified by a 1-case smoke + the 168-case artifact's config field): `main.ts:357-363` constructs RunConfig (12 fields incl `verdict_semantics:'pass^k'`) → `lib/index.js` runBatch spreads `config: options.config` into RunResult → `writeRunResult` JSON.stringifies it. **No rebuild was needed** — the 9/3 lib was already correct (a `pnpm build:lib:host` re-bundle produced byte-identical 31942-byte `lib/index.js`, confirming). The stale-lib prereq in GA-EVAL-REBASELINE's Resolution + this ticket was overcautious / based on a wrong grep verify.

**Phase 2 (--with-query executor) BLOCKED — code bug (see next entry for resolution)**: `--with-query` fails at boot with `Error: service "credentials" has been registered at <credentials>` (cordis duplicate-service throw). The throw-message was swallowed by `bin.ts`'s `console.error(err.message)` printing it as a log line (looks like a normal "credentials registered" log). Root cause: `context.ts:506` (`await ctx.plugin(EnvCredentialProvider)` in the withQuery branch) mounts a SECOND `name='credentials'` provider, duplicating the credentials-seam's `LocalCredentialProvider` mounted at `context.ts:476` (added for the AGA seam). The credentials-seam landing did NOT update the withQuery branch to skip the now-redundant EnvCredentialProvider (which is unused in `credMode:'sidecar-self'` — the sidecar self-auths from the maxc config). Phase 2 prep otherwise complete: `maxc` CLI 0.4.8 installed (`~/Library/Python/3.13/bin/maxc`); `~/.maxc/config_ieu_cdm.yaml` (project=ieu_cdm — all K11 scopes live in ieu_cdm per `maxc-sidecar.mjs` header) confirmed; real sidecar `maxc-sidecar.mjs` (spawns the `maxc` binary, REAL ODPS — "P4c maxc-backed MaxCompute sidecar, REAL ODPS via the local maxc CLI") + K11 wrapper `maxc-sidecar-k11.mjs` exist; the default `standin-sidecar.mjs` is a FAKE/mock (must NOT be used). Phase 2 command ready: `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml node src/bin.ts --with-query --sidecar .../maxc-sidecar-k11.mjs --run-id rebaseline-passk-168-exec ...` (MAXC_CONFIG must be set explicitly — the default `~/.maxc/config.yaml` is overseas hdyl_data_sg_dev, wrong for K11/ieu_cdm).

**Verdict**: The uniform clean conc=3 pass^k baseline for qwen3.7-max on K11-v2 is **61.9%** (104/168), a single clean config-stamped artifact (`rebaseline-passk-168-clean.json`) with 0 AGA-burst contamination (3 scattered empties = normal flakiness). It replaces the 2026-09-03 hybrid merge (52.4%) as the current pass^k baseline; +9.5pp is within the n=168 MDE (not significant; high-end, model variance + conc=3 cleanliness). Item 4's `config` field is LIVE in the artifact (anti-recurrence confirmed). Phase 2 (executor real-execution) is blocked by a credentials-seam duplicate-registration regression at `context.ts:506` — see the next entry for the fix decision + resolution.

**Pointer**: [GA-EVAL-CLEAN-RERUN](../tickets/phase-misc/GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) (item 1: uniform clean conc=3 — RESOLVED, 61.9% single clean config-stamped artifact). Artifact: `packages/eval/eval-cli/eval-results/rebaseline-passk-168-clean.json`. Logs: `/tmp/eval-clean.log` (full run), `/tmp/eval-smoke/smoke-config-check.json` (config-stamp verify smoke).

## 2026-09-04 — GA-EVAL-CLEAN-RERUN: uniform clean conc=3 pass^k baseline + executor real-exec viability

**Ticket**: [GA-EVAL-CLEAN-RERUN](../tickets/phase-misc/GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md)
**Artifacts**: `eval-results/rebaseline-passk-168-clean.json` (uniform clean); smoke `exec-smoke2` (with-query, /tmp/eval-exec-smoke/).

### Setup (uniform clean conc=3)

- **Cases**: K11-v2 full 168 (Original 80 / Alias 40 / Voice EXEC 30 / Voice DELIVERY 18).
- **Model/protocol**: aga/qwen3.7-max, `--pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --responder engine --scope-id k11 --today 20260903`, SQL semantic judge on. Single uniform run (no merge) — replaces the prior hybrid merge (`rebaseline-passk-168-merged`).
- **Concurrency=3** (not the ticket's 4): user-chosen — machine load was ~5 even after stopping `pnpm dsh web` (PID 21923) + the orphaned probing Chrome (PID 72652), dominated by an unkillable AliEntSafe security scan (~62% CPU, root). README's "prefer conc 2-3" + the prior conc=4-under-load contamination → conc=3. pass^k per-case concurrency-independent → verdict comparable.
- **--today 20260903 pinned**: the prior 52.4% run (9/3) used system date = 20260903 (yesterday→ds=20260902). Now system date is 9/4 → without --today, dates shift 1 day → not comparable to 52.4%. Pinned to replicate the prior protocol exactly (config.today records this; date-resolution identical: 昨天→20260902, 今天→20260903).
- **Credentials**: LocalCredentialProvider seam (~/.dsh/.credentials.yaml), not process.env. Machine unloaded as feasible (dsh web killed).
- **Build prerequisite was overcautious**: the ticket's "must `pnpm build` so lib/ stamps config" premise was wrong. The live CLI's `runBatch` (eval-runner lib/index.js) ALREADY contained the item-4 config spread (`...options?.config !== undefined ? {config: options.config} : {}`) from the 9/3 tsc emit; the ticket's verify `grep verdict_semantics lib/index.js > 0` was simply incorrect — `verdict_semantics` is constructed in eval-cli main.ts:363 (tsx-live, not in eval-runner's bundle) + eval-runner-service:452, NEVER in eval-runner/runner.ts. `pnpm build:lib:host` re-bundled to identical bytes (31,942), confirming the lib was already correct. A 1-case smoke verified config stamps end-to-end (12 fields).

### Results (uniform clean conc=3, 168 cases, SINGLE artifact with config)

| Category | Cases | Correct | Rate | vs prior 52.4% (merge) |
|---|---|---|---|---|
| Original | 80 | 54 | 67.5% | +7.5pp |
| Alias | 40 | 20 | 50.0% | +10.0pp |
| Voice EXEC | 30 | 19 | 63.3% | +16.7pp |
| Voice DELIVERY | 18 | 11 | 61.1% | +5.6pp |
| **Total** | **168** | **104** | **61.9%** | **+9.5pp** |

- pass_rate = **61.9%** (104 correct / 64 wrong / 0 declined / 0 unjudged / 0 infra_failure).
- **config field LIVE** (item 4 anti-recurrence): `{provider:aga, model:qwen3.7-max, pass_k:3, concurrency:3, sql_judge:true, verdict_semantics:'pass^k', responder:'engine', scope_id:'k11', today:'20260903', query_expansion:true, with_query:false, skip_health_gate:true}` — protocol/semantics/concurrency/model/date detectable from the artifact.
- **Contamination: 0 AGA burst** — 3 scattered empty attempts (k11v2_025 a2, k11v2_voice_017 a3, k11v2_voice_042 a2; 3 distinct cases, 3/504=0.6%, NOT clustered) → normal AGA flakiness, NOT the prior 63/168 burst. Single clean artifact, no merge/rerun needed.
- **vs prior 52.4%**: +9.5pp. Two-sample 95% MDE (n=168×2) ≈10.5pp → **not significant** (within noise). Positive shift across ALL 4 categories (uniform) → likely model non-determinism (pass^k amplifies any single failed attempt) + conc=3 cleaner AGA (less contention than the prior conc=4-under-load hybrid, which may have had subtle non-empty quality degradation). Per-category deltas all within their small-n MDE (Voice EXEC n=30 → MDE~18pp, +16.7pp within). CONSISTENT per the ticket's "within MDE" criterion.

### Phase 2 (executor real-exec, --with-query) — NOT viable on k11-v2

**Setup**: `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml --with-query --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs` (maxc CLI 0.4.8; config_ieu_cdm.yaml project=ieu_cdm — K11's project, per maxc-sidecar.mjs header "all 5 scopes live in the ieu_cdm project"). The DEFAULT standin-sidecar.mjs is a FAKE/mock ("PROTOTYPE STAND-IN ... owns no real ODPS connection ... Fakes ODPS behavior") — must use `--sidecar maxc-sidecar-k11.mjs` (wrapper → real `maxc-sidecar.mjs`: spawns the `maxc` binary, REAL ODPS). MUST set `MAXC_CONFIG` explicitly (else context.ts defaults to ~/.maxc/config.yaml = overseas hdyl_data_sg_dev, wrong project).

**Bug found + fixed (code change to committed context.ts)**: `--with-query` boot CRASHED. context.ts:476 (credentials seam) mounts `LocalCredentialProvider` (static name='credentials'); the withQuery branch (context.ts:506) ALSO mounted `EnvCredentialProvider` (same name='credentials') → cordis threw `service "credentials" has been registered at <credentials>` → --with-query broken (bin.ts's catch printed only `err.message`, which == the cordis throw text, so it looked like a normal log line — silent failure). **Regression from the credentials-seam landing**: the seam added LocalCredentialProvider (1b) but did not drop the now-redundant EnvCredentialProvider in the withQuery branch. **Fix**: removed the EnvCredentialProvider class + CredentialProvider import + `ctx.plugin(EnvCredentialProvider)` mount from context.ts:489-506 (in credMode 'sidecar-self' the maxc sidecar self-auths from its own config — `set_credentials` is a no-op — so no creds are pushed; `ctx.credentials` from the seam satisfies MaxComputeQueryEngine's `static inject=['credentials']`, unused in sidecar-self). Verified: `--with-query` boot now reaches "Query engine mounted (sidecar ready)" + real execution (smoke k11v2_001: `query_result=[[26770]]`, `config.with_query=true`).

**Real-exec path WORKS but k11-v2 expected values are NOT real-exec-derived** → a full Phase 2 real-exec baseline on k11-v2 is NOT meaningful. Evidence (k11v2_001: expected `total_pay_amt=1500000`, covered_assets=`dws_10000251_com_pay_order_df`):
- `SUM(pay_amt) FROM com_pay_order_df WHERE ds='20260902'` → 13,604,855,432 (13.6B)
- `SUM(pay_amt) FROM pay_order_di` → 26,770; `pay_order_act_di` → 26,770; `acc_summary_df pay_amt_std` → null
- `COUNT(*) FROM com_pay_order_df` → 2,975,826; `AVG(pay_amt)` → 4,571.79
- NONE = 1,500,000; no clean unit conversion (ratio ~9069×). Probed ds=20260902/20260805/20260831/20260901/20260830 — all ~13.5-13.6B (none 1.5M).
- k11-v2 case yamls have NO `expected.sql` field (only `result_value`) — vs the RBI eval (`eval_10000251_037`, `maxc-smoke.mjs`) which HAS expected SQL + real-exec matches (dau=4336, anchor 20260806).
→ k11-v2 is a JUDGE-ONLY eval (expected values are semantic targets/placeholders, not real-exec-derived). A full `--with-query` run would score ~0% (expected unachievable by any reasonable SQL) — NOT the ticket's intended "judge false-pass rate" (real-exec ≤ judge-only; gap = judge leniency). SQL probes are sufficient evidence; the full ~3h run was NOT executed.

### Verdict

1. **Uniform clean conc=3 pass^k baseline = 61.9%** (104/168, single artifact with config, 0 burst contamination). Within MDE of prior hybrid 52.4% (+9.5pp, not significant) → REPLACES the merge as the clean single-artifact baseline. **Phase 1 SUCCESS.**
2. **Phase 2 (--with-query) NOT viable on k11-v2**: the credentials-seam regression is fixed (context.ts code change) + the real-exec path is verified working (smoke: real ODPS query_result), BUT k11-v2's expected result_values are not real-exec-derived (judge-only semantic targets; no expected.sql; k11v2_001's 1.5M unachievable by any reasonable SQL) → a real-exec baseline would be ~0% (expected unachievable), not a judge false-pass rate. **Phase 2 needs a real-exec-derived case set** (the RBI eval `eval_10000251_*` has one — expected.sql + real-exec match; k11-v2 does not). Recommendation: re-scope Phase 2 to the RBI eval case set, OR add real-exec-derived `expected.sql` to k11-v2.

### Fidelity

- pass^k semantics (`passKVerdict` all-must-pass + executionMatch=false-when-unverifiable), committed. SQL semantic judge on (threshold 0.6). Phase 1 with_query=false (query_result null; execution_match from judge). Phase 2 smoke with_query=true (real ODPS via maxc CLI, ieu_cdm project).
- Item-4 config field LIVE on both artifacts: 12 fields, verdict_semantics='pass^k', today, with_query, concurrency — anti-recurrence effective (exec-smoke config shows with_query=true, distinguishing it from judge-only).
- **Code change (committed this session)**: context.ts withQuery branch (removed EnvCredentialProvider duplicate, line 488-506) — a real bug fix (--with-query was broken for ALL uses, not just k11-v2); needed for any future real-exec run. Well-commented (line 491); reversible. Committed this session (GA-EVAL-CLEAN-RERUN).

### Pointer

[GA-EVAL-CLEAN-RERUN](../tickets/phase-misc/GA-EVAL-CLEAN-RERUN-uniform-clean-and-executor-baseline.md) (Phase 1 resolved; Phase 2 re-scoped — not viable on k11-v2, needs a real-exec-derived case set). Artifacts: `eval-results/rebaseline-passk-168-clean.json` (uniform clean, 61.9%); `/tmp/eval-exec-smoke/exec-smoke2.json` (with-query smoke, k11v2_001, real query_result=`[[26770]]`). Logs: `/tmp/eval-clean.log` (Phase 1 full run), `/tmp/eval-exec-smoke2.log` (Phase 2 smoke). Code fix: `packages/eval/eval-cli/src/context.ts:488-506`.

## 2026-09-04 — GA-EVAL-REAL-EXEC: executor real-exec baseline on RBI real-exec-derived case set + judge false-pass gap

**Ticket**: [GA-EVAL-REAL-EXEC](../tickets/phase-misc/GA-EVAL-REAL-EXEC-real-execution-baseline.md)
**Artifacts**: `eval-results/rebaseline-real-exec-rbi-10000251.json` (real-exec, 39 EXEC cases, 144KB); smoke `real-exec-smoke-037` (/tmp/eval-real-exec-smoke/).

### Setup

- **Cases**: RBI scope 10000251 real-exec-derived case set (`/Users/mckenzie/workspace/reverse-bi/eval-cases/10000251/` — the canonical reverse-bi RBI eval). **39 EXEC cases** (scalar_exact, `expected.result_value={value:N}` derived from `expected.sql` against real ODPS ieu_cdm, anchor 20260806) — curated into `packages/eval/eval/cases/rbi-10000251-exec/` (copies; the loader's name regex + zod schema exclude the 6 clarify/non-numeric cases: 047/058 are `behavior:clarify` with no result_value → not execution-matchable; ta01-04/synth_* are non-digit-suffix → excluded by `globCasePaths`). Each case has `expected.sql` (reference, unused by the da — the model generates its own SQL) + `expected.result_value.value` (the real-exec-derived comparison target) + `meta.anchor_ds:20260806`.
- **Model/protocol**: aga/qwen3.7-max, `--pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --responder engine --scope-id 10000251 --today 20260806`, SQL semantic judge on. `--with-query` + `--sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs` (real maxc-sidecar.mjs → spawns `maxc` CLI 0.4.8, REAL ODPS via ieu_cdm; the default standin-sidecar.mjs is a MOCK). `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml` (project=ieu_cdm — K11 lives in ieu_cdm per maxc-sidecar.mjs header; the default ~/.maxc/config.yaml is overseas hdyl_data_sg_dev, wrong; the k11 wrapper pushes .bak as a 2nd --maxc-config but arg() takes the first = MAXC_CONFIG). `--today 20260806` PINNED = the case set's anchor (meta.anchor_ds; ds_yesterday=20260805 — verified by maxc-smoke: case 037 → dau=4336). `--scope-id 10000251` (RBI cases carry scope_id 10000251; K11 = scope 10000251; the CLI default 'k11' is the k11-v2 alias).
- **Credentials**: LocalCredentialProvider seam (~/.dsh/.credentials.yaml, DASHSCOPE_API_KEY), not process.env. Machine load ~5 (conc=3 — prior session proved conc=3 tolerates this load; conc=4 under load triggers AGA empty-bursts).
- **Pre-flight verification (smoke, 1-case pass-k=1, case 037)**: `--with-query` boots (context.ts EnvCredentialProvider-duplicate fix from GA-EVAL-CLEAN-RERUN holds — no crash); sidecar mounts with real config; model generated alternate SQL `SELECT SUM(CASE WHEN act=1 THEN 1 ELSE 0 END) AS dau FROM dws_10000251_univ_acc_summary_di WHERE ds='20260805'` → executor returned `[[4336]]` → `execution_match=true` (REAL value comparison, not SQL-text); `sql_judge.score=1.0` (dual-score, execution-blind); `config.with_query=true` + all 12 item-4 fields. Smoke PASS in 82.7s.

### Methodology — dual-score derives the judge ceiling + false-pass gap from ONE run

The runner (`eval-runner/src/runner.ts executeAttempt`) dual-scores every attempt when `--with-query`: it (1) **executes** the model's SQL → `execution_match = checkResultMatch(rows, expected.result_value, match_mode)` (REAL), AND (2) independently runs `sqlJudge.judgeSql({question, generated_sql, schema_context})` — **NO query_result passed** → the judge is execution-BLIND. Since the engine responder's SQL-gen is independent of `--with-query` (the executor mounts post-gen), the judge scores identical SQL to a standalone `--with-query-off` run. So the judge ceiling + the false-pass gap are derivable from the real-exec run's own `sql_judge` fields — a separate judge-only run would produce identical judge scores at 2× LLM cost + AGA-burst risk. (Verified 0 infra failures in the run → the dual-score is clean; `infra_failure` cases are excluded from the gap as contamination, not judge false-pass.)

### Results (real-exec, 39 EXEC cases, SINGLE config-stamped artifact `rebaseline-real-exec-rbi-10000251.json`)

- **real-exec pass_rate**: **5/39 = 12.8%** (verdict=correct; execution_match = model SQL → real ODPS ieu_cdm → compare to `expected.result_value.value` via `scalar_exact`; pass^k = all-3-must-pass).
- **judge pass_rate (dual-score, execution-blind ceiling)**: **19/39 = 48.7%** (all-k `sql_judge.score ≥ 0.6`; the judge is execution-BLIND — `judgeSql` takes `{question, generated_sql, schema_context}`, no `query_result` → identical to a standalone judge-only run on the same SQL).
- **gap = judge false-pass rate**: **14/39 = 35.9pp** (judge passed AND verdict='wrong' — judge semantically passed but the real-executed value was wrong). real-exec ≤ judge-only (12.8% ≤ 48.7%) ✓ as the ticket expected. Equivalently, 14/19 = **73.7% of the judge's passes are false** (real-exec value wrong) — the judge over-counts correctness by 35.9pp on this case set.
- **infra_failure**: **0/39** (clean run — 0 ODPS/infra contamination; 0 empty-SQL throughout = NO AGA empty-burst, unlike the 2026-09-03 conc=4 contamination).
- **real-exec wrong (value mismatch)**: 34/39 = 87.2% (= 14 judge false-pass + 20 both-fail). The 20 both-fail include cases where the model emitted RBI tool-call format instead of SQL (see characteristic below) — these fail BOTH real-exec + judge, so they are NOT judge false-passes.
- **unjudged**: 0/39.

Per-intent (query_intent from case `dimensions`; pass^k all-must-pass):

| intent | total | real pass | judge pass | gap (false-pass) | infra |
|---|---:|---:|---:|---:|---:|
| metric_lookup | 23 | 3 | 10 | 7 | 0 |
| proportion | 11 | 2 | 7 | 5 | 0 |
| ranking | 3 | 0 | 1 | 1 | 0 |
| trend | 2 | 0 | 1 | 1 | 0 |
| **Total** | **39** | **5** | **19** | **14** | **0** |

Judge false-pass case_ids (14 — judge passed but real-executed value wrong): `eval_10000251_040`, `_043`, `_044`, `_049`, `_050`, `_054`, `_055`, `_056`, `_060`, `_120`, `_123`, `_128`, `_135`, `_138`.

**Non-SQL emission characteristic (notable, NOT contamination) — ROOT CAUSE CONFIRMED**: ~40/117 = 34% of attempts emitted RBI tool-call format (`{"name":"load_event_definition","arguments":{"event_name":"game.role.create"}}`, `<tool>search_data_sources("...")</tool>`, `call:default_api:load_event_definition{...}`) instead of SQL. **Root cause**: `packages/data/nl2sql-engine/src/prompt.ts` (the SQL-gen prompt) explicitly describes `search_data_sources` (line 89) + `load_event_definition` (line 90, 119, 150-153) as tools — but the engine responder (`--responder engine`) **pre-fetches** these (BM25 retrieval + schema layer) and does **NOT** expose them as callable to the LLM. The model (qwen3.7-max), seeing the tool descriptions in the prompt, sometimes emits tool-call format (expecting them to be invoked) instead of generating SQL directly. These attempts fail `execution_match` (non-SQL → executor ok=false) AND the judge scores them low → both fail → **EXCLUDED from the judge false-pass gap** (the gap is purely wrong-VALUE cases, clean of non-SQL). This deflates the real-exec pass_rate but does NOT inflate the gap. **Fix (follow-up ticket)**: the engine-responder SQL-gen prompt should NOT describe `search_data_sources`/`load_event_definition` as invocable (or clarify they're pre-fetched) — a prompt-engineering fix in `prompt.ts`, NOT a baseline-validity issue (the baseline is the honest measurement of the engine responder as-is). Fixing it would materially raise the real-exec pass_rate (the 34% non-SQL attempts would mostly become valid SQL) → a re-baseline follow-up.

### Verdict

1. **Real-exec baseline established on a real-exec-derived case set** (RBI scope 10000251, 39 EXEC cases): `execution_match` is REAL (SQL executed against ODPS ieu_cdm + result compared to `expected.result_value.value`), NOT judge-only. `config.with_query=true` + all 12 item-4 fields self-stamped (item-4 anti-recurrence LIVE — distinguishes this real-exec run from judge-only). **Success criterion 1 + 3 met.**
2. **Judge false-pass gap quantified** (real-exec ≤ judge-only): **35.9pp** (14/39) of cases the judge semantically passed but whose real-executed value was wrong — the judge leniency the ticket set out to measure. The judge ceiling is the dual-score (19/39 = 48.7%, execution-blind, equivalent to standalone judge-only on identical SQL); real-exec is 12.8% (5/39); the 35.9pp gap = 73.7% of the judge's passes are false. **Success criterion 2 met.**
3. Case-set caveat: this is a DIFFERENT case set from k11-v2 (39 RBI EXEC scalar_exact cases vs 168 k11-v2 mixed). The real-exec 12.8% here is NOT directly comparable to the k11-v2 61.9% judge-only — only to the same-case-set judge ceiling (48.7% dual-score) above. The much lower absolute number reflects (a) real-exec being strictly harder than judge-only (value must match, not just semantics) + (b) the 34% non-SQL tool-call emission rate deflating real-exec.
4. **0 AGA-burst contamination** (empty-SQL=0 throughout, infra_failure=0) — the conc=3 + machine-unloaded discipline held; the artifact is a clean single run (no merge/rerun needed), config-stamped.

### Fidelity

- pass^k semantics (`passKVerdict` all-must-pass + `executionMatch=false`-when-unverifiable). SQL semantic judge on (threshold 0.6 = 3/5 dimensions). `with_query=true` (real ODPS via maxc CLI 0.4.8, ieu_cdm project, anchor 20260806).
- Item-4 `config` field LIVE: 12 fields, `verdict_semantics='pass^k'`, `with_query=true`, `today='20260806'`, `concurrency=3`, `scope_id='10000251'` — anti-recurrence effective (a real-exec run is now distinguishable from judge-only from the artifact alone).
- Dual-score methodology: judge execution-blind (`judgeSql` takes `{question, generated_sql, schema_context}`, no `query_result`); engine responder SQL-gen independent of `--with-query` → judge scores identical to standalone judge-only. No separate judge-only run needed (would produce identical judge scores at 2× LLM cost + AGA-burst risk).
- Real-exec substrate: maxc CLI 0.4.8 + `~/.maxc/config_ieu_cdm.yaml` (ieu_cdm) + `maxc-sidecar-k11.mjs` (real, spawns maxc binary). The `--with-query` boot fix (context.ts EnvCredentialProvider duplicate removed, committed GA-EVAL-CLEAN-RERUN) holds — verified by smoke + this full run (0 boot crashes).
- Analysis script: `analyze-real-exec-gap.mjs` (repo root) computes real-exec pass_rate + dual-score judge ceiling + gap (judge false-pass) + infra + per-intent + false-pass case_ids from one result JSON. Tested on smoke (1-case, 100% both) before the full run.

### Pointer

[GA-EVAL-REAL-EXEC](../tickets/phase-misc/GA-EVAL-REAL-EXEC-real-execution-baseline.md) (resolved: real-exec baseline on RBI real-exec-derived case set + judge false-pass gap via dual-score). Artifact: `eval-results/rebaseline-real-exec-rbi-10000251.json`. Smoke: `/tmp/eval-real-exec-smoke/real-exec-smoke-037.json`. Curated case set: `packages/eval/eval/cases/rbi-10000251-exec/` (39 EXEC cases, source: `reverse-bi/eval-cases/10000251/`). Analysis script: `analyze-real-exec-gap.mjs` (repo root). Log: `/tmp/eval-real-exec-rbi.log`.

## 2026-09-04 — GA-EVAL-REAL-EXEC correction: dual-score methodology invalid (engine self-correction); standalone judge-only baseline added

**Context**: a post-resolution code review (subagent) flagged the dual-score methodology claim as invalid. Independently verified before acting:

- `packages/eval/eval-cli/src/context.ts:348` — `this.odps = withQuery ? new CtxOdpsAdapter(ctx, this.scopeId) : new StandInOdps()` (the executor is wired INTO the Nl2sqlEngine, and differs by `--with-query`).
- `packages/data/nl2sql-engine/src/engine.ts:264-300` — `run()` has a `while (attempt <= MAX_FEEDBACK_RETRIES)` self-correction loop calling `this.llm.generate({question, attempt, feedback: lastFeedback})` + retrying on `critic_fail`/`near_dup`/empty-SQL; docstring line 11 confirms "the SQL the critic checks = the SQL `odps.execute` receives" — the engine uses `this.odps` DURING generation.
- result JSON `rebaseline-real-exec-rbi-10000251.json`: **11 of 117 attempts have null `generated_sql`** (6 cases: `eval_10000251_124/126/127/129/130/136`) — the engine exhausted `MAX_FEEDBACK_RETRIES` → returned without SQL. This is **impossible** with `--with-query` off (`StandInOdps.execute()` always returns `done` → no execution-error self-correction → SQL always present). Definitive proof self-correction fired in the real-exec run.

**Flaw**: the Nl2sqlEngine self-corrects SQL using execution feedback (`this.odps` = real CtxOdpsAdapter when `--with-query` on; `StandInOdps` always-`done` when off). So `--with-query` **changes SQL generation** (real-exec self-corrects on real ODPS execution errors; judge-only does not). The real-exec run's SQL (self-corrected) ≠ a standalone judge-only run's SQL (first-attempt). **The dual-score claim — "the real-exec run's `sql_judge` = a standalone judge-only run on identical SQL, so no separate judge-only run is needed" — is FALSE. Withdrawn.**

**What is STILL valid (unchanged)**:

- **real-exec pass_rate = 12.8% (5/39)** — on the engine's final (self-corrected) SQL; the engine's actual behavior under `--with-query`. The real-exec baseline stands. ✓
- **within-run judge 放过率 = 35.9pp (14/39) / 73.7% (14/19)** — 14 cases where the judge passed the engine's final SQL (score ≥ 0.6 all-k) but the real-executed value was wrong (`verdict='wrong'`). This is a **per-SQL judge-leniency measure on the SAME final SQL within the run** — valid. It does NOT require a standalone judge-only (judge + execution_match are on the same final SQL within the real-exec run). ✓
- 0 AGA-burst (empty-SQL=0 throughout), 0 infra_failure, config fields live (item-4). The run itself is clean. ✓

**Withdrawn**:

- "judge ceiling = 48.7% (19/39) = dual-score, execution-blind, equivalent to standalone judge-only on identical SQL" — FALSE. 48.7% is the judge pass rate on the real-exec run's **self-corrected** SQL, NOT a standalone judge-only ceiling (which would be on first-attempt SQL).
- "no separate judge-only run needed" — FALSE. A standalone `--with-query-off` run IS needed for the true judge-only ceiling.

**Confound (noted for the real-exec vs judge-only comparison)**: real-exec SQL is self-corrected (engine uses execution feedback); standalone judge-only SQL is first-attempt (`StandInOdps` → no execution-error self-correction). So "real-exec pass_rate vs judge-only pass_rate" compares **different SQL** — the gap is confounded, NOT a clean per-SQL judge false-pass. The within-run 35.9pp (above) is the cleaner per-SQL judge-leniency measure; the cross-run gap is an upper-bound-ish comparison with the self-correction caveat.

**Action (A+B)**: running a standalone judge-only baseline `rebaseline-judge-only-rbi-10000251` (`--with-query` off → `StandInOdps` → engine first-attempt SQL → judge scores it; verdict set by judge score ≥ 0.6) to get the true judge-only ceiling on first-attempt SQL. This satisfies the ticket's original checklist item ("先跑 judge-only baseline") that the dual-score shortcut invalidly skipped. The cross-run gap (judge-only ceiling − real-exec) has the self-correction confound, noted. Result appended below when the run completes.

**Ticket pointer**: [GA-EVAL-REAL-EXEC](../tickets/phase-misc/GA-EVAL-REAL-EXEC-real-execution-baseline.md) Resolution updated (Methodology section corrected: dual-score withdrawn, within-run 35.9pp stands, standalone judge-only added).

### Standalone judge-only result (B) — `rebaseline-judge-only-rbi-10000251`

**Run**: `--with-query` OFF (→ `StandInOdps` always-`done` → engine first-attempt SQL, NO execution-error self-correction; verdict set by judge score ≥ 0.6). Same protocol otherwise: aga/qwen3.7-max, pass-k=3, conc=3, --today 20260806, --scope-id 10000251, 39 EXEC cases. 0 AGA-burst (empty-SQL=0 throughout), 0 infra_failure. `config.with_query=false` ✓ (judge-only mode confirmed). 117 attempts (39×3). 10 null-SQL attempts across 8 cases (038, 056, 124, 125, 126, 127, 130, 136) — engine exhausted critic-retries (NOT execution-error retries, since StandInOdps never errors).

**judge-only pass_rate = 19/39 = 48.7%** (verdict=correct = all-k judge score ≥ 0.6).

| intent | total | correct | rate |
|---|---:|---:|---|
| metric_lookup | 23 | 8 | 34.8% |
| proportion | 11 | 8 | 72.7% |
| ranking | 3 | 1 | 33.3% |
| trend | 2 | 2 | 100.0% |
| **Total** | **39** | **19** | **48.7%** |

**Cross-run gap (CONFOUNDED) = 48.7% (judge-only, first-attempt SQL) − 12.8% (real-exec, self-corrected SQL) = 35.9pp.** This is NOT a clean per-SQL judge false-pass — the two runs are on DIFFERENT SQL (real-exec self-corrects via execution feedback; judge-only doesn't), so the comparison is confounded by self-correction. The within-run 35.9pp (14/39, from the real-exec run's dual-score: judge passed the engine's final self-corrected SQL but the executed value was wrong) is the CLEAN per-SQL judge-leniency measure.

**Judge-pass set comparison (proves dual-score ≠ standalone judge-only)**: the real-exec run's dual-score judge-pass set (19 cases, all-k `sql_judge.score ≥ 0.6`) and the judge-only run's judge-pass set (19 cases, `verdict=correct`) are NOT the same set:
- **overlap (judge-pass in BOTH): 13 cases**
- real-exec judge-pass ONLY (not in judge-only): 6 cases — `eval_10000251_043/050/056/123/128/138`
- judge-only judge-pass ONLY (not in real-exec): 6 cases — `eval_10000251_042/045/048/059/122/137`

The COUNT equality (19/19 = 48.7% in both) is **coincidental** — the SETS differ. This confirms the dual-score methodology is invalid: `--with-query` changes SQL gen (self-correction), so the real-exec run's SQL (self-corrected) ≠ the judge-only run's SQL (first-attempt) → the judge passes DIFFERENT cases. **Notable**: all 6 real-exec-judge-pass-ONLY cases (043/050/056/123/128/138) are among the 14 within-run false-pass cases — the self-correction improved those cases' SQL enough for the judge to pass (on self-corrected SQL) but the executed value was still wrong; in the judge-only run (first-attempt SQL, no self-correction) the judge did NOT pass them. I.e., self-correction INFLATED the real-exec run's judge pass for those 6 (and they're still execution-wrong → false-pass).

### Interpretation (final, honest)

- **real-exec pass_rate = 12.8% (5/39)** — on the engine's final (self-corrected) SQL; the engine's actual behavior under `--with-query`. VALID (the real-exec baseline).
- **standalone judge-only ceiling = 48.7% (19/39)** — on first-attempt SQL (StandInOdps, no execution-error self-correction). VALID (the judge-only ceiling the ticket asked for).
- **within-run judge 放过率 = 35.9pp (14/39) / 73.7% (14/19)** — judge passed the real-exec run's final (self-corrected) SQL but the executed value was wrong. CLEAN per-SQL measure (same final SQL within the run). This is the "judge 语义放过但真执行值错" the ticket wanted.
- **cross-run gap = 35.9pp** (48.7% − 12.8%) — CONFOUNDED (different SQL + different judge-pass sets; coincidentally equals the within-run 35.9pp because both judge pass rates are 48.7%). NOT a clean per-SQL measure; the within-run 35.9pp is the one to cite.
- **dual-score methodology**: INVALID (the 48.7% count equality was coincidental; the judge-pass sets differ). Withdrawn. The standalone judge-only run (B) was necessary to establish the true ceiling — the dual-score shortcut was wrong.
- **prompt.ts tool-catalog leakage (GA-EVAL-SQLGEN-PROMPT-FIX)**: affects BOTH runs (~34% non-SQL in real-exec, ~10/117=8.5% null-SQL in judge-only + tool-call emissions) → fixing the prompt would raise BOTH baselines. The 48.7% judge-only ceiling is ALSO deflated by the non-SQL emissions.

**Bottom line**: the ticket's "judge 放过率" = **35.9pp (14/39) / 73.7% (14/19)**, the within-run per-SQL measure (judge passed the executed SQL but value wrong). The standalone judge-only ceiling is **48.7%** (on first-attempt SQL). real-exec is **12.8%** (on self-corrected SQL). The cross-run 35.9pp gap is confounded by self-correction; the within-run 35.9pp is the clean measure (both happen to be 35.9pp because both judge pass rates are 48.7% — a coincidence, not a validation of the dual-score).

---

## 2026-09-05 — GA-EVAL-SQLGEN-PROMPT-FIX: engine-responder prompt tool-catalog leakage fixed + re-baseline (non-SQL 0% both modes; judge-only rose 48.7→56.4, real-exec dropped 12.8→7.7)

**Ticket**: [GA-EVAL-SQLGEN-PROMPT-FIX](../tickets/phase-misc/GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md)
**Artifacts**: `eval-results/rebaseline-real-exec-rbi-10000251-postpromptfix.json` (real-exec, 39 EXEC, 140KB, 2026-09-05 01:51); `eval-results/rebaseline-judge-only-rbi-10000251-postpromptfix.json` (judge-only, 39 EXEC). Code on branch `fix/ga-eval-sqlgen-prompt-fix` (commit fcdb18779c — the code fix got swept into a concurrent session's docs commit via its `git add -A`; code is intact + verified, but the commit is contaminated with a docs change and needs split-cleanup): `packages/data/nl2sql-engine/src/prompt.ts` + `packages/eval/eval-cli/src/context.ts` + `packages/data/nl2sql-engine/tests/prompt.spec.ts`.

### Setup

- **Fix**: `packages/data/nl2sql-engine/src/prompt.ts` — added optional `BuildPromptArgs.contextPrefetched?: boolean` (default `false` = the agent-loop prompt, **byte-identical** to pre-fix — the 4 existing prompt.spec.ts inline snapshots pass unchanged). When `true` (engine-responder mode), `buildPrompt` reframes the `# 工具集` invocable-tool catalog as a `# 上下文（已 pre-fetch，勿调用任何工具）` preamble ("candidates + event definitions are pre-fetched into context; do NOT emit tool-call format (`call:default_api`/`<tool>`/`{"name":...}`); generate SQL directly in ```sql fences"), reframes §3 staged SOP (engine handles critic/exec/self-correction internally), drops `search_data_sources`/`load_event_definition` name-refs from the `# 检索候选`/`# 事件定义` headers + the 字段清单校验 line. `packages/eval/eval-cli/src/context.ts` `Nl2sqlAgentResponder` passes `promptBuilder: (args) => buildPrompt({ ...args, contextPrefetched: true })` to `Nl2sqlEngine` (standard path only; EXP2_ARM B/C/D keep `buildPromptEN`). **Additive**: the harness responder (`--responder harness`) is UNAFFECTED — it uses the variant preset's phase-gate prompt, NOT `Nl2sqlEngine`/`buildPrompt`; the default `buildPrompt` branch is byte-identical. Complements CL-23 (commit ccdd150a97, `looksLikeToolCall` detection at the respond layer) — this prevents tool-call emissions at the prompt layer; CL-23 catches residuals.
- **Re-baseline protocol**: identical to GA-EVAL-REAL-EXEC. (1) real-exec: `--with-query --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs --run-id rebaseline-real-exec-rbi-10000251-postpromptfix`. (2) judge-only: `--with-query` OFF (→ StandInOdps always-`done`, first-attempt SQL, judge score ≥0.6 sets verdict) + `--run-id rebaseline-judge-only-rbi-10000251-postpromptfix`. Both: `--cases packages/eval/eval/cases/rbi-10000251-exec --pass-k 3 --concurrency 3 --provider aga --model qwen3.7-max --skip-health-gate --today 20260806 --scope-id 10000251` (MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml for real-exec). 39 EXEC scalar_exact cases. Both as nohup+disown orphans (survive MCP runner timeout/disconnect).
- **Concurrent-session disruption (noted)**: a concurrent session (CL-23 + wayfinder docs) was live during this work + repeatedly wiped uncommitted working-tree changes via `git add -A`/reset (swept the code fix into its docs commit fcdb18779c, checked out the branch). Recovered from `stash@{0}` (preserved by the concurrent session) + committed on isolation branch `fix/ga-eval-sqlgen-prompt-fix` (+ backup branch `backup-ga-eval-sqlgen-prompt-fix`). The baselines ran AFTER the concurrent session went idle (~4h after its last commit e3b1f4d1ad), with `prompt.ts` re-verified intact (`grep contextPrefetched`=3) at each poll — guard held, no mid-run disruption.

### Results (verbatim, 39 EXEC cases, pass^k all-must-pass; non-SQL = generated_sql matching tool-call format; null-SQL = generated_sql empty/(none), engine critic-retry exhaust)

| baseline | pre-fix pass | post-fix pass | Δ pass | non-SQL (pre→post) | null-SQL (pre→post) |
|---|---|---|---|---|---|
| real-exec (`--with-query`) | 5/39 = 12.8% | 3/39 = 7.7% | **−2** | 19/117=16.2% → **0/117=0.0%** | 11/117=9.4% → 23/117=19.7% |
| judge-only (`--with-query` off) | 19/39 = 48.7% | 22/39 = 56.4% | **+3** | 26/117=22.2% → **0/117=0.0%** | 10/117=8.5% → 22/117=18.8% |

Real-exec: passed lost 041/046 (2 regressions — the engine-mode prompt altered their SQL gen); passed gained **none** (the 19 converted tool-call→SQL attempts produced wrong/null SQL, 0 new passes). Judge-only: passed gained 050/051/056/119/128/138 (6 — event cases that pre-fix emitted tool-calls now generate semantically-plausible SQL the judge passes); passed lost 042/049/059 (3). Net +3.

Per-intent post-fix: real-exec metric_lookup 2/23 (8.7%), proportion 1/11 (9.1%), ranking 0/3, trend 0/2; judge-only metric_lookup 12/23 (52.2%), proportion 6/11 (54.5%), ranking 2/3 (66.7%), trend 2/2 (100%).

### Verdict

1. **Criterion #1 (non-SQL tool-call emission <10%): MET in BOTH modes.** real-exec 16.2%→0%, judge-only 22.2%→0%. The fix eliminated the RBI tool-call emissions (`call:default_api:load_event_definition{...}`, `<tool>search_data_sources</tool>`, `{"name":"load_event_definition",...}`) completely — the engine-responder prompt no longer describes `search_data_sources`/`load_event_definition` as invocable. **Success criterion 1 met.**
2. **Criterion #2 (pass_rate recovery): MIXED — judge-only MET, real-exec NOT met.** judge-only 48.7%→56.4% (+3 cases, +7.7pp — **rose** as the ticket hypothesized; the model now generates SQL where it previously emitted tool-calls, and the judge passes the semantically-plausible ones). real-exec 12.8%→7.7% (−2 cases — **dropped**; 0 gained, 2 regressed 041/046). **Success criterion 2 (real-exec >12.8%) NOT met.**
3. **The divergence IS the judge-leniency pattern** (GA-EVAL-REAL-EXEC's lesson, confirmed): the fix makes the model generate MORE SQL (19/26 tool-call attempts converted to SQL). The JUDGE (semantic, execution-blind) passes more of these (judge-only +3, incl. event cases 119/128/138) → judge-only rises. But the REAL-EXECUTOR (value match, strict) still fails them — the generated SQL is semantically plausible but executes to WRONG VALUES (event cases: the model doesn't know the exact event table `ieu_ods.ods_10000251_all_view`, generates wrong tables/placeholders like `<数据视图>`; 2 metric cases 041/046 regressed). So the fix exposed that **the real-exec bottleneck is SQL-CORRECTNESS (wrong values), NOT non-SQL emissions** — the ticket's hypothesis ("34% non-SQL was dragging down real-exec; fixing it raises real-exec") is **REFUTED for real-exec** (the emissions were a symptom; the root cause is the model can't generate value-correct SQL for event cases without the eventDef pre-fetched — the engine responder does NOT pre-fetch it: `Nl2sqlAgentResponder.respond()` calls `engine.run({question, scopeId, today})` with NO `eventDef` → the prompt's `# 事件定义` renders `（未加载）` for event questions). The hypothesis was **PARTIALLY right for judge-only** (rose) — but the judge ceiling is itself a lenient over-count (GA-EVAL-REAL-EXEC's 73.7% false-pass), so a higher judge-only is a higher over-count, not a real quality gain.
4. **n=39 noise caveat**: MDE for n=39 ≈20pp (pass^k all-must-pass). The 5pp real-exec drop + 7.7pp judge-only rise are both WITHIN noise — statistically indistinguishable from "no change." BUT the qualitative pattern (judge-only up, real-exec down, 0 non-SQL both modes) is real + consistent with the judge-leniency mechanism, not random.
5. **0 AGA-burst contamination** — the empty-SQL (23 real-exec / 22 judge-only) is engine null-SQL from critic-retry exhaust on event cases (model generates SQL that fails the critic → retries → null-SQL), matching the prior run's 11/10 null-SQL pattern (038/056/124-130/136). NOT AGA empty-response bursts (the LLM endpoint returned content throughout — the DIAG log shows real SQL per attempt). infra_failure=0.

### Fidelity

- pass^k semantics (all-must-pass). SQL semantic judge on (threshold 0.6 all-k) for judge-only (sets verdict); real-exec dual-scores (execution_match REAL via maxc CLI 0.4.8 / ieu_cdm + execution-blind judge). `--with-query`+maxc-sidecar-k11.mjs (real-exec) / StandInOdps always-`done` (judge-only). `--today 20260806` (RBI anchor). conc=3 (the +conc-under-load AGA-burst lesson held). Item-4 `config`: `with_query=true` (real-exec) / `false` (judge-only), `verdict_semantics='pass^k'`, `today='20260806'`, `concurrency=3`, `scope_id='10000251'`.
- Byte-stability: prompt.spec.ts 5/5 pass (4 existing snapshots byte-identical — default branch unchanged; 1 new snapshot pins the `contextPrefetched=true` engine-mode output). Verified the package name `@deepseek-ai/dsh-nl2sql-engine` resolves to SRC via `tsconfig.base.json` paths wildcard (`@deepseek-ai/dsh-*`→`./packages/data/*/src`) under tsx → the src edit is live at runtime (no lib/ rebuild; lib/ is publish-only gitignored). Smoke 037 real-exec pass (dau=4336, no regression); smoke 119 judge-only 0/3 non-SQL tool-call emissions (was ~100% pre-fix for this event case).
- `prompt.ts` re-verified intact (`contextPrefetched` present) at each baseline poll — concurrent-session guard held.

### Pointer

[GA-EVAL-SQLGEN-PROMPT-FIX](../tickets/phase-misc/GA-EVAL-SQLGEN-PROMPT-FIX-non-sql-emission.md) (resolved: non-SQL tool-call emissions eliminated in both modes — criterion #1 met; judge-only rose 48.7→56.4 — criterion #2 met for judge-only; real-exec dropped 12.8→7.7 — criterion #2 NOT met for real-exec, hypothesis refuted for real-exec). Artifacts: `eval-results/rebaseline-real-exec-rbi-10000251-postpromptfix.json`, `eval-results/rebaseline-judge-only-rbi-10000251-postpromptfix.json`. Code: branch `fix/ga-eval-sqlgen-prompt-fix` (commit fcdb18779c — contaminated with a concurrent session's docs change, needs split-cleanup). **Carried forward**: the real-exec bottleneck is SQL-correctness for event cases — the engine responder doesn't pre-fetch `eventDef` → the model lacks the event schema → generates wrong-table/placeholder SQL → execution_match=false. A follow-up to pre-fetch eventDef in the engine responder (load event definitions for event-based questions + pass to `engine.run`) would target the real-exec bottleneck directly (separate ticket, not this one's scope).

### Code review (2026-09-05/06, self — background subagent crashed mid-run on MCP tool access)

**Verdict: APPROVE_WITH_NITS** (no code changes required). Reviewed prompt.ts (`contextPrefetched` flag + engine-mode template), context.ts (wiring), prompt.spec.ts (test), engine.ts (run() loop), harness-responder.ts (harness path).

- **Soundness verified**: default `buildPrompt` branch byte-identical to pre-fix (4 existing prompt.spec.ts snapshots pass); harness responder unaffected (harness-responder.ts has NO Nl2sqlEngine/buildPrompt import — only a docstring mention; uses preset phase-gate); wiring correct (`contextPrefetched=true` only in the standard engine-responder path via wrapped promptBuilder; EXP2_ARM B/C/D keep `buildPromptEN`); CL-23 `looksLikeToolCall` complementary (respond-layer detection + prompt-layer prevention).
- **Nit 1 (minor/design → GA-EVAL-SQLGEN-FOLLOWUP)**: the `# 上下文` preamble says "candidates + event definitions are pre-fetched into context" but `Nl2sqlAgentResponder.respond()` doesn't pass `eventDef` -> for event questions `# 事件定义` renders `（未加载）` -> misleading; contributes to the real-exec drop (model lacks event schema). Not a bug in this fix (direct goal — eliminate tool-call emissions — met, non-SQL 0%).
- **Nit 2 (pre-existing, out of scope, -> GA-EVAL-SQLGEN-FOLLOWUP investigation)**: engine.ts `run()` retries on critic_fail/execution-errors passing `feedback: lastFeedback` to `llm.generate()`, but `CtxLlmAdapter.generate` IGNORES `args.feedback` (only uses `args.prompt`) -> self-correction feedback doesn't reach the LLM prompt -> retries use the same prompt + near-dup gate -> null-SQL on exhaust. Pre-existing (not introduced by this fix); explains the null-SQL cases (23 real-exec / 22 judge-only).
- **Merged to master**: `47584b85d7` (records `d8b4d7630f` + FOLLOWUP ticket `47584b85d7` rebased onto origin/master + fast-forward pushed; push guard passed: `no production src on master` + `typecheck`). Code fix itself on master via `fcdb18779c` (contaminated — concurrent session's `git add -A` swept the code into its docs commit; permanent, force-push unsafe). Backups (backup branch `backup-ga-eval-sqlgen-prompt-fix` + stash@{0} "concurrent-session WIP") dropped post-merge (code on master + reflog preserves).

---

## 2026-09-06 — GA-EVAL-SQLGEN-FOLLOWUP (post-prompt-fix divergence root-cause + follow-up direction)

**Ticket**: [GA-EVAL-SQLGEN-FOLLOWUP](../tickets/phase-misc/GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md) (resolved 2026-09-06). Source: GA-EVAL-SQLGEN-PROMPT-FIX 2026-09-05 Resolution — prompt fix (`contextPrefetched` flag) eliminated non-SQL emissions (criterion #1, both modes 0%) but re-baseline diverged: judge-only 48.7→56.4 (criterion #2 ✓), real-exec 12.8→7.7 (criterion #2 ✗, hypothesis refuted).

### Method

Per-case comparison of pre vs post rebaseline artifacts — `rebaseline-real-exec-rbi-10000251{,-postpromptfix}.json` + `rebaseline-judge-only-rbi-10000251{,-postpromptfix}.json` — per-case verdict + per-attempt `execution_match` / `sql_judge` / `generated_sql` / `query_result` / `expected_result`. 39 EXEC cases, pass^k k=3, conc=3, --today 20260806, scope 10000251, responder=engine. Verdict semantics source-confirmed at `packages/eval/eval-runner/lib/types/runner.js:297-309`.

### Findings — divergence root cause (success criterion #1)

**Verdict semantics (source-confirmed, not new)**: `passKVerdict` = ALL k attempts must pass (`allCorrect = attempts.every(a => a.infra_error===undefined && a.execution_match!==false && a.delivery_match!==false)`; `hasWrong = attempts.some(a => a.execution_match===false || a.delivery_match===false)`). Deliberate anti-flakiness decision from [GA-EVAL-REBASELINE](../tickets/phase-misc/GA-EVAL-REBASELINE-passk-semantics.md) (bestOfK→passK, any→every, 2026-09-03). NOT a mislabeled pass^k. Reframes real-exec "drop": penalizes retry inconsistency — a single bad retry flips the case.

**Divergence = judge-leniency + anti-flakiness×feedback-gap + event-case bottleneck; NOT systematic prompt degradation.**
- **judge-only +3** (gained 050/051/056/119/128/138, lost 042/049/059): judge-leniency — pre-fix the gained cases emitted tool-calls (sj=0) on would-pass attempts; post-fix generate semantically-plausible SQL → judge 1.0. Judge is execution-blind (119 post-fix DWS-table SQL sj=1.0, real-exec 552 vs 510 wrong). ↑ = higher over-count, not quality gain.
- **real-exec −2** (041/046 regressed, 0 gained) — three mechanisms:
  1. **Anti-flakiness + retry drift (the −2):** 046 att1+2 correct (em=true, qr=67.81415=exp), att3 adds `ROUND(...,2)`→67.81≠67.814→em=false→case wrong; pre-fix att3 unrounded. 041 att2 = identical correct SQL to pre-fix (`SUM(pay_fst)`, qr=58=exp, em=true), att1 now DECLINES (contextPrefetched §5 honest-decline framing), att3 wrong table (`selfhelp_new_pay_df`, qr=0). Under any-pass 041 would pass; all-must-pass fails it.
  2. **0 gained = bottleneck untouched:** 19 converted non-SQL→SQL attempts all wrong/null. Event cases (119-138) fail three ways — placeholder (`FROM <数据视图> WHERE event='<事件名>'`→ParseError; 119/126), null-SQL (decline→retry exhaust→empty; 125/127/129/130), wrong-table fallback (DWS table→wrong value, sj=1.0 judge passes; 119 att3 552v510, 136 att3 482v432). Model lacks event table `ieu_ods.ods_10000251_all_view` + params template.
  3. **Feedback-wiring gap amplifies both:** `engine.run` passes `feedback: lastFeedback` to `llm.generate()`, but `CtxLlmAdapter.generate` (context.ts) IGNORES `args.feedback` (only reads `args.prompt`) → retries use identical prompt (promptBuilder rebuilds without feedback) → can't self-correct → drift (ROUND/decline) or null-SQL exhaust. = null-SQL explosion (real-exec 11→23, judge-only 10→22) + the retry-inconsistency anti-flakiness penalizes.
- **Key**: NOT systematic degradation — 041 att2 / 046 att1-2 = identical correct SQL to pre-fix. The prompt fix didn't break generation; it shifted retry stochasticity, which anti-flakiness + feedback gap amplified into 2 failed cases. n=39 noise (MDE~20pp) but qualitative mechanisms per-case-evidenced.

### Decision (success criterion #2) — (a)+(d), 2 impl tickets charted

- **(a) [GA-EVAL-EVENTDEF-PREFETCH](../tickets/phase-misc/GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md)**: port [G-DA4](../tickets/phase-misc/G-DA4-event-table-name-grounding.md) (resolved 2026-08-25, commit `0548fe4f8a`) event_view grounding from harness path to engine responder eval path. Reuse `SemanticLayerService.loadEventDefinition(name)` (snapshot.ts:97) + `extractEventView(semanticRoot)` (tool-load-event-definition, returns `EventViewInfo`{`full_name`=`ieu_ods.ods_10000251_all_view`, `params_extract_template`, `base_columns`}) → pass `engine.run({...,eventDef})` + extend prompt `# 事件定义` to surface FROM table + params template. Main risk: event-name detection (BM25 surfaces event doc? events in corpus — `buildSchemaContext` branches event candidates; if unreliable, add alt_labels matcher). Targets event-case wrong-table/placeholder/null cluster (119-138). Subsumes (b).
- **(d) [GA-EVAL-RETRY-FEEDBACK](../tickets/phase-misc/GA-EVAL-RETRY-FEEDBACK-wiring-gap.md)**: wire `args.feedback` into SQL-gen prompt (`BuildPromptArgs.feedback` + `engine.run` promptBuilder call + prompt render `# 上次失败反馈`). Lets retries self-correct on critic reason / execution error → kills null-SQL explosion + retry drift. Independent of (a); amplifies (a)'s consistency (right schema + consistent retries).
- **(b) DROPPED** — contextPrefetched prompt already hedges (`# 事件定义（若已加载）` + "若已加载"); residual value marginal; (a) subsumes it (loading real eventDef makes the preamble truthful).
- **(c) NOT chosen** — destination (real-exec pass_rate) unaddressed.

### Pointer (success criterion #3)

[GA-EVAL-SQLGEN-FOLLOWUP](../tickets/phase-misc/GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md) (resolved 2026-09-06). Pre/post artifacts: `packages/eval/eval-cli/eval-results/rebaseline-{real-exec,judge-only}-rbi-10000251{,-postpromptfix}.json`. Code under review: `packages/eval/eval-cli/src/context.ts` (Nl2sqlAgentResponder.respond → engine.run without eventDef; CtxLlmAdapter.generate ignores args.feedback), `packages/data/nl2sql-engine/src/{engine,prompt}.ts`. Verdict source: `packages/eval/eval-runner/lib/types/runner.js:297-309`. Follow-up (both open, unblocked, in map frontier): GA-EVAL-EVENTDEF-PREFETCH + GA-EVAL-RETRY-FEEDBACK.

---

## 2026-09-06 — GA-EVAL-RETRY-FEEDBACK: wire retry feedback into SQL-gen prompt (# 上次失败反馈) — code + tests landed; judge-only baseline running

**Ticket**: [GA-EVAL-RETRY-FEEDBACK](../tickets/phase-misc/GA-EVAL-RETRY-FEEDBACK-wiring-gap.md) (code + tests landed 2026-09-06; judge-only re-baseline running at commit time — numbers + verdict to amend when complete). Source: GA-EVAL-SQLGEN-FOLLOWUP nit 2 — `engine.run` passes `feedback: lastFeedback` to `llm.generate()` but `CtxLlmAdapter.generate` ignores `args.feedback` (only reads `args.prompt`) + `BuildPromptArgs` had no feedback field → promptBuilder rebuilds an IDENTICAL prompt per retry → self-correction feedback never reaches the LLM → identical-prompt retry → near-dup reject / drift → null-SQL exhaust (real-exec 11→23, judge-only 10→22) + 041/046 drift.

### Setup (the fix — commit `ba1b1ed597` on `fix/ga-eval-sqlgen-prompt-fix`; backup branch `backup-ga-eval-retry-feedback`)

- **`packages/data/nl2sql-engine/src/prompt.ts`**: `BuildPromptArgs` += `feedback?: LlmFeedback | null | undefined`. New `renderFeedbackSection(feedback)` → `''` when null/undefined (byte-stable) else `\n# 上次失败反馈（据此修正，勿重复相同错误）\n- 失败类型：${failureKind}\n- 错误：${sanitizeFeedbackError(error)}\n`. `sanitizeFeedbackError` mirrors tool-load-event-definition's `sanitizeSubstrateError` (strip control, redact slash-paths, collapse ws, bound 400; table names dot-joined survive). Inserted `${renderFeedbackSection(feedback)}` after `${joinSection}${metricSection}` in BOTH contextPrefetched + default branches — 5 existing prompt.spec.ts inline snapshots pass unchanged (feedback absent → section omitted → byte-identical).
- **`packages/data/nl2sql-engine/src/engine.ts`**: `run()` passes `feedback: lastFeedback` to `this.promptBuilder({...})` (lastFeedback null on attempt 0 → omitted → byte-stable; set on critic_fail / execution-error / near-dup → attempt ≥1 prompt carries the failure). The `llm.generate({feedback})` side-channel kept (ReplayLlm scripted-rewrite tests read it); the real CtxLlmAdapter path now gets feedback via the prompt.
- **`packages/eval/eval-cli/src/context.ts`**: `CtxLlmAdapter.generate` doc comment — confirms it streams `args.prompt` (now carries feedback); `args.feedback` vestigial there. No behavior change.
- **Tests**: `prompt.spec.ts` +2 (feedback-rendering contextPrefetched+default; byte-stability when absent). `scenarios.spec.ts` +1 (S11 retry-uses-feedback: mock LLM records each attempt's prompt + returns good SQL on retry ONLY when the prompt carries `# 上次失败反馈` — directly proves success criterion #3). **128/128 nl2sql-engine tests pass** (5 existing prompt snapshots byte-identical + k11-live-comparison).
- **Smoke** (real path, judge-only, case 119 × pass^k=3, 108s): ran clean — 3 attempts decline(null)→DWS-table→event-name-as-table. 119 still wrong (expected — event case needing (a)'s schema, not (d)'s feedback); the retry loop ran (run 1 declined after retries) → feedback path wired in the real CtxLlmAdapter path.

### Concurrent-session disruption (recovered)

Concurrent session (active on `fix/ga-eval-sqlgen-prompt-fix`) stashed my uncommitted (d) edits twice to "clear the merge path" (stash@{1}=engine.ts+prompt.ts; stash@{0}=tests+context.ts+leftover) + committed my (a) deferral note as `b11719e8a0`. Recovered via `git stash apply` (stashes retained as backup) + committed the 5 code files as `ba1b1ed597` (lefthook pre-commit: lint+whitespace+vendor-guard passed). The judge-only baseline had loaded my (d) code into memory at startup (tsx module cache) → disk wipes didn't invalidate the running run.

### Results (judge-only re-baseline — COMPLETE; real-exec deferred)

| baseline (judge-only) | pre-(d) (post-prompt-fix) | post-(d) | Δ | non-SQL | null-SQL |
|---|---|---|---|---|---|
| pass_rate | 22/39 = 56.4% | **21/39 = 53.8%** | **−1** (noise, MDE~20pp) | 0/117=0% → 0/117=0% | 22/117=18.8% → **21/117=17.9%** |

Per-intent post-(d): metric_lookup 10/23 (43.5%), proportion 9/11 (81.8%), ranking 0/3, trend 2/2 (100%). infra_failure=0. Run: `node --import tsx/esm packages/eval/eval-cli/src/bin.ts --cases packages/eval/eval/cases/rbi-10000251-exec --pass-k 3 --concurrency 3 --today 20260806 --scope-id 10000251 --provider aga --model qwen3.7-max --skip-health-gate --run-id ga-eval-retry-feedback-judgeonly-20260906` (1701s). Artifact: `eval-results/rebaseline-judge-only-rbi-10000251-postfeedbackwire.json` (+ log). **Real-exec baseline NOT run** (deferred — needs --with-query + MAXC_CONFIG + maxc-sidecar-k11.mjs; run when concurrent session idle + network restored, like GA-EVAL-SQLGEN-PROMPT-FIX).

### Verdict (success criteria — partial, pending baseline)

1. **Criterion #3 (retry 真 self-correct — feedback 到 LLM prompt): MET (unit-level).** S11 directly asserts the attempt-1 prompt contains `# 上次失败反馈`+failureKind+error + the mock self-corrects only then. Wiring proven; real path ran it (smoke 119 retries).
2. **Criterion #4 (additive — harness responder unaffected; default buildPrompt byte-stable): MET.** 5 existing snapshots byte-identical; harness responder uses phase-gate (not buildPrompt); feedback optional, null→omitted.
3. **Criteria #1 (null-SQL→<12) + #2 (pass_rate >56.4%): NOT MET (judge-only).** null-SQL 22→21 (−1, flat within noise) + pass_rate 56.4→53.8 (−1, within noise, direction down). The (d) fix did NOT measurably help judge-only on this case set. **This was the predicted honest caveat** (criterion #4 below) — confirmed empirically.
4. **Why (d) alone is bounded — confirmed**: the null-SQL explosion is dominated by EVENT cases (125/127/129/130) where the model declines for lack of the event schema (the (a) problem); (d)'s feedback "LLM 未产出 SQL" doesn't hand the model the missing event table `ieu_ods.ods_10000251_all_view` + `GET_JSON_OBJECT` template → the model still can't write the event SQL → still null-SQL (the -1 is noise, not a real drop). (d) would help fixable-critic-error cases (DWS 038-060 cluster: missing partition / wrong-but-close table) — but on THIS set those mostly already pass or fail for value reasons (not retry-feedback-fixable). **(d) is the correct fix (the wiring was broken — retries used identical prompts) but its standalone measured benefit is ~nil here; the real win is (a)+(d) combined** — (a) gives the event schema → (d)'s feedback then keeps retries consistent (exactly the ticket's "组合最大收益"). Real-exec baseline (deferred) would show the same pattern (event cases null/wrong-value unless (a) lands).

### Pointer

[GA-EVAL-RETRY-FEEDBACK](../tickets/phase-misc/GA-EVAL-RETRY-FEEDBACK-wiring-gap.md) — code + tests landed (commit `ba1b1ed597`; backup `backup-ga-eval-retry-feedback`). Judge-only baseline COMPLETE: null-SQL 22→21 (flat), pass_rate 56.4→53.8 (−1, noise) — (d) alone does NOT move the needle (null-SQLs are event cases needing (a)'s schema, not retry feedback). **Follow-up**: (1) run the real-exec baseline (`--with-query` + `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml` + `maxc-sidecar-k11.mjs`) when concurrent session idle + network restored — expect the same bounded pattern (event cases null/wrong-value unless (a) lands); (2) **resolve (a) GA-EVAL-EVENTDEF-PREFETCH next** (LLM-detection or description-mining — risk-gate verdict on its ticket) — (a)+(d) combined is where the real win is ((a) gives schema, (d) keeps retries consistent); (3) re-baseline after (a) lands to measure the combined effect.

---

## 2026-09-06 — GA-EVAL-EVENTDEF-PREFETCH: event_view grounding ported to the eval path — grounding works; the measurement instrument was broken in two places

**Ticket**: [GA-EVAL-EVENTDEF-PREFETCH](../tickets/phase-misc/GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md)（resolved 2026-09-06）。Source: [GA-EVAL-SQLGEN-FOLLOWUP](../tickets/phase-misc/GA-EVAL-SQLGEN-FOLLOWUP-postfix-divergence.md) 决策 (a)。Branch `task/ga-eval-eventdef-prefetch`（backup `backup-ga-eval-eventdef-prefetch`），基于含 (d) 的 `fix/ga-eval-sqlgen-prompt-fix`@`9221e21bd0`（PR #26 仍 open 未 merge）。

### Setup（4 commits）

- **`36622d45eb`** 主体：`eval-cli/src/event-detect.ts`（新，两段式检测）+ `context.ts` wiring（detect → `loadEventDefinition`+`extractEventView` → `engine.run({eventDef,eventView})`，按 question 缓存）+ `prompt.ts`（`BuildPromptArgs.eventView` + `# 事件查询落表` section，缺省不渲染 → byte-stable）+ `engine.ts`（eventView → promptBuilder **且** → `makeCriticCtx.candidateTables`）+ 测试 123/123（+2 prompt，+1 scenario S12 带 without-view 对照）+ `dev/event-detect-fp-probe.ts`。eval-cli 加 dep `@deepseek-ai/dsh-tool-load-event-definition`（lockfile +3 行）。
- **`3229590eeb`** timeout collision（见下）。
- **`761b8551d0`** 仪表审计工具 + 新票 + 原始输出 artifacts。
- **`0f7b9234a2`** SQL semantic judge 的 schema context（见下）。

### 检测器标定（`dev/event-detect-fp-probe.ts`，39 case，连续两跑一致）

**TP=6 · FP=0 · TN=21 · FN=12**（TP = 057/119/125/126/135/136）。

**修正上 session 的 FP=0**：上 session 的 FP 定义只算「DWS → event」，「event case → **错的** event」被记成 FN。严格定义下 122「PVE副本挑战」命中 `DungeonOnkeyPass` 的泛 alt_label「副本」被选中（真值 `game.pve.begin`）= FP。加通用规则（命中泛词 ≠ 对得上；候选是另一个具名活动的埋点 → NONE）后归零，TP 7→6（138 按「新增角色=泛词」回 NONE，规则内一致）。

**12 FN 全是词法段无候选**：scope 内 **453 个事件只有 6 个填了 `alt_labels`**（recharge/role.create/coin.change/item.change/DungeonOnkeyPass×2）→ `card.gacha` 无「抽卡」、`role.online` 无「登录」。召回上限是语料覆盖，不是逻辑。

### (a) 生效的机制级证据（比 pass_rate 可靠）

| judge-only, 117 attempts | (d) | (a)+(d) |
|---|---|---|
| 用 `ieu_ods.ods_10000251_all_view` 的 attempt | **0** | **17** |
| null-SQL | **21** | **13**（−38%）|
| 非 SQL tool-call | 0 | 0 |
| `FROM <数据视图>` 占位符 | 0 | 1 |

**null-SQL 21→13 是 (a)+(d) 组合首次被测到的收益**——(d) 单独只有 22→21。机制正如两票预测：event schema 到位 → 模型不再因无表可写而 decline。

smoke 119（real-exec）生成的 SQL 与 case 自己的 reference SQL **逐字一致**；135 生成 `GET_JSON_OBJECT(params,'$.moneyType')`/`'$.money'` 与 reference 同构（119 用不到 params，role_id 是基础列）。

### 缺陷 1：case-set 的 event 期望值不是冻结锚点（→ 新票）

把每个 case **自己的 `expected.sql`** 实跑（`ds=20260805`）对账 `expected.result_value`（工具 `packages/eval/eval-cli/dev/case-expected-value-audit.mjs`，原始输出 `research/artifacts/case-expected-value-audit-{event,dws}-20260906.log`）：

| data_source | MATCH | STALE | SKIPPED（多行） |
|---|---|---|---|
| **event** | 2（都是 `0==0`）| **16** | 0 |
| **dws** | **13** | **0** | 8 |

119 `510→552`、136 `432→482`、057/135 `773500→2409900`(3.1×)、121 `33503→46306`、126 `2774223→3413512`。方向多数升但不全（137 `288→259`、138 `48→39`）→ 只能确证「ODS 原始视图历史分区不稳定、DWS 汇总表稳定（T+1 算完即冻结）」，机制未证。

**这推翻了一条既有结论**：FOLLOWUP 记「119 att3 → 552 错值」「136 att3 → 482 错值」，552/482 正是那两条 reference SQL 今天的值——**模型算对了，判错的是仪表**。所以 audit-log 里「real-exec 瓶颈 = SQL 正确性/错值」对 event case 至少部分失效，本票 criterion #1 是 **uninstrumented 而非 unmet**。新票 [GA-EVAL-CASESET-EVENT-ANCHOR](../tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md)（grilling，5 个候选口径 A-E，都不免费）。

### 缺陷 2：SQL semantic judge 与 critic 犯同一个错（本票已修）

judge 用 responder 的 `schema_context`（BM25 候选）打 `table_selection`/`field_selection`，event view 是 scope 级 config 不是 corpus item。**case 135（`data_source: event`，reference SQL 就是 event view 查询）**：

| | 生成 SQL | sql_judge | verdict |
|---|---|---|---|
| (d) 之前 | 3/3 用 DWS 表 | **1.0/1.0/1.0** | correct |
| (a) 之后 | 3/3 用 reference 同构 event view SQL | **0.4/0.2/0.2** | wrong |

judge 原话：「使用了 **Schema 上下文之外的** ODS 底层表…导致表和字段选择错误」（`table_selection:0`、`field_selection:0`）。**仪表在惩罚 (a)，且此前一直在奖励取错源的答案**——这是 FOLLOWUP「judge-leniency」的一个更强版本：不只是宽容错答案，而是主动扣正确答案的分。修法与 critic 同构（检测到 event 时把 event view + 事件名 + params 字段追加进 `schema_context`；追加式，21 个 DWS case 该段 byte 不变）。

### 潜伏 bug：MCP timeout 与 sidecar wait 窗口相撞（`3229590eeb`）

sidecar 跑 `maxc query run --wait 60` 才提交异步 job，`toolCallTimeoutMs` **也**默认 60s → 比 wait 窗口慢的查询表现为 `MCP error -32001: Request timed out`，走不到 sidecar 设计的 pending/attach 路径。潜伏至今因为历次 real-exec 打的都是秒级的预聚合 DWS 表；(a) 指向 event ODS 视图后 `COUNT(DISTINCT role_id)` 实测 **68s**，于是 (a) 自己的正确 SQL 被判 infra_failure（smoke 119 首跑 3 attempts/222s 全超时）。修：wait 读 `MAXC_WAIT_SECONDS`（默认 60 = 原值），eval-cli 从同一变量派生 timeout（+60s），构造上不可能相撞。附带发现：engine 的 attach 轮询 3 次之间**无间隔**，被提升为异步的 job 几乎必然在轮询用完时仍在 running——所以把慢查询留在同步窗口内是目前可靠的路径。

### Results（judge-only 双跑）

| judge-only（39 case × k=3） | (d) 基线 | (a)+(d) **v1**（judge 未修） | (a)+(d) **v2**（judge 已修） |
|---|---|---|---|
| pass_rate | 21/39 = 53.8% | 16/39 = 41.0% | **24/39 = 61.5%** |
| null-SQL /117 | 21 | 13 | **13**（−38%）|
| 非 SQL tool-call 发射 | 0% | 0% | **0%**（维持）|
| 用 event view 的 attempt | 0 | 17 | **18** |

Run: `--pass-k 3 --concurrency 3 --today 20260806 --scope-id 10000251 --provider aga --model qwen3.7-max --skip-health-gate`；artifacts `eval-results/eventdef-judgeonly{,-v2}.json`（v1 1792s / v2 ~1900s）。

**v2 vs (d) 逐 case**：**+9**（057/119/125/126/128/136/137 = **7 个 event case**，其中 5 个正是检测器的 6 个 TP；另 045/059 dws）、**−6**（038/039/042/043/051 dws + 135 event）。**收益的分布不是噪声形状——精准落在 (a) 针对的 case 上。**

**6 个回退逐一查明，无一由 (a) 造成**：
- 5 个 DWS（038/039/042/043/051）**三次 attempt 的 `eventView` 全为 false** —— 检测一次未触发；未检测到 event 时生成 prompt 与 (d) **逐字节相同**（section 缺省不渲染，已单测）→ 差异只能来自采样。每个都同时有 sj=1.0 和 sj≤0.6 的 attempt，是 `passKVerdict=every` 放大的 attempt 级抖动（038 sj=[1,0.2,1]、039=[0.4,1,1]、042=[0.4,0,1]、043=[0.6,0.2,1]、051=[1,0,0]；038/041/043 的不稳定 FOLLOWUP 已记录过）。
- 135（唯一被注入的回退）：judge 修复**已生效**——att1/att3 现在 **sj=1.0 且五维全 1**，rationale 明确称赞「正确选择了事件视图表…完美契合」。att2 得 0.4 是 judge 换了个**领域论点**（ODS 客户端埋点有掉单风险，「真实营收」应以服务端 DWS 订单表为准），且该 attempt 还漏了 `/100.0`。即 case 本身的口径歧义 + all-must-pass，不是 (a) 缺陷。

**v1 的 −5 经 per-case 排除与 (a) 无关**：5 个回退的 DWS case（038/039/041/043/051）**每一次 attempt 都 `eventView=false`**，检测没触发，且未检测到 event 时生成 prompt 与 (d) **逐字节相同**（section 缺省不渲染，已单测）→ 差异只能来自采样。每个回退 case 都同时有 sj=1.0 与 sj=0.4/0.6/0 的 attempt，是 `passKVerdict=every` 放大的 attempt 级抖动（038/041/043 的不稳定 FOLLOWUP 已记录过）。038 att2 自己写了 `FROM <数据视图>` 占位符——(a) 没给它注入任何东西，那是原有行为。唯一「被注入且回退」的 135 根因是缺陷 2。

### Results（real-exec，`--with-query` + `MAXC_CONFIG=~/.maxc/config_ieu_cdm.yaml` + `MAXC_WAIT_SECONDS=240` + maxc-sidecar-k11）

| real-exec（39 case × k=3） | post-prompt-fix（2026-09-05）| (a)+(d)（2026-09-06）|
|---|---|---|
| pass_rate（as-shipped）| 3/39 = 7.7% | 2/39 = **5.1%** |
| pass_rate（**按 live 值重锚**）| — | **5/39 = 12.8%** |
| event case pass | 0/18 | as-shipped **0/18** · 重锚 **3/18** |
| null-SQL /117 | 23 | **13**（−43%）|
| 用 event view 的 attempt | 0 | **18** |
| `FROM <数据视图>` 占位符 attempt | **3** | **0** |
| 非 SQL tool-call · infra_failure | 0 · 0 | 0 · 0 |

Run id `eventdef-realexec`（1h35m），artifact `eval-results/eventdef-realexec.json`（未 git 追踪，与历次基线一致）；重锚评分工具 `packages/eval/eval-cli/dev/reanchored-score.mjs`，输出存 `research/artifacts/reanchored-score-eventdef-realexec-20260906.txt`。

**as-shipped 的 7.7%→5.1% 不可解读**：通过的 case 从 {036,037,039} 变成 {041,046}——**零重叠，全是 DWS**。n=39 + `passKVerdict=every` 下 real-exec 的 pass 集合基本是 DWS case 之间的抽奖（036 三次都选了 `univ_role_summary_di` 返 0；037 att2 用对表拿到 4336 但 att1/att3 换表返 null）。这个 n 上比较 real-exec pass_rate 没有意义——两次 run 的 pass 集合都不相交。

**重锚后 event case 3/18 达成 criterion #1 的 ≥3 目标**，且是最强形式（三次 attempt 全部精确命中）：

| case | 三次 attempt 的实际值 | live 锚点 | 记录的期望值 |
|---|---|---|---|
| **119** | 552 / 552 / 552 | **552** | 510（stale）|
| **125** | 4545 / 4545 / 4545 | **4545** | 4327（stale）|
| **126** | 3413512 / 3413512 / 3413512 | **3413512** | 2774223（stale）|

另外 3 个被检测到的也都算对了，只差在别处：**135** `[24099, 2409900, 24099]` 与 **057** `[24099×3]` 是同一个数的 **fen/yuan 单位差**（reference SQL 返 fen，模型除了 100 返 yuan；顺带一提 24099 恰好等于 DWS case 039 的期望值）；**136** `[482, query failed, 482]` 两次精确命中 + 一次瞬时查询失败。**6 个被检测到的 event case，计算全部正确——0 个因为「不知道表名」而失败。**

**检测边界的另一面同样清楚**：12 个未被检测到（词法无候选）的 event case 照旧崩坏——129 把事件名当表名（`FROM \`game.card.gacha\``→Table not found）、123 幻觉出 `game.yanwu.match` 后诚实拒答、124/127/130 全 null、120/128 用 DWS 表出错值。**召回是下一个瓶颈，且它的形状已经完全清楚。**

**criterion #3 在实跑中再次确认**：`ods_10000251_all_view` 出现在 **18 个 attempt**，全部属于那 6 个检测到的 event case（057/119/125/126/135/136）——**DWS case 使用它的次数为 0**。judge-only 与 real-exec 两次 run 一致。

### Verdict（成功标准逐条）

1. **criterion #1（event case execution_match ≥3/8）—— as-shipped UNINSTRUMENTED（0/18）；重锚后 MET（3/18，三次全精确）。** 期望值 16/18 已 stale，(a) 在 119 上生成逐字一致的 reference SQL 仍判 wrong。回填等 [GA-EVAL-CASESET-EVENT-ANCHOR](../tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md) 定口径。
2. **criterion #2 —— judge-only MET（53.8%→61.5%）；real-exec as-shipped NOT MET（7.7%→5.1%，但两次 run 的 pass 集合零重叠 → 该指标在 n=39 上是抽奖），重锚 12.8%。** 非 SQL 发射维持 0%，且**占位符 3→0**。
3. **criterion #3（0 FP，DWS 不回退）—— MET。** 探针 21/21 DWS 判 NONE（两跑一致）；judge-only + real-exec 两次实跑中 DWS case 使用 event view 的次数均为 0；6 个回退 case 逐一查明与注入无关。
4. **criterion #4（G-DA4 seam · additive · harness 不受影响）—— MET。**

**净判断**：(a) 做对了它该做的事——event schema 到位、null-SQL 降 38-43%、占位符清零、6 个可检测的 event case 计算全部正确。但**衡量它的两把尺子都是坏的**：一把（case 期望值）本票只能诊断并另开票，一把（SQL judge 的 schema context）本票已修。**下一个瓶颈是召回（6/18），且形状清楚（453 事件仅 6 个有 `alt_labels`）——不是精度。**

### Pointer

[GA-EVAL-EVENTDEF-PREFETCH](../tickets/phase-misc/GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) resolved 2026-09-06 — **PR [#38](https://github.com/McKenzieIT/deepseek-harness-da/pull/38)**（base=`fix/ga-eval-sqlgen-prompt-fix`，叠在 (d) 的 PR #26 之上；#26 merge 后 retarget master）。分支 `task/ga-eval-eventdef-prefetch` + backup。artifacts `eval-results/eventdef-{judgeonly,judgeonly-v2,realexec}.json` + `smoke119b.json`（不入 git）；审计/重锚输出入库 `research/artifacts/`。工具三件：`dev/event-detect-fp-probe.ts`、`dev/case-expected-value-audit.mjs`、`dev/reanchored-score.mjs`。**下一步**：(1) [GA-EVAL-EVENTDEF-RECALL](../tickets/phase-misc/GA-EVAL-EVENTDEF-RECALL-alt-labels-coverage.md)——召回 6/18 是下一个瓶颈，形状清楚（453 事件仅 6 个有 `alt_labels`；仓库已有 `enrichment.ts` 的 alt_labels 发现流程，先查为何只覆盖 6 个）；(2) [GA-EVAL-CASESET-EVENT-ANCHOR](../tickets/phase-misc/GA-EVAL-CASESET-EVENT-ANCHOR-stale-expected-values.md)——定锚点口径后回填 criterion #1；(3) 两者都解开才能在 real-exec 上看到数字动（n=39 + all-must-pass 使该指标目前是抽奖：两次 run 的 pass 集合零重叠）。
