# pass^k 离线重打分（2026-09-03）

**方法**：`.tmp/rescore-passk.py` 读取所有已存 run 的 `cases[].pass_k_results[]`
（每次 attempt 的 `execution_match` / `delivery_match` / `sql_judge` / `infra_error` 都已持久化），
按 `runner.ts:378 passKVerdict` 的规则（every attempt must pass）与旧的 best-of-k（any）
各算一遍。**零 LLM 调用、零成本、无需 credentials。**

## 结论 1：k=1 的 run 完全不受影响

pass^k 与 best-of-k 在单次 attempt 下恒等（`any([v]) == every([v])`）。
全部 26 个 k=1 run 的 delta 均为 **+0.0pp**。

因此**以下票据的数字按记录成立，无需重跑**：
CL-8（96.2% / 100%）、CL-9（91.7%）、CL-10（66.1% / 91.7%）、CL-11、CL-12、CL-13、CL-14、
CL-15（73.8%）、CL-16（70.8%）、CL-17、CL-22（73.2% = 73.2/70.8/76.8 三 run 中位数）、
CL-5、CL-7、P3、P4、G1b-k11v2 系列、p11d-calibration。

> ✅ **残余风险已核查并排除**（2026-09-04）：GA-AUDIT1 同批还改了 `executionMatch`
> 不可验证→false。在 4 个 k=1 基线 run 上逐 attempt 统计"无 `sql_judge` 且
> `execution_match=true`"者，各得 21-25 个 case；与 `packages/eval/eval/cases/k11-v2/`
> 的 case YAML 逐一比对，**21/21 全部是 DELIVERY case**（`019`/`049`/`075`/`078`/`079`
> 正是 CL-12 迁移的 5 个，其余为 voice DELIVERY 组）。DELIVERY case 由 DELIVERY judge
> 经 `delivery_match` 判分，`expected.result` 为 null，本就不进 SQL judge 分支
> → **genuinely-flip 数为 0**。
>
> **结论：k=1 基线完整有效。CL-15 的 73.8% 与 CL-22 的 73.2% 中位数可复现。**

## 结论 2：k=3 的 run 全线崩塌

| run | 日期 | n | 记录值(best-of-k) | pass^k | delta |
|---|---|---|---|---|---|
| exp2-arm-a（中文 baseline, qwen-plus） | 09-02 | 168 | 72.0% | **26.8%** | −45.2pp |
| exp2-arm-e（英文 judge） | 09-02 | 168 | 72.0% | 17.3% | −54.8pp |
| exp2-arm-b（全英文） | 09-02 | 168 | 31.0% | 3.0% | −28.0pp |
| exp4-arm-a（中文, qwen3.7-max） | 09-02 | 168 | 88.1% | **56.5%** | −31.5pp |
| exp4-arm-b（英文, qwen3.7-max） | 09-02 | 168 | 85.1% | **57.7%** | −27.4pp |
| g1b-variant-B | 08-28 | 36 | 83.3% | 47.2% | −36.1pp |
| g1b-variant-D | 08-29 | 36 | 63.9% | 16.7% | −47.2pp |
| g1b-variant-A | 08-28 | 36 | 50.0% | 38.9% | −11.1pp |
| g1b-healthy-configC-qwen3.7-max | 08-28 | 36 | 25.0% | 16.7% | −8.3pp |

> exp4-arm-a 本重打分得 **56.5%**，而 GA-MODEL1 记录的重放值是 **47.6%**。差异应源于
> GA-MODEL1 同时应用了"不可验证→false"（75 个无 judge 的 attempt），本脚本读存量值故测不到。
> 即 **47.6% 是更严的下界，56.5% 是仅切 pass^k 语义的结果**。两者都远低于 88.1%。

## 结论 3：一个决策**翻转**了 —— GA-EXP4 / Kind 1（prompt 英文化）

GA-EXP4 的结论是「英文 prompt −3.0%（88.1%→85.1%），在文献预期内」，据此
**保留中文 prompt**、Kind 1 重新打开但未推进。

按 pass^k 重打分：

| | 中文 (arm-a) | 英文 (arm-b) | 英文−中文 |
|---|---|---|---|
| best-of-k（原记录） | 88.1% | 85.1% | **−3.0pp** |
| **pass^k（重打分）** | **56.5%** | **57.7%** | **+1.2pp** |

**符号翻转**。+1.2pp 在 n=168、case flip rate ~26.8% 的噪声水平内 → 诚实结论是
**中英文无显著差异**，而不是「英文更差所以保留中文」。原决策的事实基础不成立。

（GA-EXP2 的 qwen-plus 英文灾难性退化方向**仍成立**：26.8% → 3.0%，−23.8pp。
即"英文退化"是 qwen-plus 的能力问题，在 qwen3.7-max 上消失——这一点 GA-EXP4 本来的
定性结论反而被 pass^k 加强了。）

## 结论 4：方向性决策大多**存活**

- **GA-MODEL1（qwen3.7-max 取代 qwen-plus）**：exp4-arm-a 56.5% vs exp2-arm-a 26.8%
  = **+29.7pp**（原记 +16.1%）→ 方向成立且幅度更大。**决策存活。**
- **G1c ship variant**：pass^k 下 B(47.2%) > A(38.9%) > D(16.7%) > C(0%) → B 仍最优。**决策存活。**

## 结论 5：pass^k 基线已存在但是 n=1

`rebaseline-passk-168-merged`（2026-09-03T13:09）= **52.4%**，随 commit
`cfbb710b50 "feat(eval): pass^k 168-case definitive baseline (52.4%)"` 落地。

但同日另有两个冲突的 168-case pass^k run：
- `f4bc4a06`（04:25）= **0.0%**（全 168 wrong，坏 run）
- `rebaseline-passk-168`（11:06）= **33.9%**
- `rebaseline-contam-rerun`（13:09，63 case）= 49.2%
- `rebaseline-passk-168-merged`（13:09）= **52.4%**（= 11:06 run 的干净部分 + 63 case 重跑合并）

**52.4% 是单 run（且是拼接 run），违反 CL-22 的 ≥3 run 取中位数硬要求。**
30-case 子集 `a4fbd262` = 63.3%。所以目前**没有合法的 pass^k 基线**。

## 行动含义

1. **不需要重跑**的：全部 k=1 结论（CL-5/7/8/9/10/11/12/13/14/15/16/17/22、P3、P4）
2. **结论需修订**的：GA-EXP4 + Kind 1 门禁（符号翻转）
3. **需要重跑**的：仅「建立合法 pass^k 基线」这一件事 —— 3 × 168-case run 取中位数
   （单 run 已有 52.4% 可作第 1 个候选，但拼接 run 是否可计入需先判）
4. **目标值需重设**：78% / 80% / 90% 是对着 best-of-k ~73.8% 定的。pass^k 起点 52.4%，
   同样的数字含义完全不同 → CL-20/21/23/R11 的验收阈值必须重设后才有意义
