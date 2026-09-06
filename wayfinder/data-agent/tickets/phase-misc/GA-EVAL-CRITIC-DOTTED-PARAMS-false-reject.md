# GA-EVAL-CRITIC-DOTTED-PARAMS — critic 用 JSON path 叶子段匹配，点号 params 键会被误拒

**Type**: task  ·  **Phase**: misc  ·  **Status**: Open
**Source**: [GA-EVAL-EVENTDEF-PREFETCH](GA-EVAL-EVENTDEF-PREFETCH-engine-responder.md) Resolution 残留风险（2026-09-06——(a) 注入 `params_fields` 把这道门从「跳过」变成「活的」，所以是 (a) 放大的风险）
**Blocked by**: 无
**Blocks**: 无（但会在嵌套 params 的 event 问题上静默烧掉全部 retry）

---

## Question

`critiqueSql` 的 `json_field_not_in_params` 规则取 `GET_JSON_OBJECT` path 的**叶子段**去比对 `eventParams`：

```ts
// critic.ts extractJsonPaths: '$.a.b.c' → segs=[a,b,c], leaf='c'
if (p.leaf && ctx.eventParams.size > 0 && !ctx.eventParams.has(p.leaf.toLowerCase())) → error
```

但语义层的 `params_fields` 里存在**点号键**。`examples/k11-semantic-layer/events/payment/recharge.yaml` 就有：

```yaml
params_fields:
  coinList:
  coinList.gold:
  coinList.sendgold:
  coinList.freegold:
  coinList.diamond:
```

于是 `GET_JSON_OBJECT(params, '$.coinList.gold')` 的叶子是 `gold`，而 keys 里只有 `coinList.gold` —— **正确的 SQL 被判 `error`**。critic error 不是 warning，会 `passed:false` → 反馈重写 → 模型再写同样的字段 → 耗尽 `MAX_FEEDBACK_RETRIES` → decline。

## 为什么现在才要紧

(a) 之前 eval path 从不传 `eventDef`，`ctx.eventParams` 恒为空，`eventParams.size > 0` 的守卫让整条规则**从不执行**。(a) 注入 `params_fields` 之后这道门对所有 event 问题**变成活的**——这是它的本意（能抓住臆造字段名），但同时把这个 bug 也激活了。

**本次 39-case re-baseline 没有触发**：被检测到的 6 个 event case 里用到 params 的是 135/136，走的是扁平路径 `'$.moneyType'` / `'$.money'`，两个键都在 `params_fields` 里。所以这是**已知未触发**，不是已验证安全。

## 修法候选

- **(A) 匹配时同时试完整 path 与叶子段**：把 `$.` 之后的整串（`coinList.gold`）也拿去比对，任一命中即通过。最小改动，对现有扁平路径行为不变（`'$.money'` 的完整串就是 `money`）。
- **(B) 归一化 `params_fields` 的键**：建索引时把 `coinList.gold` 同时以 `coinList.gold` 和 `gold` 两种形式登记。会引入歧义（若两个不同父节点各有 `gold`，误放行）。
- **(C) 只在叶子段无命中且完整 path 也无命中时才报错，且降级为 warning**：最保守，但削弱了「抓臆造字段」的能力——那正是这道门存在的理由。

lean 是 **(A)**：语义层写的是什么形状就按什么形状比，不猜层级。

## 工作清单

- [ ] 决定 (A)/(B)/(C)。
- [ ] 加测试：`'$.coinList.gold'` + `params_fields` 含 `coinList.gold` → 必须 pass；`'$.nosuchfield'` → 仍必须 fail（不能为了修这个把守卫拆了）。
- [ ] 扫一遍 scope 里还有多少事件有点号键（`recharge` 有 5 个），估计影响面。
- [ ] 若 (a) 的召回后续扩大（[GA-EVAL-EVENTDEF-RECALL](GA-EVAL-EVENTDEF-RECALL-alt-labels-coverage.md)），更多带嵌套 params 的事件会进入注入范围 → 触发概率上升，建议在 RECALL 之前修。

## 备注

- 代码位置：`packages/data/nl2sql-engine/src/critic.ts`（`extractJsonPaths` + `critiqueSql` 的 方案 4 分支）、`types.ts` 的 `makeCriticCtx`（`eventParams: new Set(Object.keys(eventParams).map(f => f.toLowerCase()))`）。
- 注意 `makeCriticCtx` 已 lowercase 两侧，所以大小写不是问题；问题只在层级。
