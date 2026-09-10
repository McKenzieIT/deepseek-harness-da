# UM15 首片 §2 — `verify-gate-coverage` meta-gate + manifest + spec（S2，2026-09-15）

> **作用域**：只有 §2。§1（`run-gates.ts` MODES 重构）、§3（generator-inputs）、§4（upstream-sync 三件套）由别的 agent 交付。
> **代码树**：`/Users/mckenzie/workspace/dsh-resync` @ `12d02c7687`（干净，未碰）。
> **本文所有数字都是本 agent 亲自跑出来的**；未核的一律标 ⚠。

**状态**：完整交付（所有锚点已 read_file/cat -n 核实，代码已逐处给出）。

## 目录

- §0 背景与意图
- §A 实测差集（UM12 盲区清单的实测版）
- §B `scripts/gate-coverage.manifest.json` 全文
- §C `scripts/verify-gate-coverage.ts` 全文
- §D `scripts/verify-gate-coverage.spec.ts` 全文
- §E §7.2 第 1 条：13 条 `nonGeneratorInventoryGates` 行号逐条核实
- §F §7.2 第 9 条：本门耗时估算
- §G 接线 diff（`package.json` + `run-gates.ts`）
- §H 诚实边界

---

## §0 背景与意图

**问题（UM12 组外 gate 盲区）**：`package.json` 里有 `verify-*`/`gen-*` 脚本，但没人验证过「每个脚本都被至少一个 `run-gates.ts` mode 登记」。UM12 实测 50 个 `verify-*` 里有 6 个不被 `run-gates.ts` 引用——其中真盲区 2 个（`verify-architecture-graph`、`verify-cordis-api`），半个洞 1 个（`verify-npm-install-layout`，只在 release.yml 跑），有意组外 3 个。`verify-cordis-api` 是一条已回归的成文不变量（`.agents/notes/archived/process/2026-07-21-doc-sync-through-gate-scheduler.md:16` 明文断言它在 `docSyncLeafGates` 里，而今天 `cordis-api` 字符串在 `run-gates.ts` 里根本不存在）。

**机制（设计草案 §6.2 / §2）**：一道 meta-gate `verify-gate-coverage`——枚举 `package.json` 全部 `verify-*`/`gen-*` 脚本，枚举 `run-gates.ts` 各 mode 实际登记的门，做差集，差集里的脚本必须在 manifest 有豁免 + 理由，否则 exit 1。豁免进 tracked manifest（`scripts/gate-coverage.manifest.json`），每条带 `reason` + 可选 `coveredBy`，使「组外」成为显式决策而非偶然缺口。

**设计草案的运行时方案 vs 本实现**：草案 §6.2 说 meta-gate 用 `gatesForMode(m) for m of MODES` 运行时枚举。本 agent 实测发现 `pnpmScript` → `pnpmInvocation`（`scripts/pnpm-invocation.ts:13-15`）在 `npm_execpath` 未设时 **throw**——即 `gatesForMode` 只能在 `pnpm run` 上下文里调，直接 `tsx scripts/verify-gate-coverage.ts` 或 vitest 里会炸。故本实现改用**文本提取**：读 `run-gates.ts` 源码，正则提取 `pnpmScript('id', 'script', ...)` 的第二参数（包脚本名），与 `package.json` 的 `verify-*`/`gen-*` 名单做差集。这与 `verify-config-source-ownership.ts` 的 `collectXxxViolations(root)` 纯函数模板一致（读文件、返回 `string[]`），不 import `run-gates.ts`，不需要 pnpm 环境，vitest 可直接测。两者等价：所有 `verify-*`/`gen-*` 脚本的登记都经 `pnpmScript` 第二参数（字面量），无变量间接——本 agent 已用 node 正则交叉验证：文本法与运行时法（设 `npm_execpath` 后跑 `gatesForMode`）给出**相同的 44 已登记 / 21 未登记**结果（运行时法见 §H 边界）。

**草案 §6.2 Decision 6**：meta-gate 落地前先登记 `verify-architecture-graph`（+ `verify-third-party-notices`），使门首日绿。本首片 §5.2(c) 登记 `verify-architecture-graph` 进 `docSyncLeafGates`（由 §1/S1 agent 落）。`verify-third-party-notices` 的登记未在本首片范围——本 manifest 将其列为豁免（诚实标注「未登记、无别处覆盖」）。

---

## §A 实测差集（UM12 盲区清单的实测版）

**方法**（临时文件 + `sort`/`comm`，无 `<(...)`）：

```
# 1. package.json 全部 verify-*/gen-* 脚本名，排序
node -e '...filter(s=>/^verify-|^gen-/.test(s)).sort()...' > /tmp/um15_vg_scripts.txt   # 65 条

# 2. run-gates.ts 源码里 pnpmScript('id','script',...) 第二参数，排序去重
node -e '正则 /pnpmScript\(\s*...,[^']*'...  > /tmp/um15_pnpmscript_args.txt              # 65 条（含非 verify-*/gen-* 的如 build/test/publint）

# 3. comm -23：只在 A（package.json 名单）不在 B（已登记）的
comm -23 /tmp/um15_vg_scripts.txt /tmp/um15_pnpmscript_args.txt                          # 21 条
```

