# UM-DEFECT-PRESET-ROOTS — 无任何 bundle/profile 配置 agent-presets.roots，da preset 无根可扫

**Type**: defect · **Status**: open · **Phase**: upstream-merge
**Discovered**: 2026-09-20 human-gates session
**Blocks**: same as [UM-DEFECT-PRESET-DEPS](UM-DEFECT-PRESET-DEPS.md) — session creation via the profile mount path

## Question / Symptom

```
agent-preset/not-found: agent-presets: preset "data-agent" not found
  (available: standard, ptc, minimal, cordis)
```

`web` profile and `headless` profile both set `default: data-agent` (in their respective bundle patches). Only `standard`, `ptc`, `minimal`, `cordis` (the 4 shipped presets) appear in the picker. `data-agent` and `semantic-layer-management` (the 2 da-owned presets) are invisible.

## Root Cause

`AgentPresets` (`packages/preset/agent-presets/src/index.ts:106-113`) scans three sources in order:
1. **shipped root** (`packages/preset/agent-presets/presets/`) — has the 4 built-in presets (standard/ptc/minimal/cordis)
2. **`config.roots`** — an array of `{path, trust}` from the mount config
3. **user root** (`$DSH_HOME/.agent-presets`) — user-authored presets

The da presets live at `apps/cli/config/agent-presets/`. This directory is **not in any of the three roots**:

- **No bundle anywhere in the repo configures `config.roots`** (full grep `roots:` on all `cordis.patch.yml` files: zero hits)
- **`~/.dsh/.agent-presets` does not exist** (verified `ls: No such file or directory`)
- The shipped root has the 4 built-in presets, not the da ones

**Why it worked historically**: `apps/cli/package.json` declares `dsh.configTrees: [{mount: "config/agent-presets", path: "../../packages/preset/agent-presets/presets", scanRoster: true}]` — but this is a `configTrees` **view** that maps the da config dir to the shipped root for composition rendering, not a preset root. The `configTrees` mechanism and the preset-root mechanism are **different subsystems**. No code path in `AgentPresets` reads `configTrees`.

**Confirmed no programmatic injection**: `grep -rn 'agent-presets\|agentPresets\|config/agent-presets' apps/cli/src/*.ts` → zero hits. The CLI does not inject this dir as a root at runtime.

## Session workaround (2026-09-20, NOT a repo change)

Overlay at `/tmp/dsh-disable-present-table.patch.yml` now sets roots on the `agent-presets` row:

```yaml
- id: agent-presets
  config:
    default: data-agent
    roots:
      - path: /Users/mckenzie/workspace/dsh-resync/apps/cli/config/agent-presets
        trust: system
```

Verified in `--dump-config`: line 561-563 of composed output.

**Caveat on the patch**: per the data-agent bundle's own docs (`packages/bundle/data-agent/cordis.patch.yml:11`), *"a patch targets a row by id and **replaces its whole `config`**"*. The overlay replaces the entire config, so it must re-state `default` as well as `roots`. This is why the bundle's own override (which only sets `default`) wipes `roots` to `[]` — but in this case the original also had no roots, so the behavior is the same.

## Repo fix (for AFK execution session)

Add a `roots` entry to the data-agent bundle's agent-presets override in `packages/bundle/data-agent/cordis.patch.yml`:

```yaml
- id: agent-presets
  config:
    default: data-agent
    roots:
      - path: config/agent-presets
        trust: system
```

(The `config/agent-presets` path resolves relative to the composition base, which is the installed harness's `apps/cli/config/agent-presets`.)

Alternatively, fix it at the profile level: add a `roots` entry in `~/.dsh/profiles/web/cordis.patch.yml` (and headless), so each deployment opts in to the da preset dir. Less invasive but harder to ship.

## Impact

- **Severity**: HIGH. Same as UM-DEFECT-PRESET-DEPS: web UI blocks, headless silently runs bare.
- **Affected profiles**: `web` (picker shows only 4 built-in; `data-agent` invisible), `headless` (same, but silently bare — see UM-DEFECT-PRESET-DEPS for the silent-failure mode).
