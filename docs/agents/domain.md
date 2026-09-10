# Domain docs

English | [中文](domain.zh.md)

工程技能在探索代码前，按本文件读取本 Fork 的 Data Agent 领域文档。

## 读取顺序

若根目录存在 `CONTEXT-MAP.md`，先读取它，再读取与当前任务相关的上下文 `CONTEXT.md`。同时读取涉及当前范围的系统级 `docs/adr/` 与上下文局部 `docs/adr/`。文件不存在时继续工作，不把缺失本身当作待办。

## 范围

领域地图只索引本 Fork 独立的 Data Agent 内容。`packages/data/` 是首个预期上下文根；语义层、评测、查询、检索、嵌入、身份与 `packages/bundle/data-agent/` 只有在形成独立领域词汇时才拆分为单独上下文。

`packages/core/`、`packages/session/`、`packages/shell/` 及其他 upstream DSH 核心区域不属于 Data Agent 领域地图。任务跨越该边界时，按仓库的 `AGENTS.md`、架构文档和 upstream 约定理解 DSH，不把 DSH 基础设施术语写入 Data Agent 的 `CONTEXT.md`。

## 文件布局

首次形成 Data Agent 领域术语时，在根目录创建 `CONTEXT-MAP.md`，并在对应上下文根目录按需创建 `CONTEXT.md`。系统级 ADR 位于 `docs/adr/`；上下文局部 ADR 位于该上下文的 `docs/adr/`。不预建空文件或空目录。

`CONTEXT.md` 只保存规范术语、定义、关系与明确避免的同义词，不保存实现细节、计划或决策理由。仅当决策难以逆转、缺少背景会显得意外且确有取舍时才创建 ADR。

## 使用规范术语

issue 标题、方案、测试名和实现说明使用相关 `CONTEXT.md` 中的规范术语。遇到未定义或冲突术语时，先澄清并更新对应上下文；若输出与现有 ADR 冲突，明确指出冲突，而不是静默覆盖。
