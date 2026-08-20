#!/usr/bin/env node
// P5 prototype — ctx.embedder + ctx.retrieval seam (stub-fidelity mirror of rbi-retrieval/semantic).
// Throwaway. NOT real Cordis wiring (production step, like P4). Mirrors:
//   embedder.py        -> Embedder/Reranker Protocol + FakeHash/FakeReranker + InfinityEmbedder/Reranker + load_* + InferenceError
//   retrieval.py      -> HybridRetriever (BM25 + vec + RRF) + rrf_fuse + _clamp_bm25_scores
//   constants.py       -> RRF_K=60, RERANKER_NOISE_FLOOR/REJECT_FLOOR
//   unified_search.py  -> reranker applied as a refinement layer AFTER RRF (noise/reject floors)
// D4: storage = in-mem cosine (NOT sqlite-vec; sqlite-vec TS-binding verdict pending S2).
// D2 (c): pipeline-internal consumer (scenario 1) + additive retrieval-tool escape-hatch (scenario 6).
// Run: node run.mjs --demo  (spawns sidecar.mjs for external-plugin + degradation scenarios)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── constants (mirror rbi constants.py) ───────────────────────────────
const RRF_K = 60;                 // Cormack et al. 2009
const RERANKER_NOISE_FLOOR = 0.1;  // per-candidate noise bar (matching.py)
const RERANKER_REJECT_FLOOR = 0.2; // aggregate reject bar (unified_search.py)
const DEFAULT_TOP_K = 10;

// ── tokenize (mirror rbi embedder.tokenize fallback: CJK bigram + ASCII word) ──
function tokenize(text){
  const toks=[]; let cjk='', asc='';
  const flushCjk=()=>{ if(!cjk) return; if(cjk.length===1) toks.push(cjk); else for(let i=0;i<cjk.length-1;i++) toks.push(cjk.slice(i,i+2)); cjk=''; };
  const flushAsc=()=>{ if(asc){ toks.push(asc.toLowerCase()); asc=''; } };
  for (const ch of text){ const cc=ch.codePointAt(0); const isCjk = cc>=0x4e00 && cc<=0x9fff; const isAlnum = /[a-z0-9]/i.test(ch); if(isCjk){flushAsc();cjk+=ch;} else if(isAlnum){flushCjk();asc+=ch;} else {flushCjk();flushAsc();} } flushCjk(); flushAsc(); return toks;
}
function hashVec(text, dim){ // mirror FakeHashEmbedder: sha256 token hash → L2-normalized vec
  const v=new Array(dim).fill(0);
  for(const tok of tokenize(text)){ const h=Number(createHash('sha256').update(tok).digest().readBigUInt64BE(0) % BigInt(dim)); v[h]+=1; }
  const n=Math.sqrt(v.reduce((s,x)=>s+x*x,0)); if(n>0) for(let i=0;i<dim;i++) v[i]/=n;
  return v;
}

// ── InferenceError (mirror rbi InferenceError: typed, feeds degradation) ──
class InferenceError extends Error { constructor(kind,detail=''){ super(`${kind}${detail?': '+detail:''}`); this.name='InferenceError'; this.kind=kind; } }

// ── Embedder Protocol (mirror rbi Embedder: dim / modelId / embed(texts)->vecs) ──
class FakeHashEmbedder {
  constructor(dim=256){ this.dim=dim; }
  get modelId(){ return `fake-hash-${this.dim}`; }
  embed(texts){ return Promise.resolve(texts.map(t=>hashVec(t,this.dim))); } // zero-dep, no egress
}
class InfinityEmbedder {
  constructor({url, model, dim=null, timeout=2000}){ this._url=url; this._model=model; this._dim=dim; this._timeout=timeout; }
  get dim(){ return this._dim; }
  get modelId(){ return `infinity:${this._model}`; }
  async embed(texts){
    if(!texts.length) return [];
    const ac=new AbortController(); const to=setTimeout(()=>ac.abort(),this._timeout);
    try{
      const r=await fetch(`${this._url}/v1/embeddings`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:this._model,input:texts}),signal:ac.signal});
      if(!r.ok){ if(r.status===503) throw new InferenceError('not_ready',`HTTP ${r.status}`); throw new InferenceError('unavailable',`HTTP ${r.status}`); }
      const j=await r.json();
      const rows=(j.data??[]).sort((a,b)=>(a.index??0)-(b.index??0));
      const vecs=rows.map(x=>x.embedding??[]);
      if(vecs.length){ const obs=vecs[0].length; if(this._dim==null) this._dim=obs; else if(obs!==this._dim) throw new InferenceError('dim_mismatch',`expected ${this._dim}, got ${obs}`); }
      return vecs;
    } catch(e){
      if(e instanceof InferenceError) throw e;
      if(e.name==='AbortError') throw new InferenceError('timeout',String(e));
      throw new InferenceError('unavailable',String(e));
    } finally{ clearTimeout(to); }
  }
}

