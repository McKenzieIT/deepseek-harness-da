# Benchmark 打包与运行时注册：一手框架调研

日期：2026-09-11

## 结论先行

被核验框架没有形成“纯 benchmark 内容必须注册成可执行扩展”的共同模式。反复出现的是三类需要分别识别的对象：内容（数据/manifest，身份可由 digest、git revision 或 checksum 表达）、可执行代码（package + entry point 或包内 registry）以及可选的环境镜像（container registry + digest pin）。实现既有耦合也有分离：AgentCompass 将部分 benchmark 数据作为 package-data 随代码发布，HELM 将 scenario definitions 随主包发布；Inspect、Harbor、MLflow/HF 等则不同程度地让内容脱离可执行扩展独立更新。

与 DSH 提议的 `BenchmarkRepository` 最接近的一手实现是 Harbor 的 `PackageTaskId`：`org/name/ref`，其中 ref 可以是 `sha256:` digest，本地缓存路径由 digest 计算（content-addressed cache）；Harbor-Index 在其上叠加了 split-pin 发布模型——源码在 git main，预构建镜像 digest pin 只存在于 release ref + signed tag，官方明确表述为 "PyPI-style：the repo holds source; the tag-triggered release holds the artifact pins"。

对 DSH 三个候选模型的裁定（详见“对 DSH 的建议”，属 DSH 判断而非来源事实）：**hybrid companion-plugin 模型**最符合一手实践与 DSH 约束——benchmark 内容是 content-addressed 数据 artifact（不执行代码、digest 即身份），可执行能力（grader mechanism、importer、fixture builder）是 companion Cordis plugin，环境镜像通过独立 digest pin 引用。每 pack 一个 Cordis plugin 的 package-first 模式有 AgentCompass package-data 与 HELM 同包 scenario definitions 等相关先例，但会把内容更新绑定到代码发布，并削弱 heldout 隔离；反过来，纯 artifact 也不能替代 executable mechanism，Inspect entry points、lm-eval registry/插件和 Harbor verifier 脚本都表明可执行扩展仍需代码分发通道。

## 范围与方法

本文只采用一手来源：官方文档、官方仓库固定 commit 的源码/manifest、官方 API 文档。核验的仓库 commit 与姐妹篇 [data-evaluation-frameworks-community.md](data-evaluation-frameworks-community.md) 保持一致，便于交叉引用；该文拥有 runtime 架构（Benchmark/Harness/Environment 所有权、scorer、run identity、evidence）的对比，本文只覆盖**打包、分发、注册与内容身份**这一正交轴，不重复其结论。DSH 本地约束直接来自 `AGENTS.md`、`docs/architecture.md` 与 [Harness Benchmark/Harness/Environment 拆分](../tickets/G10-harness-bhe-split.md) 已记录的决策；本文在外部一手证据之后单列 DSH 建议。

