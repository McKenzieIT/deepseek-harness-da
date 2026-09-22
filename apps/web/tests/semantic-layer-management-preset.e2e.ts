/** Shipped Web composition coverage for the data-agent management preset. */
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-persona'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { REPO_ROOT } from './support.ts'

const DATA_AGENT_PATCH = join(REPO_ROOT, 'packages/bundle/data-agent/cordis.patch.yml')
const DATA_AGENT_PRESETS = join(REPO_ROOT, 'packages/bundle/data-agent/presets')
const MANAGEMENT_PRESET = 'semantic-layer-management'
const TOOL_MODULE_PREFIX = '@deepseek-ai/dsh-tool-'

/** Model tool names contributed by one enabled management-preset package row. */
function modelToolNames(moduleName: string): string[] {
  const packageName = moduleName.slice(TOOL_MODULE_PREFIX.length)
  if (packageName === 'goal') return ['create_goal', 'get_goal', 'update_goal']
  return [packageName.replaceAll('-', '_')]
}

let scaffold: WebScaffold | undefined

afterEach(async () => {
  await scaffold?.close()
  scaffold = undefined
})

it('activates the shipped semantic-layer management preset with its persona and declared tools', async () => {
  scaffold = await launchWebScaffold({
    deepSeekMissingCredential: true,
    extraOverlayPath: DATA_AGENT_PATCH,
    agentPresets: {
      roots: [{ path: DATA_AGENT_PRESETS, trust: 'system' }],
      default: MANAGEMENT_PRESET,
    },
  })
  const { ctx } = scaffold
  const preset = (await ctx.agentPresets.list()).find(candidate => candidate.id === MANAGEMENT_PRESET)
  expect(preset).toMatchObject({ id: MANAGEMENT_PRESET, trust: 'system' })
  expect(preset?.broken).toBeUndefined()

  const composition = (await ctx.agentPresets.compositionInventory())
    .find(candidate => candidate.id === MANAGEMENT_PRESET)
  const enabledToolModules = composition?.rows.flatMap(row => (
    row.enabled === true && row.moduleName.startsWith(TOOL_MODULE_PREFIX) ? [row.moduleName] : []
  )) ?? []
  const expectedTools = enabledToolModules.flatMap(modelToolNames).sort()
  expect(enabledToolModules).not.toContain('@deepseek-ai/dsh-tool-execute-metric')

  const handle = await ctx.agents.create({
    sessionId: SessionId('semantic-layer-management-preset'),
    setup: agentCtx => ctx.agentPresets.mount(agentCtx, MANAGEMENT_PRESET).then(() => undefined),
  })
  try {
    const assembly = await ctx.systemPrompt.assemble({ scope: handle.agent })
    const prefix = assembly.sections.find(section => section.name === PERSONA_PREFIX_SECTION)
    expect(prefix?.text).toContain('You are a semantic layer management agent powered by {{model}}.')
    expect(ctx.tools.schemas(handle.agent).map(schema => schema.name).sort()).toEqual(expectedTools)
    expect(expectedTools).not.toContain('execute_metric')
  } finally {
    await handle.dispose()
  }
}, 120_000)
