# UM15 首片实现方案（S2 subagent 交付，2026-09-14）— **部分丢失，待补**

> **状态**：⚠ **本文件记录的交付是不完整的。** S2 subagent 产出了完整的 §1–§8 实现方案，但其最终消息在 task-notification 里被**从开头截断**（通知里只到 §4.5 起句"`pnpm run upstream-status`. Continuing §4.5."）。完整文本在一个 runner 侧 transcript 文件里（`/tmp/claude-1001/.../tasks/a20d1b3053ee8746c.output`），而本环境所有文件工具（`mcp__local__*`）只跑在用户的 Mac 上，**够不着 runner 侧 `/tmp`**。一个被派去持久化的 subagent 正确地诊断了这个 split-brain 并拒绝编造。
>
> **本文件保住了什么**：§6（Decision 4 spike，自包含）、§7（诚实边界，自包含）、§8（落地顺序，自包含）——这三节是散文，主 session 能忠实记录。外加 §4.5/§4.6 两个脚本的**设计摘要**（不逐字转录代码——避免转录错误污染一个本应 verbatim 应用的 patch）与 §5 接线要点。
>
> **丢了什么**：§1（`run-gates.ts` MODES 重构）、§2（`verify-gate-coverage.ts` meta-gate + manifest + spec）、§3（`generator-inputs.manifest.json` + spec）、§4.1–§4.4（核心 `upstream-sync-record.ts` 模块 + 初始 `upstream-sync.json` 真实内容）。这四节是首片的主体代码。**下 session 须重新派 S2（或新 subagent）只补这四节**——§6 的发现 + §7 的清单会让重做更便宜、更准。
>
> **票据**：[UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) · 设计草案：[`um15-durable-sync-design-2026-09-10.md`](um15-durable-sync-design-2026-09-10.md)

---

## §6 Decision 4 spike 结论（纯静态读码，未跑——自包含，高价值）

**问题**：`gen-architecture-graph --rev` 能否不 `pnpm install` 就跑？（Decision 4 依赖它）

**结论：`--rev` 不存在；即使实现，也不能不 `pnpm install` 跑；而且草案 (a) 方案本身的前提是错的。**

| 问题 | 结论 | 证据（S2 亲自核的 file:line） |
|---|---|---|
| 支持 `--rev`？ | **不支持。** 整文件只解析一个 flag | `scripts/gen-architecture-graph.ts:415` `if (process.argv.includes('--check'))` —— 全文唯一 argv 读取（grep `process.argv` 只命中 `:415` 与 `:433` 的 entry guard） |
| 读工作树还是 git 树？ | **工作树，root 硬编码** | `:40` `const root = resolve(import.meta.dirname, '..')`。无 `execSync`/`spawnSync`/`git`（grep 零命中）—— 完全没有从 git object 读取的能力 |
| 加 `--rev` 的隐藏坑 | `collectGraphData()`（`:394-410`）把 `root` 传给 `collectPackageGraph`/`collectFaceMembership`/`collectRemoteAssembly`/`TypeScriptProject`，但 **`collectDeclaredDeps(pkgs)`（`:409` → `:248`）不收 root 参数，闭包捕获模块级 `root`**。任何 `--rev` 实现若只改 `collectGraphData` 的入参，undeclared-import 那一列会**静默读 fork 工作树的 `package.json`** → 产出一张**混血图**，比不生成更危险 |
| 不 install 能跑？ | **不能** | ① `:31` `import ts from 'typescript'` 需 `node_modules/typescript`；② `:399` `new TypeScriptProject(root,'host')` → `ts-project.ts:96` `ts.createProgram(...)` 建真 Program，需 TS 自带 `lib.*.d.ts` + `tsconfig.host.json` 的 `projectReferences` 闭包（`ts-project.ts:37-52`）；`semanticCompilerOptions`（`:71-81`）只关 emit，没关模块解析。但**只需 `node_modules`，不需 `build`**（`lib/` 当前不存在，而门今天可跑） |
| 草案 (a) 方案本身 | **前提错** | `scripts/gen-architecture-graph.ts` 与 `docs/architecture-graph.md` 在 `upstream/master` 与 `c389f96bf3` 上**都不存在**（`git cat-file -e` 逐个确认）。所以「detached worktree checkout 到 upstream rev 然后跑生成器」根本跑不起来——那棵树里没有生成器。`--rev` 只能是「fork 的生成器 + 指向另一棵树的 root」，即上面那个坑必须先修 |
| 已有先例 | 6 个生成器已参数化 `scanRoot`（`gen-config-catalog:625`、`gen-cordis-catalog`、`gen-module-graph:118,130`、`gen-persistence-catalog:176`、`gen-session-format-catalog:51,68,117`、`gen-tool-catalog:960`）。`gen-architecture-graph` 是**没**跟上这个约定的那个 |

