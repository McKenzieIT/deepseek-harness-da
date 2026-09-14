import { clientBundle } from '../tsdown.client.ts'
import type { UserConfig } from 'tsdown'

const build = clientBundle('@deepseek-ai/dsh-client-ui-present-table', ['lib/types/index.js'])

// Disable code-splitting: tsdown/rolldown chunks large inlined deps
// (@tanstack/react-virtual, chart.js, react-chartjs-2) into sibling .cjs
// files that the module table cannot serve — the client module table
// registers exactly one bundle per package row (lib/client.js), so a
// require("./numeric-*.cjs") hits the "not a platform seed word, not a
// materialized module" error and aborts the entire web UI boot. This
// package is the only 1 of 52 client packages that triggers splitting
// (the other 51 have smaller deps); disabling it here is the complete
// fix. See UM-DEFECT-PRESENT-TABLE-SPLIT.
export default (inlineConfig: Pick<UserConfig, 'env'>): UserConfig[] =>
  build(inlineConfig).map(config => ({ ...config, splitting: false }))
