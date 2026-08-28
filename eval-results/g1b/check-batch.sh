#!/bin/bash
# Quick progress check for the batch run
LOG=/Users/mckenzie/workspace/deepseek-harness-da/eval-results/g1b/batch-run.log
echo "=== Batch Progress ==="
echo "Last 5 lines:"
tail -5 "$LOG" 2>/dev/null
echo ""
echo "Models completed:"
grep "=== Completed" "$LOG" 2>/dev/null || echo "  (none yet)"
echo ""
echo "Progress lines:"
grep "Progress:" "$LOG" 2>/dev/null | tail -3
echo ""
echo "Results so far:"
for model in qwen3.7-max qwen3.5-flash qwen3.6-plus; do
  f="eval-results/g1b/g1b-healthy-configC-${model}.json"
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
