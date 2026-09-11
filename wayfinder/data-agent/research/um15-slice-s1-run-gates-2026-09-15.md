# UM15 首片 §1：`scripts/run-gates.ts` MODES 重构（S1 交付，2026-09-15）

> 状态：**完整交付**（所有锚点已 read_file 核实，代码已逐处给出）。
>
> 树：`/Users/mckenzie/workspace/dsh-resync`，tip `12d02c7687`（工作树干净——只读 agent，未碰、未改、未 commit）。
> 本 agent 为只读 agent：**未运行** tsc / oxlint / vitest。所有类型与 lint 结论均为静态推断，风险处标 ⚠。

---

## §1.1 锚点核实表

每个锚点的前身记录行号 vs 当前 tip `12d02c7687` 实测行号 vs 该处现有代码 verbatim 片段。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| A | `type Mode` union | `:24-41` | `:24-41` | ✅ 精确 |

**A. `type Mode` union（file `:23-41`）**

```typescript
// :23
/** A named aggregate exposed by the gate runner. */
export type Mode =
  | 'ci-primary'
  | 'ci-linux-primary'
  | 'ci-static'
  | 'ci-lint-contracts-ready'
  | 'ci-coverage'
  | 'ci-bench'
  | 'ci-snapshot'
  | 'ci-artifacts'
  | 'ci-consumers'
  | 'ci-windows-blocking'
  | 'ci-windows-complete'
  | 'ci-windows-observational'
  | 'node-compat'
  | 'check-all'
  | 'hygiene'
  | 'doc-sync'
  | 'doc-quick'       // :41
```

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| B | `parseMode` | `:134-159` | `:134-159` | ✅ 精确 |

**B. `parseMode`（file `:134-159`）**

```typescript
// :134
function parseMode(raw: string | undefined): Mode {
  switch (raw) {
    case 'ci-primary':
    case 'ci-linux-primary':
    case 'ci-static':
    case 'ci-lint-contracts-ready':
    case 'ci-coverage':
    case 'ci-bench':
    case 'ci-snapshot':
    case 'ci-artifacts':
    case 'ci-consumers':
    case 'ci-windows-blocking':
    case 'ci-windows-complete':
    case 'ci-windows-observational':
    case 'node-compat':
    case 'check-all':
    case 'hygiene':
    case 'doc-sync':
    case 'doc-quick':
      return raw
    default:
      throw new Error(
        `run-gates: expected mode ci-primary | ci-linux-primary | ci-static | ci-lint-contracts-ready | ci-coverage | ci-bench | ci-snapshot | ci-artifacts | ci-consumers | ci-windows-blocking | ci-windows-complete | ci-windows-observational | node-compat | check-all | hygiene | doc-sync | doc-quick, got ${JSON.stringify(raw)}.`,
      )
  }
}   // :159
```

> ⚠ **第五份 mode 列表**：`parseMode` 的 error message（`:156`）硬编码了全部 17 个 mode 的 ` | `-joined 字符串——这是散落的第五份副本，重构后由 `MODES.join(' | ')` 取代。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| C | `gatesForMode` 全表 | `:232-295` | `:232-295` | ✅ 精确 |

**C. `gatesForMode`（file `:232-295`）**

```typescript
// :232
export function gatesForMode(selected: Mode): Gate[] {
  switch (selected) {
    case 'ci-primary':
      return ciPrimaryGates()
    case 'ci-linux-primary':
      return [...ciPrimaryGates(), webSnapshotGate(['built-package-invariants'])]
    case 'ci-static':
      return ciStaticGates({ ownsBuild: false })
    case 'ci-lint-contracts-ready':
      return [lintGate(), pnpmScript('duplication', 'duplication')]
    case 'ci-coverage':
      return coverageGates()
    case 'ci-bench':
      return [pnpmScript('bench', 'test:bench', { label: 'performance benchmarks' })]
    case 'ci-snapshot':
      return [ciBuildGate(), snapshotGate()]
    case 'ci-artifacts':
      return ciArtifactGates()
    case 'ci-consumers':
      return ciConsumerGates()
    case 'ci-windows-blocking':
      return ciWindowsBlockingGates()
    case 'ci-windows-complete':
      return ciWindowsCompleteGates()
    case 'ci-windows-observational':
      return ciWindowsObservationalGates()
    case 'node-compat':
      return nodeCompatGates()
    case 'check-all':
      return [/* ... 12 items ... */]
    case 'hygiene':
      return [/* ... 4 items ... */]
    case 'doc-sync':
      return docSyncLeafGates()
    case 'doc-quick':
      return docQuickLeafGates()     // :293
  }                                 // :294  ← 无 default
}                                   // :295
```

