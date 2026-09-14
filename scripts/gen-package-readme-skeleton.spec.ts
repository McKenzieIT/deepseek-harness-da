import { describe, expect, it } from 'vitest'
import { extractPairPlan, insertAnchorsBeforeHeadings, insertSkeleton } from './gen-package-readme-skeleton.ts'

const EN = {
  summary: 'Summary',
  toc: 'Table of Contents',
  devNote: 'Dev Note',
  modelExperience: 'Model Experience',
  summaryPlaceholder: 'Summary placeholder.',
  devNoteBody: 'None.',
} as const

describe('package README skeleton generation', () => {
  it.each(['```', '~~~'])('ignores %s fenced headings and reuses existing anchors', (fence) => {
    const en = [
      '## Summary',
      '',
      `${fence}markdown`,
      '## Example heading',
      fence,
      '',
      '## Model Experience',
    ].join('\n')
    const zh = [
      '## 概述',
      '',
      `${fence}markdown`,
      '## 示例标题',
      fence,
      '',
      '<a id="model-experience"></a>',
      '## 模型经验',
    ].join('\n')
    const plan = extractPairPlan(en, zh)

    expect(plan.enHeadings).toEqual(['Summary', 'Model Experience'])
    expect(plan.zhHeadings).toEqual(['概述', '模型经验'])
    const once = insertAnchorsBeforeHeadings(zh, plan.zhHeadings, plan.slugs)
    expect(once).not.toContain(`${fence}markdown\n<a id=`)
    expect(once.match(/<a id="model-experience"><\/a>/g)).toHaveLength(1)
    expect(insertAnchorsBeforeHeadings(once, plan.zhHeadings, plan.slugs)).toBe(once)
  })

  it('places a missing table of contents after an existing Summary and remains idempotent', () => {
    const source = [
      '# Example',
      '',
      'English | [中文](README.zh.md)',
      '',
      '## Summary',
      '',
      'Existing summary.',
      '',
      '## Usage',
      '',
      'Use it.',
      '',
    ].join('\n')
    const insertion = {
      words: EN,
      description: 'Example package.',
      language: 'en' as const,
      summarySlug: 'summary',
      tocSlug: 'table-of-contents',
      devNoteSlug: 'dev-note',
      existingHeadingSlugs: ['summary', 'usage'],
    }
    const once = insertSkeleton(source, insertion)

    expect(once.indexOf('## Summary')).toBeLessThan(once.indexOf('## Table of Contents'))
    expect(insertSkeleton(once, insertion)).toBe(once)
  })
})
