#!/usr/bin/env python3
"""Audit independent metric yaml vs embedded table metrics block consistency."""
import os, sys, json, collections
import yaml

ROOT = "/Users/mckenzie/workspace/deepseek-harness-da/examples/k11-semantic-layer"
MDIR = os.path.join(ROOT, "metrics")
TDIR = os.path.join(ROOT, "tables")


def load_yaml(path):
    try:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:
        return {"__error__": str(e)}


def main():
    metric_files = sorted(f for f in os.listdir(MDIR) if f.endswith(".yaml"))
    table_files = set(f for f in os.listdir(TDIR) if f.endswith(".yaml"))

    # Preload all tables (321 is small)
    tables = {}
    for tf in table_files:
        tables[tf[:-5]] = load_yaml(os.path.join(TDIR, tf))

    # counters
    total = 0
    parse_err = 0
    src_table_missing = 0
    src_table_missing_samples = []

    sql_match = 0
    sql_mismatch = 0
    sql_mismatch_samples = []

    desc_match = 0
    desc_mismatch = 0
    desc_mismatch_samples = []  # (metric_name, yaml_desc, table_desc)

    domains_match = 0
    domains_mismatch = 0
    domains_mismatch_samples = []

    # name parse cross-check
    name_source_agree = 0
    name_source_disagree = 0
    name_disagree_samples = []

    # field census (all keys ever seen in metric yaml, including nested)
    top_key_census = collections.Counter()
    comp_key_census = collections.Counter()
    meta_key_census = collections.Counter()
    relation_key_census = collections.Counter()
    # extra fields = anything beyond the standard derivable set
    STD_TOP = {"kind", "name", "description", "domains", "computation", "relations"}
    STD_COMP = {"sql", "metadata"}
    STD_META = {"aggregation", "field", "source", "time_grain"}
    extra_top = collections.Counter()
    extra_comp = collections.Counter()
    extra_meta = collections.Counter()

    # relations analysis
    rel_type_census = collections.Counter()
    rel_target_is_source = 0
    rel_target_not_source = 0
    rel_cross_samples = []
    rel_non_derived_samples = []
    rel_field_census = collections.Counter()

    # time_grain / caliber / custom
    time_grain_nonempty = 0
    time_grain_samples = []
    caliber_present = 0
    caliber_samples = []
    custom_present = 0
    custom_samples = []

    # metric_key / table lookup stats
    metric_key_not_in_table = 0
    metric_key_not_in_table_samples = []

    # table metrics block field census (what's in table block beyond expression/description)
    table_metric_block_keys = collections.Counter()

    for mf in metric_files:
        total += 1
        name_key = mf[:-5]
        m = load_yaml(os.path.join(MDIR, mf))
        if not isinstance(m, dict):
            parse_err += 1
            continue
        if "__error__" in m:
            parse_err += 1
            continue

        # census top-level keys
        for k in m.keys():
            top_key_census[k] += 1
            if k not in STD_TOP:
                extra_top[k] += 1
        comp = m.get("computation")
        if isinstance(comp, dict):
            for k in comp.keys():
                comp_key_census[k] += 1
                if k not in STD_COMP:
                    extra_comp[k] += 1
            meta = comp.get("metadata")
            if isinstance(meta, dict):
                for k in meta.keys():
                    meta_key_census[k] += 1
                    if k not in STD_META:
                        extra_meta[k] += 1
                # time_grain
                tg = meta.get("time_grain", "")
                if tg:
                    time_grain_nonempty += 1
                    if len(time_grain_samples) < 10:
                        time_grain_samples.append((name_key, tg))
            # caliber/custom if present at comp level
            if "caliber_variants" in comp:
                caliber_present += 1
                if len(caliber_samples) < 10:
                    caliber_samples.append((name_key, comp["caliber_variants"]))
            if "custom" in comp:
                custom_present += 1
                if len(custom_samples) < 10:
                    custom_samples.append((name_key, comp["custom"]))
        # caliber/custom at top level too
        if "caliber_variants" in m:
            caliber_present += 1
            if len(caliber_samples) < 10:
                caliber_samples.append((name_key, m["caliber_variants"]))
        if "custom" in m:
            custom_present += 1
            if len(custom_samples) < 10:
                custom_samples.append((name_key, m["custom"]))

        # relations analysis
        rels = m.get("relations") or []
        source_table = ""
        if isinstance(comp, dict) and isinstance(comp.get("metadata"), dict):
            source_table = comp["metadata"].get("source", "") or ""
        for r in rels:
            if not isinstance(r, dict):
                continue
            for k in r.keys():
                relation_key_census[k] += 1
            rtype = r.get("type", "")
            rtarget = r.get("target", "")
            rel_type_census[rtype] += 1
            if rtarget and source_table and rtarget == source_table:
                rel_target_is_source += 1
            elif rtarget:
                rel_target_not_source += 1
                if len(rel_cross_samples) < 20:
                    rel_cross_samples.append((name_key, rtype, rtarget, source_table))
            if rtype and rtype != "derived_from":
                if len(rel_non_derived_samples) < 20:
                    rel_non_derived_samples.append((name_key, rtype, rtarget, source_table))

        # name vs source agreement
        if source_table:
            if name_key.startswith(source_table + "__"):
                name_source_agree += 1
                metric_key = name_key[len(source_table) + 2:]
            else:
                name_source_disagree += 1
                if len(name_disagree_samples) < 20:
                    name_disagree_samples.append((name_key, source_table))
                # fall back: try to find source table file that is a prefix
                metric_key = None
                for tname in tables:
                    if name_key.startswith(tname + "__"):
                        metric_key = name_key[len(tname) + 2:]
                        break
            # locate table file
            tfile = source_table
            if tfile not in tables:
                src_table_missing += 1
                if len(src_table_missing_samples) < 20:
                    src_table_missing_samples.append((name_key, source_table))
                continue
            t = tables[tfile]
            if not isinstance(t, dict):
                continue
            tmetrics = t.get("metrics") or {}
            if not isinstance(tmetrics, dict) or metric_key not in tmetrics:
                metric_key_not_in_table += 1
                if len(metric_key_not_in_table_samples) < 20:
                    metric_key_not_in_table_samples.append((name_key, source_table, metric_key))
                continue
            block = tmetrics[metric_key]
            if not isinstance(block, dict):
                continue
            for k in block.keys():
                table_metric_block_keys[k] += 1

            # ---- compare sql vs expression ----
            m_sql = comp.get("sql", "") if isinstance(comp, dict) else ""
            t_expr = block.get("expression", "")
            if str(m_sql).strip() == str(t_expr).strip():
                sql_match += 1
            else:
                sql_mismatch += 1
                if len(sql_mismatch_samples) < 20:
                    sql_mismatch_samples.append((name_key, repr(m_sql), repr(t_expr)))

            # ---- compare description ----
            m_desc = m.get("description", "") or ""
            t_desc = block.get("description", "") or ""
            if str(m_desc).strip() == str(t_desc).strip():
                desc_match += 1
            else:
                desc_mismatch += 1
                if len(desc_mismatch_samples) < 10:
                    desc_mismatch_samples.append((name_key, m_desc, t_desc))

            # ---- compare domains (metric yaml domains vs table top-level domains) ----
            m_dom = m.get("domains") or []
            t_dom = t.get("domains") or []
            if [str(x).strip() for x in m_dom] == [str(x).strip() for x in t_dom]:
                domains_match += 1
            else:
                domains_mismatch += 1
                if len(domains_mismatch_samples) < 20:
                    domains_mismatch_samples.append((name_key, m_dom, t_dom))

    print("=" * 60)
    print("METRIC VS TABLE CONSISTENCY AUDIT")
    print("=" * 60)
    print(f"total metric files      : {total}")
    print(f"parse errors            : {parse_err}")
    print(f"name/source agree       : {name_source_agree}")
    print(f"name/source disagree    : {name_source_disagree}")
    print(f"  samples: {name_disagree_samples[:5]}")
    print(f"source table missing    : {src_table_missing}")
    print(f"  samples: {src_table_missing_samples[:5]}")
    print(f"metric_key not in table : {metric_key_not_in_table}")
    print(f"  samples: {metric_key_not_in_table_samples[:5]}")
    print()
    print("--- 1. DESCRIPTION / SQL / DOMAINS CONSISTENCY ---")
    cmp_total = sql_match + sql_mismatch
    print(f"sql vs expression       : match={sql_match} mismatch={sql_mismatch} (of {cmp_total} comparable)")
    if cmp_total:
        print(f"  sql match rate       : {sql_match/cmp_total*100:.2f}%")
    print(f"description match       : {desc_match} mismatch={desc_mismatch}")
    if cmp_total:
        print(f"  desc match rate      : {desc_match/cmp_total*100:.2f}%")
    print(f"  desc mismatch samples (first 10):")
    for nm, md, td in desc_mismatch_samples:
        print(f"    - {nm}")
        print(f"        metric yaml : {md!r}")
        print(f"        table block : {td!r}")
    print(f"domains match          : {domains_match} mismatch={domains_mismatch}")
    if cmp_total:
        print(f"  domains match rate  : {domains_match/cmp_total*100:.2f}%")
    print(f"  domains mismatch samples (first 10):")
    for nm, md, td in domains_mismatch_samples[:10]:
        print(f"    - {nm}: metric={md} table={td}")
    print()
    print("--- 2. UNIQUE FIELDS CHECK ---")
    print(f"top-level key census    : {dict(top_key_census.most_common())}")
    print(f"computation key census  : {dict(comp_key_census.most_common())}")
    print(f"metadata key census     : {dict(meta_key_census.most_common())}")
    print(f"EXTRA top-level keys    : {dict(extra_top.most_common()) or 'NONE'}")
    print(f"EXTRA computation keys   : {dict(extra_comp.most_common()) or 'NONE'}")
    print(f"EXTRA metadata keys     : {dict(extra_meta.most_common()) or 'NONE'}")
    print(f"caliber_variants present: {caliber_present}")
    print(f"  samples: {caliber_samples[:5]}")
    print(f"custom present          : {custom_present}")
    print(f"  samples: {custom_samples[:5]}")
    print(f"time_grain nonempty     : {time_grain_nonempty}")
    print(f"  samples: {time_grain_samples[:10]}")
    print(f"table metrics block keys: {dict(table_metric_block_keys.most_common())}")
    print()
    print("--- 3. RELATIONS CHECK ---")
    print(f"relation type census    : {dict(rel_type_census.most_common())}")
    print(f"relation field census   : {dict(relation_key_census.most_common())}")
    print(f"relation target == source: {rel_target_is_source}")
    print(f"relation target != source: {rel_target_not_source}")
    print(f"  cross-target samples (first 20):")
    for nm, rt, tgt, src in rel_cross_samples:
        print(f"    - {nm}: type={rt} target={tgt} source={src}")
    print(f"  non-derived_from relation samples (first 20):")
    for nm, rt, tgt, src in rel_non_derived_samples:
        print(f"    - {nm}: type={rt} target={tgt} source={src}")


if __name__ == "__main__":
    main()
