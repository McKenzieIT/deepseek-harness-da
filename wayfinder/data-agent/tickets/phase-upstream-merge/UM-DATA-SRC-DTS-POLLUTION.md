# UM-DATA-SRC-DTS-POLLUTION — 84 个生成物写进了 `packages/data/*/src/`，把 full lint 从 93 抬到 1980

**Type**: grilling · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（可立即认领）
**Blocks**: [UM-LINT-TYPEAWARE-CORDIS](UM-LINT-TYPEAWARE-CORDIS-false-positives.md)（不先清掉这 1887 条噪音，那票的 93 条真实信号读不出来）
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

## 关联

prompt 的 Deferred 列表里原记为「**untracked tsdown**（84 files，pre-existing）：gitignore follow-up」——UM10 实测把它从「顺手加个 ignore」升级为「有量化影响、需定位产出者」的一张票。
