# P12b — Keychain runtime-exfil ACL 可行性：`security`-CLI-only 够不够？

wayfinder ticket P12b · 中文报告 · 主源：Apple TN3137 / TN3133 / SecAccessControlCreateFlags / `kSecClassGenericPassword` / `man security` / `man codesign` + harness P12 原型 `run.ts` + seam `packages/credentials/credentials/src/*`。
所有 `path:line` 为绝对路径或仓库内相对路径；URL 为 Apple Developer 原始文档。INFERENCE 标注的是非源文直引的推断。

---

## §1 背景：P12 at-rest 已兑现，P12b runtime-exfil 的核心决策

P12（resolved 2026-08-19）已建 credentials seam `{userId?, scopeId?}` 寻址 + macOS Keychain provider 原型（`security` CLI spawn，非 keytar——避免 native node-gyp 污染构建链），**兑现 at-rest 红线**：PAT 存进 keychain DB，盘上加密，bash `cat`/`grep` 出密文非 PAT（`wayfinder/data-agent/prototypes/p12-credentials-keychain/run.ts` 的 `[6]` 步骤实证 `grep 'sk-alice-demo' in DB` absent）。

P12b（claimed 2026-08-20）= 生产硬化。ticket（`wayfinder/data-agent/tickets/phase-2/P12b-credentials-keychain-hardening.md`「Scope」段）列 6 项决策，**核心决策 #1 是 runtime-exfil ACL**：能否把一条 per-user PAT 的读限制到「只有 harness 二进制能读、排除 agent 的 bash/terminal」，使得模型驱动的 `security find-generic-password -w` 无法在运行时把 PAT 拎出去？

两层红线的区分（ticket「Context」段原文）：

> 红线两层：at-rest（P12 已满足）vs **runtime-exfil**（agent 跑 `security find-generic-password -w` 查明文）——本票靠 per-item ACL + harness code-signing 堵。

P12 Design（`wayfinder/data-agent/tickets/phase-2/P12-credentials-keychain.md`「Finding/Design」段）已显式延后此项：

> 更强 **runtime-exfil**（agent 跑 `security find-generic-password -w` 查明文）需 per-item ACL + harness code-signing——research-worthy 但属生产硬化，**延后 P12b**，非 P12 at-rest 要求。

本笔记回答：**`security`-CLI-only（无 native binding、无 harness code-signing）的 additive 包，能否兑现 runtime-exfil ACL？** 驱动 session 的先验假设（基于用户 Mac 上 `security help` + `man security`）是「不能」——下面以 Apple 原始文档逐条 verify/refute。

seam 现状（P12 已落地）：`CredentialAddress { userId?: string; scopeId?: string }` 是裸字符串（`packages/credentials/credentials/src/types.ts` 的 `CredentialAddress` interface），其 JSDoc 明示 branding 延后到「production hardening of the per-user store」即 P12b（`types.ts` 注释「Branding them as cross-boundary ids is deferred to the production hardening of the per-user store」）。`CredentialProvider` 抽象四操作 `resolve/describe/set/unset` + `notifyUpdated` 条件 arity（`packages/credentials/credentials/src/index.ts` 的 `abstract class CredentialProvider extends Service`）。原型 provider `KeychainCredentialProvider` 把 per-user PAT 存为 `(service=ref, account=userId)` generic-password item，读写经 `security add-generic-password -U -a ... -s ... -w ...` 与 `security find-generic-password -a ... -s ... -w`（`run.ts` 的 `set`/`resolve` 方法）。

---

## §2 accessor 身份：`security find-generic-password -w` 的 ACL accessor 是谁？

**结论（VERIFY 驱动 session 假设的核心）**：`securityd`（用户态 keychain 仲裁守护进程）评估**直接调用 SecKeychain API 的进程**的 code-signing 身份/路径，**不是它的 spawner**。当 harness（或 bash）spawn `/usr/bin/security` 跑 `find-generic-password -w`，ACL accessor = `/usr/bin/security`（Apple 签名）本身，不是 harness、不是 bash。因此 path-based（`-T`）和 identity-based（DR）ACL 都无法把 harness 与 bash 区分开：两者都经同一个 Apple 签名的 `security` 子进程读。

### 2.1 `security` CLI 走 SecKeychain API → file-based keychain

TN3137「On Mac keychain APIs and implementations」（https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains ）原文：

> macOS has three keychain APIs: Keychain … SecKeychain. … SecItem. …
> macOS has two keychain implementations: File-based keychain. Data protection keychain. …
> **The Keychain and SecKeychain APIs always target the file-based keychain.** The SecItem API can target either implementation. It defaults to targeting the file-based keychain. To target the data protection keychain, set the `kSecUseDataProtectionKeychain` attribute or the `kSecAttrSynchronizable` attribute to true.

`security` CLI 是 SecKeychain API 的薄封装（`add-generic-password`/`find-generic-password`/`delete-generic-password` 等子命令一对一映射到 `SecKeychainItemAdd`/`SecKeychainItemCopyContent`/`SecKeychainItemDelete`）。**INFERENCE**：因此 `security` CLI 永远操作 file-based keychain，**不能**设 `kSecUseDataProtectionKeychain`，故 `kSecAttrAccessControl`（per-item biometry）这条路径对 `security` CLI 不可达（§3/§4 详述）。

### 2.2 file-based keychain 的 ACL 模型 = `SecAccess` + `SecTrustedApplication`（path 或 DR）

`kSecClassGenericPassword` 文档（https://developer.apple.com/documentation/security/ksecclassgenericpassword ）列 generic-password item 的属性，其中 ACL 相关两条：

> `kSecAttrAccess` (macOS only) … `kSecAttrAccessControl` … `kSecAttrAccessible` (on macOS, this key only applies if you set `kSecUseDataProtectionKeychain` or `kSecAttrSynchronizable` to true)

即：`kSecAttrAccess`（`SecAccessRef`，trusted-apps 列表）是 **macOS-only = file-based keychain** 的 ACL 机制；`kSecAttrAccessControl`（`SecAccessControlRef`，biometry flags）属 data protection keychain（macOS 需 `kSecUseDataProtectionKeychain`）。两者是**不同实现上的不同 ACL 模型**，不可混用。

