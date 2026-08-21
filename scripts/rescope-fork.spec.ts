import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { discover, exactEdits, postconditions, patterns, rewrite, type Rename } from './rescope-fork'
import { exactEditState } from './rescope-vendor'

describe('rescope-fork', () => {
  describe('discover', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'rescope-fork-'))
      execFileSync('git', ['init', '-q'], { cwd: dir })
      execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir })
      execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
    })
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('discovers only @deepseek-ai packages, longest-first, with placeholder target', () => {
      mkdirSync(join(dir, 'packages/a'), { recursive: true })
      mkdirSync(join(dir, 'packages/b'), { recursive: true })
      mkdirSync(join(dir, 'packages/c'), { recursive: true })
      writeFileSync(join(dir, 'packages/a/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-eval' }))
      writeFileSync(join(dir, 'packages/b/package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-eval-extra' }))
      writeFileSync(join(dir, 'packages/c/package.json'), JSON.stringify({ name: '@other/x' }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root' }))
      execFileSync('git', ['add', '.'], { cwd: dir })
      execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })

      const renames = discover(dir)
      expect(renames.map(r => r.from).sort()).toEqual([
        '@deepseek-ai/dsh-eval',
        '@deepseek-ai/dsh-eval-extra',
        '@deepseek-ai/dsh-root',
      ])
      // longest-first so a prefixed name never shadows
      expect(renames[0].from).toBe('@deepseek-ai/dsh-eval-extra')
      // `to` carries a placeholder until --target substitutes it
      expect(renames[0].to).toBe('@__TARGET__/dsh-eval-extra')
    })

    it('skips manifests without a string name (not a package)', () => {
      mkdirSync(join(dir, 'packages/x'), { recursive: true })
      writeFileSync(join(dir, 'packages/x/package.json'), JSON.stringify({ private: true }))
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root' }))
      execFileSync('git', ['add', '.'], { cwd: dir })
      execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
      const renames = discover(dir)
      expect(renames.map(r => r.from)).toEqual(['@deepseek-ai/dsh-root'])
    })
  })

  describe('patterns + rewrite', () => {
    const renames: Rename[] = [
      { directory: 'packages/a/package.json', from: '@deepseek-ai/dsh-eval', to: '@my-org/dsh-eval' },
    ]

    it('rewrites quoted tokens + subpaths, not bare names', () => {
      const { text } = rewrite(
        [
          "import { x } from '@deepseek-ai/dsh-eval'",
          "import { y } from '@deepseek-ai/dsh-eval/sub'",
          'bare dsh-eval is not a token',
        ].join('\n'),
        'src/code.ts',
        patterns(renames, false),
      )
      expect(text).toContain("'@my-org/dsh-eval'")
      expect(text).toContain("'@my-org/dsh-eval/sub'")
      expect(text).toContain('bare dsh-eval is not a token')
    })

    it('rewrites a YAML name: scalar', () => {
      const { text } = rewrite("name: '@deepseek-ai/dsh-eval'\n", 'app.cordis.yml', patterns(renames, false))
      expect(text).toBe("name: '@my-org/dsh-eval'\n")
    })

    it('follows markdown fences + docs/ prose; skips non-docs prose', () => {
      const md = [
        'intro',
        '```sh',
        "pnpm add '@deepseek-ai/dsh-eval'",
        '```',
        // non-docs prose with a quoted token — the line is skipped entirely
        "see '@deepseek-ai/dsh-eval' for details",
      ].join('\n')
      const { text } = rewrite(md, 'README.md', patterns(renames, false))
      expect(text).toContain("pnpm add '@my-org/dsh-eval'")
      expect(text).toContain("see '@deepseek-ai/dsh-eval' for details") // prose skipped

      // docs/ prose IS followed
      const { text: docsText } = rewrite("uses '@deepseek-ai/dsh-eval' here", 'docs/guide.md', patterns(renames, false))
      expect(docsText).toContain("uses '@my-org/dsh-eval' here")
    })

    it('is idempotent (re-apply is a no-op)', () => {
      const pat = patterns(renames, false)
      const original = "import { x } from '@deepseek-ai/dsh-eval'"
      const once = rewrite(original, 'code.ts', pat).text
      const twice = rewrite(once, 'code.ts', pat).text
      expect(twice).toBe(once)
    })

    it('reverse swaps from/to', () => {
      const pat = patterns(renames, true)
      const { text } = rewrite("import { x } from '@my-org/dsh-eval'", 'code.ts', pat)
      expect(text).toContain("'@deepseek-ai/dsh-eval'")
    })
  })

  describe('exactEdits', () => {
    it('interpolates target into gate strings (apply direction: find=pre @deepseek-ai, replace=post @target)', () => {
      const edits = exactEdits('@my-org')
      const fam = edits.find(e => e.id === 'families-startswith-gate')!
      expect(fam.find).toContain('@deepseek-ai/')
      expect(fam.replace).toContain('@my-org/')
      expect(fam.replace).not.toContain('@deepseek-ai/')
    })

    it('verify-regex is scope-agnostic (no target interpolation)', () => {
      const edits = exactEdits('@my-org')
      const re = edits.find(e => e.id === 'verify-dsh-package-licenses-regex')!
      expect(re.find).toBe('const DSH_PACKAGE_NAME = /^@deepseek-ai\\/dsh(?:-|$)/')
      expect(re.replace).toBe('const DSH_PACKAGE_NAME = /^@[^/]+\\/dsh(?:-|$)/')
      expect(re.replace).not.toContain('my-org')
    })

    it('knip ignoreDependencies expect=4', () => {
      const edits = exactEdits('@my-org')
      const knip = edits.find(e => e.id === 'knip-ignore-dependencies-pattern')!
      expect(knip.expect).toBe(4)
      expect(knip.find).toBe('"@deepseek-ai/.+"')
      expect(knip.replace).toBe('"@my-org/.+"')
    })

    it('AGENTS convention line + file-tree placeholder prose', () => {
      const edits = exactEdits('@my-org')
      const conv = edits.find(e => e.id === 'agents-convention-line')!
      expect(conv.find).toBe('- Every npm package is `@deepseek-ai/dsh-<name>`')
      expect(conv.replace).toBe('- Every npm package is `@my-org/dsh-<name>`')
      const tree = edits.find(e => e.id === 'agents-file-tree-convention')!
      expect(tree.replace).toContain('@my-org/dsh-<pkg>')
    })
  })

  describe('postconditions', () => {
    it('asserts each local package name + the scope-agnostic verify-regex', () => {
      const renames: Rename[] = [
        { directory: 'packages/a/package.json', from: '@deepseek-ai/dsh-eval', to: '@my-org/dsh-eval' },
      ]
      const conds = postconditions(renames, '@my-org', false)
      expect(conds).toContainEqual({
        file: 'packages/a/package.json',
        text: '"name": "@my-org/dsh-eval"',
        count: 1,
      })
      expect(conds).toContainEqual({
        file: 'scripts/verify-dsh-package-licenses.ts',
        text: 'const DSH_PACKAGE_NAME = /^@[^/]+\\/dsh(?:-|$)/',
        count: 1,
      })
    })

    it('reverse asserts the upstream name', () => {
      const renames: Rename[] = [
        { directory: 'packages/a/package.json', from: '@deepseek-ai/dsh-eval', to: '@my-org/dsh-eval' },
      ]
      const conds = postconditions(renames, '@my-org', true)
      expect(conds).toContainEqual({
        file: 'packages/a/package.json',
        text: '"name": "@deepseek-ai/dsh-eval"',
        count: 1,
      })
    })
  })

  describe('exactEditState (reused from rescope-vendor)', () => {
    it('classifies pending / applied / invalid', () => {
      const find = '@deepseek-ai/dsh-eval'
      const replace = '@my-org/dsh-eval'
      expect(exactEditState(`x ${find} y`, find, replace, 1)).toBe('pending')
      expect(exactEditState(`x ${replace} y`, find, replace, 1)).toBe('applied')
      expect(exactEditState('', find, replace, 1)).toBe('invalid')
    })
  })
})
