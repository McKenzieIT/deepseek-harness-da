#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE — P10 内网穿透安全加固  (THROWAWAY · logic/state branch)
// ─────────────────────────────────────────────────────────────────────────────
// Question: 给定已锁前置约束（信任边界单一在 P9 gate / TLS 由门前 transport 终结→转发
//   webserver loopback / PAT 不每调用经 transport 明文、不进 process.env / 前期单 host
//   用户 Mac），transport 形态 + mTLS 身份粒度 + 工具门禁执行点怎么定，才合
//   intranet-security-first？
//
// Grilling 锁定（本 session，/prototype + 一问一答给推荐）：
//   - Transport = Caddy 反代 + mTLS（无隧道；Mac 内网直接可达 admin 分配 addr:port）。
//     最小暴露面、零隧道组件。frp/chisel 前期 ruled out，跨网/多 host 留作 additive
//     叠加（→P12b 或跨网真需求时 ticket）。
//   - mTLS = transport-only：org/device 客户端证书（单一内部 CA，admin 签发，短命+rotation）；
//     per-user 身份+scope 全在 P9 gate（per-user 登录 or access-link token）。非 per-user cert。
//   - 工具门禁 = defense-in-depth：P9 gate 标 session 身份（identity.kind）→ P7 preset 按身份
//     套受限 allowlist（business-user 禁 bash/code-runtime-shell/file-write/str-replace-editor/
//     AskUserQuestion 委派 + admin 工具）+ gate tools/pre-execute hook 兜底。
//
// Run:    node run.mjs        (no npm deps; node:crypto only)
// Status: THROWAWAY. Not wired to real Caddy / ctx.webServer / P9 dsh-admin gate / P7 preset /
//         P12 keychain. Mirrors their SHAPES to validate the trust-boundary + tool-gating 决策流。
//         Caddyfile + cert-lifecycle/tool-gating design 见同目录 README.md / Caddyfile。
//
// code-review fixes（2026-08-20，2 subagent）：B1 注释纠正 Caddy native client_auth 不查吊销
//   （revoked flag 仅占位、需 CRL/verifier）；B2 注释限定"不可供给 scope"为 link 模式；
//   A5 admin 工具入 DANGEROUS；A3 login-mode DB 查询 try/catch fail-closed 对称；B3 link 模式
//   构造 allowedScopeIds=[scope] 走同一 authz 闸门；A6 补 S4c inactive/S6d admin-bypass 测试；
//   B4 resolvePat 加 scopeId 维度（stub 仍按 userId）。
// ─────────────────────────────────────────────────────────────────────────────
import { randomBytes } from 'node:crypto';

// ── PROTOTYPE cert SHAPE stub (mirrors Caddy client_auth require_and_verify) ─
// PROD: Caddy `tls { client_auth { mode require_and_verify; trusted_ca_cert_file ca.crt } }`
// 在 TLS 握手层验证客户端证书（先于 HTTP）。Caddy native client_auth 只验：证书出示 + 链到
// 受信 CA + 在有效期内（NotBefore/NotAfter）——**不做 CRL/OCSP 吊销检查**（Go crypto/tls
// 默认不查吊销）。这里 stub 一个 cert 对象 + admit/deny 决策，复刻"issuer 受信 + 未过期"两判
// （Caddy 真实能力）+ 一个 `revoked` 占位分支（**仅当部署期加 CRL/custom verifier 才成立**——
// 见 README deferred #3、→P12b）。真实 X.509 由 Caddy/openssl 管，prototype 不做；S2c 测的是
// "假设有 verifier 时的行为"——勿据此以为 require_and_verify 会拒掉已吊销证书（不会，需 CRL/
// verifier，否则吊销证书过期前仍可过 mTLS）。短命+rotation=靠过期吊销（S8）才是前期真实策略。
const INTERNAL_CA = 'dsh-internal-ca';
function issueClientCert(subject, { expiresAt, revoked = false } = {}) {
  return {
    subject,                                      // org/device 名（非 per-user）
    issuer: INTERNAL_CA,                          // 由内部 CA 签
    expiresAt: expiresAt ?? Date.now() + 7 * 864e5,  // 短命默认 7d（rotation = 吊销靠过期）
    revoked,                                      // 占位：仅 CRL/custom verifier 部署后才真生效
    fingerprint: randomBytes(8).toString('hex'),
  };
}
function mtlsAdmit(cert) {
  if (!cert) return { admit: false, reason: 'no client cert (TLS reject)' };
  if (cert.issuer !== INTERNAL_CA) return { admit: false, reason: 'untrusted issuer (TLS reject)' };
  if (cert.revoked) return { admit: false, reason: 'revoked client cert (TLS reject — 需 CRL/verifier，native client_auth 不查吊销)' };
  if (cert.expiresAt <= Date.now()) return { admit: false, reason: 'expired client cert (TLS reject)' };
  return { admit: true, principal: cert.subject };   // transport 身份 = device/org，非 per-user
}

