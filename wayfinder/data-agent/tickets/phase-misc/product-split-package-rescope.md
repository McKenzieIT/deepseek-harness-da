# product-split-package-rescope — 独立产品 split 时剥离 @deepseek-ai scope

**Type**: spec（planning；3 决策 grilled resolved；codemod 设计落定 c-ii/c，脚本可写 `--target` 参数化）
**Phase**: misc（cross-phase / product boundary infra）
**Assignee**: wayfinder-session 2026-08-20
**Status**: Resolved（2026-08-21——见下 Resolution）。3 决策 grilled 定：**D2=c-ii / D3=c / D1=结构确认+名字参数化延后**；rescope spec 落定；codemod `scripts/rescope-fork.ts` 可写（additive、`--target` 参数化、target 待填），apply 待 deepseek-ai 首 npm 发布触发。非 data-agent 能力交付。
**Surfaced by**: scope 分析（fork 自有包前置 `@deepseek-ai` 但非 deepseek-ai，问其后果）+ [map](../../map.md) 拓扑 Q4「(c) npm-消费纯产品仓库留作后续低风险选项」deferred + [AGENTS.md](../../../../AGENTS.md) Pre-release stance + [BRAND_GUIDELINES.md](../../../../BRAND_GUIDELINES.md) 商标。
**Scope**: 独立产品 split 时把 fork 全部包从 `@deepseek-ai/` scope 剥到目标 scope 的 transition workstream——机械工作清单（决策无关）+ codemod 设计 + 3 个 grilling-bound 决策。intent：不上游进 DeepSeek；内部开发后续转独立产品。
**Question**: fork 是 `deepseek-ai/deepseek-harness` 的 additive-only fork，新包全挂 `@deepseek-ai/dsh-*`（`repository` 指 `github.com/deepseek-ai/deepseek-harness`、license MIT、`publishConfig.access: public`、在 `dsh` 发布族）。独立那一刻 scope + 品牌 + `repository` 必须改。怎么剥、剥多少、何时剥？

## Why mandatory（非可选）

- **商标**：[BRAND_GUIDELINES.md](../../../../BRAND_GUIDELINES.md) 明示「DeepSeek Harness」是 DeepSeek **注册商标**，非 DeepSeek 的项目不得用全称于项目名；推荐缩写 **DSH** 表达生态关联，描述性用法（「built on DeepSeek Harness」）合规。故独立产品的 scope `@deepseek-ai`、README「developed by DeepSeek AI」、`npx @deepseek-ai/dsh web` 路径在独立时商标侵权。收敛：包 local name（`dsh-eval` 等）是 DSH 缩写、属描述性合规可留——**只需换 scope（`@deepseek-ai/` → `@<target>/`）+ 换产品/品牌名 + 重指 repository**，非逐个改名。
- **反向 squat**：[rescope-vendor.ts](../../../../scripts/rescope-vendor.ts) 把 vendored cordis 从 `@cordisjs/*` 搬进 `@deepseek-ai/*` 正是为「不在别人 namespace 发布」；fork 把自己的包发成 `@deepseek-ai/dsh-*` 是镜像操作——占 DeepSeek 自己 org 的名字（npm 同 org first-publisher-wins，unpublish 仅 72h 窗口，超时锁死）。
- **时机 sanction**：[AGENTS.md](../../../../AGENTS.md) Pre-release stance 明文「prefer the correct foundation over compatibility shims: rename or repackage freely and update every reference together」「Remove this section at the first tagged release」——pre 首次 tag 自由改名被项目背书，时机对齐到产品 split / 首 tag 边界。

## Decisions（grilled resolved 2026-08-21，domain-modeling）