> **当前 switch 无 `default`**：17 个 case 覆盖了全部 `Mode` 成员，TypeScript 控制流分析认为它已穷尽（所以函数无尾 `return` 也不报 `noImplicitReturns`——项目也未启此 flag）。但 oxlint `switch-exhaustiveness-check`（`:175` 配 `considerDefaultExhaustiveForUnions: true`）更稳妥的写法是加一个 `never`-asserting `default`。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| D | `ciSharedStaticGates` | `:297-314` | `:297-314` | ✅ 精确 |

**D. `ciSharedStaticGates`（file `:297-314`）**

```typescript
// :297
function ciSharedStaticGates(): Gate[] {
  return [
    pnpmScript('runtime-closure', 'verify-runtime-closure', { label: 'runtime closure' }),
    pnpmScript('application-entrypoints', 'verify-application-entrypoints', { label: 'application entrypoints' }),
    pnpmScript('constraints', 'constraints'),
    pnpmScript('package-dependencies', 'verify-package-dependencies', { label: 'package dependencies' }),
    pnpmScript('dsh-package-licenses', 'verify-dsh-package-licenses', { label: 'DSH package licenses' }),
    pnpmScript('package-invariants', 'verify-package-invariants', { label: 'package invariants' }),
    pnpmScript('cordis-config', 'verify-cordis-config', { label: 'Cordis config' }),
    pnpmScript('optional-dependency-imports', 'verify-optional-dependency-imports', { label: 'optional dependency imports' }),
    pnpmScript('client-packages', 'verify-client-packages', { label: 'client packages' }),
    pnpmScript('client-ui-i18n', 'verify-client-ui-i18n', { label: 'client UI i18n' }),
    pnpmScript('no-bare-dispatcher', 'verify-no-bare-dispatcher', { label: 'proxy-aware dispatchers' }),
    pnpmScript('issue-management', 'test:issue-management', { label: 'Issue management policy' }),  // :312
  ]   // :313 ← gate-coverage 将来插这里（§5）
}     // :314
```

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| E | `ciPrimaryGates` | `:316-343` | `:316-343` | ✅ 精确 |

**E. `ciPrimaryGates`（file `:316-343`）** — 以 `...ciSharedStaticGates()`（`:318`）开头，接 typert-contracts / typecheck / lint / duplication / coverage / node-compat / snapshot / docSync / module-graph / build / publint / node-next-types / built-package-invariants / built-bin-smoke。未读全 28 行（不重要——本节不改它），确认首行 `:316` + `...ciSharedStaticGates()` at `:318` 即可。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| F | `ciStaticGates` | `:413-430` | `:413-430` | ✅ 精确 |

**F. `ciStaticGates`（file `:413-430`）** — 以 `...ciSharedStaticGates()`（`:415`）开头，接条件 build / docSyncLeafGates / module-graph。确认首行 `:413` + `...ciSharedStaticGates()` at `:415`。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| G | `ciConsumerGates` | `:445-485` | `:445-485` | ✅ 精确 |

**G. `ciConsumerGates`（file `:445-485`）** — 以 `ciBuildGate()`（`:487`→`return [ ciBuildGate(), ...`）开头，不含 `ciSharedStaticGates` / `hygieneLeafGates`。确认行范围 `:445-485`。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| H | windows observational | `:544-565` | `:544-565` | ✅ 精确 |

**H. `ciWindowsObservationalGates`（file `:544-565`）**

