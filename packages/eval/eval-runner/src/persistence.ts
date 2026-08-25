/**
 * Result persistence: write/read run results to/from JSON files.
 *
 * The format is a single JSON file per run, at a configurable output path.
 * The file contains the full `RunResult` (run_id, timestamp, per-case verdicts,
 * summary stats).
 *
 * @module @deepseek-ai/dsh-eval-runner/persistence
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { RunResult } from './types.ts'

/**
 * Write a run result to a JSON file.
 *
 * Creates parent directories if they do not exist.
 * The output is pretty-printed for human readability.
 *
 * @param result - the run result to persist.
 * @param outputPath - the file path to write to.
 */
export function writeRunResult(result: RunResult, outputPath: string): void {
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Strip the `raw` field from case verdicts to keep output lean
  const stripped: RunResult = {
    ...result,
    cases: result.cases.map(c => {
      const { raw: _raw, ...rest } = c
      return rest
    }),
  }

  writeFileSync(outputPath, JSON.stringify(stripped, null, 2) + '\n', 'utf8')
}

/**
 * Read a run result from a JSON file.
 *
 * @param inputPath - the file path to read from.
 * @returns the parsed run result.
 * @throws if the file does not exist or is malformed.
 */
export function readRunResult(inputPath: string): RunResult {
  const text = readFileSync(inputPath, 'utf8')
  const parsed = JSON.parse(text) as RunResult
  // Basic shape validation
  if (!parsed.run_id || !parsed.timestamp || !Array.isArray(parsed.cases)) {
    throw new Error(`malformed run result at ${inputPath}: missing run_id, timestamp, or cases`)
  }
  return parsed
}

/**
 * Generate a default output path for a run result.
 *
 * @param runId - the run ID.
 * @param baseDir - the base directory for run results (default: '.eval-runs').
 * @returns the output path.
 */
export function defaultOutputPath(runId: string, baseDir: string = '.eval-runs'): string {
  return `${baseDir}/${runId}.json`
}