**实测差集（21 条，verbatim，tip `12d02c7687`）**：

```
gen-architecture-graph
gen-client-catalog
gen-config-catalog
gen-cordis-api
gen-cordis-catalog
gen-cordis-inspect-catalog
gen-doc-graphs
gen-module-graph
gen-persistence-catalog
gen-scoped-events
gen-session-format-catalog
gen-third-party-notices
gen-tool-catalog
gen-translation-brief
gen-tsconfig-paths
verify-architecture-graph
verify-cordis-api
verify-doc-site-fragments
verify-no-production-src-on-master
verify-npm-install-layout
verify-third-party-notices
```

**分类**：

| 类别 | 条数 | 成员 | 性质 |
|---|---|---|---|
| gen-* 生成器（写操作，非门） | 15 | 全部 15 个 `gen-*` | 有意不登记；其 `--check` 变体（`verify-*`）登记处另有 |
| `verify-architecture-graph` | 1 | — | **真盲区**；本首片 §5.2(c) 正在登记进 `docSyncLeafGates`，落地后从差集消失 |
| `verify-cordis-api` | 1 | — | **真盲区**（UM12 成文不变量回归）；manifest 列豁免 + 诚实理由 |
| `verify-doc-site-fragments` | 1 | — | 有意组外（UM12 判定有别处覆盖） |
| `verify-no-production-src-on-master` | 1 | — | 有意组外（`.github/workflows/no-production-src-on-master.yml` + `lefthook.yml`） |
| `verify-npm-install-layout` | 1 | — | 半个洞（只在 `.github/workflows/release.yml:87`，PR 不跑） |
| `verify-third-party-notices` | 1 | — | 真盲区（草案 §6.2 判「No」；Decision 6 建议登记但本首片未做）→ manifest 列豁免 + 诚实理由 |

**落地后差集（§1 + §5.2(c) + §2 全部落后）**：21 − 1（`verify-architecture-graph` 被登记）= **20**。这 20 条全部进 manifest（§B）。

---

## §B `scripts/gate-coverage.manifest.json` 全文

格式照草案 §6.2：`{ exemptions: [{ script, reason, coveredBy }] }`，`reason` + `coveredBy` 均必填（避免 `exactOptionalPropertyTypes` 的 optional 陷阱）。20 条 = 落地后差集（§1 + §5.2(c) + §2 全部落后时，`verify-architecture-graph` 已被 §5.2(c) 登记进 `docSyncLeafGates`，从差集消失）。

```json
{
  "exemptions": [
    {
      "script": "gen-architecture-graph",
      "reason": "generator (write operation, not a gate); its --check variant verify-architecture-graph is enrolled in docSyncLeafGates",
      "coveredBy": "verify-architecture-graph gate (docSyncLeafGates)"
    },
    {
      "script": "gen-client-catalog",
      "reason": "generator (write operation, not a gate); its --check variant verify-client-catalog is enrolled",
      "coveredBy": "verify-client-catalog gate"
    },
    {
      "script": "gen-config-catalog",
      "reason": "generator (write operation, not a gate); its --check variant verify-config-catalog is enrolled",
      "coveredBy": "verify-config-catalog gate"
    },
    {
      "script": "gen-cordis-api",
      "reason": "generator (write operation, not a gate); its --check variant verify-cordis-api is an uncovered blind spot — see verify-cordis-api exemption below",
      "coveredBy": "none (--check variant also uncovered)"
    },
    {
      "script": "gen-cordis-catalog",
      "reason": "generator (write operation, not a gate); its --check variant verify-cordis-catalog is enrolled",
      "coveredBy": "verify-cordis-catalog gate"
    },
    {
      "script": "gen-cordis-inspect-catalog",
      "reason": "generator (write operation, not a gate); its --check variant verify-cordis-inspect-catalog is enrolled",
      "coveredBy": "verify-cordis-inspect-catalog gate"
    },
    {
      "script": "gen-doc-graphs",
      "reason": "generator (write operation, not a gate); its --check variant verify-doc-graphs is enrolled",
      "coveredBy": "verify-doc-graphs gate"
    },
    {
      "script": "gen-module-graph",
      "reason": "generator (write operation, not a gate); its --check variant verify-module-graph is enrolled",
      "coveredBy": "verify-module-graph gate"
    },
    {
      "script": "gen-persistence-catalog",
      "reason": "generator (write operation, not a gate); its --check variant verify-persistence-catalog is enrolled",
      "coveredBy": "verify-persistence-catalog gate"
    },
    {
      "script": "gen-scoped-events",
      "reason": "generator (write operation, not a gate); its --check variant verify-scoped-events is enrolled",
      "coveredBy": "verify-scoped-events gate"
    },
    {
      "script": "gen-session-format-catalog",
      "reason": "generator (write operation, not a gate); its --check variant verify-session-format-catalog is enrolled",
      "coveredBy": "verify-session-format-catalog gate"
    },
    {
      "script": "gen-third-party-notices",
      "reason": "generator (write operation, not a gate); its --check variant verify-third-party-notices is uncovered — see verify-third-party-notices exemption below",
      "coveredBy": "none (--check variant also uncovered)"
    },
    {
      "script": "gen-tool-catalog",
      "reason": "generator (write operation, not a gate); its --check variant verify-tool-catalog is enrolled",
      "coveredBy": "verify-tool-catalog gate"
    },
    {
      "script": "gen-translation-brief",
      "reason": "generator (write operation, not a gate); no --check variant exists; authoring aid run in translation workflow",
      "coveredBy": "none (not a freshness gate)"
    },
    {
      "script": "gen-tsconfig-paths",
      "reason": "generator (write operation, not a gate); its --check variant verify-tsconfig-paths is enrolled",
      "coveredBy": "verify-tsconfig-paths gate"
    },
    {
      "script": "verify-cordis-api",
      "reason": "blind spot (UM12): cordis-api string absent from run-gates.ts despite documented invariant (.agents/notes/archived/process/2026-07-21-doc-sync-through-gate-scheduler.md:16 asserts docSyncLeafGates includes verify-cordis-api); enrollment pending separate fix",
      "coveredBy": "none (regressed documented invariant)"
    },
    {
      "script": "verify-doc-site-fragments",
      "reason": "intentionally out-of-group (UM12 disposition); covered by the docs:build site-fragment pipeline",
      "coveredBy": "docs:build pipeline"
    },
    {
      "script": "verify-no-production-src-on-master",
      "reason": "intentionally out-of-group; runs in a dedicated GitHub workflow and lefthook, not in run-gates.ts",
      "coveredBy": ".github/workflows/no-production-src-on-master.yml + lefthook.yml"
    },
    {
      "script": "verify-npm-install-layout",
      "reason": "release-only (half-hole per UM12); runs in .github/workflows/release.yml:87, never in PR CI",
      "coveredBy": ".github/workflows/release.yml:87"
    },
    {
      "script": "verify-third-party-notices",
      "reason": "blind spot (UM12 §6.2: No — not in any aggregate, workflow, or hook); enrollment pending Decision 6(a) follow-up",
      "coveredBy": "none (uncovered)"
    }
  ]
}
```