```typescript
// :544
function ciWindowsObservationalGates(): Gate[] {
  const predecessors = [
    ...ciStaticGates({ ownsBuild: true }),   // :546 ← 调 ciStaticGates → ciSharedStaticGates
    pnpmScript('duplication', 'duplication'),
    pnpmScript('publint', 'publint', { needs: ['build'] }),
    pnpmScript('node-next-types', 'verify-node-next-types', { label: 'node-next types', needs: ['build'] }),
    builtPackageInvariantsGate(['build']),
  ]
  return [
    ...predecessors,
    { ...builtBinSmokeGate(), after: predecessors.map(gate => gate.id) },
  ]
}   // :565
```

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| I | `hygieneLeafGates` | `:687-709` | `:687-709` | ✅ 精确 |

**I. `hygieneLeafGates`（file `:687-709`）**

```typescript
// :687
function hygieneLeafGates(options: { artifactNeeds?: string[] } = {}): Gate[] {
  const artifactOptions = options.artifactNeeds === undefined ? {} : { needs: options.artifactNeeds }
  return [
    pnpmScript('rescope-vendor', 'rescope-vendor:check', { label: 'vendor rescope' }),
    pnpmScript('publint', 'publint', artifactOptions),
    pnpmScript('constraints', 'constraints'),
    pnpmScript('package-dependencies', 'verify-package-dependencies', { label: 'package dependencies' }),
    pnpmScript('application-entrypoints', 'verify-application-entrypoints', { label: 'application entrypoints' }),
    pnpmScript('dsh-package-licenses', 'verify-dsh-package-licenses', { label: 'DSH package licenses' }),
    pnpmScript('package-invariants', 'verify-package-invariants', { label: 'package invariants' }),
    builtPackageInvariantsGate(options.artifactNeeds),
    pnpmScript('node-next-types', 'verify-node-next-types', { label: 'node-next types', ...artifactOptions }),
    pnpmScript('optional-dependency-imports', 'verify-optional-dependency-imports', { label: 'optional dependency imports' }),
    pnpmScript('client-packages', 'verify-client-packages', { label: 'client packages' }),
    pnpmScript('client-ui-i18n', 'verify-client-ui-i18n', { label: 'client UI i18n' }),
    pnpmScript('no-bare-dispatcher', 'verify-no-bare-dispatcher', { label: 'proxy-aware dispatchers' }),  // :707
  ]   // :708 ← upstream-sync-record 将来插这里（§5）
}     // :709
```

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| J | `docSyncLeafGates` | `:711-764` | `:711-764` | ✅ 精确 |

**J. `docSyncLeafGates`（file `:711-764`）** — 签名 `:711`，body `:718-763`（含 doc-typecheck / docs-site-build / doc-graphs / markdown-links / ... / package-readme-limitations），`]` at `:763`，`}` at `:764`。本节不改它。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| K | `docQuickLeafGates` | `:771-773` | `:771-773` | ✅ 精确 |

**K. `docQuickLeafGates`（file `:771-773`）**

```typescript
// :771
function docQuickLeafGates(): Gate[] {
  return docSyncLeafGates({ includeDocTypecheck: false }).filter(gate => gate.quick === true)
}   // :773
```

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| L | `validateGateGraph` duplicate-id | `:808-813` | `:808-813` | ✅ 精确 |

**L. `validateGateGraph` duplicate-id check（file `:808-813`）**

```typescript
// :808
function validateGateGraph(gates: readonly Gate[]): void {
  if (gates.length === 0) throw new Error('run-gates: gate graph has no gates.')  // :810

  const ids = new Set<string>()    // :812
  for (const gate of gates) {
    if (ids.has(gate.id)) throw new Error(`run-gates: duplicate gate id ${JSON.stringify(gate.id)}.`)  // :813
    ids.add(gate.id)
  }
```

### spec 锚点

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| M | 第四份 mode 列表（`it.each`） | `:137-161` | `:137-161` | ✅ 精确 |

**M. spec `it.each` 17-mode 列表（file `run-gates.spec.ts:138-156`）**

