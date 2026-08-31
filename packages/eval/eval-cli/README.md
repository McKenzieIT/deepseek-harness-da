# dsh-eval-cli

Standalone eval CLI for the dsh-data-agent NL2SQL pipeline. Drives eval cases against the real engine, persists results as JSON, and reports to stdout.

## Standard Eval Mode: SQL Semantic Judge

**SQL semantic judge is the standard evaluation mode** (enabled by default since CL-10). It uses an LLM to evaluate whether the generated SQL is semantically correct — checking table selection, field selection, filter conditions, aggregation logic, and overall semantics.

The older `--no-sql-judge` mode auto-passes any case that returns SQL, hiding real semantic errors (e.g., selecting the wrong table, missing JOINs, incorrect filters). It showed 100% on original cases while sql-judge revealed the true quality was 70%.

### Quality Baseline (CL-16+17, 2026-08-31)

| Category | Cases | Pass | Rate |
|---|---|---|---|
| Original | 80 | 64 | 80.0% |
| Alias | 40 | 30 | 75.0% |
| Voice EXEC | 30 | 21 | 70.0% |
| Voice DELIVERY | 18 | 14 | 77.8% |
| **Total** | **168** | **129** | **76.8%** |

Run ID: `1510b3e0-e9c8-4a62-b568-6535e70797be`

Previous baseline (CL-11~14): `10320fe2` — 124/168 = 73.8%

### Quality Targets

| Metric | Current | Short-term | Mid-term | Long-term |
|---|---|---|---|---|
| Overall | 73.8% | 75%+ | 80%+ | 90%+ |
| Original | 75.0% | 78%+ | 85%+ | 90%+ |

### Category Definitions

- **Original**: 80 core K11 business questions (metric lookup, aggregation, filtering)
- **Alias**: 40 cases using business terminology aliases (tests retrieval enrichment quality)
- **Voice EXEC**: 32 voice-style questions expecting SQL execution results (scalar_exact / row_count_range)
- **Voice DELIVERY**: 16 cases where the correct response is a clarification or refusal (llm_judge scored)

## Usage

### Run eval (standard, sql-judge enabled)

```bash
DASHSCOPE_API_KEY=<key> \
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 1 --concurrency 4 --skip-health-gate
```

### Compare two runs

```bash
node --import tsx/esm packages/eval/eval-cli/bin/compare.ts <run_id_A> <run_id_B>
```

Outputs category-level pass rate deltas and case-level flips (gained/lost). Run IDs can be prefixes (e.g., `9788424c` matches `9788424c-a167-4a19-9c72-e27ae7455f58`).

### CLI Options

| Flag | Default | Description |
|---|---|---|
| `--cases <dir>` | *(required)* | Case directory |
| `--schema <dir>` | `examples/k11-semantic-layer/` | Semantic layer definitions |
| `--output <dir>` | `eval-results/` | Output directory for result JSON |
| `--pass-k <n>` | 3 | Pass@K attempts per case |
| `--case <id>` | — | Run a single case |
| `--concurrency <n>` | 1 | Parallel case execution |
| `--no-sql-judge` | *(off)* | Disable SQL semantic judge (not recommended) |
| `--skip-health-gate` | *(off)* | Skip health gate pre-flight |
| `--responder <mode>` | `engine` | `engine` (NL2SQL pipeline) or `harness` (full agent) |
| `--variant <A\|B\|C\|D>` | — | G1b experiment variant (required with `--responder harness`) |

## Recording Results

After each eval run, record the results in `wayfinder/semantic-layer/research/experiment-audit-log.md` using this template:

```markdown
## YYYY-MM-DD: <ticket/change description>

### Setup

- **基线**: Run `<baseline_run_id>`
- **Cases**: <count> K11 cases
- **Model**: <provider>/<model>, <responder mode>, pass_k=<n>, concurrency=<n>, sql-judge enabled
- **变更**: <what changed>

### Data (verbatim)

<paste compare.ts output or manual category table>

### Verdict

<numbered analysis of results>

### Ticket Pointer

Resolves: [<ticket>](link)
```