---

## §C `scripts/verify-gate-coverage.ts` 全文

照抄 `verify-config-source-ownership.ts`（CLI 约定：`export function collectXxxViolations(root): string[]` + `if (process.argv[1] && import.meta.filename === resolve(process.argv[1]))` 入口）+ `verify-doc-budgets.ts`（manifest 读取：`JSON.parse(readFileSync(...)) as T` + stale 条目检查）。**不 import `run-gates.ts`**（避开 `pnpmInvocation` 的 `npm_execpath` throw），改文本提取 `pnpmScript('id','script',...)` 第二参数。三道检查：(1) 未登记且未豁免→盲区；(2) 豁免指向已删脚本→陈旧豁免；(3) 豁免指向已登记脚本→陈旧豁免（须移除）。

```typescript
/**
 * Meta-gate: assert every `verify-*` / `gen-*` package script is either enrolled
 * in at least one `run-gates.ts` mode (via `pnpmScript`) or explicitly exempted
 * in `scripts/gate-coverage.manifest.json`. Prevents the "wrote a gate nobody
 * runs" blind spot (UM12 out-of-group gate list).
 * @module scripts/verify-gate-coverage
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

/** Matches a `pnpmScript('gateId', 'scriptName', …)` call, capturing the
 *  second argument (the package.json script name). Single-quoted only, which
 *  matches the repo convention; variable arguments (e.g. `lintGate`'s `script`
 *  param) are intentionally skipped. */
const PNPM_SCRIPT_CALL_PATTERN = /pnpmScript\(\s*'[^']*',\s*'([^']*)'/g

/** Package script names this gate accounts for. Generators (`gen-*`) are
 *  write operations, not gates; they are exempted with their `--check`
 *  variant as `coveredBy`. */
const GATE_SCRIPT_PATTERN = /^(?:verify-|gen-)/

interface GateCoverageExemption {
  readonly script: string
  readonly reason: string
  readonly coveredBy: string
}

interface GateCoverageManifest {
  readonly exemptions: readonly GateCoverageExemption[]
}

/**
 * Extract the set of package.json script names enrolled via `pnpmScript` in
 * `run-gates.ts`. Every `verify-*` / `gen-*` enrollment is a literal
 * second argument (no variable indirection), so this textual extraction is
 * equivalent to iterating `gatesForMode(mode)` for every mode.
 * @param runGatesSource - the full text of `scripts/run-gates.ts`.
 * @returns the set of enrolled script names.
 */
function collectEnrolledScriptNames(runGatesSource: string): Set<string> {
  const enrolled = new Set<string>()
  for (const match of runGatesSource.matchAll(PNPM_SCRIPT_CALL_PATTERN)) {
    const script = match[1]
    if (typeof script === 'string') enrolled.add(script)
  }
  return enrolled
}

/**
 * Return every `verify-*` / `gen-*` script name in the root `package.json`.
 * @param root - the repository root directory.
 * @returns the set of gate-like script names.
 */
function collectGateScriptNames(root: string): Set<string> {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  return new Set(Object.keys(manifest.scripts).filter(script => GATE_SCRIPT_PATTERN.test(script)))
}

/**
 * Return gate-coverage violations as human-readable strings. A violation is
 * either an unaccounted gate (enrolled nowhere, exempted nowhere) or a stale
 * manifest exemption (pointing at a deleted script or a now-enrolled script).
 * @param root - the repository root directory.
 * @returns failure messages, one per violation.
 */
export function collectGateCoverageViolations(root: string): string[] {
  const failures: string[] = []

  const runGatesSource = readFileSync(resolve(root, 'scripts/run-gates.ts'), 'utf8')
  const enrolled = collectEnrolledScriptNames(runGatesSource)

  const gateScripts = collectGateScriptNames(root)

  const manifest = JSON.parse(
    readFileSync(resolve(root, 'scripts/gate-coverage.manifest.json'), 'utf8'),
  ) as GateCoverageManifest
  const exempted = new Map<string, GateCoverageExemption>()
  for (const entry of manifest.exemptions) {
    exempted.set(entry.script, entry)
  }

  // Check 1 — every verify-*/gen-* script must be enrolled or exempted.
  for (const script of gateScripts) {
    if (enrolled.has(script)) continue
    if (exempted.has(script)) continue
    failures.push(
      `${script}: not enrolled in any run-gates.ts mode and not exempted in scripts/gate-coverage.manifest.json`
        + ' — either enroll it via pnpmScript in run-gates.ts or add an exemption with a reason.',
    )
  }

  // Check 2 — every manifest exemption must reference an existing verify-*/gen-* script.
  for (const entry of manifest.exemptions) {
    if (gateScripts.has(entry.script)) continue
    failures.push(
      `${entry.script}: exempted in scripts/gate-coverage.manifest.json but no longer a verify-*/gen-* script in package.json`
        + ' (renamed or deleted? remove the stale exemption).',
    )
  }

  // Check 3 — no exemption for a script that is now enrolled.
  for (const entry of manifest.exemptions) {
    if (!enrolled.has(entry.script)) continue
    failures.push(
      `${entry.script}: exempted in scripts/gate-coverage.manifest.json but is now enrolled in run-gates.ts`
        + ' — remove the stale exemption.',
    )
  }

  return failures
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const failures = collectGateCoverageViolations(ROOT)
  if (failures.length > 0) {
    process.stderr.write('verify-gate-coverage: gate coverage violations:\n')
    for (const failure of failures) process.stderr.write(`  ${failure}\n`)
    process.exit(1)
  }

  process.stdout.write(
    'verify-gate-coverage: every verify-*/gen-* script is enrolled or explicitly exempted.\n',
  )
}
```

