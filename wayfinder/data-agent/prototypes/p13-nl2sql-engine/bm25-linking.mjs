// P13 prototype — BM25 schema-linking 检索（首期纯 BM25-only，经 P5 ctx.retrieval seam 契约）。
//
// rank-bm25 BM25Okapi 算法直译（reverse-bi libs/rbi-retrieval 用 rank_bm25.BM25Okapi +
// unified_search._FIELD_WEIGHTS per-field 权重）。jieba CJK 分词→prototype 用极简 CJK tokenizer
// （ascii word + CJK bigram + 单字；生产用 nodejieba 或 P5 seam 分词器）。向量侧禁用
// （BM25-only 配置，FakeHash 占位不参与排序）；T2/用户自部署 embedder 就绪后 swap（grilling Q2）。
//
// 消费 P5 ctx.retrieval seam 契约：retrieve(query, { topK, mode: 'bm25-only' }) → [{ id, score, payload }]
// （P5 prototype throwaway 非真接线；P13 用 seam 契约即可——map P5 决策）。per-game 约束域窄 schema
// + curated terminology → BM25 召回率本就高（retrieval-consumer-model §3c 判据）。

// 极简 CJK tokenizer（prototype；生产 nodejieba/分词器经 P5 seam）。
export function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const ascii = text.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  tokens.push(...ascii.map((s) => s.toLowerCase()));
  const cjk = text.match(/[一-鿿]+/g) || [];
  for (const seg of cjk) {
    for (const ch of seg) tokens.push(ch); // 单字
    if (seg.length > 1) {
      for (let i = 0; i < seg.length - 1; i++) tokens.push(seg.substring(i, i + 2)); // bigram
    }
  }
  return tokens;
}

// BM25Okapi（直译 rank_bm25.BM25Okapi；k1=1.5, b=0.75 默认）。
export class BM25Okapi {
  constructor(corpus, { k1 = 1.5, b = 0.75 } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = corpus.map((d) => tokenize(d.text));
    this.names = corpus.map((d) => d.id);
    this.fields = corpus.map((d) => d);
    const N = this.docs.length;
    const totalLen = this.docs.reduce((s, d) => s + d.length, 0);
    this.avgdl = N ? totalLen / N : 1;
    const df = {};
    for (const doc of this.docs) {
      const seen = new Set(doc);
      for (const t of seen) df[t] = (df[t] || 0) + 1;
    }
    this.idf = {};
    for (const [t, d] of Object.entries(df)) {
      this.idf[t] = Math.log(1 + (N - d + 0.5) / (d + 0.5));
    }
  }
  _score(queryTokens, idx) {
    const doc = this.docs[idx];
    const docLen = doc.length;
    const tf = {};
    for (const t of doc) tf[t] = (tf[t] || 0) + 1;
    let score = 0;
    for (const t of queryTokens) {
      if (this.idf[t] == null || tf[t] == null) continue;
      const denom = tf[t] + this.k1 * (1 - this.b + this.b * (docLen / this.avgdl));
      score += (this.idf[t] * (tf[t] * (this.k1 + 1))) / denom;
    }
    return score;
  }
  search(query, topK = 10) {
    const q = tokenize(query);
    const scores = this.docs.map((_, i) => ({ idx: i, score: this._score(q, i) }));
    scores.sort((a, b) => b.score - a.score);
    return scores
      .filter((s) => s.score > 0)
      .slice(0, topK)
      .map((s) => ({ id: this.names[s.idx], score: s.score, payload: this.fields[s.idx] }));
  }
}

// 构建语料（per data source：name + description + fields 拼接作 doc text）。
// per-field 权重（复刻 unified_search._FIELD_WEIGHTS 简化：name×3/metric×4/description×1）。
const FIELD_WEIGHTS = { name: 3, description: 1, metric_name: 4, event_name: 3, table_name: 3 };

export function buildCorpus(dataSources) {
  return dataSources.map((d) => {
    const parts = [];
    // name ×3
    for (let i = 0; i < (FIELD_WEIGHTS.name || 1); i++) parts.push(d.id);
    if (d.description) for (let i = 0; i < (FIELD_WEIGHTS.description || 1); i++) parts.push(d.description);
    if (d.metrics) for (const m of Object.keys(d.metrics)) parts.push(m); // metric ×4 简化为 push 一次（prototype）
    return { id: d.id, text: parts.join(' '), payload: d };
  });
}

// P5 ctx.retrieval seam 契约的薄 stub（prototype；生产 P5 seam 提供 hybrid BM25+vec+RRF）。
export class RetrievalSeamStub {
  constructor(dataSources) {
    this.bm25 = new BM25Okapi(buildCorpus(dataSources));
    this.dataSources = dataSources;
  }
  retrieve(query, { topK = 5, mode = 'bm25-only' } = {}) {
    // mode: bm25-only（向量侧禁用/FakeHash 占位不参与排序）；生产 P5 seam hybrid BM25+vec+RRF k=60。
    const hits = this.bm25.search(query, topK);
    return hits.map((hit) => {
      const src = this.dataSources.find((d) => d.id === hit.id);
      return { id: hit.id, score: hit.score, payload: src, mode };
    });
  }
}