// ── Stub P9 gate (mirrors dsh-admin gate = 单一信任边界) ───────────────────────
// PROD: ctx.webServer 上 /gate/login(per-user 登录) + /gate/link/:token(access-link→scope)。
// scope 解析两种形态：link 模式 = token 服务端解析（客户端不可供给 scope——P9 消除 RBI 自报
// scope spoofing 洞的关键）；login 模式 = 客户端从其 allowedScopeIds 选一个 scope 查询，gate
// fail-closed 校验该 scope ∈ allowedScopeIds（这是授权执行，非 P9 spoofing 洞——用户只能查已授权 scope）。
const tenants = new Map();       // tenantId -> { allowedScopeIds, isActive }
const accessLinks = new Map();   // linkToken -> { scopeId, isActive, expiresAt }
const loginSessions = new Map(); // sessionToken -> { userId, tenantId, expiry }
const ADMIN_USERS = new Set(['admin']);   // P9: username∈adminUsernameSet → identityKind=admin
function provisionTenant(id, allowedScopeIds, isActive = true) { tenants.set(id, { allowedScopeIds, isActive }); }
function issueLink(scopeId, { expiresAt = null } = {}) {
  const t = randomBytes(16).toString('base64url');
  accessLinks.set(t, { scopeId, isActive: true, expiresAt });
  return t;
}
function revokeLink(t) { const l = accessLinks.get(t); if (l) accessLinks.set(t, { ...l, isActive: false }); }
function login(userId, tenantId) {            // PROD: bcrypt + session；stub 直发 session
  const s = randomBytes(16).toString('base64url');
  loginSessions.set(s, { userId, tenantId, expiry: Date.now() + 3600e3 });
  return s;
}
// 入口解析：access-link 模式（token→scope，token 即授权，走同一 authz 闸门）or per-user 登录模式
function gateEntry({ mode, session, linkToken }) {
  if (mode === 'link') {
    let l;
    try { l = accessLinks.get(linkToken); } catch { return { denied: true, reason: 'db error (fail-closed)' }; }
    if (!l || !l.isActive) return { denied: true, reason: 'invalid/revoked link (fail-closed)' };
    if (l.expiresAt && l.expiresAt <= Date.now()) return { denied: true, reason: 'expired link (fail-closed)' };
    // link 模式：token 绑 scope → allowedScopeIds=[scope]，走与 login 同一 authz 闸门（P9 均一性）
    return { denied: false, scopeId: l.scopeId, allowedScopeIds: [l.scopeId], identityKind: 'business-user' };
  }
  if (mode === 'login') {
    let s, t;
    try { s = loginSessions.get(session); t = s ? tenants.get(s.tenantId) : null; }   // A3: wrap DB lookups
    catch { return { denied: true, reason: 'db error (fail-closed)' }; }              // db error -> deny (对称 link)
    if (!s || s.expiry <= Date.now()) return { denied: true, reason: 'invalid/expired session (fail-closed)' };
    if (!t || !t.isActive) return { denied: true, reason: 'inactive tenant (fail-closed)' };
    if (!(t.allowedScopeIds ?? []).length) return { denied: true, reason: 'empty allowedScopeIds (fail-closed, 宁拒不错)' };
    const identityKind = ADMIN_USERS.has(s.userId) ? 'admin' : 'business-user';
    return { denied: false, tenantId: s.tenantId, allowedScopeIds: t.allowedScopeIds, identityKind, userId: s.userId };
  }
  return { denied: true, reason: 'unknown entry mode' };
}
// authz: scope 是否允许该 identity（fail-closed；service/admin 放行，scope 不在 allowedScopeIds → 拒）。
// service 分支：供 da→sidecar 等 stdio/service/eval 内部调用（非 inbound 用户流，inbound 场景不触达）。
function authz({ identityKind, allowedScopeIds, scopeId }) {
  if (identityKind === 'service' || identityKind === 'admin') return true;
  if (!scopeId) return true;                             // scope-less meta op（PROD 限 tools/list 等特定 meta 工具）
  return (allowedScopeIds ?? []).includes(scopeId);
}

