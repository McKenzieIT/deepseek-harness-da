# UM-FORK-README-GENERATOR-RESIDUALS — README 门残留 2 项：`model-experience` 门当前红 + generator anchor threading latent bug

**Type**: task · **Status**: **resolved**（2026-09-14） · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —（两项都是自足的本地工作，无组织协调、无 eval 依赖）
**Blocks**: README 门族全绿（`verify-package-readme-{skeleton,limitations,model-experience}` 三门齐绿）
**Graduated from**: [UM-FORK-README-SKELETON-RETROFIT](UM-FORK-README-SKELETON-RETROFIT.md) —— 2026-09-14 F1 落地（PR #127 / `1d39160a09`）时，该票 Acceptance 全部达成（doc-standard 2/12 → 12/12），但实测暴露 2 项不在其 scope 内的残留

## 为什么拆票，而不是写在那张 resolved 票里

第 1 项是 **master 上当前就红的一道 `verify-*` 门，且无人承接**。这正是 [UM-C-GATES](UM-C-GATES-UPSTREAM-NEW.md) 2026-09-13 反应式修掉的 orphan-gate 模式（C 类 4 门孤儿 4 天），也正是 [UM15](UM15-durable-upstream-sync-method.md) §2 gate-coverage meta-gate 想结构性防住的东西。把它埋在一张 **resolved** 票的正文里 = 保证没人再读到。第 2 项是 latent bug，同理。

---

## 项 1 — `verify-package-readme-model-experience` 在 master 上红（pre-existing，非 PR #127 引入）

### 实测（2026-09-14，master `726a680ac6`）

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
pnpm run verify-package-readme-model-experience
```

```
verify-package-readme-model-experience failed:
  packages/bundle/data-agent/README.md: ## Model Experience and ## Known Limitations and Deferred Work must be the final two H2 sections, in that order
```

exit 1，**恰 1 个 offender**。

### 归属证据（为什么判 pre-existing）

- **不是 PR #127 引入**：PR #127 的 F1 apply 期间，主 session 已实测该门为红，并在 verify 表里明确记为 "pre-existing red, NOT introduced"。generator 的 `insertSkeleton` 反而是**朝正确方向**改的 —— 它专门把 `## Dev Note` 插在 `## Model Experience` **之前**，就是为了满足这道门的 "final two H2" 规则（见 UM-FORK-README ticket 的 2026-09-14 handoff 节）。
- **曾经绿过**：[UM12](UM12-post-merge-ga-fork-ci-resweep.md) 的门账表在 `bcf4776f1d` 一行记 **`package README model experience` → GREEN**（当时的修法是删 `verify-package-readme-model-experience.ts:84` 的 `packages/client/runtime` 陈旧 allowlist，见 [UM-MERGE-INTEGRITY](UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS.md)）。所以它是**绿 → 红**的无人承接漂移，不是一直红的 known-red。
- **讽刺点**：offender `packages/bundle/data-agent/README.md` 正是 2026-09-13 Cluster D apply 期间**手写**的 "correct skeleton 示例"（UM-FORK-README ticket §Scope 的"已完成的 sample"）。示例本身违反了另一道门。

### Scope

1. 读 `scripts/verify-package-readme-model-experience.ts` 的 "final two H2" 规则实现，确认它读的是哪一层 heading 集（bundle 包是 `kind: package-bundle`，与 65 个 depth-4 `package-reference` 的规则路径可能不同）。
2. 判定是 **FIX**（把 `packages/bundle/data-agent/README.{md,zh.md}` 的末两个 H2 调成 `## Model Experience` → `## Known Limitations and Deferred Work`）还是 **该门对 bundle kind 的规则本身要放宽**。倾向 FIX —— 该门在 `bcf4776f1d` 绿过，说明规则可满足。
3. 若 FIX：EN + ZH 双面同步 + `verify-translation-pairing --write` re-record sidecar。
4. **勿顺手 regen 全量 README** —— generator 会触到项 2 的 latent bug（见下）。只手改这一对。

### Acceptance

- `pnpm run verify-package-readme-model-experience` **exit 0**
- `verify-package-readme-skeleton --check` 仍 exit 0（不回归）
- `pnpm exec vitest run scripts/doc-standard.spec.ts` 仍 **12/12**
- corpus `verify-translation-pairing` 不劣于 **17**（注意下方 §测量陷阱）

---

## 项 2 — generator anchor threading latent bug（当前 inert，重跑即复活）

### 现象

对 `packages/eval/eval-cli/README.zh.md` 重跑 `scripts/gen-package-readme-skeleton.ts` 会：

1. 在一个**围栏代码块（fenced code block）内部**吐出一个 `<a id>` anchor —— 生成的 anchor 落进 ``` 围栏里，既不渲染成锚点、又污染代码示例正文；
2. 额外吐出一个**重复的 `model-experience` anchor**（同一 slug 两次 → 重复 slug）。

### 为什么现在摸不到它（**别误判成已修**）

盘上那个文件当前是干净的（2026-09-14 实测）：

```sh
grep -n '<a id=' packages/eval/eval-cli/README.zh.md     # → 7 个，均在围栏外
grep -c 'a id="model-experience"' packages/eval/eval-cli/README.zh.md  # → 1
```

干净的原因有两层，**两层都不是"bug 修了"**：

1. PR #127 的主 session **手工删掉**了那两个坏 anchor（changelog 代码块内的 `<a id="yyyy-mm-dd">` + 错位的 `<a id="model-experience">`）。
2. `planRetrofits` **跳过已 retrofit 的文件** → generator 再也不会碰这个文件 → bug 无从表现。

**触发条件**：该文件被重新纳入 retrofit 计划。任一即可 —— 新增 H2、新包复用同一 shape、`planRetrofits` 的 skip 判据变更、或有人为修项 1 而全量 regen。

### Scope

1. 定位 `insertAnchorsBeforeHeadings`（ZH flow）的 heading 扫描：它需要一个**围栏感知（fence-aware）**的扫描器 —— 遇到 ``` / ~~~ 进入 code-span 状态，状态内的 `## ` 行**不是 heading**，不得插 anchor。
2. 修重复 slug：插入前先查该 slug 是否已存在（幂等），已存在则不再插。
3. **回归测试是本项的核心交付**，不只是修 bug：加一个 fixture pair，其 ZH 面在围栏代码块内含 `## ` 开头的行 + 已存在的 `<a id="model-experience">`，断言 generator ① 不在围栏内插 anchor ② 不产生重复 slug ③ 幂等（第二次 run "0 current"）。
4. 顺带（同一处逻辑）：generator 把 `## Table of Contents` 插在 `## Summary` **之前**。EN + ZH 一致故 pairing / doc-standard 都绿，纯阅读顺序问题。改插入顺序为 Summary → TOC，改完须重跑幂等性 + corpus pairing 确认零回归。