**建议**：草案 (b)（默认走 upstream 自带生成物 diff + export-surface diff）不依赖任何未验证前提，**采纳**。`--deep`/`--rev` 若要做，先做三件事：① `collectDeclaredDeps(root, pkgs)` 参数化；② `--rev <sha> --into <dir>` 语义定为「`git archive <sha> | tar -x` 到临时目录，再以该目录为 `scanRoot`」；③ 临时目录里 `pnpm install` 或 symlink 复用 fork 的 `node_modules`（后者可行性未验）。

**主 session 真验的话跑这个**（S2 没跑）：
```sh
cd /Users/mckenzie/workspace/dsh-resync
# 1. 门今天能否在无 lib/ 的情况下跑通
time pnpm run verify-architecture-graph
# 2. node_modules 能否被另一棵树复用
tmp=$(mktemp -d) && git archive c389f96bf3 | tar -x -C "$tmp" \
  && ln -s "$PWD/node_modules" "$tmp/node_modules" \
  && (cd "$tmp" && node --import tsx "$PWD/scripts/gen-architecture-graph.ts" --check) ; echo "exit=$?"
# 3. 若 2 失败，测最小 install（--deep 的真实单价）
(cd "$tmp" && pnpm install --frozen-lockfile --ignore-scripts)
```

> **主 session 已实测**：`pnpm run verify-architecture-graph` 在本轮 sweep 里是 **GREEN**（见 `bcf4776f1d` 后的 31/14 sweep）。所以 §8 第 2 步依赖的"该门今天绿"这个前提**成立**。

---

## §7 诚实边界（S2 自列——下 session 落地前逐条验）

### §7.1 S2 亲自打开确认过的 file:line（范围，非全量）

`scripts/run-gates.ts`（Mode union `:23-41`、parseMode `:134-159`、gatesForMode 全表 `:232-295`、`ciSharedStaticGates :297-314`、`ciPrimaryGates :316-343`、`ciStaticGates :413-430`、`ciConsumerGates :445-485`、windows observational `:544-565`、`hygieneLeafGates :687-709`、`docSyncLeafGates :711-764`、`docQuickLeafGates :771-773`、`validateGateGraph` duplicate-id at `:813`）、`run-gates.spec.ts`（第四份 mode 列表 `:137-161`、hygiene id 断言 `:182-195`）、`pnpm-invocation.ts:9-21`、`gen-architecture-graph.ts`（全文关键行）、`gen-cordis-api.ts`（9 行全文）、`gen-cordis-catalog.ts`、`gen-cordis-inspect-catalog.ts:1-20`、`gen-doc-graphs.ts`、`gen-module-graph.ts`、`gen-third-party-notices.{ts,spec.ts}`（spec `:22-30` 的 freshness 断言证伪草案 §6.2）、`gen-tsconfig-paths.ts`、6 个其它 `gen-*.ts`、`package-graph.ts`、`ts-project.ts`、`translation-pairing-{record,git}.ts`、`verify-config-source-ownership.{ts,spec.ts}`（CLI/spec 约定模板）、`verify-doc-budgets.ts`（manifest 读取约定）、`verify-archived-agent-notes.ts`、`verify-export-jsdoc.ts`（作用域限 `packages/*/*/src`）、`scripts/AGENTS.md`、`doc-budgets.manifest.json`、`wine-windows-gates.sh`、`package.json`（全部 164 条 scripts）、`lefthook.yml`、`.oxlintrc.json`、`vitest.config.ts:108-200`、`tsconfig.base.json`、`tsconfig.host.json`（include 102 条含 `:110 scripts/**/*.ts`）、`.github/workflows/{ci,release,no-production-src-on-master,ci-master}.yml`、`.agents/notes/archived/process/2026-07-21-doc-sync-through-gate-scheduler.md:1-28`（**prompt 的成文不变量回归结论确认为真**：`cordis-api` 在 `run-gates.ts` 零命中）、`knip.json:30-31`、`packages/typert/generator/src/cordis-catalog.ts:365-385`、设计草案与 UM15/UM-MERGE-INTEGRITY 票据全文。全量清单在 runner transcript 里。