// ── Stub tool-gating (mirrors P7 preset allowlist by identity + gate pre-execute hook) ─
// PROD: P7 data-agent preset 按 session identity.kind 裁工具集；gate tools/pre-execute hook
// 兜底二次拒（PROD 中 hook 应是独立策略源，非复用 preset 同一函数——本 stub 复用以简化）。
const DANGEROUS_TOOLS = ['bash', 'code-runtime-shell', 'file-write', 'str-replace-editor', 'AskUserQuestion-delegate', 'admin'];
const FULL_TOOLS = ['query', 'retrieval', 'semantic-layer', 'audit', 'bash', 'code-runtime-shell',
  'file-write', 'str-replace-editor', 'AskUserQuestion-delegate', 'admin'];
function toolsForIdentity(identityKind) {
  if (identityKind === 'admin' || identityKind === 'service') return FULL_TOOLS;
  return FULL_TOOLS.filter(t => !DANGEROUS_TOOLS.includes(t));   // business-user：去危险工具（含 admin 工具）
}
function preExecuteHook(identityKind, tool) {                    // gate 兜底（defense-in-depth；PROD 独立策略源）
  if (toolsForIdentity(identityKind).includes(tool)) return { allow: true };
  return { allow: false, reason: `tool '${tool}' not in ${identityKind} allowlist (pre-execute backstop)` };
}

// ── Stub PAT resolution (P12 keychain，服务端 resolve，不经 transport) ─────────
// PROD: ctx.credentials.resolve(ref, {userId, scopeId}) -> P12 macOS Keychain -> accessToken(value)。
// P12 寻址是 {userId}⊥{scopeId} 正交（per-user PAT 维度，与 per-scope ODPS 凭证正交）；at-rest 加密；
// 客户端请求不带 PAT；transport 不传 PAT per-call（G3 红线）；稳定期 per-user miss 应禁 fallback。
// stub：为简明只按 userId 取值（P12 正交维度未完全 mirror）；G3 早期 per-user miss→全局 T1 fallback。
const keychain = new Map();   // `${userId}` -> PAT (stub 单维；PROD {userId,scopeId} 正交 + at-rest 加密)
function selfServicePat(userId, pat) { keychain.set(userId, pat); }  // 用户 web UI 自助填（经 mTLS 入 keychain）
function resolvePat({ userId, scopeId } = {}) { void scopeId; return keychain.get(userId) ?? keychain.get('global'); }  // G3 fallback

