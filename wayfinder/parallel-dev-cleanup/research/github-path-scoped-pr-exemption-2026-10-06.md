# GitHub 能否按路径豁免「必须走 PR」—— 结论：不能

**日期**: 2026-10-06  ·  **为**: [R6](../tickets/R6-master-direct-push-permission-set.md) 的候选 (c)
**状态**: 已查实（此前自 2026-09-06 起标注「未验证」）
**方法**: 读 GitHub 官方文档源（`github/docs@main`，即 docs.github.com 的渲染来源）+ REST API 参考

## 问题

能否让 `master` 做到：大部分改动必须走 PR，但**只触及 `wayfinder/**` 的 commit 可以直推**？

## 结论：不能。三套机制全部不支持，且这是**结构性缺失**而非文档盲区

PR 要求是在 **ref 更新时**按「这个 ref 是怎么被更新的」（经 PR 还是直推）判定的，
**从不**看 diff 碰了什么。分支规则唯一的作用域维度是 **ref 名**。

REST schema 里 conditions 对象的自述即为铁证：
> `conditions` — **"Parameters for a repository ruleset *ref name* condition"**
> └ `ref_name` → `include[]` / `exclude[]`

这是**整个** conditions 对象。repository / organization / enterprise 三级的条件词汇合计只有
`ref_name`、`repository_name`、`repository_id`、`repository_property` —— **没有任何路径条件，也没有扩展点**。

### 路径感知只存在于三处，全部只能「加要求」或「拒绝推送」，不能「豁免」

| 机制 | 路径感知 | 能否豁免 PR 要求 |
|---|---|---|
| `file_path_restriction`（Restrict file paths） | 有（**deny-list**） | **否**。它是 **push 规则**，*"apply to every push to the repository"*，**无法限定到 master**；且仅限 private/internal 仓库；其 "allowed exceptions" 只从**它自己的** deny-list 里挖洞，不影响 `pull_request` 规则 |
| CODEOWNERS + `require_code_owner_review` | 有 | **否**。只**增加** review 要求，对直推零作用 |
| `required_reviewers` 的 `file_patterns`（**beta**） | 有（支持 `!` 取反） | **否**。它豁免的是**审批**，PR 本身仍然必须开 |

**反向使用 `file_path_restriction` 不可行**：`restricted_file_paths: ["**"]` + 例外 `wayfinder/**`
会把全仓任何触及非文档文件的推送全部拦掉（feature 分支开发直接报废），
**而且仍然不会放松 master 上的 PR 规则** —— 规则之间从不互相放松：
> *"the rules in each of these rulesets are aggregated. If the same rule is defined in different ways
> across the aggregated rulesets, the **most restrictive** version of the rule applies."*

**bypass 是按 actor 的，且全有全无**：`bypass_mode` ∈ `always` / `pull_request` / `exempt`，
没有任何按路径的粒度。classic 的 push allowlist 更是明确不豁免 PR：
> *"People, teams, and apps that have permission to push to a protected branch will **still need to
> create a pull request** when pull requests are required."*

**Actions workflow 当不了闸**：它在 ref 更新**之后**才跑，只能检测/回滚；
且 `GITHUB_TOKEN` 不在 bypass 列表里时同样被 ruleset 拦。

**唯一真能实现的是 GHES 的 pre-receive hook**（可读 `$GIT_QUARANTINE_PATH` 真实 diff、
用 `$GITHUB_VIA` 区分 PR 合并与 CLI 直推）—— 但它 **GHES-only，github.com / GHEC 没有**，
且 hook 只能 reject 不能 grant，意味着要把「PR 要求」整个搬进 hook 自己实现，
配错就 **fail-open**。信任模型反转，不划算。

## 顺带查实的两条，直接影响 R3 与 R4

### ① "Require status checks" **确实拦直推**（此前 R3 是推断，现在是文档）

三处独立文档一致：
> *"Required status checks must have a `successful`, `skipped`, or `neutral` status before collaborators
> can **make changes to** a protected branch."*
> *"After all required status checks pass, any commits must either be pushed to another branch and then
> merged **or pushed directly to the protected branch**."*

> *"If required status checks have not passed, **pushing to a protected branch** returns an error…
> `remote: error: GH006: Protected branch update failed` / `Required status check "ci-build" is failing`"*

ruleset 侧把机制说得更直白：
> `required_status_checks` — *"Choose which status checks must pass before **the ref is updated**.
> When enabled, **commits must first be pushed to another ref where the checks pass**."*

**机制**：required status checks 挂在 **commit SHA** 上。新建的本地 commit 没有任何 status，
所以直推必然被拒。→ **即使不开 "Restrict pushes"，只开 required checks 也会切断 wayfinder 直推路径。**
这正是 R3 票体写的那条，现已有文档支持。

**连带后果**：PR 规则与 status-check 规则**必须放进同一个 ruleset**，否则一个 bypass 盖不住两者。

### ② 别把「按路径过滤的 workflow」设为 required check（影响 R4 的 required 集合）

> *"You should **not** use path or branch filtering to skip workflow runs if the workflow is required
> to pass before merging"* —— 被 skip 的 required workflow 会**停在 Pending 并阻塞合并**。

→ R4 若选「分级 required」，任何带 `paths:` 过滤的 workflow 不能直接进 required；
需要一个**恒定运行的 shim job**，在 docs-only diff 上短路为 success。

## 对 R6 的候选集的影响

- **(c) ruleset 按路径豁免 —— 删除。** 平台不支持，且不是「暂时没做」而是结构性的。
- **(a) 文档也一律走 PR —— 可大幅降成本**，见下方新候选 (d)，它是 (a) 的低摩擦版。
- **(b) bypass actors —— 仍可行，但代价要写清**：bypass 无条件，拿到该 actor 的人
  **可以直推任意代码**，GitHub 这边对路径零保证。给**人**开 bypass 等于给了他直推代码的权限。
  若选它，建议专用 GitHub App / 机器账号而非真人，并把路径约束放进那个 workflow 自己。
- **(d) 新候选：PR 必须开，但无人工摩擦**（全 GA，推荐先评估）：
  `pull_request` + `required_approving_review_count: 0` + 仓库开 auto-merge，
  审批负担用 CODEOWNERS 只压在代码上（`wayfinder/` 不写 owner）。
  文档改动 = 建分支 + 开 PR + auto-merge，无人参与；代码改动 = 需 code-owner 批准。
  代价：每次改 ticket/map 仍要一个分支 + 一个 PR 对象（但不需要人）。
- **(e) 把 `wayfinder/` 拆成独立仓库**（submodule/subtree 消费）：权限边界与内容边界对齐，
  是 GitHub 设计实际假设的模型。代价最大，但唯一不需要任何 bypass。

## 两处仍在变动（写进票里以便将来复查）

1. `required_reviewers` 的 `file_patterns` 明确标注 **"in beta and subject to change"** ——
   它是 GitHub 唯一把 `!` 取反路径逻辑放进 PR 规则的地方，**是未来若要支持按路径豁免最可能的接缝**。
2. `file_path_restriction` / `max_file_size` 的 "allowed exceptions" 在版本标记
   `push-rule-allowed-exceptions` 之后，老版本 GHES 可能没有。

两者都不改变今天的结论。

## 来源

- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Managing a branch protection rule](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- [REST: Repository rules](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28)
- [REST: Organization rules](https://docs.github.com/en/rest/orgs/rules?apiVersion=2022-11-28)
- [About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [github/ruleset-recipes](https://github.com/github/ruleset-recipes)
