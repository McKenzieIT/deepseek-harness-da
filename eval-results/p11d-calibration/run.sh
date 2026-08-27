#!/usr/bin/env bash
# P11d calibration run: SQL-only mode with few-shot judge prompt
set -euo pipefail
cd "$(dirname "$0")/../.."

export DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}')

npx tsx packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 1 \
  --skip-health-gate \
  --run-id p11d-calibration-fewshot \
  --output eval-results/p11d-calibration \
  --concurrency 4 \
  2>&1 | tee eval-results/p11d-calibration/run.log

echo ""
echo "=== Analysis ==="
npx tsx eval-results/p11d-calibration/analyze.ts eval-results/p11d-calibration/p11d-calibration-fewshot.json
