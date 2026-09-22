---
description: "data-agent 代码执行包的包映射：Python 程序执行能为你做什么，以及每个部分由哪个包负责。"
kind: "package-group"
---

# code-runtime/——data-agent Python 执行家族

[English](README.md) | 中文

## 概述

`code-runtime/` 组运行 data-agent 的 Python 程序：模型编写一个 pandas/numpy 程序，以普通异步调用的方式调用宿主提供的函数，运行只返回该程序打印和返回的内容。挂载 data Python 后端即注册 `ctx.ptcRuntime`；CPython 提供方需要直接使用 fd-3 帧类型时，则依赖正式的协议包。每次运行都不会保留之前程序的状态。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

这两个包提供 data-agent 的执行后端与它所说的协议库；每个 README 描述其各自部分做什么。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`code-runtime-data-python/`](code-runtime-data-python/README.zh.md) | 在全新 CPython 子进程中执行提供 pandas/numpy 的 data-agent Python 程序 | 注册 `ctx.ptcRuntime` |
| [`code-runtime-python-protocol/`](code-runtime-python-protocol/README.zh.md) | 拥有供 CPython 提供方共享的正式 fd-3 帧类型、无损 JSON codec、字节计量器与敌意帧校验器 | — |

-----

<a id="related-documentation"></a>
## 相关文档

先从子系统参考了解服务约定，再看定义它的那个组、消费此能力的 PTC mode 设计，以及它所遵循的能力 seam 模型。

- [PTC runtime 子系统参考](../../docs/subsystems/ptc-runtime.zh.md)——请求／结果词汇、binding 与 `ctx.ptcRuntime` 的 Cordis 接口面。
- [`ptc-runtime/` 组](../ptc-runtime/README.zh.md)——本家族所实现的 Service Definition，旁边就是 TypeScript 后端。
- [PTC mode Agent Note](../../.agents/notes/implemented/feature/2026-06-15-ptc.zh.md)——工具注册表如何把 `run_code` 呈现给模型。
- [能力 seam](../../docs/capability-seams.zh.md)——本家族遵循的 Service Definition / Service Provider / Consumer 拆分。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
