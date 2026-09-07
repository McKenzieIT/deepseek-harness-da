# T9 — verify-built-package-invariants: ./lib/invariant.js 未作 ./invariant 发布

**Type**: task
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: PR #44 CI `node 24 / snapshots and artifacts` 失败 step "Run compatibility, snapshot, and artifact gates"（job 101598597835，run 34074751506，2026-09-07 02:00）。pre-existing（latent，非 W20）。**verify on current master cf813c18c0 before fixing。**

## Question

`verify-built-package-invariants` gate 红：~13+ packages 的 manifest 不 publish `./lib/invariant.js` as `./invariant`：

- `@deepseek-ai/dsh-admin`、`dsh-evidence-query`、`dsh-management-session`、`dsh-schema-gateway`、`dsh-scope-registry`、`dsh-semantic-layer`、`dsh-tool-compute`、`dsh-tool-discover-alt-labels`、`dsh-tool-discover-relations`、`dsh-tool-edit-definition`、`dsh-tool-get-coverage`、`dsh-tool-get-definition`、`dsh-tool-list-domains`（…更多，见 CI log）。

这些 package build 出 `lib/invariant.js`（tsdown `staticLinked`/`clientLibrary` preset 产 invariant entry）但 package.json 的 `files`/`exports` 未列 `./invariant` → `verify-built-package-invariants` 报 "manifest does not publish ./lib/invariant.js as ./invariant"。

非 W20 引入（W20 不动任何 package.json）。latent on master。

## Scope

每个违规 package.json 的 `files` + `exports` 加 `./invariant` → `./lib/invariant.js`（mirror 已 compliant 的 package，如 client/web 的 `./invariant` export），验 `pnpm run verify-built-package-invariants` 绿。CI log: job 101598597835（grep `== FAILED built package invariants` -A15）。先 verify on current master。