Apple Developer Forums thread/691188（https://developer.apple.com/forums/thread/691188 ）DTS 工程师确认 file-based keychain 的 ACL 按「跑 keychain add 操作的宿主 app」判定，且创建者默认进 ACL：

> I've noticed that the final object in the login keychain still has ACL containing the hosting app that ran the keychain add op. Is this by design? — **Yes. We've always added the creating app to the item's ACL by default.**

同帖确认 `SecTrustedApplicationCreateFromPath` 在 macOS 10.15+ deprecated（被 code-signing-DR 方式取代，见 §5.2），但 `security` CLI 的 `-T` 仍按 path 取（§3.1）。

### 2.3 securityd 评 accessor = 直接调用者，非 spawner

**INFERENCE**（基于 securityd 的进程模型 + TN3137 的 API 映射；无单段 Apple 文档逐字陈述「securityd 评 caller 非 spawner」，但以下证据链收敛于此）：

securityd 是用户态守护进程，经 Mach XPC 仲裁所有 SecKeychain/SecItem 调用。当某进程调 `SecKeychainItemCopyContent`（= `security find-generic-password -w` 的底层），securityd 取**该进程自身**的 code-signing 身份（`SecCodeCopyWithFlags` + `SecCodeCheckValidity` against ACL 里的 requirement）做 ACL 判定——**不是该进程的父进程**。这是 macOS 的设计：父进程不能「借」自己的 keychain 特权给一个它 spawn 的、不同签名的子进程；每个 accessor 按自己的签名独立判定。

**推论**（驱动 session 假设的 crux）：harness spawn `/usr/bin/security find-generic-password -w` 与 bash spawn 同一条命令，securityd 看到的 accessor **都是 `/usr/bin/security`（Apple 签名）**——harness 与 bash 对 securityd 不可区分。因此：

- `security add-generic-password -T /usr/bin/security`：ACL 信任何 `/usr/bin/security` → harness 与 bash 都能 spawn 它读 → **无任何 runtime-exfil 效果**。
- `security add-generic-password -T /path/to/harness`：ACL 只信任 harness 路径，但实际调用 SecKeychain API 的是 `security`（不是 harness）→ harness 自己读自己的 secret 也会**失败**（accessor 是 security，非 harness）。
- 即便用 code-signing-DR 方式（§5.2，partition list 带 requirement string 或 `SecAccessCreate` + `SecTrustedApplicationCreateWithApplicationSignature`）信任 harness 的 DR：accessor 仍是 `security`（Apple 签名，DR = Apple 的），不匹配 harness 的 DR → harness 经 `security` 读会失败。

**故 runtime-exfil ACL（限 harness、排除 bash）在 `security`-CLI-only 包里不可达**——harness 读自己的 secret 就得经 `security`，而 `security` 是 bash 也能 spawn 的同一个 Apple 签名二进制。这是驱动 session 假设的**VERIFY**。

### 2.4 Apple 签名二进制会绕过 item ACL 吗？

**INFERENCE-否**：Apple 签名的 `/usr/bin/security` 不「绕过」item ACL——它仍受 ACL 判定，只是它自己的 code-signing 身份（Apple 的 DR）会被拿来与 ACL 的 trusted-app requirement 比对。若 ACL 用 `-A`（allow any app）或 `-T /usr/bin/security`，security 命中信任列表故能读；若 ACL 只信任 harness 的 DR，security 不命中故被拒。关键不是「Apple 签名绕过 ACL」，而是「security 是 accessor，bash 与 harness 都经它读，ACL 无法在 accessor 层面区分二者」。`-A` 是 `man security` 里最不安全的选项（§3.1），恰因为它把 ACL 退化成「任何 app 都能读」= 无 runtime-exfil。

---

## §3 ACL 模型枚举：file-based vs data protection keychain

| ACL 模型 | 所在实现 | 限制粒度 | identity-based 还是 path-based | `security` CLI 单独可设？ | 引用 |
|---|---|---|---|---|---|
| `security add-generic-password -T appPath` / `-A` | file-based keychain（`SecAccess` + `SecTrustedApplication`） | per-item（trusted-apps 列表） | **path-based**（`-T` 取 path；`SecTrustedApplicationCreateFromPath` 10.15+ deprecated） | **是**（`-T`/`-A`） | `man security` add-generic-password；forum thread/691188 确认 deprecated |
| `set-generic-password-partition-list -P list` | file-based keychain（partition list = trusted-apps 的另一种表征，可含 code-signing requirement string **或** path） | per-item | **混合**：list 元素可是 requirement string 也可是 path；但 accessor 仍是 `security` CLI（§2.3） | **是** | `man security` set-generic-password-partition-list（`-S` 显示、`-P` 设 colon-separated list） |
| `set-keychain-settings -t <timeout> -l` | file-based keychain | **keychain-level**（非 per-item）：auto-lock timeout + lock-on-sleep + lock-on-logout | n/a（不是 app 白名单，是锁屏策略） | **是** | `man security` set-keychain-settings（`-t` timeout、`-l` lock on sleep、`-u` lock after timeout、`-c` lock on logout） |
| `SecAccessControl`（`kSecAttrAccessControl` + `SecAccessControlCreateWithFlags` flags: `biometryCurrentSet`/`biometryAny`/`userPresence`/`devicePasscode`/`applicationPassword`/`privateKeyUsage`） | **data protection keychain**（macOS 需 `kSecUseDataProtectionKeychain`） | per-item | **user-presence-based**（Touch ID/passcode at read time），**非 app-identity** | **否**：`security` CLI 无 `kSecAttrAccessControl` 入口；只能经 Security framework `SecItemAdd` + `kSecUseDataProtectionKeychain` | TN3137；https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/2937192-biometrycurrentset |
| `kSecAttrAccessGroup`（access group，绑 team ID） | data protection keychain（macOS 需 `kSecUseDataProtectionKeychain`） | per-item（group 维度） | **identity-based**（team ID 来自 code signing） | **否**：同上，需 SecItem API + 签名身份 | `kSecClassGenericPassword` 文档 |