// ── 全流程：inbound request -> transport -> gate -> tool-gating -> PAT ──────
// 一条 trace 把信任边界流打出来（rule 5: surface state）。
function inboundRequest({ cert, mode, session, linkToken, tool, requestedScope, userId }) {
  const t = [];
  // 1) transport: Caddy mTLS
  const m = mtlsAdmit(cert);
  t.push({ layer: 'transport(mTLS)', admit: m.admit, principal: m.principal, reason: m.reason });
  if (!m.admit) return { trace: t, rejectedAt: 'transport' };
  // 2) webserver loopback -> gate entry（单一信任边界）
  const g = gateEntry({ mode, session, linkToken });
  t.push({ layer: 'gate(entry)', denied: g.denied, reason: g.reason, scopeId: g.scopeId, identityKind: g.identityKind });
  if (g.denied) return { trace: t, rejectedAt: 'gate' };
  // 3) gate authz（统一闸门：link 模式 token 绑 scope→[scope]、login 模式 scope 须 ∈ allowedScopeIds）
  const scopeId = g.scopeId ?? requestedScope;
  const authzOk = authz({ ...g, scopeId });
  t.push({ layer: 'gate(authz)', allowed: authzOk, scopeId });
  if (!authzOk) return { trace: t, rejectedAt: 'gate(authz)' };
  // 4) identity 标记（gate 标，preset/tool-gating 读）
  t.push({ layer: 'identity', kind: g.identityKind, scopeId, userId: userId ?? g.userId });
  // 5) tool-gating: preset allowlist + pre-execute hook 兜底
  const inAllowlist = toolsForIdentity(g.identityKind).includes(tool);
  const hook = preExecuteHook(g.identityKind, tool);
  t.push({ layer: 'tool-gate', tool, inAllowlist, hookAllow: hook.allow, reason: hook.reason });
  if (!hook.allow) return { trace: t, rejectedAt: 'tool-gate' };
  // 6) PAT 服务端 resolve（subagent-qoder 调用时；不经 transport）
  const pat = resolvePat({ userId: userId ?? g.userId });
  t.push({ layer: 'PAT-resolve(server)', userId: userId ?? g.userId, patResolved: !!pat, patOverTransport: false });
  return { trace: t, allowed: true, scopeId, identityKind: g.identityKind, tool, patResolved: !!pat };
}

// ── scenario harness ──────────────────────────────────────────────────────────
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const printTrace = (tr) => { for (const s of tr) console.log(`     · ${s.layer}: ${JSON.stringify(s)}`); };

// fixtures
provisionTenant('ops', ['scopeA']);
provisionTenant('opsEmpty', []);
provisionTenant('opsInactive', ['scopeA'], false);
provisionTenant('adminTenant', ['scopeA']);
const certGood = issueClientCert('ops-laptop-01');
selfServicePat('alice', 'sk-alice-demo-PAT');
selfServicePat('global', 'sk-global-T1-fallback');      // T1 全局 fallback（G3 早期）

// ════════════════════════════════════════════════════════════════════════════
// S1 valid cert + valid per-user login + allowed scope -> allowed, business-user tool set
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S1 valid cert + per-user login + allowed scope ──');
const sess = login('alice', 'ops');
const r1 = inboundRequest({ cert: certGood, mode: 'login', session: sess, tool: 'query', requestedScope: 'scopeA', userId: 'alice' });
printTrace(r1.trace);
check('S1a transport mTLS admits valid org cert', r1.trace[0].admit === true);
check('S1b gate admits per-user login', r1.trace[1].denied === false);
check('S1c identity tagged business-user', r1.trace[3].kind === 'business-user');
check('S1d query tool in business-user allowlist', r1.trace[4].inAllowlist === true);
check('S1e PAT resolved server-side (S7a/b 证不经 transport)', r1.patResolved === true);

// ════════════════════════════════════════════════════════════════════════════
// S2 missing/untrusted/revoked/expired client cert -> TLS reject (never reaches gate)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S2 missing/untrusted/revoked/expired cert -> TLS reject ──');
const r2a = inboundRequest({ cert: null, mode: 'link', linkToken: issueLink('scopeA'), tool: 'query' });
check('S2a no cert -> transport reject (never reaches gate)', r2a.rejectedAt === 'transport' && r2a.trace.length === 1);
const certUntrusted = issueClientCert('rogue'); certUntrusted.issuer = 'not-our-ca';
const r2b = inboundRequest({ cert: certUntrusted, mode: 'link', linkToken: issueLink('scopeA'), tool: 'query' });
check('S2b untrusted issuer -> transport reject', r2b.rejectedAt === 'transport');
const certRevoked = issueClientCert('ops-laptop-02'); certRevoked.revoked = true;
// 注：S2c 测的是"假设部署期加 CRL/custom verifier"的行为——native client_auth 不查吊销，
// 无 verifier 时已吊销证书过期前仍可过 mTLS（见 mtlsAdmit 注释 + README deferred #3 → P12b）。
const r2c = inboundRequest({ cert: certRevoked, mode: 'link', linkToken: issueLink('scopeA'), tool: 'query' });
check('S2c revoked cert -> transport reject (需 CRL/verifier，非 native client_auth)', r2c.rejectedAt === 'transport');
const certExpired = issueClientCert('ops-laptop-03', { expiresAt: Date.now() - 1000 });
const r2d = inboundRequest({ cert: certExpired, mode: 'link', linkToken: issueLink('scopeA'), tool: 'query' });
check('S2d expired cert -> transport reject (短命+rotation=吊销靠过期)', r2d.rejectedAt === 'transport');

