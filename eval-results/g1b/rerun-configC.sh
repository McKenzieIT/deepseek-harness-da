#!/bin/bash
# G1b Config C full matrix re-run (post bug-fix)
# 3 models × 30 cases × pass_k=3
# Fault-tolerant: no set -e, each model run uses || true
cd /Users/mckenzie/workspace/deepseek-harness-da
export DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}')

LOG=eval-results/g1b/rerun.log
echo "[$(date)] G1b Config C RERUN started (post infra-fix)" | tee "$LOG"

for model in qwen3.5-flash qwen3.6-plus qwen3.7-max; do
  echo "" | tee -a "$LOG"
  echo "[$(date)] === Starting $model ===" | tee -a "$LOG"
  node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
    --cases packages/eval/eval/cases/k11-v2 \
    --pass-k 3 \
    --model "$model" \
    --skip-health-gate \
    --with-query \
    --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs \
    --run-id "g1b-configC-${model}" \
    --output eval-results/g1b/ \
    2>&1 | tee -a "$LOG" || echo "[$(date)] WARNING: $model run exited non-zero" | tee -a "$LOG"
  echo "[$(date)] === Finished $model ===" | tee -a "$LOG"
done

echo "" | tee -a "$LOG"
echo "[$(date)] G1b Config C RERUN COMPLETE" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Quick summary
echo "=== Results ===" | tee -a "$LOG"
for model in qwen3.5-flash qwen3.6-plus qwen3.7-max; do
  f="eval-results/g1b/g1b-configC-${model}.json"
  if [ -f "$f" ]; then
    echo "$model: $(python3 -c "
import json, sys
d = json.load(open('$f'))
s = d['summary']
print(f\"pass_rate={s['pass_rate']:.1%} correct={s['correct']}/{s['total']} wrong={s['wrong']} infra={s['infra_failure']}\")
" 2>/dev/null || echo 'parse error')" | tee -a "$LOG"
  else
    echo "$model: NO RESULT FILE" | tee -a "$LOG"
  fi
done
