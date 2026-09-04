#!/usr/bin/env bash
# Build a CL-22-compliant median baseline: N sequential full 168-case runs on
# frozen code, same protocol, median taken.
#
# Why sequential and never parallel: README.md's operational note records that
# concurrent load triggers AGA empty-response bursts — a conc=4 run under load
# lost 63/168 cases (raw 33.9% vs corrected 52.4%). Two eval runs at once IS
# machine load. One at a time, conc=3 each.
#
# Protocol is pinned to match run #1 of the median (`rebaseline-passk-168-clean`,
# 61.9%): pass_k=3 pass^k, conc=3, --today 20260903, sql-judge on. `--today` must
# stay pinned or date-relative cases resolve differently and the runs are not
# poolable.
#
# CL-22 requires the runs share the SAME CODE. `compare.ts`'s protocol guard
# catches pass_k/semantics drift but CANNOT see code drift, so this script
# records HEAD at start and re-checks it after each run, aborting if it moved.
#
# Usage:
#   nohup bash scripts/run-median-baseline.sh 2 > .tmp/median-baseline/driver.log 2>&1 &
#
# Arg: number of runs to add (default 2 — run #1 is the existing clean baseline).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RUNS="${1:-2}"
OUT=".tmp/median-baseline"
mkdir -p "$OUT"

HEAD_AT_START="$(git rev-parse HEAD)"
STAMP="$(date +%Y%m%d-%H%M)"

{
  echo "=========================================================="
  echo "median-baseline driver"
  echo "  started      : $(date '+%F %T')"
  echo "  HEAD         : $HEAD_AT_START"
  echo "  runs to add  : $RUNS  (run #1 = rebaseline-passk-168-clean, 61.9%)"
  echo "  protocol     : pass_k=3 pass^k, conc=3, --today 20260903, sql-judge on"
  echo "  load at start: $(uptime | sed 's/.*load averages*://')"
  echo "=========================================================="
} | tee "$OUT/driver-$STAMP.txt"

for i in $(seq 1 "$RUNS"); do
  RUN_ID="median-$STAMP-r$i"
  echo ""
  echo "---- run $i/$RUNS : $RUN_ID ----"
  echo "  start : $(date '+%F %T')"
  echo "  load  : $(uptime | sed 's/.*load averages*://')"

  # Code drift check: a moved HEAD invalidates pooling into one median.
  NOW="$(git rev-parse HEAD)"
  if [ "$NOW" != "$HEAD_AT_START" ]; then
    echo "  ✗ ABORT: HEAD moved ($HEAD_AT_START -> $NOW)."
    echo "    Runs on different code cannot be pooled into one median (CL-22)."
    echo "    Completed runs so far are still valid individually."
    exit 3
  fi

  bash scripts/run-eval.sh \
    --run-id "$RUN_ID" \
    --today 20260903 \
    > "$OUT/$RUN_ID.log" 2>&1
  RC=$?

  echo "  end   : $(date '+%F %T')  exit=$RC"
  if [ "$RC" -ne 0 ]; then
    echo "  ⚠ run exited non-zero — see $OUT/$RUN_ID.log (continuing; a partial"
    echo "    run must NOT be pooled, note it in the audit-log)"
  fi
  # Surface the summary line without needing to open the log.
  grep -iE "pass.rate|correct|Overall" "$OUT/$RUN_ID.log" 2>/dev/null | tail -3 | sed 's/^/    /'
done | tee -a "$OUT/driver-$STAMP.txt"

{
  echo ""
  echo "=========================================================="
  echo "driver finished $(date '+%F %T')"
  echo "HEAD unchanged: $HEAD_AT_START"
  echo ""
  echo "Next: compare each new run against run #1 and take the median."
  echo "  node --import tsx/esm packages/eval/eval-cli/bin/compare.ts \\"
  echo "    rebaseline-passk-168-clean median-$STAMP-r1 \\"
  echo "    --dir packages/eval/eval-cli/eval-results"
  echo ""
  echo "Then append a median entry (3 run ids + per-category median + range) to"
  echo "wayfinder/data-agent/research/experiment-audit-log.md — CL-22 requires"
  echo "all run ids be recorded, and AGENTS.md requires every run be logged."
  echo "=========================================================="
} | tee -a "$OUT/driver-$STAMP.txt"
