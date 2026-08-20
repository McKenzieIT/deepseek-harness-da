/**
 * Case loader: parse a YAML/JSON case file + zod-validate it at the file
 * boundary (P11b decision 6). YAML is rbi's format (human-authorable, with
 * comments); JSON is zero-dep; the loader detects by extension. The loader
 * takes explicit paths — glob resolution is the host's concern (keeps this
 * library dep-light: `zod` + `yaml` only, no glob library); G1b / a future CLI
 * runner (P11c) resolves its case directory and passes the paths here.
 *
 * @module @deepseek-ai/dsh-eval/case_loader
 */

import { readFileSync } from 'node:fs'
import { load as parseYaml } from 'js-yaml'
import { EvalCaseSchema, type EvalCase } from './eval_case.ts'

/**
 * Load + validate one case from a YAML (`.yaml`/`.yml`) or JSON file.
 * @param path - the case file path.
 * @returns the validated {@link EvalCase}.
 */
export function loadCase(path: string): EvalCase {
  const text = readFileSync(path, 'utf8')
  const raw: unknown = isYamlPath(path) ? parseYaml(text) : JSON.parse(text)
  return EvalCaseSchema.parse(raw)
}

/**
 * Load + validate several cases. Duplicate `case_id`s across files fail loud
 * (a case id is the run's identity).
 * @param paths - the case file paths.
 * @returns the validated cases, in input order.
 */
export function loadCases(paths: readonly string[]): EvalCase[] {
  const cases = paths.map(loadCase)
  const seen = new Set<string>()
  for (const c of cases) {
    if (seen.has(c.case_id)) throw new Error(`duplicate case_id ${c.case_id}`)
    seen.add(c.case_id)
  }
  return cases
}

/** Whether `path` is a YAML file (`.yaml`/`.yml`); everything else parses as JSON. */
function isYamlPath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.endsWith('.yaml') || lower.endsWith('.yml')
}
