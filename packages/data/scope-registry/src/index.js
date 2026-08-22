/**
 * Per-scope namespace registry (`ctx.scopes`). A runtime-mutable store of scope
 * definitions — each scope maps an id to a filesystem `semanticRoot` path plus
 * optional metadata (active provider, project name, etc.). The registry is
 * persisted to a YAML file on disk; the Cordis static config tells the service
 * WHERE to find the file (`registryPath`), while the file itself is the
 * runtime-mutable state that CLI / API / Web UI can read and write.
 *
 * Design decisions (semantic-layer map P1):
 * - Cordis config = WHERE the registry lives (static, set at bundle mount).
 * - Registry YAML = WHAT scopes exist + which is active (runtime-mutable).
 * - Scope = pure namespace; the id carries no semantics beyond being a key.
 * - Active scope is a per-process singleton; switching emits an event so
 *   consumers (SemanticLayerService, audit, query engine) can react.
 *
 * @module @deepseek-ai/dsh-scope-registry
 */
import { existsSync, readFileSync } from 'node:fs';
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { writeFileAtomic, withFileLock } from '@deepseek-ai/dsh-atomic-write';
import * as yaml from 'js-yaml';
// ── Service ─────────────────────────────────────────────────────────────────
/**
 * Scope registry Cordis service. Reads and writes a YAML file at `registryPath`
 * containing scope definitions and the active scope id. All mutations are
 * atomic (cross-process safe via file lock + atomic write).
 */
export class ScopeRegistryService extends Service {
    static Config = z.object({
        registryPath: z.string().default(''),
    });
    registryPath;
    cache;
    constructor(ctx, config) {
        super(ctx, 'scopes');
        this.registryPath = config.registryPath;
    }
    // ── Read API ────────────────────────────────────────────────────────────
    /** All registered scopes. Returns empty array when registryPath is unset or file missing. */
    list() {
        return [...this.load().scopes.values()];
    }
    /** Get a scope by id. Returns undefined when not found. */
    get(id) {
        return this.load().scopes.get(id);
    }
    /** The currently active scope definition, or undefined if none is active. */
    active() {
        const { scopes, activeId } = this.load();
        if (activeId === undefined)
            return undefined;
        return scopes.get(activeId);
    }
    /** The currently active scope id, or undefined if none is active. */
    activeId() {
        return this.load().activeId;
    }
    // ── Write API ───────────────────────────────────────────────────────────
    /** Set the active scope by id. Throws if the scope does not exist in the registry. */
    async setActive(id) {
        this.ensureConfigured();
        await this.mutate(reg => {
            if (!reg.scopes.has(id)) {
                throw new Error(`scope "${id}" not found in registry`);
            }
            reg.activeId = id;
        });
        this.ctx.emit('scopes/active-changed', id);
    }
    /** Clear the active scope (no scope is active). */
    async clearActive() {
        this.ensureConfigured();
        await this.mutate(reg => { reg.activeId = undefined; });
        this.ctx.emit('scopes/active-changed', undefined);
    }
    /** Register (or update) a scope definition. If this is the first scope, it becomes active. */
    async register(scope) {
        this.ensureConfigured();
        let becameActive = false;
        await this.mutate(reg => {
            reg.scopes.set(scope.id, scope);
            if (reg.activeId === undefined) {
                reg.activeId = scope.id;
                becameActive = true;
            }
        });
        this.ctx.emit('scopes/changed');
        if (becameActive)
            this.ctx.emit('scopes/active-changed', scope.id);
    }
    /** Remove a scope from the registry. If it was active, active becomes undefined. */
    async remove(id) {
        this.ensureConfigured();
        let deactivated = false;
        await this.mutate(reg => {
            reg.scopes.delete(id);
            if (reg.activeId === id) {
                reg.activeId = undefined;
                deactivated = true;
            }
        });
        this.ctx.emit('scopes/changed');
        if (deactivated)
            this.ctx.emit('scopes/active-changed', undefined);
    }
    // ── Internals ───────────────────────────────────────────────────────────
    ensureConfigured() {
        if (!this.registryPath) {
            throw new Error('ctx.scopes: registryPath not configured (set it in the bundle patch config)');
        }
    }
    /** Load (or return cached) registry from disk. Returns empty state when inert. */
    load() {
        if (this.cache)
            return this.cache;
        if (!this.registryPath) {
            this.cache = { scopes: new Map(), activeId: undefined };
            return this.cache;
        }
        this.cache = this.readFile();
        return this.cache;
    }
    /** Read the registry YAML from disk. Missing file = empty registry. */
    readFile() {
        if (!existsSync(this.registryPath)) {
            return { scopes: new Map(), activeId: undefined };
        }
        const raw = readFileSync(this.registryPath, 'utf-8');
        const parsed = yaml.load(raw);
        if (!parsed || typeof parsed !== 'object') {
            return { scopes: new Map(), activeId: undefined };
        }
        const scopes = new Map();
        if (parsed.scopes) {
            for (const [id, def] of Object.entries(parsed.scopes)) {
                if (def && typeof def.semanticRoot === 'string') {
                    scopes.set(id, { id, semanticRoot: def.semanticRoot, metadata: def.metadata });
                }
            }
        }
        const activeId = typeof parsed.active === 'string' && scopes.has(parsed.active)
            ? parsed.active
            : undefined;
        return { scopes, activeId };
    }
    /** Atomic read-modify-write cycle with cross-process file lock. Invalidates cache. */
    async mutate(fn) {
        await withFileLock(this.registryPath, async () => {
            const reg = this.readFile();
            fn(reg);
            const fileContent = this.serialize(reg);
            await writeFileAtomic(this.registryPath, fileContent, {
                mode: 0o644,
                dirMode: 0o755,
            });
            this.cache = reg;
        });
    }
    /** Serialize registry state to YAML. */
    serialize(reg) {
        const obj = {
            ...(reg.activeId !== undefined ? { active: reg.activeId } : {}),
            scopes: {},
        };
        for (const [id, def] of reg.scopes) {
            obj.scopes[id] = {
                semanticRoot: def.semanticRoot,
                ...(def.metadata !== undefined ? { metadata: { ...def.metadata } } : {}),
            };
        }
        return yaml.dump(obj, { sortKeys: true, lineWidth: 120 });
    }
    /** Invalidate the in-memory cache so the next read re-reads from disk. */
    invalidateCache() {
        this.cache = undefined;
    }
}
export default ScopeRegistryService;
//# sourceMappingURL=index.js.map