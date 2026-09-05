# R2: 2 unmerged August branches — PR or keep

Branch: (none yet — decision)

## Question

④ kept 2 unmerged branches (each has 1 unique commit not in master). Open PRs or keep?

## Context

- **fix/da-compliance-audit**: 12 commits (11 superseded — subjects in master; 1 UNIQUE `6d62764bda fix(bundle): revert web-app dashscope insert forbidden by rule 4.3`, not in master).
- **fix/legacy-empty-callid**: 1 UNIQUE `ac0251360a fix: tolerate legacy empty callId in persisted sessions` (small: 3 files, 15/9). Not in master.

## Options

- PR the unique commits (separate effort; review if still relevant — the dashscope revert + callId tolerance).
- Keep the branches (defer).
- Abandon — NOT recommended (both have unique work; abandoning loses it; ④ explicitly did not abandon).
