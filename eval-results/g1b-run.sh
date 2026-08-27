#!/bin/bash
set -e
cd /Users/mckenzie/workspace/deepseek-harness-da
export DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}')
mkdir -p eval-results/g1b

echo "[$(date)] G1b Config C batch started" | tee eval-results/g1b/run.log

for model in qwen3.5-flash qwen3.6-plus qwen3.7-max; do
  echo "[$(date)] === Starting $model ===" | tee -a eval-results/g1b/run.log
  node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
    --cases packages/eval/eval/cases/k11-v2 \
    --pass-k 3 \
    --model "$model" \
    --skip-health-gate \
    --with-query \
    --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs \
    --run-id "g1b-configC-${model}" \
    --output eval-results/g1b/ \
    2>&1 | tee -a eval-results/g1b/run.log
  echo "[$(date)] === Finished $model ===" | tee -a eval-results/g1b/run.log
done

echo "[$(date)] G1b Config C batch COMPLETE" | tee -a eval-results/g1b/run.log
