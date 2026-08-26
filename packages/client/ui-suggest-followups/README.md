# @deepseek-ai/dsh-client-ui-suggest-followups

Toolview card for the `suggest_followups` INTERPRETATION tool. Renders
follow-up question suggestions as a horizontal chip row. Clicking a chip
submits the suggestion value as a new message to the conversation.

## Model Experience

When the model calls `suggest_followups`, this plugin replaces the generic
tool row with a horizontal row of clickable chips:

- **Chips** — each displays the suggestion `label`; clicking submits `value`
  as a new conversation message
- **Latest-turn only** — chips from older turns are hidden (removed from DOM)
  once a new turn begins
- **Skeleton** — while the tool is running, displays placeholder skeleton chips

Fallback: when `block.call === null` (window truncation), renders `block.content`
as plain text.

## Known Limitations

- Chips are non-interactive once a new turn has started (hidden entirely).
- No undo for submitted follow-up messages.