| 系统 | 核验 commit / 访问日期 |
| --- | --- |
| Harbor | [`191d1b989bbba1d77c2db23e17aec308d7c08046`](https://github.com/harbor-framework/harbor/tree/191d1b989bbba1d77c2db23e17aec308d7c08046)（2026-09-09 提交，本次重验） |
| Harbor-Index | [`5399ea1026fb2c7fc384cf8acd91a7d10fc943f3`](https://github.com/harbor-framework/harbor-index/tree/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3)（2026-08-03 提交，本次重验） |
| Inspect AI | [`10cab1265e86c2f6f9aa5728052494a97059e968`](https://github.com/UKGovernmentBEIS/inspect_ai/tree/10cab1265e86c2f6f9aa5728052494a97059e968)（2026-09-09 提交，本次重验） |
| AgentCompass | [`c30a5d9472c0ed9afefad7bdabbf096db4c0f92a`](https://github.com/open-compass/AgentCompass/tree/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a)（2026-09-08 提交，本次重验） |
| lm-evaluation-harness | [`b954108c9baaaa934b4ad842033b31a97ee30816`](https://github.com/EleutherAI/lm-evaluation-harness/tree/b954108c9baaaa934b4ad842033b31a97ee30816)（2026-09-01 提交，本次重验） |
| HELM | [`63754d05db6f874e41a395880fb573890a13e791`](https://github.com/stanford-crfm/helm/tree/63754d05db6f874e41a395880fb573890a13e791)（2026-06-05 提交，本次重验） |
| OpenAI Evals OSS | [`8eac7a7de5215c907fbddc30efdaf316913eccdd`](https://github.com/openai/evals/tree/8eac7a7de5215c907fbddc30efdaf316913eccdd)（2026-04-14 提交，本次重验） |
| OpenAI hosted Evals / Datasets | 官方文档页 2026-09-11 访问 |
| MLflow | [`c5c9b6d3be593d108350b30816f2d7ee0c0c90ab`](https://github.com/mlflow/mlflow/tree/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab)（2026-09-10 提交，本次重验） |
| Hugging Face Hub | 官方文档页 2026-09-11 访问 |

引证约定：外部 GitHub 源码引用为 commit-pinned 文件级链接（内容本次逐字核验；行号锚点因抓取通道不带行号而不附）；DSH 仓内文件用 `path:Lx-Ly` 反引号引证，行号由本 worktree 文件直接读出。

## 横向比较

| 系统 | 内容载体 | 可执行代码载体 | 环境镜像 | 私有/heldout 机制 | 注册/发现 | 内容身份 | 分发机制 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Harbor | task 目录（instruction.md、task.toml、environment/、solution/、tests/） | verifier/solution 脚本随 task 目录分发 | `docker_image` 或 `environment/Dockerfile`/compose；separate verifier 镜像由 `tests/` 目录构建 | separate verifier：tests 运行时不上传 agent 环境，agent 产物按声明跨越 | CLI task id（local path / git url+commit / package org/name/ref） | `task_checksum` + `PackageTaskId` digest 缓存 | git 仓库、预构建镜像 registry、hub |
| Harbor-Index | 同 Harbor task 目录（80 tasks） | 同 Harbor | org Docker Hub 仓 `harborframework/harbor-index`，release ref 上 `@sha256` pin | LLM-judge verifier setup 由 `job-config.yaml` 模板 pin | hub dataset + leaderboard 提交流程 | task revision = task 目录 sha256；镜像 tag = build context 的 git tree hash | git source（main）+ release ref digest pin + signed tag + hub 发布 |
| Inspect AI | CSV/JSON/JSONL 文件、HF dataset、S3 URL、自定义 reader | pip package，setuptools entry points 自动发现 | task/sample 级 sandbox 声明（`Sample.sandbox`、`files`、`setup`） | 无：`target` 进入 solver 可见 state | entry points（代码）；数据按路径引用、task 文件可直接执行 | task `version` 字段 + EvalLog 完整配置 | PyPI（代码）与数据通道（文件/HF/S3）分离 |
| lm-evaluation-harness | HF dataset（`dataset_path`/`dataset_kwargs`）或本地 json/csv | YAML TaskConfig + `lm_eval` 包内 registry 装饰器；`!function` 可把 Python 函数嵌进 YAML | 无一等 task 环境 | 无 hidden 隔离 | task 名/tag；插件 entry points | "YAML config + codebase commit hash" 复现约定 + `metadata.version` | 代码与 YAML 随 lm-eval 包；数据在 HF Hub 或本地 |
| HELM | `crfm-helm` 中的 standardized scenario definitions；数据文件的具体获取方式未逐项核验 | 同一个 `crfm-helm` pip 包 | 无统一 task-image 层 | 无已核验的统一 hidden-material 隔离 | `helm-run --run-entries` | 包/套件版本 | 单一 PyPI 包 |
| AgentCompass | 主包 package-data（scicode jsonl/txt、frontier_engineering csv/yaml）或运行时拉取（gdpval extra 含 huggingface-hub） | 同一个 `agentcompass` 包 + per-benchmark optional extras | Environment provider（依赖 harbor、modal、daytona 等） | 文档约定 hidden data 留在 TaskSpec/BenchmarkPlan（见姐妹篇） | 进程内 decorator registry | resolved RunRequest/ExecutionPlan | 单一 pip 包（`agentcompass`） |
| OpenAI Evals OSS | registry JSONL 数据经 Git-LFS（`evals/registry/data`） | 同仓 Python Eval 类 / 免代码模板（JSON 数据 + YAML） | 无 | README 明确支持用私有数据建 private evals 而不公开 | YAML registry（名 → 类 + 数据路径） | git 仓库 + run id | git clone + `pip install -e .` / `pip install evals` |
| OpenAI hosted Evals | 托管上传文件（`purpose: "evals"` → `file-` id） | 托管 grader 配置 | 托管执行，无公开 isolation contract | 数据在账户内；grader 模板可读 `{{ item.* }}` ground truth | API 对象 id（eval/run UUID） | eval UUID + file id + created_at | API 上传；平台 2026-11-30 关闭 |
| OpenAI hosted Datasets | Dashboard 中的 rows，可手工创建、导入 CSV 或从日志加入 | 保存的 Prompt versions + graders | Dashboard 托管运行 | input/ground-truth columns 可供 prompt 与 grader 引用；官方入门页未声明 hidden split 隔离 | Dashboard 中显式选择 dataset；入门页称暂无 Datasets API | Prompt 有保存版本；入门页未声明 dataset immutable version/content digest | OpenAI Dashboard；需要 API、外部模型或大规模运行时转用 Evals |
| MLflow | Evaluation Dataset（tracking server 对象，SQL backend 必需） | scorer 代码注册进 experiment，递增 version | 无 | 无 harness 侧隔离 | dataset id / experiment 关联 | `digest`（content hash）+ `dataset_id` + record 输入哈希去重 | SQL tracking server 对象 |

## 1. Harbor 与 Harbor-Index

### 已核验事实：打包与镜像

Harbor task 是浅层目录 aggregate：`instruction.md`、`task.toml`、`environment/`、`solution/`、`tests/`；`task.toml` 带 `schema_version` 与 `[task] name/version`，`[environment]` 段声明 `docker_image`、CPU/内存/GPU、`network_mode`、MCP servers 与 healthcheck。环境镜像三个来源：`[environment].docker_image` 预构建镜像、`environment/Dockerfile`、`environment/docker-compose.yaml`；`--force-build` 才从源码重建。[Task Structure](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/index.mdx)

同一文档载明 separate verifier 的打包语义：verifier 镜像**从 task 的 `tests/` 目录构建**（`tests/Dockerfile` 把 `/tests/test.sh` 构建进镜像），separate 模式下 Harbor **不在运行时上传 `tests/`**；从 agent 环境跨越到 verifier 环境的只有 `/logs/artifacts/` 与显式声明的 artifacts，且按原绝对路径重新物化。文档同时给出 sidecar artifact/collect hook 的反作弊性质（先停 main 容器再收集）。Harbor 官方文档还自述其 task 格式与 Terminal-Bench task 格式的差异另有专页记录，即两格式同源不同版。[Task Structure](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/index.mdx)

### 已核验事实：来源身份与 content-addressed cache

`TrialResult.task_id` 是三成员 union：`LocalTaskId`（路径）、`GitTaskId`（`git_url` + 可选 `git_commit_id` + 仓内相对路径，路径校验拒绝逃出仓库）、`PackageTaskId`（`org/name/ref`，ref 注释为 "tag, revision, or digest (e.g. \"latest\", \"3\", \"sha256:abc...\")"）；`PackageTaskId.get_local_path()` 在 ref 不是 `sha256:` digest 时抛错，是 digest 才映射到 `PACKAGE_CACHE_DIR/org/name/digest`。`TrialResult` 同时记录 `task_checksum: str` 与 resolved trial config。[result.py](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/trial/result.py) [id.py](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/task/id.py)

这是一套正在向 content-addressed package 演进的来源模型：local/git 是旧通道，package 是带 digest 语义的新通道，且 mutable tag（`latest`）与 digest 被显式区分——digest 解析前连缓存路径都拒绝给出。

### 已核验事实：Harbor-Index 的 split-pin 分发

Harbor-Index 是 80-task benchmark，从 git checkout 以 `harbor run -c job-config.yaml` 运行；judge verifier setup 由模板 `job-config.yaml` pin；结果 `--upload --public` 到 `hub.harborframework.com/jobs/`，经 leaderboard PR 与 CI 校验后入榜。[README](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/README.md)

发布工具链文档明确了分发与身份模型：全部 task 镜像由仓内 Dockerfile 构建并推到 org registry `harborframework/harbor-index`；镜像 tag = build context 的 git tree hash（输入不变则 tag 不变、构建被跳过）；`FROM` 的 digest pin 在 main 上（充当 base lockfile），`docker_image = ref@sha256:…` 的 pin **只存在于 release ref**（`release/` 分支 + signed tag），官方自述为 "PyPI-style, in other words: the repo holds source; the tag-triggered release holds the artifact pins"，并强调 Docker Hub tag 可变、"The `@sha256:` digests in task.toml are the only guarantee"；hub 侧的 task revision 是 task 目录的 sha256，未变更 task 保持 byte-identical pin → 同 content hash → hub 跳过、历史 trial 不脱钩；发布必须过 oracle gate，signed tag 是 provenance anchor。[README-build-push-pin.md](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/scripts/README-build-push-pin.md)

### 失败面与限制

task 目录本身把内容（instruction）、代码（tests/solution 脚本）与镜像配方（Dockerfile）耦合在一个 VCS 单元里；解耦发生在**身份与分发层**（checksum、digest pin、tree-hash tag），而不是文件布局层。Harbor-Index 的 split-pin 模型依赖大量自建工具链（discover/resolve-from-digests/build/validate/pin/release/alias/lint 八个子命令）与人工 runbook，这是把内容、镜像、发布绑到一个 org 仓库的规模成本；DSH 不必复刻其发布机械，但其"源码与 artifact pin 分层、digest 是唯一保证"的原则有直接参考价值。

## 2. Inspect AI

### 已核验事实

扩展代码的分发单元是普通 Python package：官方文档列举六类扩展（Model APIs、Components、Sandboxes、Approvers、Hooks、Filesystems），并明确"implemented within your own Python package and then used without any special registration—Inspect discovers them automatically through setuptools entry points"。[extensions.qmd](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/extensions.qmd)

数据与代码是**引用关系而非同包关系**：`csv_dataset`/`json_dataset` 读本地文件，`hf_dataset` 底层调用 HF `load_dataset()` 且可透传任意参数，S3 以 `s3://` URL 替换本地路径即可，或用自定义 reader 构造 `MemoryDataset`。文档同时警告部分 HF dataset 会执行 Python 代码、需显式 `trust=True`——即 HF 通道默认把"数据"与"代码"的边界交还给用户判断。`Sample.files`（sandbox 路径 → 文件/URL/内联内容）与 `Sample.setup` 脚本把按样本的环境物化也放进数据侧，`Sample.sandbox` 可逐样本指定 sandbox 类型。[datasets.qmd](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/datasets.qmd)

### 失败面与限制

注册机制只覆盖**代码组件**；数据没有 registry、没有 digest——身份靠 EvalLog 全量记录配置与样本（姐妹篇已核验）。`trust=True` 通道说明"数据仓库携带可执行代码"在 HF 生态是现实存在的反例，DSH 的 pack 格式应显式排除等价物（pack 内不得有加载期执行的代码）。

## 3. lm-evaluation-harness

### 已核验事实

Task 的 authoring 单元是 YAML `TaskConfig`，官方复现约定是"YAML configuration files, along with the current codebase commit hash, are intended to be shareable such that providing the YAML config enables another researcher to precisely replicate the evaluation setup"；数据经 `dataset_path`/`dataset_name`（即 `datasets.load_dataset` 前两个参数）与 `dataset_kwargs`（透传 `data_files`/`data_dir` 等本地文件参数）取得，`custom_dataset` 允许自定义来源。`!function` 可把 Python 函数按引用嵌进 YAML（`doc_to_text`、`doc_to_target`、`doc_to_choice`、metric `aggregation`）；`include:` 让一个 YAML 以另一个 YAML 为模板；`metadata.version` 标注 YAML config 版本；metric/filter/aggregation 经 `register_*` 装饰器注册；参考任务全部位于 `lm_eval/tasks/` 之下。[task_guide.md](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/task_guide.md)

### 失败面与限制

YAML（随代码包分发）与数据（HF Hub / 本地）是两通道，但**内容身份没有独立机制**：复现约定落在"YAML + codebase commit hash"上，数据侧靠 `load_dataset` 的隐式缓存与 HF 仓库当前状态，task YAML 本身不携带数据 revision/digest 字段（`dataset_kwargs` 能否 pin 取决于使用者显式写入什么参数）。这是"配置进包、数据外引、身份靠人"的典型：内容更新不触发代码发布，但正式 run 也没有机械的内容封口。

## 4. HELM 与 AgentCompass：全耦合模型

### 已核验事实

HELM 以单一 PyPI 包 `crfm-helm` 分发，"Datasets and benchmarks in a standardized format（e.g. MMLU-Pro, GPQA, IFEval, WildBench）"是包的功能之一；用户 `pip install crfm-helm` 后用 `helm-run --run-entries <benchmark>=…` 选择，无独立于包的 benchmark 分发单元；项目自 2026-06-01 进入 maintenance mode。[README](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/README.md)

AgentCompass 同样是单一 `agentcompass` 包，但 benchmark 数据以 `[tool.setuptools.package-data]` 随包发布（`agentcompass/benchmarks/scicode/data/*.jsonl|*.txt`、`frontier_engineering/data/*.csv|*.yaml`），每个 benchmark 的额外代码依赖是 optional extras（`swebench`、`scicode`、`gdpval`（含 `huggingface-hub`）、`frontier-engineering`、`taubench` 等），runtime 直接依赖 `harbor`；仓库 dev guide 下只有 architecture/、contributing/、extensions/ 三类文档，没有独立的 benchmark 打包/分发文档。[pyproject.toml](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/pyproject.toml) [developer_guide](https://github.com/open-compass/AgentCompass/tree/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide)

### 失败面与限制

全耦合的直接后果是：benchmark 内容的版本线 = Python 包的版本线；scicode 数据改动要随 `agentcompass` 发版，外部数据（gdpval）则完全脱离包版本控制。per-benchmark extras 说明作者自己也承认"装齐所有 benchmark 的依赖"不现实——代码依赖按 benchmark 拆分了，但数据身份仍留在主包版本里。

## 5. OpenAI Evals OSS 与 hosted Evals/Datasets

### 已核验事实：OSS

evals registry 的数据以 Git-LFS 存放：clone 后 `git lfs fetch --all && git lfs pull` 填充 `evals/registry/data` 下的 pointer 文件，也可按单个 eval `git lfs fetch --include=evals/registry/data/${eval}` 选择性拉取；运行者 `pip install evals`，创建者 `pip install -e .`。README 明确支持用自己的数据构建 private evals 且不公开暴露这些数据，且当时不接受带 custom code 的 evals 提交（model-graded YAML 可提交）；模板机制允许"只提供 JSON 数据 + YAML 参数"零代码建 eval。[README](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/README.md)

### 已核验事实：hosted Evals

Eval 对象 = `data_source_config`（JSON Schema 定义 item）+ `testing_criteria`（grader 列表）；测试数据是 JSONL 文件经 files API 上传（`purpose: "evals"`）得到 `file-` id，run 的 `data_source.source = {type: "file_id", id}` 引用之；grader 模板同时可读 `{{ item.* }}`（含 ground truth）与 `{{ sample.* }}`；eval/run 各有 UUID 与 `created_at`。页面顶部载明弃用：2026-10-31 只读、2026-11-30 关闭，官方建议转向 Datasets。[Working with evals](https://developers.openai.com/api/docs/guides/evals)

### 已核验事实：hosted Datasets

Datasets 是 Dashboard 中持续演化的测试 rows 集合；可手工创建、导入 CSV，或从 Logs 选择已记录的模型调用加入。列分为 input 与 ground truth，但同一页面明确说这些列都可用于 Prompt 与 Grader。用户可为一个 dataset 选择已保存的 Prompt version 或创建新 Prompt，并为一次 run 添加 string check、text similarity、score-model、label-model 或 Python grader；保存 Prompt 会产生新版本。[Getting started with datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started)

官方入门页将 Datasets 定位为 UI 中快速迭代、随着时间增长的测试集，并明确写明目前没有 Datasets API；需要通过 API 运行、大规模执行或评测外部模型时，应使用 Evals。该页没有声明 dataset rows 的 immutable snapshot、content digest 或独立 heldout runtime boundary，因此这些能力不能从产品名称或 Prompt version 推断出来。[Getting started with datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started)

### 失败面与限制

OSS 的 private evals 模式 = 私有 git 仓库 + Git-LFS，隔离靠仓库可见性；hosted Evals 的账户内文件与 hosted Datasets 的 input/ground-truth columns 都能被配置的 grader 使用，而 Datasets 还允许 Prompt 显式引用这些列，因此它们提供的是托管访问边界，不等同于 Harness 无法读取 private material 的 heldout 隔离。hosted Evals 的 UUID/file-id 通道已进入关闭倒计时；hosted Datasets 则适合交互式数据维护，但官方入门页未给出 immutable content identity，不能直接替代 sealed benchmark pack。

## 6. MLflow Evaluation Datasets

### 已核验事实

Evaluation Dataset 是 tracking server 侧对象，**要求 SQL backend**（PostgreSQL/MySQL/SQLite/MSSQL），FileStore 本地模式不可用；dataset 对象携带 `dataset_id`（`d-{32 hex}`）、`digest`（官方定义 "Content hash for data integrity verification"）、自动演化的 `schema` 与 `profile`、`experiment_ids`、时间戳与作者。dataset 是"living validation collections"，记录可持续从 production trace、人工整理或程序化生成加入；record 以**输入哈希**为身份，merge 时同输入记录合并 expectations/tags 而非复制。[Evaluation Dataset Concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/evaluation-datasets.mdx)

### 失败面与限制

内容（dataset digest、record hash）与代码（scorer 版本，姐妹篇已核验其 version pin）是两套身份系统，这正是其价值；但 dataset 是 mutable server 对象（`last_update_time` 字段自证），"living"与"冻结基准"之间的封口要靠使用者显式 snapshot/digest pin，框架不替你做。

## 7. Hugging Face Hub：内容的独立分发底座

lm-eval、AgentCompass（gdpval）、Inspect（`hf_dataset`）的内容最终都落在同一底座上：HF Hub 把 models/spaces/**datasets** 一律承载为 Git 仓库，官方表述"version control and collaboration are core elements of the Hub"，Xet 存储对大文件做 chunk 级去重；同一页还把"非版本化、可变存储"明确划给另一个产品（Storage Buckets）——即内容分发底座自身把"版本化内容仓库"当作一等公民，与代码包管理器（PyPI）完全平行。[Repositories](https://huggingface.co/docs/hub/repositories)

这就是"内容独立于代码包分发"的最大规模实践：数据的 revision/commit 即身份，代码包不参与数据版本。

## 跨框架综合（synthesis，非单一来源事实）

**耦合谱系。** 两端存在清楚差异：AgentCompass 将部分数据作为 package-data 随主包发布，HELM 将 scenario definitions 与 runtime 放在同一 pip 包；MLflow/HF/Harbor package task 则为内容提供 digest 或 revision 身份。Inspect 与 lm-eval 位于中间：数据外引（by-reference），但 task 自身未强制封存完整数据 closure（Inspect 无统一内容 digest，lm-eval 的复现约定依赖 YAML + codebase commit，dataset revision 是否固定取决于作者配置）。核验范围内没有框架要求纯内容必须先成为可执行插件才能进入评测。

**环境镜像是独立身份维度。** 在提供一等 sandbox/image 机制的 Harbor/Harbor-Index 中，镜像位于 container registry 并以 digest pin；Inspect 在 task/sample 上声明 sandbox 配置。HELM、lm-eval 与 OpenAI hosted 的已核验材料没有同等 task-image 层。来源支持的是“镜像身份应独立记录”，而不是“镜像在所有系统中绝不随代码包分发”的绝对结论。

**已观察到的 heldout/private 做法**包括私有 VCS（OpenAI OSS private eval）、托管账户边界（OpenAI hosted）与结构性隔离（Harbor separate verifier——tests 在运行时不进入 agent 环境）。核验材料没有提供“依靠 package exports 隐藏同一安装树中的答案”这一安全模型；但本文样本不能证明这三类做法穷尽所有框架。

**fresh/频繁更新**在内容独立通道上是自然操作：HF dataset push 新 revision、MLflow 加 record（digest 变化）、Harbor-Index 未变更 task 保持同 hash；在全耦合模型上每次都要发代码包版本。

**可执行扩展注册与内容解析是两类操作。** 代码通过 entry points（Inspect、lm-eval 插件）或包内装饰器（AgentCompass、lm-eval 内建）注册行为；内容通过路径、URL、dataset id、task id、hub/index 或 repository locator 被发现和解析。Harbor hub 与 OpenAI Dashboard 说明内容也可以有 registry，但该 registry 返回的是内容/任务引用，而不是在加载时执行的 plugin。

## "独立内容 artifact"的通俗解释（对照 npm/Cordis plugin）

一个**独立内容 artifact** 是一组"只被读取、从不运行"的文件：benchmark manifest、case 数据、public 任务材料、policy/requirement 声明、opaque 的 private-material 引用。加载它的全部工作是解析、校验、计算 digest——不执行其中任何字节。它的身份就是内容的哈希：改一个 case 就是一个新 artifact，换一台机器同内容仍是同一个 artifact。

一个 **npm/Cordis plugin package** 是"安装即运行"的代码单元：装入时模块代码被执行，向 context 注册 service/event/effect，拥有生命周期（注册是 effect、卸载要撤销），进版本与发布列车，能携带任意启动逻辑。检验两者差别的最简单方法：把内容 artifact 放进一个没有任何 plugin 认识它的环境，什么都不会发生；把 plugin 放进去，环境立刻多了能力。

所以"benchmark 内容做成 artifact、能力做成 plugin"不是对 DSH "everything is a plugin" 的例外，而是对它的准确适用：`docs/architecture.md:L11-L13` 定义 plugin 贡献的是 services、typed events、reversible effects——纯数据不贡献这三者，把它包成 plugin 得到的是空壳注册和一条不必要的发布流水线。grader mechanism、importer、fixture builder 这些**真正注册能力**的东西才是 plugin（companion plugin）。

## 对 DSH 的建议（DSH 判断，非来源事实）

比对三个候选模型与一手实践、DSH 约束：`AGENTS.md:L3` 要求 everything is a plugin，`docs/architecture.md:L11-L27` 将 plugin/bundle 定义为向 Cordis context 贡献 service、typed event、reversible effect 与配置代码的运行单元；[Harness Benchmark/Harness/Environment 拆分](../tickets/G10-harness-bhe-split.md) 已锁定 opaque private-material reference、content-addressed Artifact 与独立 Artifact Store。

1. **采用 hybrid companion-plugin 模型。** Benchmark Pack 的 canonical form 是不执行代码、digest 为身份的数据闭包，经 `BenchmarkRepository` 解析封口；Grading Mechanism、importer、generator、fixture builder 是 companion Cordis plugins。一手依据：Inspect 证明扩展代码可走 package + entry points、数据走引用；Harbor `PackageTaskId` 证明 framework 可以把 content-addressed package 作为 task 来源的一等公民；MLflow/HF 证明 digest/revision 可承载内容身份。AgentCompass 的 package-data 与 HELM 的同包 scenario definitions 则展示了 package-first 模式会把至少一部分 benchmark 演化绑定到 runtime 发布。
2. **不做“每个 pack 一个 Cordis plugin package”作为默认。** AgentCompass 的 package-data 与 HELM 的同包 scenario definitions 是相关的 package-first 实践，但它们没有证明这种方式适合 private/fresh packs；对 DSH 而言，该方式会把内容变更送入 package 发布列车，并可能把 private material 放进 Harness 可读安装树。若公开 demo pack 确实需要“安装即发现”，可以提供可选分发 adapter：package 携带 public closure 并注册 locator，而正式身份仍由 repository 根据内容计算 digest。
3. **环境要求允许引用外部镜像 digest，而非把镜像塞进 pack 或 plugin。** Harbor-Index 的 split-pin 是直接先例：源/声明与 artifact pin 分层，digest 是唯一保证；DSH 的 Environment requirement 应记录 resolved image digest 进 run identity。
4. **heldout 分发规则对齐 Harbor separate verifier + OpenAI OSS 私有仓库实践：** private closure 永不进入 Harness 可见安装树，只安装到 grader runtime；pack 内只放 opaque 引用。
5. **fresh/cohort 更新走内容通道：** 新 digest 即新 pack，无代码发布。对应 HF revision、MLflow record 增量、Harbor-Index unchanged-task 同 hash 跳过的共同行为；同时保留 MLflow 的教训——repository 必须显式封口（digest/`BenchmarkPackRef`），不能像 living dataset 一样让 mutable 指针充当身份。
6. **pack 格式必须排除"加载期执行的内容"**（Inspect `trust=True` 的 HF script dataset 是现实反例）：manifest 只能声明 mechanism identity，由 companion plugin 实现，preflight 校验已注册且版本兼容。

## 来源缺口

1. AgentCompass 无独立 benchmark 打包/分发文档；"数据随主包 package-data 发布"仅由 `pyproject.toml` 佐证，未发现 per-benchmark 分发单元或其规划。
2. HELM 各 scenario 的数据获取机制（运行时 URL 下载还是包内携带）未逐文件核验；本文只引用 README 对 "standardized format" 的自述。
3. `hub.harborframework.com` 的 dataset/task revision 协议未直接核验，仅经 Harbor-Index README 与 build-push-pin 文档转述。
4. Terminal-Bench 仅经 Harbor 文档的格式渊源提及，其 registry/下载机制未独立核验。
5. OpenAI hosted Evals 文档处于弃用窗口（2026-11-30 关闭），页面内容仍可能变化；本文引用 2026-09-11 访问版本。hosted Datasets 入门页没有公开 API、immutable snapshot/content digest 或项目级访问控制的完整契约，因此本文不对这些能力作推断。
6. Inspect `_registry.py` 的 entry point 实现细节本次抓取失败（网络错误），entry points 机制以官方 `extensions.qmd` 文档表述为准。
7. MLflow OSS `list_versions()` 仅 Databricks managed dataset 支持不可变版本列举的行为，引自姐妹篇 data-evaluation-frameworks-community.md 的核验，本文未重验。
8. lm-eval 的 PyPI 包是否包含全部 `lm_eval/tasks/` YAML 未核验；task_guide 显示任务引用均指向仓内路径。

## 一手来源索引

- [Harbor Task Structure](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/docs/content/docs/tasks/index.mdx)
- [Harbor trial/result.py](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/trial/result.py)
- [Harbor task/id.py](https://github.com/harbor-framework/harbor/blob/191d1b989bbba1d77c2db23e17aec308d7c08046/src/harbor/models/task/id.py)
- [Harbor-Index README](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/README.md)
- [Harbor-Index build-push-pin 文档](https://github.com/harbor-framework/harbor-index/blob/5399ea1026fb2c7fc384cf8acd91a7d10fc943f3/scripts/README-build-push-pin.md)
- [Inspect Extensions](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/extensions.qmd)
- [Inspect Datasets](https://github.com/UKGovernmentBEIS/inspect_ai/blob/10cab1265e86c2f6f9aa5728052494a97059e968/docs/datasets.qmd)
- [AgentCompass pyproject.toml](https://github.com/open-compass/AgentCompass/blob/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/pyproject.toml)
- [AgentCompass developer_guide 目录](https://github.com/open-compass/AgentCompass/tree/c30a5d9472c0ed9afefad7bdabbf096db4c0f92a/docs/en/developer_guide)
- [lm-evaluation-harness Task Configuration](https://github.com/EleutherAI/lm-evaluation-harness/blob/b954108c9baaaa934b4ad842033b31a97ee30816/docs/task_guide.md)
- [HELM README](https://github.com/stanford-crfm/helm/blob/63754d05db6f874e41a395880fb573890a13e791/README.md)
- [OpenAI Evals OSS README](https://github.com/openai/evals/blob/8eac7a7de5215c907fbddc30efdaf316913eccdd/README.md)
- [OpenAI Working with evals](https://developers.openai.com/api/docs/guides/evals)
- [OpenAI Getting started with datasets](https://developers.openai.com/api/docs/guides/evaluation-getting-started)
- [MLflow Evaluation Dataset Concepts](https://github.com/mlflow/mlflow/blob/c5c9b6d3be593d108350b30816f2d7ee0c0c90ab/docs/docs/genai/concepts/evaluation-datasets.mdx)
- [Hugging Face Hub Repositories](https://huggingface.co/docs/hub/repositories)
