#!/usr/bin/env node --import tsx/esm
/**
 * Compare two eval runs: category-level deltas + case-level flips.
 *
 * Usage:
 *   node --import tsx/esm packages/eval/eval-cli/bin/compare.ts <run_id_A> <run_id_B> [--dir <path>]
 *
 * run_id can be a full UUID or a prefix (matches first file starting with it).
 */
import { compareRuns } from '../src/compare.ts'

const args = process.argv.slice(2)
const dirIdx = args.indexOf('--dir')
let dir = 'eval-results'
if (dirIdx !== -1) {
  dir = args[dirIdx + 1]!
  args.splice(dirIdx, 2)
}

if (args.length < 2) {
  console.error('Usage: compare <run_id_A> <run_id_B> [--dir <path>]')
  process.exit(1)
}

compareRuns(args[0]!, args[1]!, dir)
