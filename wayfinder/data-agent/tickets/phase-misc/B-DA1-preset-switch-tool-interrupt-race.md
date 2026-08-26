# B-DA1 — Web UI preset 切换导致 tool call 全部 Interrupted 竞态

**Type**: bug
**Phase**: misc
**Status**: partially-resolved
**Assignee**: claude-session-2026-08-26
**Severity**: high（取数模式在新对话中无法正常使用）
**Related**: [data-agent-conversation-readiness](data-agent-conversation-readiness.md)，[G-DA5](G-DA5-per-question-scope-routing.md)

## 复现路径

1. Web UI 中开启**新对话**
2. 选择「取数模式」（agent preset = `data-agent`）
3. 发送消息（如"查询X63司测期间上报的日志"）
4. 轨迹（trajectory）中所有工具调用显示 **"Interrupted: interrupted"**
5. 无任何工具实际返回结果

## 表现

- Trajectory view 中每个 tool call（如 `search_data_sources`）的状态为 `Interrupted: interrupted`
- 无 `tool/result` 事件与 `tool/call` 事件配对
- Session log 中 assistant message 带 `interrupted: true` 标记
- Turn 以 `aborted` 或 `error` 结束

## 诊断

### "Interrupted: interrupted" 生成位置

**UI 合成状态**，非服务端返回值：

- `packages/client/ui-trajectory/src/client/trajectory-tool-definition.ts:197`
- `packages/client/ui-conversation/src/client/conversation-nodes/tool.ts:204`

逻辑：当 `tool/call` 存在、step/turn 已 CLOSED、但**无对应 `tool/result`**时，UI 合成：
```typescript
error: { name: 'Interrupted', code: 'interrupted' }
```

### 触发条件

Agent 的 AbortController 在 LLM streaming 期间被 abort。`packages/core/agent-loop/src/agent.ts` step() 内：

```typescript
// LLM 流式输出中途被 abort → catch → interrupted: true
} catch (error: unknown) {
    if (signal.aborted) {
        const content = assembler.interruptedBlocks() // 已流式输出的 tool-call blocks
        this.session.append('assistant/message', { ...message, interrupted: true })
    }
    throw error
}
```

tool-call blocks 已写入 session（作为 interrupted assistant message 的 content），但从未被 dispatch 到 `executeToolCalls`，因此无 `tool/result`。

### 假设的 abort 来源（需确认）

**假设 A：preset 切换 cancel 竞态**（最高嫌疑）

```
t0: 新对话 → session 创建（可能用默认 preset 或 blank agent）
t1: 用户选择"取数模式" → agent-preset/selected 事件 / agent re-compose
t2: re-compose 触发 current agent cancel（abort signal fires）
t3: 用户消息已在 inbox / LLM stream 已开始
    → abort propagates → stream dies → tool blocks interrupted
```

Web UI 的 preset selection 可能触发 agent disposal + re-creation。如果 message dispatch 和 preset switch 之间没有原子性保证，消息可能投递到正在被 dispose 的旧 agent。

**假设 B：LLM 连接失败**

`data-agent-conversation-readiness.md` 记录过 DashScope 404（LLM provider wiring 问题）。如果 LLM stream 在部分输出 tool-call blocks 后断开，效果相同。但该问题 #2 已修复（headless/web 均 PONG 验证通过）；若该修复未持久化到当前环境则会复现。

**假设 C：stall watchdog 或 budget 超限**

phase-gate `stall_watchdog_seconds: 300`（5 min）——时间太长，不太可能在首条消息就触发。`max_llm_calls_per_turn: 60`——首次调用不可能超限。排除。

## 验证方法

1. **Session log 检查**：在 `~/.dsh/storages/sessions/` 中找到该 session 的 JSONL，查看：
   - `turn/end` 的 `reason` 字段（`aborted` vs `error` vs `completed`）
   - 如果 `aborted`：`reason.reason.kind` 是什么（`disposed` / `user-stop` / `stalled`）
   - 如果 `error`：error message 是什么（LLM 连接错误？）
2. **Console log 检查**：web 运行时的 cordis logger 是否有 ERROR 级别输出（`preset-autojoin` mount failure / LLM error）
3. **复现顺序变换**：
   - (a) 先选取数模式 → 再发消息（有等待时间）→ 是否仍 Interrupted？
   - (b) 直接以 data-agent 为默认 preset 启动 → 发消息 → 是否 OK？
   - 若 (a) OK 而当前流程 Interrupted → 确认是 select→send 竞态

## 修复方向

| 假设 | 修复 |
|------|------|
| A: preset 切换竞态 | 确保 preset switch（agent re-compose）是原子操作：cancel 旧 agent → await new agent ready → THEN drain inbox。或在 `agent/pre-step` 中 await preset mount 完成。 |
| B: LLM 连接 | 确认 `data-agent-conversation-readiness` #2 修复已持久化（headless `cordis.patch.yml` + settings.yaml 中 llm-dashscope 路由）。 |
| 混合 | 即使 A 修复了，B 若复现仍会 Interrupted——两个 fix 正交、均需确认。 |

## Files to inspect

