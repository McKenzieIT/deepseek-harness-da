# Agent Note: CPython 代码 runtime 协议的正式所有权

Status: implemented

[English](2026-09-14-code-runtime-python-protocol-ownership.md) | 中文

## 问题

正式 `@deepseek-ai/dsh-code-runtime-data-python` 提供方与私有 `@deepseek-ai/dsh-experimental-code-runtime-python` 提供方使用相同的 fd-3 帧类型、无损 JSON helper 与敌意帧校验器。Release 成员不能要求被排除在 release family 之外的私有提供方，共享协议行为也需要一个独立于任一提供方的所有者。

## 决策

[`@deepseek-ai/dsh-code-runtime-python-protocol`](../../../../packages/code-runtime/code-runtime-python-protocol/README.zh.md) 是无版本 fd-3 协议的正式 TypeScript 所有者。它包含帧类型与字段元数据、`PROTOCOL_FD`、无损 JSON encoder 与字节计量器、不安全整数及非无损数字检测、child 帧重建，以及共享日志截断标记。它没有运行时依赖或可变状态，包依赖策略把独立安装的副本归类为可互换。

`@deepseek-ai/dsh-code-runtime-data-python` 与 `@deepseek-ai/dsh-experimental-code-runtime-python` 都直接依赖正式协议包。data 提供方对私有提供方不存在 dependency、optional dependency、peer dependency 或 development dependency。实验性包通过从正式包重导出来保留既有根级协议类型与 helper 导出，因此其既有入口调用方无需修改 import。

提供方继续拥有进程启动、`JSON.parse` 前的原始帧大小上限、资源预算、Python bootstrap 代码与 teardown。实验性提供方还拥有其 Python 声明镜像 `py/protocol.py`；它的真实 Python 镜像测试会把该文件与正式 TypeScript 包比较。[fd-3 协议决策](2026-07-31-code-runtime-python-fd3-protocol.zh.md)仍是 wire 语义与敌意输入处理的权威。

## 考虑过的替代方案

**把协议留在私有提供方并增加 release 例外。**这会让已发布包继续依赖 release 打包有意排除的 artifact。例外只会掩盖无效安装图，而不会使共享实现可发布。

**把 TypeScript 协议复制到 data 提供方。**独立副本会让帧字段、校验、精确整数编码与字节核算发生漂移。一个正式实现让两个提供方保持相同的已测试行为。

**把所有 Python bootstrap artifact 移入协议包。**两个提供方拥有不同的 bootstrap 实现、进程策略与打包要求。共享模块只拥有 TypeScript wire vocabulary 和纯校验／编码行为；提供方特定的 Python 执行仍保持本地所有权。

## 后果

Release 打包可以安装 `@deepseek-ai/dsh-code-runtime-data-python`，而无需任何私有实验包。协议行为拥有一个公开实现和一套纯 TypeScript 测试，每个提供方则保留生命周期与真实子进程覆盖。实验性包新增一个正式运行时依赖，但将既有根导出保留为兼容别名。帧 vocabulary 的变更必须同时更新正式包、受影响的 Python 镜像或 bootstrap、两个提供方的测试与协议文档。
