# G18 — Community package and bundle topology

**Type**: grilling
**Status**: open
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G16 Model tools and preset composition](G16-todo-coexistence-and-preset-composition.md), [G17 Executor adapters](G17-native-source-adapters.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

How should the feature be packaged so it develops inside this fork, remains isolated from upstream changes, and later installs through the normal DSH community plugin workflow?

Decide repository package groups and names; Service Definition, Provider, tool, driver, adapter, verifier, and Client boundaries; installable bundle rows; optional presets and examples; npm scope; public exports; DSH compatibility range and probes; release, migration, license, security, and maintenance policy; and a possible upstream contribution path. Published packages depend only on published DSH contracts and never patch upstream source.
