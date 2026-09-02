#!/usr/bin/env bash
# Eval runner wrapper — CL-15 standard baseline mode (sql-judge ON).
#
# Loads DASHSCOPE_API_KEY from ~/.dsh/.credentials.yaml (the project's
# "secrets in file, not in env" convention — see
# wayfinder/data-agent/research/r1-dashscope-seam.md +
# G1b-experiment-execution.md) and sets the eval responder + SQL judge
# provider/model (EVAL_LLM_PROVIDER / EVAL_LLM_MODEL), then runs eval-cli
# with baseline-matching flags: --pass-k 1 --concurrency 4, sql-judge ON
# (the default; pass --no-sql-judge to opt out).
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

echo "  provider=$EVAL_LLM_PROVIDER model=$EVAL_LLM_MODEL pass-k=1 concurrency=4 sql-judge=on"
# --skip-health-gate: the health-gate pre-flight (5s budget) is mis-tuned for
# the AGA gateway's ~6-17s LLM latency — it times out before any case runs.
# Skip it here (creds + gateway reachability are validated separately; if the
# gateway were down, cases would fail/hang, not the gate).
exec node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 1 \
  --concurrency 4 \
  --skip-health-gate \
  "$@"
