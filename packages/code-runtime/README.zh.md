---
description: "代码执行能力族的包映射：程序执行能为你做什么，以及每个部分由哪个包负责。"
kind: "package-group"
---

# code-runtime/——代码执行能力族

[English](README.md) | 中文

## 概述

`code-runtime/` 组让模型编写一个程序，以普通异步调用的方式调用宿主提供的函数，然后只返回程序的打印输出和返回值。如需在隔离的 Node Worker 中执行，请选择 TypeScript 后端；如需 pandas/numpy 工作负载，请选择正式的 data Python 后端；如需源码检出测试，请选择私有实验性 Python 后端。两个 Python 提供方共享一个正式 fd-3 协议库，每次运行都不会保留之前程序的状态。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

这五个包提供代码 runtime 定义、共享协议与执行后端；每个 README 描述其各自部分做什么。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`code-runtime/`](code-runtime/README.zh.md) | 定义代码 runtime 做什么：针对宿主提供的 binding 运行一个程序，并报告其打印和返回的内容 | `ctx.codeRuntime` |
| [`code-runtime-python-protocol/`](code-runtime-python-protocol/README.zh.md) | 拥有供 CPython 提供方共享的正式 fd-3 帧类型、无损 JSON codec、字节计量器与敌意帧校验器 | — |
| [`code-runtime-worker-thread/`](code-runtime-worker-thread/README.zh.md) | 在全新的 Node Worker 线程中执行 TypeScript 程序 | 注册 `ctx.codeRuntime` |
| [`code-runtime-data-python/`](code-runtime-data-python/README.zh.md) | 在全新 CPython 子进程中执行提供 pandas/numpy 的 data-agent Python 程序 | 注册 `ctx.codeRuntime` |
| [`experimental/code-runtime-python/`](../experimental/code-runtime-python/README.zh.md) | 私有源码检出 CPython 后端，提供更严格的解释器探测、进程组 teardown 与协议兼容重导出 | 注册 `ctx.codeRuntime` |

-----

<a id="related-documentation"></a>
## 相关文档

先从子系统参考了解服务约定，再看消费此能力的 PTC mode 设计，以及它所遵循的能力 seam 模型。

- [代码 runtime 子系统参考](../../docs/subsystems/code-runtime.zh.md)——请求／结果词汇、binding 与 `ctx.codeRuntime` 的 Cordis 接口面。
- [PTC mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——工具注册表如何把 `run_code` 呈现给模型。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
