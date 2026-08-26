# R3: DSH client plugin rendering patterns + event stream value access

**Type**: research (AFK)
**Status**: ✅ resolved
**Blocked by**: none
**Blocks**: [G1-design-decisions](G1-design-decisions.md)
**Output**: [../research/R3-dsh-client-rendering-patterns.md](../research/R3-dsh-client-rendering-patterns.md)

## Question

How do existing DSH client plugins render custom tool views, and how does the client access structured tool result values?

### Specific sub-questions

1. **Toolview registration pattern**: Confirm the full contract for `tool.call.toolview` keyed slot — what props does the component receive (`ToolCallViewProps`), how does it access `argsRaw` (the structured intent JSON), and what's the lifecycle (running → settled)?

2. **`argsRaw` parsing**: For a settled `ToolResultNode`, is `block.call.argsRaw` always available (or can it be null when the call is outside the event window)? What's the fallback?

3. **Cross-tool data reference**: `present_table`'s `result_id` references a `query_data` execution. How can a client component find the data rows?
   - Is there a `query_data` tool result in the same session whose output contains the rows?
   - Does the `query_data` server tool emit row data in its `content` blocks? Or does it use a side-channel (attachment, spill)?
   - Is there a client-accessible API (RPC, service) to fetch query result rows by ID?

4. **Existing rich renderers**: How does `ui-user-questions` render the `ask_user_question` tool's interactive UI? Does it use the toolview slot or a different mechanism (composer takeover)?

5. **Session restore**: When a session is reconnected/restored, are all past `ToolResultNode`s fully hydrated (with `call` and `content`)? Or does window truncation lose older tool results?

Read the following source files:
- `packages/client/ui-tool/src/client/contract/slots.ts` (ToolCallViewProps)
- `packages/client/runtime/src/client/sessions/conversation.ts` (ToolResultNode, ToolCallBlock)
- `packages/client/runtime/src/client/sessions/tool-call-tree.ts` (tree projection)
- `packages/data/tool-present-clarification/src/index.ts` (reference server tool)
- `packages/client/ui-user-questions/src/client/index.ts` (reference client renderer)
- `packages/query/` (if exists — query execution and result storage)