### 3.1 `security` CLI 能设的 ACL（file-based keychain 全部）

`man security`（`add-generic-password` 段）的 ACL 相关 flag（多源交叉确认，含 https://ss64.com/osx/security.html 镜像、cnblogs 两次独立摘抄）：

- `-a account` / `-s service` / `-w password`：主键 + 值。
- `-U`：update if exists。
- **`-T appPath`**：把 `appPath` 加入 trusted-apps 列表（按 **path**）。可多次。`man` 原文意：允许该 app 不经用户提示访问此 item。
- **`-A`**：allow any app（trusted-apps 列表空 = 全开）。**最不安全**。
- `-D`：kind（如 `genp`）。
- `-l`：label。

P12 原型 `run.ts` 的 `set` 方法用 `['add-generic-password', '-U', '-a', account, '-s', ref, '-w', value, keychain]`——**未传 `-T` 也未传 `-A`**，即用 keychain 默认 ACL（创建者 `/usr/bin/security` 自动进 trusted-apps，§2.2 引 DTS 原话「We've always added the creating app to the item's ACL by default」）。这意味着原型 item 的 ACL 已信任 `security`，故 bash 也能 spawn `security` 读——**原型未做任何 runtime-exfil 限制**（符合 P12 的 at-rest 定位）。

### 3.2 `set-generic-password-partition-list`（partition list）

`man security`（`set-generic-password-partition-list` 段）：`security set-generic-password-partition-list [-S] [-s service] [-a account] [-P partitionlist] [keychain]`。`-S` 显示当前 partition list；`-P` 设新 list（colon-separated）。partition list 是 trusted-apps 的一种变体表征——元素可是**code-signing requirement string** 也可是 **path**（Azure DevOps `InstallAppleCertificate@2` 的 `setUpPartitionIdACLForPrivateKey` 选项即用此机制为导入私钥设 partition_id ACL，https://docs.microsoft.com/zh-hk/azure/devops/pipelines/tasks/utility/install-apple-certificate ）。

**INFERENCE**：partition list 即便填 requirement string（如 harness 的 DR），accessor 仍是 `security` CLI（§2.3）——`security` 的 DR 是 Apple 的，不匹配 harness DR → 读失败；填 `/usr/bin/security` → bash 也能 spawn → 无 runtime-exfil。即 partition list 不改变 §2.3 的结论，只是换了设 trusted-apps 的 surface。

### 3.3 `set-keychain-settings`（keychain-level，非 per-item）

`man security`（`set-keychain-settings` 段）：`-t <timeout>`（auto-lock after N seconds idle）、`-l`（lock on sleep）、`-u`（lock after timeout）、`-c`（lock on screen-logout）。这是**keychain 级**策略，作用于整个 keychain 文件，非 per-item。Apple Developer Forums thread/690665（https://developer.apple.com/forums/thread/690665 ）实证 headless/SSH 下 `set-keychain-settings` 会触发「User interaction is not allowed」（keychain 锁定后需 GUI 解锁或 `unlock-keychain -p`）。

**INFERENCE**：独立 locked keychain + `set-keychain-settings -t 0 -l -u`（立即 auto-lock + 锁屏即锁）+ 启动 `unlock-keychain -p` 交互/Touch-ID 解锁——这是 P12b ticket「Scope」的第二项（「独立 locked keychain + 启动交互 unlock / Touch-ID」），它提供的是 **at-rest/runtime 双重**：keychain 锁住时 bash 连 `security` 都读不到（keychain 整体加密、需密码/Touch-ID 解锁才能读 item）。但**解锁后**，bash 仍能 spawn `security find-generic-password -w` 读 item（因 item ACL 信任 `security`）——即 locked keychain 只把 runtime-exfil 的窗口收窄到「解锁期间」，未消除。这是 at-rest 的增强（锁屏即锁 → agent 趁用户离开也读不到，除非 keychain 处于解锁窗口），**不是** per-item ACL 的替代。

---

## §4 Touch-ID/biometry 经 `security` CLI 可设吗？

**结论：否。** per-item Touch-ID（biometry）ACL 只能经 Security framework `SecAccessControlCreateWithFlags` + `SecItemAdd`（带 `kSecAttrAccessControl` + `kSecUseDataProtectionKeychain`）设；`security` CLI 无任何 biometry/`SecAccessControl` flag。

`SecAccessControlCreateFlags` 文档（https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/2937192-biometrycurrentset ）列全部 flag：

- `biometryCurrentSet`（8）：Require the currently set biometric for access（指纹集合变更即失效）。
- `biometryAny`（2）：Require any biometric（`touchIDAny` deprecated → `biometryAny`）。
- `userPresence`（1）：biometrically or via device passcode。
- `devicePasscode`（16）：Validation via the device passcode。
- `applicationPassword`（2147483648）：Require an application password。
- `privateKeyUsage`（1073741824）：Require a private key。
- `or`/`and`（16384/32768）：conjunctions。

构造器签名：`SecAccessControlCreateWithFlags(CFAllocator?, CFTypeRef, SecAccessControlCreateFlags, UnsafeMutablePointer<Unmanaged<CFError>?>?) -> SecAccessControl?`。返回的 `SecAccessControl?` 经 `kSecAttrAccessControl` 传给 `SecItemAdd`。

**关键**（§2.1 已引 TN3137）：`kSecAttrAccessControl` 属 **data protection keychain**。在 macOS 上 `SecItem` API 默认也走 file-based keychain；要进 data protection keychain 必须设 `kSecUseDataProtectionKeychain`。`security` CLI 既不暴露 `kSecAttrAccessControl`，也不暴露 `kSecUseDataProtectionKeychain`——它只走 SecKeychain API → file-based keychain，**无 biometry per-item ACL 的可达路径**。

