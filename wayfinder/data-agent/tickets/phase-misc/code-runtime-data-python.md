# dsh-code-runtime-data-python Provider

> Spawned from [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) research (2026-08-26). The research found that `code-runtime-python` is only a protocol library — no Python Provider exists. Grilling ticket [safe-compute-architecture-decisions](safe-compute-architecture-decisions.md) (resolved 2026-08-26) locked the trust posture: **containment, not security boundary** — same as worker-thread, cross-platform, bash-equivalent trust.

**Type**: task (AFK)
**Phase**: misc
**Assignee**: (unclaimed)
**Blocked by**: [result-cache-service](result-cache-service.md)
**Blocks**: `compute` tool ship

## Question

Build `@deepseek-ai/dsh-code-runtime-data-python` — a `CodeRuntime` Provider that spawns a CPython subprocess with pandas/numpy available, communicates via the existing fd-3 wire protocol, and provides **containment** (binding-only I/O + resource limits) — the same trust posture as `code-runtime-worker-thread`.

## ⚠️ 信任姿态（grilling 决策 D5, 2026-08-26）

> **Containment, not security boundary.** 与 worker-thread 相同：bash-equivalent trust。安全来自工具门禁层（phase-gate），不来自执行沙箱。
>
> - **跨平台**：任何支持 Node + CPython 的 OS 都能运行，无 OS-specific 硬依赖
> - **不含** seccomp / namespace / Landlock（这些是部署层加固，不属于 Provider 范畴）
> - **binding-only I/O 是主防线**（跨平台；程序只能通过 host 声明的绑定交互）
> - **RLIMIT 是资源保护**（POSIX 条件性，不可用时退化为 wall-timeout only）
> - 硬安全边界是未来 `isolation: 'container'` 后端的职责
>
> 研究笔记中的 seccomp/namespace/Landlock 推荐已降级为"部署加固参考"——见 [safe-compute-architecture-decisions](safe-compute-architecture-decisions.md) Resolution §D5。

## Scope

### Provider (`packages/code-runtime/code-runtime-data-python/`)

```typescript
class DataPythonCodeRuntime extends CodeRuntime {
  readonly language = 'python'
  readonly isolation = 'process'  // or 'process-rlimit' on POSIX
  async run(request: CodeRunRequest): Promise<CodeRunResult> { ... }
}
```

### Containment layers (cross-platform, same model as worker-thread)

| Layer | Mechanism | Platform | Notes |
|-------|-----------|----------|-------|
| **Primary** | binding-only I/O | All | 程序只能通过 host 声明的绑定交互——无网络/fs/subprocess |
| **Resource** | RLIMIT_CPU + RLIMIT_AS | POSIX (Linux/macOS) | Python bootstrap 启动时 self-apply；Windows 退化为 wall-timeout |
| **Resource** | Wall-clock timeout | All | 兜底——RLIMIT 不可用时的唯一硬限 |
| **Resource** | Output budget | All | maxLogBytes + maxValueBytes（协议内置） |
| **Isolation** | Fresh subprocess per run | All | 无跨次状态（同 worker-thread "no pooling"） |
| **Hostile peer** | validateChildFrame() | All | fd-3 入站消息全量校验重建 |

### Python environment

- venv with pandas + numpy pre-installed
- Model code executes as async function body with `await` support
- Host bindings materialized as namespace objects (same as worker-thread)
- `isolation` property reports actual level: `'process-rlimit'` (POSIX) or `'process'` (elsewhere)

### Wire protocol

Reuse existing `@deepseek-ai/dsh-code-runtime-python` protocol:
- fd-3 JSON-lines channel (POSIX; Windows 需 named pipe 或 stdio 替代——deferred)
- Boot → boot-ack → run → (call/reply)* → done
- `validateChildFrame()` for hostile frame validation
- `checkDoneValue()` for output budget enforcement

### Config

```typescript
interface Config {
  cpuSeconds?: number        // default 30 (RLIMIT_CPU; ignored on non-POSIX)
  addressSpaceBytes?: number // default 2_147_483_648 (RLIMIT_AS; ignored on non-POSIX)
  maxWallMs?: number         // default 600_000 (cross-platform hard ceiling)
  maxLogBytes?: number       // default 1_048_576 (1MB)
  maxValueBytes?: number     // default 67_108_864 (64MB)
  pythonPath?: string        // default: venv python3
}
```

## Acceptance criteria

- [ ] `ctx.codeRuntime.language === 'python'` when mounted
- [ ] Model-generated pandas code executes successfully (DataFrame operations)
- [ ] Host bindings callable from Python (`await namespace.function_name(args)`)
- [ ] RLIMIT_CPU terminates runaway loops (POSIX only; wall-timeout elsewhere)
- [ ] RLIMIT_AS terminates memory-hungry code (POSIX only)
- [ ] Wall-clock timeout terminates hung programs (all platforms)
- [ ] Output budget enforced (maxLogBytes, maxValueBytes)
- [ ] fd-3 protocol mirror test passes (TS↔Python field parity)
- [ ] Unit tests + e2e: pandas compute, binding calls, timeout, OOM, output-limit
- [ ] Cross-platform: tests pass on both Linux and macOS (Windows deferred)

## 部署加固参考（非 Provider 范畴，仅供运维参考）

> 以下来自研究笔记，不纳入 Provider 实现。如部署环境需要硬安全边界，应使用未来 `isolation: 'container'` 后端或部署层加固。

- seccomp-bpf, Linux namespaces, Landlock — 可在部署层作为 defense-in-depth 叠加
- 外部事件参考：asteval ctypes 逃逸（证明 Python AST 过滤无效）、GPT-5.6 Sol Pro 逃逸（验证 binding-only I/O 设计）
- 工具选择：Sandlock / nono-py（如需部署层集成）

## 关联

- [safe-compute-architecture-decisions](safe-compute-architecture-decisions.md) (grilling decisions, resolved 2026-08-26)
- [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) (parent research)
- [result-cache-service](result-cache-service.md) (prerequisite — compute needs data injection)
- `packages/code-runtime/code-runtime-python/src/protocol.ts` (reuse wire protocol)
- `packages/code-runtime/code-runtime-worker-thread/src/index.ts` (reference: worker-thread Provider pattern — same trust posture)
- `packages/bundle/data-agent/cordis.patch.yml:202-209` (bundle placeholder to uncomment)
- `.agents/notes/implemented/feature/2026-06-15-code-mode.md` §Trust posture (canonical: "containment, not security boundary")
