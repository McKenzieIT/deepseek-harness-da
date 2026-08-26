# Scope Metadata Aliases Extension (Question 5)

## scopes.yaml Extended Format

The scope-registry's `metadata` field gains three routing-relevant keys:

```yaml
# ~/.dsh/data/scopes.yaml
active: '10000251'
scopes:
  '10000251':
    semanticRoot: ./examples/k11-semantic-layer
    metadata:
      name: K11 大逃杀
      description: K11 大逃杀手游事件分析——日活、留存、付费、行为漏斗
      aliases:
        - K11
        - 大逃杀
        - k11
        - 251
  '10000334':
    semanticRoot: ./examples/x63-semantic-layer
    metadata:
      name: X63 射击
      description: X63 射击手游事件分析（司测阶段）——对局、战斗、经济、社交
      aliases:
        - X63
        - x63
        - 射击
        - 334
```

## API Impact

**No scope-registry API change needed.** The `metadata` field is already
`Record<string, unknown>` — aliases is just another metadata key. The existing
`register()` / `get()` / `list()` APIs pass metadata through untouched.

Consumers (this tool package) read it via:
```ts
const aliases = (scope.metadata?.['aliases'] as string[]) ?? []
```

## Administrator Configuration

Administrators configure aliases via:
1. **Direct YAML edit** of `~/.dsh/data/scopes.yaml` (current)
2. **CLI**: `dsh scope update <id> --alias K11 --alias 大逃杀` (future; not in scope)
3. **Web UI**: scope CRUD form with an aliases multi-input (W5; not in scope)

## Design Constraints

- **aliases are case-insensitive** for matching (latin) but stored as-is
- **aliases must be globally unique** — if two scopes share an alias, the hint
  reports both (multi-scope match) rather than silently picking one
- **short aliases (≤2 chars)** are allowed but risky (false-positive on IDs
  like "K1" appearing in "K11"); administrator's judgment call
- **CJK aliases** match as exact substrings (no word-boundary — CJK chars are
  self-delimiting)
- **description** doubles as LLM routing signal (injected in system prompt) —
  should be concise but distinctive enough for the model to distinguish scopes

## Validation (on registration)

No strict validation in this iteration. Future hardening (if needed):
- Warn on duplicate aliases across scopes (not error — multi-scope match is valid)
- Warn on aliases shorter than 2 characters
- Reject non-string entries in the aliases array
