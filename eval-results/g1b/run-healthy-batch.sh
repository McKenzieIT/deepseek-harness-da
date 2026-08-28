#!/bin/bash
set -e
cd /Users/mckenzie/workspace/deepseek-harness-da
export DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}')

CASES=eval-results/g1b-healthy-cases
SIDECAR=packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs
OUTPUT=eval-results/g1b
TODAY=20260827

echo "$(date) Starting G1b healthy batch runs..."

for model in qwen3.7-max qwen3.5-flash qwen3.6-plus; do
  RUN_ID="g1b-healthy-configC-${model}"
  echo ""
  echo "$(date) === Running $model (run_id=$RUN_ID) ==="
  node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
    --cases "$CASES" \
    --pass-k 3 \
    --model "$model" \
    --today "$TODAY" \
    --skip-health-gate \
    --with-query \
    --sidecar "$SIDECAR" \
    --run-id "$RUN_ID" \
    --output "$OUTPUT" 2>&1
  echo "$(date) === Completed $model ==="
done

echo ""
echo "$(date) All Config C runs complete."
echo "Results:"
for model in qwen3.7-max qwen3.5-flash qwen3.6-plus; do
  f="$OUTPUT/g1b-healthy-configC-${model}.json"
  if [ -f "$f" ]; then
    python3 -c "
import json
with open('$f') as fh:
    d = json.load(fh)
s = d['summary']
print(f'  $model: total={s[\"total\"]} correct={s[\"correct\"]} wrong={s[\"wrong\"]} rate={s[\"pass_rate\"]:.1%}')
"
  fi
done