- **D1 目标 scope / 产品品牌名 → Resolved**：取**结构确认 + 名字参数化延后**。local name `dsh-*` **留**（DSH 描述性缩写合规 + 透明溯源，与「尊重 deepseek-ai 成果」同向），只换 scope `@deepseek-ai/` → `@<target>/` + 产品/品牌名（README「developed by DeepSeek AI」→ 目标品牌、repo 名、CLI 名——「DeepSeek Harness」全称是注册商标不可用于项目名，须新名或 DSH 缩写）+ `npx` 路径 + `repository.url`（rescope-vendor 不碰 URL 须新覆盖）。**名字延后到触发时**：产品正式名 map 标「名待定」+ codemod `--target` 参数化（apply 必填、写脚本不需名）+ additive-only 内部开发期新 da 包须保 `@deepseek-ai/dsh-*` 匹配上游保升级路径（现在钉 `@<target>/` 破坏 additive-only），故累积债由 split 时 codemod 兜底非现在钉名。包前缀留 `dsh-`（最小改 + 合规 + 溯源），不换新前缀。
- **D2 独立产品形态 → Resolved**：取 **(c-ii) npm-consume**。只发 fork 自有 ~20 da addition 包到 `@<target>/`，消费 deepseek-ai 发布的 `@deepseek-ai/dsh-*`；deepseek-ai 专属包（core dsh-* + framework）不重发不占名，尊重 MIT 归属（worklist #6 自有包 notices 标 fork 自 DeepSeek 起源）。理由：维护面最小（只维护自身 ~20，~140 没写的包由 deepseek-ai 维护）；先例同向（[frontier-fork-precedent](../../research/frontier-fork-precedent.md)：社区主导 = overlay 仓 + 选择性挂载，非 fork-core-republish；c-i = Roo Code fork-and-diverge 反例 archived 2026-05-15）；可逆/可升级（codemod additive + 参数化，deepseek-ai 弃坑可 escalate 到 c-i re-vendor 重发，桥不烧）；[map](../../map.md) Q4 已 lean c-ii（低风险）。前置 = deepseek-ai 发 `@deepseek-ai/dsh-*` 上 npm（非用户控，但 align 首 tag 触发边界）。c-i 留作 escalation fallback。
- **D3 vendored 框架归宿 → Resolved**：取 **(c) 消费 deepseek-ai 发布的 `@deepseek-ai/cordis` from registry**。产品仓**不带 `vendor/`**，framework 全归 deepseek-ai 维护、零 framework 维护。**关键锐化（domain-modeling）**：c 的前置**与 c-ii 同一、非额外**——[rescope-vendor.ts](../../../../scripts/rescope-vendor.ts) 顶部实证「Every harness package declares cordis as a peer dependency, so publication carries this framework layer too」，deepseek-ai 发 dsh-* ⟹（意图上）同发 cordis（rescope 把 cordis 搬进 `@deepseek-ai/*` 正为此），故 **c 可行 ⟺ c-ii 可行**、同触发边界。理由：只维护自身最严（零 framework sync/零 vendor 树）；纯产品仓最干净（无 `vendor/`）；无 version-skew（cordis+dsh-* 同源 deepseek-ai registry）；尊重成果最彻底（deepseek-ai 全权 own/publish/maintain framework，产品按发布消费）；codemod 更简（无 `vendor/` → rescope-vendor 与产品仓无关、其硬编码 `@deepseek-ai` target **不需参数化**、rescope-fork 只动 ~20 自有包）。**(b) 带 `vendor/` 换控制权**留作文档化 fallback：若 deepseek-ai 漏发 cordis 或 framework 需紧急 patch。**(a) 出局**：c-ii 下 a 错配 peer 链（你发 `@<target>/cordis` 满足不了被消费 dsh-* 对 `@deepseek-ai/cordis` 的 peer）+ 用户原则踢 deepseek-ai 专属不重发。
  - **D2→D3 依赖锐化**：peer 链（每个 dsh-* peer-depend `@deepseek-ai/cordis`）使 D3 非三自由选项而是 D2 的条件函数——c-i ⟹ a 被迫（你重发全树含 framework 作 peer，一致 rescoped）；c-ii ⟹ {b,c}（a 错配：你发的 `@<target>/cordis` 满足不了被消费 dsh-* 对 `@deepseek-ai/cordis` 的 peer）。grill D2 即坍缩 D3 大半。

## Mechanical worklist（决策无关，落地必做）

