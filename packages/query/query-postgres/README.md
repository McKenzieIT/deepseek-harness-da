# @deepseek-ai/dsh-query-postgres

Postgres query-engine provider (ctx.query): GA-GT2-D4 second-engine stub proving the engine-neutral abstraction — getConventions loads a Postgres dialect; execute/attach/cancel/getProgress throw not-implemented (seam proof, not a real PG executor)

## Known Limitations and Deferred Work

- Stub only — `getConventions` loads a Postgres dialect, but `execute`/`attach`/`cancel`/`getProgress` throw not-implemented.
- This is a seam proof for the engine-neutral abstraction, not a real Postgres executor.
