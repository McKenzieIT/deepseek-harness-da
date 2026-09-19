// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DashboardView, type DashboardViewProps } from '../src/client/DashboardView.tsx'
import { en, zh, type SemanticLayerKey } from '../src/client/locales.ts'

function translator(dictionary: typeof en): DashboardViewProps['t'] {
  return key => dictionary[key as SemanticLayerKey] ?? key
}

describe('DashboardView locale copy', () => {
  it.each([
    ['English', en, 'Evidence Dashboard', 'Back to workspace'],
    ['Chinese', zh, '证据看板', '返回工作区'],
  ])('renders %s dashboard labels instead of raw keys', (_locale, dictionary, title, workspaceLabel) => {
    const { container } = render(
      <DashboardView
        evidenceClient={null}
        t={translator(dictionary)}
        onNavigateToWorkspace={() => undefined}
      />,
    )

    expect(container.textContent).toContain(title)
    expect(container.textContent).toContain(workspaceLabel)
    expect(container.textContent).not.toContain('dashboard.title')
    expect(container.textContent).not.toContain('dashboard.goToWorkspace')
  })
})
