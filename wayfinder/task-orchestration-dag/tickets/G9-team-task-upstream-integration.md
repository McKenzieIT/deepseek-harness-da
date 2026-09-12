# G9 — Optional Agent Teams adapter

**Type**: grilling
**Status**: open
**Blocked by**: [G17 Executor adapters](G17-native-source-adapters.md)
**Blocks**: [G22 Cross-session and multi-agent scheduling](G22-cross-session-multi-agent-scheduling.md)

## Question

Should the community plugin provide an optional adapter to experimental Agent Teams, and which side owns Plan identity and mutation?

Compare importing Team tasks, using Team tasks as an alternate Provider, and deferring integration. The adapter must not expose experimental upstream types in stable API, merge incompatible authorities silently, or duplicate CAS and ownership semantics.
