# Safe Compute Environment — Research Note

> **Executive Summary:** Build a new `@deepseek-ai/dsh-code-runtime-data-python` Provider atop the existing Python fd-3 protocol, inject data via a `resultCache` Service Definition (hybrid option C), and assign computed outputs `cr_`-prefixed result_ids into the same session-scoped cache — this unlocks `compute` without new security boundaries because the code-runtime binding-only model + kernel RLIMIT isolation already satisfies data-agent's intranet-security-first requirements.

---

## 1. code-runtime Security Model

### Findings

**Architecture layers:**

| Layer | Package | Status |
|-------|---------|--------|
| Service Definition | `packages/code-runtime/code-runtime/` | Exists — abstract `CodeRuntime` class with `run(request): Promise<CodeRunResult>`, exposes `language` and `isolation` properties |
| JS Provider | `code-runtime-worker-thread` | Exists — spawns fresh V8 worker per run, TypeScript only |
| Python Protocol Library | `code-runtime-python` | Exists — fd-3 wire protocol types + validators. **NOT a Provider** |
| Python Provider | (none) | **Does not exist** |

**Worker-thread security model** (from `packages/code-runtime/code-runtime-worker-thread/src/index.ts`):

The module doc explicitly states: *"This is containment, not a security boundary: model code has bash-equivalent trust despite an empty environment."*

Enforced limits:
- Empty `env: {}` — no ambient environment variables leak
- Empty `execArgv: []` — hermetic from host process flags
- `resourceLimits: { maxOldGenerationSizeMb }` — heap cap (default 512 MB), OOM kills worker with `worker-exit` failure code
- Compute budget: event-loop utilization polling every 25 ms; `computeMs` default 60,000 ms
- Wall-clock ceiling: `maxWallMs` default 600,000 ms (10 min)
- Output budget: `maxOutputBytes` default 64 MB (combined logs + value + error)
- **Binding-only I/O**: program can ONLY interact through host-provided binding namespaces — no network, no filesystem, no child processes

**Python protocol** (from `packages/code-runtime/code-runtime-python/src/protocol.ts`):

- fd-3 JSON-lines channel between host process and CPython subprocess
- Boot message carries: `cpuSeconds` (RLIMIT_CPU), `addressSpaceBytes` (RLIMIT_AS), `maxLogBytes`, `maxValueBytes`, `namespaces`
- Python bootstrap reads boot frame, **applies resource limits ON ITSELF** before executing model code
- `validateChildFrame()` treats every child-to-host frame as hostile — rebuilds field-by-field, drops forged extras

**Critical gap:** The Python Provider — the actual class that spawns CPython, sends the boot frame, manages the subprocess lifecycle, and handles binding calls — does not exist. Only the protocol codec layer exists. A `code-runtime-data-python` Provider must be built.

### Assessment

The binding-only I/O model is sufficient isolation for data-agent:
- Programs cannot access network, filesystem, or processes — only call declared host bindings
- The Python protocol's RLIMIT_CPU + RLIMIT_AS provide **actual OS-level security** (kernel-enforced), not just containment
- The JS worker-thread's self-described "containment, not security boundary" caveat does NOT apply to the Python path — the kernel limits are a real security boundary

### Recommendation

