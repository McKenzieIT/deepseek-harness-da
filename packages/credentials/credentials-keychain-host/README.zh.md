# @deepseek-ai/dsh-credentials-keychain-host

[English](README.md) | 中文

将 `KeychainCredentialProvider` 注册为 `ctx.credentials` 的挂载面，组合一个纯可写文件/env fallback（G3c global-writes gap，decision A）。

## 为什么需要

`KeychainCredentialProvider`（P12b）无 Schemastery `Config`——其 `runner` 和 `fallback` 可注入——因此不能直接 yml 挂载。本 host 是 yml 可挂载面：一个 function plugin，接受标量配置 + 可注入 `runner`，解析解锁密码，在 credentials-local 文件/env 层之上构建一个纯 `KeychainFallback` shim，并程序化 `ctx.plugin` keychain（后者自动注册为 `ctx.credentials`）。

## G3c global-writes gap（decision A）

P12b 的 `KeychainFallback` 是只读 `{resolve, describe}`。将 keychain 挂载为 `ctx.credentials`（替换 credentials-local）暴露了一个缺口：**全局凭证写入**（无 `{ userId }`——如 Models 页面存储 `DEEPSEEK_API_KEY`）需要可写层，但 `keychain set(no userId)` 会抛异常。本 host 的 shim **可写**——复用 credentials-local 的 `parseCredentialsDocument` + `renderDocument`（保留注释）+ `writeFileAtomic` + `withFileLock`——且 `keychain set(no userId)` 委托给 `fallback.set`。（`vendor/cordis/src/reflect.ts` `provide` 在同一 scope 对同名 provider 抛异常，因此 option C "保留 base local + keychain composite" 不可行——已为 G3c 验证。）

## Bundle 接线（G3c）

data-agent bundle 禁用 base `credentials`（credentials-local）并挂载本 host 为 `credentials`，使 keychain 成为唯一 `ctx.credentials` provider；shim 是纯对象（非 Service），不会双重注册。

```yaml
- id: credentials
  disabled: true   # disable base credentials-local (additive disable-only)
- insert:
    - id: credentials
      name: '@deepseek-ai/dsh-credentials-keychain-host'
      config:
        unlockPasswordSource: interactive   # interactive (default, secure) | env | none
        unlockPasswordEnv: DSH_KEYCHAIN_PW  # for 'env' (unattended, bash-readable — weakens lock)
        perUserFallbackRefs: []             # stable: per-user PAT required (early: omit = all fall back)
```

## unlockPassword 来源

- `interactive`（默认）：启动时 stdin 提示（仅 tty，best-effort——安全选项；存储密码可被 bash 读取——参见 P12b 发现）。非 tty（launchd 服务）返回 `undefined` → keychain 须预创建且已解锁。
- `env`：读取 `process.env[unlockPasswordEnv]`（无人值守，但 bash 可读 env——将锁降为便利；已文档化）。
- `none`：省略密码（预创建且已解锁的 keychain）。

P12c（原生 Security-framework 绑定 + harness 代码签名）是真正的 runtime-exfil 修复；本 host 落地 security-CLI 当前能做的（静态加密 + locked-keychain + 按用户 CRUD + branding + 可写全局 fallback）。

## Known Limitations and Deferred Work

- **运行时 exfil ACL** — 限制 keychain 读取仅限 harness 二进制文件（排除 bash/terminal）的 per-item ACL 需要原生 Security-framework 绑定 + Developer-ID 代码签名。延期至 P12c；security-CLI 无法区分 spawner 和直接调用者。
- **多 host KMS / 中心化后端** — 多 host 需要同步凭证时，需要中心化后端（KMS envelope / Vault transit）。延期至多 host 部署拓扑决策确定后。
- **跨平台支持** — 未实现 Linux（`libsecret`）和 Windows（`CredManager`）凭证存储。仅支持 macOS Keychain。延期至 P12c 与原生绑定工作一并处理。
