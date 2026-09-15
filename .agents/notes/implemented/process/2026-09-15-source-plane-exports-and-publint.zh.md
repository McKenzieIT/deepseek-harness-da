# Agent Note：源码平面导出不进入发布载荷

Status: implemented

[English](2026-09-15-source-plane-exports-and-publint.md) | 中文

## 问题

工作区源码启动与 Cordis 配置行会直接解析 `@deepseek-ai/dsh-*/src/*`，而 DSH 发布 tarball 按约定只发布构建后的 `lib/` 产物，不发布 TypeScript 源码。因此，即使产物导出完整，publint 仍会报告源码导出 glob 未匹配。另一个独立问题是：构建后的入口可能导入不在精确 `files` 清单中的生成 sibling chunk，造成真实损坏的发布产物。

## 决定

仓库保留 `./src/*` 导出供源码平面执行使用；由于源码树不属于发布载荷，publint 的源码 glob 未匹配消息仅作提示。publint runner 仍会因缺失的产物导出，以及 manifest 声明的发布视图之外的 JavaScript 或 CSS import 而失败。

采用精确产物清单的包必须生成自足入口。`tool-edit-definition` 与 `tool-revert-edit` 禁用 code splitting，其 semantic-layer import 使用包根入口。semantic-layer 根入口导出这两个工具动态加载的操作。

## 考虑过的替代方案

- 发布所有包的 `src/` 树：否决，因为 DSH 发布载荷只包含产物，release verifier 会排除源码。
- 删除 `./src/*`：否决，因为受支持的源码启动与配置行会在工作区 checkout 中解析源码子路径。
- 发布生成的 hash chunk：否决，因为其名称不稳定，精确 package manifest 会在每次构建后需要生成式修改。
- 忽略全部 publint warning 或 error：否决，因为缺失构建导出和缺失相对 import 目标是发布缺陷。

## 后果

源码平面 import 在仓库执行中保持可用，但不构成已安装包 API。publint 可以打印已知的源码 glob 未匹配诊断而不失败。精确产物清单保持确定性，发布闭包检查会拒绝任何新的未列入清单的 split chunk。