### §7.2 S2 **没**核的 11 条（下 session 落地前必验）

1. **`nonGeneratorInventoryGates` 那 13 条的 inventory 敏感性**：只核了「都是真实 package.json script 名」；草案给的行号（`verify-package-paths:43`、`verify-application-entrypoints:95`、`verify-package-dependencies:24`、`package-invariants.ts:51`、`verify-runtime-closure:202`、`verify-cordis-config:364,470`、`verify-client-packages:13`、`verify-subsystem-pages:73`、`verify-node-next-types:40`、`publint-all:53`）**一条都没验**。manifest 的 spec 对这一节只断言名字存在，所以错也不会假绿/假红，但清单本身可能不准。
2. **`verify-mermaid.ts:18-22` globs `docs/**/*.md`**（草案 §6.2 的"二阶发现"）—— 未打开。只影响叙事，不影响本片代码。
3. **`docs/architecture-graph.md` 是 orphan document（无入链）** —— 未验。
4. **`SEAM_MANIFEST` seam-6 标 0/332 包**（Decision 5）—— 只读了 seam-1..4（`:62-80`），没读 seam-5/6，也没跑标记统计。Decision 5 不在本片，未验证不影响交付。
5. **`8112743d69` 是 HEAD 的 ancestor** —— 从 `git log --merges` 的拓扑推断（`5cae53421f`/`e67ecc6541`/`d4f2752c15` 在其之上），**没跑 `merge-base --is-ancestor`**。（主 session 后来已实测确证。）
6. **`ci.yml:74` 的 `fetch-depth: 0` 属于跑 `:116 check:ci:static` 的那个 job** —— 从「`:72` 与 `:136` 之间没有别的 checkout」推断，**没解析 YAML 确认 job 边界**。影响 §4.5 的 CI 行为判断（但因门做了 shallow 降级，判断错也不会假红）。
7. **`upstream-status.ts` 完全没运行**（网络 + 写 FETCH_HEAD）。`git ls-remote upstream refs/heads/master` 的输出解析、`git fetch` 的 exit code 语义，均按文档写，未实测。
8. **`upstream/master` 当前是否仍是 `5dda764ed3`**（草案说真远端 HEAD 是 `2377c272a8`）—— 读的是本地已 fetch 的 ref，**没跑 `ls-remote`**，"fetched ref 本身已 stale"这条草案结论未复现。
9. **两个新 gate 的实际耗时** —— `verify-gate-coverage` 在 `node -e` 里跑过等价逻辑（<1s），但没跑真实的 `tsx scripts/verify-gate-coverage.ts`。
10. **新代码没过 `tsc` / `oxlint` / vitest**。只有 §1 的 `MODES`+`isMode`+`parseMode`+exhaustive switch 片段做了 in-memory `ts.createProgram` 检查（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`，0 diagnostics）。**§2/§3/§4 的四个新脚本 + 两个新 spec 未做任何类型或 lint 验证**。
11. **`it.each(MODES)` 在 vitest 里接受 readonly tuple** —— 按类型签名推断，未跑。若报类型错，改 `it.each([...MODES])`。

---

## §8 落地顺序（S2 建议，自包含）

1. **§1**（`run-gates.ts` MODES + `run-gates.spec.ts`）—— 独立可验，`pnpm exec vitest run scripts/run-gates.spec.ts` 应全绿且测试数不变（17 个 mode 参数化 case）。
2. **§5.2(c) 那一行 `verify-architecture-graph` enroll** —— 人拍 Decision 6。**跑一次 `pnpm run verify-architecture-graph` 确认它今天绿**；若 stale 先 regen 再 enroll。✅ **主 session 已实测该门今天 GREEN**，此前提成立。
3. **§2**（meta-gate + manifest + spec）+ §5.2(a)(b) 的 `gate-coverage` 两行。
4. **§3**（generator-inputs manifest + spec）—— 与 §2 无耦合，可并行。
5. **§4**（upstream-sync 三件套 + `upstream-sync.json`）+ §5.2(a)(b) 的 `upstream-sync-record` 两行。**这一片是四片里唯一带未实测网络路径的，建议最后落并单独跑 `pnpm run upstream-status`。**

---

## §4.5 / §4.6 两个脚本的设计（**不逐字转录代码**——避免转录错误污染 patch）

> 这两节 S2 给了完整代码，主 session 上下文里也有，但它们 **import 自丢失的 `./upstream-sync-record.ts`（§4.1–§4.4）**，单独拿出来编译不过。与其逐字抄代码引入错字，这里记**设计意图**，下 session 重派 S2 时连同核心模块一起重新生成干净版本。

### `scripts/verify-upstream-sync-record.ts`（门）
- 从 `./upstream-sync-record.ts` import `collectGitFailures` / `collectShapeFailures` / `readUpstreamSyncRecord` / `UPSTREAM_SYNC_RECORD`。
- **故意不检查落后 upstream 多少**：upstream 独立于任何 PR 在动，落后计数门会挂无关 PR，一周内必被关掉。记录一致性是作者可控的，所以可 gate；落后计数归 `upstream-status`（永不失败的报告）。
- 先查 shape，shape 有错就不查 git（短路）。failures = shape + git.failures。
- **需要本 checkout 没有的历史 → 报 skipped 不报 failed**：`actions/checkout` 只配 `origin`，CI 里没有 `upstream` remote-tracking ref；shallow job 读不到 merge 的第二 parent。第二 parent 身份检查是承重的那条，它在 `fetch-depth: 0` 且无 remote 时可跑。
- 末尾报告 `decision === 'pending'` 的 waiver（即 §2.4.bis merge 完整性发现里还没判 keep-fork/fork-drop 的）。

### `scripts/upstream-status.ts`（报告，永远 exit 0）
- **拒绝打印从 unfetched/stale ref 推出的落后计数** —— 这是它要防的失败模式：UM15 写作时 `upstream/master` 指 `5dda764ed3` 而真远端 HEAD 是 `2377c272a8`，无 fetch 的计数会无限少报 → 假绿。
- `RefState` = `fresh` / `stale`（local≠remote）/ `unknown`（ref 不在或 fetch 失败）。
- `daysSince(syncedAt)` 触 `thresholds.daysSinceSync`；`commitsBehind` 触 `thresholds.commitsBehind`；`merge-base(HEAD, tracking) !== record.current.upstreamSha` → 触"merge-base disagrees"。
- 末尾报告 pending waiver 数。
- `--no-fetch` 时不 fetch，改用 `ls-remote` 比远端（避免发网络但仍不靠陈旧 ref）。

### §2.4.bis merge 完整性门的接口（§4 核心模块暴露给 §4.5/§4.6 的字段）
- `UpstreamSyncRecord`：`{ current: {upstreamSha, upstreamCommittedAt, mergeCommit, syncedAt}, history: [...prior syncs], thresholds: {daysSinceSync, commitsBehind}, waivers: Waiver[] }`
- `Waiver`：`{ path, direction: 'drop-fork'|'keep-fork'|..., decision: 'pending'|'keep'|'drop', ticket }` —— **这正是装 UM-MERGE-INTEGRITY 那批 keep/drop 决策的字段**。
- **初始 `upstream-sync.json` 的真实值**（主 session 从 S1 拓扑补，S2 的 §4 原文丢了）：两次 sync —— M1 `6b7610d45a` 吸收 upstream `d347e70390`（dsh-v0.1.3-alpha.1）；M2 `8112743d69` 吸收 upstream `c389f96bf3`。当前 HEAD `a469c899bd`。waivers 初始应填入 UM-MERGE-INTEGRITY 的 5 组发现里仍 pending 的那几条（2 组已 drop 落地、2 组有意 defer、1 组 keep，外加整包回退这条）。

---

## §5 接线要点（精确 diff 的位置，代码重派 S2 再给）

- **`package.json`**：三条新 script（`verify-gate-coverage` / `verify-upstream-sync-record` / `upstream-status`）插在 `:167` `verify-architecture-graph` 之后、`:168` `constraints` 之前的 fork-only 缝里 → 把三处潜在冲突 hunk 收成一处。`upstream-status` 不进任何 mode（报告命令）。
- **`run-gates.ts`**：两个新门（`gate-coverage` / `upstream-sync-record`）进 `ciSharedStaticGates()` 尾部（覆盖 `ci-primary`/`ci-linux-primary`/`ci-static`/`ci-windows-observational`/`ci-windows-complete`）**和** `hygieneLeafGates()` 尾部（覆盖 `hygiene` pre-push + `check-all`）。S2 已核 `ciSharedStaticGates` 与 `hygieneLeafGates` 从不出现在同一 mode → 不触发 `validateGateGraph` 的 duplicate-id 检查（`:813`）。Decision 6(a) 的 `verify-architecture-graph` enroll 一行进 `docSyncLeafGates()`（`:727` 改后 `:722`），一行覆盖 5 个聚合，**不加 `quick: true`**。
- 不需改 `.github/workflows/*.yml`（新门经 `check:ci:static` 与 `hygiene` 进入）；`knip.json` 不需登记（knip 不在任何门里）；新脚本自动进 `tsconfig.host.json`（`:110`）的 typecheck 与 `vitest.config.ts`（`:124`）的 test/coverage。
- lint 约束（`.oxlintrc.json:153-181` 对 `scripts/**`）：`no-non-null-assertion` / `no-unnecessary-condition` / `only-throw-error` / `require-await` / `restrict-template-expressions`(allowNumber+allowBoolean) / `switch-exhaustiveness-check` + 全套 `no-unsafe-*`。S2 的代码据此写（无 `!`、索引访问当 `| undefined`、`JSON.parse(...) as T`）。

---

## 下 session 该做什么

1. **重派 S2（或新 subagent）只补丢失的 §1/§2/§3/§4.1–§4.4**。给它本文件 + 设计草案 + UM15 票 + UM-MERGE-INTEGRITY Resolution（喂 waivers 真值）。§6 的 spike 结论让它别再走 (a) 弯路；§7.2 的 11 条让它落地前逐条验。
2. 按 §8 顺序落地：§1 → §5.2(c) enroll（前提已验绿）→ §2 → §3（并行）→ §4（最后，单独跑 `upstream-status`）。
3. 落地后跑 `tsc`/`oxlint`/vitest（§7.2 第 10 条——S2 没跑过）。
4. 同步推进 UM12 余下门：L6（application entrypoints，删僵尸后已解锁，10 条 allowlist）、L7（markdown links，实测 14 条非 1，slot-contract 那条 S1 已给结论=改文档不恢复文件）、L9（agent note format，风险最高，UM12 已建议 defer）。
