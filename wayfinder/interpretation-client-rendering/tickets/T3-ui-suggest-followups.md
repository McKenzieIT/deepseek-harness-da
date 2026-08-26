# T3: Implement ui-suggest-followups package

**Type**: task (AFK)
**Blocked by**: [G1-design-decisions](G1-design-decisions.md)
**Blocks**: none

## Question

Implement `packages/client/ui-suggest-followups/` as a Mode 3 Repository Package — a client-side Cordis plugin that registers a `tool.call.toolview` entry with key `'suggest_followups'`, rendering clickable suggestion chips that trigger follow-up queries.

### Deliverable

A complete plugin package:
- `package.json` (`@deepseek-ai/dsh-client-ui-suggest-followups`)
- `src/index.ts` (empty host apply)
- `src/client/index.ts` (Cordis apply)
- `src/client/FollowupChips.tsx` (chip row component)
- `src/client/FollowupChips.module.css`
- `tests/`
- Wire into tsconfig.client.json + bundle patch

### Component design

Parse `block.call.argsRaw` for: `suggestions[]` (each with `label` + `value`).

Render:
1. **Chip row**: horizontal wrap of clickable pills, each showing `label`
2. **Click behavior**: per G1 decision (fill composer + auto-submit, or fill + let user confirm)
3. **Stale state**: per G1 decision on old chips when new turn arrives
4. **Running state**: while the tool call is still running, show skeleton/loading chips

Interaction: clicking a chip needs to reach the InputHub (conversation service) — inject pathway TBD per G1/R3.
