# R6 — Agent orchestration and loop-engineering research

## Question

What should a writable task-orchestration DAG own after comparing current Anthropic and OpenAI agent systems with agent-orchestration research published from 2026-07-01 through 2026-09-11?

## Finding

The data-agent needs a writable, durable Plan DAG. It cannot be reconstructed reliably from an agent tree, workflow script, or execution trace. The Plan DAG owns task identity, dependencies, revisions, execution eligibility, acceptance criteria, task state, replanning, attempts, and explicit executor correlations. Workflow, subagent, skill, tool, and trace capabilities retain their own lifecycles.

The outer loop is separate policy. It selects ready work, admits a small commitment, dispatches an executor, observes evidence, verifies completion, and chooses retry, local repair, replan, continuation, or a named stop state.

## Industry practice

Anthropic documents prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer, Task tools, Agent Teams, subagents, Dynamic Workflows, Skills, Hooks, and Plan mode as distinct mechanisms. Task tools and shared Team tasks provide writable task identity and dependencies; other mechanisms retain separate roles. Sources: [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents), [Task list](https://code.claude.com/docs/en/interactive-mode#task-list), [Agent Teams](https://code.claude.com/docs/en/agent-teams), [Dynamic Workflows](https://code.claude.com/docs/en/workflows), [Subagents](https://code.claude.com/docs/en/sub-agents), [Skills](https://code.claude.com/docs/en/skills), and [Hooks](https://code.claude.com/docs/en/hooks).

OpenAI Agents SDK uses an Agent loop, manager-owned agents-as-tools, handoffs, guardrails, resumable approvals, and tracing. Responses multi-agent produces an Agent tree, while Programmatic Tool Calling provides temporary code-defined control flow. None supplies a persistent, user-visible task-dependency graph revised during execution. Sources: [Agents](https://developers.openai.com/api/docs/guides/agents), [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents), [Orchestration](https://developers.openai.com/api/docs/guides/agents/orchestration), [Responses multi-agent](https://developers.openai.com/api/docs/guides/responses-multi-agent), and [Programmatic Tool Calling](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling).

## Research signals

- [Atomic Task Graph](https://arxiv.org/abs/2607.01942) supports explicit dependency scheduling, safe parallel branches, and affected-subgraph repair, with evidence limited to text-interactive benchmarks and small open models.
- [Plover](https://arxiv.org/abs/2607.15193) supports persistent, inspectable, revisable plans as a product requirement; its recovery evidence is primarily HCI evidence.
- [OrchestraBench](https://arxiv.org/abs/2608.05263) shows blind retry helps invocation faults but not latent semantic faults, and trusted state is decisive for recovery; its orchestration chains are synthetic.
- [Architectural Convergence in Three LLM Agent Harnesses](https://arxiv.org/abs/2608.23953) identifies a commoditized loop, append-only replay, progressive context disclosure, and explicit extension points, supporting extension rather than loop replacement.
- [ProgRouter](https://arxiv.org/abs/2608.25992) supports progress- and budget-aware routing, but dynamic model routing is not required for the first release.
- [TROVE](https://arxiv.org/abs/2609.05019) supports a long proposal horizon, short commitment horizon, and retain/insert/replace repair instead of broad replanning.
- [Inference-Time Graph Engineering](https://arxiv.org/abs/2609.05774) separates graph compilation from execution and gives edges explicit semantics; it concerns communication graphs rather than task dependencies.
- [Dynamic Response](https://arxiv.org/abs/2609.05758) reports a production bounded ReAct orchestrator with typed tools, backend validation, explicit routing, iteration limits, and conservative fallback.

## Consequences

- Compute ready and blocked state; do not let the model write them.
- Separate Tasks from ExecutionAttempts and executor traces.
- Require evidence before verified completion.
- Prefer retry, inserted repair, or affected-subgraph replacement before global replanning.
- Persist named wait, stop, budget, and no-progress states.
- Revalidate relevant revisions and premises before external effects.
- Apply budgets to the complete feedback path, not only one inner loop.
