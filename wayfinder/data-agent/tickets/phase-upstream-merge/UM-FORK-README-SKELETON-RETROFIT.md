# UM-FORK-README-SKELETON-RETROFIT — 65 fork 包 README 缺 upstream doc-standard skeleton

**Type**: task
**Phase**: upstream-merge
**Status**: open (2026-09-13 从 [UM-C-GATES Cluster D apply](UM-C-GATES-UPSTREAM-NEW.md) 拆出——scope 订正后 Gate 3 从"~10 min WAIVE"变"~1-2 session mass retrofit"，本票承接)
**Assignee**: unclaimed
**Blocked by**: —
**Blocks**: [UM-C-GATES](UM-C-GATES-UPSTREAM-NEW.md) 的 `documentation standard tests` KNOWN-RED 转为 GREEN
**Related**: [UM-C-GATES Cluster D grilling 2026-09-13](UM-C-GATES-UPSTREAM-NEW.md#resolution)

## Question

`scripts/doc-standard.spec.ts` 里的两个 failing tests：
- `maps package README kinds to their documentation standards`
- `keeps every package README on the summary, contents, and Dev Note skeleton`

要求每个 `packages/*/*/README.md` 都必须：
1. 有 YAML frontmatter：`kind: <package-group|package-reference|package-library|package-bundle>` + `description`
2. 有 `## Summary` / `## Table of Contents` / `## Dev Note` 三个 headings（英文）
3. zh.md 有对应的 `## 概述` / `## 目录` / `## 开发备注`

**实测（2026-09-13 Cluster D apply session）**：
- 总 package READMEs：**329 个**
- 缺 frontmatter：**65 个**（且经确证多为 fork 独有包）
- Cluster D grilling 原估「~10 min WAIVE」严重低估——真实 mass retrofit 是 65 × 2 = 130 file edits 的机械工作

**Cluster D apply 决策（用户 2026-09-13）**：**KNOWN-RED permanent**，不做 mass retrofit（"按推荐批准 + fork 按需重构 + 1.0 后再发布"原则），单开本票承接。

## Scope

1. 枚举全部 65 个缺 frontmatter 的 fork package README（md + zh.md）
2. 逐个补 YAML frontmatter（`kind` 从 `expectedKind(file)` 推导：group/reference/library/bundle；`description` 一句话本包定位）
3. 逐个补 `## Summary` / `## Table of Contents` / `## Dev Note`（zh: `## 概述` / `## 目录` / `## 开发备注`）
4. 保 zh 双语面同步（`verify-translation-pairing --write` 每个 pair 后）
5. 完成后 `pnpm exec vitest run scripts/doc-standard.spec.ts` GREEN，2/12 → 12/12

**已完成的 sample**（Cluster D apply 期间落地）：`packages/bundle/data-agent/README.{md,zh.md}` 作 correct skeleton 示例。

## 落地策略候选

**A. 一次性 mass retrofit**（~1-2 session）
- 按包组批量处理（llm/embedder/retrieval/query/data/client-ui/subagent…）
- 每包补 frontmatter + 3 sections（内容可留占位符 "TODO: fill in Summary..." 待作者补）
- 目标：Gate 3 一次到 GREEN

**B. 分包组渐进 retrofit**（~5-8 session，每 session 1 组）
- 按 phase-owner 分工（P4-P11 各自 owner 完善自家包 README）
- 每 session 收敛几个到几十个包
- Gate 3 长期红，逐渐减少

**C. Retrofit + tooling improvement**（~2-3 session）
- 加 `scripts/gen-package-readme-skeleton.ts` 自动补骨架
- 一次跑覆盖全 65 包
- 类似 gen-tsconfig-paths 的自维护模式
- 长期防止新增包漏 skeleton

**推荐**：C（工具化 + 一次性）——避免 A 的手工遗漏 + B 的长期红门。

## Acceptance

- `pnpm exec vitest run scripts/doc-standard.spec.ts` 全绿（12/12）
- 65 个 fork 包 README（md + zh.md）都有 frontmatter + 3 headings
- 若走 C：`scripts/gen-package-readme-skeleton.ts` 就位 + spec 增 verify 变体

## Estimated: ~1-2 session (option A) or ~2-3 session (option C)
