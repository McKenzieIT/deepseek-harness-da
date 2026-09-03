/**
 * Programmatic entry for `@deepseek-ai/dsh-eval-cli`.
 *
 * Exposes the eval CLI's reusable surface so a consumer can drive an eval run
 * in-process rather than through the `dsh-eval` bin: {@link boot} builds the
 * mini Cordis context + eval-runner collaborators (the `--responder engine`
 * path), {@link resolveResponderLlmConfig} resolves the responder/judge LLM
 * from explicit input or the `EVAL_LLM_*` deployment contract (fail-loud, no
 * silent vendor fallback), and {@link main} is the argv-driven entry the bin
 * wraps. The bin (`src/bin.ts`) is a thin CLI layer over this surface.
 *
 * @module @deepseek-ai/dsh-eval-cli
 */
export { main, resolveResponderLlmConfig } from './main.ts'
export { boot, type BootOptions, type BootResult } from './context.ts'
