# G18 — Community package and bundle topology

**Type**: grilling
**Status**: open
**Blocked by**: [G14 Durable events, projection, and Host/Client boundary](G14-task-graph-projection-boundary.md), [G16 Model tools and cross-preset composition](G16-todo-coexistence-and-preset-composition.md), [G17 Executor adapters](G17-native-source-adapters.md), [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Question

How should the feature be packaged so it develops inside this fork, remains isolated from upstream changes, and later installs through the normal DSH community plugin workflow?

Decide repository package groups and names; independent domain/store/projection and DSH Service Definition, Provider, tool, driver, adapter, verifier, and Client boundaries; installable bundle rows; optional presets and examples; npm scope; public exports; DSH compatibility range and probes; and release, migration, license, security, and maintenance policy. The Task DAG must not require an upstream contribution: core packages have no DSH dependency, and DSH adapter packages depend only on published contracts and never patch upstream source.

Specify how third-party packages ship tool-policy and executor-adapter companion contributions in their own Bundle/Profile rows; how descriptor versions and DSH compatibility are probed; how deployment overlays monotonically tighten policy; how unload removes contributions; and how ordinary non-Plan profiles remain unchanged. Installing a package alone never activates it, and incompatible or incomplete Plan-DAG contributions fail visibly rather than falling back. The first release does not publish separate RecoveryPolicy, AttemptPolicy, human-input-classifier, generic Run Controller, or BTW-session seams; package boundaries must preserve that interface budget.

## Inputs from the G14 resolution

Packaging must separate DSH-independent domain, store interfaces, SQLite provider, projection, transport schema, and SDK-neutral types from DSH Cordis Host, tool, executor, Typert Web, Client UI, and bundle adapters. The Web package self-mounts its generated Remote contribution. The stock DSH SDK server is not extensible, so first-release TypeScript/Python support requires a separate Task DAG SDK protocol/server profile and companion clients. Configuration owns the SQLite path, retention defaults, compatibility probes, migration, backup, and permissions.
