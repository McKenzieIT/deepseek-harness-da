---
description: "供 CPython 代码 runtime 提供方共享的 fd-3 帧类型、无损 JSON codec 与敌意输入校验器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-code-runtime-python-protocol

[English](README.md) | 中文

## 概述

`dsh-code-runtime-python-protocol` 是 DSH CPython 代码 runtime 提供方所使用 fd-3 JSON-lines 协议的正式、无依赖 TypeScript 所有者。它定义 host 与 child 帧类型、精确 JSON 编码和字节计量、敌意 child 帧重建、不安全整数 token 检测，以及共享日志截断标记。提供方包负责进程启动、解析前帧大小限制、Python bootstrap、资源限制与 teardown。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 Node host 使用 DSH CPython fd-3 协议时依赖本包。导入 `BootMessage`、`ChildToHost` 与 `ReplyMessage` 为帧提供类型；使用 `encodeJsonPlain` 输出无损 JSON，在读取不可信 child 帧前调用 `validateChildFrame`，在 `JSON.parse` 前调用 `hasUnsafeIntegerToken`，并在解析完成值后调用 `checkDoneValue`。`PROTOCOL_FD`、`WIRE_FRAME_FIELDS`、`jsonStringBytesUpTo`、`hasNonLosslessNumber` 与 `logTruncationMarker` 支持提供方接线、镜像检查与精确字节核算。

本包不读取流，也不启动进程。提供方必须在解析前限制每个原始 fd-3 帧，按照 `validateChildFrame` 丢弃畸形帧，并应用自己的生命周期与资源策略。Python 侧仍归提供方所有，因为不同提供方的 bootstrap 行为、打包与进程约束不同；实验性提供方的真实 Python 镜像测试会把其 `py/protocol.py` 声明与本包对照。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

该模块对深层或宽 JSON 值采用迭代遍历，逐字段重建已接受的 child 帧，并在不物化转义字符串副本的情况下完成字节核算。它没有运行时依赖或可变进程状态，因此独立安装的副本可互换。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 帧类型、帧字段元数据、无损 JSON codec 与计量器、敌意帧校验、协议常量 |
| [`tests/protocol.spec.ts`](tests/protocol.spec.ts) | 纯 TypeScript 行为与敌意输入覆盖 |
| — | 不发布运行时不变量配套入口；本包拥有无状态 wire 值与校验函数，流顺序和进程生命周期由提供方测试覆盖。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Data Python 提供方](../code-runtime-data-python/README.zh.md)——供 data-agent Python 执行使用的正式 consumer。
- [实验性 Python 提供方](../../experimental/code-runtime-python/README.zh.md)——保留兼容重导出的私有源码检出 consumer。
- [fd-3 协议 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-31-code-runtime-python-fd3-protocol.zh.md)——wire 语义与敌意输入 rationale。
- [协议所有权 Agent Note](../../../.agents/notes/implemented/architecture/2026-09-14-code-runtime-python-protocol-ownership.zh.md)——包所有权与兼容性决策。

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **仅包含 TypeScript host 行为**——提供方仍拥有其 Python bootstrap 或声明镜像、解析前原始帧上限、进程生命周期与资源策略；导入本包不会构成完整的提供方实现。
- **无版本 wire**——协议没有协商或降级路径。帧字段或语义变化时两侧必须一起更新，提供方镜像测试是可执行的漂移检查。

-----

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
