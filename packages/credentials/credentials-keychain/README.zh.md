# dsh-credentials-keychain

[English](README.md) | 中文

macOS 钥匙串[凭据](../credentials/README.md)提供方：per-user PAT 存于独立（非 login）钥匙串，按 `account=userId` 寻址，带可注入的全局/共享 fallback 承接 G3 分期 fallback（per-user 未命中回落到早期全局 T1 PAT）。

| 槽 | 来源 id | 可写 |
|---|---|---|
| per-user 钥匙串条目 `(service=ref, account=userId)` | `keychain` | 是（`set`/`unset`） |
| 全局/共享 fallback（如 credentials-local/env） | `fallback` | 不在此处 |

钥匙串数据库盘上加密，因此从磁盘直接读该文件（`cat`/`grep`）只能看到密文，看不到 PAT。独立钥匙串 + 短 auto-lock + lock-on-sleep，并在 harness 自身 teardown 时再次上锁，收窄运行时外泄窗口：钥匙串锁定时，任何进程——harness 或 `bash`——都读不到条目，除非有解锁密码。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `path` | `<harness home>/credentials.keychain` | 钥匙串位置。 |
| `dshHome` | `$DSH_HOME` 或 `~/.dsh` | `path` 缺省时使用的 harness home。 |
| `unlockPassword` | — | 启动时创建并解锁钥匙串。新的待保护密钥（见[安全边界](#security-boundary)）。 |
| `autoLockSeconds` | `300` | 闲置 N 秒后自动上锁；`0` 禁用。 |
| `lockOnSleep` | `true` | 睡眠时上锁钥匙串。 |
| `fallback` | — | per-user 未命中与全局解析用的只读全局/共享 fallback。 |
| `runner` | — | 可注入的 `security` CLI runner；生产传导出的 `securityCli`，单元测试传 fake。 |

提供方以编程方式接收配置（不经 `cordis.yml`）：`runner` 与 `fallback` 是注入缝，`unlockPassword` 是不该进组合文件的密钥。默认值由显式的 `resolveSpec` 步骤给出，绝无内联 `??`。

## 钥匙串条目

每个 `(service=ref, account=userId)` 一条 generic-password 条目。`set` 写 `security add-generic-password -U -a <userId> -s <ref> -w <value>`；`resolve` 读 `security find-generic-password -a <userId> -s <ref> -w`；`unset` 删除。per-user 未命中、或无 `userId` 的解析，回落到 `fallback`（G3 分期：无 per-user PAT → 全局 T1）。无 `userId` 的 `set`/`unset` 不归钥匙串管——全局槽是 fallback 提供方。

<a id="security-boundary"></a>

## 安全边界

两条红线，此处只兑现第一条：

- **盘上（at-rest）**：✓。钥匙串数据库盘上加密，`bash` `cat`/`grep` 文件只得密文，非 PAT——即 [`credentials-local`](../credentials-local/README.md#security-boundary) 为 OS 钥匙串提供方保留的那条红线。独立钥匙串 + 短 auto-lock + lock-on-sleep，并在 harness teardown 时再上锁，进一步收窄：锁定时，无密码任何进程都读不到条目。
- **运行时外泄（runtime-exfil）**：✗（经 `security` CLI 不可达）。harness 启动时解锁钥匙串以解析 PAT 后，任何以同一用户身份运行的进程（含 agent 的 `bash`）都能 spawn `security find-generic-password -w` 读条目：macOS 把**直接调用者**（`/usr/bin/security`，Apple 签名）判为 ACL accessor——不是它的 spawner——因此基于 `security` CLI 的提供方无法把 harness 与 `bash` 区分开。`security` CLI 只暴露 `-T appPath`（按 path、可伪造）与 `set-keychain-settings`（钥匙串级）；它无法设 per-item Touch-ID `SecAccessControl`（需 Security 框架的 `SecItemAdd` + `kSecUseDataProtectionKeychain`），且基于身份的 ACL 需 Developer-ID 签名的 harness 二进制——属分发层关切。见 [`research/p12b-keychain-acl-feasibility.md`](../../../wayfinder/data-agent/research/p12b-keychain-acl-feasibility.md)。

因此 per-item Touch-ID ACL（读限制到 harness 二进制、排除 `bash`/`terminal`）**延后到 P12c 票**——native Security-framework binding + harness code-signing。锁定钥匙串是盘上与锁定态增强，非替代品：它把运行时外泄窗口收窄到解锁期，并未关闭。

`unlockPassword` 本身是新的待保护密钥：启动时交互输入是安全的；存到 `bash` 可读之处（环境变量、文件）则把锁弱化为便利——因同一 spawner 不可区分性意味着 harness 能解锁的，`bash` 也能解。

## 模型体验

经由消费它的 LLM 适配器间接生效：存储的值为适配器向提供方发出的请求授权，所有模型可见内容均由适配器负责。harness 绝不把解析后的 PAT 载入 `process.env`。

#### KV Cache 影响

无直接失效；凭据绝不进入请求前缀。`set`/`unset` 发布 `credentials/updated(ref, address?)`，使 per-operation 重新解析无需重启即可取到变更。

## 已知限制与暂缓事项

- **运行时外泄 ACL 延后（P12c）**——见[安全边界](#security-boundary)：per-item Touch-ID ACL + harness code-signing 是 native-binding + 分发工程，在此 `security`-CLI-only、additive 包内不可达。
- **解锁窗口残留**——harness 跑着且钥匙串解锁时，`bash` 能经 `security` 读条目。auto-lock + lock-on-sleep + teardown-lock 收窄但不消除。
- **多 host central backend 延后**——per-host 钥匙串不同步；central KMS/Vault backend 是跨网/多 host 部署关切，与本包正交。
- **跨平台不在范围**——仅 macOS（`/usr/bin/security`）。libsecret（Linux）/ Credential Manager（Windows）的 ACL 模型不同，是单独的工程。
- **`set-keychain-settings` flag 面因 macOS 版本而异**——本包仅用 `-l`（睡眠上锁）、`-u`（超时上锁）、`-t`（超时）这三个经 live 确认的 flag；`-c`（注销上锁）不在当前 CLI 中，不设。
