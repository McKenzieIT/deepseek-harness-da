# UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS — eval-cli 的 6 个 spec 无 tsconfig 归属：待 eval 团队确认 3 问后加 `tsconfig.tests.json`

**Type**: apply（方案已定，卡在组织协调） · **Status**: **blocked**（等 eval 团队回答下面 3 问；技术方案与证据已备齐，无需重新诊断） · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: **eval 团队确认**（本票唯一阻塞项；read-only agent 无法代替 —— 见 [待确认的 3 问](#待确认的-3-问逐字承接-lint-bjsonevalcliackstatushowtoobtain)）
**Blocks**: `scripts/run-oxlint.ts` 里 `EVAL_CLI_PENDING_FIX` allowlist 的删除 —— 删掉它，UM-LINT-B 的 program-coverage 防线才是**无豁免全绿**
**Graduated from**: [UM-LINT-B](UM-LINT-B-UNMATCHED-PROGRAMS.md) —— 2026-09-14 落地 eval-independent 余量（Bucket ii WAIVE 34 + Bucket iii KEEP 15 + durable gate）时，Bucket i 的 eval-cli ×6 因需 eval 团队协调而拆出本票

## Question

`packages/eval/eval-cli/tests/` 下 6 个 spec 不被任何 tsconfig 认领，落进 tsgolint 的 option-less inferred program。它们**同时落在** `.oxlintrc.json` `overrides[0].files` 的严格 type-aware override 内 —— 也就是说：严格规则集**照样对它们跑**，但类型全部解析自一个没有 `paths`、没有 `types`、没有 `strict` 的错误 program。门是绿的，type-aware 那一半什么也没查。这是 UM-LINT-B 全部 55 个 unmatched 文件里**唯一**的真·静默漏检类（另外 49 个都在严格 override 之外，只吃默认规则，已在 UM-LINT-B 判 WAIVE/KEEP 落定）。

技术解法已定（下面 [落地方案](#落地方案sub-option-b已定不需重新设计)，sub-option b，沿用仓库既有的 per-package 双面模式）。**本票不是技术问题，是组织协调问题**：`packages/eval/eval-cli` 是 eval 机器本身的一部分，而 master 树上 eval **永续运行**，改它的 tsconfig / build 形状不能自助。

## 已测证据（勿重导）

根因定位到具体两行，**两头都不认**（2026-09-14 在 `2886e5b8e5` 复验，行号现行有效）：

| 位置 | 内容 | 后果 |
|---|---|---|
| `tsconfig.host.json:109` | `"packages/*/*/tests/**/*.ts"`（include） | 全仓**其它**包的 tests 都由 host/client 聚合兜住（已抽样验证） |
| `tsconfig.host.json:131` | `"packages/eval/eval-cli/**"`（exclude，**整包排除**） | host 侧放弃了 eval-cli 的 tests |
| `packages/eval/eval-cli/tsconfig.json:7` | `include: ["src"]` | 包侧也不认 tests |

实证：`Got tsconfig for file packages/eval/eval-cli/tests/main.spec.ts: <none>`

6 个文件（= `scripts/run-oxlint.ts` 的 `EVAL_CLI_PENDING_FIX` 逐字同集）：

```
packages/eval/eval-cli/tests/cli-llm-config.spec.ts
packages/eval/eval-cli/tests/compare.spec.ts
packages/eval/eval-cli/tests/harness-responder.spec.ts
packages/eval/eval-cli/tests/main.spec.ts
packages/eval/eval-cli/tests/report.spec.ts
packages/eval/eval-cli/tests/scope-id.spec.ts
```

复现命令（read-only，任何树上安全）：

```sh
export PATH="/usr/local/bin:$PATH"; cd /Users/mckenzie/workspace/deepseek-harness-da
OXC_LOG=debug node node_modules/oxlint/bin/oxlint . 2>&1 | grep -a 'Unmatched file:'
```

已验的两条边界条件（勿重导）：

- **9+9 双面模式为真**：`packages/` 下恰有 9 个 per-package `tsconfig.host.json` + 9 个 `tsconfig.client.json`（api/gateway、api/remotes、api/session-controller、api/workspace-controller、api/workspace-files、client/connection、client/file-upload、experimental/inspector、session-query/session-log-export）。naive `find` 会多报 2 host + 1 client，那 3 个是 `packages/typert/generator/tests/fixtures/` 下的 **generator 输入 fixture**，不是本模式。
- **「包自己认领 tests」目前不是既有模式**：抽查全仓 tsconfig.json 全是 `include: ["src"]`。所以 sub-option (d) 会开先例，已否。

## 待确认的 3 问（逐字承接 `lint-b.json.evalCliAckStatus.howToObtain`）

**协调时机**：在任何 Bucket i eval-cli apply session 的**开头**问、**动 tsconfig 之前**问，不要边改边问。

> (1) WHY does tsconfig.host.json:131 exclude the whole `packages/eval/eval-cli/**` package? (likely deliberate, tied to the eval machine build) — is it safe to add a SIBLING tsconfig.tests.json referenced from tsconfig.host.json:250 WITHOUT lifting the package-wide exclude?

> (2) The tests tsconfig shape — rootDir/outDir/composite/noEmit: does it need to emit (composite, for `tsc -b` graph integrity) or type-check-only (noEmit)? The 9-package two-face pattern (e.g. packages/api/gateway/tsconfig.host.json: rootDir/outDir/tsBuildInfoFile + files + references) emits; does eval-cli tests need the same, or noEmit?

> (3) Does adding the tests program perturb the perpetually-running eval machine's build/typecheck? The ack unblocks Bucket i eval-cli x6 (sub-option b) AND removal of the durable gate's eval-cli allowlist entry.

## 落地方案（sub-option b，已定，不需重新设计）

逐字承接 `lint-b.json.evalCliAckStatus.ifAckedPlan`：

> Sub-option b (CLEANEST, matches the verified 9+9 per-package two-face pattern): (1) Create packages/eval/eval-cli/tsconfig.tests.json — extends ../../../tsconfig.base.json; include:["tests"] (or files:[<the 6 specs>]); rootDir:"tests"; outDir e.g. "lib/types-tests" OR noEmit (eval team confirms); tsBuildInfoFile per the gateway pattern; references = [{path:"./tsconfig.json"} (the src program) + the dep refs already listed in packages/eval/eval-cli/tsconfig.json (../eval, ../eval-runner, ../../llm/llm, etc.)]. (2) Add `{ "path": "./packages/eval/eval-cli/tsconfig.tests.json" }` to tsconfig.host.json references, adjacent to the existing `{ "path": "./packages/eval/eval-cli" }` at tsconfig.host.json:250. (3) The host EXCLUDE `packages/eval/eval-cli/**` (tsconfig.host.json:131) applies only to host's OWN include program, NOT to referenced sub-projects, so the tests sub-project builds independently — no need to lift the exclude. After landing, the 6 spec files resolve to a real type-aware program (was <none>), and the durable gate's EVAL_CLI_PENDING_FIX allowlist entry is removed -> full GREEN.

已否的三条备选（勿重议）：

- **(a)** 把 `"packages/eval/eval-cli/**"` 从 `tsconfig.host.json:131` 摘掉 —— 最小 diff 但**风险最高**：那条整包排除大概率是刻意的（绑 eval 机器 build），不查清成因不能盲改。
- **(c)** 把 `packages/eval/eval-cli/tests/**` 加进 `.oxlintrc.json` ignorePatterns —— 诚实地承认不查，成本最低，但放弃这 6 个文件的 type-aware 覆盖。
- **(d)** eval-cli 自己的 tsconfig 改 `include: ["src","tests"]` —— 开「包自己认领 tests」先例（全仓无一例），并牵连 `outDir`/`rootDir`/composite。

## 收口清单（ack 到手后）

1. 按 sub-option b 建 `packages/eval/eval-cli/tsconfig.tests.json`，形状按第 (2) 问的回答定 emit / noEmit。
2. 在 `tsconfig.host.json:250` 旁加 `{ "path": "./packages/eval/eval-cli/tsconfig.tests.json" }`。
3. 复验 `OXC_LOG=debug oxlint .`：unmatched 55 → 49，且 6 个 spec 的 `Got tsconfig for file …` 不再是 `<none>`。
4. **删掉 `scripts/run-oxlint.ts` 的 `EVAL_CLI_PENDING_FIX`**（连同 `assertNoStrictOverrideUnmatched` 里对它的过滤），并把 `scripts/oxlint-contract.spec.ts` 的 `EVAL_CLI_PENDING_FIX` 断言一并摘掉 —— 防线转为**无豁免全绿**。
5. 更新 [UM-LINT-B](UM-LINT-B-UNMATCHED-PROGRAMS.md)：Bucket i 收口，本票关闭。

## ⚠ 执行注意

- **eval 机器永续运行**：诊断（read-only 复现）在任何树上安全；**apply 必须先协调**。
- 本票拆出前，UM-LINT-B 的 durable gate 已带 `EVAL_CLI_PENDING_FIX` allowlist 落地（KNOWN-RED 记账）：防线**现在就是绿的**，并且第 7 个未认领的严格 override 文件会立刻让它红。也就是说 —— 本票拖着不做**不会**让 A 类无声重新长出来，但会一直留着这 6 个文件的 type-aware 空洞。

---

## [2026-09-20] RESOLVED — sub-option b 落地，防线转无豁免全绿

**Status: closed**

### Eval-team ack 内容（来自另一 session）

1. **Q1**（保留整包 exclude + 加 sibling）：✅ 安全。历史表明 exclude 是临时 typecheck 绿灯措施（`b63dfe6826` 2026-08-31 + `ec7ee34f07` 2026-09-04），不是 eval 运行时隔离。TypeScript exclude 只影响当前项目文件发现，不过滤显式 references。
2. **Q2**（emit vs noEmit）：**必须 composite declaration-only emit**。TS6310 禁止 referenced project 用 noEmit。outDir 用 `lib/tests/types`（满足 `clean.ts:135-144` 的 outDir 末段必须是 `types` 的约束）。`rewriteRelativeImportExtensions: false` 避免 TS2878。
3. **Q3**（扰动 eval 机器）：不会改变运行路径。只给 Host build/typecheck 增加一个独立、增量、声明输出的测试检查节点。

### 落地

| 改动 | 文件 |
|---|---|
| 新建 `tsconfig.tests.json` | `packages/eval/eval-cli/tsconfig.tests.json`（extends base, rootDir tests, outDir lib/tests/types, emitDeclarationOnly, rewriteRelativeImportExtensions false, include tests, references src + 24 deps）|
| 加 reference | `tsconfig.host.json:251`（紧接 eval-cli src reference）|
| 删 EVAL_CLI_PENDING_FIX | `scripts/run-oxlint.ts`：删 export + JSDoc + filter |
| 删对应断言 | `scripts/oxlint-contract.spec.ts`：删 import + toHaveLength(6) + for-of assertion |

### 验证

- `OXC_LOG=debug oxlint .` unmatched: **55 → 49**（6 eval-cli tests 不再 unmatched）
- 6 spec 文件全部 `Got tsconfig for file ...: tsconfig.tests.json`（不再是 `<none>`）
- `tsc -b packages/eval/eval-cli/tsconfig.tests.json` exit 0（产物 `lib/tests/types/` + `tsconfig.tests.tsbuildinfo`）
- `tsc -b tsconfig.host.json` exit 0（整体 host build 无回归）
- `oxlint-contract.spec.ts` 16/16 pass（updated counts: waive 34 + keep 15 = 49 unmatched）

### 意义

UM-LINT-B 的 `EVAL_CLI_PENDING_FIX` allowlist 是**唯一的豁免**。删掉它后，`assertNoStrictOverrideUnmatched` 防线变为**无豁免全绿**：任何新增的严格 override 下未归属文件会立刻让门红，不再有任何 allowlist 可以藏。
