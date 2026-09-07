# @deepseek-ai/dsh-admin

Admin + access isolation: per-user login, identity, scope resolution, PAT self-service, fail-closed authz

## Known Limitations and Deferred Work

- The user store is in-memory with no persistence seam wired here.
- PAT management is self-service only; there is no admin-issued token flow.
- Authz is fail-closed — a missing rule denies, not allows.
