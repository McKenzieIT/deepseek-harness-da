# Next session — 2026-09-15：UM15 首片落地 + UM12 余下门（L6/L7）+ 两条决策

> **前情**：2026-09-14 第二轮 Phase C（3 subagent 并行 + 主 session 串行落地）。resync `a469c899bd` → **`bcf4776f1d`**（3 commit：`4b7e15e920` L8 doc graphs、`4d6bb8be8b` L4 cordis inspect catalog、`bcf4776f1d` 僵尸包删除）。`check:ci:static` **27/18 → 31/14**，`comm` 比对**零新增失败**，4 门翻绿。master `7a5ce924cc` → 本轮 wayfinder 文档 commit。详情见 [UM-flow-2026-09-08](../tickets/phase-upstream-merge/UM-flow-2026-09-08.md) 末段、[UM12](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md)、[UM-MERGE-INTEGRITY](../tickets/phase-upstream-merge/UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)、[UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) Resolution。

## 铁律（违反必返工）

1. **一律用 `mcp__local__*` 工具**（built-in Read/Write/Edit/Bash/Grep/Glob 全 BLOCKED）。工作目录路径都在 `/Users/mckenzie/workspace/...`。
2. **每条 bash 前置 `export PATH="/usr/local/bin:$PATH"`**，确认 `node -v` = **v24.15.0**（系统默认 v25.9.0 会 crash tsdown/rolldown/fs-ext）。
3. shell 是 **sh 不是 bash**：不支持 `<(...)` 进程替换，用临时文件 + `sort`/`comm`。`rg` 不存在，用 `grep -rEn`。
4. **不要轻信票据里记的「已 verified」**——本 effort 已四次发现记录错误（最新：`558e6f4f66` 被记为 fork parent，实为 merge#1 后代；真 fork parent = `65bf3cddc9`）。凡你要用的结论自己重跑。
5. **resync 树（`/Users/mckenzie/workspace/dsh-resync`）跑代码**；**master 树（`/Users/mckenzie/workspace/deepseek-harness-da`）跑 wayfinder 文档**。两个 worktree，别混。
6. **`~/.gitconfig core.symlinks=false`** 让 tracked symlink 落成路径文本小文件——每次新 checkout 必查必修（修法不产生 tracked 改动，别 commit）。
7. ⚠ **`pnpm run gen-tsconfig-paths` 会把 `tsconfig.base.json` 写成无效 JSON**（fork 的 `"@deepseek-ai/dsh-*"` 通配块在生成区之后，生成器不写尾逗号；TS 自己的 parser 复核：regen 后 `',' expected.`）。**别盲目跑它**。要修 `tsconfig paths` 门先读 [`UM12`](../tickets/phase-upstream-merge/UM12-post-merge-ga-fork-ci-resweep.md) 的「新发现的两个陷阱」。
8. **split-brain 警告**：`mcp__local__*` 工具跑在用户 Mac 上，**够不着 runner 侧 `/tmp/claude-*/.../tasks/*.output` transcript**。派 subagent 持久化长交付时，让 subagent 自己用 `mcp__local__write_file` 直接写盘（它自己上下文里有 verbatim 内容），**别让 subagent 去读 runner transcript**——会失败并拒绝编造。

## 三条线的现状

### ① UM-MERGE-INTEGRITY — 两方向已穷举；方向 B 已落；方向 A = 改文档；⚠ 整包回退是新发现

- **方向 B（复活 upstream 已删包）**：M1 复活 100 条 / M2 为 0，活 25 条 5 组。**2 组已删**（`bcf4776f1d`）；2 组（`knip.json` + `connection/tests/fake-api.client.ts`）零门收益有意 defer；1 组（`ui-settings-models/src/invariant.ts` 对）keep/defer。
- **方向 A（丢 upstream 文件）**：文件级恰好 2 条（`slot-contract.ts`/`operations.ts`），全归 M1，判误丢（~95%）。**但 blob 级发现 M1 把整个 `ui-settings-models` 包回退到 merge-base（≈30 文件）**，`git diff-tree --cc` 看不见，`tsc` 全绿。**修法 = 改文档不恢复文件**（20/27 个回退文件已同时偏离 base 与 upstream，恢复 = 真特性 merge）。`README{,.zh}.md:37` 的 "Extension slots" 段是 upstream 为 fork 没有的特性写的 → 删/改该段。
- **硬阻塞 UM11**：可解除到「已知且已量化」，但 **PR 描述必须写明整包回退**，否则仍是在有损 merge 上声称非回归。
- **下 session 该做**：① 落地 `knip.json` + `fake-api.client.ts` 的独立 commit（需改 `scripts/rescope-fork.ts:263-264` + `rescope-fork.spec.ts:132-137`）② 新票：`ui-settings-models` 包 re-port（真特性 merge）。

