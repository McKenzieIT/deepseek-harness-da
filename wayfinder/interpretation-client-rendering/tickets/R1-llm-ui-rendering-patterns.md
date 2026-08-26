# R1: 2026 LLM agent UI tool-result rendering patterns

**Type**: research (AFK)
**Blocked by**: none
**Blocks**: [G1-design-decisions](G1-design-decisions.md)

## Question

How do mainstream 2026 LLM agent UIs render structured tool results (tables, charts, suggestions)? Specifically:

1. **Claude Artifacts / ChatGPT Canvas / Cursor** — how do they render tool results? Inline in conversation flow, side panel, overlay, or dedicated artifact viewer?
2. **Data-specific agents** (Databricks Genie, Microsoft Fabric Data Agent, ThoughtSpot Sage) — how do they present query results, KPI cards, charts, and follow-up suggestions?
3. **Pattern taxonomy**: which rendering mode (inline, panel, overlay, card) suits which data type (table, chart, decomposition card, suggestion chips)?
4. **Interaction patterns**: do suggestion chips replace composer content? Do tables expand in-place or open a detail view? Are charts interactive (hover, zoom)?

Focus on patterns that are production-shipped as of mid-2026, not demos/prototypes.