```typescript
// :137  describe('gate graph validation', () => {
// :138    it.each([
// :139      'ci-primary',
// :140      'ci-linux-primary',
// :141      'ci-static',
// :142      'ci-lint-contracts-ready',
// :143      'ci-coverage',
// :144      'ci-bench',
// :145      'ci-snapshot',
// :146      'ci-artifacts',
// :147      'ci-consumers',
// :148      'ci-windows-blocking',
// :149      'ci-windows-complete',
// :150      'ci-windows-observational',
// :151      'node-compat',
// :152      'check-all',
// :153      'hygiene',
// :154      'doc-sync',
// :155      'doc-quick',
// :156    ] as const)('constructs and executes preflight for a valid non-empty %s graph', async (mode) => {
```

**mode 数 = 17**（与 `type Mode` union、`parseMode` switch、`gatesForMode` switch 的 case 数一致）。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| N | hygiene id 断言 | `:182-195` | `:182-195` | ✅ 精确 |

**N. spec hygiene id 断言（file `run-gates.spec.ts:182-195`）**

```typescript
// :182
  it('keeps the hygiene aggregate aligned with the package script checks', () => {
    const ids = withPnpmEntrypoint(() => gatesForMode('hygiene').map(subject => subject.id))

    expect(ids).toEqual([
      'rescope-vendor', 'publint', 'constraints', 'package-dependencies', 'application-entrypoints',
      'dsh-package-licenses', 'package-invariants', 'built-package-invariants', 'node-next-types',
      'optional-dependency-imports', 'client-packages', 'client-ui-i18n', 'no-bare-dispatcher', 'cordis-config',
      'runtime-closure', 'vendored-links',
    ])
    expect(defaultConcurrency('hygiene', ids.length, 8)).toEqual({
      workers: 4,
      source: '8 available CPU(s), hygiene cap 4',
    })
  })   // :195
```

> 本节不改 hygiene 断言（mode 列表重构不改变任何 mode 的 gate 列表）。但记录它，因为 §4 若往 `hygieneLeafGates` 尾部加 `upstream-sync-record`，此断言需同步加一项。

| # | 锚点名称 | 前身记录行号 | 今行号（实测） | 匹配 |
|---|---|---|---|---|
| O | 其余 `it.each` | `:216/225/234/243` | `:216/225/234/243/252` | ⚠ 前身漏了 `:252` |

**O. spec 其余 `it.each`（file `run-gates.spec.ts`）** — grep `it.each` 命中 7 处：`:138`（17-mode 全表）、`:216`（ci-primary/ci-static/check-all）、`:225`（+hygiene）、`:234`（ci-primary/ci-static/check-all）、`:243`（+hygiene）、`:252`（+hygiene）、`:349`（6 条 invalid graph case）。**本节只改 `:138` 那一处**，其余都是小子集参数化，不受 MODES 重构影响。

---

## §1.2 新增代码全文（`MODES` / `isMode` / `parseMode` 重写）

以下三块新代码替换 `run-gates.ts` 中的三处旧代码。它们是本节的核心交付。

### 新块 1：`MODES` readonly tuple + `type Mode` 派生 + `isMode` type guard

插入位置：替换 file `:23-41` 的 `export type Mode = | 'ci-primary' | ... | 'doc-quick'`。

```typescript
/**
 * The canonical, ordered list of every named aggregate the gate runner exposes.
 * This readonly tuple is the single source of truth: {@link Mode} is derived
 * from it, {@link isMode} validates membership against it, and {@link parseMode}
 * rejects CLI input that is not in it. Test parameterization reads from it
 * directly so the suite cannot drift from the union.
 */
export const MODES = [
  'ci-primary',
  'ci-linux-primary',
  'ci-static',
  'ci-lint-contracts-ready',
  'ci-coverage',
  'ci-bench',
  'ci-snapshot',
  'ci-artifacts',
  'ci-consumers',
  'ci-windows-blocking',
  'ci-windows-complete',
  'ci-windows-observational',
  'node-compat',
  'check-all',
  'hygiene',
  'doc-sync',
  'doc-quick',
] as const

/** A named aggregate exposed by the gate runner. */
export type Mode = (typeof MODES)[number]

/**
 * Test whether a string is a valid gate-runner {@link Mode}.
 * @param value - the string to test.
 * @returns `true` when `value` names a mode in {@link MODES}.
 */
export function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value)
}
```

