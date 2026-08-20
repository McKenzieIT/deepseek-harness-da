#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE — P9 admin harness app + access isolation  (THROWAWAY · logic/state branch)
// ─────────────────────────────────────────────────────────────────────────────
// Question: does the single-link-single-scope + SERVER-RESOLVED-scope state model
//   enforce isolation, fail-closed authz, revocation, and per-user PAT orthogonality
//   — given additive-only / reverse-bi read-only / rbi-web out-of-scope / R6-G4 stdio
//   sidecar (scope_id is a per-call PROGRAM arg, not an HTTP X-RBI-Scope header)?
//
// Run:    node run.mjs        (no npm deps; node:crypto only)
// Status: THROWAWAY. Not wired to real ctx.webServer / ctx.storageDomain / query sidecar
//         / P12 macOS-Keychain provider. Mirrors their SHAPES to validate the state model
//         from research/access-isolation-options.md + subagent findings (see README.md).
// ─────────────────────────────────────────────────────────────────────────────
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

// ── PROTOTYPE password hash/verify (real scrypt, no npm dep) ─────────────────
// PROD uses bcrypt cost 12 (RBI auth_service.verify_password). scrypt is a faithful
// stand-in for the hash/verify FLOW; the cost/algorithm choice is a P9/P12b detail.
function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const parts = stored.split('$');
  if (parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(pw, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ── Stub storage domain (mirrors ctx.storageDomain.open(defineDomain) shape) ─
// Real sqlite backend stores each domain table as "u_<unit>_<table>" (key TEXT PK,
// value TEXT). Here: in-mem Map per table. No persistence (prototype rule 3).
function openDomain(unit) {
  const tables = {};
  return {
    unit,
    table(name) {
      if (!tables[name]) {
        const m = new Map();
        tables[name] = { _map: m,
          get: (k) => m.get(k) ?? null,
          set: (k, v) => { m.set(k, v); },
          delete: (k) => { m.delete(k); },
          list: () => [...m.values()],
        };
      }
      return tables[name];
    },
    dump: () => {
      const out = {};
      for (const [n, t] of Object.entries(tables)) out[n] = [...t._map.entries()];
      return out;
    },
  };
}
const db = openDomain('admin');
const tenants   = db.table('tenants');     // id        -> Tenant
const scopes    = db.table('scopes');      // scopeId   -> ScopeRecord
const odpsCfg   = db.table('odps_config');  // '1'       -> OdpsConfig (singleton)
const accessLinks = db.table('access_links');// linkToken -> AccessLink
const users     = db.table('users');       // userId    -> User (per-user login)
const sessions  = db.table('user_sessions');// sessionToken -> {userId, expiry}
const sysCfg    = db.table('system_config');// '1'       -> SystemConfig
const credRefs  = db.table('scope_credential_refs'); // ref+scopeId -> {ref,userId?} (ref only, never plaintext)

// ── Stub credentials seam (P12 per-user keychain SHAPE, in-mem) ───────────────
// PROD = macOS Keychain via `security` CLI (P12), at-rest encrypted, agent/bash
// can't grep. Here: in-mem map keyed by (ref, userId). Shows {userId}⊥{scopeId}.
const keychain = new Map(); // `${ref}::${userId ?? 'global'}` -> value
function credSet(ref, value, address = {}) {
  keychain.set(`${ref}::${address.userId ?? 'global'}`, value);
  // would emit credentials/updated(ref, address) -> listeners invalidate caches
}
function credResolve(ref, address = {}) {
  const v = keychain.get(`${ref}::${address.userId ?? 'global'}`);
  if (v !== undefined) return v;
  return keychain.get(`${ref}::global`); // G3 fallback: per-user miss -> global T1 (early phase)
}

// ── Data model (TS interfaces mirrored as comments + plain objects) ──────────
// interface Tenant       { id; name; username; passwordHash; allowedScopeIds: string[]; isActive: boolean }
// interface ScopeRecord  { scopeId; name; region: 'domestic'|'overseas' }
// interface OdpsConfig   { accessId; accessKey; domesticEndpoint; domesticOdsProject; overseasEndpoint; overseasOdsProject }  // SINGLETON id=1
// interface AccessLink   { linkToken; scopeId; ownerTenantId; label?; isActive; expiresAt?; createdAt; revokedAt? }
// interface User         { userId; username; passwordHash }
// interface SystemConfig { defaultScopeId? }

// ── scope_id format validation (RBI _SCOPE_ID_RE, KEPT in stdio path) ────────
// scope_id is a path component (semantic-layer/{scope_id}/) + cache key + set_credentials arg,
// so unvalidated it enabled path traversal (X-RBI-Scope: A/../B). Kept at the single entry point.
const SCOPE_ID_RE = /^[A-Za-z0-9_-]+$/;
function validateScopeId(raw) {
  // reject empty / null / non-string outright (scope_id is a required path-component param;
  // the old `raw &&` falsy short-circuit let validateScopeId('') / (null) skip the regex)
  if (typeof raw !== 'string' || !SCOPE_ID_RE.test(raw)) throw new Error(`InvalidScopeError: ${raw}`);
  return raw;
}

// ── authz (faithful RBI reimplementation, fail-closed) ───────────────────────
// scope_allowed_for_tenant + RetrievalIdentity.can_access. fail-closed: db error /
// tenant not found / inactive -> DENY (never silently allow on unreadable auth data).
function scopeAllowedForTenant(tenantId, scopeId) {
  if (!tenantId) return true;                        // stdio/service/eval: allow
  let tenant;
  try { tenant = tenants.get(tenantId); } catch { return false; } // db error -> deny
  if (!tenant || !tenant.isActive) return false;     // not found / inactive -> deny
  if (!scopeId) return true;                         // tools/list: allow
  return (tenant.allowedScopeIds ?? []).includes(scopeId);
}
function canAccess(identity, scopeId) {
  if (identity.kind === 'service' || identity.isAdmin) return true;
  return (identity.allowedScopeIds ?? []).includes(scopeId);
}

// ── per-scope ODPS credential: addressing (i) singleton + region ─────────────
// OdpsConfig is a SINGLETON (access_id/access_key shared across all scopes); per-scope
// difference is only region (scope config.yaml maxcompute.environment) selecting
// project/endpoint. Addressing (i): global access_id/key ref + per-scope project/endpoint.
// (Addressing (ii) per-scope 4-ref is a P9/P4b build-time choice; not chosen here.)
function regionOfScope(scopeId) {
  const region = scopes.get(scopeId)?.region;
  if (!region) throw new Error(`UnknownScopeError: ${scopeId}`); // fail-closed: never default to domestic
  return region;
}
function resolveOdpsCredential(scopeId) {
  const cfg = odpsCfg.get('1');                      // singleton id=1
  if (!cfg) throw new Error('OdpsConfig not provisioned');
  const overseas = regionOfScope(scopeId) === 'overseas';
  return {
    accessId:  cfg.accessId,                         // SHARED across scopes
    accessKey: cfg.accessKey,                        // SHARED
    project:   overseas ? cfg.overseasOdsProject : cfg.domesticOdsProject,
    endpoint:  overseas ? cfg.overseasEndpoint   : cfg.domesticEndpoint,
  };
}

// ── access-link resolution (NET-NEW; the single-link-single-scope pivot) ──────
// RBI has NO link_token entity today (shared Bearer + client-self-reported scope = the
// spoofing hole). AccessLink is net-new: linkToken -> bound scopeId, server-resolved.
function resolveLinkScope(linkToken) {
  let link;
  try { link = accessLinks.get(linkToken); } catch { return null; } // db error -> deny
  if (!link || !link.isActive) return null;          // not found / revoked -> deny
  if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) return null; // expired -> deny
  return link.scopeId;
}

// ── stub query sidecar (proves scope_id + creds arrive SERVER-RESOLVED) ──────
// PROD: da's own raw SDK Client + stdio, scope_id a per-call program arg (R6/G4).
// Here: a dumb raw executor that logs what it received (no model-facing registration).
const sidecarLog = [];
function sidecarExecute({ scope_id, creds }) {
  const res = { ok: true, scope_id, project: creds.project, endpoint: creds.endpoint,
    access_id: creds.accessId.slice(0, 4) + '****' }; // masked, like RBI mask_access_key
  sidecarLog.push(res);
  return res;
}

// ── THE GATE (crux: server-resolved scope; client CANNOT supply scope) ───────
// "门覆盖 X-RBI-Scope" reinterpreted in the stdio frame: scope is server-authoritative
// BY CONSTRUCTION — there is no client-supplied scope header to override. Stronger than
// RBI's HTTP header-override (which left a self-reported-scope spoofing hole).
function gateQuery({ linkToken, clientRequestedScope = null, callerTenantId = null }) {
  const scopeId = resolveLinkScope(linkToken);       // server resolves from the TOKEN
  if (!scopeId) return { denied: true, reason: 'invalid/revoked/expired link (fail-closed)' };
  // OVERRIDE-BY-CONSTRUCTION: clientRequestedScope is IGNORED. (Present only to PROVE
  // the client cannot change scope.) Print both so the divergence is visible.
  const identity = { kind: 'tenant', tenantId: callerTenantId, allowedScopeIds: [scopeId], isAdmin: false };
  if (!canAccess(identity, scopeId)) return { denied: true, reason: 'authz (fail-closed)' };
  const creds = resolveOdpsCredential(scopeId);
  const out = sidecarExecute({ scope_id: scopeId, creds }); // programmatic arg, NO header
  return { denied: false, clientRequestedScope, resolvedScope: scopeId, sidecar: out };
}

// ── admin provisioning surface ────────────────────────────────────────────────
function provisionScope(scopeId, name, region) { validateScopeId(scopeId); scopes.set(scopeId, { scopeId, name, region }); }
function provisionTenant(id, name, username, password, allowedScopeIds, isActive = true) {
  tenants.set(id, { id, name, username, passwordHash: hashPassword(password), allowedScopeIds, isActive });
}
function provisionOdpsConfig(cfg) { odpsCfg.set('1', { ...cfg }); } // singleton id=1
function issueLink(scopeId, ownerTenantId, label, { expiresAt = null } = {}) {
  validateScopeId(scopeId); // security: path-traversal guard (scopeId is a path component in PROD)
  const linkToken = randomBytes(32).toString('base64url');
  accessLinks.set(linkToken, { linkToken, scopeId, ownerTenantId, label, isActive: true,
    expiresAt, createdAt: new Date().toISOString(), revokedAt: null });
  return linkToken; // shown once (like Qoder PAT)
}
function revokeLink(linkToken) {
  const l = accessLinks.get(linkToken);
  if (l) accessLinks.set(linkToken, { ...l, isActive: false, revokedAt: new Date().toISOString() });
}

// ── per-user login + PAT self-service ─────────────────────────────────────────
function registerUser(userId, username, password) { users.set(userId, { userId, username, passwordHash: hashPassword(password) }); }
function login(username, password) {
  const u = users.list().find(u => u.username === username);
  if (!u || !verifyPassword(password, u.passwordHash)) return null; // return-value indistinguishable; timing not hardened (deferred to P12b)
  const sessionToken = randomBytes(32).toString('base64url');
  sessions.set(sessionToken, { userId: u.userId, expiry: Date.now() + 3600e3 });
  return sessionToken;
}
// per-user PAT self-service: user pastes OWN Qoder PAT -> per-user keychain slot.
// admin NEVER sees/touches the PAT value (G3 red line). {userId} orthogonal to {scopeId}.
function selfServicePat(userId, pat) { credSet('QODER_PERSONAL_ACCESS_TOKEN', pat, { userId }); }

// ── scenario harness ──────────────────────────────────────────────────────────
const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const dump = (label, obj) => console.log(`     ${label}: ${JSON.stringify(obj)}`);
const nowIso = () => new Date().toISOString();
const pastIso = () => new Date(Date.now() - 1000).toISOString();

// ════════════════════════════════════════════════════════════════════════════
// S1 — issue link + isolation + override-by-construction
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S1 issue + isolation + override-by-construction ──');
provisionScope('scopeA', 'K11折扣服', 'domestic');
provisionScope('scopeB', '海外折扣服', 'overseas');
provisionOdpsConfig({ accessId: 'LTAIshared', accessKey: 'shared-secret',
  domesticEndpoint: 'dom.odps.aliyunc.com', domesticOdsProject: 'dom_ods',
  overseasEndpoint: 'ovr.odps.aliyunc.com', overseasOdsProject: 'ovr_ods' });
const linkA = issueLink('scopeA', 'tenantOps', 'ops-折扣-8月');
const r1 = gateQuery({ linkToken: linkA, clientRequestedScope: 'scopeB' }); // client "asks for" B
dump('clientRequestedScope', r1.clientRequestedScope);
dump('resolvedScope (server)', r1.resolvedScope);
dump('sidecar received', r1.sidecar);
check('S1a server resolves scope from token (not client request)', r1.resolvedScope === 'scopeA' && r1.clientRequestedScope === 'scopeB');
check('S1b sidecar got scopeA (server-resolved, programmatic)', r1.sidecar.scope_id === 'scopeA');
check('S1c sidecar NEVER received scopeB', !sidecarLog.some(s => s.scope_id === 'scopeB'));
check('S1d client cannot escalate scope', r1.resolvedScope !== r1.clientRequestedScope);

// ════════════════════════════════════════════════════════════════════════════
// S2 — revocation (fail-closed, no long-TTL cache bypass)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S2 revocation ──');
revokeLink(linkA);
const r2 = gateQuery({ linkToken: linkA });
dump('revoked link query', r2);
check('S2a revoked link denied (fail-closed)', r2.denied === true);
const linkA2 = issueLink('scopeA', 'tenantOps', 'ops-折扣-8月-轮换');
const r2b = gateQuery({ linkToken: linkA2 });
check('S2b newly-issued link works', r2b.denied === false && r2b.resolvedScope === 'scopeA');

// ════════════════════════════════════════════════════════════════════════════
// S3 — fail-closed authz branches
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S3 fail-closed branches ──');
check('S3a unknown token -> deny', resolveLinkScope('bogus') === null);
const expLink = issueLink('scopeA', 'tenantOps', 'expired', { expiresAt: pastIso() });
check('S3b expired token -> deny', resolveLinkScope(expLink) === null);
provisionTenant('tEmpty', '空授权', 'emptyUser', 'pw', []);            // empty allowedScopeIds
check('S3c empty allowedScopeIds -> deny', scopeAllowedForTenant('tEmpty', 'scopeA') === false);
provisionTenant('tInactive', '停用', 'inactiveUser', 'pw', ['scopeA'], false);
check('S3d inactive tenant -> deny', scopeAllowedForTenant('tInactive', 'scopeA') === false);
check('S3e non-existent tenant -> deny', scopeAllowedForTenant('nope', 'scopeA') === false);
const origGet = tenants.get;
tenants.get = () => { throw new Error('db down'); };                    // simulate db error
check('S3f db error -> deny (never silently allow)', scopeAllowedForTenant('tEmpty', 'scopeA') === false);
tenants.get = origGet;

// ════════════════════════════════════════════════════════════════════════════
// S4 — per-user login + PAT self-service + orthogonality + at-rest
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S4 per-user login + PAT self-service + at-rest ──');
registerUser('alice', 'alice', 'alice-pw');
registerUser('bob', 'bob', 'bob-pw');
check('S4a correct password logs in', !!login('alice', 'alice-pw'));
check('S4b wrong password denied (fail-closed)', login('alice', 'wrong') === null);
selfServicePat('alice', 'sk-alice-demo-PAT');                          // alice pastes her own PAT
dump('resolve PAT as alice', credResolve('QODER_PERSONAL_ACCESS_TOKEN', { userId: 'alice' }));
dump('resolve PAT as bob', credResolve('QODER_PERSONAL_ACCESS_TOKEN', { userId: 'bob' }));
check('S4c alice resolves her PAT', credResolve('QODER_PERSONAL_ACCESS_TOKEN', { userId: 'alice' }) === 'sk-alice-demo-PAT');
check('S4d bob does NOT see alice PAT ({userId} orthogonal)', credResolve('QODER_PERSONAL_ACCESS_TOKEN', { userId: 'bob' }) == null);
// at-rest red line: admin store (tenants/users/scope_credential_refs/...) must NOT contain PAT plaintext
const adminStoreBlob = JSON.stringify(db.dump());
check('S4e PAT plaintext ABSENT from admin store (at-rest, admin never touches PAT)', !adminStoreBlob.includes('sk-alice-demo-PAT'));
check('S4f PAT lives only in keychain (P12 seam), not admin domain', JSON.stringify([...keychain.values()]).includes('sk-alice-demo-PAT'));

// ════════════════════════════════════════════════════════════════════════════
// S5 — per-scope ODPS credential addressing (i): singleton + region
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S5 per-scope ODPS credential addressing (i) ──');
const cA = resolveOdpsCredential('scopeA'); // domestic
const cB = resolveOdpsCredential('scopeB'); // overseas
dump('scopeA (domestic) creds', cA);
dump('scopeB (overseas) creds', cB);
check('S5a accessId SHARED (singleton)', cA.accessId === cB.accessId && cA.accessId === 'LTAIshared');
check('S5b accessKey SHARED (singleton)', cA.accessKey === cB.accessKey);
check('S5c project differs by region', cA.project === 'dom_ods' && cB.project === 'ovr_ods');
check('S5d endpoint differs by region', cA.endpoint === 'dom.odps.aliyunc.com' && cB.endpoint === 'ovr.odps.aliyunc.com');
// set_credentials shape passed to sidecar (R6): {scope_id, creds}
const r5 = gateQuery({ linkToken: linkA2 });
check('S5e sidecar received set_credentials shape {scope_id, project, endpoint, access_id}',
  r5.sidecar.scope_id === 'scopeA' && r5.sidecar.project === 'dom_ods' && r5.sidecar.endpoint === 'dom.odps.aliyunc.com');

// ════════════════════════════════════════════════════════════════════════════
// S6 — TTL/expiry
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S6 TTL/expiry ──');
const futureLink = issueLink('scopeA', 'tenantOps', 'future', { expiresAt: new Date(Date.now() + 3600e3).toISOString() });
check('S6a unexpired link works', gateQuery({ linkToken: futureLink }).denied === false);
check('S6b expired link denied', gateQuery({ linkToken: expLink }).denied === true);

// ════════════════════════════════════════════════════════════════════════════
// S7 — scope_id validation (fail-closed: path-traversal / empty / un-provisioned)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── S7 scope_id validation (fail-closed) ──');
// validateScopeId: reject empty / null / non-string / malformed outright (no falsy short-circuit)
check('S7a validateScopeId rejects empty string', (() => { try { validateScopeId(''); return false; } catch { return true; } })());
check('S7b validateScopeId rejects null', (() => { try { validateScopeId(null); return false; } catch { return true; } })());
check('S7c validateScopeId rejects path-traversal (A/../B)', (() => { try { validateScopeId('A/../B'); return false; } catch { return true; } })());
check('S7d validateScopeId accepts well-formed', validateScopeId('valid_scope-1') === 'valid_scope-1');
// issueLink: malformed scopeId must be rejected at binding (scopeId is a path component in PROD)
check('S7e issueLink rejects path-traversal scopeId', (() => { try { issueLink('A/../B', 'tenantOps', 'evil'); return false; } catch { return true; } })());
check('S7f issueLink rejects empty scopeId', (() => { try { issueLink('', 'tenantOps', 'empty'); return false; } catch { return true; } })());
// regionOfScope / resolveOdpsCredential: un-provisioned scope must FAIL (no silent domestic default)
check('S7g regionOfScope fails-closed on un-provisioned scope', (() => { try { regionOfScope('neverProvisioned'); return false; } catch { return true; } })());
check('S7h resolveOdpsCredential fails-closed on un-provisioned scope', (() => { try { resolveOdpsCredential('neverProvisioned'); return false; } catch { return true; } })());

// ── verdict ───────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.pass);
console.log(`\n══ ${results.length - failed.length}/${results.length} checks passed ─═`);
if (failed.length) {
  console.log('FAILED:'); failed.forEach(r => console.log('  ❌ ' + r.name));
  process.exit(1);
}
console.log('\nVERDICT: single-link-single-scope + server-resolved-scope state model holds.');
console.log('  - client cannot supply/escalate scope (override-by-construction, S1)');
console.log('  - revocation fail-closed with no long-TTL bypass (S2)');
console.log('  - authz fail-closed on empty/inactive/missing/db-error (S3)');
console.log('  - per-user PAT orthogonal {userId}⊥{scopeId}, at-rest absent from admin store (S4)');
console.log('  - ODPS singleton + region addressing (i) (S5); (ii) per-scope-4-ref deferred to P4b');
console.log('  - TTL/expiry enforced (S6)');
