# UM-DEFECT-PRESENT-TABLE-SPLIT — ui-present-table client bundle code-split 与 module table 不兼容

**Type**: defect · **Status**: resolved（2026-09-14） · **Phase**: upstream-merge
**Discovered**: 2026-09-14 human-gates session (first client load failure after fixing the two preset-mount blockers)
**Blocks**: DSH web UI boot (entire UI fails to load, not just the table component)

## Question / Symptom

```
HARNESS Failed to load plugins
failed to import loader entry c664bdb3
  (@deepseek-ai/dsh-client-ui-present-table):
  client-modules: require("./numeric-CxiQHRUo.cjs") missed the module table
  — not a platform seed word, not a materialized module, and no registered
  package factory (a build-time externals drift, or a dynamic dependency
  that did not arrive)
```

Source: `packages/client/modules/src/client/system.ts:209`

## Root Cause

**`packages/client/ui-present-table`** is the **only 1 of 52 client packages** whose built client bundle code-splits. Its `lib/` contains:

```
client.js          (92,730 B — main entry)
numeric-CxiQHRUo.cjs  (1,009 B — code-split chunk)
ChartView-BiysPWBT.cjs  (438,167 B — code-split chunk)
```

`client.js` statically `require()`s both sibling chunks:
```
require("./ChartView-BiysPWBT.cjs")
require("./numeric-CxiQHRUo.cjs")
```

But the **client module table serves exactly one bundle per package row** — the `dsh.client` entry, which is `lib/client.js`. The sibling chunks are built to disk but never registered in the module table. So `client.js` hits the `require()` and the module table has no factory for the chunk name → error.

**What triggers the code-split**: `@tanstack/react-virtual` + `chart.js` + `react-chartjs-2` dependencies are large enough that tsdown's default splitting kicks in. The other 51 client packages are single-file because their deps are small enough to inline.

**Verified**: build is fresh vs src (0 source files newer than `lib/client.js`); the sibling chunks exist on disk; the chunks themselves are valid JS (the `numeric` chunk's body is a numeric-cell parser, not broken).

**The other 51 client packages are single-file** (full scan: `split: 1, single-file: 51`). So disabling this one row is a complete fix, not whack-a-mole.

## Session workaround (2026-09-14, NOT a repo change)

Overlay at `/tmp/dsh-disable-present-table.patch.yml` disables the row:

```yaml
- id: ui-present-table
  disabled: true
```

Base row: `packages/bundle/web-app/cordis.patch.yml:361`. Disable syntax follows the documented convention at `packages/bundle/data-agent/cordis.patch.yml:11-16`.

**Verified via HTTP before/after diff**:
- BEFORE (no patch): served HTML = 30,027 bytes, 52 client rows, `present-table` referenced once
- AFTER (patched): served HTML = 29,698 bytes, 51 client rows, `present-table` absent

**Cost**: table rendering unavailable. For B-DA1 capture (the task at hand) this is irrelevant — the race aborts the first turn before results display. For normal data-agent use, the result table won't render.

## Repo fix options (for AFK execution session)

1. **Fix tsdown config**: add `external` or `noExternal` config to `packages/client/ui-present-table/tsdown.config.ts` so the three deps are inlined (single-file output). Check if tsdown supports a `split: false` or `noCodeSplitting` flag.
2. **Fix the module table**: make `client-modules` serve sibling chunks. This requires understanding how the `id:` → factory registration works and adding multi-file support. Bigger change, more risk.
3. **Fix the build output**: force the tsdown entry to emit a single file (e.g., `output: { inlineDynamicImports: true }`). May blow up bundle size.

Option 1 is likely cheapest. Option 2 is architecturally correct but high-risk.

## Impact

- **Severity**: HIGH. The web UI cannot boot at all — not just the table component, the whole UI fails to load because one plugin row aborts the composition.
- **Affected profiles**: `web` only. `headless` and `tui` do not load client bundles.

## [2026-09-14] RESOLVED — 使用 Rolldown `outputOptions.codeSplitting` 并完成 clean build 验证

初版 `splitting: false` 不属于 tsdown 0.22 的有效顶层选项，会被静默忽略。最终 commit `4375f9c3ff` 在 `packages/client/ui-present-table/tsdown.config.ts` 对 Client 配置设置 `outputOptions.codeSplitting: false`，同时保留已有 output options。回归测试 `scripts/ui-present-table-tsdown-config.spec.ts` 固定这一配置。

`pnpm run build:lib:client` 于 2026-09-14 通过；`packages/client/ui-present-table/lib/` 只有 `client.js`、source map、Host 入口和 tsbuildinfo，顶层 sibling `.cjs` 数量为 0，`client.js` 也不再引用 `ChartView-*.cjs` 或 `numeric-*.cjs`。临时 disable overlay 不再需要。
