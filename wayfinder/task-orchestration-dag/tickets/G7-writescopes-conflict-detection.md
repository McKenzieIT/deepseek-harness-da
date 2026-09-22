# G7 — writeScopes conflict semantics

**Type**: grilling
**Status**: open
**Blocked by**: [G19 Cordis outer-loop driver](G19-cordis-outer-loop-driver.md)
**Blocks**: —

## Question

What guarantee does `writeScopes` provide to the scheduler: advisory warning, admission rule for known executors, or separate filesystem enforcement?

Define normalization, overlap, unknown scopes, concurrent Attempts, current-Agent versus delegated execution, and UI wording. Do not imply protection against uninstrumented writers unless a real enforcement provider owns that path.
