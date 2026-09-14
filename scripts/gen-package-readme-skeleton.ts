/**
 * Retrofit every package README onto the standard skeleton: a two-field
 * frontmatter block (`description`, `kind`), a `## Summary` (or `## 概述`)
 * seeded from the package manifest description, a `## Table of Contents`
 * (or `## 目录`) auto-anchored from the file's existing `## ` headings, and
 * a `## Dev Note` (or `## 开发备注`) at the end. The generator is idempotent:
 * a file that already starts with `---` keeps its frontmatter, and a heading
 * that is already present is not duplicated.
 *
 * The tool mirrors `scripts/gen-tsconfig-paths.ts`'s write/`--check` shape so
 * a stale README fails a `verify-package-readme-skeleton` gate rather than
 * silently regressing the `doc-standard.spec.ts` structure test. It shares
 * the `expectedKind()` derivation with `scripts/doc-standard.spec.ts` (same
 * `PACKAGE_LIBRARIES` audit, same `dsh.bundle.patch` probe) so the
 * generator and the gate can never disagree about a package's kind.
 *
 * Description text is sourced from each package's `package.json`
 * `description` field, per the retrofit's description policy; the tool
 * never fabricates or machine-translates. The `.zh.md` sibling prefers any
 * pre-existing Chinese description; when none exists, the tool seeds the
 * English text with a visible `TODO: translate:` marker for the owner.
 *
 * Bilingual pairing: to satisfy `verify-translation-pairing`, both the EN
 * and ZH tables of contents use identical link targets (the English slug
 * of the EN heading at that position). Each ZH heading receives a
 * preceding `<a id="english-slug"></a>` so the target resolves. This
 * mirrors the reference example `session-persistence-jsonl`.
 *
 * F1 (UM-FORK-README-SKELETON-RETROFIT): 16 of 65 target packages carry
 * an existing ZH `## 概述` that renders the EN `## Overview` (NOT a Summary).
 * The `extractPairPlan` detector reports these as `overviewCollisionIndices`;
 * `retrofitPair` renames the collision `## 概述` → `## Overview` before
 * staging so a separate Summary `## 概述` can coexist, then re-derives the
 * pair. This prevents recurrence on new packages with the same shape.
 *
 * @module scripts/gen-package-readme-skeleton
 */