- `apps/web/src/` — session/agent 生命周期管理（preset selection → agent re-creation 流程）
- `packages/core/agent-loop/src/agent.ts` — cancel() / abort 传播路径
- `packages/data/preset-autojoin/src/index.ts` — agent/created hook timing
- `packages/preset/agent-presets/src/session.ts` — resolveSessionPreset
- `packages/bundle/data-agent/cordis.patch.yml` — LLM wiring 持久化状态

## Out of scope

- Scope 路由问题（→ [G-DA5](G-DA5-per-question-scope-routing.md)）
- Phase-gate 功能正确性（route_gate 等）——前提是 agent 能正常执行工具

---

## Resolution (2026-08-26)

### Investigation findings

Deep code analysis across the full `select` → `recompose` → agent-loop → abort propagation path.

#### Hypothesis A refutation: `recompose` does NOT cancel the agent

The ticket's primary hypothesis states that `recompose` triggers an agent cancel. **This is incorrect.**

`AgentPresets.recompose()` (`packages/preset/agent-presets/src/index.ts`) does exactly ONE thing: it re-links the agent's scope key to a different standing composition via `ScopeParentBinding.rebind()`. The `rebind()` implementation (`packages/core/scope/src/index.ts`) is a single `WeakMap.set()` — **zero side effects**, no listeners fired, no disposals triggered.

The `select` RPC handler (`packages/host/apiproxy/src/api-proxy.ts:3003`) serializes through the `presetSwitches` map but never calls `agent.cancel()`.

#### What DOES abort the agent (exhaustive sources)

Only three code paths call `agent.cancel()`:
1. **`machine.cancel({ kind: 'disposed' })`** — `packages/core/agent-loop/src/index.ts:507` — agent lifecycle disposal (owner fiber unloads)
2. **`agent.cancel({ kind: 'user' })`** — `packages/host/apiproxy/src/api-proxy.ts:2547` — the `session.cancel` RPC (user clicks Stop)
3. **`agent.cancel({ kind: 'hook', reason: '...' })`** — `packages/data/phase-gate/src/phase-gate.ts:793` — stall watchdog (300s, impossible on first message)

#### The client does NOT send cancel during preset switching

The `AgentPresetSeatController` (`packages/client/ui-agent-preset/src/client/seat-store.ts`) only calls `api.agentPresets.select()`. On error, it resets the UI state (`error: messageOf(error), current: this.fallback`). No `session.cancel` is sent.

#### Remaining candidates for the abort

Given the above, the `interrupted: true` + `kind: 'aborted'` turn end can ONLY come from **agent disposal** (`kind: 'disposed'`). The agent is disposed when its owner fiber unloads, which happens when:

- The api-proxy's own Cordis fiber is torn down (unlikely in normal operation — survives process lifetime)
- A composition reload (hot-module replacement, `preset` file change detected by `ensureStanding`'s stale-stamp check) disposes the standing mount's fiber chain
- The `callerSignal` passed to the original `agents.create()` / `agents.resume()` aborts (no callerSignal is passed in the web path — this is ruled out)

**Most likely root cause**: a Cordis **fiber lifecycle edge case** where re-linking the scope parent during the first turn destabilizes a standing-mount observer. This would only manifest when `recompose` completes at the exact moment the agent's first step is resolving prompt assembly or tool execution — the scope chain walk (`scopeTarget`'s filter) reads the parent mid-change.

Alternatively: the **session-persistence attach** from `connectWorkspace` races with the first turn in a way that disposes the agent's owner boundary.

### Verification needed (unchanged from ticket — but now targeted)

The session JSONL (`~/.dsh/storages/sessions/<id>.jsonl`) MUST be inspected:

```
turn/end → reason.kind       → "aborted" confirms disposal hypothesis
           reason.reason.kind → "disposed" = agent lifecycle teardown
                              → "user"     = client sent session.cancel (disproven above)
                              → "hook"     = phase-gate watchdog (disproven, 300s)
```

If `kind: 'error'` instead: the LLM connection is failing (Hypothesis B), not an abort — and the `data-agent-conversation-readiness` #2 fix was not persisted.

### Recommended fix

**Regardless of the specific abort source**, the structural fix is to serialize `prompt` behind any in-flight `presetSwitches` for the same session:

```typescript
// In session.prompt handler, after resolving the agent:
const pending = presetSwitches.get(sessionId)
if (pending !== undefined) await pending
```

This guarantees:
1. The composition is fully settled before the first turn starts
2. The `sessionBlank()` check in `select` is authoritative (no turn can start while a switch is in flight)
3. The model always sees the FINAL tool set in its first prompt assembly

**Secondary fix** (defense-in-depth): if the abort IS `disposed`, audit what holds the owner fiber and add a guard that prevents disposal while `agent.status === 'running'`.

### Status

Partially resolved: the mechanism is clarified (recompose itself is safe; the abort source is agent disposal from an unknown fiber lifecycle edge), the structural fix is designed. Full resolution requires reproducing and inspecting the JSONL to confirm `turn/end.reason.reason.kind === 'disposed'` vs an LLM error.