1. codemod `scripts/rescope-fork.ts`（additive，新脚本，不动 rescope-vendor）——见下 Codemod design。
2. 解锁 `@deepseek-ai/` 硬门：[families.ts](../../../../scripts/release/families.ts) `members()` + [publish-npm-baseline.ts](../../../../scripts/publish-npm-baseline.ts) `discover()` 的 `if (!name.startsWith('@deepseek-ai/')) throw` → 参数化或 codemod 改常量。否则 rescope 后发布族立刻抛错。
3. [verify-dsh-package-licenses.ts](../../../../scripts/verify-dsh-package-licenses.ts) 正则 `/^@deepseek-ai\/dsh/` → 同步改（或 scope-无关 `/^@[^/]+\/dsh/`），否则 rescope 后静默失效不再强制 MIT。
4. `knip.json` `ignoreDependencies: ["@deepseek-ai/.+"]` 多处 → 改目标 scope（rescope-vendor EXACT_EDITS 已有改 knip 先例）。
5. `repository.url` 重指：每包 `github.com/deepseek-ai/deepseek-harness` → 独立 repo 或删。**rescope-vendor 的 token 规则只动包名 token，不碰 URL**——须新覆盖。+ README rebrand（「developed by DeepSeek AI」→ 目标品牌）+ `npx @deepseek-ai/dsh web` 路径 + root `@deepseek-ai/dsh-root` + entry `@deepseek-ai/dsh` + `@deepseek-ai/website`。
6. [gen-third-party-notices](../../../../scripts/gen-third-party-notices.ts) 的 `upstreamName` 纪律（vendored 行已有，注释「MIT attribution names the fork's origin, not our scope」）扩到 fork 自有包——独立产品 notices 应标 fork 自 DeepSeek 起源。
7. [AGENTS.md](../../../../AGENTS.md) convention line「Every npm package is `@deepseek-ai/dsh-<name>`」+ Pre-release stance 段落（split/首 tag 时该段本就该删）同步改。

## Codemod design（c-ii/c 落定）

