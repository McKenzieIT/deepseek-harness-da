# D2g — corpus recall re-test on a larger case set (term-only / topK robustness)

**Type**: research（AFK measurement——resolve via /research subagent）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Resolved（2026-08-21，wayfinder D2g research session——term-only 稳健高召回信号 confirmed；resolution 见下）。
**Graduated from**: [D2e](D2e-corpus-enrichment.md)（resolved 2026-08-21）——D2e 发现 term-only 在 real default 上 64.5%（高于 params+term 54.8%）但 §7 port 上 48.4%（跨 tokenizer 翻转），判 31-case 噪声；topK=20→64.5%。本票在更大 case 集上重测定夺。

**Question**: 在更大 case 集（多 scope / 更多 gold case）上重测 corpus recall variants（term-only / params+term / topK sweep），判定 term-only 的 64.5% 是稳健信号（值得 ship/可配）还是小样本噪声（params+term 是稳健选择）。结果入 [experiment-audit-log](../../research/experiment-audit-log.md)。

**fed by（D2e 证据）**：[experiment-audit-log](../../research/experiment-audit-log.md) D2e 条目——
- real Bm25Linker default：base 41.9% / params 51.6% / term 64.5% / params+term 54.8% strict·58.1% loose / topK=20 64.5%。
- term-only 跨 tokenizer 翻转（64.5% real vs 48.4% §7 port）→ 疑 31-case 噪声。
- params+term 在两 tokenizer 都抬 floor（稳健）→ D2e shipped。

**Design（方法论复用 [probe_hypotheses.py](../../prototypes/d2c-retrieve-baseline/probe_hypotheses.py)）**：
- **case 集**：reverse-bi 多 scope（10000147 + 10000312 + 其他可达 scope）`eval-cases/<scope>/eval_*.yaml`；gold 从 `expected.sql` 的 `event='X'` 派生；目标 >100 gold cases（31→>3x）降小样本噪声。
- **variants**：base / params / term / params+term（pack ×1，shipped 形态）+ term-only + topK sweep（5/10/20/30），全 BM25-only on real Bm25Linker default（faithful port，`main_linker_fidelity`）。
- **判定**：term-only vs params+term 在更大集上是否仍翻转/差距；若 term-only 稳健更高 → 作 future data-quality 优化（可配 term/params+term，或调 topK）；若仍翻转/噪声 → 确认 params+term 是稳健选择（D2e 决策稳）。**不改 D2e shipped 决策**（params+term 已 ship + 抬 floor）；本票只测 + 文档化是否值得 follow-up 优化。
- **结果入审计**：append 到 [experiment-audit-log](../../research/experiment-audit-log.md)（setup + 数据 verbatim + verdict + fidelity + pointer），per AGENTS.md「Decision-informing experiments are audited」。

**Scope/边界**：本票只测量 + 文档化（research，不 ship 代码）；**不**改 D2e shipped enrichment；**不**测 regress 门槛；**不**上 real embedder。若发现稳健更优形态 → 毕业 build 票（调 config / topK / term-only 可配）。

**Blocked by**: 无（probe + reverse-bi 数据可达）。

**关联**: [D2e](D2e-corpus-enrichment.md)（产本票——term-only/topK 反常）；[experiment-audit-log](../../research/experiment-audit-log.md)（D2e 证据 + 本票结果去处）；[probe_hypotheses.py](../../prototypes/d2c-retrieve-baseline/probe_hypotheses.py)（methodology）。

## Resolution（resolved 2026-08-21）

Re-measured term-only vs params+term + topK sweep (5/10/20/30) on a LARGER case set — all 5 reverse-bi scopes (10000147 + 10000251 + 10000312 + 10000329 + 10000334) = 4217 events / 205 eval cases / 113 with-derivable-gold (3.6x the D2e 31-case set; gold derived from `expected.sql` `event='X'` + `event IN (...)`). Probe = `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py` — copies the faithful Bm25Linker port from `probe_hypotheses.py` `main_linker_fidelity` verbatim (CJK unigram+bigram tokenizer, BM25Okapi k1=1.5/b=0.75, Lucene idf `log(1+(n-d+0.5)/(d+0.5))`, `score>0` filter, FIELD_WEIGHTS `{name:3,desc:1}`, metric×1) + variant builders + gold derivation, generalized to per-scope + aggregate. The 10000147 per-scope row reproduces the D2e-audited numbers EXACTLY (base 41.9 / params 51.6 / term 64.5 / params+term 54.8-strict-58.1-loose), confirming port fidelity.

**Results (Bm25Linker / BM25-only, the REAL shipped default path)** — aggregate (113 gold, topK=5): base 62.8% strict / 65.5% loose; +params_fields 63.7% / 65.5%; **term-only 77.0% / 79.6%**; **params+term (shipped) 68.1% / 71.7%**. term-only beats params+term by **+8.9pp strict / +7.9pp loose** at topK=5, and wins or ties strict in **all 5 scopes** (10000147 +9.7pp, 10000251 tie-strict / +5.6pp loose, 10000312 +8.0pp, 10000329 +11.1pp, 10000334 +14.3pp). Per-case strict flips: term-only gained 13 vs params+term's 3 (net term +10) — term-only's gains are CJK-synonym bridges (道具产出→item.add, 道具消耗→item.use, 商城购买→shop.buy, 道具变动→game.item.change, 创角→game.role.create, 死亡→game.role.die) that params+term's extra param-field text dilutes via BM25 tf-saturation + length normalization (same mechanism as D2e's ×3-weighting-hurts-loose finding).

topK sweep (aggregate): topK=20 still helps all variants — base 62.8→77.9 (+15.1pp), term 77.0→85.0 (+8.0pp), params+term 68.1→81.4 (+13.3pp). The term-only vs params+term gap **persists at every topK** (narrows from +8.9pp@5 to +3.6pp@20 but never reverses); best overall = **term@topK=20 = 85.0% strict / 87.6% loose**.

**Verdict: (A) term-only is a ROBUST higher-recall signal — the D2e flip was NOT 31-case noise.** On 113 gold cases (3.6x), term-only robustly beats params+term on the real Bm25Linker default (the shipped path), across all 5 scopes and all topK values, with net +10 per-case flips. The flip's cross-tokenizer nature (64.5% real vs 48.4% §7 port) was a D2e concern, but on the actual shipped tokenizer (unigram+bigram) term-only is the stable higher-recall enrichment form (the §7 bigram-only port was NOT re-measured at scale, per this ticket's real-default-only scope — remains a lower-priority non-shipped open question).

**Impact on D2e's decision**: D2e's shipped decision (params+term, pack-into-description ×1) is **NOT reversed** — params+term stays shipped for its cross-tokenizer floor robustness (term-only was only re-confirmed on the real default, not the §7 port at scale). D2e's enrichment corpus stays shipped (dormant) as-is. **Follow-up warranted**: graduate a build ticket to (a) make term-only a selectable enrichment form (the higher-recall option on the shipped tokenizer) and/or (b) raise the default prefetch topK toward 20 (helps all variants; base alone goes 62.8→77.9). Both are data-quality/config optimizations, not regress-gate changes (the 85-90% regress bar is still not met by any BM25-only variant — term@topK=20 = 85.0% strict is at the edge; real-embedder work remains the ultimate lever per D2d's 3-layer stack).

Results audited in [experiment-audit-log.md](../../research/experiment-audit-log.md) (D2g entry). Probe: `prototypes/d2c-retrieve-baseline/d2g_larger_caseset.py` (run `cd ~/workspace/reverse-bi && uv run python <path>`).
