---
description: "Package map for the data-agent code-execution packages: what Python program execution does for you, and which package owns each part."
kind: "package-group"
---

# code-runtime/ — data-agent Python execution family

English | [中文](README.zh.md)

## Summary

The `code-runtime/` group runs data-agent Python programs: a model writes one pandas/numpy program that calls host-provided functions as ordinary async calls, and the run returns only what that program printed and returned. Mount the data Python backend to register `ctx.ptcRuntime`, and depend on the released protocol package when a CPython provider needs the fd-3 frame types directly. Every run starts without state from earlier programs.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

These two packages provide the data-agent execution backend and the protocol library it speaks; each README describes what its part does.

| Package | Role | ctx key |
|---|---|---|
| [`code-runtime-data-python/`](code-runtime-data-python/README.md) | Executes data-agent Python programs with pandas/numpy in a fresh CPython subprocess | registers `ctx.ptcRuntime` |
| [`code-runtime-python-protocol/`](code-runtime-python-protocol/README.md) | Owns the released fd-3 frame types, lossless JSON codec, byte meters, and hostile-frame validators shared by CPython providers | — |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the service contract, then the group that defines it, the PTC mode design that consumes this capability, and the capability-seam model it follows.

- [PTC runtime subsystem reference](../../docs/subsystems/ptc-runtime.md) — request/result vocabulary, bindings, and the `ctx.ptcRuntime` Cordis surface.
- [`ptc-runtime/` group](../ptc-runtime/README.md) — the Service Definition this family implements, beside the TypeScript backend.
- [PTC mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-ptc.md) — how the tool registry presents `run_code` to the model.
- [Capability seams](../../docs/capability-seams.md) — the Service Definition / Service Provider / Consumer split this family follows.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
