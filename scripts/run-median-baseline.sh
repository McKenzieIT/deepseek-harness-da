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
# CL-22 requires the runs share the SAME CODE — and "same code" means the same
# WORKING TREE, not the same commit. tsx executes source files off disk, so a
# concurrent session editing `packages/data/nl2sql-engine/src/prompt.ts` changes
# what runs even though HEAD never moves.
#
# The 2026-09-04 attempt learned this the hard way: the driver pinned
# `HEAD=5ddbc0f8e6` and reported it as provenance, but `critic.ts` (10:50) and
# `prompt.ts` (11:00) had already been modified-and-uncommitted before run 1
# launched at 11:01, and `query-maxcompute/lib/index.js` was rebuilt at 11:54
# mid-run. The recorded HEAD was a FALSE provenance record and the run had to be
# discarded as unattributable.
#
# So this script guards the working tree, not HEAD:
#   1. refuses to start if eval-relevant paths have uncommitted changes
#   2. hashes those paths' contents and re-checks between runs
#   3. warns when not running in a dedicated git worktree (CLAUDE.md:60-67),
#      which is the only way to be immune to concurrent sessions
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

# Paths whose contents change what an eval run actually executes.
EVAL_PATHS=(
  packages/data/nl2sql-engine/src
  packages/data/semantic-layer/src
  packages/data/tool-search-data-sources/src
  packages/query/query-maxcompute/src
  packages/query/query-tool/src
  packages/eval/eval-cli/src
  packages/eval/eval-runner/src
  packages/eval/eval/src
  packages/eval/eval/cases
  examples/k11-semantic-layer
  scripts/run-eval.sh
)

# Content hash of everything that can change a run's behaviour. Unlike HEAD this
# reflects the working tree, which is what tsx actually loads.
tree_fingerprint() {
  # shellcheck disable=SC2038
  find "${EVAL_PATHS[@]}" -type f \( -name '*.ts' -o -name '*.yaml' -o -name '*.yml' -o -name '*.sh' \) 2>/dev/null \
    | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | awk '{print $1}'
}

DIRTY="$(git status --porcelain -- "${EVAL_PATHS[@]}" 2>/dev/null)"
if [ -n "$DIRTY" ]; then
  echo "✗ REFUSING TO START: eval-relevant paths have uncommitted changes." >&2
  echo "  A run against a dirty tree cannot be attributed to any commit, which is" >&2
  echo "  exactly why the 2026-09-04 attempt was discarded. Commit or stash first," >&2
  echo "  or better: run this in a dedicated worktree (CLAUDE.md:60-67)." >&2
  echo "$DIRTY" | sed 's/^/    /' >&2
  exit 4
fi

FP_AT_START="$(tree_fingerprint)"

# A worktree is the only real defence against concurrent sessions editing files.
IS_WORKTREE="no"
if [ -f .git ]; then IS_WORKTREE="yes"; fi
if [ "$IS_WORKTREE" != "yes" ]; then
  echo "⚠ WARNING: not running in a dedicated git worktree." >&2
  echo "  Concurrent sessions editing this tree WILL corrupt the run's provenance." >&2
  echo "  Recommended: git worktree add ../dsh-eval-baseline -b chore/eval-baseline <commit>" >&2
  echo "" >&2
fi

{
  echo "=========================================================="
  echo "median-baseline driver"
  echo "  started      : $(date '+%F %T')"
  echo "  HEAD         : $HEAD_AT_START"
  echo "  tree fp      : $FP_AT_START  (provenance: working tree, not HEAD)"
  echo "  worktree     : $IS_WORKTREE"
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

  # Working-tree drift check. Hash, not HEAD: tsx runs files, not commits.
  FP_NOW="$(tree_fingerprint)"
  if [ "$FP_NOW" != "$FP_AT_START" ]; then
    echo "  ✗ ABORT: eval-relevant source changed mid-batch."
    echo "      fingerprint at start : $FP_AT_START"
    echo "      fingerprint now      : $FP_NOW"
    echo "    Runs on different code cannot be pooled into one median (CL-22)."
    echo "    Completed runs remain valid individually, but record the fingerprint"
    echo "    with each — HEAD alone is NOT valid provenance (see header)."
    exit 3
  fi
  NOW="$(git rev-parse HEAD)"
  if [ "$NOW" != "$HEAD_AT_START" ]; then
    echo "  note: HEAD moved ($HEAD_AT_START -> $NOW) but eval-relevant source is"
    echo "        byte-identical — continuing (doc/unrelated-package commits are fine)."
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
