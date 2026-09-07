# @deepseek-ai/dsh-tool-edit-definition

Model-facing edit_definition tool: apply partial patches to semantic layer asset definitions with audit trail

## Known Limitations and Deferred Work

- Supports partial patches only — there is no full-replace mode.
- The audit trail is append-only; undo is bounded by `revert_edit` and there is no branching history.
- Asset names are capped at 200 characters.
