---
description: "Shared fd-3 frame types, lossless JSON codec, and hostile-input validators for CPython code-runtime providers."
kind: "package-reference"
---

# @deepseek-ai/dsh-code-runtime-python-protocol

English | [中文](README.zh.md)

## Summary

`dsh-code-runtime-python-protocol` is the released, dependency-free TypeScript owner of the fd-3 JSON-lines protocol used by DSH CPython code-runtime providers. It defines host and child frame types, exact JSON encoding and byte metering, hostile child-frame reconstruction, unsafe integer-token detection, and the shared log-truncation marker. Provider packages own process launch, frame-size limits before parsing, Python bootstrap code, resource limits, and teardown.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Depend on this package when a Node host speaks the DSH CPython fd-3 protocol. Import `BootMessage`, `ChildToHost`, and `ReplyMessage` for frame typing; use `encodeJsonPlain` for lossless JSON output, `validateChildFrame` before reading untrusted child frames, `hasUnsafeIntegerToken` before `JSON.parse`, and `checkDoneValue` after parsing a completion value. `PROTOCOL_FD`, `WIRE_FRAME_FIELDS`, `jsonStringBytesUpTo`, `hasNonLosslessNumber`, and `logTruncationMarker` support provider wiring, mirror checks, and exact byte accounting.

The package does not read streams or spawn processes. A provider must cap each raw fd-3 frame before parsing, discard malformed frames according to `validateChildFrame`, and apply its own lifecycle and resource policy. The Python side remains provider-owned because bootstrap behavior, packaging, and process constraints differ between providers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The module uses iterative traversals for deep or wide JSON values, reconstructs accepted child frames field by field, and performs byte accounting without materializing escaped string copies. It has no runtime dependencies or mutable process state, so independently installed copies are interchangeable.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Frame types, frame-field metadata, lossless JSON codec and meters, hostile-frame validation, protocol constants |
| [`tests/protocol.spec.ts`](tests/protocol.spec.ts) | Pure TypeScript behavior and hostile-input coverage |
| — | No runtime invariant companion is published; this package owns stateless wire values and validation functions, while provider tests cover stream ordering and process lifecycle. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Data Python provider](../code-runtime-data-python/README.md) — released consumer for data-agent Python execution.
- [fd-3 protocol Agent Note](../../../.agents/notes/implemented/architecture/2026-07-31-ptc-runtime-python-fd3-protocol.md) — wire semantics and hostile-input rationale.
- [Protocol ownership Agent Note](../../../.agents/notes/implemented/architecture/2026-09-14-code-runtime-python-protocol-ownership.md) — package ownership and compatibility decision.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **TypeScript host behavior only** — providers still own their Python bootstrap or declaration mirror, raw-frame cap before parsing, process lifecycle, and resource policy; importing this package does not make a provider implementation complete.
- **Versionless wire** — the protocol has no negotiation or downgrade path. Both sides must update together when a frame field or meaning changes, and the provider mirror tests are the executable drift check.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