`man security` `add-generic-password` 段的 flag 枚举（§3.1）**无** `--biometry` / `--access-control` / `--touch-id` 之类选项——`security` CLI 的 ACL surface 仅 `-T`（path trusted app）+ `-A`（any）+ partition list。**这是驱动 session 假设的 VERIFY：per-item biometry ACL 经 `security` CLI 不可设，只能经 native Security framework binding。**

`security` CLI 能做的 Touch-ID 相关仅 keychain-level（§3.3 的 `set-keychain-settings` 锁屏策略 + `unlock-keychain` 交互解锁），非 per-item biometry gate。若要「读这条 PAT 必须 Touch-ID」，必须 native binding（`SecItemAdd` + `kSecAttrAccessControl` + `.biometryCurrentSet` + `kSecUseDataProtectionKeychain`）。

---

## §5 code-signing 身份：ad-hoc / self-signed / Developer ID 的可伪造性

runtime-exfil ACL 若要走「identity-based 信任 harness」而非 path-based，需 harness 有稳定、不可伪造的 code-signing 身份。下面枚举三种签名及其对 ACL 的可用性。

### 5.1 ad-hoc（`codesign -s -`）

TN3133「On Code Signing」（https://developer.apple.com/documentation/technotes/tn3133-on-code-signing ）+ `man codesign`：

- ad-hoc 签名 = signature flags 含 `CS_ADHOC`（0x2），**无证书链**。签名是占位，无身份可验。
- 默认 Designated Requirement（DR）仅含 **cdhash** requirement（= 二进制内容的 hash）。
- **可伪造**：攻击者改二进制 → 重签 ad-hoc → cdhash 重算 → DR 验新 cdhash **trivially 匹配**（自指）。即 ad-hoc 的 DR 不提供「这二进制是你写的」的保证，只防意外损坏。
- 对 ACL：用 ad-hoc 签名 harness 的 DR 作 trusted-app requirement → 任何能 `codesign -s -` 重签的二进制都能产生一个匹配某 ad-hoc DR 的签名（只要内容 hash 对上）——**实际上对攻击者无门槛**（bash 本身是 Apple 签名，但攻击者可复制 harness 二进制改名再跑，或直接用 harness 二进制读 keychain 后把值外传）。**不适合作 ACL trusted-app 身份。**

### 5.2 self-signed cert（自签证书）

**INFERENCE**（基于 TN3133 的证书链模型 + `codesign` 的 DR 语义）：自签证书不链 Apple root，DR 形如 `certificate leaf = ...`。攻击者可自己生成一张同名自签证书 + 私钥，签一个二进制使其 DR 匹配（证书的 subject 可任意填）——**可伪造**。比 ad-hoc 稍强（攻击者需造一张证书，但造证书零门槛），仍**不适合作 ACL trusted-app 身份**。

### 5.3 Developer ID（distribution）

TN3133 + 「Creating distribution-signed code for macOS」（https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac ）：

- Developer ID Distribution 证书来自 **Apple Developer Program**（付费会员）。签名链到 Apple root CA。
- DR 形如 `identifier "com.yourcompany.harness" and (certificate leaf[field.1.2.840.113635.100.6.1.13] /* exists */ or certificate 1[field.1.2.840.113635.100.6.1.14] /* exists */)`，绑定 **Team ID**（Apple 分配的 10 字符串）+ 证书链。
- **不可伪造**：私钥在开发者 keychain（受 ACL 保护），无 Apple Developer Program 会员拿不到链到 Apple root 的证书。攻击者无法造一张匹配该 DR 的证书（除非偷到私钥）。
- **适合作 ACL trusted-app 身份**（identity-based、不可伪造）。

### 5.4 dev（非 Apple Developer Program 会员）的 harness 能拿到稳定不可伪造签名吗？

**结论：基本不能。** 选项枚举：

- **ad-hoc**（§5.1）：可伪造，ACL 形同虚设。
- **自签证书**（§5.2）：可伪造（攻击者造同名证书），ACL 形同虚设。
- **Developer ID**（§5.3）：需 Apple Developer Program 会员（$99/年），签名身份稳定不可伪造——但这是**分发关切**（需 Apple 会员、需 notarization、需打包 .app/.pkg），属 harness 二进制的分发流程，**不在 keychain provider 包的范围内**。
- **Apple Development 证书**（开发期，非分发）：仅本机调试用，DR 绑本机 Team ID，跨机器不可用——不适合生产 ACL。

**INFERENCE**：若 harness 以 `pnpm exec tsx .../run.ts` 或 `node .../dist/index.js` 跑（P12 原型正是 `pnpm exec tsx`，见 `run.ts` 顶部注释），**根本没有 harness 二进制可签**——解释器（node/tsx）是 Apple 或 Homebrew 签的，harness 是脚本。ACL 的 trusted-app 要么信 node 解释器（bash 也能 spawn node 读）要么无 binary 可信。**即「限 harness 二进制读」对当前脚本形态的 harness 无落点**——需先把 harness 打包成可签名的 .app/.exec binary（分发关切）。

---

## §6 对照表：runtime-exfil ACL 的可达路径

