# Agent Note: released ownership of the CPython code-runtime protocol

Status: implemented

English | [中文](2026-09-14-code-runtime-python-protocol-ownership.zh.md)

## Problem

The released `@deepseek-ai/dsh-code-runtime-data-python` provider and the private `@deepseek-ai/dsh-experimental-ptc-runtime-python` provider implement the same fd-3 frame types, lossless JSON helpers, and hostile-frame validators. A release member cannot require the private provider excluded from the release family, and shared protocol behavior needs an owner independent of either provider.

## Decision

[`@deepseek-ai/dsh-code-runtime-python-protocol`](../../../../packages/code-runtime/code-runtime-python-protocol/README.md) is the released TypeScript owner of the versionless fd-3 protocol. It contains the frame types and field metadata, `PROTOCOL_FD`, the lossless JSON encoder and byte meters, unsafe integer and non-lossless number detection, child-frame reconstruction, and the shared log-truncation marker. It has no runtime dependencies or mutable state, and the package dependency policy classifies independent installed copies as interchangeable.

`@deepseek-ai/dsh-code-runtime-data-python` depends directly on the released protocol package, while `@deepseek-ai/dsh-experimental-ptc-runtime-python` carries its own protocol module. The data provider has no dependency, optional dependency, peer dependency, or development dependency on the private provider, so release packaging never reaches it.

Providers continue to own process launch, raw-frame size caps before `JSON.parse`, resource budgets, Python bootstrap code, and teardown. The data provider owns `py/bootstrap.py`, the Python side of its own runs. The [fd-3 protocol decision](2026-07-31-ptc-runtime-python-fd3-protocol.md) remains the authority for wire semantics and hostile-input handling.

## Alternatives considered

**Keep the protocol inside the private provider and add a release exception.** This would leave a published package dependent on an artifact that release packaging intentionally omits. An exception would conceal an invalid installation graph rather than make the shared implementation releasable.

**Copy the TypeScript protocol into the data provider.** Independent copies would let frame fields, validation, exact integer encoding, and byte accounting drift. One released implementation keeps both providers on the same tested behavior.

**Move every Python bootstrap asset into the protocol package.** The providers have different bootstrap implementations, process policies, and packaging requirements. The shared module owns only the TypeScript wire vocabulary and pure validation/encoding behavior; provider-specific Python execution remains local.

## Consequences

Release packaging can install `@deepseek-ai/dsh-code-runtime-data-python` without any private experimental package. Protocol behavior has one public implementation and one pure TypeScript test suite, while the provider retains lifecycle and real-subprocess coverage. Changes to the frame vocabulary must update the released package, the data provider's bootstrap, that provider's tests, and the protocol documentation together.
