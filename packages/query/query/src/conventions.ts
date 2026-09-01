/**
 * Per-engine convention type surface (`ctx.query.getConventions()`). The four
 * convention types the abstract `QueryEngine` exposes for the nl2sql prompt
 * dialect grounding (`key_differences`/`functions`/`cast_map`/`sql_templates`)
 * + the future query guard/cost/dialect consumer.
 *
 * D1 (GA-GT2-impl): these type definitions were migrated verbatim from the
 * MaxCompute provider (`packages/query/query-maxcompute/src/conventions.ts`)
 * up into the abstract package so consumers (the nl2sql-engine) import engine
 * convention *types* from `@deepseek-ai/dsh-query`, not from a concrete
 * provider — a leaky import the B2–B5 repoint tasks close. The YAML-loading
 * *runtime* (`loadConventions`) stays the MaxCompute provider's concern (a
 * second engine would carry its own loader); only the *types* are shared. A
 * concrete `QueryEngine` subclass overrides `getConventions()` to return its
 * locally-loaded convention set.
 *
 * @module @deepseek-ai/dsh-query/conventions
 */

/**
 * A single engine SQL function exposed for the nl2sql prompt dialect
 * grounding (mirror RBI `conventions.yaml` function entries). Carries the
 * function name plus its SQL signature string for prompt injection.
 */
export interface ConventionFunction {
  readonly name: string
  readonly signature: string
}
/**
 * A logical-to-physical type cast mapping for the prompt dialect. Pairs a
 * logical type name and its human-readable meaning with the concrete engine
 * `CAST(...)` expression used in generated SQL (mirror RBI `cast_map` entries).
 */
export interface ConventionCast {
  readonly logical: string
  readonly meaning: string
  readonly cast: string
}
/**
 * A reusable engine SQL template referenced by name in generated SQL. The
 * `name` keys the template in the prompt dialect's `sql_templates` map; `sql`
 * is the parameterized template body (mirror RBI `conventions.yaml` entries).
 */
export interface ConventionTemplate {
  readonly name: string
  readonly sql: string
}
/**
 * The resolved per-engine convention set loaded from `conventions.yaml`. Bundles
 * the prompt-dialect grounding (engine name, key differences vs. other engines,
 * function list, cast map, SQL templates) for the nl2sql-engine and future
 * query-guard consumers. A concrete `QueryEngine` subclass's `getConventions()`
 * returns this shape as the single cached source of truth.
 */
export interface EngineConventions {
  readonly engine: string
  readonly key_differences: readonly string[]
  readonly functions: readonly ConventionFunction[]
  readonly cast_map: readonly ConventionCast[]
  readonly sql_templates: readonly ConventionTemplate[]
}
