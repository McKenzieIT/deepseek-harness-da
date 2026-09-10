# UM-TSCONFIG-PATHS-POLICY — fork 通配 alias fallback vs upstream 显式生成 alias，且生成器有不写尾逗号的 bug

**Type**: grilling · **Status**: resolved (2026-09-14, decision + implemented) · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —
**Blocks**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 的 `tsconfig paths` 门修法（C 类，fork 从未满足）+ 喂 [UM15](UM15-durable-upstream-sync-method.md)（生成器/fallback 一致性）
**Graduated from**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 2026-09-14（删僵尸后该门降级为 stale，提示跑 `gen-tsconfig-paths`，实跑产出无效 JSON）

## Question

两个耦合的决策：

### A. fork 保留 `"@deepseek-ai/dsh-*"` 通配 fallback，还是采纳 upstream 的 ~120 条显式生成 alias？

现状：`tsconfig.base.json` 的 `paths` 在 `// BEGIN generated package aliases` … `// END generated package aliases` 之间是 `gen-tsconfig-paths` 生成的显式 alias；**fork 在 END 之后又加了一整块 `"@deepseek-ai/dsh-*"` 通配 fallback**（指向 `./packages/{query,core,data,prompt,llm,shell,...}/*/src`）。

- upstream 的 `gen-tsconfig-paths` **不写尾逗号**（假定自己的块是 `paths` 对象的结尾）。
- fork 的通配块在生成区**之后** → 生成器一旦重跑，最后一条 alias 没尾逗号、后面又跟新内容 → **`tsconfig.base.json` 变成无效 JSON**（用 TypeScript 自己的 `ts.parseConfigFileTextToJson` 复核：regen 前 418 aliases OK，regen 后 `',' expected.`）。已 `git restore`，未提交。

所以**无论 A 选哪个，都得先修生成器的尾逗号 bug**（让生成块自带正确的尾逗号，或在 END 后强制补逗号）。

### B. 通配 vs 显式的取舍

- **通配 fallback**：少维护（新包自动覆盖），但 tsc 解析时通配可能比显式慢、且无法对单个包做路径 override；且它和生成器的「显式列全部」模型语义冲突（生成器想显式列 120 条，fallback 想用通配盖掉它们——两者同存是 fork 的折中，但生成器一跑就坏）。
- **显式生成**：与 upstream 一致、可单包 override，但每次加包要 regen（且 `gen-tsconfig-paths` 现在坏了）。

需要人定 fork 走哪条。

## Scope

grilling 定 A 的取舍 + B 的 bug 修法。产出：一个决策 + 一个 `gen-tsconfig-paths` 的 patch（修尾逗号）+ `tsconfig.base.json` 的对应调整。落地后 [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 的 `tsconfig paths` 门才能修（那门现在红的唯一 offender 是 `dsh-sdk-jsonrpc-demo` 缺 alias——删僵尸后已解，剩 stale，但 stale 不能 regen 因为会坏 JSON）。

## 诚实边界

- 未读 `gen-tsconfig-paths.ts` 的写入逻辑细节（只实测了它产出无效 JSON）。修尾逗号的具体改法需读源（它写 alias 时是否本该写逗号、还是写完整个块后 trim 最后一个）。
- 通配 fallback 是 fork 何时/为何加的未考据（`git log -p -- tsconfig.base.json` 可查）——决策时应知道它当年解决的什么问题。
- 删僵尸后 `tsconfig paths` 门的唯一 offender 已从 `dsh-sdk-jsonrpc-demo` 变为「stale」，但 **stale 本身不能靠 regen 解**（regen 会坏 JSON）→ 本票的 B 修法是前置。

## Resolution

### [2026-09-14 grilling] 决策 = 采纳 upstream 显式 alias（弃 fork 通配 fallback）。已落地 commit `10941436b5`（resync）

用户拍板：**A = 采纳 upstream 显式生成 alias**（弃 fork 的 `"@deepseek-ai/dsh-*"` 通配 fallback）。

**关键发现：生成器不用改。** `gen-tsconfig-paths.ts:190` 的注释「The region closes `paths`, so the last member carries no trailing comma」——它的假设是「生成区是 paths 的最后一项」。fork 在 END 之后加通配块破坏了这个假设，所以 regen 产出无效 JSON。**删掉通配块后，生成区重新成为最后一项，生成器的设计重新正确**——不需要改 `gen-tsconfig-paths.ts`。原票 Scope 里「B 修尾逗号 bug」消失。

落地（commit `10941436b5`，resync）：
- 删 `tsconfig.base.json` 的 53 行 `"@deepseek-ai/dsh-*"` 通配块（它是 paths 的最后一项，删后生成区成为最后一项）。
- 跑 `gen-tsconfig-paths` 刷新生成区（删僵尸后 stale，regen 移掉两个僵尸包 alias + 给所有真包显式 alias）。
- 417 → **537 显式 alias**（每个包都有自己的，无通配 fallback）。生成器的 `reportMissing`（`gen-tsconfig-paths.ts:155`）验证覆盖——无 alias 的包会 fail gate 而非静默走 workspace symlink（显式 alias 存在就是为了防的 artifact-plane leak）。

实测：`ts.parseConfigFileTextToJson` OK 537 aliases；`verify-tsconfig-paths` aliases are current（**GREEN**，原红）；`tsc -b tsconfig.client.json --force` EXIT 0（解析无回归）。

**→ 本票 resolved。** UM12 的 `tsconfig paths` 门随之 GREEN（C 类里的一门解掉）。
