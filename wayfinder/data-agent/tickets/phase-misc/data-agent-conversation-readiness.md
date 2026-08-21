# data-agent conversation readiness — remaining wiring + tool packages

> Surfaced + partially resolved by the 2026-08-21 verification sweep (15-agent read-only review workflow + inline build/boot/conversation probes).

## Question

What remains before `dsh-data-agent` boots a **full data-agent conversation** (NL→SQL→ODPS→delivery) end-to-end, after the 2026-08-21 sweep fixed the build + the LLM provider wiring?

## Fixed this session (in-env, uncommitted; backups kept as `*.bak-llmfix`)

1. **Build blocker (completes `host-typecheck-wiring`)** — `packages/query/query-maxcompute/src/index.ts`, 2 TS errors surfaced by the uncommitted `tsconfig.host.json` query refs (the wiring added `query`/`query-maxcompute` to the host typecheck graph):
   - TS4113 L129 `override [Service.init]` not declared in base `QueryEngine` → dropped `override` (idiom: da Service providers `credentials-local`/`credentials-keychain` use none; `Service.init` is a symbol lifecycle hook, not a TS-overridable base member).
   - TS2379 L224 `{ signal, timeout }` vs SDK `RequestOptions` under `exactOptionalPropertyTypes` → conditional spread `...(signal ? { signal } : {})`.
   Both behavior-neutral. Build green (record `.dsh-build/client-build-environment.json` `fileCount: 200`). Without this, `pnpm run build` aborted at `build:lib:host` → no `typert.host.js` / client bundles → `pnpm dsh web` failed with "plugin tree failed to load: loader fibers failed".
2. **LLM provider wiring** — `pnpm dsh web`/`headless` reached the LLM but 404'd (`PI_AI_ERROR: 404 status code (no body)`). Root cause: settings `agent-default-model: dashscope/qwen3.7-max` routed to **`llm-pi-ai`'s `dashscope` provider** (`api: openai-completions` against the AGA gateway `pre-aga-ai-gateway.alibaba-inc.com/api/v1`) — but AGA is a **native protocol, NOT OpenAI-compatible** (P2 live-probes refuted R1's OpenAI-compat thesis), so the openai-completions path 404s. The correct da `llm-dashscope` (native AGA, P2) was unmounted (headless profile = `dsh-base + dsh-headless`, no `llm-dashscope`) or lost the route to `llm-pi-ai` (web — `dsh-web-app` already mounts `llm-dashscope`, but `llm-pi-ai`'s settings-configured `dashscope` won the route). Fix: mount `llm-dashscope` in the headless profile `cordis.patch.yml` + remove `dashscope` from `llm-pi-ai.providers` in `~/.dsh/settings.yaml` → `llm-dashscope` owns the `dashscope` route; it resolves `DASHSCOPE_API_KEY` via the credentials seam (PAT-not-in-env honored). **Verified**: headless one-shot `Reply with exactly one word: PONG` → `PONG` via da `llm-dashscope` (native AGA); web boots HTTP 200 with the same wiring.

## Remaining (blocks a FULL data-agent conversation)

3. **Data-agent model-facing tool packages are placeholder** — `apps/cli/config/agent-presets/data-agent/agent.cordis.yml` mounts `phase-gating` (phase-gate, P7b) + `tool-search-data-sources` (P13b sub-item, shipped), but `query_data` / `load_table_definition` / `load_event_definition` / `critique_sql_tool` / `evaluate_sql_quality` / `present_*` are **commented** ("name TBD — uncomment when the package ships"). So the four-phase pipeline orchestrates + the LLM converses, but cannot execute NL→SQL→query→delivery end-to-end until those tool packages ship + are uncommented. (`P4c-real-odps-execution-path` + the tool packages are the hard gate.)
4. **LLM-wiring persistence** — the in-env fix (headless `cordis.patch.yml` insert + settings edit) is reversible config; for a fresh data-agent profile to converse via da-native out-of-the-box, the data-agent bundle/preset should mount `llm-dashscope` + ship a non-colliding settings default (or drop `dashscope` from `llm-pi-ai`'s catalog). The web profile already has `llm-dashscope` via `dsh-web-app`; headless/data-agent profiles don't by default.

## Resolution

Not resolved — records the verified remaining gap. Build + LLM-wiring fixes (#1, #2) are applied in-env (backups: `settings.yaml.bak-llmfix`, `profiles/{headless,web}/cordis.patch.yml.bak-llmfix`); #1 is an uncommitted working-tree code fix. Tool-package shipping (#3) + LLM-wiring persistence (#4) are follow-up. **#3 is the hard gate** for a full data-agent conversation; #1/#2 already make the harness boot + converse via the da LLM (headless PONG proven, web boots).