import { existsSync, globSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const PACKAGE_README_GLOBS = [
  'packages/*/*/README.md',
  'packages/*/*/README.zh.md',
] as const

/**
 * Audited packages whose entry is a plain module API rather than a Cordis
 * plugin. Duplicated from `scripts/doc-standard.spec.ts` — the spec keeps
 * the annotated map for its own audit; the generator only needs the keys.
 */
const PACKAGE_LIBRARIES: ReadonlySet<string> = new Set([
  'packages/boot/app-boot',
  'packages/boot/cmdline',
  'packages/client/store',
  'packages/client/ui-primitives',
  'packages/client/ui-slots',
  'packages/client/web',
  'packages/core/scope',
  'packages/experimental/webworker-packer',
  'packages/experimental/webworker-runtime',
  'packages/hooks/hook-protocol',
  'packages/identity/anonymous-user-id',
  'packages/sandbox/sandbox-windows-acl',
  'packages/sdk/client',
  'packages/sdk/protocol',
  'packages/session/session-format',
  'packages/session/session-format-catalog',
  'packages/session/session-format-v0-to-v1',
  'packages/session/session-telemetry',
  'packages/session/session-title-llm',
  'packages/subagent/subagent-in-process-driver',
  'packages/subprocess/win32-process',
  'packages/test-support/session-snapshot',
  'packages/test-support/agent-loop-testkit',
  'packages/test-support/client-runtime',
  'packages/test-support/llm-mock-server',
  'packages/test-support/loader-smoke',
  'packages/typert/generator',
  'packages/typert/protocol',
  'packages/util/atomic-write',
  'packages/util/brand',
  'packages/util/crypto',
  'packages/util/deque',
  'packages/util/home-paths',
  'packages/util/launch-environment',
  'packages/util/native-command',
  'packages/util/output-retention',
  'packages/util/package-manifest',
  'packages/util/time',
  'packages/util/timeout',
  'packages/util/values',
  'packages/util/workspace-path',
])

/**
 * Enumerate every depth-4 package README (EN and ZH) the doc-standard
 * gate scans. Excludes `node_modules` and returns forward-slash paths
 * relative to the repository root.
 */
function packageReadmes(): string[] {
  return PACKAGE_README_GLOBS
    .flatMap(pattern => globSync(pattern, { cwd: ROOT, exclude: ['**/node_modules/**'] }))
    .map(file => file.replaceAll('\\', '/'))
    .sort()
}

/**
 * Strip a trailing `.zh.md` or `.md` suffix from a README path, leaving the
 * package directory (repo-relative, forward-slash).
 */
function packageDir(file: string): string {
  return file.replaceAll('\\', '/').replace(/\/README\.zh\.md$/, '').replace(/\/README\.md$/, '')
}

/** Whether a package manifest declares `dsh.bundle.patch`. */
function declaresBundle(dir: string): boolean {
  const manifest = resolve(ROOT, dir, 'package.json')
  if (!existsSync(manifest)) return false
  const metadata = JSON.parse(readFileSync(manifest, 'utf8')) as { dsh?: { bundle?: { patch?: string } } }
  return metadata.dsh?.bundle?.patch !== undefined
}

/** Compute the expected doc-standard kind for one README path. */
export function expectedKind(file: string): string {
  const normalized = file.replaceAll('\\', '/')
  if (normalized.split('/').length <= 3) return 'package-group'
  const dir = packageDir(normalized)
  if (declaresBundle(dir)) return 'package-bundle'
  if (PACKAGE_LIBRARIES.has(dir)) return 'package-library'
  return 'package-reference'
}

/**
 * Read a package's manifest description. Empty descriptions are reported so
 * the caller can flag missing metadata instead of silently fabricating text.
 */
function manifestDescription(dir: string): string | undefined {
  const manifest = resolve(ROOT, dir, 'package.json')
  if (!existsSync(manifest)) return undefined
  const metadata = JSON.parse(readFileSync(manifest, 'utf8')) as { description?: unknown }
  const description = metadata.description
  if (typeof description !== 'string') return undefined
  const trimmed = description.trim()
  return trimmed === '' ? undefined : trimmed
}

/** GitHub's slug rule for a rendered heading — matches `scripts/verify-md-links.ts`. */
function githubSlug(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replaceAll(' ', '-')
}

/** Whether a source already carries a YAML frontmatter block. */
function hasFrontmatter(source: string): boolean {
  return source.startsWith('---\n')
}

/**
 * Prepend the two-field frontmatter block (`description`, `kind`). Order and
 * quoting match `packages/bundle/data-agent/README.md`. Idempotent: a file
 * that already opens with `---` is returned unchanged.
 */
function insertFrontmatter(source: string, description: string, kind: string): string {
  if (hasFrontmatter(source)) return source
  const block = `---\ndescription: ${JSON.stringify(description)}\nkind: ${JSON.stringify(kind)}\n---\n\n`
  return `${block}${source}`
}

/**
 * Split a README into (frontmatter, body). The frontmatter includes the
 * trailing blank line after `---`; the body is everything after.
 */
function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  if (!hasFrontmatter(source)) return { frontmatter: '', body: source }
  const match = /^---\n[\s\S]*?\n---\n\n?/u.exec(source)
  if (!match) return { frontmatter: '', body: source }
  return { frontmatter: match[0], body: source.slice(match[0].length) }
}

/**
 * Text after the H1 line and the immediate `English | 中文` language switcher
 * line that every package README carries. The Summary and TOC are inserted
 * at that seam so we do not disturb the H1 or the switcher.
 */
function afterHeader(body: string): { header: string; rest: string } {
  const lines = body.split('\n')
  let cursor = 0

  while (cursor < lines.length && lines[cursor]?.trim() === '') cursor += 1

  const h1 = lines[cursor]
  if (h1 === undefined || !h1.startsWith('# ')) return { header: '', rest: body }
  cursor += 1

  while (cursor < lines.length && lines[cursor]?.trim() === '') cursor += 1

  const switcher = lines[cursor]
  if (switcher !== undefined && /^(English|中文|\[English\]|\[中文\])/.test(switcher)) {
    cursor += 1
  }

  const header = lines.slice(0, cursor).join('\n')
  const rest = lines.slice(cursor).join('\n')
  return { header, rest }
}

interface MarkdownLine {
  readonly text: string
  /** True for opening/closing fence delimiters and every line between them. */
  readonly fenced: boolean
}

/** Split Markdown into lines while tracking backtick and tilde fenced blocks. */
function markdownLines(source: string): MarkdownLine[] {
  let fence: { readonly character: '`' | '~'; readonly length: number } | undefined
  return source.split('\n').map((text) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1]
    if (fence === undefined) {
      if (marker !== undefined) {
        fence = { character: marker[0] as '`' | '~', length: marker.length }
        return { text, fenced: true }
      }
      return { text, fenced: false }
    }

    const fenced = true
    if (marker !== undefined
      && marker[0] === fence.character
      && marker.length >= fence.length
      && text.slice(text.indexOf(marker) + marker.length).trim() === '') {
      fence = undefined
    }
    return { text, fenced }
  })
}

/** Every rendered H2 heading outside fenced code blocks, in source order. */
export function h2Headings(body: string): string[] {
  const headings: string[] = []
  for (const line of markdownLines(body)) {
    if (line.fenced) continue
    const match = /^## (.+)$/.exec(line.text)
    if (match?.[1] !== undefined) headings.push(match[1].trim())
  }
  return headings
}

