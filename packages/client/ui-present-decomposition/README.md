# @deepseek-ai/dsh-client-ui-present-decomposition

Toolview card for the `present_decomposition` INTERPRETATION tool. Renders
structured query decomposition — summary, metrics, dimensions, time range,
source, and filters — as a collapsible card defaulting to expanded.

## Model Experience

When the model calls `present_decomposition`, this plugin replaces the generic
tool row with a rich card showing:

- **Summary** — the interpreted query intent
- **Metrics** — name/value/unit triplets
- **Dimensions** — group-by axes as badges
- **Time range**, **source**, **filters** — contextual metadata
- **Confidence indicator** — yellow/orange border when confidence < 0.7

Fallback: when `block.call === null` (window truncation), renders `block.content`
as plain text. While the tool is running, displays a skeleton loading state.
