# product-split-package-rescope — 独立产品 split 时剥离 @deepseek-ai scope

**Type**: spec（planning；3 决策 grilling-bound；codemod 设计落定，脚本 blocked on D1）
**Phase**: misc（cross-phase / product boundary infra）
**Assignee**: wayfinder-session 2026-08-20
**Status**: Open——spec only。3 决策待 grilling；codemod 脚本 `scripts/rescope-fork.ts` blocked on D1（目标 scope 名）。非 data-agent 能力交付。
**Surfaced by**: scope 分析（fork 自有包前置 `@deepseek-ai` 但非 deepseek-ai，问其后果）+ [map](../../map.md) 拓扑 Q4「(c) npm-消费纯产品仓库留作后续低风险选项」deferred + [AGENTS.md](../../../../AGENTS.md) Pre-release stance + [BRAND_GUIDELINES.md](../../../../BRAND_GUIDELINES.md) 商标。
**Scope**: 独立产品 split 时把 fork 全部包从 `@deepseek-ai/` scope 剥到目标 scope 的 transition workstream——机械工作清单（决策无关）+ codemod 设计 + 3 个 grilling-bound 决策。intent：不上游进 DeepSeek；内部开发后续转独立产品。
**Question**: fork 是 `deepseek-ai/deepseek-harness` 的 additive-only fork，新包全挂 `@deepseek-ai/dsh-*`（`repository` 指 `github.com/deepseek-ai/deepseek-harness`、license MIT、`publishConfig.access: public`、在 `dsh` 发布族）。独立那一刻 scope + 品牌 + `repository` 必须改。怎么剥、剥多少、何时剥？

## Why mandatory（非可选）

- **商标**：[BRAND_GUIDELINES.md](../../../../BRAND_GUIDELINES.md) 明示「DeepSeek Harness」是 DeepSeek **注册商标**，非 DeepSeek 的项目不得用全称于项目名；推荐缩写 **DSH** 表达生态关联，描述性用法（「built on DeepSeek Harness」）合规。故独立产品的 scope `@deepseek-ai`、README「developed by DeepSeek AI」、`npx @deepseek-ai/dsh web` 路径在独立时商标侵权。收敛：包 local name（`dsh-eval` 等）是 DSH 缩写、属描述性合规可留——**只需换 scope（`@deepseek-ai/` → `@<target>/`）+ 换产品/品牌名 + 重指 repository**，非逐个改名。
- **反向 squat**：[rescope-vendor.ts](../../../../scripts/rescope-vendor.ts) 把 vendored cordis 从 `@cordisjs/*` 搬进 `@deepseek-ai/*` 正是为「不在别人 namespace 发布」；fork 把自己的包发成 `@deepseek-ai/dsh-*` 是镜像操作——占 DeepSeek 自己 org 的名字（npm 同 org first-publisher-wins，unpublish 仅 72h 窗口，超时锁死）。
- **时机 sanction**：[AGENTS.md](../../../../AGENTS.md) Pre-release stance 明文「prefer the correct foundation over compatibility shims: rename or repackage freely and update every reference together」「Remove this section at the first tagged release」——pre 首次 tag 自由改名被项目背书，时机对齐到产品 split / 首 tag 边界。

## Decisions（grilling-bound，domain-modeling）

- **D1 目标 scope / 产品品牌名**（商标要求；codemod 前置）。local name `dsh-*` 留（DSH 缩写描述性合规），只换 scope + 产品/品牌名 + README + `npx` 路径。唯一真正阻塞 codemod 脚本的决策。
- **D2 独立产品形态**：(c-i) 全量 derivative——整个树 ~160 包 rescope 到目标 scope（重发上游包，MIT 合规但承担上游包维护）；(c-ii) npm-consume——`@deepseek-ai/dsh-*` 作 npm 依赖消费（DeepSeek 发布的），只发 fork 自有 additions（data-agent 包，~20）到目标 scope。[map](../../map.md) Q4「(c) npm-消费纯产品仓库」lean c-ii（低风险）。决定 codemod 剥多少包。
- **D3 vendored 框架归宿**（cordis/cosmokit/schemastery/cordis-plugin-*，现 `@deepseek-ai/*`）：(a) 二次 rescope 到目标 scope + 作 peer 发布（镜像上游；但 [rescope-vendor.ts](../../../../scripts/rescope-vendor.ts) 的 RENAMES target 硬编码 `@deepseek-ai`，需参数化 `--target`）；(b) `private: true` + bundle 进产品包、丢 peer（上游选 peer+publish 为不 inline，独立产品可控全链可重选）；(c) 消费 DeepSeek 发布的 `@deepseek-ai/cordis`（仅 c-ii 形态可行，但把框架层钉在 DeepSeek namespace）。

## Mechanical worklist（决策无关，落地必做）

