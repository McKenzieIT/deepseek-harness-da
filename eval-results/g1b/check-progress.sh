#!/bin/bash
cd /Users/mckenzie/workspace/deepseek-harness-da
echo "=== G1b Batch Progress ==="
echo ""

# Check if still running
if ps aux | grep "g1b-run" | grep -v grep > /dev/null 2>&1; then
  echo "Status: RUNNING"
else
  echo "Status: COMPLETED (or stopped)"
fi
echo ""

# Show last progress line
echo "Latest progress:"
grep -E "Progress:|Completed|Starting|Finished|COMPLETE" eval-results/g1b/run.log 2>/dev/null | tail -5
echo ""

# Count completed results
echo "Result files:"
ls eval-results/g1b/g1b-configC-*.json 2>/dev/null | while read f; do
  model=$(basename "$f" .json | sed 's/g1b-configC-//')
  echo "  ✅ $model"
done
