# UM-DATA-SRC-DTS-POLLUTION — 84 个生成物写进了 `packages/data/*/src/`，把 full lint 从 93 抬到 1980

**Type**: grilling · **Status**: **RESOLVED**（2026-09-10，commit `6514ade8fc`） · **Phase**: upstream-merge
**Assignee**: —（已收口）
**Blocked by**: —
**Blocks**: ~~[UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md)~~ → **已解除阻塞**：1887 条噪音已全清，`93 errors + 1 warning` 是稳定的无污染基线
**Graduated from**: [UM10](UM10-verify-typecheck-lint-ci-gates.md) Resolution（2026-09-10 线 A 实测）

## Question

`packages/data/{audit,evidence-query,semantic-layer}/src/` 下有 **84 个 untracked 文件**（`*.d.ts` / `*.d.ts.map` / `*.js` / `*.js.map`），是编译产物**写进了源码目录**。它们让 `pnpm run lint` 从 93 errors 变成 **1980 errors**（多出的 1887 条全是在 lint 这些生成物自身，例如 `semantic-layer/src/types.d.ts` 一个文件 391 条 `no-unnecessary-type-arguments`）。

**要决的是根因归属和处置**，不是简单加一行 gitignore：

1. **谁写的？** 正常构建走 `outDir: lib/types`（见各包 `tsconfig.json`）——没有构建步骤应该往 `src/` 写 `.d.ts`。这更像某次 `tsc` 漏了 `--outDir` 或某个脚本配置错误留下的事故残留。**先定位产出者**，否则 gitignore 只是把复发藏起来。
2. **处置**：(a) 找到并修产出者 + 删掉这 84 个文件；(b) 只加 `.gitignore`（治症不治因，且 lint 仍会扫到——lint 不看 gitignore 的话）；(c) 把 lint 的 ignore 列表加上 `packages/*/*/src/**/*.d.ts`。
3. **是否影响别的门？** 已验：不影响 static gate（见下）。但 `verify-package-paths` / catalog 类 gate 会扫 `src/`，未来复发可能误报。

## 证据基线（UM10 2026-09-10 实测，勿重导）

- **量化影响**：移开 84 个文件 → full lint `1980 → 93`。1887 条噪音，全部落在这 3 个包的 `src/*.d.ts`。Top offender：`semantic-layer/src/types.d.ts` 391 条、`semantic-layer/src/index.d.ts` 251 条、`audit/src/store.d.ts` 93 条。
- **对 static gate 无影响（已控制变量）**：`check:ci:static` 在「artifacts 在场」与「artifacts 移开」两种状态各跑一次完整 45 门 —— **都是 19 passed/26 failed，且失败集合 `comm` 比对完全一致**。所以它们不是任何 static gate 失败的原因。
- **CI 不受影响**：CI 是 fresh checkout，这些 untracked 文件不存在 → CI 的 lint 数字是 93，不是 1980。这是**本地开发体验**问题 + 复发风险，不是 CI 阻塞。
- 当前状态：已还原到 prompt 记录的 84-untracked 状态（UM10 session 跑完后 restore）。备份在 `/tmp/um10-artifact-stash/`（临时目录，勿依赖）。

## Resolution — **RESOLVED**（2026-09-10，commit `6514ade8fc`，用户选「全面清理」）

### 票据的首要嫌疑被证伪，这改变了修法

票里写「更像某次 `tsc` 漏了 `--outDir` 或某个脚本配置错误」。**前半对，后半错**：

- **37 个 `packages/data/*` tsconfig 全部同构** —— `extends ../../../tsconfig.base.json`、`rootDir: "src"`、`outDir: "lib/types"`、零本地覆盖。**没有配置分歧可修**。
- **没有任何仓库脚本会往 `src/` 写**：`scripts/ts-project.ts:71-79` 硬设 `noEmit: true`；`doc-typecheck.ts` 的 tempTsconfig extends `tsconfig.host.json`（`noEmit`），非 standalone 路径还装了个会 throw 的 `writeFile()`；`verify-node-next-types` 显式 `noEmit`；typert generator 从不调 `program.emit()`；根 `tsdown.config.ts:28` 是 `dts: false`。
- **产出者 = 某次人/agent 手发的 `tsc`，其 emit root 落到了各包自己的 `src/`。**

**取证链**（是本票最硬的部分）：`src/index.d.ts` 与 `lib/types/index.d.ts` **逐字节相同**，唯一差别在 `.d.ts.map` 的 `sources` 字段（`src/` 副本写 `"index.ts"`，`lib/types/` 副本写 `"../../src/index.ts"`）—— **复制操作改不了这个字段**，所以那是第二次真实 emit。发射器指纹是**裸 `tsc`**（未改写的 specifier 保持单引号 `from 'node:crypto'`，被改写的重印成双引号 `from "./schema.js"`，即 `rewriteRelativeImportExtensions: true` 的签名；而 `tsconfig.host.json`/`client.json` 都把它设为 `false` 且 `noEmit`，故非这两个 program）。88 个产物**共享同一 mtime `2026-09-09T17:29:48`**，全树 `find -newermt` 扫 17:25–17:35 只返回这些 —— **单次命令**。emit 集合是 `evidence-query → semantic-layer → audit → identity` 的**模块图闭包**（这解释了为什么 `invariant.ts` 没被 emit：没人 import 它），而非 `include: ["src"]` 的目录展开。