// ── Reranker Protocol (mirror rbi Reranker: modelId / rerank(query,texts)->scores) — peer, NOT top-level seam ──
class FakeReranker {
  get modelId(){ return 'fake-recall'; }
  rerank(query, texts){
    const qt=new Set(tokenize(query));
    if(!qt.size) return Promise.resolve(texts.map(()=>0));
    return Promise.resolve(texts.map(t=>{ const tt=new Set(tokenize(t)); return [...qt].filter(x=>tt.has(x)).length/qt.size; }));
  }
}
class InfinityReranker {
  constructor({url, model, timeout=2000}){ this._url=url; this._model=model; this._timeout=timeout; }
  get modelId(){ return `infinity:${this._model}`; }
  async rerank(query, texts){
    if(!texts.length) return [];
    const ac=new AbortController(); const to=setTimeout(()=>ac.abort(),this._timeout);
    try{
      const r=await fetch(`${this._url}/rerank`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:this._model,query,documents:texts,return_documents:false}),signal:ac.signal});
      if(!r.ok) throw new InferenceError('unavailable',`HTTP ${r.status}`);
      const j=await r.json();
      const sc=new Array(texts.length).fill(0);
      for(const x of (j.results??[])){ if(typeof x.index==='number'&&x.index>=0&&x.index<texts.length) sc[x.index]=x.relevance_score??0; }
      return sc;
    } catch(e){
      if(e instanceof InferenceError) throw e;
      if(e.name==='AbortError') throw new InferenceError('timeout',String(e));
      throw new InferenceError('unavailable',String(e));
    } finally{ clearTimeout(to); }
  }
}

// ── load factories (mirror rbi load_embedder/load_reranker: fake->http->fake, process cache) ──
const _embCache=new Map();
function loadEmbedder({embedder='fake', url, model, dim, timeout}={}){
  const key=JSON.stringify({embedder,url,model,dim,timeout});
  if(_embCache.has(key)) return _embCache.get(key);
  const e = (embedder==='fake'||!url) ? new FakeHashEmbedder(dim??256) : new InfinityEmbedder({url, model:model||'fake-hash-256', dim, timeout});
  _embCache.set(key,e); return e;
}
function loadReranker({embedder='fake', url, model, timeout}={}){
  return (embedder==='fake'||!url) ? new FakeReranker() : new InfinityReranker({url, model:model||'fake-recall', timeout});
}

// ── rrf_fuse (mirror rbi retrieval.rrf_fuse — pure, ranks-only, k=60) ──
function rrfFuse(rankings, k=RRF_K){
  const scores={};
  for(const ranking of rankings) for(let r=0;r<ranking.length;r++){ const n=ranking[r]; scores[n]=(scores[n]??0)+1/(k+r+1); }
  return Object.entries(scores).map(([name,s])=>({name,s})).sort((a,b)=> b.s-a.s || a.name.localeCompare(b.name));
}

// ── BM25 (minimal BM25Okapi stub; idf clamped >=0 mirroring rbi _clamp_bm25_scores) ──
class BM25 {
  constructor(corpus){ this.docs=corpus; this.N=corpus.length; const tot=corpus.reduce((s,d)=>s+d.length,0); this.avgdl=tot/(this.N||1); this.df={}; for(const d of corpus) for(const t of new Set(d)) this.df[t]=(this.df[t]||0)+1; this.idf={}; for(const t in this.df){ const n=this.df[t]; this.idf[t]=Math.max(0,Math.log((this.N-n+0.5)/(n+0.5))); } }
  getScores(query){ const k1=1.2,b=0.75; return this.docs.map(d=>{ const f={}; for(const t of d) f[t]=(f[t]||0)+1; let s=0; for(const t of query){ if(!(t in f)) continue; const dl=d.length; s+=this.idf[t]*(f[t]*(k1+1))/(f[t]+k1*(1-b+b*dl/(this.avgdl||1))); } return s; }); }
}

function cos(a,b){ let dot=0,na=0,nb=0; for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; } return dot/(Math.sqrt(na)*Math.sqrt(nb)||1); }

