# R3 — subagent and workflow event surface (resolved)

## 1. Subagent lifecycle events

**Cordis events (ephemeral, NOT persisted to session log):**

| Event | Payload | Scoped? |
|-------|---------|---------|
| `subagent/start` | `SubagentRunInfo { runId, provider, id: SessionId, local }` | Yes — parent Agent |
| `subagent/end` | `SubagentRunEndInfo { ...RunInfo, stopReason, lastAssistantMessage? }` | Yes — parent Agent |
| `subagent/provider-added` | `SubagentProvider` | No |
| `subagent/provider-removed` | `string` | No |

**Persisted event (in child session only):**
- `subagent/descriptor` — appended once per child session. Contains `mode` (one-shot/continuable), `provider`, `label`, continuable composition fields. This is the child's durable identity record.

**Key gap**: Parent session has NO persisted record of which subagents it spawned. The only durable linkage is `SessionHeader.parentSession` on the child side.

## 2. Workflow lifecycle events

**Cordis events (ephemeral):**

| Event | Payload |
|-------|---------|
| `workflow/start` | `WorkflowRunInfo { id, meta }` |
| `workflow/phase` | `WorkflowRunInfo, title` |
| `workflow/log` | `WorkflowRunInfo, message` |
| `workflow/agent-start` | `WorkflowRunInfo, WorkflowAgentInfo { seq, label, phase?, childId }` |
| `workflow/agent-end` | `WorkflowRunInfo, WorkflowAgentEndInfo { ...AgentInfo, outcome }` |
| `workflow/end` | `WorkflowRunInfo, WorkflowResultInfo { stopReason, error?, agentsStarted }` |

**Persisted events (in parent session, via `tool-workflow` recorder):**

| Event | Payload |
|-------|---------|
| `tool-workflow/run-start` | `{ runId, name }` |
| `tool-workflow/agent-start` | `{ runId, seq, label, phase?, childId }` |
| `tool-workflow/agent-end` | `{ runId, seq, outcome }` |
| `tool-workflow/run-end` | `{ runId, stopReason }` |

**Not persisted**: `workflow/phase` and `workflow/log` — ephemeral only. A DAG visualization wanting live phase/log data must subscribe to Cordis events.

## 3. Client-side availability

**ConversationSnapshot does NOT directly expose subagent/workflow state.** Key fields:
- `subagent` — tells whether THIS session is a subagent child (identity, not child listing)
- `chat: ChatSnapshot` — workflow runs appear as `ChatConversationViewNode` with `kind: 'workflow-run'`
- No `subagentChildren`, `workflowRuns`, or task DAG fields

**Workflow data reaches the client** through the ConversationNodeDefinition system: `workflowRunDefinition` folds the 4 persisted `tool-workflow/*` events into `WorkflowRunChatData { name, status, phases[] }`.

**Subagent child listing** is available through the session store (SessionHeader lineage), not through ConversationSnapshot.

## 4. WorkflowRunPanel data flow

```
tool-workflow recorder listens to Cordis events
  → persists tool-workflow/* session events
    → workflowRunDefinition folds events into WorkflowState
      → buildViewNode() produces WorkflowRunChatData
        → Chat incremental materialization delivers to useSyncExternalStore
          → WorkflowRunPanel renders
```

The panel renders phases as DisclosureRow groups with member rows. Members are navigable when their `childId` matches a running ordinary session with `origin === 'subagent'`.

## 5. Task-subagent-workflow linkage

**No direct linkage exists.** Specifically:
- `SubagentStartRequest` has NO `taskId` field
- Workflow `agent()` calls carry NO task context
- `TeamTaskSnapshot.ownerId` links to a SessionId (the teammate), but this is agent-team-specific

**Available join keys:**
- Workflow → subagent child: `WorkflowAgentInfo.childId` (SessionId)
- Subagent child → parent: `SessionHeader.parentSession`
- No task → subagent binding exists — must be constructed by correlation

## 6. Complete persisted event vocabulary for DAG

**Directly usable for DAG nodes:**
- `todo/write` — flat task list (parent session)
- `team/task` — DAG tasks with blockedBy (Lead session, experimental)
- `tool-workflow/run-start`, `agent-start`, `agent-end`, `run-end` — workflow lifecycle (parent session)
- `subagent/descriptor` — child identity (child session)
- `goal/change` — goal lifecycle (session)

**Useful for context:**
- `turn/start`, `turn/end` — turn boundaries
- `plan/mode` — plan mode changes
- `agent-preset/selected` — preset selection

**Architecture summary:**
- Workflow events are well-persisted in the parent session — excellent for DAG visualization
- Subagent events are ephemeral in the parent but durable in the child — DAG needs to aggregate across sessions via SessionHeader lineage
- No task↔subagent linkage exists — this is the primary gap for a unified DAG model
