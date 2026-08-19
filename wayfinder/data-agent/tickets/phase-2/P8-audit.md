# P8 — audit 插件

**Type**: prototype
**Phase**: 2
**Status**: Unblocked

**Question**: audit 作 guard/session-event + `tool-audit` + `ctx.storage`（SQLite）。

**From G3（per-user Qoder 审计，2026-08-19）**：per-user Qoder subagent 调用全审计（谁/何时/哪个 PAT-scope/Credits）——作 tool-audit（subagent-qoder 工具调用）+ session-event，带 caller 登录身份。详见 G3 Finding。
