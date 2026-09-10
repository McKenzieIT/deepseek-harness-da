# UM-MERGE-INTEGRITY — 2026-09-07 merge 双向有损：既丢了 upstream 文件，又复活了 upstream 已删的包

**Type**: research · **Status**: open · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（可立即认领）
**Blocks**: [UM11](UM11-pr-merge-post-cleanup.md)（**硬阻塞**：不能在一次双向有损的 merge 上开 PR 并声称「非回归」）、[UM12](UM12-post-merge-ga-fork-ci-resweep.md)（5 门红的根因在本票）
**Graduated from**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 2026-09-10 Phase C 并行分诊（S3 subagent 发现，主 session 独立复核）

## Question

`6b7610d45a`（upstream-merge 2026-09-07）**在两个方向上都丢了东西**。已复核两类，需要的是**把这两类各自的完整集合枚举出来**，逐条判 keep/drop，而不是只修已发现的 4 个实例。

### 方向 A — merge 丢了 upstream 的源文件（更严重）

`packages/client/ui-settings-models/src/client/` 下两个文件在 upstream 侧存在、在 HEAD 侧消失：

| 文件 | `c389f96bf3`（resync 的 upstream 尖端） | `HEAD` (`ecaa56c848`) |
|---|---|---|
| `slot-contract.ts` | `blob` | **ABSENT** |
| `operations.ts` | `blob` | **ABSENT** |

目录条目数：`c389f96bf3` = 21，`HEAD` = 19。

**关键证据**：`git log --diff-filter=D HEAD -- <两文件>` **返回空** —— 没有任何普通 commit 删除过它们。它们是在 merge 的冲突解决里蒸发的。

**为什么没人发现**：fork 的 `index.ts` 自身不 import 这两个文件，所以 `tsc` 不报错、`build:official` 保持绿。**编译器抓不到「upstream 文件被静默丢弃」这一类损失** —— 这是本票最重要的方法论结论。唯一的外部症状是 `verify-md-links` 里两条断链（`ui-settings-models/README{,.zh}.md:37 → src/client/slot-contract.ts`），即文档还在广告一个已经不存在的 slot 契约。

### 方向 B — merge 复活了 upstream 已删除的包

| 包 | `upstream/master` | `HEAD` |
|---|---|---|
| `packages/examples/jsonrpc-demo` | **ABSENT** | `tree` |
| `packages/examples/agent-spine-demo` | **ABSENT** | `tree` |

upstream 的三个删除 commit **全部是 `d347e70390`（第一次 merge 的 upstream parent）的 ancestor**（已逐条 `merge-base --is-ancestor` 复核）：

- `f3402eff58`（2026-08-23，`jsonrpc-demo` → `packages/sdk/python-runtime` 改名）
- `1d4dcf3b57`（删掉改名后的包）
- `244de7c18a`（2026-08-26，删 agent spine demo）

即：**这两个删除本应随 merge 落地，却没有**。自证性证据 —— HEAD **同时携带 upstream 自己的删除说明** `.agents/notes/archived/simplification/2026-08-26-remove-agent-spine-demo.md`，而它要删的包还在。

`scripts/verify-application-entrypoints.ts` 与 upstream **逐字节相同**（`git diff upstream/master HEAD` 为空），所以 upstream 过这门、fork 不过，差异全部来自这两个僵尸包 + fork 自有包。

## 这两类各自的 gate 代价（已实测，非推断）

方向 B 直接造成 5 门红：`config catalog`（唯一 offender 就是 `agent-spine-demo` 的 `personaPrefix`/`personaSuffix` schema-vs-type 不一致）、`tsconfig paths`（唯一 offender 是 `jsonrpc-demo`，包名≠目录名）、`application entrypoints`（13 项里 3 项）、`subsystem pages`（6 项里 1 项）、`package README model experience`（3 项里 2 项）。

## Scope

1. **枚举方向 A 的完整集合**：把 `c389f96bf3` 与 `HEAD` 做树 diff，限定在「upstream 在上一个 merge base 之后动过」的路径上，逐个文件判「fork 有意重构删的」vs「merge 冲突解决误丢的」。`slot-contract.ts` / `operations.ts` 这两个到底属于哪一类，**本次未能区分** —— 需要读 `6b7610d45a` 的冲突解决才能定。
2. **枚举方向 B 的完整集合**：找出所有「upstream 已删、fork 仍在」的包/目录。已知 2 个，未穷举。判据：upstream 的删除 commit 是否为 merge 的 upstream parent 的 ancestor。
3. **逐条判 keep/drop**，不要一律 drop —— fork 可能有意保留某些。
4. **落地 B 的删除**（含 `python/sdk-runtime/package.json` 的两条 `workspace:^` 声明、`pnpm-lock.yaml`、`gen-module-graph` + `gen-architecture-graph` regen）。
5. **喂给 [UM15](UM15-durable-upstream-sync-method.md)**：merge 的完整性本身需要一道 gate。见下。

## 喂给 UM15 的方法论结论（本票最有价值的产出）

**`tsc` 绿 ≠ merge 无损。** 两个方向都逃过了编译器：

- 方向 A：丢掉的文件没有 fork 侧的 importer，所以编译器无话可说。
- 方向 B：多出来的包能独立编译，所以编译器也无话可说。

UM15 的 durable 方法必须包含一道**merge 完整性 gate**，与「gate 是否变红」正交：

- **upstream 删除应用检查**：对每个「upstream 在窗口内删除的路径」，断言 merge 后该路径确实不存在（除非有显式的 keep-fork 豁免记录）。
- **upstream 文件保留检查**：对每个「upstream 在窗口内存在且未删除的路径」，断言 merge 后仍存在（除非有显式的 fork-drop 豁免记录）。

两者都是纯 git plumbing，不需要构建，且**恰好抓住编译器结构上抓不到的那一类损失**。这道 gate 存在的话，本票的两类问题都会在 merge 当天被抓到。

## 诚实边界

- 方向 A 的两个文件：**已确证消失且非普通 commit 所删**；**未确证**是误丢还是有意重构。区分需要读 `6b7610d45a` 的冲突解决。
- 方向 B 的归因（`6b7610d45a` 而非 `8112743d69`）是从「upstream 删除 commit 是 `d347e70390` 的 ancestor」推出的，推理成立，但**未读 `6b7610d45a` 的冲突解决**确认机制（delete/modify 时 "keep ours" vs 别的）。
- 两个方向都**只发现了实例，没有穷举集合** —— 这正是本票 Scope 1/2 的内容。

## Resolution

（open）