interface HeadingWords {
  readonly summary: string
  readonly toc: string
  readonly devNote: string
  readonly modelExperience: string
  readonly summaryPlaceholder: string
  readonly devNoteBody: string
}

const EN_HEADINGS: HeadingWords = {
  summary: 'Summary',
  toc: 'Table of Contents',
  devNote: 'Dev Note',
  modelExperience: 'Model Experience',
  summaryPlaceholder: 'TODO: fill in Summary — placeholder seeded from package.json description.',
  devNoteBody: 'None.',
}

const ZH_HEADINGS: HeadingWords = {
  summary: '概述',
  toc: '目录',
  devNote: '开发备注',
  modelExperience: '模型体验',
  summaryPlaceholder: 'TODO: 填写概述——占位内容来自 package.json 的 description 字段。',
  devNoteBody: '无。',
}

/**
 * All known Model Experience heading renderings: EN `## Model Experience`,
 * the ZH standard `## 模型体验`, and the ZH alt `## 模型经验` (one package,
 * packages/eval/eval-cli, uses this non-standard rendering). The Dev Note
 * position logic (TOC insertion + tail-insertion + isDevNoteMisaligned)
 * matches any of these so the Dev Note lands before Model Experience on
 * both EN and ZH regardless of which rendering a package uses.
 */
const MODEL_EXPERIENCE_VARIANTS: readonly string[] = [
  EN_HEADINGS.modelExperience,
  ZH_HEADINGS.modelExperience,
  '模型经验',
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Render a bulleted anchor list. `entries` is a list of `[displayText,
 * targetSlug]` pairs; both EN and ZH TOCs use English slugs as targets so
 * `verify-translation-pairing` sees identical link-target sequences.
 */
function renderTableOfContents(entries: readonly (readonly [string, string])[]): string {
  return entries.map(([text, slug]) => `- [${text}](#${slug})`).join('\n')
}

/**
 * Extract the frontmatter `description` field from a source, without
 * requiring a YAML parser. Returns undefined when no description is set.
 */
function frontmatterDescription(source: string): string | undefined {
  if (!hasFrontmatter(source)) return undefined
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(source)
  if (!match || match[1] === undefined) return undefined
  const line = match[1].split('\n').find(entry => /^description:\s*/.test(entry))
  if (line === undefined) return undefined
  const value = line.replace(/^description:\s*/, '').trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string
  }
  return value
}

/**
 * Remove a section (heading + body + optional preceding `<a id>` anchor)
 * from a rest string. The section starts at the given heading word (## or
 * ###) and runs to the next ## or ### heading or end of file. If an
 * `<a id="...">` line immediately precedes the heading (with optional
 * blank line), it is also removed. Surrounding blank lines are collapsed
 * so the excision point stays clean. Returns the original rest if the
 * heading is not found.
 */
function stripSection(rest: string, headingWord: string): string {
  const scanned = markdownLines(rest)
  const lines = scanned.map(line => line.text)
  let headingIdx = -1
  let anchorIdx = -1

  for (let i = 0; i < scanned.length; i++) {
    const line = scanned[i]
    if (line === undefined || line.fenced) continue
    const match = /^#{2,3} (.+)$/.exec(line.text)
    if (match !== null && match[1]?.trim() === headingWord) {
      headingIdx = i
      let j = i - 1
      while (j >= 0) {
        const prev = lines[j]
        if (prev === undefined) break
        if (prev === '') { j--; continue }
        if (/^\s*<a id="[^"]*">\s*<\/a>\s*$/.test(prev)) {
          anchorIdx = j
        }
        break
      }
      break
    }
  }

  if (headingIdx === -1) return rest

  let sectionEnd = lines.length
  for (let k = headingIdx + 1; k < scanned.length; k++) {
    const line = scanned[k]
    if (line !== undefined && !line.fenced && /^#{2,3} /.test(line.text)) {
      sectionEnd = k
      break
    }
  }

  const exciseStart = anchorIdx >= 0 ? anchorIdx : headingIdx
  const before = lines.slice(0, exciseStart)
  const after = lines.slice(sectionEnd)

  while (before.length > 0 && before[before.length - 1] === '') before.pop()
  while (after.length > 0 && after[0] === '') after.shift()

  if (before.length === 0 && after.length === 0) return ''
  if (before.length === 0) return after.join('\n')
  if (after.length === 0) return before.join('\n')
  return [...before, '', ...after].join('\n')
}

/**
 * Strip the TOC and Dev Note sections (but NOT Summary — Summary content
 * may be author-authored and is always at the correct position) from a
 * rest string, so the pair is computed from Summary + content headings
 * only and insertSkeleton re-inserts the TOC and Dev Note at the correct
 * positions. Idempotent: a rest with no TOC/Dev Note is returned unchanged.
 */
function stripTocAndDevNote(rest: string, words: HeadingWords): string {
  let result = rest
  result = stripSection(result, words.toc)
  result = stripSection(result, words.devNote)
  return result
}

