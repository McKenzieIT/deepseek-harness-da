#!/usr/bin/env bash
# Eval runner wrapper — CL-15 standard baseline mode (sql-judge ON).
#
# Loads DASHSCOPE_API_KEY from ~/.dsh/.credentials.yaml (the project's
# "secrets in file, not in env" convention — see
# wayfinder/data-agent/research/r1-dashscope-seam.md +
# G1b-experiment-execution.md) and sets the eval responder + SQL judge
# provider/model (EVAL_LLM_PROVIDER / EVAL_LLM_MODEL), then runs eval-cli
# with --concurrency 3 and sql-judge ON (the default; pass --no-sql-judge to
# opt out). pass_k is NOT pinned here: the CLI default is 3, which is the
# SPEC §6.5 / D9 Q2 semantics (pass^k — all k attempts must pass) and matches
# the current baseline `rebaseline-passk-168-clean` (61.9%).
#
# This wrapper used to pin `--pass-k 1` "to match the baseline". That was
# circular — the baseline was k=1 because the wrapper was k=1 — and it went
# stale when the pass^k baseline landed (2026-09-03/04), leaving anyone who
# ran this script with a number ~12pp above the recorded baseline and silently
# incomparable to it.
#
# --concurrency 3 (was 4): README.md's operational note records that conc=4
# under machine load triggers AGA empty-response bursts — a 168-case conc=4 run
# lost 63/168 cases that way (raw 33.9% vs corrected 52.4%). The clean baseline
# `rebaseline-passk-168-clean` used conc=3. The wrapper now matches the guidance
# it was contradicting. k=1 measures "can it pass"; pass^k measures "does it
# pass reliably" — 31.5% of k11-v2 cases are non-deterministic, which k=1
# cannot see. Pass `--pass-k 1` explicitly if you specifically want the old
# capability-only number.
#
# Usage:
#   bash scripts/run-eval.sh                       # full 168-case run
#   bash scripts/run-eval.sh --case voice_017      # single case
#   bash scripts/run-eval.sh --no-sql-judge        # disable sql-judge
#   EVAL_LLM_MODEL=qwen3.6-plus bash scripts/run-eval.sh   # override model
#
# Compare against a baseline run (UUID prefix ok):
#   node --import tsx/esm packages/eval/eval-cli/bin/compare.ts 10320fe2 <new_run_id>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CRED_FILE="${HOME}/.dsh/.credentials.yaml"
if [ ! -f "$CRED_FILE" ]; then
  echo "eval: missing $CRED_FILE (DASHSCOPE credentials)" >&2
  exit 1
fi
export DASHSCOPE_API_KEY="$(grep DASHSCOPE_API_KEY "$CRED_FILE" | awk '{print $2}')"
if [ -z "${DASHSCOPE_API_KEY:-}" ]; then
  echo "eval: DASHSCOPE_API_KEY not found in $CRED_FILE" >&2
  exit 1
fi
export EVAL_LLM_PROVIDER="${EVAL_LLM_PROVIDER:-aga}"
export EVAL_LLM_MODEL="${EVAL_LLM_MODEL:-qwen3.7-max}"

echo "  provider=$EVAL_LLM_PROVIDER model=$EVAL_LLM_MODEL pass-k=3 concurrency=3 sql-judge=on"
# --skip-health-gate: the health-gate pre-flight (5s budget) is mis-tuned for
# the AGA gateway's ~6-17s LLM latency — it times out before any case runs.
# Skip it here (creds + gateway reachability are validated separately; if the
# gateway were down, cases would fail/hang, not the gate).
# Entry is src/bin.ts (NOT bin/eval.ts): GA-EVAL-MANIFEST-impl (ec7ee34f07)
# flipped eval-cli from src-only to build+publish and the old path stopped
# existing, which left this wrapper — the documented standard entry point —
# broken on HEAD. Mirrors the package's own `eval` script.
exec node --import tsx/esm packages/eval/eval-cli/src/bin.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --concurrency 3 \
  --skip-health-gate \
  "$@"
