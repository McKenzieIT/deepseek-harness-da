# PB-deferred: llm-dashscope 拒绝坏 settings（写时）

**Type**: task (AFK) — borderline
**Phase**: misc
**Status**: ⏳ deferred (2026-09-03) — borderline-acceptable
**Spawned from**: PB-COMPLY plugin-body audit, R8 finding `packages/llm/llm-dashscope/src/index.ts:243`

## Question

`options()` resolver：首次解析 throw（fail loud ✓）；后续坏 settings 段（已有 `lastGood` 时）catch + `ctx.logger.error` + `return lastGood`——继续用旧 config 而非 fail。audit 标 R8（"inattentive operator 留坏段 live，plugin 顶着旧 config"）。

## 判断

**borderline**：已 `ctx.logger.error`（**非静默**，ERROR 级可见），`lastGood` 是**刻意韧性设计**（bad settings push 不破所有 in-flight 请求）。规则字面要求"fail loud"（=fail），但 LLM adapter 每 request 失败太激进。

## 决策点

- **A（理想，out of `options()` scope）**：在 settings **写入**路径拒绝坏段（bad section 写时被拒，永不进 active config）——需先定位 settings-writer 代码（非 `options()`），加 resolveAdapterOptions 校验 + reject。
- **B**：保持 `lastGood` + ERROR-log（接受为韧性设计，标 borderline-acceptable）。

## 为何留后续

理想修法（A）在 `options()` 之外（settings-write 路径），需先定位 writer；且当前 ERROR-log 已使问题可见（非静默），不紧迫。