// ════════════════════════════════════════════════════════════════════════════
// S3 valid cert + revoked/expired access-link -> gate reject (mTLS passed, gate is boundary)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S3 valid cert + revoked/expired link -> gate reject (mTLS passed) ──');
const linkX = issueLink('scopeA');
revokeLink(linkX);
const r3 = inboundRequest({ cert: certGood, mode: 'link', linkToken: linkX, tool: 'query' });
printTrace(r3.trace);
check('S3a mTLS admitted (transport not the scope boundary)', r3.trace[0].admit === true);
check('S3b gate rejected revoked link (fail-closed)', r3.rejectedAt === 'gate' && /revoked/.test(r3.trace[1].reason));
const linkExp = issueLink('scopeA', { expiresAt: Date.now() - 1000 });
const r3b = inboundRequest({ cert: certGood, mode: 'link', linkToken: linkExp, tool: 'query' });
check('S3c gate rejected expired link (fail-closed)', r3b.rejectedAt === 'gate' && /expired/.test(r3b.trace[1].reason));

// ════════════════════════════════════════════════════════════════════════════
// S4 valid cert + valid login + scope NOT in allowedScopeIds -> gate authz reject
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S4 valid cert + login + scope not allowed -> authz reject ──');
const sessOps = login('alice', 'ops');                  // ops tenant: allowedScopeIds=[scopeA]
const r4 = inboundRequest({ cert: certGood, mode: 'login', session: sessOps, tool: 'query', requestedScope: 'scopeB', userId: 'alice' });
printTrace(r4.trace);
check('S4 gate authz rejects scope not in allowedScopeIds (fail-closed, 宁拒不错)', r4.rejectedAt === 'gate(authz)');
const sessEmpty = login('bob', 'opsEmpty');
const r4b = inboundRequest({ cert: certGood, mode: 'login', session: sessEmpty, tool: 'query', requestedScope: 'scopeA', userId: 'bob' });
check('S4b empty allowedScopeIds -> reject (fail-closed)', r4b.rejectedAt === 'gate');
const sessInactive = login('carol', 'opsInactive');      // A6: inactive-tenant coded-but-untested 补测
const r4c = inboundRequest({ cert: certGood, mode: 'login', session: sessInactive, tool: 'query', requestedScope: 'scopeA', userId: 'carol' });
check('S4c inactive tenant -> reject (fail-closed)', r4c.rejectedAt === 'gate' && /inactive/.test(r4c.trace[1].reason));

// ════════════════════════════════════════════════════════════════════════════
// S5 business user attempts bash -> preset allowlist blocks + pre-execute hook backstop
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S5 business-user attempts dangerous tool -> defense-in-depth block ──');
const r5 = inboundRequest({ cert: certGood, mode: 'login', session: sessOps, tool: 'bash', requestedScope: 'scopeA', userId: 'alice' });
printTrace(r5.trace);
check('S5a bash NOT in business-user allowlist', r5.trace[4].inAllowlist === false);
check('S5b pre-execute hook backstop rejects (defense-in-depth)', r5.rejectedAt === 'tool-gate' && /backstop/.test(r5.trace[4].reason));
const r5b = inboundRequest({ cert: certGood, mode: 'login', session: sessOps, tool: 'admin', requestedScope: 'scopeA', userId: 'alice' });  // A5: admin 工具也禁
check('S5c admin tool NOT in business-user allowlist (A5 fix)', r5b.trace[4].inAllowlist === false && r5b.rejectedAt === 'tool-gate');

