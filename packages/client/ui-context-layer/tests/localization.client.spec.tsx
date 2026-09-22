// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ManagementChatPanel } from '../src/client/ManagementChatPanel.tsx'
import { NodeDetailPanel } from '../src/client/NodeDetailPanel.tsx'
import { OverlayToggle } from '../src/client/OverlayToggle.tsx'
import { SearchBar } from '../src/client/SearchBar.tsx'
import type { ContextLayerKey } from '../src/client/locales.ts'

const copy: Record<ContextLayerKey, string> = {
  'overlay.loading': '图谱加载中',
  'action.close': '关闭',
  'chat.title': '管理聊天',
  'chat.agent': '管理代理',
  'chat.collapse': '收起面板',
  'chat.updatingGraph': '正在更新图谱',
  'chat.messagePlaceholder': '输入消息',
  'chat.unavailablePlaceholder': '管理会话不可用',
  'chat.send': '发送消息',
  'node.close': '关闭节点面板',
  'node.domains': '业务域',
  'node.evalPassRate': '评测通过率',
  'node.insertReference': '插入聊天引用',
  'overlay.off': '关闭叠加层',
  'overlay.coverage': '覆盖率叠加层',
  'overlay.heatmap': '热力图叠加层',
  'search.placeholder': '搜索节点',
  'kind.dws': '汇总表',
  'kind.dim': '维表',
  'kind.event': '事件',
  'kind.metric': '指标',
  'kind.concept': '概念',
}

const t = (key: ContextLayerKey): string => copy[key]

describe('ui-context-layer localized copy', () => {
  it('renders translated chat and toolbar labels', () => {
    const chat = render(
      <ManagementChatPanel collapsed onToggleCollapse={() => {}} messages={[]} t={t} />,
    )
    expect(chat.getByText('管理聊天')).toBeDefined()
    chat.unmount()

    const toggle = render(<OverlayToggle mode="off" onModeChange={() => {}} t={t} />)
    expect(toggle.getByText('关闭叠加层')).toBeDefined()
    expect(toggle.getByText('覆盖率叠加层')).toBeDefined()
    expect(toggle.getByText('热力图叠加层')).toBeDefined()
    toggle.unmount()

    const search = render(<SearchBar data={null} graph={null} t={t} />)
    expect(search.getByPlaceholderText('搜索节点')).toBeDefined()
  })

  it('renders translated node-detail labels', () => {
    const { getByText, getByLabelText } = render(
      <NodeDetailPanel
        node={{ id: 'asset' as never, kind: 'dws', label: 'Asset', domains: ['sales'], evalPassRate: 0.9 }}
        onClose={() => {}}
        onInsertReference={() => {}}
        t={t}
      />,
    )
    expect(getByLabelText('关闭节点面板')).toBeDefined()
    expect(getByText('业务域')).toBeDefined()
    expect(getByText('评测通过率')).toBeDefined()
    expect(getByText('插入聊天引用')).toBeDefined()
  })
})
