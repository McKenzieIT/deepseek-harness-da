#!/usr/bin/env python3
"""Probe retrieval-quality hypotheses on REAL RBI scope 10000147.

Self-contained (ports core logic from run_real_rbi.py). The D2c real-RBI
baseline measured default-prefetch strict recall = 32.3% (BM25+FakeHash+RRF)
/ 41.9% (BM25-only) on scope 10000147 — far below the 85-90% regress bar.
research/d2c-keep-regress-baseline.md §7 named "F4 (params_fields not
indexed)" as the main cause. This probe INDEPENDENTLY tests several candidate
bridges the §7 framing did not isolate, by enriching the corpus `description`
slot (faithfully simulating "enrich the production corpus feed via P6b
ctx.schema -> retrieval-inproc RetrievalCorpusItem{id,description,metrics}",
which indexes description x1) and re-measuring recall:

  - base    : shipped buildCorpus (id x3 + description x1 + metric-names x4)
  - params  : base + params_fields (field name + field description)
  - term    : base + terminology slang (日活/充值/付费/留存/...) as aliases
  - domain  : base + Chinese domain names (用户生命周期/付费经济/...)
  - all     : base + params + term + domain
  - topK sweep on base (5/10/20): is the gold absent, or just ranked low?

For each variant: BM25-only (cleanest isolator; FakeHash is noise per F1) +
DEFAULT HYBRID (BM25+FakeHash+RRF = production default). DOCUMENTATION only.

Run: cd ~/workspace/reverse-bi && uv run python <this file>
"""
import yaml, re, hashlib, math
from pathlib import Path

RB = Path('/Users/mckenzie/workspace/reverse-bi')
SCOPE = '10000147'
EVENTS_DIR = RB / 'resources' / 'semantic-layer' / SCOPE / 'events'
CASES_DIR = RB / 'eval-cases' / SCOPE
TERMS_PATH = RB / 'resources' / 'semantic-layer' / SCOPE / 'terminology.yaml'
TOPK = 5

# ---- tokenize (port of embedder/src/tokenize.ts) ----
def tokenize(text):
    if not text:
        return []
    tokens, cjk, asc = [], [], []

    def flush_cjk():
        if not cjk:
            return
        s = ''.join(cjk)
        if len(s) == 1:
            tokens.append(s)
        else:
            for i in range(len(s) - 1):
                tokens.append(s[i:i + 2])
        cjk.clear()

    def flush_asc():
        if asc:
            tokens.append(''.join(asc).lower())
            asc.clear()

    for ch in text:
        cc = ord(ch)
        if 0x4e00 <= cc <= 0x9fff:
            flush_asc(); cjk.append(ch)
        elif ch.isascii() and ch.isalnum():
            flush_cjk(); asc.append(ch)
        else:
            flush_cjk(); flush_asc()
    flush_cjk(); flush_asc()
    return tokens

# ---- FakeHash (port of embedder-fakehash hashVec) ----
def hash_vec(text, dim=256):
    v = [0] * dim
    for tok in tokenize(text):
        h = int.from_bytes(hashlib.sha256(tok.encode('utf-8')).digest()[:8], 'big') % dim
        v[h] += 1
    n = math.sqrt(sum(x * x for x in v))
    if n > 0:
        v = [x / n for x in v]
    return v

class InferenceError(Exception):
    def __init__(self, kind, detail=''):
        super().__init__(f"{kind}{': ' + detail if detail else ''}")
        self.kind = kind

class FakeHashEmbedder:
    dim, modelId = 256, 'fake-hash-256'
    def embed(self, texts):
        return [hash_vec(t, 256) for t in texts]

class BrokenEmbedder:
    dim, modelId = None, 'broken'
    def embed(self, _):
        raise InferenceError('unavailable', 'BM25-only')

# ---- hybrid.ts port ----
RRF_K, RERANKER_NOISE_FLOOR, DEFAULT_TOP_K = 60, 0.1, 10
FIELD_WEIGHTS = {'id': 3, 'description': 1, 'metric': 4}

def build_corpus(items):
    out = []
    for d in items:
        parts = []
        for _ in range(FIELD_WEIGHTS['id']):
            parts.append(d['id'])
        if d.get('description'):
            for _ in range(FIELD_WEIGHTS['description']):
                parts.append(d['description'])
        m = d.get('metrics') or {}
        for mk in m.keys():
            for _ in range(FIELD_WEIGHTS['metric']):
                parts.append(mk)
        out.append({'id': d['id'], 'text': ' '.join(parts), 'payload': d})
    return out

