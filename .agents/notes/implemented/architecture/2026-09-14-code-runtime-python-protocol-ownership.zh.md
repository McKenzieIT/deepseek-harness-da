# Agent Note: CPython 代码 runtime 协议的正式所有权

Status: implemented

[English](2026-09-14-code-runtime-python-protocol-ownership.md) | 中文

## 问题

正式 `@deepseek-ai/dsh-code-runtime-data-python` 提供方与私有 `@deepseek-ai/dsh-experimental-ptc-runtime-python` 提供方实现相同的 fd-3 帧类型、无损 JSON helper 与敌意帧校验器。Release 成员不能要求被排除在 release family 之外的私有提供方，共享协议行为也需要一个独立于任一提供方的所有者。

## 决策

[`@deepseek-ai/dsh-code-runtime-python-protocol`](../../../../packages/code-runtime/code-runtime-python-protocol/README.zh.md) 是无版本 fd-3 协议的正式 TypeScript 所有者。它包含帧类型与字段元数据、`PROTOCOL_FD`、无损 JSON encoder 与字节计量器、不安全整数及非无损数字检测、child 帧重建，以及共享日志截断标记。它没有运行时依赖或可变状态，包依赖策略把独立安装的副本归类为可互换。

`@deepseek-ai/dsh-code-runtime-data-python` 直接依赖正式协议包，而 `@deepseek-ai/dsh-experimental-ptc-runtime-python` 自带其自己的协议模块。data 提供方对私有提供方不存在 dependency、optional dependency、peer dependency 或 development dependency，因此 release 打包永远不会触及它。

提供方继续拥有进程启动、`JSON.parse` 前的原始帧大小上限、资源预算、Python bootstrap 代码与 teardown。data 提供方拥有 `py/bootstrap.py`，即其自身运行的 Python 侧。[fd-3 协议决策](2026-07-31-ptc-runtime-python-fd3-protocol.zh.md)仍是 wire 语义与敌意输入处理的权威。

## 考虑过的替代方案

**把协议留在私有提供方并增加 release 例外。**这会让已发布包继续依赖 release 打包有意排除的 artifact。例外只会掩盖无效安装图，而不会使共享实现可发布。

**把 TypeScript 协议复制到 data 提供方。**独立副本会让帧字段、校验、精确整数编码与字节核算发生漂移。一个正式实现让两个提供方保持相同的已测试行为。

**把所有 Python bootstrap artifact 移入协议包。**两个提供方拥有不同的 bootstrap 实现、进程策略与打包要求。共享模块只拥有 TypeScript wire vocabulary 和纯校验／编码行为；提供方特定的 Python 执行仍保持本地所有权。

## 后果

Release 打包可以安装 `@deepseek-ai/dsh-code-runtime-data-python`，而无需任何私有实验包。协议行为拥有一个公开实现和一套纯 TypeScript 测试，该提供方则保留生命周期与真实子进程覆盖。帧 vocabulary 的变更必须同时更新正式包、data 提供方的 bootstrap、该提供方的测试与协议文档。