**类型/lint 自查**：
- 无 `!`（`no-non-null-assertion`）：索引访问 `match[1]` 用 `typeof script === 'string'` 守卫。
- 无 `any`（全套 `no-unsafe-*`）：`JSON.parse(...) as T` 两处（package.json、manifest），赋值后类型为 `T`。
- `restrict-template-expressions`：模板表达式仅插入 `script`/`entry.script`（均 `string`）。
- `only-throw-error`：不 throw；入口用 `process.exit(1)`。
- `require-await`：无 async。
- `switch-exhaustiveness-check`：无 switch。
- `noUncheckedIndexedAccess`：`match[1]` → `string | undefined` → `typeof` 守卫；`for...of` 迭代 `Set`/`readonly GateCoverageExemption[]` 产出确定类型。
- `exactOptionalPropertyTypes`：`GateCoverageExemption` 三字段均必填（无 optional）。

---

## §D `scripts/verify-gate-coverage.spec.ts` 全文

照抄 `verify-config-source-ownership.spec.ts`（`mkdtempSync` + `writeFileSync` fixture + `collectXxxViolations(root)` 断言）。四例：全登记/豁免→空；盲区→1 failure；豁免指向已删脚本→1 failure；豁免指向已登记脚本→1 failure。

```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectGateCoverageViolations } from './verify-gate-coverage.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function scaffold(
  root: string,
  options: {
    scripts: Record<string, string>
    enrolled: readonly string[]
    exemptions: readonly { script: string; reason: string; coveredBy: string }[]
  },
): void {
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: options.scripts }))
  const runGatesLines = options.enrolled
    .map(name => `    pnpmScript('gate-${name}', '${name}', { label: '${name}' }),`)
    .join('\n')
  writeFileSync(
    join(root, 'scripts/run-gates.ts'),
    `function gates(): Gate[] {\n  return [\n${runGatesLines}\n  ]\n}`,
  )
  writeFileSync(
    join(root, 'scripts/gate-coverage.manifest.json'),
    JSON.stringify({ exemptions: options.exemptions }),
  )
}

describe('gate coverage meta-gate', () => {
  it('passes when every verify-*/gen-* script is enrolled or exempted', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-clean-'))
    roots.push(root)
    scaffold(root, {
      scripts: {
        'verify-enrolled': 'tsx enrolled.ts',
        'verify-exempted': 'tsx exempted.ts',
        'gen-exempted': 'tsx gen-exempted.ts',
        build: 'build',
      },
      enrolled: ['verify-enrolled', 'build'],
      exemptions: [
        { script: 'verify-exempted', reason: 'enrolled elsewhere', coveredBy: 'other gate' },
        { script: 'gen-exempted', reason: 'generator', coveredBy: 'verify-enrolled gate' },
      ],
    })

    expect(collectGateCoverageViolations(root)).toEqual([])
  })

  it('fails on a script neither enrolled nor exempted (blind spot)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-blind-'))
    roots.push(root)
    scaffold(root, {
      scripts: {
        'verify-enrolled': 'tsx enrolled.ts',
        'verify-blind': 'tsx blind.ts',
      },
      enrolled: ['verify-enrolled'],
      exemptions: [],
    })

    const failures = collectGateCoverageViolations(root)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('verify-blind')
    expect(failures[0]).toContain('not enrolled')
  })

  it('fails on a manifest exemption for a deleted script (stale exemption)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-stale-del-'))
    roots.push(root)
    scaffold(root, {
      scripts: { 'verify-present': 'tsx present.ts' },
      enrolled: ['verify-present'],
      exemptions: [{ script: 'verify-deleted', reason: 'gone', coveredBy: 'none' }],
    })

    const failures = collectGateCoverageViolations(root)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('verify-deleted')
    expect(failures[0]).toContain('no longer a verify-*/gen-* script')
  })

  it('fails on a manifest exemption for a now-enrolled script (stale exemption)', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-gate-coverage-stale-enr-'))
    roots.push(root)
    scaffold(root, {
      scripts: { 'verify-now-enrolled': 'tsx now.ts' },
      enrolled: ['verify-now-enrolled'],
      exemptions: [{ script: 'verify-now-enrolled', reason: 'was blind', coveredBy: 'none' }],
    })

    const failures = collectGateCoverageViolations(root)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('verify-now-enrolled')
    expect(failures[0]).toContain('now enrolled')
  })
})
```