// ════════════════════════════════════════════════════════════════════════════
// S6 admin user -> full tool set (bash allowed) + authz bypass
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S6 admin -> full tool set + authz bypass ──');
const adminSess = login('admin', 'adminTenant');        // adminTenant: allowedScopeIds=[scopeA]
const r6 = inboundRequest({ cert: certGood, mode: 'login', session: adminSess, tool: 'bash', requestedScope: 'scopeB', userId: 'admin' });  // scopeB ∉ adminTenant allowed
printTrace(r6.trace);
check('S6a admin identity tagged', r6.trace[3].kind === 'admin');
check('S6b bash in admin allowlist', r6.trace[4].inAllowlist === true);
check('S6c admin allowed to run bash', r6.allowed === true);
check('S6d admin authz bypasses scope-not-in-allowedScopeIds (A6: bypass coded-but-untested 补测)', r6.trace[2].allowed === true && r6.allowed === true);

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// S7 PAT resolved server-side; client request + transport carry NO PAT per-call
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S7 PAT server-side resolve (G3: not over transport, not in process.env) ──');
const r7 = inboundRequest({ cert: certGood, mode: 'login', session: sessOps, tool: 'query', requestedScope: 'scopeA', userId: 'alice' });
const requestBlob = JSON.stringify({ ...r7, session: sessOps, tool: 'query', requestedScope: 'scopeA' });
check('S7a PAT NOT in inbound request/transport blob', !requestBlob.includes('sk-alice-demo-PAT'));
check('S7b PAT NOT in transport/gate trace', !JSON.stringify(r7.trace).includes('sk-alice-demo-PAT'));
check('S7c PAT resolved server-side from keychain', resolvePat({ userId: 'alice' }) === 'sk-alice-demo-PAT');
check('S7d per-user miss falls back to global T1 (G3 early; 稳定期应禁 fallback)', resolvePat({ userId: 'nobody' }) === 'sk-global-T1-fallback');

// ════════════════════════════════════════════════════════════════════════════
// S8 cert rotation/revocation lifecycle (短命+rotation)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S8 cert rotation (短命+rotation=吊销靠过期) ──');
const certShort = issueClientCert('ops-laptop-04', { expiresAt: Date.now() + 1000 });
check('S8a fresh short-lived cert admitted', mtlsAdmit(certShort).admit === true);
certShort.expiresAt = Date.now() - 1;                    // 模拟过期
check('S8b expired short-lived cert rejected (auto-revocation by expiry)', mtlsAdmit(certShort).admit === false);
const certRotated = issueClientCert('ops-laptop-04');    // rotation：re-issue 新 cert 替换
check('S8c rotated (re-issued) cert admitted', mtlsAdmit(certRotated).admit === true);

// ── verdict ───────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.pass);
console.log(`\n══ ${results.length - failed.length}/${results.length} checks passed ─═`);
if (failed.length) {
  console.log('FAILED:'); failed.forEach(r => console.log('  ❌ ' + r.name));
  process.exit(1);
}
console.log('\nVERDICT: trust-boundary + tool-gating 决策流 holds.');
console.log('  - transport=Caddy mTLS（org/device cert, 短命+rotation），非隧道、最小暴露面（S1/S2/S8）');
console.log('  - mTLS=transport-only（只验 issuer+expiry；native 不查吊销，需 CRL/verifier→P12b）；gate=单一信任边界（S3/S4）');
console.log('  - 工具门禁 defense-in-depth：preset allowlist by identity + pre-execute hook 兜底（S5/S6）');
console.log('  - PAT 服务端 resolve、不经 transport、不在 process.env（G3）（S7）');
console.log('  - 跨网/多 host=chisel overlay 或 P12b central backend，deferred（非前期）');