1. codemod `scripts/rescope-fork.ts`（additive，新脚本，不动 rescope-vendor）——见下 Codemod design。
2. 解锁 `@deepseek-ai/` 硬门：[families.ts](../../../../scripts/release/families.ts) `members()` + [publish-npm-baseline.ts](../../../../scripts/publish-npm-baseline.ts) `discover()` 的 `if (!name.startsWith('@deepseek-ai/')) throw` → 参数化或 codemod 改常量。否则 rescope 后发布族立刻抛错。
3. [verify-dsh-package-licenses.ts](../../../../scripts/verify-dsh-package-licenses.ts) 正则 `/^@deepseek-ai\/dsh/` → 同步改（或 scope-无关 `/^@[^/]+\/dsh/`），否则 rescope 后静默失效不再强制 MIT。
4. `knip.json` `ignoreDependencies: ["@deepseek-ai/.+"]` 多处 → 改目标 scope（rescope-vendor EXACT_EDITS 已有改 knip 先例）。
5. `repository.url` 重指：每包 `github.com/deepseek-ai/deepseek-harness` → 独立 repo 或删。**rescope-vendor 的 token 规则只动包名 token，不碰 URL**——须新覆盖。+ README rebrand（「developed by DeepSeek AI」→ 目标品牌）+ `npx @deepseek-ai/dsh web` 路径 + root `@deepseek-ai/dsh-root` + entry `@deepseek-ai/dsh` + `@deepseek-ai/website`。
6. [gen-third-party-notices](../../../../scripts/gen-third-party-notices.ts) 的 `upstreamName` 纪律（vendored 行已有，注释「MIT attribution names the fork's origin, not our scope」）扩到 fork 自有包——独立产品 notices 应标 fork 自 DeepSeek 起源。
7. [AGENTS.md](../../../../AGENTS.md) convention line「Every npm package is `@deepseek-ai/dsh-<name>`」+ Pre-release stance 段落（split/首 tag 时该段本就该删）同步改。

## Codemod design

- **Shape**：scope-prefix 置换 codemod（**非** rescope-vendor 的固定 RENAMES 表）——fork 包集 ~160 且增长（grep 实证截断：`dsh-credentials-keychain`/`-host`/`dsh-subagent-qoder` 均未在 grep 输出），硬编码表错。**动态发现**：`git ls-files 'packages/**/package.json' 'apps/*/package.json' 'vendor/*/package.json'` + root/website/native → 读 name → 建 `@deepseek-ai/<x>` → `@<target>/<x>` 映射（保 local name）。
- **Parameterized target**：`--target <scope>`（apply 必填；check 读 post-state）；镜像 rescope-vendor 的 `--apply/--check/--reverse` 三态；`--reverse` 回 `@deepseek-ai/`（上游 sync 后重 apply，保 additive-only 升级路径）。
- **Generic rewrite**：rescope-vendor 的 token（quoted `'`/`"`/`` ` `` + 可选 `/subpath`）+ yaml `name:` 正则，从固定 RENAMES 推广到发现集。+ `repository.url` 重写（新，rescope-vendor 无）+ README/npx 路径。
- **EXACT_EDITS**（token 规则不能安全表达的 gate/config 点，逐项带命中计数）：families.ts + publish-npm-baseline.ts 的 `startsWith` 门、verify-dsh-package-licenses 正则、`knip.json`、AGENTS.md convention line、`tsconfig.base.json` refs、root package.json name。
- **POSTCONDITIONS**：每包 name 以 `@<target>/` 开头；package.json 无 `@deepseek-ai/` 残留；gate 引用新 scope；rescope-vendor RENAMES target 若 D3=a 亦更新。
- **与 rescope-vendor 交互**：D3=a → rescope-vendor target 需参数化（现硬编码 `@deepseek-ai`），或 rescope-fork 调泛化版；D3=b/c → vendored 不 rescope，rescope-fork 只动 fork 自有包。
- **apply 后再生**（镜像 rescope-vendor）：`pnpm install`（lock）+ `pnpm run gen-third-party-notices` + `pnpm run verify-translation-pairing --write`（双语对）。

## Sequence

D1+D2+D3（grilling）→ `rescope-fork.ts`（additive，target-parameterized；可先写脚本留 target 待填）→ apply at 产品 split / 首 tag 边界（AGENTS.md Pre-release sanction）→ hygiene + doc-sync 全绿。每步含 Agent Note（[AGENTS.md](../../../../AGENTS.md)「Non-trivial changes MUST include an Agent Note in the same PR」）。

## Cheap-now rules（internal-dev 期间，无论何时都守）

- **绝不对真实 registry 跑** `release:publish` / `publish-npm-baseline publish`——一旦发出 `@deepseek-ai/dsh-*` 在 DeepSeek org 不可逆占用。测发布路径 `--registry` 指一次性 Verdaccio。
- 当前版本漂移（新包 rc.7 vs root rc.8）使 `verifyVersions` 先 fail 是意外刹车——别依赖，版本一同步 publish 路径即活。
- 每加一个 `@deepseek-ai/dsh-*` 包自觉「将来 rescope」；D1 早定则新包可直接带目标 scope 避累积债。

**验**: codemod apply 后 `pnpm run rescope-fork:check`（新 hygiene 门，镜像 `rescope-vendor:check`）+ `pnpm run hygiene`（含 verify-dsh-package-licenses、knip、publint、constraints）+ `pnpm run typecheck` + `pnpm run doc-sync`（md-wrap/links/refs）+ `pnpm run test`（rescope 后 workspace 解析 + 全 spec）。

**关联**: [map](../../map.md) 拓扑 Q4 (c) deferred；[rescope-vendor.ts](../../../../scripts/rescope-vendor.ts)（vendored rescope 模板 + squat 理由）；[docs/rescope.md](../../../../docs/rescope.md)（vendored name mapping）；[families.ts](../../../../scripts/release/families.ts) + [publish-npm-baseline.ts](../../../../scripts/publish-npm-baseline.ts)（`@deepseek-ai/` 硬门）；[verify-dsh-package-licenses.ts](../../../../scripts/verify-dsh-package-licenses.ts)（MIT 强制正则）；[AGENTS.md](../../../../AGENTS.md) Pre-release stance + convention line；[BRAND_GUIDELINES.md](../../../../BRAND_GUIDELINES.md)（商标）；[host-typecheck-wiring](host-typecheck-wiring.md)（同 phase-misc 交叉基建票 + map backfill 先例）；P3 subagent-qoder（`@qoder-ai` 外部 dep 不 rescope 先例）。