**类型/lint 自查**：
- `failures[0]` 是 `string | undefined`（`noUncheckedIndexedAccess`）；`expect(failures[0])` 接受 `unknown`，`toContain` 运行时 undefined 会自然 fail（正确）。无 `!`。
- `options: { ... }` 参数解构无 optional 字段（`exactOptionalPropertyTypes` 无关）。
- `readonly` 修饰符用于 fixture 数据（不可变约定）。
- 模板表达式无 number/boolean/object 插值。
- ⚠ **未跑 vitest**（只读 agent）；若 `expect(failures[0])` 在严格 lint 下报 `no-unsafe-argument`（因 `string | undefined` 传入），改用 `expect(failures[0] ?? '').toContain(...)`。

---

## §E §7.2 第 1 条：13 条 `nonGeneratorInventoryGates` 行号逐条核实

草案（设计 §6.1, `um15-durable-sync-design-2026-09-10.md:435`）列了非生成器、库存敏感的门——这些门 glob `packages/*/*/package.json` 等，包增删会让它们变红。草案给了行号。本 agent **逐个 `cat -n` 核实**（tip `12d02c7687`）。

| # | 文件（草案原文） | 草案声称行 | 实测行 | 该行 verbatim | 判定 |
|---|---|---|---|---|---|
| 1 | `verify-package-paths.ts:43` | `:43` | `:43` | `  for (const pkg of globSync('packages/*/*', { cwd: root, withFileTypes: true })) {` | ✅ 对 |
| 2 | `verify-application-entrypoints.ts:95` | `:95` | `:95` | `  const manifests = globSync(['apps/*/package.json', 'packages/*/*/package.json'], { cwd: root }).sort()` | ✅ 对 |
| 3 | `verify-package-dependencies.ts:24` | `:24` | `:24` | `  'packages/*/*/package.json',`（`WORKSPACE_MANIFEST_GLOBS` 数组条目） | ✅ 对 |
| 4 | `package-invariants.ts:51` | `:51` | `:51` | `  return globSync('packages/*/*/package.json', { cwd: root })` | ✅ 对 |
| 5 | `verify-runtime-closure.ts:202` | `:202` | `:202` | `  const paths = globSync(['packages/*/*/package.json', 'vendor/*/package.json'], { cwd: root })` | ✅ 对 |
| 6 | `verify-cordis-config.ts:364` | `:364` | `:364` | `  return globSync('packages/*/*/package.json', { cwd: repoRoot })`（`bundleManifestPaths`） | ✅ 对 |
| 7 | `verify-cordis-config.ts:470` | `:470` | `:470` | `  const manifests = globSync(['packages/*/*/package.json', 'vendor/*/package.json'], { cwd: root })`（`localPackageDirectories`） | ✅ 对 |
| 8 | `verify-client-packages.ts:13` | `:13` | `:13` | `const MANIFEST_GLOBS = ['packages/*/*/package.json', 'apps/*/package.json', 'vendor/*/package.json']` | ✅ 对 |
| 9 | `verify-subsystem-pages.ts:73` | `:73` | `:73` | `  const manifests = globSync('packages/*/*/package.json', { cwd: scanRoot }).map(normalize).sort()` | ✅ 对 |
| 10 | `verify-node-next-types.ts:40` | `:40` | `:40` | `    ...globSync('packages/*/*/package.json', { cwd: root }),` | ✅ 对 |
| 11 | `publint-all.ts:53` | `:53` | `:53` | `  return globSync('packages/*/*/package.json', { cwd: packagesRoot })` | ✅ 对 |
| 12 | `project-reference-faces.ts:15`（草案原文同句） | `:15` | `:15` | `  'packages/*/*/package.json',`（`WORKSPACE_MANIFESTS` 数组条目） | ✅ 对 |

