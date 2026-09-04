---
type: grilling
status: open
blocked_by: []
---

# CB-3: include 组的 per-row 失败隔离（评估，非立即实施）

**来源**：CB-1 决策（2026-09-04）——「先自检止血，per-row 开票后评」。
自检部分**已落地**（见下）；本票承接 per-row 容错的可行性评估。

## 已落地的止血（本票的前置）

`scripts/bundle-loader-ids.spec.ts` —— 跨 bundle 扫描 `- id:` 声明，
断言"同一个 id 不得声明两个不同的 plugin name"。已双向验证：
- 修复后的树：**pass**
- 把 `result-cache-memory` 改回 `result-cache`：**fail**，且报出两处精确位置
  （`data-agent/cordis.patch.yml:234 -> dsh-result-cache-memory` 与
  `web-app/cordis.patch.yml:300 -> dsh-client-result-cache`）

这条 gate 只能防**重复 id** 这一种成因。它防不住 CB-1 blocker 2 那种
"一行在 apply 时 throw" 的成因——同样的整组消失，不同的触发路径。

## Question（需评估）

现状语义：**一行装不上 → 整组不装**。
`vendor/loader/src/config/group.ts:64` throw → `vendor/include/src/index.ts:312-317`
的 `Include._apply` 整块失败 → 该 include 组的每一行都不挂载。
base 树已挂载，所以 **app 照常打开，只是 data-agent 的一切静默消失**。

已咬三次：`code-runtime`（P-DA4）、`result-cache`（CB-1）、
`query-maxcompute`（W14，虽成因是 row 内部错误而非 id 冲突）。
**每加一个 data 行都是一颗潜在地雷。**

需要评估：

1. **可行性 vs additive-only**：per-row 容错要改 `vendor/loader` / `vendor/include`
   —— 这是 **vendored Cordis**，data-agent map 的常设原则是对 upstream
   **additive-only**（保升级路径）。改 vendor 意味着每次 upstream 同步都要 rebase 这个
   补丁。是否值得？有没有**不改 vendor** 的做法（例如在 include 层之上包一层
   fault-isolating wrapper，或让每个高风险 row 自己 try/catch 成 no-op plugin）？
2. **"半个系统在跑"是否比"整组消失"更糟**：整组失败至少是全有或全无；
   per-row 容错会产生"schema 在、query 不在"这类**部分可用**状态，
   agent 可能给出看似正常但实际残缺的回答。这是安全性权衡，不只是可用性。
   —— 若做 per-row，是否需要一个"关键行"白名单（这些行失败仍然整组失败）？
3. **可观测性是否才是真问题**：三次事故的共同点不是"整组失败"本身，
   而是**失败静默**——用户看到的是"按钮没了"，不是"data-agent 未加载"。
   也许正解不是改失败粒度，而是让失败**大声**：
   - 启动时若某个 include 组失败 → 在 UI 里显式横幅（不只是 stderr 日志）
   - `ui-settings-plugin-inventory` 已有 `enabled: !entry.disabled` 的能力，
     能否显示"本该加载但加载失败"的行？
   —— 这条成本远低于改 vendor，且直接命中三次事故的真正症状。
4. **upstream 是否已有方案**：先查 upstream `deepseek-ai/deepseek-harness` 的
   loader 是否已在演进错误隔离；若上游有意图，本 fork 不应先分叉。

## 建议的评估顺序

先答 Q3（可观测性）——若"显式报错 + inventory 显示失败行"就消除了三次事故的痛，
那 per-row 容错可能根本不必做，Q1/Q2 的成本与风险都可以不付。

## 关键文件

- `vendor/loader/src/config/group.ts:64`（throw 点）
- `vendor/include/src/index.ts:312-317`（整组失败点）
- `packages/boot/app-boot/src/index.ts:523`（`mountRootInclude`）
- `packages/host/plugin-inventory/src/index.ts:64`（`enabled: !entry.disabled`）
- `scripts/bundle-loader-ids.spec.ts`（已落地的重复 id gate）
- 三次事故：[CB-1](CB1-cold-boot-blockers.md)、P-DA4（code-runtime）、W14（query-maxcompute）