def cosine(a, b):
    dot = na = nb = 0.0
    for i in range(max(len(a), len(b))):
        av = a[i] if i < len(a) else 0
        bv = b[i] if i < len(b) else 0
        dot += av * bv; na += av * av; nb += bv * bv
    return dot / (math.sqrt(na) * math.sqrt(nb) or 1)

def rrf_fuse(rankings, k=RRF_K):
    scores = {}
    for ranking in rankings:
        for r, name in enumerate(ranking):
            if name is None:
                continue
            scores[name] = scores.get(name, 0) + 1 / (k + r + 1)
    return sorted(scores.items(), key=lambda x: (-x[1], x[0]))

class BM25Okapi:
    def __init__(self, corpus):
        self.k1, self.b = 1.5, 0.75
        self.docs = [tokenize(d['text']) for d in corpus]
        n = len(self.docs)
        self.avgdl = (sum(len(d) for d in self.docs) / n) if n else 1
        df = {}
        for doc in self.docs:
            for t in set(doc):
                df[t] = df.get(t, 0) + 1
        self.idf = {t: max(0, math.log((n - d + 0.5) / (d + 0.5))) for t, d in df.items()}

    def get_scores(self, qtokens):
        scores = []
        for doc in self.docs:
            tf = {}
            for t in doc:
                tf[t] = tf.get(t, 0) + 1
            dl = len(doc); s = 0.0
            for t in qtokens:
                idf = self.idf.get(t); tfT = tf.get(t)
                if idf is None or tfT is None:
                    continue
                denom = tfT + self.k1 * (1 - self.b + self.b * (dl / (self.avgdl or 1)))
                s += (idf * (tfT * (self.k1 + 1))) / denom
            scores.append(max(0, s))
        return scores

class HybridRetriever:
    def __init__(self, corpus, embedder):
        self.corpus = build_corpus(corpus)
        self.embedder = embedder
        self.bm25 = BM25Okapi(self.corpus)
        self.vecs = None; self.vec_down = False

    def _ensure_vecs(self):
        if self.vecs is not None or self.vec_down:
            return self.vecs or []
        try:
            self.vecs = self.embedder.embed([d['text'] for d in self.corpus])
        except InferenceError:
            self.vecs = []; self.vec_down = True
        return self.vecs or []

    def retrieve(self, query, topK=DEFAULT_TOP_K):
        if not self.corpus:
            return []
        qt = tokenize(query)
        if not qt:
            return []
        bm25_scores = self.bm25.get_scores(qt)
        bm25_top = sorted(range(len(bm25_scores)), key=lambda i: -bm25_scores[i])[:topK]
        vecs = self._ensure_vecs()
        if self.vec_down or not vecs:
            mode = 'bm25-only'
            hits = [{'idx': i, 'score': bm25_scores[i], 'payload': self.corpus[i]['payload']} for i in bm25_top]
        else:
            try:
                qv = self.embedder.embed([query])[0]
                vec_top = sorted(range(len(vecs)), key=lambda i: -cosine(vecs[i], qv))[:topK]
                id2idx = {c['id']: i for i, c in enumerate(self.corpus)}
                fused = rrf_fuse([[self.corpus[i]['id'] for i in bm25_top],
                                  [self.corpus[i]['id'] for i in vec_top]])
                mode = 'hybrid'
                hits = [{'idx': id2idx.get(n, -1), 'score': s} for n, s in fused if id2idx.get(n, -1) >= 0][:topK]
                hits = [{'idx': h['idx'], 'score': h['score'], 'payload': self.corpus[h['idx']]['payload']} for h in hits]
            except InferenceError:
                self.vec_down = True; mode = 'bm25-only'
                hits = [{'idx': i, 'score': bm25_scores[i], 'payload': self.corpus[i]['payload']} for i in bm25_top]
        return [{'id': self.corpus[h['idx']]['id'], 'score': h['score'], 'payload': h['payload'], 'mode': mode}
                for h in hits]