**结果：12/12 全对。** 草案的每一条行号都精确指向一个读 package 库存的 `globSync`（或其 glob 模式数组条目）。

**关于 #4 的文件名**：任务警告「`package-invariants.ts` 真实脚本名是 `verify-package-invariants`，草案文件名可能不准」。实测：`package.json` 的 `verify-package-invariants` 脚本跑 `tsx scripts/verify-package-invariants.ts`（709 字节，门脚本——只 import `collectPackageInvariantViolations` 并打印）。库存读取在 `scripts/package-invariants.ts`（16284 字节，helper 模块）。草案引的 `package-invariants.ts:51` 是 **helper 模块**——文件名**准确**（库存 glob 在 helper 里，不在门脚本里）。

**草案同句还提到 `verify-package-readme-{model-experience,limitations}`（无行号）**。这两个门也在 §A 差集外（已登记：`verify-package-readme-model-experience` / `verify-package-readme-limitations` 均在 `docSyncLeafGates`，见 §C 的 pnpmScript 列表）。⚠ 草案未给行号，本 agent 未逐行核实它们的 globSync 位置——但这不影响 §2 交付（本 meta-gate 不依赖这些行号）。

---

## §F §7.2 第 9 条：本门耗时估算

**不能跑门**（只读 agent），静态判断它遍历什么：

| 操作 | 量级 | 说明 |
|---|---|---|
| 读 `package.json` | ~7 KB | 1 次 `readFileSync` |
| 读 `scripts/run-gates.ts` | ~66 KB | 1 次 `readFileSync`（全文，供正则扫） |
| 读 `scripts/gate-coverage.manifest.json` | ~2 KB | 1 次 `readFileSync` |
| 正则 `matchAll` 扫 run-gates.ts | ~100 次 `pnpmScript(` 匹配 | O(源码长度)；单次线性扫描 |
| 建 `Set`（已登记脚本名） | ~65 元素 | O(n) |
| 建 `Set`（verify-*/gen-* 脚本名） | ~65 元素 | `Object.keys` + `filter` |
| 建 `Map`（豁免条目） | ~20 元素 | O(n) |
| 三道检查迭代 | ~65 + 20 + 20 = ~105 | 每条 `Set.has`/`Map.has`（O(1)） |

**结论**：纯 JS、无 build、无网络、无 git、无子进程。文件 I/O 总量 ~75 KB，正则单次线性扫描，集合操作 O(1) 查找。**量级 < 100 ms**（文件 I/O + 正则主导，CPU 可忽略）。与设计草案 §6.2 判定一致（"a fast, pure-JS, build-free check"）。

⚠ **未实测**（只读 agent 不跑 `tsx scripts/verify-gate-coverage.ts`）。但 §7.2 第 9 条的 S2 前身在 `node -e` 里跑过等价逻辑（§C 的正则 + Set diff），实测 < 1s。本门比那多两次 `readFileSync`（package.json + manifest），增量可忽略。

---

## §G 接线 diff（`package.json` + `run-gates.ts` + `run-gates.spec.ts`）

三处改动 + 一处 spec 断言更新。行号均为 tip `12d02c7687` 实测（`cat -n`）。

### G1 — `package.json`：新 script（`:167` 后 / `:168` 前）

**现状**（`cat -n package.json | sed -n 167,168p`）：
```
   167    "verify-architecture-graph": "tsx scripts/gen-architecture-graph.ts --check",
   168    "constraints": "tsx scripts/check-workspace-constraints.ts",
```

**插入**（`:167` 后、`:168` 前，fork-only 缝里）：
```
    "verify-architecture-graph": "tsx scripts/gen-architecture-graph.ts --check",
    "verify-gate-coverage": "tsx scripts/verify-gate-coverage.ts",
    "constraints": "tsx scripts/check-workspace-constraints.ts",
```

### G2 — `scripts/run-gates.ts`：`ciSharedStaticGates()` 尾部（`:312` 后 / `:313` 前）

**现状**（`cat -n scripts/run-gates.ts | sed -n 312,314p`）：
```
   312    pnpmScript('issue-management', 'test:issue-management', { label: 'Issue management policy' }),
   313  ]
   314  }
```

