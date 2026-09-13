/**
 * ⚠️ UNWIRED SCAFFOLD — NOT enrolled in package.json scripts, run-gates.ts,
 *    or gate-coverage.manifest.json. Do NOT wire until the KNOWN BUG below
 *    is fixed; running the generator as-is regresses bilingual pairing on
 *    16 of 65 target packages. See the decision-doc in
 *    wayfinder/data-agent/tickets/phase-upstream-merge/UM-FORK-README-SKELETON-RETROFIT.md.
 *
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
 * 🔴 KNOWN BUG (blocks wiring — 2026-09-13 apply attempt): the `hasSummary`
 *    idempotency check (see `insertSkeleton`) tests the ZH body for
 *    `^## 概述$`. 16 of 65 target packages already carry `## 概述` as their
 *    existing *Overview* heading (the ZH rendering of the EN `## Overview`).
 *    For those 16, the check matches and the generator SKIPS inserting the
 *    Summary `## 概述` — but the EN side inserts `## Summary` (because EN's
 *    existing `## Overview` ≠ `Summary`). The asymmetry leaves ZH one H2
 *    short of EN and drops the Overview entry from the ZH TOC, regressing
 *    `verify-translation-pairing` on 16 previously-green pairs.
 *
 *    The EN logic is sound (49/65 pairs retrofit cleanly). The fix is ZH-only
 *    and is a design decision, not a one-line patch: when an existing ZH
 *    `## 概述` is the Overview, the generator must (a) rename it to
 *    `## Overview` so a separate Summary `## 概述` can coexist, (b) rebuild
 *    the TOC to include the renamed Overview, and (c) re-thread the
 *    positionally-paired `<a id>` anchors — OR adopt a different Summary
 *    heading word for ZH that cannot collide. The rename changes authored
 *    ZH heading text (概述 → Overview) and needs a grilling call before
 *    the generator is wired and the 130-file run lands.
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

/** Every H2 heading in a body, in source order, as rendered text. */
function h2Headings(body: string): string[] {
  const headings: string[] = []
  const pattern = /^## (.+)$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    if (match[1] !== undefined) headings.push(match[1].trim())
  }
  return headings
}

interface HeadingWords {
  readonly summary: string
  readonly toc: string
  readonly devNote: string
  readonly summaryPlaceholder: string
  readonly devNoteBody: string
}

const EN_HEADINGS: HeadingWords = {
  summary: 'Summary',
  toc: 'Table of Contents',
  devNote: 'Dev Note',
  summaryPlaceholder: 'TODO: fill in Summary — placeholder seeded from package.json description.',
  devNoteBody: 'None.',
}

const ZH_HEADINGS: HeadingWords = {
  summary: '概述',
  toc: '目录',
  devNote: '开发备注',
  summaryPlaceholder: 'TODO: 填写概述——占位内容来自 package.json 的 description 字段。',
  devNoteBody: '无。',
}

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
 */
function insertAnchorsBeforeHeadings(
  body: string,
  headings: readonly string[],
  slugs: readonly string[],
): string {
  if (headings.length === 0) return body
  const lines = body.split('\n')
  const anchoredLines: string[] = []
  let headingCursor = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const headingMatch = /^## (.+)$/.exec(line)
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
          }
        }
        headingCursor += 1
      }
    }
    anchoredLines.push(line)
  }
  return anchoredLines.join('\n')
}

interface PairPlan {
  readonly enHeadings: readonly string[]
  readonly zhHeadings: readonly string[]
  /** English slugs, one per EN heading; the same slugs anchor the ZH pair. */
  readonly slugs: readonly string[]
}

/**
 * Extract the existing EN/ZH heading pair from the two bodies (after H1 +
 * switcher). Positional pairing: the nth `## ` in EN maps to the nth `## `
 * in ZH. Slugs derive from the EN heading (or from a pre-existing `<a id>`
 * anchor already before the ZH heading, if any).
 */
