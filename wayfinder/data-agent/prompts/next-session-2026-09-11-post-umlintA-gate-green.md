# Next-session prompt — UM-LINT 收口完毕（gate 首次 0 errors / 0 warnings）；下一张票 = UM-LINT-B 或 UM 专项（eval 永续不变）

> 承接 `next-session-2026-09-11-post-translation-zh-umlint-A.md`。本 session 把 UM-LINT 整条线**收口**了：UM-LINT-A 诊断出根因、一行 tsconfig 根治、修完全部真实项，resync 的 `lint:contracts-ready` **首次 0 errors / 0 warnings**。预先约定的兜底 **(C) 作废**，(B) 也没落。master-sync merge + push 仍**永久 defer**（eval 永续）；p2-* 分支清理仍**按用户指示推迟**。

## 一、本 session 结果（勿重做）

### ① UM-LINT-A：根因证实 = tsgolint 把 host/client 两侧 Cordis `Context` augmentation 合并进同一 program

详见 [UM-LINT-A-OXLINT-RESOLUTION](../tickets/phase-upstream-merge/UM-LINT-A-OXLINT-RESOLUTION.md) 的 `## Resolution` 节（含全部证据链、四个假设的裁定、四条已证伪的 oxlint 旋钮）。要点：

- **不是** Cordis DI 解析失败。tsgolint 硬编码 `UseSourceOfProjectReference: true`，顺 `paths` 进 `src`，把 host 那段 augmentation 拉进 client program → 全仓仅 **3 个**双面同名异型属性（`sessions` / `cordisInspect` / `dynamicCordisRunner`）触发 `TS2717` → host 类型赢 → client 独有成员（`open`/`scopeOf`/`binding`）变 `error` 类型 → 级联 **81** 条。
- **决定性实验**：改 **host** 侧 `sessions` 声明的名字，client 文件 18 → 0 errors。
- **修法（已落地）**：`tsconfig.base.client.json` 加 `"disableSourceOfProjectReferenceRedirect": true`（**client-only** 放法——受影响 11 包全 extends 它，host 树零影响，且比放 `tsconfig.base.json` 少报 2 条）。
- **配套（已落地）**：`scripts/run-gates.ts` 的 `lintGate` `needs` 由 `['typert-contracts']` 改 `['typecheck']`，同步改 `run-gates.spec.ts` + `package.json` 的 `lint`/`lint:fix`。17 个 mode 已全拓扑验证无环。

### ② 16 条真实项全修（零 disable directive），gate 全绿

- resync commit **`5fe9b32e44`**（13 files, +63/−24，**未 push**）：`lint:contracts-ready` **0 errors / 0 warnings**、`tsc -b tsconfig.host.json` EXIT 0、`tsc -b tsconfig.client.json` EXIT 0、`run-gates.spec.ts` **86/86**、architecture-graph/module-graph(3)/doc-graphs(6)/cordis-catalog(99) 全 up to date、`verify-md-links` 1730 files。
- master commit **`791173732f`**（4 files，仅 wayfinder 文档）。

### ③ 新票 UM-LINT-B（unclaimed，可立即认领）

**[UM-LINT-B-UNMATCHED-PROGRAMS](../tickets/phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md)**（grilling）：**56 个文件不被任何 tsconfig 认领**，落进 tsgolint 的 option-less inferred program（无 `paths`/无 `strict`）被**静默漏检**（门却是绿的）。其中 **7 个落在严格 type-aware override 内**，成因已定位到具体一行：6 个 `eval-cli/tests/*.spec.ts`（`tsconfig.host.json` 的 `exclude` 有 `packages/eval/eval-cli/**` 整包排除，而该包自己只 `include: ["src"]`）+ 1 个 typert `fixtures/remote-model/*.d.ts`（`.oxlintrc.json` 只 ignore 了 `type-model`，与 `tsconfig.host.json` 排 `fixtures/**` 不一致）。票里有 4 个候选解法 + 最有价值的 durable 防线建议。
⚠ `packages/eval/eval-cli` 是 **eval 机器本身**，master 上 eval 永续 → 改它要协调；read-only 复现在 resync 完全安全（`OXC_LOG=debug`）。

