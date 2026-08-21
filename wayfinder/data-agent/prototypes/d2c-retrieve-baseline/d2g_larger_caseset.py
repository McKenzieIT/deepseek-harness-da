#!/usr/bin/env python3
"""D2g — corpus recall re-test on a LARGER case set (term-only / topK robustness).

D2e (2026-08-21) measured enrichment variants on the faithful Bm25Linker port
(the REAL default prefetch path) on scope 10000147 ALONE (31 gold cases).
Finding: term-only (base + terminology slang, NO params) = 64.5% strict on the
real default, but 48.4% on the §7 HybridRetriever port — a rank FLIP across
tokenizers → suspected 31-case small-sample noise. params+term (pack-into-desc
×1, the shipped D2e form) = 54.8 strict / 58.1 loose on the real default, and
58.1/61.3 on the §7 port (robust floor on BOTH) → shipped.

This probe re-tests term-only vs params+term + a topK sweep (5/10/20/30) on a
LARGER case set: all 5 reverse-bi scopes (10000147 + 10000251 + 10000312 +
10000329 + 10000334) = 205 eval cases / 113 with-derivable-gold (3.6x the D2e
31-case set), to settle whether the term-only flip is a ROBUST signal or
31-case noise, and whether topK tuning changes the term-only vs params+term
comparison.

Self-contained: copies the faithful Bm25Linker port + variant builders + gold
derivation VERBATIM from
prototypes/d2c-retrieve-baseline/probe_hypotheses.py `main_linker_fidelity`
(tokenize_linker = ASCII id + CJK unigram AND bigram; BM25Okapi k1=1.5/b=0.75,
Lucene idf log(1+(n-d+0.5)/(d+0.5)); score>0 filter; FIELD_WEIGHTS
{name:3,description:1}, metric×1) so the numbers are comparable to the
D2e-audited 54.8 strict / 58.1 loose (params+term) and 64.5 (term-only, real
default) vs 48.4 (§7 port).

Variants (all BM25-only on the REAL Bm25Linker default — the faithful port,
NOT the HybridRetriever §7 port):
  - base      : shipped buildCorpus (name×3 + description×1 + metric×1)
  - params    : base + params_fields (field name + field description)
  - term      : base + terminology slang (日活/充值/付费/留存/...) — the "term-only" form
  - params+term : base + params + term (pack-into-description ×1, shipped D2e form)
  - topK sweep (5/10/20/30) on base / term / params+term — does topK change the flip?

Run: cd ~/workspace/reverse-bi && uv run python /tmp/d2g_larger_caseset.py
"""
import yaml, re, math
from pathlib import Path

RB = Path('/Users/mckenzie/workspace/reverse-bi')
SCOPES = ['10000147', '10000251', '10000312', '10000329', '10000334']
DEFAULT_TOPK = 5

# ============================================================================
# Faithful Bm25Linker port — copied VERBATIM from probe_hypotheses.py
# (main_linker_fidelity section). Ports
# packages/data/nl2sql-engine/src/bm25-linking.ts: CJK unigram+bigram tokenizer,
# BM25Okapi k1=1.5/b=0.75, Lucene idf log(1+(n-d+0.5)/(d+0.5)) (always >0),
# score>0 filter (no zero-score floor noise), FIELD_WEIGHTS {name:3,desc:1}, metric×1.
# ============================================================================
_LINKER_CJK = re.compile(r'[一-鿿]+')
_LINKER_ASCII = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')


def tokenize_linker(text):
    """Port of packages/data/nl2sql-engine/src/bm25-linking.ts `tokenize`:
    ASCII identifiers [A-Za-z_][A-Za-z0-9_]* lowercased + CJK [一-鿿]+ as
    unigram AND bigram. The REAL default prefetch tokenizer, distinct from the
    embedder bigram-only tokenizer."""
    if not text:
        return []
    tokens = [s.lower() for s in _LINKER_ASCII.findall(text)]
    for seg in _LINKER_CJK.findall(text):
        for ch in seg:
            tokens.append(ch)  # unigram
        if len(seg) > 1:
            for i in range(len(seg) - 1):
                tokens.append(seg[i:i + 2])  # bigram
    return tokens


