# Harness Package Removal Analysis — data-agent fork

**Destination:** transform `deepseek-harness-da` (fork of `deepseek-ai/deepseek-harness`) into `deepseek-harness-data-agent` by migrating `reverse-bi` (upstream: track2data) capabilities as plugins and removing unneeded harness features.

**Method:** primary sources only — `AGENTS.md`, `packages/README.md`, each group README, the default-wiring patch `packages/bundle/base/cordis.patch.yml`, and the minimal-spine bundle `packages/examples/agent-spine-demo`. No `reverse-bi`/`track2data`/`data-agent` string appears anywhere in the tree (grep across repo: no matches) — the fork is fresh; removal targets upstream harness features.

**Key authoritative sources:**
- `AGENTS.md:14-47` — repository layout, one-line package descriptions.
- `packages/README.md:13-59` — hierarchy table with **Release expectation** (Product / POC / Support).
- `packages/bundle/base/cordis.patch.yml` — `dsh-base`, the patch layer every profile applies first; enumerates exactly which plugins the default product mounts (rows cited by line below).
- `packages/examples/agent-spine-demo/README.md:5,15-38,42-50` — the "default executor-less, UI-less agent spine"; its `apply(ctx)` tree is the **minimal viable agent** and proves what core does NOT require.

## How to read the table

