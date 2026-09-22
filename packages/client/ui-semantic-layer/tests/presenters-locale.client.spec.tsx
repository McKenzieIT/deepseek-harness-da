// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SearchSchemaRow } from '../src/client/presenters/SearchSchemaRow.tsx'
import { TriggerEvalRow } from '../src/client/presenters/TriggerEvalRow.tsx'
import type { SemanticLayerKey } from '../src/client/locales.ts'

const labels: Partial<Record<SemanticLayerKey, string>> = {
  'presenter.search.title': '已本地化搜索',
  'presenter.search.hits': '{count} 个本地化资产',
  'evidence.eval.complete': '本地化评测完成',
  'evidence.eval.passCount': '{correct}/{total} 已本地化通过',
}

const t = (key: SemanticLayerKey, params?: Record<string, unknown>): string => {
  let value = labels[key] ?? key
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}

function finished(meta: unknown): ToolCallBlock {
  return { kind: 'tool', meta } as unknown as ToolCallBlock
}

describe('semantic-layer presenter locale seats', () => {
  it('uses translated search summary copy', () => {
    const { getByText } = render(
      <SearchSchemaRow block={finished({ ok: true, hits: [] })} t={t} />,
    )
    expect(getByText('已本地化搜索')).toBeDefined()
    expect(getByText('0 个本地化资产')).toBeDefined()
  })

  it('uses translated eval completion copy', () => {
    const { container } = render(
      <TriggerEvalRow
        block={finished({
          ok: true,
          mode: 'full_run',
          runId: '123456789',
          summary: {
            total: 2,
            correct: 2,
            wrong: 0,
            declined: 0,
            unjudged: 0,
            infra_failure: 0,
            pass_rate: 1,
          },
        })}
        t={t}
      />,
    )
    expect(container.textContent).toContain('本地化评测完成')
    expect(container.textContent).toContain('2/2 已本地化通过')
  })
})
