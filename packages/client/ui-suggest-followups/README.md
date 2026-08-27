# @deepseek-ai/dsh-client-ui-suggest-followups

Toolview card for the `suggest_followups` INTERPRETATION tool. Renders
follow-up question suggestions as a two-line list: the short label on the
primary line, the full query `value` visible underneath. Clicking a row
submits the value as a new message to the conversation.

## Model Experience

When the model calls `suggest_followups`, this plugin replaces the generic
tool row with a bordered list of clickable rows (prototype variant B,
phase-1 rework):

- **Rows** — label (primary) + full query value (tertiary, ellipsized);
  clicking submits `value` as a new conversation message
- **Send hint** — hovering or focusing a row reveals a `发送 ↵` hint on the
  right; `aria-label` names the query being sent
- **Keyboard** — first row is the tab stop; ArrowUp/ArrowDown/Home/End move
  focus between rows (roving focus)
- **Latest-turn live, older turns kept** — rows from older turns stay in the
  transcript as disabled, grayed rows (`title` explains they expired) instead
  of being removed from the DOM
- **Error state** — a failed tool call renders an error box with the tool's
  error text; no chips are rendered from a failed call's arguments
- **Skeleton** — while the tool is running, three placeholder rows pulse

Fallback: when `block.call === null` (window truncation), renders `block.content`
as plain text.

## Known Limitations

- Clicking a row submits immediately; there is no fill-composer-first mode
  and no undo for submitted follow-up messages (phase-2 candidates).
- Expired rows are inert: they cannot be re-sent from an older turn.

## Style notes

The chip styles this package shipped with referenced six `--dsw-bg-*` /
`--dsw-text-*` / `--dsw-border-*` custom properties that do not exist in the
theme, so backgrounds and borders silently resolved to nothing. The list
restyle consumes `--dsw-alias-*` tokens only.