## 二、下 session 建议顺序

1. **[UM-LINT-B](../tickets/phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md)**（grilling，需 HITL 拍板；诊断证据已备齐，主要是决策 + 一道 durable gate）。
2. UM 专项其余：ui-settings re-port ~2 / [UM-QODER-SUBAGENT-RETIRE](../tickets/phase-upstream-merge/UM-QODER-SUBAGENT-RETIRE.md) ~1-2 / [UM-INVARIANT-COMPANION-CLEANUP](../tickets/phase-upstream-merge/UM-INVARIANT-COMPANION-CLEANUP.md) ~1 / UM-ADAPT·UM4·CORDIS·UM6·UM12-cron·UM15-cron ~5-6（多需 HITL）。
3. **未开票的遗留**（本 session 发现，需要时自己立票）：
   - `packages/credentials/credentials-keychain-host/tests/host.spec.ts` 的 "gates the per-user→global fallback off in stable mode" **pre-existing 失败**（挂在 `src/index.ts:147` 的 `parseCredentialsDocument`，"uses the pre-release flat layout"）。已两重证明非本次引入：subagent 做过 A/B；且本次对该文件的改动**忽略全部空白后与 HEAD 逐字节相同**。
   - `packages/data/tool-compute/tsconfig.json` 仍 reference `../../util/values`，现已不被使用（无害）。

## 三、已被证伪 / 已纠正的前提（**别再照旧 prompt 做**）

1. **⚠ 「build 非 load-bearing，oxlint 从源码解析类型」现在反过来了。** 这句在 (F) 之前是对的，之后**失效**：`disableSourceOfProjectReferenceRedirect` 让 tsgolint 读**编译产物**，所以 **client 声明成了 lint 的前置**。实测：藏掉 `packages/api/session-controller/lib` 后，单个 client 文件 0 → **23 errors**。而 `lib/` 在 `.gitignore:4`、入库 0 个文件。
   → **诊断 lint 前必须先有两面声明**：跑 `pnpm run lint`（已含 `typecheck:contracts-ready`）或先 `pnpm run typecheck`。直接裸跑 `lint:contracts-ready` 只在树上已有 `lib/types` 时才准。
