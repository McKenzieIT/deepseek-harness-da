---
type: grilling
status: open
blocked_by: []
---

# CB-5: DA 的 CI 寄生在上游 workflow 上（darwin 腿安装步骤膨胀的结构根因）

**Branch**: `fix/cb1b-pwsh-pty-evaluation`（本票的 ② 已落地，其余 open）

## 原则（用户裁定，2026-09-07）

> dsh-data-agent 的 CI 应该只检查额外增加的非上游 dsh 的内容，不应该去影响上游。

## 事实

本仓库是 `deepseek-ai/deepseek-harness`（上游 dsh）的 fork：

```
origin    https://github.com/McKenzieIT/deepseek-harness-da.git
upstream  https://github.com/deepseek-ai/deepseek-harness.git
```

**16 个 workflow 里 15 个是上游的**，DA 自有的只有 `no-production-src-on-master.yml`。所以 DA 没有属于自己的 CI 腿 —— 每加一个 DA 包，都自动被 `pnpm run test` 拖进上游的每一条腿，包括 macOS seatbelt 那条。

`sandbox.yml` 的 `Unit tests (darwin parity)`（在 seatbelt 腿上跑**全量**单测）是上游 `7b8c3a9b40`（2026-07-09，作者 `kingwl <kingwenlu@gmail.com>`）引入的，设计时仓库里只有 dsh 的包。DA 随后加入的包带来了上游那条腿从未准备过的系统依赖：

| DA 新增包 | 首次出现 | 带来的依赖 |
| --- | --- | --- |
| `packages/data/semantic-layer` | 2026-08-20 | 需要 `build:lib:host`（vendored cordis 经 lib 解析） |
| `packages/eval/eval-cli` | 2026-08-26 | 需要 `~/.dsh/.credentials.yaml` |
| `packages/code-runtime/code-runtime-data-python` | 2026-08-26 | 需要 pandas / numpy |

于是 2026-09-06 一天里，`sandbox.yml` 被改了 7 次来结这笔账（`d85c8ba390` / `a67a4e93de` / `3f733913aa` / `f882743885` / `25ead923e3` / `74f775e6af` / `844359a27a`）。**上游那条腿一步都不用装**，因为上游没有这些包。

Sandbox 在整个可查窗口从未绿过：9-04 → 9-06 共 45 failure / 8 cancelled / **0 success**。9-05（任何安装步骤之前）是 7 failed / 993 passed / 9 skipped。

**注意**：日志里"大量报错"绝大多数是负向测试故意打到 stderr 的噪音（`entry boom`、`inject boom`、`presenter exploded`、`selector boom`），不是失败。

## ② 已落地：把 DA 的依赖从上游 `sandbox.yml` 里撤出

让需要前置条件的 suite **自己拥有**前置条件，然后删掉那两个 CI 步骤：

- `packages/eval/eval-cli/tests/main.spec.ts` —— 建隔离 home（`mkdtempSync` + `.dsh/.credentials.yaml`，`HOME` 与 `USERPROFILE` 同设，因为 `os.homedir()` 在 POSIX 读前者、Windows 读后者，且本 suite 两边都跑）。**顺带修掉一个真 bug**：`main.ts:245-249` 的凭据前置检查**只看文件、完全不看 `process.env`**，所以该 suite 原本断言的是"宿主碰巧有没有跑过 eval"——在有 `~/.dsh/.credentials.yaml` 的机器上绿、其它一律红。本机以 `HOME=<空目录>` 实测复现了 CI 的 `expected 1 to be +0`，修后同条件 5/5 绿。另外 `missing DASHSCOPE_API_KEY exits 1` 改用空 home，这样它才是为**正确的理由**退 1。
- `packages/code-runtime/code-runtime-data-python/tests/runtime.spec.ts` —— `pandas compute` 那组按依赖可用性 gate：探测**运行时真正会 spawn 的解释器**（`Config.pythonPath`，默认 `python3`），沿用 `terminal-bash/local.spec.ts` 的 `hasPwsh` 惯例。双向实测：有 pandas 时 23 个全跑（不被白跳）；PATH shim 掉 pandas 后 21 passed / **2 skipped**。
- `sandbox.yml` —— 删掉 `Write DASHSCOPE_API_KEY …` 与 `Install pandas/numpy …` 两步。

**副产品**：不再需要把真的 `secrets.DASHSCOPE_API_KEY` 写进 runner 文件系统 —— 那个测试只要求 key **非空**、不要求有效（`main.ts:247` 的正则 `/^DASHSCOPE_API_KEY:[ \t]*\S/m`），假值就够。