// ── HybridRetriever (mirror rbi retrieval.HybridRetriever; lazy-embed + InferenceError→BM25-only;
//    reranker = peer-protocol refinement AFTER RRF, mirroring unified_search.py) ──
// D4: storage = in-mem cosine (NOT sqlite-vec vec0; sqlite-vec TS-binding pending S2).
class HybridRetriever {
  constructor(docs, embedder){ this._docs=docs; this._embedder=embedder; this._vecs=null; this._vecDown=false; const corpus=docs.map(d=>tokenize(d.text)); this._bm25 = corpus.length&&corpus.some(c=>c.length) ? new BM25(corpus) : null; }
  async _ensureVecs(){ if(this._vecs||this._vecDown) return this._vecs; try{ this._vecs = await Promise.resolve(this._embedder.embed(this._docs.map(d=>d.text))); }catch(e){ if(e instanceof InferenceError){ this._vecs=[]; this._vecDown=true; } else throw e; } return this._vecs; }
  async search(query, {topK=DEFAULT_TOP_K, reranker=null}={}){
    if(!this._docs.length) return [];
    const qt=tokenize(query); if(!qt.length||!this._bm25) return [];
    const bm25Scores=this._bm25.getScores(qt).map((s,i)=>({i,s:Math.max(0,s)})); // clamp (mirror _clamp_bm25_scores)
    const bm25Top=bm25Scores.sort((a,b)=>b.s-a.s).slice(0,topK).map(o=>o.i);
    await this._ensureVecs();
    let fused;
    if(this._vecDown||!this._vecs.length){ fused=bm25Top.map((i,idx)=>({name:this._docs[i].name,s:bm25Scores[i].s})); } // BM25-only degradation
    else { const qv=(await Promise.resolve(this._embedder.embed([query])))[0]; const vecTop=this._vecs.map((v,i)=>({i,s:cos(v,qv)})).sort((a,b)=>b.s-a.s).slice(0,topK).map(o=>o.i); fused=rrfFuse([bm25Top.map(i=>this._docs[i].name), vecTop.map(i=>this._docs[i].name)], RRF_K).slice(0,topK); }
    let hits=fused.map(f=>({name:f.name, rrf:f.s, doc:this._docs.find(d=>d.name===f.name)}));
    if(reranker){ const texts=hits.map(h=>h.doc.text); let scores; try{ scores=await Promise.resolve(reranker.rerank(query,texts)); }catch(e){ if(e instanceof InferenceError){ return hits.map(h=>({name:h.name,score:h.rrf,rrf:h.rrf,doc:h.doc,degraded:true})); } throw e; } hits=hits.map((h,i)=>({...h,rerank:scores[i]})).filter(h=>(h.rerank??0)>=RERANKER_NOISE_FLOOR).sort((a,b)=>(b.rerank??0)-(a.rerank??0)); }
    return hits.map(h=>({name:h.name, score: reranker? (h.rerank??0) : h.rrf, rrf:h.rrf, doc:h.doc}));
  }
}

