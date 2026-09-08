# AGENTS.md — Data-agent packages

These rules supplement the [package rules](../AGENTS.md). They govern data-agent-scoped experiment and eval workflows.

- **Decision-informing experiments are audited.** Persist setup (corpus/cases/scope/config + what is varied), measured numbers verbatim, verdict, fidelity caveat (any port-vs-shipped divergence in tokenizer/idf/floor/weights), and a deciding-ticket pointer to the effort's experiment-audit log (`wayfinder/semantic-layer/research/experiment-audit-log.md` for semantic-layer; equivalent per other efforts), not just ticket prose or throwaway output. Commit the probe script; the log is the durable evidence future sessions cite.
- **Every eval run MUST be recorded.** LLM outputs are non-deterministic; an unrecorded run is lost. After each: diff against the previous baseline via `packages/eval/eval-cli/bin/compare.ts`, then append a standard entry (Setup → Data verbatim → Verdict → Ticket Pointer) to the experiment-audit-log (template in `packages/eval/eval-cli/README.md`). Full batch runs only; single-case debug probes unless the result influences a decision.
