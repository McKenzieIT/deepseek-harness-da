# vendor-tarballs

[English](README.md) | 中文

签入仓库的 npm 包 tarball，dsh 把它们当作普通（非工作区）依赖安装。

## `semantic-grounding-substrate-0.1.6-alpha.2.tgz`

宿主中立的 semantic-grounding 底座，发布名为
`@semantic-grounding/substrate`。它从 `packages/data/semantic-layer/`
中抽取到自己的仓库（`McKenzieIT/semantic-grounding`）；本仓该路径下留下的是一层很薄的
cordis 适配器，把底座重新导出到 `ctx.schema` 这个接缝后面。

该文件由 semantic-grounding 仓的 `npm pack` 产出 —— 它就是可发布的那个制品本身
（`lib/index.js`、`lib/index.d.ts`、`package.json`），不是源码检出。

### 为什么要签入仓库

- dsh 把底座当作**非工作区安装**来消费。它不是 `packages/*` 成员，也不是
  `vendor/*` 工作区链接，所以 pnpm 需要一个具体的制品才能解析。
- 它**没有注册表发布**。底座不在 npm 上（alpha 这条线也不打算上），所以对着注册表写
  版本区间是解析不出来的。签入 tarball 让 CI 和每个开发者的安装都保持封闭可复现，
  不需要额外的凭证或网络源。
- 类型检查走 tarball 自己的 `exports["."]` barrel，所以 dsh 始终是对着真正发布出去的
  那个面编译，而不是对着仓内源码。

### 它是怎么接上的

`pnpm-workspace.yaml` 里有一条 override，把所有消费方都钉到这个文件上：

```yaml
overrides:
  '@semantic-grounding/substrate': 'file:./vendor-tarballs/semantic-grounding-substrate-0.1.6-alpha.2.tgz'
```

各个包声明的是语义化版本区间 `^0.1.6-alpha.2`（`file:` 这种写法不是合法的
`peerDependencies` 区间，所以路径才放在 override 里）。保证只解析出一份拷贝靠的就是这条
override —— 底座持有模块级单例，因此共享同一个实例是正确性要求，不只是体积优化。

### 更新步骤

1. 在 semantic-grounding 仓跑 `npm pack`。
2. 把新的 `.tgz` 放到这里，删掉被取代的那个。
3. 更新 `pnpm-workspace.yaml` 的 `overrides` 块里的 `file:` 路径，以及各消费方
   `package.json` 里的 `^<version>` 区间。
4. 跑 `pnpm install`，然后确认 `ls node_modules/.pnpm | grep semantic-grounding`
   仍然只报告一个条目。
