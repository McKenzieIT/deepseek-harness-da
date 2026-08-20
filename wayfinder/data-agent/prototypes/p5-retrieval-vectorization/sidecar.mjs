#!/usr/bin/env node
// P5 prototype sidecar — a tiny OpenAI-compatible embedding + rerank HTTP service.
// Throwaway stub (NOT Infinity/TEI). Mirrors rbi InfinityEmbedder wire (POST /v1/embeddings,
// OpenAI-compatible {data:[{embedding,index}]}) + InfinityReranker wire (POST /rerank,
// {results:[{index,relevance_score}]}). Deterministic hash embeddings (fake-over-HTTP).
import http from 'node:http';
import { createHash } from 'node:crypto';

const port = Number((process.argv.find(a => a.startsWith('--port=')) || '--port=4143').split('=')[1]);
const DIM = 256;

function tokenize(text){ // mirror rbi embedder.tokenize fallback: CJK bigram + ASCII word
  const toks=[]; let cjk='', asc='';
  const flushCjk=()=>{ if(!cjk) return; if(cjk.length===1) toks.push(cjk); else for(let i=0;i<cjk.length-1;i++) toks.push(cjk.slice(i,i+2)); cjk=''; };
  const flushAsc=()=>{ if(asc){ toks.push(asc.toLowerCase()); asc=''; } };
  for (const ch of text){ const cc=ch.codePointAt(0); const isCjk = cc>=0x4e00 && cc<=0x9fff; const isAlnum = /[a-z0-9]/i.test(ch); if(isCjk){flushAsc();cjk+=ch;} else if(isAlnum){flushCjk();asc+=ch;} else {flushCjk();flushAsc();} } flushCjk(); flushAsc(); return toks;
}
function hashVec(text, dim=DIM){ // mirror FakeHashEmbedder: sha256 token hash → L2-normalized vec
  const v=new Array(dim).fill(0);
  for(const tok of tokenize(text)){ const h=Number(createHash('sha256').update(tok).digest().readBigUInt64BE(0) % BigInt(dim)); v[h]+=1; }
  const n=Math.sqrt(v.reduce((s,x)=>s+x*x,0)); if(n>0) for(let i=0;i<dim;i++) v[i]/=n;
  return v;
}

const server = http.createServer((req,res)=>{
  if(req.method!=='POST'){ res.statusCode=405; return res.end('405'); }
  let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
    let j; try{ j=JSON.parse(body||'{}'); }catch{ res.statusCode=400; return res.end('400'); }
    if(req.url==='/v1/embeddings'){
      const input=j.input ?? [];
      const list = Array.isArray(input) ? input : [input];
      const data=list.map((t,i)=>({embedding:hashVec(String(t)),index:i}));
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({object:'list',data,model:j.model??'fake-hash-256'}));
    } else if(req.url==='/rerank'){
      const docs=j.documents ?? []; const q=j.query ?? '';
      const qt=new Set(tokenize(q));
      const results=docs.map((d,i)=>{ const tt=new Set(tokenize(String(d))); const sc=qt.size ? ([...qt].filter(t=>tt.has(t)).length/qt.size) : 0; return {index:i,relevance_score:sc}; });
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({results}));
    } else { res.statusCode=404; res.end('404'); }
  });
});
server.listen(port, ()=>{ console.error(`[sidecar] embedding+rerank HTTP on :${port} (OpenAI-compatible /v1/embeddings + /rerank, fake-over-HTTP)`); });