function extractPairPlan(enBody: string, zhBody: string): PairPlan {
  const enH2s = h2Headings(enBody)
  const zhH2s = zhBody === '' ? [] : h2Headings(zhBody)
  const slugs = enH2s.map(heading => githubSlug(heading))
  return { enHeadings: enH2s, zhHeadings: zhH2s, slugs }
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
 */
function insertSkeleton(source: string, insertion: SkeletonInsertion): string {
  const { frontmatter, body } = splitFrontmatter(source)
  const { header, rest } = afterHeader(body)
  const { words, description, existingHeadingSlugs } = insertion

  const hasSummary = new RegExp(`^## ${escapeRegExp(words.summary)}$`, 'm').test(rest)
  const hasToc = new RegExp(`^## ${escapeRegExp(words.toc)}$`, 'm').test(rest)
  const hasDevNote = new RegExp(`^#{2,3} ${escapeRegExp(words.devNote)}$`, 'm').test(rest)

  // Build the TOC entries: display text uses the language's rendered heading;
  // link target uses the English slug (same for both languages).
  const existingHeadings = h2Headings(rest)
  const tocPairs: (readonly [string, string])[] = []
  for (let i = 0; i < existingHeadings.length; i++) {
    const heading = existingHeadings[i]
    const slug = existingHeadingSlugs[i]
    if (heading === undefined || slug === undefined) continue
    if (heading === words.summary || heading === words.toc || heading === words.devNote) continue
    tocPairs.push([heading, slug])
  }
  tocPairs.push([words.devNote, insertion.devNoteSlug])

  // Build the Summary + TOC block just after header, before the rest.
  const insertions: string[] = []
  if (!hasSummary) {
    insertions.push(`## ${words.summary}\n\n${words.summaryPlaceholder}\n\n${description}\n`)
  }
  if (!hasToc) {
    insertions.push(`## ${words.toc}\n\n${renderTableOfContents(tocPairs)}\n`)
  }

  const headerWithInsertions = insertions.length > 0
    ? `${header}\n\n${insertions.join('\n')}`
    : header

  // Dev Note at the end, with an explicit `<a id>` for the ZH side so the
  // link target `#dev-note` resolves. (Optional on the EN side, but
  // symmetrical for the pairing structure signature.)
  let tail = rest
  if (!hasDevNote) {
    const trimmedTail = tail.replace(/\s+$/u, '')
    const anchor = insertion.language === 'zh'
      ? `\n\n<a id="${insertion.devNoteSlug}"></a>\n## ${words.devNote}\n\n${words.devNoteBody}\n`
      : `\n\n## ${words.devNote}\n\n${words.devNoteBody}\n`
    tail = `${trimmedTail}${anchor}`
  }

  const rebuiltBody = `${headerWithInsertions}\n${tail}`
  return `${frontmatter}${rebuiltBody}`
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

  // Compute the H2 pair BEFORE mutating either side, so slug pairing is
  // driven by the pre-existing (author-authored) heading structure.
  const enBodyPreexisting = splitFrontmatter(enCurrent).body
  const zhBodyPreexisting = splitFrontmatter(zhCurrent).body
  const enRestPre = afterHeader(enBodyPreexisting).rest
  const zhRestPre = afterHeader(zhBodyPreexisting).rest
  const pair = extractPairPlan(enRestPre, zhRestPre)

  if (hasZh && pair.enHeadings.length !== pair.zhHeadings.length) {
    throw new Error(
      `gen-package-readme-skeleton: ${enFile} and its ZH sibling have ${pair.enHeadings.length} vs ${pair.zhHeadings.length} `
      + '## headings; cannot positionally anchor. Fix the pair manually first.',
    )
  }

  const devNoteSlug = githubSlug(EN_HEADINGS.devNote)
  const summarySlug = githubSlug(EN_HEADINGS.summary)
  const tocSlug = githubSlug(EN_HEADINGS.toc)

  // EN side: only insert frontmatter + Summary/TOC/Dev Note. No `<a id>`
  // anchors before existing headings — the EN slug resolves directly from
  // GitHub's own heading slug rendering.
  const enWithFrontmatter = insertFrontmatter(enCurrent, description, kind)
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
    let zhStaged = insertFrontmatter(zhCurrent, zhDescription, kind)

    // Inject the EN-slug anchor before each existing ZH heading, so the ZH
    // TOC's English-slug link targets resolve. Do this AFTER frontmatter
    // insertion so the header search sees the H1 in a consistent position.
    const { frontmatter: zhFm, body: zhBody } = splitFrontmatter(zhStaged)
    const { header: zhHeader, rest: zhRestForAnchor } = afterHeader(zhBody)
    const zhRestWithAnchors = insertAnchorsBeforeHeadings(zhRestForAnchor, pair.zhHeadings, pair.slugs)
    zhStaged = `${zhFm}${zhHeader}\n${zhRestWithAnchors}`

    const zhNext = insertSkeleton(zhStaged, {
      words: ZH_HEADINGS,
      description: zhDescription,
      language: 'zh',
      summarySlug,
      tocSlug,
      devNoteSlug,
      existingHeadingSlugs: pair.slugs,
    })
    results.push({ file: zhFile, current: zhCurrent, next: zhNext })
  }

  return results
}

/**
 * Retrofit every EN README that needs it (i.e. currently has no frontmatter);
 * mirror the change to the ZH sibling when one exists. READMEs that already
 * carry frontmatter are left alone as an idempotency guarantee.
 */
export function planRetrofits(): Retrofit[] {
  const files = packageReadmes()
  const enTargets = files.filter(file => file.endsWith('/README.md') && !file.endsWith('.zh.md'))
  const retrofits: Retrofit[] = []
  for (const enFile of enTargets) {
    const currentEn = readFileSync(resolve(ROOT, enFile), 'utf8')
    if (hasFrontmatter(currentEn)) continue
    retrofits.push(...retrofitPair(enFile))
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
