#!/usr/bin/env python3
"""D2c real-RBI baseline — measure prefetch recall + ambiguity on REAL RBI data.

Faithful Python port of the shipped retrieval-inproc logic (hybrid.mjs, which
itself ports packages/{embedder,retrieval}/...: tokenize/hashVec/InferenceError/
BM25Okapi k1=1.5 b=0.75/rrfFuse k=60/cosine/buildCorpus FIELD_WEIGHTS/HybridRetriever
+ FakeHash/Broken/FakeReranker). Parses reverse-bi's real eval-cases +
rbi-semantic event corpus for scope 10000147.

Gold = event name(s) from the case SQL (`event = 'X'`). Ambiguity = the case's
schema-tagged `dimensions.ambiguity_type != 'none'` (objective, not hand-tagged).
Recall measured on cases that have a derivable gold (direct_answer w/ SQL);
ambiguity on all cases. DOCUMENTATION/measurement only — does not drive the
(decided) keep+defer; confirms it (or flips to regress) on real data.

Run: cd ~/workspace/reverse-bi && uv run python <this file>
"""
import yaml, re, hashlib, math
from pathlib import Path

RB = Path('/Users/mckenzie/workspace/reverse-bi')
SCOPE = '10000147'
EVENTS_DIR = RB / 'resources' / 'semantic-layer' / SCOPE / 'events'
CASES_DIR = RB / 'eval-cases' / SCOPE
TOPK = 5

# ---- tokenize (port of embedder/src/tokenize.ts) ----
def tokenize(text):
    if not text:
        return []
    tokens = []
    cjk = []
    asc = []

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
        is_cjk = 0x4e00 <= cc <= 0x9fff
        is_alnum = ch.isascii() and ch.isalnum()
        if is_cjk:
            flush_asc()
            cjk.append(ch)
        elif is_alnum:
            flush_cjk()
            asc.append(ch)
        else:
            flush_cjk()
            flush_asc()
    flush_cjk()
    flush_asc()
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
    dim = 256
    modelId = 'fake-hash-256'
    def embed(self, texts):
        return [hash_vec(t, 256) for t in texts]

class BrokenEmbedder:
    dim = None
    modelId = 'broken'
    def embed(self, _texts):
        raise InferenceError('unavailable', 'baseline BM25-only run')

def fake_recall(query, text):
    qt = set(tokenize(query))
    if not qt:
        return 0.0
    tt = set(tokenize(text))
    return sum(1 for t in qt if t in tt) / len(qt)

class FakeReranker:
    modelId = 'fake-recall'
    def rerank(self, query, texts):
        return [fake_recall(query, t) for t in texts]

# ---- hybrid.ts port ----
RRF_K = 60
RERANKER_NOISE_FLOOR = 0.1
DEFAULT_TOP_K = 10
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
        dot += av * bv
        na += av * av
        nb += bv * bv
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
        self.k1 = 1.5
        self.b = 0.75
        self.docs = [tokenize(d['text']) for d in corpus]
        n = len(self.docs)
        total = sum(len(d) for d in self.docs)
        self.avgdl = total / n if n else 1
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
            dl = len(doc)
            s = 0.0
            for t in qtokens:
                idf = self.idf.get(t)
                tfT = tf.get(t)
                if idf is None or tfT is None:
                    continue
                denom = tfT + self.k1 * (1 - self.b + self.b * (dl / (self.avgdl or 1)))
                s += (idf * (tfT * (self.k1 + 1))) / denom
            scores.append(max(0, s))
        return scores

class HybridRetriever:
    def __init__(self, corpus, embedder, reranker=None):
        self.corpus = build_corpus(corpus)
        self.embedder = embedder
        self.reranker = reranker
        self.bm25 = BM25Okapi(self.corpus)
        self.vecs = None
        self.vec_down = False

    def _ensure_vecs(self):
        if self.vecs is not None or self.vec_down:
            return self.vecs or []
        try:
            self.vecs = self.embedder.embed([d['text'] for d in self.corpus])
        except InferenceError:
            self.vecs = []
            self.vec_down = True
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
                fused = rrf_fuse(
                    [[self.corpus[i]['id'] for i in bm25_top], [self.corpus[i]['id'] for i in vec_top]])
                mode = 'hybrid'
                hits = [{'idx': id2idx.get(n, -1), 'score': s} for n, s in fused if id2idx.get(n, -1) >= 0][:topK]
                hits = [{'idx': h['idx'], 'score': h['score'], 'payload': self.corpus[h['idx']]['payload']} for h in hits]
            except InferenceError:
                self.vec_down = True
                mode = 'bm25-only'
                hits = [{'idx': i, 'score': bm25_scores[i], 'payload': self.corpus[i]['payload']} for i in bm25_top]
        if self.reranker and hits:
            texts = [self.corpus[h['idx']]['text'] for h in hits]
            try:
                rscores = self.reranker.rerank(query, texts)
                hits = [{'idx': h['idx'], 'score': rscores[i] if i < len(rscores) else 0, 'payload': h['payload']} for i, h in enumerate(hits)]
                hits = [h for h in hits if h['score'] >= RERANKER_NOISE_FLOOR]
                hits.sort(key=lambda h: -h['score'])
            except InferenceError:
                pass
        return [{'id': self.corpus[h['idx']]['id'], 'score': h['score'], 'payload': h['payload'], 'mode': mode} for h in hits]

