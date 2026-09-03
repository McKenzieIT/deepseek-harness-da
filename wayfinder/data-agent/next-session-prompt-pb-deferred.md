# Next Session Prompt — PB-COMPLY deferred (6 plugin-body fixes)

> Follows commit `2aaa099783` (PB-COMPLY: 24/32 fixed, 6 deferred, 2 FP). Completes the 6 deferred items. Read the wayfinder map (PB-COMPLY entry, ~line 211) + the 6 `PB-deferred-*.md` tickets for detail.

## Prompt（直接粘贴到下一个 session）

```
/effort max

我要完成 PB-COMPLY 遗留的 6 个延后项（plugin-body 合规修复的剩余）。先读上下文：

- wayfinder/data-agent/map.md 的 PB-COMPLY 条目（Decisions so far，~line 211）
- wayfinder/data-agent/tickets/phase-misc/PB-deferred-*.md（6 张 ticket，每张有"决策点 + 推荐修法 + 为何留"）
- .agents/skills/dsh-plugin-development/CONVENTIONS.md（规则定义）
- 上一个 commit 2aaa099783（已修 24/32）

## ⚠️ 基础设施注意
本仓库 bash 写是 ephemeral（git 不追踪、断连即丢）——所有源码编辑必须用 mcp__local__ 的 write_file/edit_file，不要用 bash 的 python/sed 改文件。bash 只用来读 + 跑 pnpm run typecheck/lint/vitest。bash runner 偶尔断连，重试即可。

## 推荐顺序 + 每项做法

1. admin Config（R6 task）— PB-deferred-admin-config-zod-clash.md
   走方案 A：rename import { z } from 'zod' → import { z as zod } from 'zod'（~19 处 z.→zod.，含 z.infer），加 import z from '@deepseek-ai/schemastery'，加 export const Config: z<Config> = z.object({ seedAdminId: z.string().optional(), seedAdminPassword: z.string().optional(), seedTenantId: z.string().optional() })。跑 admin specs + typecheck。

2. eval-runner fail-loud（R8 task）— PB-deferred-eval-runner-fail-loud-runbatch.md
   constructor throw 破 7 处 mechanics 测试。走方案 A：throw 挪到 runBatch（provider/model 实际被 LLM call 消费之处）。先读 runBatch 找消费点 + 加 if (!this.provider || !this.model) throw。验证 runBatch-with-stub 测试在 check 之前已 stub 掉 LLM seam。跑 eval-runner specs。

3. phase-gate typed scope event（R9 task）— PB-deferred-phase-gate-typed-scope-active-changed.md
   import type {} from '@deepseek-ai/dsh-scope-registry' 落到 src（lib .d.ts 未构建）→ TS6059。修：① 加 @deepseek-ai/dsh-scope-registry 为 phase-gate devDep；② 确保 scope-registry 的 lib/types/index.d.ts 被构建；③ 去掉 (ctx as unknown as {...}).on(...) cast 改 ctx.on('scopes/active-changed', () => {...})；④ 删"cast until … ships"注释。跑 phase-gate specs + typecheck 确认 TS6059 消失。

4. patrol-mode Config（R6 task）— PB-deferred-patrol-mode-config-or-removal.md
   无 Config 的 extreme case。5 步：import z + static Config: z<PatrolConfig> = z.object({ maxEditsPerRound: z.number().default(DEFAULT_MAX_EDITS_PER_ROUND), confirmTimeoutMs: z.number().default(DEFAULT_CONFIRM_TIMEOUT_MS), scope: z.string().default('') }) + constructor(ctx, config) + apply(ctx, config){ctx.plugin(PatrolService, config)} + start() 回退 this.config.*。注意：patrol-mode 无 removal 提议（早先 ticket 引用的 note 不存在，已修正）——直接加 Config。跑 patrol-mode specs。

5. tool-search query-expansion fail-loud（R8 grilling/决策）— PB-deferred-tool-search-query-expansion-fail-loud.md
   两选皆非纯加法：A 翻 queryExpansion 默认 false（回退 P15a 召回 + 可能破测试）；B 加 session event + env-aware load-time 检查。先 grilling 定方向，再实施。若选 A，先跑 tool-search specs 确认默认 false 不破。

6. llm-dashscope settings-write reject（R8 borderline）— PB-deferred-llm-dashscope-settings-write-reject.md
   当前 ERROR-log + lastGood（韧性设计，非静默）。理想修法在 options() 之外（settings 写入路径拒绝坏段）。先 grilling：接受为 borderline-acceptable（不改），还是定位 settings-writer 加写时校验。若不改，更新 ticket 标"accepted as resilience"。

## 完成后
- 每项跑相关 spec + pnpm run typecheck + pnpm run lint（只关注我方文件）。
- 派 subagent 做 code review + 独立 spec 验证（避免自审盲区）。
- 更新 6 张 ticket status → resolved + 写 resolution；更新 map PB-COMPLY 条目（6 延后 → 0，或记录哪些 grilling 后定方向）。
- commit。

## 另：跨包 reconcile（audit 不一致，留后续，不在 6 延后内）
data-tools-B/creds audit 把其它插件（data-tools、tool-subagent 等的裸 ctx.tools.register）标 clean——源码确认同机制也会泄漏（绑服务 fiber）。建议单独一轮跨包 audit：grep 所有在 apply 里未被 ctx.effect 包的裸 ctx.tools.register( / ctx.systemPrompt.section(，按 PB-COMPLY 同法修。
```
