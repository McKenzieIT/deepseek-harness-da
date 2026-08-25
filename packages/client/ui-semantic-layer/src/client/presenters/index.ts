/**
 * Semantic layer tool presenter registrations. Registers keyed toolview
 * components for search_schema, get_definition, get_coverage,
 * discover_relations, and trigger_eval so they render as structured cards
 * instead of generic text in the conversation.
 */
import type { Context } from '@deepseek-ai/cordis'
import { SearchSchemaRow } from './SearchSchemaRow.tsx'
import { GetDefinitionRow } from './GetDefinitionRow.tsx'
import { GetCoverageRow } from './GetCoverageRow.tsx'
import { DiscoverRelationsRow } from './DiscoverRelationsRow.tsx'
import { TriggerEvalRow } from './TriggerEvalRow.tsx'

export const semanticLayerPresenters = {
  name: 'semantic-layer-presenters',
  inject: ['slots'],
  apply(ctx: Context): void {
    ctx.slots.inject('tool.call.toolview', function* () {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'search_schema' }, SearchSchemaRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'get_definition' }, GetDefinitionRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'get_coverage' }, GetCoverageRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'discover_relations' }, DiscoverRelationsRow)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: 'trigger_eval' }, TriggerEvalRow)
    })
  },
}