| 路径 | 限制到「只 harness」 | 排除 bash | additive-only（无 native binding） | 需 harness code-signing | 需 Apple Developer Program | 可达？ |
|---|---|---|---|---|---|---|
| `security -T /usr/bin/security`（信 security CLI） | 否（security 是 accessor，bash 也 spawn） | **否** | 是 | 否 | 否 | runtime-exfil **不可达** |
| `security -T /path/to/harness`（信 harness 路径） | **否**（accessor 是 security 非 harness，harness 自己读也失败） | 是（security 不匹配）但 harness 也读不到 | 是 | 否 | 否 | **自锁**——harness 读不了自己的 secret |
| `security -A`（allow any） | 否 | 否 | 是 | 否 | 否 | runtime-exfil **不可达**（最不安全） |
| partition list 带 harness DR string | 否（accessor 是 security，DR=Apple 的，不匹配 harness DR；harness 经 security 读也失败） | 是 但 harness 也读不到 | 是 | 是（ad-hoc/self-signed 可伪造） | 否（ad-hoc/self-signed） | **自锁**或可伪造 |
| 独立 locked keychain + `set-keychain-settings -t 0 -l` + 启动 unlock | 部分（锁屏即锁，bash 在锁屏时读不到） | 部分（解锁窗口期间 bash 仍能 spawn security 读） | 是 | 否 | 否 | **at-rest 增强**，非 per-item ACL；runtime-exfil 窗口收窄到解锁期 |
| native binding: `SecItemAdd` + `kSecAttrAccessControl` + `.biometryCurrentSet` + `kSecUseDataProtectionKeychain` | 否（biometry 是 user-presence，非 app-identity；bash 解锁后 spawn 一个能触发 Touch-ID 的 native reader 也能读，需用户点 Touch ID） | 部分（每次读弹 Touch ID，agent 无法静默读） | **否**（需 native Security framework binding，= node-gyp 或 FFI，污染构建链） | 否（biometry 不验 app 身份） | 否 | runtime-exfil **部分可达**（每次读强制 Touch ID，agent 无法静默 exfil），但需 native binding；且非「限 harness」而是「限 user-presence」 |
| native binding + `kSecAttrAccessGroup`（绑 harness Team ID） | 是（group 绑 harness 签名身份） | 是（bash 无 harness 签名） | 否（native binding） | 是（Developer ID 不可伪造） | 是（Developer ID 需会员） | runtime-exfil **可达**，但需 native binding + harness 打包签名（分发关切，出 keychain 包范围） |
| native binding + `SecAccessCreate` + `SecTrustedApplicationCreateWithApplicationSignature(harness DR)` | 是 | 是 | 否（native binding） | 是（Developer ID） | 是 | 同上，identity-based ACL，需 native + 签名 |

---

## §7 推荐：(A) 落地 `security` CLI 能做的 + 显式 DEFER per-item ACL / runtime-exfil

### 7.1 推荐

**推荐选项 (A)**：P12b 在 `security`-CLI-only additive 包范围内落地以下生产硬化，**显式 DEFER** per-item ACL / runtime-exfil 到后续「native keychain binding + harness code-signing」票：

1. **独立 locked keychain**（非 login）：`security create-keychain -p <pw> <path>` + `security set-keychain-settings -t <short> -l -u -c`（短 auto-lock + 锁屏锁 + 超时锁 + 注销锁）+ `security set-keychain-partition-list`（把 harness 可达的解释器/进程进 partition，但见 §2.3 限制）。
2. **启动交互 unlock**：`security unlock-keychain -p <pw>` 或经 Keychain Access.app GUI 交互解锁（Touch ID 解锁 keychain 是 macOS 系统级能力，非 per-item biometry）。headless/SSH 下需 GUI session（thread/690665 实证「User interaction is not allowed」），生产部署需 GUI session 或 `unlock-keychain -p` 程序化解锁（密码存哪 = 新 secret-to-protect，见 §7.3 risk）。
3. **per-user CRUD**（P12 原型已有）：`add-generic-password -U -a userId -s ref -w value`、`find-generic-password -a userId -s ref -w`、`delete-generic-password -a userId -s ref`。
4. **userId/scopeId branding**（ticket 第 6 项）：`Branded<'UserId'>` / `Branded<'ScopeId'>` + factory，对齐 AGENTS「opaque cross-boundary ids are branded」。`types.ts` 的 `CredentialAddress` 注释已预告此门（「Branding them as cross-boundary ids is deferred to the production hardening of the per-user store」）。
5. **真实 `packages/credentials/credentials-keychain` 包**：package.json/tsconfig/src/README + 测试过 100% per-file 覆盖门，macOS-only `security` 路径用 `v8-ignore`/platform-skip 对齐 `credentials-local` 的 win32 处理。
6. **明确文档 ACL 局限**：包 README + seam 注释明示「runtime-exfil ACL（限 harness 读、排除 bash）在 `security`-CLI-only 实现下不可达（§2.3 accessor = security CLI，bash 与 harness 不可区分）；at-rest + locked-keychain + auto-lock 把 runtime-exfil 窗口收窄到 keychain 解锁期，但未消除。完整 runtime-exfil 需 native Security framework binding + harness code-signing（Developer ID），见 follow-up。」

### 7.2 为什么不 (B) block P12b 等 native binding + code-signing

- **additive-only 硬约束**：native Security framework binding = node-gyp（C/C++ addon）或 N-API FFI，**污染 harness 构建链**（P12 选 `security` CLI 正是为避开 keytar 的 native node-gyp）。这违反 standing principle「native node-gyp bindings pollute the build chain and are avoided」。P12b 若 block 在 native binding，等于把整个 credentials-keychain 包从 additive 降级为 native-build 依赖——伤上游升级路径。
- **分发关切外溢**：harness code-signing（Developer ID + notarization + 打包 .app/.exec）是**分发层**工程，不在 keychain provider 包的职责内。当前 harness 以 `pnpm exec tsx`/`node` 脚本形态跑（P12 原型正是），**无二进制可签**——block 在 code-signing 等于 block 在「harness 打包分发流程建立」，这是比 P12b 远大的工程。
- **pre-release stance**：standing principle「无外部消费者，prefer correct foundation over compat shims」——但 (A) 不是 shim，是**正确的分层**：at-rest（P12 已达）+ locked-keychain/auto-lock（P12b 落地）是 keychain 包能独立兑现的最大正确面；runtime-exfil 的剩余缺口（解锁期 bash 仍能读）需 native + 签名，**属不同层**，不应硬塞进 additive 包。
- **intranet-security-first 不违反**：(A) 下单一信任边界仍在 RBI 门（业务用户查询不经 bash/forbidden commands，由 tool gating 保证）；keychain 解锁期 bash 能读 PAT 是「host 用户自己机器上、keychain 已解锁」的信任域——该用户本就是 PAT 持有者，bash 能读自己的 PAT 不跨信任边界。runtime-exfil 的真威胁是 **agent 驱动 bash 读 PAT 外传**，这由 (a) locked-keychain + auto-lock（agent 趁用户不在时 keychain 多半已锁）+ (b) RBI tool gating（agent 的 bash 查询不经 forbidden commands）+ (c) at-rest（PAT 不在 grep 可达的文件）三层共同收窄到可接受面。完整 per-item ACL 是增强，非 intranet-security-first 的硬边。