# ---- reverse-bi loading (events with ALL fields + terminology) ----
def load_events():
    items = []
    for yfile in sorted(EVENTS_DIR.rglob('*.yaml')):
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

def load_event_to_slangs():
    """terminology slang -> events, inverted to event -> [slangs]."""
    raw = yaml.safe_load(TERMS_PATH.read_text(encoding='utf-8')) or {}
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
    """Return RetrievalCorpusItem-shaped list with description enriched per variant."""
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

def derive_gold(sql):
    if not sql:
        return []
    golds = re.findall(r"event\s*=\s*'([^']+)'", sql) + re.findall(r'event\s*=\s*"([^"]+)"', sql)
    for m in re.findall(r"event\s+IN\s*\(([^)]+)\)", sql, re.I):
        golds += re.findall(r"'([^']+)'", m) + re.findall(r'"([^"]+)"', m)
    return golds

def norm(s):
    return s.replace('_', '.') if s else s

def load_cases():
    cases = []
    for yfile in sorted(CASES_DIR.glob('eval_*.yaml')):
        try:
            raw = yaml.safe_load(yfile.read_text(encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(raw, dict):
            continue
        inp = raw.get('input') or {}; exp = raw.get('expected') or {}
        dim = raw.get('dimensions') or {}; meta = raw.get('meta') or {}
        sql = str(exp.get('sql') or '') + '\n' + '\n'.join(str(s) for s in (exp.get('sql_steps') or []))
        cases.append({
            'case_id': raw.get('case_id'), 'question': inp.get('question', ''), 'sql': sql,
            'gold': derive_gold(sql), 'ambiguity_type': dim.get('ambiguity_type', 'none'),
            'query_intent': dim.get('query_intent', ''), 'sql_complexity': dim.get('sql_complexity', ''),
            'behavior': exp.get('behavior', ''), 'provenance': meta.get('provenance', ''),
        })
    return cases

CASES = load_cases()

def measure(corpus_items, embedder, label, topK=TOPK):
    r = HybridRetriever(corpus_items, embedder)
    per = []
    for c in CASES:
        hits = r.retrieve(c['question'], topK)
        top_ids = [h['id'] for h in hits]
        gold = c['gold']; norm_top = [norm(t) for t in top_ids]
        gold_hit = [g for g in gold if norm(g) in norm_top]
        strict = len(gold) > 0 and len(gold_hit) == len(gold)
        loose = len(gold_hit) > 0
        cov = len(gold_hit) / len(gold) if gold else 0
        per.append({**c, 'top': top_ids, 'gold_hit': gold_hit, 'strict': strict, 'loose': loose,
                    'coverage': cov, 'has_gold': len(gold) > 0})
    wg = [p for p in per if p['has_gold']]; ng = len(wg)
    strict = sum(1 for p in wg if p['strict']); loose = sum(1 for p in wg if p['loose'])
    cov = sum(p['coverage'] for p in wg) / ng if ng else 0
    ambig_n = sum(1 for p in per if p['ambiguity_type'] != 'none')
    return {'label': label, 'n': len(per), 'ng': ng, 'strict': strict, 'loose': loose,
            'coverage': cov, 'ambig': ambig_n, 'per': per}

def pct(x, y):
    return f"{x}/{y}={x/y*100:.1f}%" if y else f"{x}/{y}"

def main():
    events = load_events()
    e2s = load_event_to_slangs()
    print(f"# events: {len(events)}  | terminology event->slangs entries: {len(e2s)}")
    print(f"# cases: {len(CASES)}  | with-gold: {sum(1 for c in CASES if c['gold'])}")
    print(f"baseline corpus/event = id x3 + description x1 + metric-names x4 (only 1 event has metrics)\n")

    variants = ['base', 'params', 'term', 'domain', 'params+term', 'all']
    rows = []
    per_base_bm = None; per_all_bm = None
    for v in variants:
        corpus = build_variant(events, e2s, v)
        # BM25-only (cleanest isolator; FakeHash is noise per F1)
        m_bm = measure(corpus, BrokenEmbedder(), f"{v}/bm25-only")
        rows.append(('bm25-only', m_bm))
        if v == 'base':
            per_base_bm = m_bm['per']
        if v == 'all':
            per_all_bm = m_bm['per']
        # production default hybrid (BM25+FakeHash+RRF)
        m_hy = measure(corpus, FakeHashEmbedder(), f"{v}/hybrid")
        rows.append(('hybrid', m_hy))

    # topK sweep on base (bm25-only): is gold absent or just ranked low?
    base_corpus = build_variant(events, e2s, 'base')
    for tk in (10, 20):
        m = measure(base_corpus, BrokenEmbedder(), f"base/bm25-only/topK={tk}", topK=tk)
        rows.append((f'topK={tk}', m))

    print("=== SUMMARY (strict = all gold in top-5, cases-with-gold) ===")
    print(f"{'variant':<28}{'config':<12}{'strict':<14}{'loose':<14}{'coverage':<10}{'ambig(all)':<12}")
    for tag, m in rows:
        print(f"{m['label'].split('/')[0]:<28}{tag:<12}{pct(m['strict'], m['ng']):<14}{pct(m['loose'], m['ng']):<14}"
              f"{m['coverage']*100:<10.1f}{pct(m['ambig'], m['n']):<12}")

    print("\n=== per-case: base/bm25-only vs all/bm25-only (strict flips) ===")
    if per_base_bm and per_all_bm:
        for b, a in zip(per_base_bm, per_all_bm):
            if b['strict'] != a['strict']:
                print(f"  {'GAINED' if a['strict'] else 'LOST  '} {b['case_id']} "
                      f"[{b['query_intent']}/{b['ambiguity_type']}] \"{b['question']}\"")
                print(f"        gold={b['gold']}")
                print(f"   base top5={b['top']}")
                print(f"     all top5={a['top']}")

# ============================================================================
# D2e extension (2026-08-21): Bm25Linker tokenizer fidelity + weighting variant
#
# D2d caveat: the §7 baseline + the variants above port `HybridRetriever` whose
# `tokenize` is the embedder bigram-only tokenizer. The REAL default prefetch
# path is `Bm25Linker` (packages/data/nl2sql-engine/src/bm25-linking.ts) — a
# DIFFERENT tokenizer (CJK unigram AND bigram), a different idf (Lucene
# log(1+x), always >0), a score>0 filter (no zero-score floor noise), and
# different corpus weights ({name:3,desc:1}, metric×1). This section mirrors
# the shipped Bm25Linker faithfully and re-measures the enrichment variants on
# the ACTUAL default path. It also adds a weighting variant (params/term
# repeated 3× = BM25 field weight via token repetition) so the D2e mapping-form
# decision (pack-into-description ×1 vs weighted ×3) is evidence-backed.
# ============================================================================
import re as _re
_LINKER_CJK = _re.compile(r'[一-鿿]+')
_LINKER_ASCII = _re.compile(r'[A-Za-z_][A-Za-z0-9_]*')


def tokenize_linker(text):
    """Port of packages/data/nl2sql-engine/src/bm25-linking.ts `tokenize`:
    ASCII identifiers [A-Za-z_][A-Za-z0-9_]* lowercased + CJK [一-鿿]+ as
    unigram AND bigram. The REAL default prefetch tokenizer, distinct from the
    embedder bigram-only tokenizer ported above."""
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


def build_variant_weighted(events, e2s, variant, weights):
    """Like build_variant but repeats params/term content `weights['params']`/
    `weights['term']` times — simulating FIELD_WEIGHTS weighting (a BM25 field
    weight IS token repetition). weights={params:1,term:1} == pack-into-desc."""
    out = []
    for ev in events:
        desc_parts = [ev['description']] if ev['description'] else []
        if variant in ('params', 'all', 'params+term'):
            pt = params_text(ev)
            for _ in range(weights.get('params', 1)):
                if pt:
                    desc_parts.append(pt)
        if variant in ('term', 'all', 'params+term'):
            for _ in range(weights.get('term', 1)):
                for s in e2s.get(ev['id'], []):
                    desc_parts.append(s)
        out.append({'id': ev['id'], 'description': ' '.join(desc_parts),
                    'metrics': ev['metrics'], 'payload': ev})
    return out


def measure_linker(corpus_items, label, topK=TOPK):
    """Measure recall on the REAL default path (Bm25Linker, BM25-only)."""
    bm = BM25LinkerOkapi(build_corpus_linker(corpus_items))
    per = []
    for c in CASES:
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
    wg = [p for p in per if p['has_gold']]
    ng = len(wg)
    strict = sum(1 for p in wg if p['strict'])
    loose = sum(1 for p in wg if p['loose'])
    cov = sum(p['coverage'] for p in wg) / ng if ng else 0
    return {'label': label, 'ng': ng, 'strict': strict, 'loose': loose, 'coverage': cov, 'per': per}


def main_linker_fidelity():
    """D2e: re-measure enrichment variants on the ACTUAL Bm25Linker default
    path (not the §7 HybridRetriever port) + a weighting variant, to (a) settle
    the D2d tokenizer-fidelity caveat and (b) evidence-back the mapping-form
    decision (pack-into-description ×1 vs weighted ×3)."""
    events = load_events()
    e2s = load_event_to_slangs()
    print("\n" + "=" * 78)
    print("D2e — Bm25Linker fidelity (REAL default prefetch path)")
    print("tokenizer: ASCII id + CJK unigram+bigram | idf log(1+x) | score>0 | {name×3,desc×1,metric×1}")
    print("=" * 78)
    rows = []
    for v in ['base', 'params', 'term', 'params+term']:
        corpus = build_variant(events, e2s, v)
        rows.append(measure_linker(corpus, f"{v}/linker/bm25-only"))
    # weighting variant: params+term repeated 3× (simulates FIELD_WEIGHTS.params=3,
    # term=3 as separate weighted fields) vs pack-into-description (×1).
    corpus_w3 = build_variant_weighted(events, e2s, 'params+term', {'params': 3, 'term': 3})
    rows.append(measure_linker(corpus_w3, 'params+term×3/linker/bm25-only'))
    # topK sweep on base under the linker tokenizer
    base_corpus = build_variant(events, e2s, 'base')
    for tk in (10, 20):
        rows.append(measure_linker(base_corpus, f"base/linker/topK={tk}", topK=tk))

    print(f"{'variant':<34}{'strict':<14}{'loose':<14}{'coverage':<10}")
    for m in rows:
        print(f"{m['label']:<34}{pct(m['strict'], m['ng']):<14}{pct(m['loose'], m['ng']):<14}"
              f"{m['coverage'] * 100:<10.1f}")

    pack = next(r for r in rows if r['label'] == 'params+term/linker/bm25-only')
    w3 = next(r for r in rows if r['label'] == 'params+term×3/linker/bm25-only')
    print("\n=== per-case: pack-into-desc(×1) vs weighted(×3) strict flips ===")
    for b, a in zip(pack['per'], w3['per']):
        if b['strict'] != a['strict']:
            print(f"  {'GAINED' if a['strict'] else 'LOST  '} {b['case_id']} \"{b['question']}\"")
            print(f"        gold={b['gold']}")
            print(f"   pack top5={b['top']}")
            print(f"  weight top5={a['top']}")

    # cross-tokenizer reconciliation: HybridRetriever port (bigram-only) vs
    # Bm25Linker (unigram+bigram) for params+term — settles the D2d caveat.
    hy = measure(build_variant(events, e2s, 'params+term'), BrokenEmbedder(),
                 'params+term/hybrid-port/bm25-only')
    print("\n=== tokenizer reconciliation (params+term, BM25-only) ===")
    print(f"  HybridRetriever port (bigram-only, §7):    {pct(hy['strict'], hy['ng'])} strict / {pct(hy['loose'], hy['ng'])} loose")
    print(f"  Bm25Linker (unigram+bigram, real default):  {pct(pack['strict'], pack['ng'])} strict / {pct(pack['loose'], pack['ng'])} loose")
    print(f"  weighted params+term×3 (real default):      {pct(w3['strict'], w3['ng'])} strict / {pct(w3['loose'], w3['ng'])} loose")
    print("  (note: the §7-port↔Bm25Linker gap conflates 4 diffs — tokenizer (bigram-only vs")
    print("   unigram+bigram), idf (max(0,log) vs log(1+x)), score>0 floor filter, field weights")
    print("   {id:3,desc:1,metric:4} vs {name:3,desc:1,metric×1}; the latter 3 are negligible for")
    print("   this 1966-event corpus (1 event has metrics; idf differs only for >50%-df tokens).")
    print("   The D2e decision is measured on the faithful Bm25Linker port, independent of this gap.)")


if __name__ == '__main__':
    main()
    main_linker_fidelity()
