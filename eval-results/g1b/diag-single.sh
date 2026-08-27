#!/bin/bash
# Diagnostic: run single case k11v2_001 with pass_k=1 to see [DIAG] output
cd /Users/mckenzie/workspace/deepseek-harness-da
export DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}')

echo "=== DIAG: single case k11v2_001 × qwen3.5-flash ==="
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --case k11v2_001 \
  --pass-k 1 \
  --model qwen3.5-flash \
  --skip-health-gate \
  --with-query \
  --sidecar packages/query/query-maxcompute/dev/maxc-sidecar-k11.mjs \
  --run-id "diag-k11v2_001" \
  --output /tmp/ \
  2>&1

echo ""
echo "=== Result ==="
python3 -c "
import json
try:
    d = json.load(open('/tmp/diag-k11v2_001.json'))
    c = d['cases'][0]
    print(json.dumps(c, indent=2, ensure_ascii=False))
except Exception as e:
    print(f'ERROR: {e}')
"
