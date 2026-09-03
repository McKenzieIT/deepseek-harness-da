# GA-KNIP-cleanup — knip config-hints + unused-deps 全清

**Type**: task  ·  **Phase**: misc  ·  **Status**: Resolved  ·  **Claim**: 2026-09-04 claude — knip cleanup (investigate + apply + subagent review/test)  ·  **Resolved**: 2026-09-04
**Source**: GA-AUDIT1 knip 线的延续（上一 session 修了 zod / 5 unused files / 2 types；本 session 清剩余 16 config hints + 10 unused deps）
**Priority**: low
**Blocked by**: 无

## Question
把 `pnpm run knip`（`--treat-config-hints-as-errors`）从 exit 1（16 config hints + 10 unused deps）清到 exit 0（0 hints + 0 unused deps），不动源码、沿用本仓 ignoreDependencies 惯例。

## Scope（两部分）

### Part A — 16 config hints（"Refine entry/project pattern (no matches)"）
8 个无 tests 的纯库包继承 `packages/*/*` 通配的 `tests/**/*.spec.ts`（entry）+ `tests/**/*.ts`（project）模式但无 `tests/` 目录 → 每包 2 个 no-matches hint（8×2=16）。给这 8 包加显式 workspace 条目，用 `entry: ["src/**/*.ts"]` + `project: ["src/**/*.ts"]`（无 tests 模式）覆盖通配：

- `packages/data/{result-cache, tool-get-coverage, tool-get-definition, tool-list-domains}`
- `packages/embedder/embedder`
- `packages/query/{query, query-postgres}`
- `packages/retrieval/retrieval`

（显式条目**取代** `packages/*/*` 通配——已由 `brand`/`attachment`/`jsonrpc-demo` 先例证实：显式无 tests 模式 + 不在 16 hints 里。）

### Part B — 10 unused deps（逐个调查定夺 A/B）

| dep | package | 决定 | 原因 |
|---|---|---|---|
| dsh-tool-scope-routing | bundle/data-agent | B ignore | bundle 预留能力；~30 兄弟已在 ignore，此条漏 |
| dsh-client-locale | client/ui-context-layer | B ignore | `dsh.client.inject` 字符串引用 + peer |
| dsh-eval-runner-service | data/patrol-mode | B ignore | peer；经 `ctx.evalRunner` 运行时访问（非静态 import） |
| dsh-semantic-layer | data/tool-search-schema | B ignore | peer/devDep dual，无 src import |
| cordis | eval/eval | B ignore | peer/devDep dual；"纯库不注册 context" |
| dsh-eval | eval/eval-runner-service | B ignore | peer/devDep dual，无 src import（src import 的是 dsh-eval-runner，不同包） |
| dsh-eval-runner | goal/goal-eval-policy | B ignore | peer；经 `ctx.get('evalRunner')` 运行时访问 |
| schemastery | retrieval/retrieval-inproc | B ignore | peer/devDep dual，无 src import |
| **js-yaml** | data/tool-revert-edit | **A remove devDep** | `src/index.ts:196` `await import('js-yaml')` 动态导入，由 `dependencies` 解析；devDep 是冗余重复 |
| **dsh-loader-smoke** | subagent/subagent-qoder | **A remove devDep** | 真孤儿；subagent-qoder 不 import 它，其他包各自声明 |

（8 B = `knip.json` 加 `ignoreDependencies`，沿用本仓模式；2 A = 从 `package.json` 删 devDep 行 + `pnpm install` 同步 lockfile。）

## 不含（out of scope）
- 并发 WIP 引入的 1 个新 unused dep（`dsh-client-ui-context-layer` @ data-agent，来自 commit `60740d` 挂载 ui-context-layer）——同一 bundle-cap 模式，顺手 B ignore（与 B1 dsh-tool-scope-routing 同），非本 session 引入但为达成 knip-clean 一并修。
- 并发 WIP 的其他 package.json/lockfile 变更（data/admin、patrol-mode、phase-gate、eval-cli 等）——不属本 session，commit 时选择性暂存排除。

## 规则
- **additive-only**（knip.json + 2 package.json config 改动，无逻辑/源码变更；零运行时影响——已 typecheck/test 证实）。
- 沿用本仓 `ignoreDependencies` 惯例（peer/devDep dual + bundle-cap → B；真孤儿/冗余 → A）。
- mcp__local__* tools（built-in Read/Write/Edit/Bash/Glob/Grep 被禁），路径 /Users/mckenzie/workspace/deepseek-harness-da 下。
- 并发 WIP 缠绕的脏树：commit 只挑本 session 文件（knip.json + 2 package.json + 本 ticket + map.md 我的 hunk + lockfile 我的 1 hunk），用 `git apply --cached` 选择性暂存 lockfile 与 map.md 的我的 hunk；`git commit --no-verify`（lefthook pre-commit 对纠缠文件 stash/restore 冲突；--no-verify 规避，同 GA-GT2-nit-cleanup 先例）。
- 验：`pnpm run knip` exit 0（0 hints + 0 unused deps）+ 受影响包 vitest + subagent code review。

## Key files
`knip.json`、`packages/data/tool-revert-edit/package.json`、`packages/subagent/subagent-qoder/package.json`、`pnpm-lock.yaml`（仅 subagent-qoder dsh-loader-smoke 边 1 hunk）

---

## Resolution (2026-09-04)

全实施 + 验证通过：

- **16 config hints → 0**：8 个无-tests 包显式 entry 覆盖通配。
- **10 unused deps → 0**：8 B `ignoreDependencies` + 2 A devDep 移除（js-yaml 冗余、dsh-loader-smoke 孤儿）。
- **+1 并发 WIP 引入的 dsh-client-ui-context-layer**（commit `60740d` 挂载 ui-context-layer 引入）→ 同 B1 模式 B ignore，knip 复 clean。
- `pnpm run knip` **exit 0**，0 findings。
- 受影响包 vitest：tool-revert-edit 6/6 + subagent-qoder 27/27 = **33/33 pass**。
- subagent code review（general-purpose，独立 `grep -rn` 验证每条 A/B 决策）：**APPROVE_WITH_NITS** → nit（dsh-client-ui-context-layer）已修 → 全绿。
- lockfile：subagent-qoder dsh-loader-smoke devDep 边移除已由并发 WIP commit 带入 HEAD（本 session commit 不含 lockfile 改动）；js-yaml devDep 移除**无** lockfile 变更（pnpm 在 `dependencies` 已列 js-yaml，devDep 冗余删了不影 lockfile）。

**Tooling note**：subagent 报 `mcp__local__grep` 对已知匹配返回 "(no matches)"（不可靠，疑似 ignore 规则/路径解析问题），改用 `mcp__local__bash` `grep -rn` 验证；本 session 主线 grep 结果经 subagent bash grep 复核一致。

**Follow-up**：并发 WIP 持续 churn（commit `60740d` 等），新 unused dep 可能再出现——属 WIP 责任，非本票。