**插入**（`:312` 后、`:313` 前）：
```typescript
    pnpmScript('issue-management', 'test:issue-management', { label: 'Issue management policy' }),
    pnpmScript('gate-coverage', 'verify-gate-coverage'),
  ]
```

**覆盖的 mode**：`ciSharedStaticGates` 被 `ciPrimaryGates`（`:318`）、`ciStaticGates`（`:415`）、`ciWindowsObservationalGates`（`:546` 经 `ciStaticGates`）调用 → 覆盖 `ci-primary`、`ci-linux-primary`、`ci-static`、`ci-windows-observational`、`ci-windows-complete`。

### G3 — `scripts/run-gates.ts`：`hygieneLeafGates()` 尾部（`:707` 后 / `:708` 前）

**现状**（`cat -n scripts/run-gates.ts | sed -n 707,709p`）：
```
   707    pnpmScript('no-bare-dispatcher', 'verify-no-bare-dispatcher', { label: 'proxy-aware dispatchers' }),
   708  ]
   709  }
```

**插入**（`:707` 后、`:708` 前）：
```typescript
    pnpmScript('no-bare-dispatcher', 'verify-no-bare-dispatcher', { label: 'proxy-aware dispatchers' }),
    pnpmScript('gate-coverage', 'verify-gate-coverage'),
  ]
```

**覆盖的 mode**：`hygieneLeafGates` 被 `check-all`（`:275`）、`hygiene`（`:285`）调用 → 覆盖 `check-all`、`hygiene`。

### G4 — `scripts/run-gates.spec.ts`：hygiene id 断言更新（`:185`）

`hygiene` case（`:283-289`）= `...hygieneLeafGates()` + 3 个额外门（`cordis-config`/`runtime-closure`/`vendored-links`）。加 `gate-coverage` 到 `hygieneLeafGates` 尾部后，它在 `no-bare-dispatcher` 与 `cordis-config` 之间。

**现状**（`cat -n scripts/run-gates.spec.ts | sed -n 185,190p`）：
```typescript
    expect(ids).toEqual([
      'rescope-vendor', 'publint', 'constraints', 'package-dependencies', 'application-entrypoints',
      'dsh-package-licenses', 'package-invariants', 'built-package-invariants', 'node-next-types',
      'optional-dependency-imports', 'client-packages', 'client-ui-i18n', 'no-bare-dispatcher', 'cordis-config',
      'runtime-closure', 'vendored-links',
    ])
```

**改动**：在 `'no-bare-dispatcher',` 后、`'cordis-config',` 前插入 `'gate-coverage',`：
```typescript
      'optional-dependency-imports', 'client-packages', 'client-ui-i18n', 'no-bare-dispatcher', 'gate-coverage', 'cordis-config',
```

`ids.length` 从 16 → 17。`defaultConcurrency('hygiene', ids.length, 8)` 断言（`:191-194`）不变——hygiene cap 为 4（与数量无关）。⚠ **未核 `defaultConcurrency` 的 cap 逻辑**——若 17 跨了某阈值（不太可能，因 cap 是固定 4），断言可能需调。

### duplicate-id 复核（`validateGateGraph:813`）

`gate-coverage` 同时进 `ciSharedStaticGates` 与 `hygieneLeafGates`——两函数**从不出现在同一 mode**（S1 §1.5 已核：`ciSharedStaticGates` 调用点 `:297/:318/:415/:546`；`hygieneLeafGates` 调用点 `:275/:285/:687`；两组 mode 不相交）。故 `validateGateGraph` 的 `:813` duplicate-id 检查不触发。`gate-coverage` 是新 id（`grep 'gate-coverage' scripts/run-gates.ts` = 0 命中）。

### 不需改的

- `.github/workflows/*.yml`：新门经 `check:ci:static`（→ `ciStaticGates` → `ciSharedStaticGates`）与 `hygiene`（lefthook pre-push）进入，不需改 workflow。
- `knip.json`：knip 不在任何门里。
- `tsconfig.host.json:110`（`scripts/**/*.ts`）自动收新脚本进 typecheck；`vitest.config.ts:124` 自动收进 test/coverage。
- `.oxlintrc.json`：不需改（scripts override 已覆盖 `scripts/**`）。

---

## §H 诚实边界

### 本 agent 亲自打开确认过的（`read_file` / `cat -n` / `grep -rEn` / `node -e`）

