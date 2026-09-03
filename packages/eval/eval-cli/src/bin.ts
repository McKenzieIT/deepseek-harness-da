#!/usr/bin/env node
/**
 * `dsh-eval` bin: thin CLI wrapper over the programmatic {@link main} entry.
 * Bundled to `lib/bin.js` (shebang preserved) for the published `dsh-eval` bin;
 * in dev it runs through `node --import tsx/esm src/bin.ts`.
 *
 * @module @deepseek-ai/dsh-eval-cli/bin
 */
import { main } from './index.ts'

main().then(() => {
  setTimeout(() => process.exit(0), 100)
}).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  setTimeout(() => process.exit(1), 100)
})
