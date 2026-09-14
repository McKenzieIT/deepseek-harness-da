---
description: "Package map for the code-execution capability family: what program execution does for you, and which package owns each part."
kind: "package-group"
---

# code-runtime/ — code-execution capability family

English | [中文](README.zh.md)

## Summary

The `code-runtime/` group lets a model write one program that calls host-provided functions as ordinary async calls, then returns only the program's printed output and return value. Choose the TypeScript backend for execution in an isolated Node worker, the released data Python backend for pandas/numpy workloads, or the private experimental Python backend for source-checkout testing. Both Python providers share one released fd-3 protocol library, and every run starts without state from earlier programs.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

These five packages provide the code-runtime definition, shared protocol, and execution backends; each README describes what its part does.

| Package | Role | ctx key |
|---|---|---|
| [`code-runtime/`](code-runtime/README.md) | Defines what a code runtime does: run one program against host-provided bindings and report what it printed and returned | `ctx.codeRuntime` |
| [`code-runtime-python-protocol/`](code-runtime-python-protocol/README.md) | Owns the released fd-3 frame types, lossless JSON codec, byte meters, and hostile-frame validators shared by CPython providers | — |
| [`code-runtime-worker-thread/`](code-runtime-worker-thread/README.md) | Executes TypeScript programs, each in a fresh Node worker thread | registers `ctx.codeRuntime` |
| [`code-runtime-data-python/`](code-runtime-data-python/README.md) | Executes data-agent Python programs with pandas/numpy in a fresh CPython subprocess | registers `ctx.codeRuntime` |
| [`experimental/code-runtime-python/`](../experimental/code-runtime-python/README.md) | Private source-checkout CPython backend with stricter interpreter probing, process-group teardown, and protocol compatibility re-exports | registers `ctx.codeRuntime` |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the service contract, then the PTC mode design that consumes this capability and the capability-seam model it follows.

- [Code runtime subsystem reference](../../docs/subsystems/code-runtime.md) — request/result vocabulary, bindings, and the `ctx.codeRuntime` Cordis surface.
- [PTC mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-ptc.md) — how the tool registry presents `run_code` to the model.
- [Capability seams](../../docs/capability-seams.md) — the Service Definition / Service Provider / Consumer split this family follows.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