- `scripts/run-gates.ts` 关键段：`ciSharedStaticGates` `:297-314`、`hygieneLeafGates` `:687-709`、`gatesForMode` hygiene case `:283-289`、check-all case `:263-282`、`pnpmScript` `:199-205`、`Gate` interface `:47-64`。
- `scripts/run-gates.spec.ts`：hygiene id 断言 `:182-195`、ci-consumers id 断言 `:512-520`、ci-static `:499-503`（`not.toContain`）、ci-primary `:432-450`（`find`+`toMatchObject`）——确认仅 hygiene 断言需改。
- `scripts/pnpm-invocation.ts` 全文（`:1-21`）：`npm_execpath` throw at `:13-15`；实测 `gatesForMode('ci-primary')` 在 `node --import tsx` 下确实 throw。
- `scripts/verify-config-source-ownership.ts` 全文（CLI 模板）、`scripts/verify-doc-budgets.ts` 全文（manifest 模板）、`scripts/doc-budgets.manifest.json` 全文。
- `package.json` 全部 164 条 scripts（`node -e` 提取 65 条 `verify-*/gen-*`）。
- `run-gates.ts` 全部 `pnpmScript(` 调用（`grep -oE` + `node -e` 正则）：65 个已登记脚本名，其中 44 个 `verify-*/gen-*`。
- 差集 21 条（`comm -23` 临时文件法）+ `node -e` 正则法交叉验证——两者一致。
- §E 的 12 个声称行号：逐个 `cat -n` 核实——12/12 全对。
- `scripts/package-invariants.ts`（helper，16284 字节）vs `scripts/verify-package-invariants.ts`（门脚本，709 字节）——确认草案引的 `package-invariants.ts:51` 是 helper，文件名准确。
- `.oxlintrc.json:110-118`（9 条 `no-unsafe-*`）+ `:153-181`（scripts override rules）。`tsconfig.base.json:19-21`（`strict`/`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`，无 `noImplicitReturns`）。
- 设计草案 §6.1/§6.2（`um15-durable-sync-design-2026-09-10.md:430-540`）+ UM12 票「组外 gate」一节。
- S1 交付文件（`um15-slice-s1-run-gates-2026-09-15.md`）：run-gates.ts 锚点行号交叉确认（S1 测同一 tip `12d02c7687`）。
- `git rev-parse HEAD` = `12d02c76877de1479323b47012a5822d0b215439`，`git status --porcelain` = 空。

### ⚠ 未亲自验证的（静态推断，标风险）

1. **新代码未跑 `tsc` / `oxlint` / `vitest`**——全部类型与 lint 结论为静态推断。落地后须跑 `pnpm exec tsc --noEmit -p tsconfig.host.json` + `pnpm run lint:contracts-ready` + `pnpm exec vitest run scripts/verify-gate-coverage.spec.ts`。
2. **`typeof script === 'string'` 不触发 `no-unnecessary-condition`**——静态判断：`match[1]` 在 `noUncheckedIndexedAccess` 下是 `string | undefined`，`typeof` 守卫是必要的。但 oxlint 的 `no-unnecessary-condition` 是否对 `matchAll` 的 capture group 有不同判定，未验。若报错，改 `const script = match[1] ?? ''` 然后 `if (script !== '') enrolled.add(script)`。
3. **`expect(failures[0]).toContain(...)` 不触发 `no-unsafe-argument`**——静态判断：`failures[0]` 是 `string | undefined`，`expect(unknown)` 接受。但若 oxlint 对 `string | undefined` 传入 `expect` 报 unsafe，改 `expect(failures[0] ?? '').toContain(...)`。
4. **`defaultConcurrency('hygiene', ids.length, 8)` 在 ids.length 16→17 后不变**——静态判断：hygiene cap 为 4（与数量无关）。但未读 `defaultConcurrency` 函数体，若 17 跨了某阈值（不太可能），`:191-194` 断言可能需调。
5. **文本法与运行时法的等价性**——已用 `node -e` 交叉验证（两者均 44 已登记 / 21 未登记）。但文本法假设「每个 `pnpmScript` 调用都从某 mode 可达」（无死 gate-builder 函数）。已核实所有 gate-builder 函数都被 `gatesForMode` 调用，但未穷举每个调用的可达性图。若存在死函数里的 `pnpmScript` 调用，文本法会误判为「已登记」。⚠ 实际风险极低（所有 gate-builder 都被 `gatesForMode` 的 case 调用）。
6. **`import.meta.dirname` 类型**——照抄 `verify-config-source-ownership.ts`（已编译通过），假定 `tsconfig.host.json` 的 `module` 设置支持。未读 `tsconfig.host.json` 的 `module`/`target`。
7. **落地后差集（20 条）的正确性**——假设 §5.2(c) 在 §2 之前落地（§8 顺序）。若 §5.2(c) 未落地，`verify-architecture-graph` 仍在差集里且不在 manifest → meta-gate fail。这是有意为之（surfacing the blind spot），但意味着落地顺序必须 §5.2(c) 先于 §2。
8. **`verify-cordis-api` / `verify-third-party-notices` 的 manifest 豁免是临时债**——当它们被登记时，check 3（已登记+在 manifest→fail）会强制移除豁免。但若有人登记后忘删 manifest 条目，meta-gate 会红。这是有意的（keeps manifest tight）。
9. **草案的运行时方案 vs 本实现的文本方案**——草案 §6.2 说用 `gatesForMode(m) for m of MODES`。本实现改用文本正则，因 `pnpmInvocation` throw。这是设计偏离，已用 §0 说明。功能等价（交叉验证一致），但架构不同。若将来 `pnpmInvocation` 的 throw 被移除或条件化，可回归运行时方案。