class BM25LinkerOkapi:
    """Faithful port of nl2sql-engine `BM25Okapi`: k1=1.5/b=0.75, Lucene idf
    `log(1+(n-d+0.5)/(d+0.5))` (always >0), `score>0` filter (no floor noise).
    Corpus field weights are applied as token repetition in build_corpus_linker
    (mirrors bm25-linking.ts FIELD_WEIGHTS{name:3,description:1} + metric×1)."""

    def __init__(self, corpus):
        self.k1, self.b = 1.5, 0.75
        self.corpus = corpus
        self.docs = [tokenize_linker(d['text']) for d in corpus]
        n = len(self.docs)
        self.avgdl = (sum(len(d) for d in self.docs) / n) if n else 1
        df = {}
        for doc in self.docs:
            for t in set(doc):
                df[t] = df.get(t, 0) + 1
        self.idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}

    def search(self, query, topK=5):
        q = tokenize_linker(query)
        scored = []
        for idx, doc in enumerate(self.docs):
            tf = {}
            for t in doc:
                tf[t] = tf.get(t, 0) + 1
            dl = len(doc)
            s = 0.0
            for t in q:
                idf = self.idf.get(t)
                tfT = tf.get(t)
                if idf is None or tfT is None:
                    continue
                denom = tfT + self.k1 * (1 - self.b + self.b * (dl / (self.avgdl or 1)))
                s += (idf * (tfT * (self.k1 + 1))) / denom
            if s > 0:  # score>0 filter — no zero-score floor noise (F5 honest)
                scored.append((idx, s))
        scored.sort(key=lambda x: -x[1])
        return scored[:topK]


# Bm25Linker corpus weights: name×3 / description×1 / metric-name×1 (mirrors
# bm25-linking.ts FIELD_WEIGHTS{name:3,description:1} + metric×1 inline).
LINKER_FIELD_WEIGHTS = {'name': 3, 'description': 1}


def build_corpus_linker(items):
    """Mirrors bm25-linking.ts buildCorpus: name×3 + description×1 + metric×1."""
    out = []
    for d in items:
        parts = []
        for _ in range(LINKER_FIELD_WEIGHTS['name']):
            parts.append(d['id'])
        if d.get('description'):
            for _ in range(LINKER_FIELD_WEIGHTS['description']):
                parts.append(d['description'])
        m = d.get('metrics') or {}
        for mk in m.keys():
            parts.append(mk)  # metric ×1
        out.append({'id': d['id'], 'text': ' '.join(parts), 'payload': d})
    return out


# ============================================================================
# Variant builders — copied VERBATIM from probe_hypotheses.py
# (build_variant / params_text / domain_text).
# ============================================================================
def params_text(item):
    """field name + field description for every params_field (the rich semantic content)."""
    out = []
    for fname, fdef in (item.get('params_fields') or {}).items():
        if not isinstance(fdef, dict):
            continue
        out.append(fname)
        d = fdef.get('description', '') or ''
        if d:
            out.append(d)
    return ' '.join(out)


def domain_text(item):
    return ' '.join(list(item.get('domains') or []) + ([item['domain']] if item.get('domain') else []))


def build_variant(events, e2s, variant):
    """Return RetrievalCorpusItem-shaped list with description enriched per variant.
    pack-into-description ×1 = the shipped D2e mapping form."""
    out = []
    for ev in events:
        desc_parts = [ev['description']] if ev['description'] else []
        if variant in ('params', 'all', 'params+term'):
            pt = params_text(ev)
            if pt:
                desc_parts.append(pt)
        if variant in ('term', 'all', 'params+term'):
            for s in e2s.get(ev['id'], []):
                desc_parts.append(s)
        if variant in ('domain', 'all'):
            dt = domain_text(ev)
            if dt:
                desc_parts.append(dt)
        out.append({'id': ev['id'], 'description': ' '.join(desc_parts),
                    'metrics': ev['metrics'], 'payload': ev})
    return out


