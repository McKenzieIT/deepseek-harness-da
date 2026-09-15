# Agent Note: Source-plane exports stay outside release payloads

Status: implemented

English | [中文](2026-09-15-source-plane-exports-and-publint.zh.md)

## Problem

Workspace source launches and Cordis configuration rows resolve `@deepseek-ai/dsh-*/src/*` directly, while DSH release tarballs intentionally publish built `lib/` artifacts without TypeScript sources. Publint therefore reports unmatched source export globs even when the artifact exports are complete. Separately, a bundled entry can import a generated sibling chunk omitted by an exact `files` list, which creates a genuinely broken release artifact.

## Decision

The repository keeps `./src/*` exports for source-plane execution and treats publint's unmatched-glob message as informational because the source tree is not part of the release payload. The publint runner still fails for missing artifact exports and for JavaScript or CSS imports outside the manifest-declared publication view.

Packages with exact artifact lists must emit self-contained entry files. `tool-edit-definition` and `tool-revert-edit` disable code splitting, and their semantic-layer imports use the package root. The semantic-layer root exports the operations those tools load dynamically.

Published declarations use package-root or published artifact subpath imports. The NodeNext consumer check rejects a declaration that references `@deepseek-ai/dsh-*/src/*.ts`; source-plane paths remain valid only inside workspace execution.

## Alternatives considered

- Publish every package's `src/` tree: rejected because DSH release payloads are artifact-only and the release verifier excludes source.
- Remove `./src/*`: rejected because supported source launches and configuration rows resolve source subpaths in a workspace checkout.
- Publish generated hash chunks: rejected because their names are unstable and exact package manifests would need generated edits after every build.
- Ignore every publint warning or error: rejected because missing built exports and missing relative-import targets are release defects.

## Consequences

Source-plane imports remain available in repository execution but are not an installed-package API. Publint may print the known unmatched source-glob diagnostic without failing. Exact artifact manifests remain deterministic, and the publication-closure check rejects any new unlisted split chunk. External TypeScript consumers resolve one built package identity instead of loading workspace sources through public declarations.