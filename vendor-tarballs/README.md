# vendor-tarballs

English | [中文](README.zh.md)

Checked-in npm package tarballs that dsh installs as ordinary (non-workspace)
dependencies.

## `semantic-grounding-substrate-0.1.6-alpha.2.tgz`

The host-neutral semantic-grounding substrate, published as
`@semantic-grounding/substrate`. It was extracted out of
`packages/data/semantic-layer/` into its own repository
(`McKenzieIT/semantic-grounding`); what remains at that path in this repo is a
thin cordis adapter that re-exports the substrate behind the `ctx.schema` seam.

The file is produced by `npm pack` in the semantic-grounding repo — it is the
exact publishable artifact (`lib/index.js`, `lib/index.d.ts`, `package.json`),
not a source checkout.

### Why it is vendored

- dsh consumes the substrate as a **non-workspace install**. It is not a
  `packages/*` member and it is not a `vendor/*` workspace link, so pnpm needs a
  concrete artifact to resolve.
- There is **no registry publication** for it. The substrate is not on npm (and
  the alpha line is not intended to be), so a version range against a registry
  cannot resolve. Committing the tarball keeps installs hermetic and reproducible
  for CI and for every developer, with no extra credentials or network source.
- Typechecking goes through the tarball's own `exports["."]` barrel, so dsh is
  always compiled against the real published surface rather than against
  in-repo sources.

### How it is wired up

`pnpm-workspace.yaml` carries the override that pins every consumer to this
file:

```yaml
overrides:
  '@semantic-grounding/substrate': 'file:./vendor-tarballs/semantic-grounding-substrate-0.1.6-alpha.2.tgz'
```

Individual packages declare the semver range `^0.1.6-alpha.2` (a `file:`
specifier is not a legal `peerDependencies` range, which is why the path lives
in the override). The override is what guarantees a single resolved copy — the
substrate holds module-level singletons, so sharing one instance is a
correctness requirement, not just a size optimization.

### Updating

1. `npm pack` in the semantic-grounding repo.
2. Drop the new `.tgz` here and delete the superseded one.
3. Update the `file:` path in the `overrides` block of `pnpm-workspace.yaml`
   and the `^<version>` ranges in the consuming `package.json` files.
4. `pnpm install`, then confirm `ls node_modules/.pnpm | grep semantic-grounding`
   still reports exactly one entry.