- **In base** = a row in `dsh-base/cordis.patch.yml` (default-wired for every `dsh --profile`).
- **In spine** = mounted by `dsh-agent-spine-demo` (the irreducible agent).
- **Neither** = optional provider/demo, dropped by simply not loading it (zero base edit).
- `risk` = coupling cost of removal: `none` (just don't load) → `low` (self-contained, no base row) → `med` (base row to delete + dependents) → `high` (core dep / many consumers).

## Package inventory

| Group (key subpkgs) | Category | Conf. | Rationale (cited) | Removal risk |
|---|---|---|---|---|
| `core/` scope, session, system-prompt, tools, agent, agent-default-model, agent-loop, agent-tool-presentation | ESSENTIAL | high | Product API spine; the control loop. Spine mounts all of these (`agent-spine-demo/README.md:15-19,22,38`). `AGENTS.md:14`. | none — do not remove |
| `llm/` llm, llm-retry, token-meter, llm-deepseek, llm-pi-ai | ESSENTIAL | high | LLM seam + DeepSeek adapter. In base (`cordis.patch.yml:24,72,450`; pi-ai dormant `:95`). Spine ships abstract `llm` (`agent-spine-demo:15`). `packages/README.md:20`. | none |
| `session/` persistence-jsonl, checkpoint-policy, projection, title, title-llm, telemetry* | ESSENTIAL | high | Durable session data plane. In base (`:27,98,126,148,39,46`); spine ships `session`+`session-title`. `AGENTS.md:37`. Telemetry disabled by default (`:148` config `mode: DISABLED`). | telemetry-otel + identity droppable (see below); rest essential |
| `fs/` fs, fs-local, fs-sandbox, fs-observation-policy, tool-fs, tool-fs-search, tool-str-replace-editor | ESSENTIAL | high | File IO a data agent needs. In base (`:224,227,384,443`). `packages/README.md:27`. | none |
| `shell/` shell, bash-local, bash-sandbox, shell-env, tool-bash | ESSENTIAL | high | Bash execution for data scripts. In base (`:178,207,210`). `packages/README.md:23`. | `pwsh-*` are win32-only; drop on POSIX-only data agent |
| `subprocess/` subprocess, subprocess-local | ESSENTIAL | high | Process-tree provider; dep of shell + fs-search (`tool-fs-search` spawns `@vscode/ripgrep` via `ctx.subprocess`, per `fs/README.md`). In base (`- id: subprocess`). | none |
| `settings/` settings, settings-file | ESSENTIAL | high | User config. In base (`:78`). `AGENTS.md:39`. | none |
| `credentials/` credentials, credentials-local | ESSENTIAL | high | API-key resolution (DEEPSEEK_API_KEY etc.). In base (`:85`). `AGENTS.md:40`. | none |
| `boot/` app-boot, cmdline | ESSENTIAL | high | App-bin glue; `.env` load, boot sequence. `AGENTS.md:43`; `boot/README.md`. | none |
| `bundle/` base, headless, web-app | ESSENTIAL | high | Profile composition system. `base`+`headless` are the data agent's runtime. `AGENTS.md:29`. Drop `web-app` with host/client. | `web-app` removable with GUI |
| `util/` brand, home-paths, timeout, atomic-write, native-command, launch-environment, output-retention | ESSENTIAL | high | Zero-dep shared utilities (`Branded<B>`, paths). `packages/README.md:59`: "harness-dep-free". | none |
| `preset/` agent-presets, persona | ESSENTIAL | high | Per-session agent composition — how the data agent gets its tools/prompt. `AGENTS.md:33`; `preset/README.md`. | none |
| `vendor/` cordis, loader, include, group, timer, hmr, schemastery, cosmokit, logger-console | ESSENTIAL | high | Cordis framework foundation; every package peer-deps `@deepseek-ai/cordis`. `vendor/README.md`. | none — cannot remove |
| `native/` landlock-run | ESSENTIAL (Linux) | high | Landlock self-restrict launcher; consumed by `sandbox-local` on Linux. `native/README.md`. | none on Linux; win32 uses ACL runner |
| `web/` web, web-search-deepseek, tool-web, web-search-exa/perplexity, web-fetch-http | MAYBE | high | Web search/fetch. In base (deepseek search + `fetch: false`, `:404-414`). Condition: data agent does web research. Keep search; fetch stays disabled (SSRF deferred, per `web/README.md`). | none to keep; exa/perplexity/fetch optional providers |
| `subagent/` subagent, spawn/fork-in-process, tool-subagent*, + acp/codex/claude-code/dsh-sdk | MAYBE | high | Delegation. In base (in-process spawn/fork `:292-332`). Condition: data agent delegates subtasks. `packages/README.md:32`. Drop the 4 external providers unless used. | low; external providers are opt-in |
| `compaction/` compaction, compaction-basic, command-compact, tool-result-pruner | MAYBE | high | Context compaction for long sessions. In base (`:284,289,360`). Condition: sessions exceed context. `packages/README.md:30`. | low |
| `context/` agent-instructions, time-context, tmux-context, session-reference | MAYBE | high | `agent-instructions` in base+spine (`:232`, `spine:35`); others opt-in. `packages/README.md:31`. Drop `tmux-context` (terminal-coupled). | low |
| `skill/` skill, skill-filesystem, skill-badge, tool-skill | MAYBE | high | Skill registry. In base+spine (`:237-247`, `spine:20-21`). Condition: reusable skills. `packages/README.md:29`. `skill-badge` already `disabled: true` (`:243`). | low |
| `plan/` plan-mode | MAYBE | high | Plan collaboration state. In base (`:265`). Condition: data agent plans before acting. `packages/README.md:39`. | low (one row) |
| `todo/` tool-todo | MAYBE | high | `todo_write` task tracking. In base (`:367`). Condition: multi-step task tracking. `packages/README.md:38`. | low |
| `jobs/` jobs, jobs-local, tool-jobs | MAYBE | high | Background-job runtime. In base+spine (`:69,218`, `spine:27,37`). Condition: long-running data jobs. `packages/README.md:33`. | low |
| `workflow/` workflow, workflow-worker-thread, tool-workflow, tool-ralph | MAYBE | med | Model-authored orchestration over subagents. In base (`:335-340`). `tool-ralph` = fresh-agent Ralph iteration, build/coding-focused (`:378`); likely drop. `packages/README.md:34`. | low-med; `tool-ralph` droppable independently |
| `guard/` repeat-tool-reminder, timeout-policy | MAYBE | high | Loop hygiene. In base (`:343,390`). Lightweight; prevents unproductive loops. `packages/README.md:41`. | low |
| `spill/` spill, spill-local, spill-policy | MAYBE | high | Tool-output spill (large data outputs → file + preview). In base (`:346-349`). `packages/README.md:37`. Useful for data. | low |
| `interaction/` commands, user-approval, permission-presets, user-questions, tool-ask-user | MAYBE | high | Human-collaboration plane. `commands`/`approval`/`permission` in base (`:188,193,250`); `tool-ask-user` opt-in. `packages/README.md:53`. Condition: interactive data agent; drop if fully automated. | low-med (permission/approval wired into base) |
| `identity/` anonymous-user-id | MAYBE | med | Anonymous id for telemetry/feedback correlation. `packages/README.md:19`. Condition: telemetry enabled. Drop with telemetry (`session-telemetry-otel`). | low |
| `session-query/` session-query, session-query-sqlite, tool-session-query, session-log-export | MAYBE | med | Session retrieval (past analysis). In base but search disabled (`openAt: never`, `:117`). `packages/README.md:46`. Condition: data agent queries past sessions. `session-log-export` is web-only (Host ZIP endpoint). | low-med; drop `session-log-export` with GUI |
| `storage/` storage, storage-json, storage-sqlite, storage-domain | MAYBE | med | Non-session storage. NOT in base. `packages/README.md:49`. Condition: persist data artifacts outside session log. | low (not wired) |
| `workspace/` workspace | MAYBE | med | Workspace entity (dir + session membership). NOT in base. `packages/README.md:50`. Condition: organize sessions into workspaces. Coupled to host/client picker. | low-med |
| `attachment/` attachment, attachment-local | MAYBE | med | Durable binary attachments. `attachment-local` in base (`:106`). `packages/README.md:36`. Condition: data agent handles binary uploads; drop if not. | low |
| `mcp/` mcp-client | MAYBE | med | MCP client bridge; registers external server tools on `ctx.tools`. NOT in base. `mcp/README.md`. Condition: data agent consumes MCP servers. | low |
| `code-runtime/` code-runtime, code-runtime-worker-thread | MAYBE | med | Code Mode `run_code` tool. NOT in base; mounted by `headless` bundle ("mounts Code Mode's worker", `bundle/headless/README.md`). `packages/README.md:25`. Condition: run data transformations via `run_code` (vs bash). INFERENCE: data agent likely wants this. | low-med (headless bundle row) |
| `sandbox/` sandbox, sandbox-local, sandbox-policy, sandbox-windows-acl | MAYBE→ESSENTIAL | high | Process confinement. In base (`:169,172`). `packages/README.md:26`. Keep for safety; `sandbox-windows-acl` win32-only. | low; keep |
| `sdk/` protocol, client, server | MAYBE | med | JSON-RPC out-of-process SDK. NOT in base. `packages/README.md:51`; `sdk/README.md`. Condition: drive data agent from another process (e.g. Python SDK). | low |
| `examples/` agent-spine-demo, acp-demo, jsonrpc-demo | MAYBE | high | Demo/reference bundles (`-demo` suffix, non-product). `packages/README.md:57`. Keep `agent-spine-demo` as the spine; `acp-demo` removable with ACP. | low |
| `test-support/` + `runtime-diagnostics/invariants` | ESSENTIAL (dev) | high | Dev/test infra; not runtime. `packages/README.md:58`. Keep for repo health. | none (dev only) |
| `python/` sdk, sdk-runtime | MAYBE | med | Python SDK + bundled runtime (drives harness via stdio JSON-RPC). `python/README.md`. Condition: data agent driven/consumed via Python. INFERENCE: reverse-bi/track2data is Python — likely keep. | low |
| `e2b/` e2b, fs-e2b, subprocess-e2b | LIKELY-UNNECESSARY | high | E2B remote-sandbox POC. `packages/README.md:21` explicitly **POC**. Not in base/spine. `AGENTS.md:18`; `e2b/README.md` ("experimental POC"). Data agent runs local. | none — not wired |
| `terminal/` terminal, terminal-bash, tool-terminal | LIKELY-UNNECESSARY | high | Persistent PTY sessions. Not in base/spine. `AGENTS.md:21`; `terminal/README.md`. Data agent uses one-shot `tool-bash`; no interactive stdin need. | none |
| `lsp/` lsp, lsp-stdio, tool-lsp | LIKELY-UNNECESSARY | high | Language-server navigation (go-to-def/references/hover). Not in base/spine. `AGENTS.md:23`; `lsp/README.md`. Data agent is not a code-navigation agent. | none |
| `extensions/` tool-cordis, cordis-host-runner, cordis-client-runner, ui-cordis | LIKELY-UNNECESSARY | high | Agent self-modification (inspect/mount own plugins). Not in base/spine. `AGENTS.md:35`; `extensions/README.md`. Data agent should not rewrite its own runtime. | low-med (`ui-cordis` is dual-half with client) |
| `hooks/` hook-protocol, hooks-claude-code, hooks-codex | LIKELY-UNNECESSARY | high | Claude Code/Codex shell-hook bridges. Not in base/spine. `AGENTS.md:36`; `hooks/README.md`. Data agent has no external hooks.json to run. | none |
| `acp/` acp | LIKELY-UNNECESSARY | med | Automation-only ACP server. Not in base/spine (separate `acp-demo` entry point). `AGENTS.md:41`; `acp/README.md`. Data agent likely driven directly, not over ACP. | low-med (`subagent-acp` is a sibling provider; `acp-demo`/`test-support/acp-snapshot` depend) |
| `typert/` registry, loader, generator | LIKELY-UNNECESSARY | med | Type graph for RPC gateway. In base (`:30-33`) but **absent from spine** (`agent-spine-demo:15-38`). `AGENTS.md:16`. Only consumed by `api/gateway` for the web GUI. `grep` of `packages/core` for `typert|api-gateway|dsh-api`: **no matches** — core is decoupled. | med — delete 3 base rows |
| `api/` remotes, gateway | LIKELY-UNNECESSARY | med | Remote BFF + Typert RPC gateway. In base as `typert-gateway` (`:36`). `AGENTS.md:15`; `api/README.md` ("`remotes → gateway → connection → webserver`"). Pure web-GUI plumbing; headless data agent opens no port. Remove with typert + host. | med — base row + host/client/web-app bundle |
| `host/` apiproxy, webserver, frontend-static, directory-picker*, plugin-inventory | LIKELY-UNNECESSARY | med | Web-GUI host half. Not in base/spine. `packages/README.md:55`; `host/README.md`. Data agent is headless. | med — `web-app` bundle mounts host; `apiproxy` is legacy BFF fallback |
| `client/` web, modules, web-react, connection, runtime, hmr, locale, schema-form, 30+ `ui-*` | LIKELY-UNNECESSARY | med | Web-GUI browser half. Not in base/spine. `packages/README.md:56`; `client/README.md`. Largest surface (~40 packages). Data agent is headless. | med — large delete; `web-app` bundle + many ui-* |
| `feedback/` command-feedback, message-feedback | LIKELY-UNNECESSARY | med | Human feedback. `command-feedback` in base (`:253`); `message-feedback` opt-in sidecar. `packages/README.md:18`. Data agent automated; no per-message rating. | low-med (one base row) |
| `schedule/` schedule | LIKELY-UNNECESSARY | high | Session-local scheduled follow-ups. Not in base/spine. `packages/README.md:17`; `schedule/README.md`. Data agent has no reminder need. | none |
| `goal/` goal, goal-round-driver, command-goal, tool-goal | LIKELY-UNNECESSARY | med | Persisted same-session goals. In base (`:256-262,374`) AND spine (`spine:23-25`). `packages/README.md:16`. INFERENCE: reverse-bi likely brings its own task/objective model — replace rather than keep both. **Hardest base-wired removal.** | med-high — 4 base rows + spine mount; if kept, no action |
| `website/` | LIKELY-UNNECESSARY | high | VitePress docs projection. `AGENTS.md` layout: "VitePress projection of selected bilingual docs/ sources". Not runtime. | none — docs only; removable without affecting agent |

## Recommended removal ORDER (safest-first)

**Phase 1 — zero-coupling POCs/capabilities (not in base or spine; just stop loading):**
`e2b/`, `terminal/`, `lsp/`, `hooks/`. All confirmed absent from `cordis.patch.yml` and `agent-spine-demo`. Self-contained alternative providers/tools; no base row, no core import. [AGENTS.md:18,21,23,36; packages/README.md:21(POC),24,28,44]

**Phase 2 — self-modification + reminders + docs (not in base/spine):**
`extensions/` (self-modification, AGENTS.md:35), `schedule/` (reminders, packages/README.md:17), `website/` (docs). `extensions` carries a dual-half `ui-cordis` but that leaves with `client/` anyway.

**Phase 3 — web-GUI stack (not in base/spine; drop `bundle/web-app` + `apps/web` together):**
`client/` (~40 packages) then `host/` (8 packages). Removes the entire browser/HTTP surface. `api/remotes`+`api/gateway` go here too (BFF for the GUI). [packages/README.md:55-56; api/README.md dependency chain]

**Phase 4 — base-wired but spine-decoupled (edit `dsh-base/cordis.patch.yml` to delete rows):**
- `typert/` + `api/gateway`: delete rows `typert`(`:30`), `typert-loader`(`:33`), `typert-gateway`(`:36`). Safe because core has **zero** `typert`/`api-gateway` references (grep: no matches) and the spine omits them (`agent-spine-demo:15-38`).
- `feedback/`: delete `command-feedback`(`:253`); `message-feedback` already opt-in.
- If telemetry stays disabled: delete `session-telemetry-otel`(`:148`) + `identity/anonymous-user-id`.

**Phase 5 — conditional base-wired (decide per data-agent scope):**
- `goal/` (4 rows `:256-262,374` + spine `:23-25`): remove only if reverse-bi supplies its own objective/task model. Hardest because spine mounts it; would require a spine fork or `goals: false` config (`agent-spine-demo` Config allows omitting goals).
- `tool-ralph`(`:378`): Ralph fresh-agent iteration is build/coding-focused; drop independently.
- `workflow/`(`:335-340`): drop if no model-authored orchestration needed.
- External subagent providers (`subagent-acp/codex/claude-code/dsh-sdk`): already opt-in.

**Phase 6 — conditional non-base (decide per scope; just don't load):**
`mcp/`, `storage/`, `workspace/`, `sdk/`, `attachment/`, `session-query/`, `code-runtime/`, `python/`, `examples/acp-demo`. Each is independent; load only what the data agent uses.

## Open questions

1. **reverse-bi's task/objective model** — does track2data bring its own goal/todo/plan equivalent? If yes, `goal/`+`todo/`+`plan/` become redundant (Phase 5). If no, keep them. [No reverse-bi source in tree to verify.]
2. **Data-agent execution surface** — bash-only, or also `code-runtime` (run_code)? The `headless` bundle mounts Code Mode's worker (`bundle/headless/README.md`); a data agent doing DataFrame transforms may prefer `run_code`. Decides Phase 6 for `code-runtime/`.
3. **MCP** — does the data agent consume MCP servers (e.g. for DB/file connectors)? Decides `mcp/` keep.
4. **Python SDK** — is the data agent driven via Python (reverse-bi is Python)? Decides `python/` + `sdk/` keep. INFERENCE (med): likely yes.
5. **Interactive vs automated** — does the data agent need human approval/commands, or is it headless-only? Decides `interaction/` keep scope.
6. **`goal/` spine coupling** — `agent-spine-demo:23-25` mounts goal unconditionally in code (README says config can omit via `goals`), but "Most of the spine set is fixed in code" (`agent-spine-demo/README.md` Known Limitations). Confirm whether `goals: false` fully suppresses before Phase 5.
7. **`acp/` + `test-support/acp-snapshot`** — snapshot tests depend on ACP; removing `acp/` requires retiring those snapshot harnesses. Quantify test fallout before Phase 2.