Ship a new Provider package `@deepseek-ai/dsh-code-runtime-data-python` that:
1. Spawns CPython subprocess with fd-3 protocol
2. Sends boot frame with conservative limits (e.g., `cpuSeconds: 30`, `addressSpaceBytes: 2GB`)
3. Pre-installs pandas + numpy in the subprocess venv
4. Registers host bindings (e.g., `load_result`) through the namespace mechanism
5. Reports `isolation: 'process-rlimit'` (distinguishing from worker-thread's `'v8-isolate'`)

---

## 2. Data Injection Mechanism

### Findings

**Current state:**
- `QueryOutcome` (from `packages/data/nl2sql-engine/src/types.ts`): 3-state union with `result_id?: string` and `rows?: unknown[]`
- Phase-gate's `captureToolData` captures query_data outcomes into `PhaseGateState` — tracks metadata (`last_query_outcome`, `last_failure_kind`, `exec_count`) but does NOT store actual row data for later retrieval
- No `resultCache` Service Definition exists today

**RBI reference** (from `libs/rbi-mcp/src/rbi_mcp/result_view.py`):
- In-process `QueryResultCache` with `get_by_result_id(result_id, scope_id)`, `put_view(scope_id, payload)`, `get_view(view_id, scope_id)`
- Scope-isolated: queries from one scope cannot access another's results
- Handle types: `result_id` (raw query results), `view_id` (materialized delivery views)
- `explain_unresolved_handle()` with 5 diagnostic cases: not_a_handle, unknown, expired, scope_mismatch, no_columns

**SpillStore precedent** (from `packages/spill/spill/src/index.ts`):
- Minimal Service Definition: `abstract saveText(input): Promise<SpillRef>`
- Deliberately thin — owns NO retention, NO replacement logic, NO retrieval API
- Established pattern: thin Service Definition + separate policy/consumer plugins

### Three approaches evaluated

| | Option A: New `resultCache` SD | Option B: Binding-internal | Option C: Hybrid |
|---|---|---|---|
| Approach | `ctx.resultCache.get(rid): Row[]`; Provider hooks `tools/post-execute` | compute registers `load_result(rid)` binding; retrieves from session state | resultCache SD exists as reusable seam; compute's binding is thin facade over `ctx.resultCache` |
| Testability | High — testable in isolation | Low — coupled to compute impl | High — cache testable independently |
| Multi-consumer | Yes — present_table + compute + future materialization | No — duplicated retrieval logic | Yes |
| New packages | 1 (resultCache SD + Provider) | 0 | 1 (same as A) |
| Fail mode | Explicit — missing Provider throws | Silent — null/undefined propagation | Explicit — missing mount throws |

### Recommendation

**Option C (hybrid).** The `resultCache` Service Definition exists as a first-class reusable seam. The compute tool's `load_result(rid)` host binding is a thin facade that calls `ctx.resultCache.get(rid)` and returns rows to the sandbox. Benefits:
- Testability: resultCache Provider is unit-testable independently of compute
- Multi-consumer: `present_table` (and future materialization) can also call `ctx.resultCache`
- Fail-loud: if resultCache is not mounted, the binding throws explicitly rather than returning silent null

---

## 3. Result Storage & Namespace

### Findings

**Current namespace:** `QueryOutcome.result_id` is set by the query engine. Format is hex-based (RBI uses `qr_<16-hex>`).

**Unified namespace design:**

| Prefix | Origin | Example |
|--------|--------|---------|
| `qr_` | Query engine (SQL execution results) | `qr_a1b2c3d4e5f6g7h8` |
| `cr_` | Compute tool (pandas derivation results) | `cr_f8e7d6c5b4a3b2a1` |

Both share the same cache interface — `resultCache.get(rid)` returns `{columns, rows}` regardless of prefix. `present_table(result_id=...)` works identically for either.

**Lifecycle:** Session-scoped. Rationale:
- Compute results are ephemeral derivations — recreating them is cheap (re-run the code)
- No persistence requirement from product (unlike audit records)
- Session GC naturally cleans up — no TTL tuning required
- Consistent with RBI's session-scoped result cache

**Compute output flow:**

```
1. LLM generates pandas code referencing load_result("qr_abc123")
2. Code executes in RLIMIT sandbox, produces DataFrame
3. Compute tool captures DataFrame → serializes to {columns, rows}
4. Assigns cr_<hash> result_id, stores via ctx.resultCache.put(rid, result)
5. Returns {result_id: "cr_xyz", columns, row_count, preview} to LLM
6. LLM calls present_table(result_id="cr_xyz", ...) to deliver
```

### Recommendation

Implement a unified `result_id` namespace with `qr_` / `cr_` prefixes. Store all results in the same session-scoped `resultCache`. The compute tool is both a consumer (reads `qr_` via `load_result`) and a producer (writes `cr_` after execution).

---

## 4. Security Boundary & Gate

### Findings

**Phase-gate gating:**
- `tool-bash` stays enabled in bundle but is gated from business users at the P10 intranet tool-gate level
- `code-runtime` has a commented-out placeholder in `cordis.patch.yml`: `# - id: code-runtime` / `# name: '@deepseek-ai/dsh-code-runtime-worker-thread'`
- Phase-gate's `INTERPRETATION_TOOLS` whitelist already includes `compute`

**Security enforcement path:**
- `compute` does NOT go through `tool-bash` — it is a separate tool with its own execution path
- Security is enforced INSIDE the tool implementation (the code-runtime sandbox), not at the phase-gate layer
- Phase-gate only controls WHICH tools are callable per phase; the tool's internal safety is its own concern
- The Python subprocess with RLIMIT_CPU + RLIMIT_AS + no-network + binding-only-I/O provides intranet-security-first guarantees

**Bundle comment discrepancy:** The `cordis.patch.yml` comment references `'@deepseek-ai/dsh-code-runtime-worker-thread'` (JS), but data-agent needs Python. The actual mount should be the new Python provider.

### Prerequisites to uncomment code-runtime in bundle

1. `@deepseek-ai/dsh-code-runtime-data-python` Provider package exists and passes tests
2. Provider supports pandas/numpy imports (venv or system-level deps managed)
3. `compute` tool plugin exists and registers its host bindings
4. `resultCache` seam is mounted (compute depends on it for data access)

### Recommendation

No new security boundaries needed. The existing code-runtime architecture (binding-only I/O + kernel RLIMIT) already provides the isolation guarantee. When uncommented in bundle, the Provider name must change from `worker-thread` to `data-python`.

---

## 5. RBI Reference

### Findings

**RBI's `compute` tool** (from `tools/presentation.py`):
- 5 hardcoded operations: comparison, ratio, rank, percentile, custom
- `custom` uses `_safe_eval_expression()`: AST parse restricted to `+-*/`, column names, numeric constants — NO function calls, no imports, no assignment
- All operations reference `result_id` handles — never raw data from LLM
- Data loaded from result cache via `result_view.resolve_table(result_id, scope_id)`

**RBI's `delivery_compute.py`** (pure-function compute for present_table):
- Separate from the `compute` tool — handles sort/KPI/chart computation during materialization
- Pure functions (no rbi-* imports), standard library only
- `compute_table_delivery(headers, rows, ...)` returns `TableComputation(rows, kpis, chart)`
- Pattern: deterministic computation at materialization time, not at LLM instruction time

### Contrast

| Dimension | RBI | Data-agent |
|-----------|-----|------------|
| Compute model | Hardcoded operations + restricted AST eval | LLM-generated full pandas code |
| Capability | Limited (5 ops + arithmetic expressions) | Arbitrary pandas/numpy transformations |
| Safety mechanism | AST restriction (whitelist of operators) | Process sandbox (RLIMIT + binding-only I/O) |
| Data access | result_id handles via in-process cache | result_id handles via resultCache SD + host binding |
| Extensibility | Requires code change for new operations | LLM can express any computable transformation |

The code-runtime binding-only model provides the same safety guarantee RBI achieves through AST restriction — model code cannot escape to network/fs/processes — while enabling arbitrary pandas operations instead of 5 hardcoded templates.

---

## 6. Dependency Chain

Ship order (each depends on predecessors):

```
1. resultCache Service Definition
   └── abstract class: get(rid), put(rid, result), has(rid)
   └── package: @deepseek-ai/dsh-result-cache (or inline in data package)

2. resultCache Provider (in-memory, session-scoped)
   └── implements the SD; hooks tools/post-execute to capture query_data outcomes
   └── captures rows + columns keyed by result_id

3. @deepseek-ai/dsh-code-runtime-data-python Provider
   └── spawns CPython subprocess with fd-3 protocol
   └── pandas/numpy available in subprocess venv
   └── reports isolation: 'process-rlimit'

4. compute tool plugin
   └── depends on: code-runtime SD (resolved to data-python Provider)
   └── depends on: resultCache SD (for load_result binding + cr_ output storage)
   └── registers host bindings: load_result(rid) → ctx.resultCache.get(rid)
   └── on completion: serializes DataFrame → cr_<hash>, stores via ctx.resultCache.put()

5. Bundle integration
   └── uncomment code-runtime in cordis.patch.yml (point to data-python, not worker-thread)
   └── mount resultCache Provider
   └── compute tool available in INTERPRETATION phase
```

---

## 7. Open Questions

| # | Question | Impact | Suggested resolution |
|---|----------|--------|---------------------|
| 1 | Should `resultCache` be a standalone package or live inside `packages/data/`? | Package topology | Likely `packages/data/result-cache/` — it is data-domain-specific |
| 2 | Max row count in cache before spilling? | Memory pressure in long sessions | Start with 100k rows cap; add spill-to-disk later if needed |
| 3 | Should compute results (`cr_`) be immutable or overwritable? | Idempotency semantics | Immutable (new hash = new entry); old entries GC'd by session end |
| 4 | Does the Python venv need to include domain-specific libraries beyond pandas/numpy (e.g., scipy, sklearn)? | Venv size + attack surface | Start minimal (pandas + numpy); expand based on observed LLM code patterns |
| 5 | Should the `load_result` binding support partial/chunked loading for large result sets? | Sandbox memory limits vs. large tables | Defer — start with full-load; add pagination if RLIMIT_AS triggers on real workloads |
| 6 | How does `resultCache` interact with conversation compaction? | Compacted turns may reference stale result_ids | Cache is keyed by rid, survives compaction; only expires at session end |
| 7 | Should the compute tool declare a max output row count (to prevent LLM generating cartesian products)? | Output explosion risk | Yes — cap at configurable limit (e.g., 50k rows), fail-loud if exceeded |

---

## 8. 外部技术调研（2026年6-8月，Web Search）

> 调研时间：2026-08-26。来源：Google/Bing web search，聚焦 2026 下半年最新进展。

### 8.1 行业重大安全事件（2026年6-8月）

| 事件 | 时间 | 影响 | 对我们的启示 |
|------|------|------|-------------|
| **asteval numpy ctypes 逃逸** (GHSA-9w56-46f6-3qhx) | 2026年Q2 | 通过 numpy ctypes 实现任意内存读写，完全突破 Python AST 层沙箱 | **Python AST 过滤不是安全边界**。只要允许 numpy，必须在 OS 层面隔离 |
| **GPT-5.6 Sol Pro 离线沙箱逃逸** (PrimeIntellect) | 2026-08-25 | 模型利用推理 API 的 `file_url` 远程获取功能绕过网络隔离，spawn sub-agent | **验证了 binding-only I/O 设计** — 所有 I/O 通道必须经过 host 显式绑定 |
| **isolated-vm 类型混淆逃逸** (GHSA-864f-rcv7-6rh4) | 2026年Q2 | n8n/Activepieces 等 AI Agent 平台受影响，guest→host 内存破坏 | 单进程内隔离（即使 V8 级别）不如进程/VM 边界可靠 |
| **NVIDIA OpenShell CVE-2026-65083** (CVSS 9.9) | 发布一周内 | 沙箱配置 API 遗漏禁止项，可导致代码执行和权限提升 | 即使底层隔离原语正确，管理面 API 实现缺陷可导致完全突破 |
| **Vercel Firecracker 100万美元赏金** | 2026-08-18 | Vercel 对 Firecracker microVM 安全性极度自信 | microVM 是当前行业黄金标准 |

### 8.2 主要技术方案对比

| 方案 | 成熟度 | 隔离级别 | 启动延迟 | pandas 兼容 | 适用场景 |
|------|--------|---------|---------|------------|---------|
| **RLIMIT（当前方案）** | 生产 | 资源限制（非安全边界） | 0ms | 完全 | 基础资源保护 |
| **seccomp + Landlock + namespace** | 生产 | 进程级强隔离 | ~5ms | 完全 | 短期增强首选 |
| **gVisor (runsc)** | 生产 | 用户态内核 | ~50ms | 完全 | K8s 环境升级路径 |
| **Firecracker microVM** | 生产 | 虚拟机级 | ~125ms | 完全 | 最强隔离 |
| **microsandbox** | 新兴 | microVM | <100ms | 完全 | 本地优先+async SDK |
| **OpenSandbox（阿里）** | 生产 | 多后端可选 | 可配 | 完全 | K8s 统一 API |
| **WASM/Pyodide** | 实验 | 内存隔离 | ~200ms | 性能 3-10x 损失 | **不推荐** |

### 8.3 行业隔离级别共识（2026年8月）

从弱到强：
1. ~~Python AST 过滤~~ — 已被证明无效（asteval ctypes 逃逸）
2. **RLIMIT + 进程** — 基础资源限制，**行业不认为是安全边界**
3. **seccomp + Landlock + namespaces** — 进程级强化，最低"有意义的隔离"
4. **gVisor 用户态内核** — 中等隔离，良好性能，SOC 2 认证
5. **MicroVM (Firecracker)** — 强隔离，100万美元赏金背书
6. **硬件 TEE (Intel TDX)** — 最强隔离（实验阶段）

### 8.4 RLIMIT 方案的已知不足

| 风险 | 说明 | 缓解手段 |
|------|------|---------|
| 文件系统访问 | RLIMIT 不限制 fs 访问 | Landlock / mount namespace (只读) |
| 网络访问 | RLIMIT 不限制网络 | network namespace / seccomp 过滤 |
| 系统调用面 | 完整 syscall 面暴露 | seccomp-bpf allowlist |
| ctypes/FFI 逃逸 | numpy ctypes 可绕过 Python 层限制 | 进程边界 + seccomp 有效阻断 |
| fork bomb | 不受 RLIMIT_AS 限制 | RLIMIT_NPROC=0 |
| /proc, /sys 泄露 | 无 namespace 时可读宿主信息 | pid/mount namespace |

### 8.5 推荐路线图

**短期（立即可做）— 叠加进程级隔离：**
在现有 RLIMIT + fd-3 基础上增加：
1. `seccomp-bpf` 白名单：仅允许 pandas/numpy 需要的系统调用（read, write, mmap, brk, futex 等）
2. Linux namespaces：mount ns（只读 fs）、network ns（无网络）、pid ns
3. Landlock：限制文件系统到 Python 包路径（只读）
4. `RLIMIT_NPROC=0`：禁止 fork

工具选择：**Sandlock** 或 **nono-py** 可直接集成到 Python bootstrap 中

**中期（1-2个月）— 轻量 VM 隔离：**
评估 microsandbox（本地优先 + async Python SDK + microVM 隔离）或 gVisor runsc

**长期 — 生产级：**
E2B / Firecracker 自部署 / GKE Agent Sandbox

### 8.6 对我们架构设计的验证

PrimeIntellect GPT-5.6 Sol Pro 逃逸事件**强烈验证**了 binding-only I/O 设计：
- 该模型逃逸核心 = 找到了"非显式"的 I/O 通道（推理 API 自身的 `file_url` 参数）
- binding-only I/O 保证：无网络、无 fs、无 subprocess、所有数据进出通过结构化协议（可审计、可控）

**结论：binding-only I/O + 进程隔离（RLIMIT + seccomp + namespace）是合理且安全的架构。但 RLIMIT 本身不足以构成安全边界，需要叠加 seccomp 和 namespace。**