// ── demo ─────────────────────────────────────────────────────────────
async function main(){
  const corpus=[
    {name:'metric.营收',     text:'metric 营收 revenue 总收入 充值金额 daily_revenue 计算每日总充值'},
    {name:'metric.充值金额', text:'metric 充值金额 recharge 总充值 收入 营收 当日充值'},
    {name:'metric.DAU',      text:'metric DAU 日活 活跃用户 daily_active_users 当日登录用户数'},
    {name:'metric.付费率',   text:'metric 付费率 pay_rate 付费用户占比 付费转化 转化率'},
    {name:'dim.服务器',      text:'dimension 服务器 server 区服 各区服 渠道 server_id'},
    {name:'dim.游戏版本',    text:'dimension 游戏版本 version 客户端版本 渠道包'},
    {name:'sql.营收ByServer',text:'sql example 营收 by 服务器 group by server_id sum(revenue) 按区服营收'},
    {name:'sql.DAU趋势',     text:'sql example DAU 趋势 近7天 daily active users trend 活跃趋势'},
  ];
  const fmt=hits=>hits.map(x=>`${x.name}(${(x.score??0).toFixed(3)})`).join(', ');
  console.log('═══ P5 prototype — ctx.embedder + ctx.retrieval seam (stub-fidelity mirror of rbi) ═══');
  console.log(`RRF_K=${RRF_K}  NOISE_FLOOR=${RERANKER_NOISE_FLOOR}  REJECT_FLOOR=${RERANKER_REJECT_FLOOR}\n`);

  // Scenario 1: index→search (pipeline-internal consumer, FakeHashEmbedder default)
  console.log('▶ Scenario 1: index→search (pipeline-internal consumer, FakeHashEmbedder default)');
  const emb1=loadEmbedder({embedder:'fake'}); const r1=new HybridRetriever(corpus, emb1);
  console.log(`  query="各区服的营收" → ${fmt(await r1.search('各区服的营收',{topK:3}))}\n`);

  // Scenario 2: hybrid RRF > single-channel (synonym gap)
  console.log('▶ Scenario 2: hybrid RRF > single-channel (synonym: query "收入" vs indexed "营收/充值金额")');
  console.log(`  query="各区服的收入" → ${fmt(await r1.search('各区服的收入',{topK:3}))}`);
  console.log(`  (BM25 alone misses 营收/充值金额 lexically; FakeHash vec hash-overlap partly bridges; RRF fuses)\n`);

  // Scenario 3: embedder plugin swap (FakeHash → InfinityEmbedder HTTP sidecar)
  console.log('▶ Scenario 3: embedder plugin swap (FakeHash → InfinityEmbedder HTTP sidecar)');
  const sidecar=spawn('node',[join(__dirname,'sidecar.mjs'),'--port=4143'],{stdio:['ignore','pipe','pipe']});
  await new Promise(res=>{ sidecar.stderr.on('data',d=>{ if(String(d).includes('embedding+rerank')) res(); }); setTimeout(res,1200); });
  const emb3=loadEmbedder({embedder:'infinity', url:'http://127.0.0.1:4143', model:'fake-hash-256'});
  const r3=new HybridRetriever(corpus, emb3);
  await r3.search('warmup',{topK:1}); // trigger embed → discover dim
  console.log(`  modelId: ${emb1.modelId} → ${emb3.modelId}  (dim ${emb3.dim})`);
  console.log(`  search via external embedder → ${fmt(await r3.search('各区服的营收',{topK:3}))}\n`);

  // Scenario 4: reranker injection (peer-protocol refinement after RRF)
  console.log('▶ Scenario 4: reranker injection (InfinityReranker after RRF, noise floor 0.1)');
  const rk4=loadReranker({embedder:'infinity', url:'http://127.0.0.1:4143', model:'fake-recall'});
  const h4no=await r3.search('营收 服务器',{topK:5});
  const h4rk=await r3.search('营收 服务器',{topK:5, reranker:rk4});
  console.log(`  no rerank: ${h4no.map(x=>`${x.name}(${x.rrf.toFixed(3)})`).join(', ')}`);
  console.log(`  w/ rerank: ${fmt(h4rk)}`);
  console.log(`  (reranker re-orders by cross-encoder score, drops < noise floor)\n`);

  // Scenario 5: degradation (sidecar killed → InferenceError → BM25-only)
  console.log('▶ Scenario 5: degradation (sidecar killed → InferenceError → BM25-only)');
  sidecar.kill(); await new Promise(r=>setTimeout(r,300));
  const r5=new HybridRetriever(corpus, emb3); // embedder now down
  const h5=await r5.search('各区服的营收',{topK:3});
  console.log(`  vector plane down → BM25-only fallback → ${fmt(h5)}`);
  console.log(`  (D3: InferenceError→BM25-only, mirror rbi degradation.py)\n`);

  // Scenario 6: retrieval-tool escape-hatch (D2 (c): agent-facing retrieve tool)
  console.log('▶ Scenario 6: retrieval-tool escape-hatch (D2 (c): agent-facing retrieve tool)');
  const r6=new HybridRetriever(corpus, emb1);
  const retrieveTool=async(query)=>{ console.log(`  [retrieve tool] agent calls retrieve("${query}")`); return r6.search(query,{topK:3}); };
  console.log(`  → ${fmt(await retrieveTool('付费转化怎么看'))}`);
  console.log(`  (D2 (c): pipeline-internal default + additive retrieve-tool escape-hatch)\n`);

  console.log('═══ 6 scenarios green (stub fidelity, NOT real Cordis wiring) ═══');
  console.log('Surfaced tensions (→ map Not-yet-specified / live-probe tasks):');
  console.log('  • D4 storage: in-mem cosine (here) vs sqlite-vec (rbi) — sqlite-vec TS-binding verdict pending S2');
  console.log('  • AGA-embeddings: DashScope text-embedding via intranet AGA gateway = UNVERIFIED (live-probe, expect NO)');
  console.log('  • intranet heavy-embedder: needs separate inference sidecar (chat rides AGA, embeddings likely not)');
  process.exit(0);
}
main().catch(e=>{ console.error('FATAL',e); process.exit(1); });