2. **记账**：92 = **81** FP（不是 83）+ **11** 真实项（不是 9）。判据是诊断文字：`error`-typed 是冲突，`any`-typed 是真问题。修完 (F) 后真实项变 **16** —— 多出 5 条是**之前被 `error` 类型盖住的真问题**（(F) 相对任何抑制方案的净收益是**多报**，不是少报）。
3. **「`ctx as never` 是语义改动、勿 auto-strip」在实际 4 处均不成立**（旧票的警告是假设，未验证）。已逐条查证并全部安全删除：`ui-settings-models` ×2 的 `as never`（同文件另有 8 处未被报，因那些表达式是裸对象字面量，规则只报手里已有完整 `Context` 的这 2 处）；`tool-compute:170` 的 `as JsonValue[][]` 是 **auto-merge 残留**（仓库自己的 `next-session-2026-09-10-phase-c-integration.md:7` 有记），且 `util-values` 根本不在其 `package.json` 里；`ui-user-questions:61` 的 `as ISessions` **本来就是为绕开这个 bug 才写的**。
4. **oxlint 侧无旋钮，四条都已证伪，勿重试**：`oxlint --tsconfig` 对 type-aware **无效**（官方文档明写不生效，且该 flag 计划废弃，[oxc#20328](https://github.com/oxc-project/oxc/issues/20328)）；`.oxlintrc.json` **无** tsconfig 键（`OxlintOptions` 仅 6 个）；tsgolint 自己的 `--tsconfig` **存在但 oxlint 不透传**；tsgolint **不跟随 `references`**（root solution → `linted 0 files`）。上游立场是 WAI（[tsgolint#817](https://github.com/oxc-project/tsgolint/issues/817)/[#845](https://github.com/oxc-project/tsgolint/issues/845)/[#852](https://github.com/oxc-project/tsgolint/issues/852) 皆 closed not-planned）。
5. **`(C)` 与 `(B)` 都作废**，别再回头考虑（(C) 的前置「撞上游能力边界」经查不成立）。
6. **新代价（知情接受）**：`tsconfig.base.client.json` 同时被 tsserver 读，所以 **client 面** IDE 跨包跳定义落 `.d.ts`、fresh clone 未 build 时 client 包在编辑器里报未解析。host 面不受影响。

## 四、⚠ 铁律（eval 永续版，含本 session 修正）

- `mcp__local__*` only（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）；`mcp__local__grep` 不可靠 → 用 `mcp__local__bash` 里的 `grep -rEn`；`rg` / `grep -P` / `cat -A` 不存在（BSD 工具链）。
- node v24 强制：`export PATH="/usr/local/bin:$PATH"`（v24.15.0；v25 crash tsdown）。
- shell 是 `sh` 非 bash（无 `<(...)`）。**commit message 用 `mcp__local__write_file` 写文件再 `git commit -F`** —— 本 session 踩过：`node -e '...'` 里只要有一个撇号（`projects' src/`）就会截断 sh 的单引号串。
- **resync 树** `/Users/mckenzie/workspace/dsh-resync`（tip **`5fe9b32e44`**，unpushed，**无 eval**）：并行 subagent + apply 全安全。branch `upstream/resync-2026-09-08` local-only。它是 master 的 **linked worktree**，index.lock 真实路径 = `/Users/mckenzie/workspace/deepseek-harness-da/.git/worktrees/dsh-resync/index.lock`。
- **master 树** `/Users/mckenzie/workspace/deepseek-harness-da`（**eval 永续**，tip 随 eval 前移——本 session 落 doc commit `791173732f`）：任何 git 写前核 `[ -f .git/index.lock ]`（locked → 跳过等下一刻，勿阻塞勿 force）；doc/ticket commit 低风险可做；**merge/push 永久 defer**。
  ⚠ master 上有 **2 个 `wayfinder/evaluation/` untracked 文件不是你的**（`research/harness-measurement-validity-papers.md`、`tickets/R8b-judge-readout-papers.md`）→ **永远 `git add <显式路径>`，绝不 `git add -A`**。
- 多行/复杂改动优先**带断言的 node byte-splice**（按行号从**底向上**改）。本 session 每处 splice 都先断言 anchor 出现次数 == 1，`map.md` 还额外断言 U+FFFD 计数（13 处）前后不变。
- `map.md` 含 U+FFFD → **只能 byte-splice**（`readFileSync` Buffer + `indexOf` + `Buffer.concat`，全程不把整文件转 string），禁 `edit_file`；ticket `.md` 追加用 `cat >> ` + quoted heredoc（`<<'EOF'`）。
- 不碰 `.worktrees/`（`r10-harness-goodhart` / `t1-exec-grader`）+ `wayfinder/evaluation/`。
- **不 push**（resync + master 皆 local）。
- 顺手改了源码就核生成文档：本 session 因 `tool-compute` 删一个 type-only import 导致 `docs/architecture-graph.md` stale（diff 恰好一行）。regen 用 `pnpm run gen-architecture-graph`，验用 `verify-architecture-graph` / `verify-module-graph` / `verify-doc-graphs` / `verify-cordis-catalog` / `verify-md-links`。
- `verify-translation-pairing` **全量仍 EXIT 1**（`README.zh.md` 的 wrong-locale link），属 A 类 pre-existing 翻译债（归 parallel-dev-cleanup/R1），不是你弄坏的；`--write` 仍绝不裸跑/绝不 `--all`。

## 五、估算

| 终点 | 估算 |
|---|---|
| UM-LINT 线 | **✅ 已收口**（gate 0 errors / 0 warnings） |
| UM-LINT-B（56 unmatched，含 durable 防线） | ~1 session（HITL 拍板为主） |
| master-sync + push | **永久 defer**（eval 永续 → 撞 git 写；须 eval 能暂停） |
| UM 专项其余 | ~9-13 session（多需 HITL 决策） |
