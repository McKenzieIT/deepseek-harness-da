# UM-LINT-TYPEAWARE-CORDIS — full oxlint（typeAware）对 Cordis service handle 报 93 条 `error`-typed 假阳性

**Type**: grilling · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（可立即认领）
**Blocks**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md)（`check:ci:lint:contracts-ready` 是 CI gate，本票不决则该门无法判绿）
**Graduated from**: [UM10](UM10-verify-typecheck-lint-ci-gates.md) Resolution（2026-09-10 线 A 实测）

## Question

`pnpm run lint`（`.oxlintrc.json`，`typeAware: true`）在 resync base 上报 **93 errors + 1 warning**，其中主体是 `no-unsafe-call` / `no-unsafe-member-access` / `no-unsafe-assignment` / `no-unsafe-argument` / `no-unsafe-return`，诊断文字统一是 "of an **`error` typed** value"——即 oxlint 的 type-aware 解析器**解不出 Cordis 注入的 service handle 类型**，退化成 `error` 类型后把每处使用都判为 unsafe。而 `tsc -b tsconfig.client.json --force` = **0 errors**，即 TypeScript 本身认为这些类型完全正常。

**要决的是：这门 gate 怎么算过。** 三个候选，需选一个并说明取舍：

- **(A) 修 oxlint 的解析**——找出 oxlint 为何解不出（`tsconfig.base.client.json` 的 `paths` 指向 `lib/types` vs `src`？project reference 未被 oxlint 跟随？Typert 生成的 `.d.ts` augmentation 不可见？），从配置层让它和 tsc 看到同一份类型。最干净但可能撞 oxlint 上游能力边界。
- **(B) 作用域化 disable**——按仓库既有先例加注释豁免。先例已存在：`packages/eval/eval-cli/tests/compare.spec.ts:1` 写着 `/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-assignment -- node:fs not resolved by oxlint here (tsc passes). */`。代价：93 条散落在 ~19 个文件，逐个加注释是噪音，且会掩盖未来真实的 unsafe。
- **(C) 关掉这组规则的 typeAware 或整门接受红**——把 `no-unsafe-*` 从 typeAware 集合移除，或把本门记为 known-red 并写进 GA-FORK-CI 总账。代价：真丢掉一类真实检查。

## 证据基线（UM10 2026-09-10 实测，勿重导）

- **93 是 CI-faithful 数字**。此前 full lint 报 **1980** errors，其中 **1887 条是「关于」84 个 untracked 生成物自身**（`packages/data/{audit,evidence-query,semantic-layer}/src/*.d.ts`）。CI 是 fresh checkout，没有这些文件 → 93。见 [UM-DATA-SRC-DTS-POLLUTION](UM-DATA-SRC-DTS-POLLUTION.md)。
- **规则分布**（93 条，非生成物）：`no-unsafe-call` 35 / `no-unsafe-member-access` 23 / `no-unsafe-assignment` 15 / `no-unsafe-argument` 6 / `no-unnecessary-type-assertion` 5 / `no-unsafe-return` 4 / `@stylistic(max-len)` 2 / `unbound-method` 1 / `no-unnecessary-condition` 1 / `no-deprecated` 1。
- **pre-existing 已证**：71/93 落在 Phase-2 从未碰过的文件。余 22 条在 4 个 touched 文件，但规则+形状与 untouched 文件同类——未被碰过的 `ui-chat/src/client/apply.ts` 同一模式报 18 条（`ctx.sessions.binding(sessionId)` → `error` typed）。
- **触发形状**：`sessions.list.subscribe()` / `sessions.list.getSnapshot()` / `ctx.sessions.binding()` —— 都是经 Cordis `inject` 拿到的 service/store handle（Phase-2 把 store 迁到 `dsh-client-store` 的 `defineStore`/`EngineStoreHandle`）。
- **已知的 5 条 `no-unnecessary-type-assertion`** 含 prompt 早先点名的 2 条 pre-existing（`ui-settings-models/tests/components.client.spec.tsx:203` 的 `ctx as never` + `provider-form:155`）；移除 `as never` 是语义改动，需谨慎，不要顺手改。

## 判据

`typeAware: false` 的 `.oxlintrc.staged.json`（lefthook staged gate）**不受影响**——staged lint 实测 0 errors 0 warnings。所以这纯粹是 full/CI 门的问题，不阻塞日常提交。


## Session progress — 2026-09-11（S-LINT wrong-tree；92 reproduce on resync，re-triage on resync 待做）

- **⚠ S-LINT 的 "0 on master" 是 wrong-tree artifact**：S-LINT 跑 `node node_modules/oxlint/bin/oxlint . --type-aware` on **master** `fc917a55d4`（pre-merge，ahead 3/behind 2773，不含 post-merge 内容）→ 0 findings。但 UM-LINT 的 93 是在 **post-merge 树**（resync/origin）测的。S-LINT 亦可能 config-less（未用 repo `run-oxlint.ts` wrapper）。
- **resync 重测 = 92 errors**：`pnpm run lint:contracts-ready`（= `tsx scripts/run-oxlint.ts .` w/ repo 真 config `.oxlintrc.json`）on resync = **"Found 0 warnings and 92 errors"**（exit 1，34.8s on 3813 files / 90 rules）。≈ ticket 的 93（1 差可能 zombie-deletion `bcf4776f1d` 清掉一条）。
- **option-A 未在 resync 落地**：`ctx as never` 仍在 `packages/client/ui-settings-models/tests/components.client.spec.tsx:203:9` + `provider-form.client.spec.tsx:155:9`（store→EngineStoreHandle migration 没把 type-aware resolution 修好——S-LINT 说 master 上 "migration appears to have landed" 是 master 不同代码的误读）。
- **dominant rules**（从 ticket + resync 92 推算）：`no-unsafe-call`~35 / `no-unsafe-member-access`~23 / `no-unsafe-assignment`~15 / `no-unsafe-argument`~6 / `no-unnecessary-type-assertion`~5 / `no-unsafe-return`~4 / `@stylistic/max-len`~2 / `unbound-method`/`no-unnecessary-condition`/`no-deprecated` 各 1。85/92 是 Cordis `no-unsafe-*` family（type-aware，inject'd service-handle types）。
- **S-LINT `/tmp/slint-triage.md` 提供**（若 /tmp 持久）：disable-directive form `// eslint-disable-next-line typescript/<rule> -- <reason>`（repo 认 `packages/host/apiproxy/src/api-proxy.ts:3364`；file-level `/* eslint-disable */` for clustered）+ dominant rules。但 **无 valid per-finding triage**（S-LINT saw 0 wrong-tree）。S-LINT 亦证 `pnpm run lint` = `build:lib:host && lint:contracts-ready`（build 写 lib/.tsbuildinfo = read-only 违规），且 build **非 load-bearing**——`tsconfig.base.json` paths 指 `./src`（如 `@deepseek-ai/cordis`→`./vendor/cordis/src`），oxlint 从源码解析类型，不从 built lib。
- **re-triage plan**：重派 subagent on resync：`cd /Users/mckenzie/workspace/dsh-resync && pnpm run lint:contracts-ready > /tmp/lint.txt 2>&1` 拿 92，逐条 FP/real（FP 给 disable-directive 精确行+理由，real 归修复票）。⚠ `ctx as never`（`no-unnecessary-type-assertion`）= **语义改动，勿 auto-strip**（ticket 警告）；`max-len` 机械 wrap；`no-deprecated` 需 API migration。主 session apply disable-directives（resync，typecheck/lint 复验，commit `[wayfinder] UM-LINT-TYPEAWARE-CORDIS: triage 92 findings`）。
