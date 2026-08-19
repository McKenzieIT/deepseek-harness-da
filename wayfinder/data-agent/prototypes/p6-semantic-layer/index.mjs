// PROTOTYPE (throwaway) — P6 semantic-layer substrate · BasicIndex (dep-free lookup accelerator).
// Mirrors reverse-bi/libs/rbi-semantic/src/rbi_semantic/index.py:BasicIndex.
// "lookup accelerator, NOT a validation cache" — stores raw YAML dicts + paths, NEVER model_validates at build.
// Wires ADR-0011 cache invalidation: a write sets _dirty; next lookup rebuilds from disk.

import { join } from 'node:path'
import { loadEvents, loadTables, loadDomains, registerInvalidationHook } from './io.mjs'

export class BasicIndex {
  constructor(semanticLayer) {
    this.semanticLayer = semanticLayer
    this._dirty = true
    this._events = new Map()     // name -> {path, raw, domain}
    this._tables = new Map()    // table_name -> {path, raw}
    this._domains = {}
    // ADR-0011: register this index's invalidation hook so writes trigger a rebuild.
    registerInvalidationHook(() => { this._dirty = true })
  }
  _build() {
    this._events = new Map()
    this._tables = new Map()
    for (const e of loadEvents(this.semanticLayer)) this._events.set(e.name, { path: e.path, raw: e.raw, domain: e.domain })
    for (const t of loadTables(this.semanticLayer)) this._tables.set(t.raw.table_name, { path: t.path, raw: t.raw })
    this._domains = loadDomains(this.semanticLayer)
    this._dirty = false
  }
  _ensure() { if (this._dirty) this._build() }
  lookupEvent(name) { this._ensure(); return this._events.get(name) || null }
  lookupTable(name) { this._ensure(); return this._tables.get(name) || null }
  eventCount() { this._ensure(); return this._events.size }
  tableCount() { this._ensure(); return this._tables.size }
  tableCountByKind(kind) { this._ensure(); return [...this._tables.values()].filter(t => (t.raw.kind || 'dws') === kind).length }
  events() { this._ensure(); return [...this._events.entries()].map(([name, v]) => ({ name, ...v })) }
  tableEntries() { this._ensure(); return [...this._tables.values()] }
  domainsCatalog() { this._ensure(); return this._domains }
}