### 为什么「只加 gitignore」是有害的，不只是不彻底

**已实测**（oxlint 1.76.0，三臂对照探针）：oxlint **确实读 `.gitignore`**，且 `--no-ignore` **无法覆盖**它。所以 (b) 真的能把 lint 噪音压下去 —— 这正是问题所在。**这事已经发生 3 次，前两次都是用 gitignore 盖掉的**：

| 次 | 位置 | 后果 |
|---|---|---|
| 1 | `packages/credentials/credentials/src/*` | `.gitignore:52-60` 盖掉；该目录今已干净 → **死规则** |
| 2 | `packages/identity/identity/src/*` | 同一块 gitignore 盖掉 → **4 个产物一直活着，两天没人发现** |
| 3 | `packages/data/{audit,evidence-query,semantic-layer}/src/*` | 84 个，untracked 所以 `git status` 吵 → **被发现了** |
| — | `packages/data/scope-registry/src/*` | **已 commit 进 git**；且 `30aedf0d58` 把生成的 `.d.ts` 当源码手改（给它加 JSDoc）以过 `verify-export-jsdoc` 门 |

第 3 次之所以被发现，**恰恰因为它没被 gitignore**。

### 落地（按实测顺序，每步都量）

| 步 | 动作 | 实测 |
|---|---|---|
| 1 | 删 84 个 untracked 产物（`lib/types/` 有逐字节相同副本，`build:lib:host` 可重生成，零损失） | lint **1980 → 93 errors + 1 warning**，与 UM10 基线**精确吻合** |
| 2 | 删 identity 的 4 个活产物 + **移除 `.gitignore:52-60` 整块**（credentials 那半已是死规则）。**故意不为新位置加 gitignore** —— `git status` 必须保持吵闹 | — |
| 3 | `git rm` scope-registry 的 4 个**已提交**产物 | `verify-export-jsdoc` **仍恰好 3 violations，且无一在 scope-registry** → `30aedf0d58` 手加的 JSDoc 与真源码冗余，删除不破门。lint **仍 93** → 该已提交产物贡献 **0** errors |
| 4 | `.oxlintrc.json` 加 `packages/*/*/src/**/*.d.ts` 作复发护栏 | lint **仍 93**，但文件数 **3869 → 3818** —— 排除的正是 S1 数出的 **51 个合法 ambient `.d.ts`**（`css-modules`/`ripgrep` 等），而它们贡献 **0** errors → **护栏不吞任何真信号** |

**S1 报告里唯一最重要的未验证项已经settled**：它写「若 (c) 后降幅为 0，则 93 全是真 `.ts` 发现，无需再做」。**降幅确实是 0。**

### 交付

- **`93 errors + 1 warning` 是现在稳定、无产物污染的基线**，交给 [UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md)（本票 `Blocks` 的那张，现已解除阻塞）。
- **resync 工作树首次变成 `git status` 完全干净（0 行）** —— 此前多个 session 一直带着 84 个 untracked。
- 顺带记一笔给 UM12：`verify-export-jsdoc` 现在的 3 条是 `createFixtureConnectionRpc`（`client/connection/src/client/fixture.ts:3959`）和 `parseNumericCell`（×2，`client/ui-present-table/src/client/numeric.ts:8`）—— **不是** UM12 表里记的 `fadeIn` @param，那条记录已过时。

### 未做（另开票）

**复发护栏只挡了 lint，没挡住 gate。** S1 建议扩 `scripts/verify-package-paths.ts`（它已在走 `packages/**/*.ts` 且已在 `:33` 认得 `.d.ts`），让「`src/` 下出现与 `X.ts` 同名的 `X.d.ts`/`X.js`」直接致红。该启发式对本票全部 4 次发生都命中，且对全仓 55 个 tracked `.d.ts` **零误报**（唯一命中的就是 scope-registry 那个真产物）。这条归 [UM15](UM15-durable-upstream-sync-method.md) 的 meta-gate 片（用户已选它作首片）。

另：`.oxlintrc.staged.json`（只被 `lint:fix:contracts-ready` 用）有自己一份 `ignorePatterns` 字面拷贝，未同步 —— 不影响 `pnpm run lint`，但属同类漂移，值得 UM15 的 coverage manifest 收编。

## 关联

prompt 的 Deferred 列表里原记为「**untracked tsdown**（84 files，pre-existing）：gitignore follow-up」——UM10 实测把它从「顺手加个 ignore」升级为「有量化影响、需定位产出者」的一张票。