### #36 的 pip 步骤本来就不可能生效（实测）

删掉它不只是"更整洁"，而是唯一正确的做法：**它装错了解释器**。运行时 spawn 时用 `env: {}`（`src/index.ts:221-224`），于是 `PATH` 未设，裸 `python3` 只经 execvp 默认搜索路径解析；而 `python3 -m pip install …` 这个 CI 步骤跑在 runner 正常 `PATH` 下，命中的是另一个 python。本机实测两者确实分叉：

```
PATH 继承（pip 会装到这里）-> /opt/homebrew/opt/python@3.13/bin/python3.13
env:{}（运行时实际用这个）  -> /Applications/Xcode.app/Contents/Developer/usr/bin/python3
```

`README.md` 的 Known Limitations 早已记下这个陷阱（"`pythonPath` should be an absolute path when the interpreter is outside the OS default search path"）。所以**即使加上 `--break-system-packages` 修掉 PEP 668，pandas 测试依旧会挂** —— pandas 被装进了运行时永远不会用的解释器。PEP 668 只是先撞上的那一层。

这也解释了为什么本次的 gate 必须在 `env: {}` 下探测：探测与运行时必须解析同一个解释器，否则会出现"探测说有、运行时没有"的假绿。

**推论（供 Q1 参考）**：若将来真要在 darwin 上覆盖 pandas 路径，正确做法不是往上游 workflow 加 pip 步骤，而是让配置显式 `pythonPath` 指到一个绝对路径解释器，并对那个解释器装依赖。

## Question（待决策）

1. **DA 要不要建自己的 CI 腿？** 现状是 15/16 workflow 属上游、DA 无自己的腿。若建，边界怎么划（DA 包清单？路径过滤？），上游 workflow 是否要回收到 pristine 以便干净合并？
2. **`build:lib:host` + `NODE_OPTIONS=4G` 怎么处理？**（③）它同时修了 DA 的 `semantic-layer` ×2 **和上游的** `packages/typert/generator`（9-05 挂、9-06 绿）。既然它也修上游测试，那到底是 DA 的 vendoring/vite8 环境问题，还是上游在 fork 环境下的问题？撤掉会让 3 个测试重新挂，所以本 session **保留未动**。
3. **DA 改上游测试算不算越界？**（⑤）`74f775e6af`（PR #35）改的是**上游的** `scripts/ci-workflow.spec.ts`，为的是适配 DA 自己的 `DSH_CI_FAILOVER_WINDOWS` 配置。按本票原则这是反向影响上游，需要决定：是回退并改用别的方式，还是接受这类适配。
4. **DA 改动打破上游测试怎么办？**（④）CB-4（PR #30）把 zod 做成 platform module，`packages/client/web/package.json` 出现 `"zod": "^4.4.3"`，而上游 `scripts/client-bundle-purity.spec.ts:115` 断言 `neverBundle('zod') === false`（`neverBundle: isProductionDependency`，`packages/client/tsdown.client.ts:238`）。本机实测：17 tests、1 failed、`expected true to be false`。CB-4 已 closed（session inactive），所以这条需要归属决定。

## 关键文件

- `.github/workflows/sandbox.yml`（上游共享；`Unit tests (darwin parity)` + DA 追加的安装步骤）
- `packages/eval/eval-cli/src/main.ts:245-249`（凭据前置检查只读文件，不读 `process.env`）
- `packages/eval/eval-cli/tests/main.spec.ts`（② 已改：隔离 home）
- `packages/code-runtime/code-runtime-data-python/tests/runtime.spec.ts`（② 已改：pandas gate）
- `scripts/client-bundle-purity.spec.ts:115` + `packages/client/tsdown.client.ts:238`（④）
- `scripts/ci-workflow.spec.ts`（⑤，上游测试被 PR #35 改动）
- `packages/util/home-paths`（有 `dshHomePath()` / `DSH_HOME` 约定，而 eval-cli 三处硬编码 `join(homedir(), '.dsh', ...)` —— `main.ts:245`、`context.ts:519`、`harness-responder.ts:284`；可能值得统一，但属 src 改动，本 session 未碰）

## 关联

- [CB-1b](CB1b-pwsh-pty-evaluation-bug.md) —— 按同一原则关闭（上游代码）；其根因分析仍有效，作为给上游提 issue 的材料。
- [CB-1a](CB1a-cold-boot-stabilization.md) —— 那 7 个 `sandbox.yml` commit 的出处。
- [CB-4](CB4-zod-externals-drift.md) —— ④ 的源头。