### ② UM12 — pre-merge 基线已建；31/14；余 L6/L7/L9 + 2 决策

- **基线**：`65bf3cddc9`（真 fork parent）实测 **28/9**。18 门红 = **A6 真 pre-existing / B5 merge 期回归 / C7 随 upstream 新增的门**。推翻本票三条自记结论（`documentation standard tests` 是 C 不是 A；`package invariants` pre-merge 绿；`config catalog` 非 RC-Z 致红）。
- **L6 `application entrypoints`（10 条，1 文件 allowlist）**：删僵尸后已**解锁**（原 13→10，3 条僵尸消失，余 10 全 fork 自有）。UM12 有精确 patch。**本 session 可做**。
- **L7 `markdown links`（14 条，非 1）**：S1 只完整诊断了 `slot-contract.ts` 那条（= 删 `ui-settings-models/README{,.zh}.md:37` 的 "Extension slots" 段，保 i18n 配对）。余 13 条需逐条 triage（多数指向 upstream 已删的 `examples/`、已删 note、或 anchor 缺失）。
- **L9 `agent note format`（15 条）**：**风险最高，UM12 已建议 defer**——`proposed/simplification/` 目录已不存在（需重建），`proposed:` 语法额外要求 `## Proposal`/`## Acceptance criteria`/`## Risks` 三标题，未核，可能触发第二波。
- **2 决策**：① `tsconfig paths`：fork 保留 `"@deepseek-ai/dsh-*"` 通配 vs 采纳 upstream ~120 条显式 alias（且 gen-tsconfig-paths 无论选哪个都得先修不写尾逗号的 bug）。② 生成文档的翻译义务：补译 / 让生成器带上 zh / 把生成文档从配对哈希豁免。

### ③ UM15 — 首片方案已交但主体代码丢失；Decision 4 收口；7 grilling 收口 1

- **S2 交付丢失**：§1/§2/§3/§4.1–4.4（主体代码）在 split-brain 中丢；§6/§7/§8 + §4.5/§4.6 设计摘要已落盘 [`research/um15-first-slice-implementation-2026-09-14.md`](../research/um15-first-slice-implementation-2026-09-14.md)。
- **Decision 4 收口 = (b)**（§6 spike 证伪 (a)：`gen-architecture-graph` 不存在 upstream；`--rev` 不支持；`collectDeclaredDeps` 闭包捕获 root → 任何半吊子 `--rev` 产混血图）。
- **新增两条 durable-method 输入**：① 完整性门要**三道**（加「upstream 内容采纳检查」抓整包回退）② 两生成器翻译义务不一致。
- **`verify-architecture-graph` 本轮实测 GREEN** → §8 落地第 2 步（enroll 前确认绿）前提成立。

## 本 session 优先级

1. **UM15 首片落地**（主线）：重派 S2（或新 subagent）只补丢失的 §1/§2/§3/§4.1–4.4。给它 [`research/um15-first-slice-implementation-2026-09-14.md`](../research/um15-first-slice-implementation-2026-09-14.md) + 设计草案 + UM15 票 + UM-MERGE-INTEGRITY Resolution（喂 `upstream-sync.json` 的 waivers 真值：M1=`6b7610d45a`/`d347e70390`、M2=`8112743d69`/`c389f96bf3`、HEAD=`bcf4776f1d`、5 组发现里 pending 的几条）。§6 让它别走 (a) 弯路；§7.2 的 11 条让它落地前逐条验。然后按 §8 顺序落：§1 → enroll `verify-architecture-graph`（已绿）→ §2 → §3（并行）→ §4（最后，单独跑 `upstream-status`）。**落地后必须跑 tsc/oxlint/vitest**（§7.2 第 10 条——S2 没跑过）。
2. **UM12 L6**（可与 UM15 并行，主 session 直接做）：`application entrypoints` 10 条 allowlist，1 文件。删僵尸后安全。
3. **UM12 L7**（主 session）：14 条断链逐条 triage；`slot-contract.ts` 那条按 S1 删 "Extension slots" 段。
4. **2 决策**（grilling，需人）：`tsconfig paths` 通配 vs 显式；生成文档翻译义务。

## 不要做

- **L9 `agent note format`**：风险最高，defer 到 L6/L7 落完、且 `proposed/simplification/` 目录重建方案定了之后。
- **盲目跑 `gen-tsconfig-paths`**：会 corrupt `tsconfig.base.json`。
- **恢复 `ui-settings-models` 的 `slot-contract.ts`/`operations.ts`**：不是 2 文件恢复，是真特性 merge → 新票，不在此 session。
- **派 subagent 去读 runner 侧 transcript**：split-brain，会失败。
