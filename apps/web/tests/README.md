# apps/web browser e2e

English | [中文](README.zh.md)

These tests boot the real web composition in-process and drive it with a real Chromium over real HTTP. The lane's mechanics — modes, fixtures, goldens, and the deliberate composition divergences from `dsh web` — are documented in [`scaffold.ts`](scaffold.ts) and the [browser e2e Agent Note](../../../.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.md).

## Completion observations

State-sensitive cases use Workspace, admission, attachment, and model-stream barriers to separate visible intermediate states from completed operations. Details close waits for frame transitions; archive verification assigns an explicit title to the seeded Session and follows that identity across reload. See the [CI fixture synchronization decision](../../../.agents/notes/implemented/testing/2026-09-08-ci-completion-observations.md).

## These are Host-face tests

They type-check in the root `tsconfig.host.json`, not in the Client aggregate, because they read Host services directly: `ctx.connection`, the Host `SessionStore`, and `ctx.sessionProjectionCache`. Driving a browser at runtime does not make a file part of the Client program — the two faces merge Cordis `Context` under the same keys with different services, so one program cannot see both. Moving these files into the Client aggregate makes every Host-service access fail to compile.

## Do not import `@deepseek-ai/dsh-client-*` here

Importing a Client package — a value or a type — pulls its whole TypeScript project, and every project it references, into the **Host build graph**. That has bitten this lane once already: four Client consumer packages reference `api/remotes`' Client face, which cannot compile until Host tsdown has generated `@deepseek-ai/dsh-goal/remote`, so the Host build phase ended up waiting on an artifact it produces itself.

When a scenario needs a Client-owned constant or pure function, mirror it here instead, next to the commented-out import that names the source module. A drift then surfaces as a missed selector or a stale mirrored value — a loud failure, never a silent pass. `scaffold.ts` follows this rule for the welcome-notice namespace, acknowledgement field, version, and asserted Chinese copy.

The built-client harness is the exception. `assembled-boot.ts` imports `AppWebEntry`, the boot-manifest type, and `RemoteMock`; `assembled-remote.ts` imports the Client test runtime's default responses and `RemoteMock`. These packages are explicit project references for booting the real shell against a test-owned carrier. The chat scenarios mirror `conversationContextKey` in `support.ts` instead of importing its Client owner.

A Remote round trip is the other exception, and it does not import a Client face at all. `semantic-graph-remote.e2e.ts` answers a Client `ctx.remote` call from a real Host over the Connection Fetch carrier, so it needs both halves in one process. It loads the Client faces and the generated codecs through **runtime** specifiers the compiler cannot follow, and mirrors their types locally. Runtime resolution still uses the same tsconfig paths, so both halves share one Cordis copy while the Host build graph stays clear of the Client project.

Nothing mechanically enforces this rule; keep it in review.