### 7.3 风险与 follow-up

- **`unlock-keychain -p <pw>` 的密码存哪**：程序化解锁需 keychain 密码常驻内存或另一 secret store——**新 secret-to-protect**（ticket「Risks」已列「KMS/Vault 自身凭证链」同构问题）。建议：生产期 keychain 密码由用户启动时交互输入（GUI session 弹 Touch ID/keychain unlock），不存盘；或 keychain 密码本身经 macOS user login keychain（用户登录即解锁）托管——但 user login keychain 又是 bash 能 `security` 读的（回到 §2.3）。**INFERENCE**：这是 runtime-exfil 的递归性——任何让 harness 能程序化读 PAT 的机制，bash 也能复制（因为都经 `security` 或同进程模型）。彻底解必须 native binding（harness 直接 `SecItemCopyMatching`，accessor = harness 二进制，§5.4 需签名）。
- **DEFER 票内容**：建议开 follow-up 票「P12c — native keychain binding + harness code-signing for runtime-exfil ACL」，scope：(i) native Security framework binding（`SecItemAdd` + `kSecAttrAccessControl` + `kSecUseDataProtectionKeychain`，per-item biometry gate）+ (ii) harness 打包成可签名 binary + Developer ID 签名 + (iii) `kSecAttrAccessGroup` 或 `SecAccessCreate` + `SecTrustedApplicationCreateWithApplicationSignature(harness DR)` 限 harness。明确此票**依赖 harness 分发流程建立**（Apple Developer Program 会员、notarization、打包），非 keychain 包独立可决。
- **多 host central backend**（ticket 第 3 项，KMS envelope / Vault transit）：与 ACL 决策正交，P10 已解拓扑依赖，可并行推进。但 KMS/Vault 自身凭证链（新 secret-to-protect）同构受 §7.3 第一条约束——central backend 的认证凭据仍需一个 at-rest 锚点，keychain 仍是单机 host 的本地锚。
- **跨平台**（ticket 第 4 项，libsecret/CredManager）：libsecret（Linux）与 CredManager（Windows）的 ACL 模型与 macOS 不同（libsecret 有 per-item ACL 但经 D-Bus secret service；CredManager 有 ACL 但经 Win32 API），各平台的 runtime-exfil 可行性需单独 research。本笔记仅覆盖 macOS。

---

## §8 adversarial 自审（尝试反驳本笔记的关键主张）

### A1 反驳：「accessor 是 security CLI 非 spawner」是否可能错？

**质疑**：也许 securityd 评 spawner（父进程）而非直接 caller？若如此，`-T /path/to/harness` 会成功（spawner = harness），而 bash spawn security 时 spawner = bash 会被拒 → runtime-exfil ACL 在 `security`-CLI-only 下**可达**，本笔记结论 (A) 错。

**复核**：Apple Developer Forums thread/691188 DTS 原话「the hosting app that ran the keychain add op」进 ACL——「ran the keychain add op」= 直接调 SecKeychain API 的进程，不是它的父。若 securityd 评 spawner，则「hosting app that ran the add op」会是 bash（spawner）而非 security，这与 `security add-generic-password` 不传 `-T` 时 item 的 ACL 信任 `security`（不是 bash）的实测行为矛盾（P12 原型 `run.ts` 的 `set` 不传 `-T`，resolve 仍能读 → ACL 信任 security 本身）。**结论维持**：accessor = 直接 caller = `security` CLI。但**标注**：此条是 INFERENCE（无单段 Apple 文档逐字陈述「caller 非 spawner」的 securityd 语义），最强佐证是 thread/691188 的「creating app 进 ACL」+ 实测行为。若 team 要求非 INFERENCE 的硬证，可在用户 Mac 上实证：`security add-generic-password -T /path/to/harness -a test -s test -w v`，然后 bash 跑 `security find-generic-password -a test -s test -w`——若成功（accessor=security 命中 `-T`？否，`-T` 是 harness 路径，security 不匹配 → 应弹用户提示或失败）即证 accessor=security；若 bash 能静默读即证 spawner 机制。此实证应在 P12b 实现阶段执行。

### A2 反驳：partition list 带 code-signing requirement string 是否可绕过 §2.3？

**质疑**：`set-generic-password-partition-list -P "identifier \"com.harness\" and ..."` 设 harness DR 作 trusted-app，是否让 harness 经 `security` 读时命中？若如此，runtime-exfil 在 CLI-only 下可达（不需 native binding）。

**复核**：`-P` 的 list 元素可是 requirement string，但 ACL 判定的 accessor 仍是**调 SecKeychain API 的进程**（= `security`，Apple DR），不是 spawner（= harness）。security 的 DR 是 Apple 的，不匹配 `identifier "com.harness"` → harness 经 security 读会**失败**（security 不在 trusted list）；bash 经 security 读也失败（同样 accessor=security）。即 partition list 带 harness DR 会**自锁**（harness 自己也读不到）。要 harness 能读，必须 harness **直接**调 SecKeychain API（不经 `security` 子进程）——即 native binding。**结论维持**：partition list 不改变 accessor 语义，CLI-only 下无法实现「限 harness」。

### A3 反驳：locked keychain 是否已足够（不需 per-item ACL）？

**质疑**：若 keychain 大部分时间锁着（auto-lock 短、锁屏即锁），agent 驱动 bash 读 PAT 时 keychain 多半已锁 → 读失败 → runtime-exfil 已防住，per-item ACL 多余。

