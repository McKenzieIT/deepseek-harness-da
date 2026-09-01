# @deepseek-ai/dsh-client-ui-present-decomposition

Toolview card for the `present_decomposition` INTERPRETATION tool. The card is
the **query's contract, not a result card**: it shows what the agent understood,
at what caliber, and with how much confidence — three layers plus a trust band
(wayfinder: interpretation-client-rendering R9 audit + P1 prototype verdict).

## Model Experience

When the model calls `present_decomposition`, this plugin replaces the generic
tool row with a query-understanding card:

- **Focal line** — the interpreted summary IS the card title (eyebrow
  「查询理解」+ summary + confidence badge showing the numeric score). The focal
  line survives collapsing: a collapsed card still answers "what was
  understood here", with time/dimension mini chips.
- **Lineage chips** — time range → dimensions (solid) → filters (dashed) →
  source (outlined) on one wrapping line, replacing four label-value rows.
- **Metrics with calibers always visible** — a `repeat(auto-fill, minmax(190px,
  1fr))` grid; each cell shows the metric name (+unit) above its expression.
  Metric declarations are intent, not results, so they render as compact
  always-visible caliber cells (never KPI-style value cards); ten metrics fold
  into ~five rows. The caption carries the count (「将计算 · N 项」).
- **Trust band** — confidence < 0.7 turns the badge and border warn and appends
  a verify hint; a failed tool call renders a `role="alert"` error box instead
  of silently showing stale content.

Cards on turns the conversation has moved past collapse themselves by default
(`useSession` latest-turn probe, aligned with ui-suggest-followups); the
user's toggle always wins. Fallback: `block.call === null` (window truncation)
or malformed argsRaw renders `block.content` as plain text — argsRaw parsing
validates and normalizes every field, so dirty payloads degrade to the
fallback instead of throwing in render. While the tool is running, a skeleton
shows.

Copy lives in the `present.decomposition` locale namespace (zh source of
truth, en complete); registration passes `locale: NS`.
