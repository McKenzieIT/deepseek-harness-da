# dsh-code-runtime-data-python Provider

> Spawned from [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) research (2026-08-26). The research found that `code-runtime-python` is only a protocol library — no Python Provider exists. The data-agent's `compute` tool requires a CPython subprocess Provider with pandas/numpy and OS-level security hardening.

**Type**: task (AFK)
**Phase**: misc
**Assignee**: (unclaimed)
**Blocked by**: [result-cache-service](result-cache-service.md)
**Blocks**: `compute` tool ship

## Question

Build `@deepseek-ai/dsh-code-runtime-data-python` — a `CodeRuntime` Provider that spawns a CPython subprocess with pandas/numpy available, communicates via the existing fd-3 wire protocol, and enforces OS-level isolation (seccomp + namespace + Landlock) beyond RLIMIT.

## Scope

### Provider (`packages/code-runtime/code-runtime-data-python/`)

```typescript
class DataPythonCodeRuntime extends CodeRuntime {
  readonly language = 'python'
  readonly isolation = 'process-rlimit-seccomp'
  async run(request: CodeRunRequest): Promise<CodeRunResult> { ... }
}
```

### Security layers (research findings: RLIMIT alone insufficient)

1. **RLIMIT_CPU** — CPU time limit (e.g., 30s)
2. **RLIMIT_AS** — Address space limit (e.g., 2GB)
3. **RLIMIT_NPROC=0** — No forking
4. **seccomp-bpf whitelist** — Only allow syscalls needed by pandas/numpy (read, write, mmap, brk, futex, etc.)
5. **Linux namespaces** — mount ns (read-only fs), network ns (no network), pid ns
6. **Landlock** — Restrict filesystem access to Python package paths (read-only)

All applied by the Python bootstrap BEFORE executing model code (same pattern as protocol.ts `BootMessage.cpuSeconds` / `addressSpaceBytes`).

### Python environment

- venv with pandas + numpy pre-installed
- No network access (namespace isolation)
- Read-only filesystem (Landlock + mount ns)
- Model code executes as async function body with `await` support
- Host bindings materialized as namespace objects (same as worker-thread)

### Wire protocol

Reuse existing `@deepseek-ai/dsh-code-runtime-python` protocol:
- fd-3 JSON-lines channel
- Boot → boot-ack → run → (call/reply)* → done
- `validateChildFrame()` for hostile frame validation
- `checkDoneValue()` for output budget enforcement

### Config

```typescript
interface Config {
  cpuSeconds?: number        // default 30
  addressSpaceBytes?: number // default 2_147_483_648 (2GB)
  maxLogBytes?: number       // default 1_048_576 (1MB)
  maxValueBytes?: number     // default 67_108_864 (64MB)
  pythonPath?: string        // default: venv python3
}
```

## Acceptance criteria

- [ ] `ctx.codeRuntime.language === 'python'` when mounted
- [ ] Model-generated pandas code executes successfully (DataFrame operations)
- [ ] Host bindings callable from Python (`await namespace.function_name(args)`)
- [ ] RLIMIT_CPU terminates runaway loops
- [ ] RLIMIT_AS terminates memory-hungry code
- [ ] seccomp blocks forbidden syscalls (e.g., socket, execve)
- [ ] Network namespace prevents any network access
- [ ] Filesystem is read-only (cannot write outside sandbox)
- [ ] Output budget enforced (maxLogBytes, maxValueBytes)
- [ ] fd-3 protocol mirror test passes (TS↔Python field parity)
- [ ] Unit tests + e2e: pandas compute, binding calls, timeout, OOM, seccomp denial

## 外部技术参考（2026年8月调研）

- **Sandlock** / **nono-py**: 进程级 Landlock+seccomp 工具，可集成到 bootstrap
- **asteval GHSA-9w56-46f6-3qhx**: numpy ctypes 逃逸证明 AST 层沙箱无效，必须 OS 级隔离
- **GPT-5.6 Sol Pro 逃逸**: 验证 binding-only I/O 设计正确性
- **行业共识**: RLIMIT 单独不被视为安全边界（需 +seccomp +namespace）

## 关联

- [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) (parent research)
- [result-cache-service](result-cache-service.md) (prerequisite — compute needs data injection)
- `packages/code-runtime/code-runtime-python/src/protocol.ts` (reuse wire protocol)
- `packages/code-runtime/code-runtime-worker-thread/src/index.ts` (reference: worker-thread Provider pattern)
- `packages/bundle/data-agent/cordis.patch.yml:202-209` (bundle placeholder to uncomment)