**复核**：部分成立但不够。(i) keychain 必须解锁后 harness 才能读 PAT 干活——**解锁窗口**存在，且 agent 在窗口内可驱动 bash 读（agent 是 harness 内的模型，harness 跑着 = keychain 多半解锁着）。(ii) auto-lock timeout 即便设短（如 30s），窗口仍非零。(iii) 用户交互解锁（Touch ID/keychain password）每次解锁都是一个 agent 可利用的窗口。故 locked keychain 把 runtime-exfil 从「任意时刻」收窄到「解锁窗口」，是**显著增强**但非**消除**。per-item biometry ACL（§4）每次读弹 Touch ID = 把窗口收窄到「用户当场授权这一读」——更强。但 per-item biometry 需 native binding。**结论维持**：(A) 落地 locked keychain 是正确的渐进，但应**诚实文档**其局限（解锁窗口未消除），不夸大为 runtime-exfil 已解决。

### A4 反驳：native binding 真的污染构建链吗？keytar 之外有无更轻的 native binding？

**质疑**：node FFI（如 `ffi-napi`）动态调 Security framework，无 node-gyp 编译，是否避开构建链污染？若如此，(B) 可行性上升。

**复核**：`ffi-napi` 仍需 native binary（`ffi-napi` 自身是 node-gyp 编译的 .node addon），且跨 Node 版本/架构（darwin-arm64 vs darwin-x64）需预编译二进制或编译——仍污染构建链，与 keytar 同类问题。另一路径：`Security.framework` 经 `node:fs` + `dlopen` 手工绑定——工程量大、维护重，且 macOS 不保证 `Security.framework` 的 C ABI 稳定（Swift API 才稳定）。**INFERENCE**：无零成本 native binding 路径；`security` CLI spawn 仍是 additive-only 约束下唯一不碰构建链的选择。若 team 接受 native build（如已有其他 native addon），则 (B) 的 native binding 阻力下降——但 standing principle 明确「avoided」，故 (A) 仍为默认。**结论维持**：(A) 为 additive-only 下的正确选择；(B) 需 team 显式放宽 additive-only 约束（非本笔记能独裁）。

### A5 反驳：是否过早 DEFER？pre-release stance 说「prefer correct foundation over shim」——(A) 是否是 shim？

**质疑**：(A) 落地 locked keychain 但 runtime-exfil 缺口（解锁窗口）仍在，是否是「compat shim」而非「correct foundation」？pre-release stance 是否要求直接做 (B) 正确基础？

**复核**：(A) 不是 shim——shim 是「为兼容旧消费者而做的妥协」。(A) 是**正确的分层**：keychain provider 包的职责边界 = 经 OS keychain 提供 at-rest 加密 + CRUD + 寻址；runtime-exfil per-item ACL 依赖 native binding + harness 签名，属**不同层**（分发层 + 构建链层）。把不同层的关切塞进一个包 = 过度耦合，反而不利升级。pre-release stance 的「correct foundation」指**包内职责的正确分层**，不是「一次性做所有层」。(A) 把 keychain 包能做到的正确面做满，把依赖外层的部分显式 DEFER 并文档——**这正是 correct foundation**。**结论维持**：(A) 符合 pre-release stance；(B) 是「一次性做所有层」，反非 correct foundation（耦合分发与构建链）。

### A6 反驳：macOS 15+「Passwords app」取代 Keychain Access，是否影响 ACL 模型？

**质疑**：macOS 15 Sequoia 起 Passwords app 成主入口（Apple Discussions thread/255921597、thread/256075207 实证 Keychain Access 启动会弹 Passwords app），file-based keychain 是否被废？ACL 模型是否变？

**复核**：macOS 15 的 Passwords app 是 **UI 层**变更（Passwords app 管 iCloud Keychain = data protection keychain 同步项），**不废 file-based keychain**（`~/Library/Keychains/*.keychain-db` 仍在、`security` CLI 仍操作它、P12 原型对 scratch keychain 仍工作）。TN3137 的三 API / 两实现模型在 macOS 15+ 仍成立。`security` CLI 的 `add-generic-password`/`find-generic-password` 仍走 SecKeychain → file-based。**结论维持**：macOS 15+ UI 变更不影响本笔记的 ACL 模型分析。

---

## §9 与 ticket 6 项决策的对应

P12b ticket「Scope」列 6 项，本笔记对其逐项落调：

1. **per-item ACL 限 harness（code-signing identity）读、排除 bash/terminal** → **本笔记核心**：`security`-CLI-only 下不可达（§2.3/§6），DEFER 到 native binding + harness 签名 follow-up（§7.3）。ticket 标「research-worthy」——本笔记即该 research，结论 = 不可达于 CLI-only。
2. **独立 locked keychain（非 login）+ 启动交互 unlock / Touch-ID** → **(A) 落地**（§7.1 第 1-2 项）：`create-keychain` + `set-keychain-settings -t -l -u -c` + `unlock-keychain`。注意 Touch ID 解锁是 keychain-level（系统级），非 per-item biometry（§4）。
3. **多 host central backend（KMS envelope / Vault transit）** → 正交，P10 已解拓扑依赖，可并行推进（§7.3）。同构 secret-to-protect 问题见 §7.3 第一条。
4. **跨平台（libsecret/CredManager）** → 各平台 ACL 模型需单独 research（§7.3 末），本笔记仅 macOS。
5. **真实 `packages/credentials/credentials-keychain` 包（per-file 100% 覆盖门）** → **(A) 落地**（§7.1 第 5 项）。
6. **userId/scopeId branding（`Branded<'UserId'>`/`Branded<'ScopeId'>` + factory）** → **(A) 落地**（§7.1 第 4 项），`types.ts` 注释已预告此门。

---

## 关键路径索引