interface Retrofit {
  readonly file: string
  readonly current: string
  readonly next: string
}

/**
 * Insert `<a id="<slug>"></a>` immediately before each of the positionally
 * paired H2 headings that do not already carry an anchor. Only inserts one
 * per heading; leaves existing anchors untouched. Slugs come from the EN
 * heading at the same position so ZH link targets match EN link targets
 * across the pair.
 *
 * F1 invariant: retrofitPair passes the RE-DERIVED pair plan (after the
 * 概述→Overview rename), so `headings` carries `Overview` (not 概述) at
 * collision positions and the anchor threads before the renamed heading.
 * The redundant `<a id="overview">` is harmless: GitHub's native
 * `## Overview`→#overview slug already resolves the target, and html
 * nodes are invisible to the pairing signature. No logic change required
 * here — fed the re-derived pair, the existing positional walk threads
 * correctly.
 */
export function insertAnchorsBeforeHeadings(
  body: string,
  headings: readonly string[],
  slugs: readonly string[],
): string {
  if (headings.length === 0) return body
  const scanned = markdownLines(body)
  const anchoredLines: string[] = []
  const existingSlugs = new Set(scanned.flatMap(({ text, fenced }) => {
    if (fenced) return []
    const match = /^\s*<a id="([^"]+)">\s*<\/a>\s*$/.exec(text)
    return match?.[1] === undefined ? [] : [match[1]]
  }))
  let headingCursor = 0
  for (const { text: line, fenced } of scanned) {
    const headingMatch = fenced ? null : /^## (.+)$/.exec(line)
    if (headingMatch !== null && headingCursor < headings.length) {
      const expected = headings[headingCursor]
      const rendered = headingMatch[1]?.trim()
      if (rendered === expected) {
        const slug = slugs[headingCursor]
        if (slug !== undefined) {
          const prev = anchoredLines[anchoredLines.length - 1]
          const already = prev !== undefined && new RegExp(`^\\s*<a id="${escapeRegExp(slug)}">\\s*</a>\\s*$`).test(prev)
          if (!already) {
            // Ensure blank line above the anchor for a clean insertion.
            if (anchoredLines.length > 0 && anchoredLines[anchoredLines.length - 1] !== '') {
              anchoredLines.push('')
            }
            anchoredLines.push(`<a id="${slug}"></a>`)
            existingSlugs.add(slug)
          }
        }
        headingCursor += 1
      }
    }
    anchoredLines.push(line)
  }
  return anchoredLines.join('\n')
}

/** EN authored Overview heading text; the ZH 概述 collision renames to this. */
const EN_OVERVIEW_HEADING = 'Overview'

interface PairPlan {
  readonly enHeadings: readonly string[]
  readonly zhHeadings: readonly string[]
  /** English slugs, one per EN heading; the same slugs anchor the ZH pair. */
  readonly slugs: readonly string[]
  /**
   * Positional indices where a ZH `## 概述` renders the EN sibling's
   * `## Overview` — the 概述/Overview collision (16 of 65 target packages).
   * At these positions the ZH 概述 is the Overview, NOT a Summary, so the
   * caller (retrofitPair) must rename it to `## Overview` before re-deriving
   * the final plan so a separate Summary `## 概述` can coexist. See
   * UM-FORK-README-SKELETON-RETROFIT (F1).
   */
  readonly overviewCollisionIndices: readonly number[]
}

/**
 * Extract the existing EN/ZH heading pair from the two bodies (after H1 +
 * switcher). Positional pairing: the nth `## ` in EN maps to the nth `## `
 * in ZH. Slugs derive from the EN heading (or from a pre-existing `<a id>`
 * anchor already before the ZH heading, if any). Also reports the
 * 概述/Overview collision indices so the caller can rename the ZH Overview
 * before re-deriving the final plan (F1).
 */
export function extractPairPlan(enBody: string, zhBody: string): PairPlan {
  const enH2s = h2Headings(enBody)
  const zhH2s = zhBody === '' ? [] : h2Headings(zhBody)
  const slugs = enH2s.map(heading => githubSlug(heading))
  const overviewCollisionIndices = zhH2s
    .map((zh, i) => (zh === ZH_HEADINGS.summary && enH2s[i] === EN_OVERVIEW_HEADING ? i : -1))
    .filter(i => i >= 0)
  return { enHeadings: enH2s, zhHeadings: zhH2s, slugs, overviewCollisionIndices }
}

/**
 * Rename the positionally-paired ZH `## 概述` (Overview) headings to
 * `## Overview` so a separate Summary `## 概述` can coexist without a
 * duplicate `#概述` slug. `collisionIndices` are the positional H2 indices
 * from `extractPairPlan.overviewCollisionIndices`; the rename rewrites only
 * those occurrences in document order, mirroring
 * `insertAnchorsBeforeHeadings`'s heading-cursor walk. Idempotent: a second
 * pass sees `## Overview` (not `## 概述`) so the collision set is empty.
 */
