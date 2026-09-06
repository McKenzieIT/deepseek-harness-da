---
type: grilling
status: open
assignee: null
blocked_by: []
---

# CL-29: eval 产物被 gitignore → 基线会蒸发，趋势对比与 ≥3 轮协议失去物质基础

**Branch**: 未认领（认领时按 CLAUDE.md 声明 `<type>/cl29-<slug>`）

## Question

`eval-results/*.json` 在 `.gitignore:61`，所以每次 run 的产物**只存在于产出它的那台机器的那个 worktree 里**，
worktree 一删就没了。这与三条已写死的纪律直接冲突：

1. **CLAUDE.md**「每次 eval run 必须记录……未记录的实验结果等于不存在」—— 记录的是**数字**，产物没留下。
2. **CL-22 分层协议**「决策点须 ≥3 轮取中位数」+「三轮必须同代码」—— 需要能回看每轮产物。
3. **`compare.ts` 趋势工具**「每次 eval 必须与上一次基线 run 对比」—— 需要基线产物在磁盘上。

**需决策**：产物怎么留？（候选见下）

## 触发事件（2026-09-06，已核）

`packages/eval/eval-cli/README.md:17` 把 `rebaseline-passk-168-clean` = 61.9% 标为
**CURRENT** 基线，README 共 **8 处**引用它，其中 `:95` 写着
「To reproduce the current pass^k baseline exactly: `--run-id rebaseline-passk-168-clean --today 20260903`」。

**该产物在磁盘上不存在。** 核查方法：8 个 worktree 的 `eval-results/` 逐个 `ls` + 全 workspace
`find -name "*passk-168-clean*"` → **零命中**。

后果是实测出来的，不是推想：CL-20 收尾 session 被 session prompt 要求
「用 `compare.ts` 与基线 `rebaseline-passk-168-clean` 比，并标注约 12pp 纯协议差异」，
**该指令无法执行**，只能改用两个仍在磁盘上的同协议 k=1 run 作基线
（见 [CL-20](CL20-delivery-agent-behavior-type2.md) 的「全量 eval 结果（2026-09-06 夜）」节）。

同一 session 新产的 `cl20-postrebase-n1` 会以同样方式蒸发 —— 它现在只在
`/Users/mckenzie/workspace/dsh-CL20/eval-results/` 里。

## 候选（互斥性待 grilling）

1. **纳入版本管理**：去掉 `.gitignore:61`，全量 run 产物入库。
   代价：单个 168-case 产物约 200KB+（实测 `10320fe2-*.json` = 213,564 B），
   历史上已有 40+ 个 run → 仓库膨胀；且多为一次性调试 run，噪声大。
2. **只留「基线」产物**：加白名单（如 `!eval-results/rebaseline-*.json`），
   只把被 README 声明为基线的那几个入库。代价小，且正好覆盖 `compare.ts` 的使用场景。
   需定「什么算基线、谁来提升一个 run 为基线」。
3. **产物瘦身后入库**：只存 `compare.ts` 真正需要的字段（`case_id` / `verdict` /
   `pass_k_results[].{execution_match,delivery_match}` / `config`），丢掉 `generated_sql`
   与 `query_result`。体积可能降一个量级，但**丢掉 SQL 就无法做形态分析** ——
   而形态分析（SQL/PROSE/TOOLCALL/NULL 分类）正是 CL-20 判定「门禁误伤 = 0」的关键手段，慎选。
4. **外部存储**：产物推到 artifact 存储 / 另一个 repo，README 存指针。
   彻底但要新基建。
5. **接受蒸发，改纪律**：明确「基线只是一个记录在案的数字，不保证可复算」，
   并把 README/CLAUDE.md/CL-22 里所有假设产物可用的指令改写掉。
   最省事，但 `compare.ts` 的价值大幅缩水。

## 附带需一并修的文档（若选 1-4）

- `packages/eval/eval-cli/README.md` —— 已加 2026-09-06 更正块说明产物缺失；定案后按结论重写。
- CLAUDE.md「趋势对比工具」节 —— 命令假设基线产物在磁盘上。
- [CL-22](CL22-eval-nondeterminism-deepcheck.md) 的 ≥3 轮中位数协议 —— 若产物不留，「同代码三轮」无法事后核验。

## 验收

- 定案并落地（改 `.gitignore` / 加白名单 / 瘦身脚本 / 外部存储 / 改纪律，择一）。
- README 的 8 处基线引用与 `:95` 的复现指令，改到与结论一致（要么可执行，要么明说不可执行）。
- 至少一个基线产物按新方案可被 `compare.ts` 成功读取（端到端验证，不只是改文档）。