**harness 凭证 seam + P12 原型（本笔记判定对象）**：
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/src/types.ts`（`CredentialAddress { userId?, scopeId? }` interface + 注释「Branding them as cross-boundary ids is deferred to the production hardening of the per-user store」= P12b 门、`credentials/updated` 事件声明「Ambient process-environment changes are not observable and never emit」）
- `/Users/mckenzie/workspace/deepseek-harness-da/packages/credentials/credentials/src/index.ts`（`CredentialProvider` abstract 四操作 `resolve/describe/set/unset` + `notifyUpdated` 条件 arity `address === undefined ? ['credentials/updated', ref] : ['credentials/updated', ref, address]` + per-call resolve 硬规则「consumers re-resolve at each operation and must not cache across operations」）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/prototypes/p12-credentials-keychain/run.ts`（`KeychainCredentialProvider`：`set` 用 `security add-generic-password -U -a account -s ref -w value keychain`（**未传 `-T`/`-A`**，用默认 ACL=创建者 security 进 trusted-apps，§2.2）、`resolve` 用 `security find-generic-password -a account -s ref -w keychain`、`unset` 用 `security delete-generic-password`、`setupScratchKeychain` 用 `security create-keychain -p` + `unlock-keychain -p`、`[6]` at-rest 实证 `grep 'sk-alice-demo' in DB` absent）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/tickets/phase-2/P12-credentials-keychain.md`（P12 Design：`security` CLI 非 keytar（避免 native node-gyp）+ at-rest 红线兑现 + runtime-exfil ACL + harness code-signing 显式延后 P12b）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/tickets/phase-2/P12b-credentials-keychain-hardening.md`（ticket Scope 6 项 + Risks：`-T` 按 path 非 identity 可伪造、native binding 跨平台构建链影响 additive-only、KMS/Vault 自身凭证链）
- `/Users/mckenzie/workspace/deepseek-harness-da/wayfinder/data-agent/research/r6-cred-hot-reload.md`（格式镜像：§n + path:line 引注 + INFERENCE + 对照表 + 推荐 + adversarial 自审 + 关键路径索引）

**Apple 原始文档（主源引注）**：
- TN3137「On Mac keychain APIs and implementations」https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains （三 API：Keychain/SecKeychain/SecItem；两实现：file-based/data protection；「The Keychain and SecKeychain APIs always target the file-based keychain」「SecItem … To target the data protection keychain, set `kSecUseDataProtectionKeychain`」）
- TN3133「On Code Signing」https://developer.apple.com/documentation/technotes/tn3133-on-code-signing （ad-hoc = `CS_ADHOC`、DR=cdhash、可伪造；Developer ID 链 Apple root、绑 Team ID、不可伪造）
- `SecAccessControlCreateFlags` / `biometryCurrentSet` https://developer.apple.com/documentation/security/secaccesscontrolcreateflags/2937192-biometrycurrentset （flags: `biometryCurrentSet`(8)/`biometryAny`(2)/`userPresence`(1)/`devicePasscode`(16)/`applicationPassword`/`privateKeyUsage`；`SecAccessControlCreateWithFlags(CFAllocator?, CFTypeRef, SecAccessControlCreateFlags, ...)`；`touchIDAny`→`biometryAny` deprecated）
- `kSecClassGenericPassword` https://developer.apple.com/documentation/security/ksecclassgenericpassword （`kSecAttrAccess` macOS only=file-based ACL；`kSecAttrAccessControl`=data protection；`kSecAttrAccessGroup` macOS 需 `kSecUseDataProtectionKeychain`）
- Apple Developer Forums thread/691188 https://developer.apple.com/forums/thread/691188 （`SecTrustedApplicationCreateFromPath` macOS 10.15+ deprecated；DTS 确认「the final object in the login keychain still has ACL containing the hosting app that ran the keychain add op … We've always added the creating app to the item's ACL by default」——accessor=直接 caller 的佐证）
- Apple Developer Forums thread/690665 https://developer.apple.com/forums/thread/690665 （headless/SSH 下 `set-keychain-settings`/`import` 触发「User interaction is not allowed」——locked keychain 需 GUI session 解锁的实证）
- Apple Developer Forums thread/712005 https://developer.apple.com/forums/thread/712005 （`codesign` 在 SSH/CI 非 GUI 上下文 `errSecInternalComponent` + TN3161 证书 vs 数字身份区分——code signing 需 GUI session 的佐证）
- 「Creating distribution-signed code for macOS」https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac （Developer ID distribution 签名 + notarization 流程）

**`man security`（`security` CLI flag 枚举主源）**：
- `man security`（macOS 本地 `man 1 security`；镜像 https://ss64.com/osx/security.html 、https://keith.github.io/xcode-man-pages/security.1.html ）：
  - `add-generic-password`：`-a account -s service -w password -U (update) -A (allow any app) -T appPath (trusted app by path, repeatable) -D kind -l label`——**无** biometry/`SecAccessControl` flag（§4 核心）
  - `find-generic-password`：`-a account -s service -w (show password) -g (display ACL)`
  - `set-generic-password-partition-list`：`[-S] [-s service] [-a account] [-P partitionlist] [keychain]`（`-S` 显示、`-P` 设 colon-separated list，元素可是 code-signing requirement string 或 path）
  - `set-key-partition-list`：`[-S] [-s] [-k password] [keychain]`（keys 的 partition，如 `-S apple-tool:,apple:`）
  - `set-keychain-settings`：`-t timeout -l (lock on sleep) -u (lock after timeout) -c (lock on screen logout)`——keychain 级非 per-item
  - `create-keychain`：`-p password`；`unlock-keychain`：`-p password`；`delete-keychain`

**`man codesign` + code-signing 参考**：
- `man codesign`（macOS 本地；`-s -` = ad-hoc、`-d -r-` 显 DR、`--options runtime` Hardened Runtime、`--timestamp`、`-v` verify）
- Azure DevOps `InstallAppleCertificate@2` https://docs.microsoft.com/zh-hk/azure/devops/pipelines/tasks/utility/install-apple-certificate （`setUpPartitionIdACLForPrivateKey` 选项 = `set-key-partition-list` 为导入私钥设 partition_id ACL 的实证——partition list 机制的实际工程用途）

**macOS 15+ UI 变更（adversarial §A6）**：
- Apple Discussions thread/255921597 https://discussions.apple.com/thread/255921597 （macOS 15 Keychain Access 位于 `/System/Library/CoreServices/Applications/Keychain Access.app`，Passwords app 成主入口但不废 file-based keychain）
- Apple Discussions thread/256075207 https://discussions.apple.com/thread/256075207 （macOS 15.5 Keychain Access 启动会弹 Passwords app；`security unlock-keychain` 仍工作）
