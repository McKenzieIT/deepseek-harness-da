# D2g — corpus recall re-test on a larger case set (term-only / topK robustness)

**Type**: research（AFK measurement——resolve via /research subagent）
**Phase**: misc（retrieval follow-up；D2 lineage）
**Status**: Unblocked（D2e resolved 2026-08-21；本票 = 验证 D2e 留的 term-only/topK 反常是否稳健）。
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
