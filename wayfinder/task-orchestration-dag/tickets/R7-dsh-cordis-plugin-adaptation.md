# R7 — DSH Cordis plugin adaptation

**Type**: research
**Status**: resolved 2026-09-12
**Current standing**: public Cordis Agent, Session, Tool, Remote, bundle, and slot APIs remain sufficient adapter points without changing `agent-loop` or upstream source. [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md) supersedes required external Session events and a `taskGraph` SessionProjection with an independent SQLite journal/outbox/projection plus Host Bindings and DSH adapters.
**Blocked by**: —
**Blocks**: [G12 Plan DAG ownership boundary](G12-task-graph-authority.md), [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G18 Community package and bundle topology](G18-community-package-and-bundle-topology.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)

## Question

Can the Plan DAG drive data-agent through public Cordis extension points without modifying upstream packages or replacing `agent-loop`?

## Resolution

See [R7 DSH Cordis plugin adaptation](../research/R7-dsh-cordis-plugin-adaptation.md).

The first release can be a Cordis plugin suite using public Agent, Tool, SessionProjection, Remote, and slot contracts. Task capability, model tools, outer-loop driver, executor adapters, Client UI, and installable bundle remain separate roles. Community packages depend only on published DSH contracts.