function renameOverviewCollisions(
  rest: string,
  collisionIndices: readonly number[],
): string {
  if (collisionIndices.length === 0) return rest
  const collisionSet = new Set(collisionIndices)
  const scanned = markdownLines(rest)
  const lines = scanned.map(line => line.text)
  let headingCursor = 0
  for (let i = 0; i < scanned.length; i++) {
    const line = scanned[i]
    if (line === undefined || line.fenced) continue
    const headingMatch = /^## (.+)$/.exec(line.text)
    if (headingMatch !== null) {
      const rendered = headingMatch[1]?.trim()
      if (rendered === ZH_HEADINGS.summary && collisionSet.has(headingCursor)) {
        lines[i] = `## ${EN_OVERVIEW_HEADING}`
      }
      headingCursor += 1
    }
  }
  return lines.join('\n')
}

/** Insert one generated H2 section after an existing rendered H2 section. */
function insertAfterH2Section(body: string, headingWord: string, block: string): string {
  const scanned = markdownLines(body)
  const headingIndex = scanned.findIndex(({ text, fenced }) =>
    !fenced && /^## (.+)$/.exec(text)?.[1]?.trim() === headingWord)
  if (headingIndex < 0) return body
  const nextHeadingIndex = scanned.findIndex(({ text, fenced }, index) =>
    index > headingIndex && !fenced && /^## /.test(text))
  const insertionIndex = nextHeadingIndex < 0 ? scanned.length : nextHeadingIndex
  const before = scanned.slice(0, insertionIndex).map(line => line.text)
  const after = scanned.slice(insertionIndex).map(line => line.text)
  while (before.at(-1) === '') before.pop()
  while (after[0] === '') after.shift()
  return [...before, '', block.trimEnd(), '', ...after].join('\n')
}

interface SkeletonInsertion {
  readonly words: HeadingWords
  readonly description: string
  readonly language: 'en' | 'zh'
  readonly summarySlug: string
  readonly tocSlug: string
  readonly devNoteSlug: string
  /** EN slug for each existing ## H2 (positionally paired for ZH). */
  readonly existingHeadingSlugs: readonly string[]
}

/**
 * Insert the three standard headings around existing content, leaving every
 * package-specific section untouched. Summary and TOC land just after the
 * H1 + language switcher; Dev Note lands at the end.
 *
 * The TOC lists every existing `## ` heading plus Dev Note (Summary and TOC
 * are omitted from the TOC — a TOC of itself is noise). Both languages use
 * identical English-slug link targets so `verify-translation-pairing`
 * sees the same link-target sequence across the pair. On the ZH side, the
 * caller has already injected `<a id="<slug>"></a>` before each existing
 * ZH heading; here we insert one `<a id="dev-note"></a>` before the new
 * Dev Note heading itself (Summary and TOC do not need anchors — they are
 * not TOC entries).
 *
 * F1 invariant: retrofitPair renames any ZH `## 概述` that renders the EN
 * `## Overview` to `## Overview` BEFORE staging, so the `hasSummary`
 * (`^## 概述$`) check below sees no pre-existing 概述 and inserts the
 * Summary. Without that upstream rename the check would match the Overview
 * and skip the Summary, leaving ZH one H2 short of EN
 * (UM-FORK-README-SKELETON-RETROFIT). No logic change required here — the
 * rename upstream is the fix; this comment documents the contract.
 */
export function insertSkeleton(source: string, insertion: SkeletonInsertion): string {
  const { frontmatter, body } = splitFrontmatter(source)
  const { header, rest } = afterHeader(body)
  const { words, description, existingHeadingSlugs } = insertion

  const existingHeadings = h2Headings(rest)
  const hasSummary = existingHeadings.includes(words.summary)
  const hasToc = existingHeadings.includes(words.toc)
  const hasDevNote = existingHeadings.includes(words.devNote)

  // Build the TOC entries: display text uses the language's rendered heading;
  // link target uses the English slug (same for both languages).
  const tocPairs: (readonly [string, string])[] = []
  let devNoteTocInserted = false
  for (let i = 0; i < existingHeadings.length; i++) {
    const heading = existingHeadings[i]
    const slug = existingHeadingSlugs[i]
    if (heading === undefined || slug === undefined) continue
    if (heading === words.summary || heading === words.toc || heading === words.devNote) continue
    // Insert Dev Note before Model Experience so Model Experience +
    // Known Limitations stay the final two H2s (model-experience gate).
    // Language-aware: matches both the EN `## Model Experience` (used by EN
    // and some ZH files) and the ZH rendering `## 模型体验`.
    if (!devNoteTocInserted && MODEL_EXPERIENCE_VARIANTS.includes(heading)) {
      tocPairs.push([words.devNote, insertion.devNoteSlug])
      devNoteTocInserted = true
    }
    tocPairs.push([heading, slug])
  }
  if (!devNoteTocInserted) {
    tocPairs.push([words.devNote, insertion.devNoteSlug])
  }

  // Build the Summary + TOC block just after header. If Summary already
  // exists, place a missing TOC after its section instead of before it.
  const insertions: string[] = []
  let tail = rest
  if (!hasSummary) {
    insertions.push(`## ${words.summary}\n\n${words.summaryPlaceholder}\n\n${description}\n`)
  }
  if (!hasToc) {
    const tocBlock = `## ${words.toc}\n\n${renderTableOfContents(tocPairs)}\n`
    if (hasSummary) tail = insertAfterH2Section(tail, words.summary, tocBlock)
    else insertions.push(tocBlock)
  }

  const headerWithInsertions = insertions.length > 0
    ? `${header}\n\n${insertions.join('\n')}`
    : header

  // Dev Note before ## Model Experience so Model Experience + Known
  // Limitations remain the final two H2s (verify-package-readme-model-
  // experience gate). Falls back to the end when Model Experience is absent.
  // Language-aware: matches both the EN `## Model Experience` and the ZH
  // rendering `## 模型体验`, so ZH packages whose Model Experience heading
  // is the Chinese rendering get the Dev Note before it (not at the end).
  if (!hasDevNote) {
    const devNoteBlock = insertion.language === 'zh'
      ? `\n\n<a id="${insertion.devNoteSlug}"></a>\n## ${words.devNote}\n\n${words.devNoteBody}\n`
      : `\n\n## ${words.devNote}\n\n${words.devNoteBody}\n`
    const modelExpPattern = MODEL_EXPERIENCE_VARIANTS
      .map(escapeRegExp)
      .join('|')
    const modelExpMatch = new RegExp(`^## (?:${modelExpPattern})$`, 'm').exec(tail)
    if (modelExpMatch !== null) {
      const before = tail.slice(0, modelExpMatch.index).replace(/\s+$/u, '')
      const after = tail.slice(modelExpMatch.index)
      tail = `${before}${devNoteBlock}\n\n${after}`
    } else {
      const trimmedTail = tail.replace(/\s+$/u, '')
      tail = `${trimmedTail}${devNoteBlock}`
    }
  }

  const rebuiltBody = `${headerWithInsertions}\n${tail}`
  return `${frontmatter}${rebuiltBody}`
}

/**
 * Detect whether the Dev Note's position relative to Model Experience
 * differs between EN and ZH. This happens when a previous generator run
 * had EN-only Model Experience heading detection: ZH files whose Model
 * Experience heading is `## 模型体验` (Chinese rendering) had the Dev Note
 * fall to the end instead of before Model Experience, shifting the ZH H2
 * sequence out of sync with EN. When misaligned, retrofitPair strips the
 * TOC + Dev Note from both sides and re-derives the pair; when aligned,
 * the file is left untouched (idempotent).
 */
function isDevNoteMisaligned(pair: PairPlan, hasZh: boolean): boolean {
  if (!hasZh) return false
  const enDevNoteIdx = pair.enHeadings.findIndex(h => h === EN_HEADINGS.devNote)
  const zhDevNoteIdx = pair.zhHeadings.findIndex(h => h === ZH_HEADINGS.devNote)
  const enModelExpIdx = pair.enHeadings.findIndex(h => h === EN_HEADINGS.modelExperience)
  const zhModelExpIdx = pair.zhHeadings.findIndex(
    h => MODEL_EXPERIENCE_VARIANTS.includes(h),
  )
  if (enDevNoteIdx < 0 || zhDevNoteIdx < 0 || enModelExpIdx < 0 || zhModelExpIdx < 0) return false
  return (enDevNoteIdx < enModelExpIdx) !== (zhDevNoteIdx < zhModelExpIdx)
}

/**
 * Compute the retrofit for one README pair (EN + optional ZH sibling).
 * @throws When the package's manifest description is missing or empty, or
 *         the EN/ZH pair has divergent H2 counts (the generator cannot
 *         positionally anchor without a matched heading list).
 */
function retrofitPair(enFile: string): Retrofit[] {
  const dir = packageDir(enFile)
  const description = manifestDescription(dir)
  if (description === undefined) {
    throw new Error(
      `gen-package-readme-skeleton: ${dir}/package.json is missing a non-empty description field.`,
    )
  }
  const kind = expectedKind(enFile)
  if (kind !== 'package-reference') {
    throw new Error(
      `gen-package-readme-skeleton: ${enFile} resolves to kind '${kind}', not 'package-reference'.`,
    )
  }

  const enCurrent = readFileSync(resolve(ROOT, enFile), 'utf8')

  const zhFile = enFile.replace(/README\.md$/, 'README.zh.md')
  const zhAbs = resolve(ROOT, zhFile)
  const hasZh = existsSync(zhAbs)
  const zhCurrent = hasZh ? readFileSync(zhAbs, 'utf8') : ''

  // Compute the H2 pair from the pre-existing (author-authored + any
  // previously-generated skeleton) heading structure, to validate count.
  const enBodyPreexisting = splitFrontmatter(enCurrent).body
  const zhBodyPreexisting = splitFrontmatter(zhCurrent).body
  const { header: enHeaderPre, rest: enRestPre } = afterHeader(enBodyPreexisting)
  const { header: zhHeaderPre, rest: zhRestPre } = afterHeader(zhBodyPreexisting)
  const initialPair = extractPairPlan(enRestPre, zhRestPre)

  if (hasZh && initialPair.enHeadings.length !== initialPair.zhHeadings.length) {
    throw new Error(
      `gen-package-readme-skeleton: ${enFile} and its ZH sibling have ${initialPair.enHeadings.length} vs ${initialPair.zhHeadings.length} `
      + '## headings; cannot positionally anchor. Fix the pair manually first.',
    )
  }

  // Detect Dev Note position misalignment (EN has Dev Note before Model
  // Experience, ZH has it after — or vice versa). When misaligned, strip
  // the TOC + Dev Note (NOT Summary — authored content must be preserved)
  // from both sides and re-derive the pair from Summary + content headings.
  // insertSkeleton then re-inserts the TOC and Dev Note at the correct
  // positions. When aligned, the file is left untouched — insertSkeleton
  // sees the existing skeleton and is a no-op (idempotent), avoiding
  // unnecessary churn on the ~500 files that are already correct.
  const needsStrip = isDevNoteMisaligned(initialPair, hasZh)

  // Always strip the skeleton (TOC + Dev Note) for pair computation so
  // insertAnchorsBeforeHeadings and existingHeadingSlugs align with
  // Summary + content headings only.
  const enRestForPair = stripTocAndDevNote(enRestPre, EN_HEADINGS)
  const zhRestForPair = stripTocAndDevNote(zhRestPre, ZH_HEADINGS)

  // F1 (UM-FORK-README-SKELETON-RETROFIT): 16 of 65 target packages carry
  // an existing ZH `## 概述` that renders the EN `## Overview` (NOT a
  // Summary). Rename the collision `## 概述` → `## Overview` on the ZH
  // body BEFORE staging so a separate Summary `## 概述` can coexist, then
  // RE-DERIVE the pair. Idempotent: once renamed, the detector sees
  // `## Overview` (not 概述) → empty collision set → no-op.
  const contentPair = extractPairPlan(enRestForPair, zhRestForPair)
  let zhRestFinal = zhRestForPair
  let pair = contentPair
  if (hasZh && contentPair.overviewCollisionIndices.length > 0) {
    console.warn(
      `gen-package-readme-skeleton: ${enFile} — renamed ZH ## 概述 → ## Overview at position(s) ${contentPair.overviewCollisionIndices.join(', ')} (概述/Overview collision, F1 auto-fix)`,
    )
    zhRestFinal = renameOverviewCollisions(zhRestForPair, contentPair.overviewCollisionIndices)
    pair = extractPairPlan(enRestForPair, zhRestFinal)
  }

  // Always apply the F1 概述→Overview rename to the ZH source content when
  // a collision is detected, regardless of needsStrip. Without this, ZH
  // files whose authored Overview heading is `## 概述` would have
  // hasSummary match the Overview (not the Summary), skipping Summary
  // insertion and leaving ZH one H2 short of EN.
  let enRestForInsert = enRestPre
  let zhRestForInsert = zhRestPre
  if (hasZh && contentPair.overviewCollisionIndices.length > 0) {
    zhRestForInsert = renameOverviewCollisions(zhRestForInsert, contentPair.overviewCollisionIndices)
  }
  if (needsStrip) {
    enRestForInsert = stripTocAndDevNote(enRestForInsert, EN_HEADINGS)
    zhRestForInsert = stripTocAndDevNote(zhRestForInsert, ZH_HEADINGS)
  }

  const devNoteSlug = githubSlug(EN_HEADINGS.devNote)
  const summarySlug = githubSlug(EN_HEADINGS.summary)
  const tocSlug = githubSlug(EN_HEADINGS.toc)

  // EN side: when needsStrip, the stripped rest is used so insertSkeleton
  // re-inserts the TOC and Dev Note. When !needsStrip, the original rest
  // (with F1 rename for ZH) is used — insertSkeleton sees the existing
  // skeleton and is a no-op. For new files (no frontmatter), the rest has
  // no skeleton, so insertSkeleton inserts everything.
  const enSource = needsStrip
    ? `${splitFrontmatter(enCurrent).frontmatter}${enHeaderPre ? `${enHeaderPre}\n${enRestForInsert}` : enRestForInsert}`
    : enCurrent
  const enWithFrontmatter = insertFrontmatter(enSource, description, kind)
  const enNext = insertSkeleton(enWithFrontmatter, {
    words: EN_HEADINGS,
    description,
    language: 'en',
    summarySlug,
    tocSlug,
    devNoteSlug,
    existingHeadingSlugs: pair.slugs,
  })

  const results: Retrofit[] = [{ file: enFile, current: enCurrent, next: enNext }]

  if (hasZh) {
    const existingZhDescription = frontmatterDescription(zhCurrent)
    const zhDescription = existingZhDescription ?? `TODO: translate: ${description}`
    // When needsStrip or F1 rename, use the modified rest; otherwise the
    // original file content (no-op).
    const zhUseModified = needsStrip || contentPair.overviewCollisionIndices.length > 0
    const zhSource = zhUseModified
      ? `${splitFrontmatter(zhCurrent).frontmatter}${zhHeaderPre ? `${zhHeaderPre}\n${zhRestForInsert}` : zhRestForInsert}`
      : zhCurrent
    const zhStaged = insertFrontmatter(zhSource, zhDescription, kind)

    // Insert the skeleton (Summary/TOC/Dev Note) BEFORE threading the
    // EN-slug anchors, so the Dev Note lands before Model Experience and
    // the <a id="model-experience"> anchor then threads immediately before
    // ## 模型体验. pair.zhHeadings is Summary + content (TOC/Dev Note
    // stripped), so skeleton headings are skipped by the cursor walk.
    const zhWithSkeleton = insertSkeleton(zhStaged, {
      words: ZH_HEADINGS,
      description: zhDescription,
      language: 'zh',
      summarySlug,
      tocSlug,
      devNoteSlug,
      existingHeadingSlugs: pair.slugs,
    })

    const { frontmatter: zhFm, body: zhBody } = splitFrontmatter(zhWithSkeleton)
    const { header: zhHeader, rest: zhRestForAnchor } = afterHeader(zhBody)
    const zhRestWithAnchors = insertAnchorsBeforeHeadings(zhRestForAnchor, pair.zhHeadings, pair.slugs)
    const zhNext = `${zhFm}${zhHeader}\n${zhRestWithAnchors}`
    results.push({ file: zhFile, current: zhCurrent, next: zhNext })
  }

  return results
}

/**
 * Retrofit (or re-retrofit) every package-reference EN README and its ZH
 * sibling. Two triggers:
 * 1. No frontmatter — first-run retrofit (insert frontmatter + skeleton).
 * 2. Dev Note misaligned between EN and ZH — re-retrofit the skeleton
 *    (strip TOC + Dev Note, re-insert at correct positions).
 * Files with frontmatter AND aligned Dev Note are skipped (idempotent).
 * Files with pre-existing H2 count mismatches are skipped (can't
 * positionally anchor). Non-reference packages are skipped via the kind
 * check.
 */
export function planRetrofits(): Retrofit[] {
  const files = packageReadmes()
  const enTargets = files.filter(file => file.endsWith('/README.md') && !file.endsWith('.zh.md'))
  const retrofits: Retrofit[] = []
  for (const enFile of enTargets) {
    if (expectedKind(enFile) !== 'package-reference') continue
    const currentEn = readFileSync(resolve(ROOT, enFile), 'utf8')
    const hasFm = hasFrontmatter(currentEn)
    if (hasFm) {
      // Already retrofitted — only re-process if the Dev Note is misaligned.
      const zhFile = enFile.replace(/README\.md$/, 'README.zh.md')
      const zhAbs = resolve(ROOT, zhFile)
      const hasZh = existsSync(zhAbs)
      if (!hasZh) continue
      const zhCurrent = readFileSync(zhAbs, 'utf8')
      const enRest = afterHeader(splitFrontmatter(currentEn).body).rest
      const zhRest = afterHeader(splitFrontmatter(zhCurrent).body).rest
      const pair = extractPairPlan(enRest, zhRest)
      if (!isDevNoteMisaligned(pair, true)) continue
    }
    try {
      retrofits.push(...retrofitPair(enFile))
    } catch (e) {
      // Skip files with pre-existing H2 count mismatches — the generator
      // cannot positionally anchor without a matched heading list.
      if (e instanceof Error && e.message.includes('cannot positionally anchor')) continue
      throw e
    }
  }
  return retrofits
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const check = process.argv.includes('--check')
  const retrofits = planRetrofits()
  const drift = retrofits.filter(({ current, next }) => current !== next)

  if (drift.length === 0) {
    console.log(
      `gen-package-readme-skeleton: ${retrofits.length} README files are current.`,
    )
  } else if (check) {
    console.error(
      `gen-package-readme-skeleton: ${drift.length} README file(s) are stale; run \`pnpm run gen-package-readme-skeleton\`.`,
    )
    for (const { file } of drift) console.error(`  ${file}`)
    process.exitCode = 1
  } else {
    for (const { file, next } of drift) {
      writeFileSync(resolve(ROOT, file), next)
    }
    console.log(
      `gen-package-readme-skeleton: rewrote ${drift.length} README file(s).`,
    )
  }
}
