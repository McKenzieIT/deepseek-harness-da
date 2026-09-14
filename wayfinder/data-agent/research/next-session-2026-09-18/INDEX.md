# Next Session 2026-09-18 — Design Recon Index

| Key | Recommendation | Confidence | Summary |
|-----|----------------|------------|---------|
| um4 | Land the OBSERVER-FIX in the data-agent layer (additive pendingSwitch accessor + agent/pre-step await guard + scopeChainSnapshotOf); capture JSONL turn/end reason FIRST. | high | Preset-switch race fix: pendingSwitch accessor + pre-step guard + scope snapshot; JSONL capture confirms disposed vs error. |
| readme-fix | F1 — rename the 16 collision ZH 概述→Overview, insert Summary 概述, rebuild TOC, re-thread anchors (generator's natural path). | high | README skeleton fix: rename 16 ZH 概述→Overview + insert Summary so both sides = 6 H2/4 TOC; idempotent, signature-safe. |
| um15-s2 | (ERROR — recon subagent did not emit a structured result) | — | Recon failed: subagent completed without calling StructuredOutput after 2 nudges; re-run required. |
| um15-s4 | CONFIRM Phase-6 §4 deferral; refine promo site to decision-aware, track suppressed findings, forbid dual expiry; pair §4 with §2 knownRed[] schema. | high | Waiver expiry: add expiresOn/expiresAfterSyncs to Waiver, decision-aware zero-hit loop, re-surface suppressed findings; pair §4+§2. |
| lint-b | Land eval-independent remainder NOW (Bucket ii WAIVE 34 + Bucket iii KEEP 15 + durable gate w/ 6-eval-cli allowlist); HOLD Bucket i for eval-team ack. | high | oxlint fence: OXC_LOG=debug unmatched harvest folded into run-oxlint.ts (CI-only); waive 34, keep 15, allowlist 6 eval-cli. |