- **Shape**：scope-prefix 置换 codemod（**非** rescope-vendor 的固定 RENAMES 表）。**动态发现 = 产品仓本地包**（c-ii 下产品仓 `packages/` 只含 ~20 da additions，上游 dsh-* core + `vendor/` 全 drop 改 npm 消费）→ `git ls-files 'packages/**/package.json' 'apps/*/package.json'` + root/native → 读 name → 建 `@deepseek-ai/<local>` → `@<target>/<local>` 映射（保 local name）。**映射只键本地包名**：引用 `@deepseek-ai/dsh-<非本地>`（上游 core 依赖，如 `@deepseek-ai/dsh-core`/`dsh-tools`）**不在映射 → 不 rescope → 从 npm 解析**（复用 rescope-vendor「RENAMES 键集 = 处理集」语义：本地集 = da additions，非本地引用天然留下）。intra-addition 依赖（da 包 A 依赖 da 包 B）随 B 在映射里 → 一同 rescope 到 `@<target>/`。
- **Parameterized target**：`--target <scope>`（apply 必填；check 读 post-state）；镜像 rescope-vendor 的 `--apply/--check/--reverse` 三态；`--reverse` 回 `@deepseek-ai/`（上游 sync 后重 apply，保 additive-only 升级路径）。
- **Generic rewrite**：rescope-vendor 的 token（quoted `'`/`"`/`` ` `` + 可选 `/subpath`）+ yaml `name:` 正则，从固定 RENAMES 推广到**本地发现集**。+ `repository.url` 重写（新，rescope-vendor 不碰 URL 须新覆盖）+ README rebrand（「developed by DeepSeek AI」→ 目标品牌）+ `npx @deepseek-ai/dsh web` 路径 + root `@deepseek-ai/dsh-root` + entry `@deepseek-ai/dsh` + `@deepseek-ai/website`。
- **EXACT_EDITS**（token 规则不能安全表达的 gate/config 点，逐项带命中计数 + pending/applied/invalid 状态分类器，镜像 rescope-vendor）：families.ts + publish-npm-baseline.ts 的 `startsWith('@deepseek-ai/')` 门（c-ii 下须放行 `@<target>/` 给 ~20 自有包发布；门目的「不 squat 上游名」由 `@<target>/` 满足）、verify-dsh-package-licenses 正则 `/^@deepseek-ai\/dsh/` → scope-无关 `/^@[^/]+\/dsh/`（否则 rescope 后静默失效不再强制 MIT）、`knip.json` `ignoreDependencies: ["@deepseek-ai/.+"]` → 目标 scope、AGENTS.md convention line「Every npm package is `@deepseek-ai/dsh-<name>`」、`tsconfig.base.json` refs（c-ii 下删对上游 dsh-* 的 path mappings——改 npm 解析）、root package.json name。
- **POSTCONDITIONS**（c-ii 修正——非 blanket）：本地包 name 全以 `@<target>/` 开头；**本地包名无 `@deepseek-ai/` 残留**（da additions 全 rescoped）；**上游 core dep 引用保持 `@deepseek-ai/`**（npm 消费，预期非残留——故 postcondition 按**本地包集 scope**、非 blanket 全仓无 `@deepseek-ai/`，区别于原 c-i 假设）；gate 引用新 scope；`repository.url` 全重指。
- **与 rescope-vendor 交互**（c 下）：**无**——产品仓不带 `vendor/`，rescope-vendor（处理 vendored framework 的 rescope）与产品仓无关，其硬编码 `@deepseek-ai` target **不需参数化**（D3=a 才需要，a 已出局）。rescope-fork 只动 ~20 自有包。
- **apply 后再生**（镜像 rescope-vendor）：`pnpm install`（lock）+ `pnpm run gen-third-party-notices` + `pnpm run verify-translation-pairing --write`（双语对）。

## Sequence（c-ii/c 落定）

D1+D2+D3 grilled（D2=c-ii / D3=c / D1=结构+参数化延后）→ `rescope-fork.ts`（additive，`--target` 参数化，本地包发现；**现在就能写、target 待填**）→ 待 deepseek-ai 首 npm 发布（`@deepseek-ai/dsh-*` + `@deepseek-ai/cordis`）触发 → 新建产品仓 + 拷 ~20 da additions + drop 上游 core/`vendor/` + 加 npm deps + 删 tsconfig path mappings → `rescope-fork --apply --target <target>` + repository/README/npx/AGENTS rebrand → 再生 + hygiene/doc-sync/test 全绿。每步含 Agent Note（[AGENTS.md](../../../../AGENTS.md)「Non-trivial changes MUST include an Agent Note in the same PR」）。回退见下 Resolution；escalation 到 c-i 见 Resolution。

## Cheap-now rules（internal-dev 期间，无论何时都守）

- **绝不对真实 registry 跑** `release:publish` / `publish-npm-baseline publish`——一旦发出 `@deepseek-ai/dsh-*` 在 DeepSeek org 不可逆占用。测发布路径 `--registry` 指一次性 Verdaccio。
- 当前版本漂移（新包 rc.7 vs root rc.8）使 `verifyVersions` 先 fail 是意外刹车——别依赖，版本一同步 publish 路径即活。
- 每加一个 `@deepseek-ai/dsh-*` 包自觉「将来 rescope」；D1 resolved=延后（additive-only 期新包须保 `@deepseek-ai/dsh-*` 匹配上游保升级路径，累积债由 split 时 codemod 兜底、非现在钉 `@<target>/`——现在钉破坏 additive-only）。

**验**: codemod apply 后 `pnpm run rescope-fork:check`（新 hygiene 门，镜像 `rescope-vendor:check`）+ `pnpm run hygiene`（含 verify-dsh-package-licenses、knip、publint、constraints）+ `pnpm run typecheck` + `pnpm run doc-sync`（md-wrap/links/refs）+ `pnpm run test`（rescope 后 workspace 解析 + 全 spec）。

**关联**: [map](../../map.md) 拓扑 Q4 (c) deferred；[rescope-vendor.ts](../../../../scripts/rescope-vendor.ts)（vendored rescope 模板 + squat 理由）；[docs/rescope.md](../../../../docs/rescope.md)（vendored name mapping）；[families.ts](../../../../scripts/release/families.ts) + [publish-npm-baseline.ts](../../../../scripts/publish-npm-baseline.ts)（`@deepseek-ai/` 硬门）；[verify-dsh-package-licenses.ts](../../../../scripts/verify-dsh-package-licenses.ts)（MIT 强制正则）；[AGENTS.md](../../../../AGENTS.md) Pre-release stance + convention line；[BRAND_GUIDELINES.md](../../../../BRAND_GUIDELINES.md)（商标）；[host-typecheck-wiring](host-typecheck-wiring.md)（同 phase-misc 交叉基建票 + map backfill 先例）；P3 subagent-qoder（`@qoder-ai` 外部 dep 不 rescope 先例）。

## Resolution（resolved 2026-08-21）

3 决策 grilled 定（见上 Decisions）：**D2=c-ii（npm-consume）** / **D3=c（消费 deepseek-ai 发的 `@deepseek-ai/cordis`，无 `vendor/`）** / **D1=结构确认（留 `dsh-` local + 换 scope/品牌/README/npx/repository.url）+ 名字参数化延后到触发时**。原 map「(c) deferred 低风险选项」就此 spec 落定。spec = codemod + 纯产品仓结构 + 迁移步骤 + 触发时机 + 回退/escalation，散见各段；本段综合。

**纯产品仓结构（D2=c-ii + D3=c）**：fresh git 仓（非 fork / defork），`packages/` 只含 ~20 da addition 包（`packages/{data,embedder,retrieval,query,credentials,subagent,identity,eval,llm}/...` + `packages/bundle/data-agent/`）；上游 dsh-* core + `vendor/` 全 drop，改 `@deepseek-ai/dsh-*` + `@deepseek-ai/cordis` 作 npm deps 消费；本地 ~20 包发到 `@<target>/`、local name 保 `dsh-*`。无 `vendor/` → `rescope-vendor.ts` 与产品仓无关。

**迁移步骤（additive-only git-fork → npm-consume 纯产品仓）**：
1. **前置**：deepseek-ai 发 `@deepseek-ai/dsh-*` + `@deepseek-ai/cordis` 上 npm（首 tag 边界；c 可行 ⟺ c-ii 可行，见 D3 锐化）。
2. 新建产品仓（fresh git），拷 ~20 da additions，drop 上游 `packages/` dsh-* core 树 + `vendor/`。
3. 加 `@deepseek-ai/dsh-*` + `@deepseek-ai/cordis`（+ 其他 `@deepseek-ai/*` deps）为 dependencies；删 `tsconfig.base.json` 对 dsh-* 的 path mappings（改 npm 解析）。
4. `rescope-fork.ts --apply --target <target>`（本地 ~20 包 `@deepseek-ai/dsh-*` → `@<target>/dsh-*`；非本地 dsh-* 引用不动 = npm 消费；见 Codemod design）。
5. `repository.url` 重指 + README rebrand + `npx` 路径 + root 包名 + AGENTS.md convention line + **删 Pre-release stance 段**（首 tag 边界本就该删）。
6. 再生：`pnpm install` + `gen-third-party-notices`（自有包标 fork 自 DeepSeek 起源 = 「尊重协议」落地）+ `verify-translation-pairing --write`。
7. hygiene 全绿：`rescope-fork:check` + `hygiene`（verify-dsh-package-licenses 正则改 `/^@[^/]+\/dsh/`、knip、publint、constraints）+ `typecheck` + `doc-sync` + `test`。每步 Agent Note。

**何时触发**：apply 于产品 split / 首 tag 边界（[AGENTS.md](../../../../AGENTS.md) Pre-release sanction：pre 首 tag 改名自由、项目背书；首 tag 删 Pre-release 段）。硬前置 = deepseek-ai 首 npm 发布（`@deepseek-ai/dsh-*` + `@deepseek-ai/cordis`）。codemod `rescope-fork.ts` **现在就能写**（additive + `--target` 参数化 + 本地包发现 + target 待填），apply 待前置——故本 ticket Resolved 不阻塞：脚本可随时落地（additive 新脚本，不动 rescope-vendor），apply 是触发时一次性。

**回退**：
- codemod 级：`rescope-fork.ts --reverse`（~20 包 `@<target>/` → `@deepseek-ai/`，上游 sync 后重 apply，保 additive-only 升级路径——镜像 rescope-vendor）。
- 仓级：split 在 tag 边界，产品仓是**新仓**（不动 fork git 史）。回退 = 弃用产品仓、续用 additive-only fork（checkout 末个 pre-split tag）。干净。
- **escalation（c→c-i）**：若 deepseek-ai 弃坑/停发（6 天 pre-release + Roo Code archived 先例使非小概率），把最后发布的 `dsh-*` + `cordis` re-vendor 进产品仓、`@<target>/` 重发（c-i 路径作升级；此时 D3=a 重新生效，rescope-vendor `--target` 须参数化）。spec 文档化此 fallback 分支。

**落地顺序**：codemod 脚本 `rescope-fork.ts`（additive，可现在写）→ 待触发 → 迁移步骤 1-7 → 全绿。脚本本身是 additive-only fork 期可交付的产物（不依赖 deepseek-ai 发布）；apply + 迁移是触发时工作。
