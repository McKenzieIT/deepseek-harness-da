#!/usr/bin/env python3
"""Audit event-sourced metric yamls vs embedded event metrics blocks."""
import os, collections, yaml, glob

ROOT = "/Users/mckenzie/workspace/deepseek-harness-da/examples/k11-semantic-layer"
MDIR = os.path.join(ROOT, "metrics")
EDIR = os.path.join(ROOT, "events")

def load_yaml(path):
    try:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        return {"__error__": str(e)}

def main():
    # build event name -> event yaml map
    event_by_name = {}
    event_files = glob.glob(os.path.join(EDIR, "**", "*.yaml"), recursive=True)
    for ef in event_files:
        d = load_yaml(ef)
        if isinstance(d, dict) and d.get("name"):
            event_by_name[d["name"]] = (ef, d)

    metric_files = sorted(f for f in os.listdir(MDIR) if f.endswith(".yaml"))

    total = 0
    dotted = 0
    event_found = 0
    event_missing = 0
    event_missing_samples = []
    metric_key_in_event = 0
    metric_key_not_in_event = 0
    mk_missing_samples = []

    sql_match = sql_mismatch = 0
    desc_match = desc_mismatch = 0
    desc_mismatch_samples = []
    domains_match = domains_mismatch = 0
    domains_mismatch_samples = []
    sql_mismatch_samples = []

    for mf in metric_files:
        total += 1
        name_key = mf[:-5]
        m = load_yaml(os.path.join(MDIR, mf))
        if not isinstance(m, dict) or "__error__" in m:
            continue
        comp = m.get("computation", {})
        meta = comp.get("metadata", {}) if isinstance(comp, dict) else {}
        src = meta.get("source", "")
        if "." not in src:
            continue  # table-sourced, handled by other script
        dotted += 1
        if src not in event_by_name:
            event_missing += 1
            if len(event_missing_samples) < 10:
                event_missing_samples.append((name_key, src))
            continue
        event_found += 1
        ef, ed = event_by_name[src]
        # metric_key = part after first '__'
        if "__" in name_key:
            metric_key = name_key.split("__", 1)[1]
        else:
            metric_key = name_key
        emetrics = ed.get("metrics") or {}
        if not isinstance(emetrics, dict) or metric_key not in emetrics:
            metric_key_not_in_event += 1
            if len(mk_missing_samples) < 10:
                mk_missing_samples.append((name_key, src, metric_key, list(emetrics.keys())[:5]))
            continue
        metric_key_in_event += 1
        block = emetrics[metric_key]
        if not isinstance(block, dict):
            continue
        # sql vs expression
        m_sql = comp.get("sql", "")
        t_expr = block.get("expression", "")
        if str(m_sql).strip() == str(t_expr).strip():
            sql_match += 1
        else:
            sql_mismatch += 1
            if len(sql_mismatch_samples) < 10:
                sql_mismatch_samples.append((name_key, repr(m_sql), repr(t_expr)))
        # desc
        m_desc = m.get("description", "") or ""
        t_desc = block.get("description", "") or ""
        if str(m_desc).strip() == str(t_desc).strip():
            desc_match += 1
        else:
            desc_mismatch += 1
            if len(desc_mismatch_samples) < 10:
                desc_mismatch_samples.append((name_key, m_desc, t_desc))
        # domains: metric yaml domains vs event yaml domains (list) + domain (scalar)
        m_dom = [str(x).strip() for x in (m.get("domains") or [])]
        e_dom_list = [str(x).strip() for x in (ed.get("domains") or [])]
        e_dom_scalar = str(ed.get("domain", "") or "").strip()
        if m_dom == e_dom_list:
            domains_match += 1
        elif e_dom_scalar and m_dom == [e_dom_scalar]:
            domains_match += 1
        else:
            domains_mismatch += 1
            if len(domains_mismatch_samples) < 10:
                domains_mismatch_samples.append((name_key, m_dom, e_dom_list, e_dom_scalar))

    print("=" * 60)
    print("EVENT-SOURCED METRIC CONSISTENCY AUDIT")
    print("=" * 60)
    print(f"total metric files      : {total}")
    print(f"dotted (event-style) src: {dotted}")
    print(f"event yaml found        : {event_found}")
    print(f"event yaml missing      : {event_missing}")
    print(f"  samples: {event_missing_samples[:5]}")
    print(f"metric_key found in event: {metric_key_in_event}")
    print(f"metric_key NOT in event : {metric_key_not_in_event}")
    print(f"  samples: {mk_missing_samples[:5]}")
    comp_total = sql_match + sql_mismatch
    print(f"sql vs expression match : {sql_match} mismatch={sql_mismatch} (of {comp_total})")
    if comp_total:
        print(f"  rate: {sql_match/comp_total*100:.2f}%")
    for nm, ms, ts in sql_mismatch_samples[:10]:
        print(f"    - {nm}: metric={ms} event={ts}")
    print(f"description match        : {desc_match} mismatch={desc_mismatch} (of {comp_total})")
    if comp_total:
        print(f"  rate: {desc_match/comp_total*100:.2f}%")
    for nm, md, td in desc_mismatch_samples[:10]:
        print(f"    - {nm}")
        print(f"        metric yaml: {md!r}")
        print(f"        event block: {td!r}")
    print(f"domains match           : {domains_match} mismatch={domains_mismatch}")
    for nm, md, el, es in domains_mismatch_samples[:10]:
        print(f"    - {nm}: metric={md} event_list={el} event_scalar={es}")

if __name__ == "__main__":
    main()