# ---- reverse-bi parsing ----
def load_corpus():
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
        items.append({'id': name, 'description': raw.get('description', '') or '', 'metrics': raw.get('metrics') or {}})
    return items

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
        inp = raw.get('input') or {}
        exp = raw.get('expected') or {}
        dim = raw.get('dimensions') or {}
        meta = raw.get('meta') or {}
        sql = exp.get('sql') or ''
        sql_steps = exp.get('sql_steps') or []
        full_sql = str(sql) + '\n' + '\n'.join(str(s) for s in sql_steps)
        cases.append({
            'case_id': raw.get('case_id'),
            'question': inp.get('question', ''),
            'sql': full_sql,
            'gold': derive_gold(full_sql),
            'ambiguity_type': dim.get('ambiguity_type', 'none'),
            'query_intent': dim.get('query_intent', ''),
            'sql_complexity': dim.get('sql_complexity', ''),
            'behavior': exp.get('behavior', ''),
            'provenance': meta.get('provenance', ''),
        })
    return cases

def measure(label, embedder, reranker=None):
    corpus = load_corpus()
    r = HybridRetriever(corpus, embedder, reranker)
    cases = load_cases()
    per = []
    for c in cases:
        hits = r.retrieve(c['question'], TOPK)
        top_ids = [h['id'] for h in hits]
        gold = c['gold']
        norm_top = [norm(t) for t in top_ids]
        gold_hit = [g for g in gold if norm(g) in norm_top]
        strict = len(gold) > 0 and len(gold_hit) == len(gold)
        loose = len(gold_hit) > 0
        coverage = len(gold_hit) / len(gold) if gold else 0
        per.append({**c, 'top': top_ids, 'gold_hit': gold_hit, 'strict': strict, 'loose': loose,
                    'coverage': coverage, 'has_gold': len(gold) > 0})
    n = len(per)
    with_gold = [p for p in per if p['has_gold']]
    ng = len(with_gold)
    strict = sum(1 for p in with_gold if p['strict'])
    loose = sum(1 for p in with_gold if p['loose'])
    coverage = sum(p['coverage'] for p in with_gold) / ng if ng else 0
    ambig_n = sum(1 for p in per if p['ambiguity_type'] != 'none')
    clear = [p for p in with_gold if p['ambiguity_type'] == 'none']
    amb = [p for p in with_gold if p['ambiguity_type'] != 'none']
    print(f"\n=== {label} (topK={TOPK}, corpus={len(corpus)} events, cases={n}, with_gold={ng}) ===")
    if ng:
        print(f"strict recall (all gold in top-{TOPK}, cases-with-gold): {strict}/{ng} = {strict / ng * 100:.1f}%")
        print(f"loose recall  (any gold): {loose}/{ng} = {loose / ng * 100:.1f}%")
        print(f"gold coverage (avg): {coverage * 100:.1f}%")
    else:
        print("no cases with derivable gold")
    print(f"ambiguity rate (ambiguity_type != none, ALL {n} cases): {ambig_n}/{n} = {ambig_n / n * 100:.1f}%")
    if clear:
        cs = sum(1 for p in clear if p['strict'])
        print(f"  strict | clear: {cs}/{len(clear)} ({cs / len(clear) * 100:.1f}%)")
    if amb:
        as_ = sum(1 for p in amb if p['strict'])
        print(f"  strict | ambiguous(with-gold): {as_}/{len(amb)} ({as_ / len(amb) * 100:.1f}%)")
    print("per-case:")
    for p in per:
        mark = 'OK ' if p['strict'] else ('~  ' if p['loose'] else ('NOGOLD' if not p['has_gold'] else 'MISS'))
        print(f"  [{mark}] {p['case_id']} [{p['query_intent']}/{p['sql_complexity']}/amb={p['ambiguity_type']}/{p['behavior']}] \"{p['question']}\"")
        print(f"        gold={p['gold']} top{TOPK}={p['top']} hit={p['gold_hit']} cov={p['coverage'] * 100:.0f}%")
    return {'label': label, 'n': n, 'ng': ng, 'strict': strict, 'loose': loose, 'coverage': coverage, 'ambig': ambig_n}

a = measure('DEFAULT HYBRID (BM25 + FakeHash + RRF) — P5b production default', FakeHashEmbedder())
b = measure('BM25-ONLY (InferenceError -> degradation)', BrokenEmbedder())
c = measure('DEFAULT HYBRID + FakeReranker', FakeHashEmbedder(), FakeReranker())

print("\n=== SUMMARY ===")
for m in [a, b, c]:
    if m['ng']:
        print(f"{m['label'].split(' — ')[0]}: strict {m['strict']}/{m['ng']} ({m['strict'] / m['ng'] * 100:.1f}%) | loose {m['loose']}/{m['ng']} ({m['loose'] / m['ng'] * 100:.1f}%) | cov {m['coverage'] * 100:.1f}% | ambiguity {m['ambig']}/{m['n']} ({m['ambig'] / m['n'] * 100:.1f}%)")
    else:
        print(f"{m['label']}: no-gold")
print("\nNotes:")
print("- Real RBI scope 10000147: ~165-event corpus (events-only, no DWS/dim tables), 37 cases.")
print("- Gold = event name(s) from case SQL (event='X'); ambiguity = schema-tagged ambiguity_type != 'none' (objective).")
print("- Shipped retrieval-inproc FIELD_WEIGHTS{id,desc,metric} does NOT index events' params_fields (the rich semantic")
print("  content: 角色id/战力/充值元宝/...) — F4. Event ids are English/pinyin; questions are Chinese.")
print("- This is the production-DEFAULT prefetch recall (BM25+FakeHash) on real RBI NL. DOCUMENTATION/decision-evidence.")