**设计要点**：
- `MODES` 用 `as const` 使其类型为 `readonly ['ci-primary', ..., 'doc-quick']`（17 元素 readonly tuple），而非 `string[]`。`prefer-as-const` 满足（这正是 `as const` 的规范用法）。
- `type Mode = (typeof MODES)[number]` 从 tuple 派生联合类型，与旧的手写 `| 'ci-primary' | ...` 类型等价——TypeScript 在类型系统层面展开它，`gatesForMode` switch 的穷尽性分析不受影响。
- `isMode` 的 `(MODES as readonly string[]).includes(value)` 需要 `as readonly string[]` 宽化：readonly tuple 的 `.includes()` 签名要求参数为 union 成员类型，不接受裸 `string`。宽化到 `readonly string[]` 后 `.includes(value: string)` 合法。这是安全宽化（tuple 是 `readonly string[]` 的子类型），不触发 `no-unsafe-*`（无 `any`），也不触发 `no-unnecessary-type-assertion`（类型确实变了）。
- `isMode` 导出（`export function`）：spec 的 `it.each(MODES)` 需要 `MODES` 导出；`isMode` 虽然当前只被 `parseMode` 内部使用，但作为 mode 系统的公开 API 一并导出，不增 lint 负担。

### 新块 2：`parseMode` 重写（使用 `isMode`）

替换 file `:134-159` 的旧 `parseMode`。

```typescript
function parseMode(raw: string | undefined): Mode {
  if (raw !== undefined && isMode(raw)) return raw
  throw new Error(
    `run-gates: expected one of ${MODES.join(' | ')}, got ${JSON.stringify(raw)}.`,
  )
}
```

**设计要点**：
- 旧的 17-case `switch` + 硬编码 error message 字符串（第五份 mode 副本）被 3 行取代。
- `raw !== undefined` 非 `no-unnecessary-condition`：`raw: string | undefined`，运行时可为任一。
- `isMode(raw)` 在 `raw !== undefined` 后将 `raw` 窄化为 `string`，`isMode` 返回 `boolean` 并将 `raw` 进一步窄化为 `Mode`——`return raw` 合法。
- `MODES.join(' | ')` 返回 `string`，`JSON.stringify(raw)` 返回 `string`（TS 签名对 `string | undefined` 均返回 `string`），`restrict-template-expressions`(allowNumber+allowBoolean) 满足。
- `throw new Error(...)` 满足 `only-throw-error`。
- `parseMode` 不导出（仅 `main` 在 `:104` 调用）——不变。

### 新块 3：`gatesForMode` switch 加 exhaustive `default`

在 file `:293`（`return docQuickLeafGates()`）与 `:294`（`}` 闭合 switch）之间插入 `default` case。

**替换前（file `:293-295`）**：
```typescript
    case 'doc-quick':
      return docQuickLeafGates()
  }
}
```

**替换后**：
```typescript
    case 'doc-quick':
      return docQuickLeafGates()
    default: {
      const _exhaustive: never = selected
      throw new Error(`run-gates: unhandled mode ${JSON.stringify(_exhaustive)}.`)
    }
  }
}
```

**设计要点**：
- oxlint `switch-exhaustiveness-check`（`.oxlintrc.json:175` 配 `considerDefaultExhaustiveForUnions: true`）：有 `default` 即认为 union switch 穷尽——满足。
- `const _exhaustive: never = selected`：在 `default` 分支，TypeScript 将 `selected` 窄化为 `never`（因为 17 个 `case` 覆盖了全部 `Mode` 成员）。若将来往 `MODES` 加一个 mode 但忘加 `case`，`selected` 在 `default` 分支将是新 mode 类型，赋值给 `never` 编译失败——这是编译期穷尽保证。
- `_exhaustive` 前缀 `_` 满足 `no-unused-vars`（`argsIgnorePattern: "^_"`，`varsIgnorePattern: "^_"`），且它确实被 `JSON.stringify` 读。
- `JSON.stringify(_exhaustive)` 的参数是 `never`，但 `JSON.stringify(value: any)` 接受 `never`，返回 `string`——`restrict-template-expressions` 满足。
- `throw new Error(...)` 满足 `only-throw-error`。
- 无 `!`（满足 `no-non-null-assertion`），无 `any`（满足全套 `no-unsafe-*`）。

