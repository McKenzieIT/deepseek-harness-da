# G24 — Advanced routing, parallelism, and optimization

**Type**: grilling
**Status**: open
**Blocked by**: [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)
**Blocks**: —

## Question

How should the scheduler extend G12's concurrent Tasks and explicit Attempt Groups with progress-aware executor and model routing, dynamic batch sizing, speculative work, voting, and cost/latency optimization?

Define independence and resources, limits, progress signals, executor availability, loser cancellation, quality-cost policy, no-progress detection, budget allocation, deterministic fallback, and which choices are model proposals versus enforced policy.
