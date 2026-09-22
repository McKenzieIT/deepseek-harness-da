/** Exercise one generated G25a preset under Node's tsx/esm hook. */

import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Group from '@deepseek-ai/cordis-plugin-group'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { createScope } from '@deepseek-ai/dsh-scope'
import { mountPreset } from '@deepseek-ai/dsh-agent-presets'

const arm = process.argv[2]
if (arm !== 'policy' && arm !== 'floor') throw new Error('expected policy or floor')
const experiment = resolve(import.meta.dirname, '..')
const repoRoot = resolve(experiment, '../../../..')
const ctx = new Context()
ctx.baseUrl = pathToFileURL(resolve(repoRoot, 'node_modules/.pnpm/node_modules/')).href
await ctx.plugin(Loader)
ctx.loader.builtins.include = Include
ctx.loader.builtins.group = Group
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRuntime)
const { SemanticLayerService } = await import('@deepseek-ai/dsh-semantic-layer')
await ctx.plugin(SemanticLayerService, {
  semanticRoot: resolve(repoRoot, 'examples/k11-semantic-layer'),
  scopeId: '10000251',
})
const { default: IdentityService } = await import('@deepseek-ai/dsh-identity')
await ctx.plugin(IdentityService)
const { default: Audit } = await import('@deepseek-ai/dsh-audit')
await ctx.plugin(Audit, { path: join(tmpdir(), `g25a-preset-smoke-${process.pid}-${randomUUID()}.db`) })
const resultCacheMemory = await import('@deepseek-ai/dsh-result-cache-memory')
await ctx.plugin(resultCacheMemory)
const { default: DataPythonCodeRuntime } = await import('@deepseek-ai/dsh-code-runtime-data-python')
await ctx.plugin(DataPythonCodeRuntime)
const scope = createScope(ctx, { g25aPresetSmoke: arm })
try {
  await mountPreset(scope.ctx, {
    id: arm,
    trust: 'user',
    path: resolve(experiment, `presets/${arm}/agent.cordis.yml`),
  })
  process.stdout.write('mounted\n')
} finally {
  await scope.dispose()
}