---

## §1.3 逐处替换 patch

### Patch A — `run-gates.ts` `:23-41`：`type Mode` union → `MODES` + `Mode` + `isMode`

**替换前（verbatim，file `:23-41`，带锚点行号）**：
```typescript
// :23  /** A named aggregate exposed by the gate runner. */
// :24  export type Mode =
// :25    | 'ci-primary'
// :26    | 'ci-linux-primary'
// :27    | 'ci-static'
// :28    | 'ci-lint-contracts-ready'
// :29    | 'ci-coverage'
// :30    | 'ci-bench'
// :31    | 'ci-snapshot'
// :32    | 'ci-artifacts'
// :33    | 'ci-consumers'
// :34    | 'ci-windows-blocking'
// :35    | 'ci-windows-complete'
// :36    | 'ci-windows-observational'
// :37    | 'node-compat'
// :38    | 'check-all'
// :39    | 'hygiene'
// :40    | 'doc-sync'
// :41    | 'doc-quick'
```

**替换后**（即 §1.2 新块 1 全文，不再重复）。

### Patch B — `run-gates.ts` `:134-159`：`parseMode` switch → `isMode` + `MODES.join`

**替换前（verbatim，file `:134-159`）**：即 §1.1 锚点 B 的全文（17-case switch + 硬编码 error message）。

**替换后**（即 §1.2 新块 2 全文，不再重复）。

### Patch C — `run-gates.ts` `:293-295`：`gatesForMode` switch 加 `default`

**替换前（verbatim，file `:293-295`）**：
```typescript
    case 'doc-quick':
      return docQuickLeafGates()
  }
}
```

**替换后**（即 §1.2 新块 3 全文，不再重复）。

> **Patch 不改动的位置**：`gatesForMode` 的 17 个 `case` 分支体（`:234-293`）全部保留原样——重构只加 `default`，不动任何现有 case 的返回值。

---

## §1.4 `run-gates.spec.ts` 改动

### Patch D — spec `:1-11`：import 加 `MODES`

**替换前（verbatim，file `:1-11`）**：
```typescript
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  cliGateOptions,
  defaultConcurrency,
  formatGateResultReason,
  gatesForMode,
  parsePidPpidLines,
  runGate,
  runGates,
  taskkillArgs,
  type Gate,
  type GateResult,
} from './run-gates.ts'
```

**替换后**：
```typescript
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  cliGateOptions,
  defaultConcurrency,
  formatGateResultReason,
  gatesForMode,
  MODES,
  parsePidPpidLines,
  runGate,
  runGates,
  taskkillArgs,
  type Gate,
  type GateResult,
} from './run-gates.ts'
```

> `MODES` 插在 `gatesForMode` 与 `parsePidPpidLines` 之间（case-insensitive 字母序 g < m < p）。

### Patch E — spec `:138-156`：`it.each` 17-mode 列表 → `it.each(MODES)`

**替换前（verbatim，file `:138-156`）**：即 §1.1 锚点 M 的全文（`it.each([ 17 modes ] as const)(...)`）。

**替换后**：
```typescript
  it.each(MODES)('constructs and executes preflight for a valid non-empty %s graph', async (mode) => {
    const subject = withPnpmEntrypoint(() => gatesForMode(mode))
    const execute = vi.fn(async (item: Gate) => resultFor(item))

    await expect(runGates(subject, subject.length, execute)).resolves.toHaveLength(subject.length)
  })
```

**`it.each(MODES)` readonly tuple 风险静态判断**：

`MODES` 类型为 `readonly ['ci-primary', ..., 'doc-quick']`，与旧的内联 `[...17 modes] as const` 类型完全一致。vitest `it.each` 签名接受 `ReadonlyArray<T>`——readonly tuple 是 `ReadonlyArray<T>` 的子类型。因此 `it.each(MODES)` 的类型推断与旧的内联写法相同：`T = Mode`，回调参数 `mode: Mode`。

