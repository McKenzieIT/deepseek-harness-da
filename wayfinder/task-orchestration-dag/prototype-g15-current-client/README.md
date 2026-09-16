# PROTOTYPE — G15 current Task DAG client placement

English | [中文](README.zh.md)

> Throwaway interaction prototype for [G15 Current client placement for task orchestration](../tickets/G15-current-client-placement.md).
>
> Question: does the current DSH composition provide enough always-visible status, normal inspection space, and large-graph inspection without adding a new layout system?

This prototype applies the findings in [G15 existing Task DAG UI prior art](../research/G15-existing-task-dag-ui-prior-art.md). It tests one architecture because the current public DSH surfaces make it the only non-dominated placement:

- `conversation.input.dock` — compact current-state summary above the composer;
- `sidebar.right.pane.tab` — one stable Task DAG tab per Session;
- right-Sidebar fullscreen — the same tab enlarged for inspection.

The graph body is intentionally renderer-neutral HTML and SVG. [R5 G6 renderer adapter stability](../tickets/R5-g6-renderer-adapter-stability.md) owns the renderer decision.

## Run

```sh
node wayfinder/task-orchestration-dag/prototype-g15-current-client/server.mjs
# http://localhost:4315/
```

The page has no network dependency and no build step.

## Scenarios and controls

- **GMV 下跌归因** demonstrates a natural-language analytics run with verified inputs, one retried Attempt, ready work, blocked work, evidence, and a current Stop record.
- **每日宽表构建** demonstrates a data-engineering run held on unavailable upstream credentials.
- Click the composer summary to open or focus the Task DAG tab.
- Click a Task to inspect its current Attempts, primary Binding, Outputs, Evidence, verification, and Holds without turning those records into peer Task nodes.
- Use the right-Sidebar fullscreen control for the large inspection view. The prototype also accepts `Escape` to evaluate that interaction; production keyboard ownership remains with the right-Sidebar subsystem.
- Switch Sessions to verify that panel and selection state do not leak.
- **模拟 Client 重载** discards presentation state, shows the Task DAG Remote as unavailable, and then reloads the authoritative snapshot. The recovered domain state remains intact while the right Sidebar returns collapsed.
- **窄屏模拟** demonstrates the right Sidebar's automatic fullscreen presentation when a normal right column cannot preserve the center width.
- **推进 watch** applies one current-state update to demonstrate that the summary and open tab consume the same watched value.

## Scope

The prototype covers current Tasks, Attempts, Host Bindings, Outputs, Evidence, verification, Holds, portable budgets, and the latest RunStopRecord. It does not prototype history navigation, a trace explorer, split panes, floating tabs, Task editing, advanced graph simplification, or animation semantics.

## Captures

- [Desktop conversation plus normal right-Sidebar tab](shots/desktop.png)
- [Right-Sidebar fullscreen inspection](shots/fullscreen.png)
- [Narrow data-engineering Hold inspection](shots/narrow-hold.png)

## Verification

Verified on 2026-09-16 with Chromium at 1440×900:

- the compact summary opens the existing Task DAG tab identity;
- fullscreen expands the same tab, and the prototype `Escape` interaction returns to the docked view;
- switching from the GMV analysis Session to the daily-wide-table Session does not reuse graph selection or panel state;
- the data-engineering view exposes the `HostUnavailable Hold`, cancelled Attempt, primary Binding, and lack of Output separately;
- narrow mode automatically uses fullscreen;
- simulated Client reload collapses presentation state, reports Remote unavailability, and restores the durable snapshot without reconstructing Task state from the transcript;
- no page or console errors were observed.