### Acceptance

- 新 fixture 回归测试存在且绿
- 对 `packages/eval/eval-cli/README.zh.md` **强制** re-retrofit（临时绕过 `planRetrofits` 的 skip，或改其 shape 使之重新入选）后，产出：围栏内 0 个 `<a id>`、`model-experience` slug 恰 1 个
- `verify-package-readme-skeleton --check` exit 0 + 幂等（第 2 次 write run 字节相同的树）
- corpus `verify-translation-pairing` 不劣于 **17**
- `doc-standard.spec.ts` 12/12

---

## ⚠ 测量陷阱（两项都会踩，先读这条再报数字）

**corpus pairing 在本工作树上会测出 16，而 CI / fresh checkout 上的真值是 17。**

差的那 1 条是 `docs/adr/0002-ui-presenter-composition-plan-b.md` 未配 sidecar。该 sidecar `docs/adr/0002-ui-presenter-composition-plan-b.i18n.yaml` 是**故意 untracked** 的工作树文件（4 个 deliberately-untracked 之一），它在盘上就足以让 verifier 认为该 pair 已 record → 本地少报 1。

2026-09-14 实测确证：

```sh
mv docs/adr/0002-ui-presenter-composition-plan-b.i18n.yaml /tmp/  && pnpm run verify-translation-pairing  # → 17
mv /tmp/0002-ui-presenter-composition-plan-b.i18n.yaml docs/adr/ && pnpm run verify-translation-pairing  # → 16
```

**baseline 也别沿用旧数字**：22，不是 21（PR #126 落了那个未配对的 ADR）。PR #127 修的是 22 → 17 = **5** 条 wrong-locale link，不是 1 条。

## Estimated

~0.5 session（项 1 ~15 min 手改一对 README + re-record；项 2 ~2-3h 含 fence-aware 扫描器 + fixture 回归测试）。两项可同 session 落，但**项 2 先落**——否则为项 1 全量 regen 会把项 2 的 bug 写进盘。

## [2026-09-21] Item 1 落地（master）

**Item 1 — `verify-package-readme-model-experience` gate GREEN。** commit `aebc1f9126` `[UM-FORK-README-GENERATOR-RESIDUALS] fix data-agent README model-experience gate (item 1)`。两处问题：

1. **H2 顺序**：`## Dev Note` 原在 `## Known Limitations and Deferred Work` 之后，违反「Model Experience + Known Limitations 必须是末两个 H2」规则。Dev Note 移到 Model Experience 之前（Summary → TOC → Dev Note → Model Experience → Known Limitations）。
2. **Model Experience 单句 + anchor 位置**：原 3 句（gate 要求恰好 1 句 `Indirectly, through ....`）合并成 1 句；`<a id="known-limitations-and-deferred-work">` anchor 原在 H2 之前（让 Model Experience section content-line 计数 = 4，gate 要求 3）移到 H2 之后（match `packages/bundle/base` 的 passing pattern）。

验证：`verify-package-readme-model-experience` exit 0（329 READMEs checked）；`verify-package-readme-skeleton --check` exit 0；`doc-standard.spec.ts` 12/12；data-agent README pairing re-recorded in sync。

**Item 2 — generator anchor threading latent bug** 后续于实际日期 2026-09-14 收口，见下节。

**Status at that handoff: item 1 resolved，item 2 remained open。**

## [2026-09-14] Item 2 resolved

`gen-package-readme-skeleton` 现在用同一条 backtick/tilde fence-aware 行扫描处理 H2 提取、section 定位、Overview collision 重命名和 ZH anchor threading；围栏内的 `## ` 不再进入位置配对，也不会接收 anchor。anchor threading 先收集全文围栏外已有的显式 slug，因此同一 `model-experience` slug 只保留一份，第二次运行字节不变。缺失 TOC 且 Summary 已存在时，TOC 插在 Summary section 之后，不再抢到 Summary 前面。

回归测试 `scripts/gen-package-readme-skeleton.spec.ts` 覆盖 ``` 与 ~~~ 两种围栏、围栏内伪 H2、既有 `model-experience` anchor、二次运行幂等，以及 Summary → TOC 顺序。对真实 `packages/eval/eval-cli/README.{md,zh.md}` 的强制纯函数检查得到 EN/ZH 各 8 个真实 H2、围栏内 anchor 0、`model-experience` anchor 1、二次 threading 字节相同。

验证：`verify-package-readme-skeleton --check` exit 0（0 drift）；`doc-standard.spec.ts` + 新 spec 15/15；`verify-translation-pairing` 仍为该工作树已记录的 16 条 pre-existing violation，未新增。