⚠ **未跑 tsc 验证**。若 vitest 某版本 `it.each` 对 module-level readonly tuple 报类型错（内联 `as const` 与变量引用在泛型推断上可能有微妙差异），fallback 为 `it.each([...MODES])`——`[...MODES]` 展开 readonly tuple 为 mutable `Mode[]`，`it.each` 接受 `Mode[]`（也是 `ReadonlyArray<Mode>`），回调参数同样为 `mode: Mode`。两种写法均产生 17 个参数化 case，测试数不变。

> spec 其余 `it.each`（`:216/225/234/243/252/349`）使用小子集内联数组（如 `['ci-primary', 'ci-static', 'check-all'] as const`），不是「全 mode 列表」的副本，**不改**。

---

## §1.5 §5 接线预留（`gate-coverage` / `upstream-sync-record` 插入位置 + duplicate-id 复核）

本节不加这两个新门（那是 §2/§4 的事），只指出将来插入的准确位置，并复核 duplicate-id 风险。

### 插入位置

| 新门 | 插入函数 | 插入点（file 行号） | 覆盖的 mode |
|---|---|---|---|
| `gate-coverage` | `ciSharedStaticGates()` 尾部 | `:312`（`issue-management` 行）之后、`:313`（`]`）之前 | ci-primary, ci-linux-primary, ci-static, ci-windows-observational, ci-windows-complete |
| `upstream-sync-record` | `hygieneLeafGates()` 尾部 | `:707`（`no-bare-dispatcher` 行）之后、`:708`（`]`）之前 | check-all, hygiene |

> §5 Decision 6(a) 的 `verify-architecture-graph` enroll 位置是 `docSyncLeafGates()`（§7 of 前身文档说的是 `:727` 改后 `:722`），不在本节范围——但记录此交叉点供 §2 落地时参考。

### duplicate-id 复核（`validateGateGraph:813`）

**结论：加这两个新门不会触发 `:813` duplicate-id。**

依据（全部 grep 核实）：

1. **`ciSharedStaticGates` 与 `hygieneLeafGates` 从不出现在同一 mode**——已核实：
   - `ciSharedStaticGates` 调用点（`grep -n ciSharedStaticGates scripts/run-gates.ts`）：`:297`（定义）、`:318`（`ciPrimaryGates` 调）、`:415`（`ciStaticGates` 调）。仅这两处调用。
   - `ciStaticGates` 调用点（`grep -n ciStaticGates scripts/run-gates.ts`）：`:239`（`gatesForMode` 的 `ci-static` case）、`:413`（定义）、`:546`（`ciWindowsObservationalGates` 调）。
   - `ciWindowsCompleteGates`（`:518`）调 `ciWindowsObservationalGates()`（`:525`），后者调 `ciStaticGates`（`:546`），后者调 `ciSharedStaticGates`（`:415`）——所以 ci-windows-complete 也传递性包含 `ciSharedStaticGates` 的门。
   - `hygieneLeafGates` 调用点（`grep -n hygieneLeafGates scripts/run-gates.ts`）：`:275`（`check-all` case）、`:285`（`hygiene` case）、`:687`（定义）。仅这两处调用。
   - **使用 ciSharedStaticGates 的 mode**：ci-primary, ci-linux-primary, ci-static, ci-windows-observational, ci-windows-complete。
   - **使用 hygieneLeafGates 的 mode**：check-all, hygiene。
   - **两组 mode 不相交** → 两个函数永不在同一 mode 的 gate 列表中共存。

2. **`gate-coverage` 与 `upstream-sync-record` 是新 id**——`grep -rn 'gate-coverage\|upstream-sync-record' scripts/run-gates.ts scripts/run-gates.spec.ts` 返回空。不与任何现有 gate id 冲突。

3. **两个新 id 互不相同** → 即使（假设性地）两函数出现在同一 mode，也不会互相 duplicate。