# ============================================================================
# reverse-bi loading (per-scope; mirrors probe_hypotheses.load_events /
# load_event_to_slangs / load_cases / derive_gold / norm — generalized to a scope arg).
# ============================================================================
def load_events(scope):
    edir = RB / 'resources' / 'semantic-layer' / scope / 'events'
    items = []
    for yfile in sorted(edir.rglob('*.yaml')):
        if yfile.name == '_index.yaml':
            continue
        try:
            raw = yaml.safe_load(yfile.read_text(encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(raw, dict):
            continue
        name = raw.get('name')
        if not name:
            continue
        items.append({
            'id': name,
            'description': raw.get('description', '') or '',
            'metrics': raw.get('metrics') or {},
            'params_fields': raw.get('params_fields') or {},
            'domain': raw.get('domain', '') or '',
            'domains': raw.get('domains') or [],
        })
    return items


def load_event_to_slangs(scope):
    """terminology slang -> events, inverted to event -> [slangs] (per-scope)."""
    p = RB / 'resources' / 'semantic-layer' / scope / 'terminology.yaml'
    if not p.exists():
        return {}
    raw = yaml.safe_load(p.read_text(encoding='utf-8')) or {}
    terms = raw.get('terminology') or []
    e2s = {}
    for t in terms:
        slang = t.get('slang', '') or ''
        evs = ((t.get('maps_to') or {}).get('events')) or []
        for s in re.split(r'[/,，、]', slang):
            s = s.strip()
            if not s:
                continue
            for e in evs:
                e2s.setdefault(e, []).append(s)
    # dedup preserving order
    return {e: list(dict.fromkeys(ss)) for e, ss in e2s.items()}


def derive_gold(sql):
    if not sql:
        return []
    golds = re.findall(r"event\s*=\s*'([^']+)'", sql) + re.findall(r'event\s*=\s*"([^"]+)"', sql)
    for m in re.findall(r"event\s+IN\s*\(([^)]+)\)", sql, re.I):
        golds += re.findall(r"'([^']+)'", m) + re.findall(r'"([^"]+)"', m)
    return golds


def norm(s):
    return s.replace('_', '.') if s else s


def load_cases(scope):
    cdir = RB / 'eval-cases' / scope
    cases = []
    for yfile in sorted(cdir.glob('eval_*.yaml')):
        try:
            raw = yaml.safe_load(yfile.read_text(encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(raw, dict):
            continue
        inp = raw.get('input') or {}; exp = raw.get('expected') or {}
        sql = str(exp.get('sql') or '') + '\n' + '\n'.join(str(s) for s in (exp.get('sql_steps') or []))
        cases.append({
            'case_id': raw.get('case_id'), 'scope': scope,
            'question': inp.get('question', ''), 'sql': sql,
            'gold': derive_gold(sql),
        })
    return cases


def pct(x, y):
    return f"{x}/{y}={x/y*100:.1f}%" if y else f"{x}/{y}"


# ============================================================================
# Measurement (mirrors probe_hypotheses.measure_linker; index built once per
# (scope,variant) and reused across the topK sweep).
# ============================================================================
def measure_with_index(bm, corpus_items, cases, topK):
    per = []
    for c in cases:
        hits = bm.search(c['question'], topK)
        top_ids = [corpus_items[i]['id'] for i, _ in hits]
        gold = c['gold']
        norm_top = [norm(t) for t in top_ids]
        gold_hit = [g for g in gold if norm(g) in norm_top]
        strict = len(gold) > 0 and len(gold_hit) == len(gold)
        loose = len(gold_hit) > 0
        cov = len(gold_hit) / len(gold) if gold else 0
        per.append({**c, 'top': top_ids, 'gold_hit': gold_hit, 'strict': strict,
                    'loose': loose, 'coverage': cov, 'has_gold': len(gold) > 0})
    return per


def agg_stats(per_list):
    wg = [p for p in per_list if p['has_gold']]
    ng = len(wg)
    strict = sum(1 for p in wg if p['strict'])
    loose = sum(1 for p in wg if p['loose'])
    cov = sum(p['coverage'] for p in wg) / ng if ng else 0
    return {'n': len(per_list), 'ng': ng, 'strict': strict, 'loose': loose, 'coverage': cov}


def main():
    print("=" * 82)
    print("D2g — larger case-set re-test (term-only / topK robustness)")
    print("faithful Bm25Linker port | tokenizer: ASCII id + CJK unigram+bigram |")
    print("idf log(1+x) (Lucene, always>0) | score>0 filter | {name×3,desc×1,metric×1}")
    print("| BM25-only (REAL default prefetch path, NOT the §7 HybridRetriever port)")
    print("=" * 82)

    # load per-scope data + report case-set size / gold count
    scope_data = {}
    print(f"\n{'scope':<12}{'events':<10}{'slang-ev':<10}{'cases':<8}{'gold':<8}")
    for s in SCOPES:
        events = load_events(s)
        e2s = load_event_to_slangs(s)
        cases = load_cases(s)
        ng = sum(1 for c in cases if c['gold'])
        scope_data[s] = {'events': events, 'e2s': e2s, 'cases': cases}
        print(f"{s:<12}{len(events):<10}{len(e2s):<10}{len(cases):<8}{ng:<8}")
    tot_cases = sum(len(sd['cases']) for sd in scope_data.values())
    tot_gold = sum(sum(1 for c in sd['cases'] if c['gold']) for sd in scope_data.values())
    tot_events = sum(len(sd['events']) for sd in scope_data.values())
    print(f"{'TOTAL':<12}{tot_events:<10}{'-':<10}{tot_cases:<8}{tot_gold:<8}")

    variants = ['base', 'params', 'term', 'params+term']

    # build BM25 indexes ONCE per (scope, variant) — reuse across topK sweep
    indexes = {}
    for s in SCOPES:
        ev = scope_data[s]['events']; e2s = scope_data[s]['e2s']
        for v in variants:
            corpus = build_variant(ev, e2s, v)
            indexes[(s, v)] = (BM25LinkerOkapi(build_corpus_linker(corpus)), corpus)

    # ---- per-scope (topK=5) ----
    print("\n=== per-scope (topK=5) ===  [scope 10000147 here is the D2e-comparable row]")
    print(f"{'variant':<14}{'scope':<12}{'strict':<16}{'loose':<16}{'coverage':<10}")
    per_variant_scope = {v: {} for v in variants}  # v -> scope -> per-list
    for s in SCOPES:
        cases = scope_data[s]['cases']
        for v in variants:
            bm, corpus = indexes[(s, v)]
            per = measure_with_index(bm, corpus, cases, 5)
            per_variant_scope[v][s] = per
            st = agg_stats(per)
            print(f"{v:<14}{s:<12}{pct(st['strict'], st['ng']):<16}{pct(st['loose'], st['ng']):<16}"
                  f"{st['coverage']*100:<10.1f}")

    # ---- aggregate (topK=5) ----
    print("\n=== AGGREGATE (all 5 scopes, topK=5) ===  [113 gold cases; D2e had 31]")
    print(f"{'variant':<14}{'strict':<18}{'loose':<18}{'coverage':<10}")
    agg_topk5 = {}
    for v in variants:
        all_per = []
        for s in SCOPES:
            all_per.extend(per_variant_scope[v][s])
        st = agg_stats(all_per)
        agg_topk5[v] = (st, all_per)
        print(f"{v:<14}{pct(st['strict'], st['ng']):<18}{pct(st['loose'], st['ng']):<18}"
              f"{st['coverage']*100:<10.1f}")

    # ---- topK sweep (aggregate) ----
    print("\n=== topK sweep (aggregate, base / term / params+term) ===")
    print(f"{'variant':<14}{'topK':<6}{'strict':<18}{'loose':<18}{'coverage':<10}")
    for v in ['base', 'term', 'params+term']:
        for tk in (5, 10, 20, 30):
            all_per = []
            for s in SCOPES:
                bm, corpus = indexes[(s, v)]
                per = measure_with_index(bm, corpus, scope_data[s]['cases'], tk)
                all_per.extend(per)
            st = agg_stats(all_per)
            print(f"{v:<14}{tk:<6}{pct(st['strict'], st['ng']):<18}{pct(st['loose'], st['ng']):<18}"
                  f"{st['coverage']*100:<10.1f}")

    # ---- term vs params+term strict flips (topK=5, aggregate) ----
    print("\n=== per-case strict flips: term vs params+term (topK=5, aggregate) ===")
    term_per = {p['case_id']: p for p in agg_topk5['term'][1]}
    pt_per = {p['case_id']: p for p in agg_topk5['params+term'][1]}
    n_term = 0; n_pt = 0
    for cid in sorted(term_per):
        t = term_per[cid]; p = pt_per.get(cid)
        if p and t['has_gold'] and t['strict'] != p['strict']:
            if t['strict'] and not p['strict']:
                tag = 'TERM-ONLY-GAIN '; n_term += 1
            else:
                tag = 'PT-ONLY-GAIN   '; n_pt += 1
            print(f"  {tag} {cid} [scope {t['scope']}] \"{t['question'][:40]}\"")
            print(f"        gold={t['gold']}")
            print(f"    term top5={t['top']}")
            print(f"    p+tm top5={p['top']}")
    print(f"  term-only gained={n_term} | params+term-only gained={n_pt}")


if __name__ == '__main__':
    main()