4. **现有重叠 id 的安全性**：`ciSharedStaticGates` 与 `hygieneLeafGates` 确实有 9 个重叠 gate id（`constraints`, `package-dependencies`, `application-entrypoints`, `dsh-package-licenses`, `package-invariants`, `optional-dependency-imports`, `client-packages`, `client-ui-i18n`, `no-bare-dispatcher`）。这些重叠 id 今天不触发 `:813` 正是因为两函数从不同 mode 出现——上面的 mode 不相交性是承重不变量。加新门不破坏这个不变量（新门分别加在两个不相交函数的尾部，不改变调用拓扑）。

---

## §1.6 诚实边界

### 本 agent 亲自打开确认过的（read_file / sed / grep）

- `scripts/run-gates.ts` 全文 66KB 已读（经 persisted-output，preview + sed 分段覆盖所有锚点区间：`:1-45`, `:100-107`, `:125-170`, `:225-350`, `:400-500`, `:500-580`, `:680-780`, `:790-820`）。
- `scripts/run-gates.spec.ts` 全文已读（<66KB，一次 read_file 完成）。
- `.oxlintrc.json` `:1-55`（全局 + ignorePatterns + overrides[0] 开头）、`:55-100`（shared rules）、`:95-155`（no-unsafe-* section + scripts override 开头）、`:145-190`（scripts override rules）。
- `tsconfig.base.json:19-21`（`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`——无 `noImplicitReturns`）。
- `grep -n` 核实了：`ciSharedStaticGates`（3 hit）、`ciStaticGates`（3 hit）、`hygieneLeafGates`（3 hit）、`parseMode`（2 hit）、`it.each`（7 hit）、`no-unsafe`（9 hit）、`gate-coverage|upstream-sync-record`（0 hit）、`isMode|MODES`（0 hit）。
- `git rev-parse HEAD` = `12d02c76877de1479323b47012a5822d0b215439`，`git status --porcelain` = 空（工作树干净）。
- 两个背景文档全文已读（`um15-first-slice-implementation-2026-09-14.md` + `um15-durable-sync-design-2026-09-10.md`）。

### ⚠ 未亲自验证的（静态推断，标风险）

1. **`it.each(MODES)` 的类型兼容性** — 未跑 `tsc`。静态判断：`MODES`（`readonly [...] as const`）与旧内联 `[...] as const` 类型相同，vitest `it.each` 接受 `ReadonlyArray<T>`，应通过。若不过，改 `it.each([...MODES])`（见 §1.4 Patch E）。
2. **`(MODES as readonly string[]).includes(value)` 不触发 `no-unnecessary-type-assertion`** — 静态判断：`readonly [...]` 宽化为 `readonly string[]` 类型确实变了（tuple → array），不是 no-op。但 oxlint 的 `no-unnecessary-type-assertion` 是否对 widening cast 有不同判定，未验。若报错，替代写法：`function isMode(value: string): value is Mode { for (const mode of MODES) { if (mode === value) return true } return false }`（无 cast，但更冗长）。
3. **`default` 分支的 `const _exhaustive: never = selected` 不触发 `no-unnecessary-condition` 或 unreachable-code 检查** — 静态判断：`no-unnecessary-condition` 只查 `if`/三元/逻辑表达式条件，不查 switch case 或赋值。但 oxlint 是否有额外的 unreachable-code 规则未在 `.oxlintrc.json` 中列出，未验。
4. **`type Mode = (typeof MODES)[number]` 派生类型在 oxlint `switch-exhaustiveness-check` 下与手写 union 行为一致** — 静态判断：TypeScript 类型系统将 `(typeof MODES)[number]` 展开为同样的字面量联合，oxlint 通过 type-aware 检查应能识别。但加了 `default`（`considerDefaultExhaustiveForUnions: true`）后此问题 moot——有 `default` 即穷尽，无论 oxlint 能否展开派生类型。
5. **新代码未跑 tsc / oxlint / vitest** — 全部类型与 lint 结论为静态推断。落地后须跑 `pnpm exec vitest run scripts/run-gates.spec.ts`（应 17 个 mode 参数化 case 全绿）+ `pnpm exec tsc --noEmit -p tsconfig.host.json` + `pnpm run lint:contracts-ready`。
6. **spec 测试数不变** — 重构只把 `:138` 的内联 17-mode 列表换成 `MODES`，不改任何 case 体，不加/删测试。17 个参数化 case → 仍是 17 个。
