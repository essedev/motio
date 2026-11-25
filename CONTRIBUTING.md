# Contributing

Read `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md` and `docs/DECISIONS.md` first. Remotion's behaviour is taken from remotion.dev/docs and from the oracle recordings only: never read Remotion's source, its type declarations or its source maps (D-067).

```bash
pnpm install
make check              # format, lint, build, site build, tests; green before every commit to packages/
make test-integration   # real Chrome and FFmpeg
```

## Releases

Every public package (every folder of `packages/` whose `package.json` is not private) is published with the same version. Releases are published by GitHub Actions through npm's trusted publishing: there is no npm token in the repository, and npm attaches provenance to every package.

1. `node tools/release/version.ts 0.2.0` sets the version of every public package and the `VERSION` that `@motiojs/core` reports. Commit it.
2. `make check` is green.
3. `git tag v0.2.0 && git push origin main v0.2.0`. The `release` workflow (`.github/workflows/release.yml`) lints, builds and runs the unit tests, then `tools/release/publish.ts` packs every package with `pnpm pack`, checks each tarball (version, no `workspace:` or `link:` range left, LICENSE and NOTICE inside) and publishes it with `npm publish`, dependencies first.
4. If the run fails halfway, fix the cause and run it again (re-run the job, or Actions > release > Run workflow on the tag with dry run off): versions already on npm are skipped.

A dry run packs and checks everything and runs `npm publish --dry-run`: Actions > release > Run workflow (dry run is the default), or `node tools/release/publish.ts --dry-run` locally. A prerelease version (`0.2.0-rc.1`) is published under the `next` dist-tag, never `latest`.

### The first publish

npm accepts a trusted publisher only for a package that already exists, so the first version is published once from a machine. Before it, the pinned FFmpeg release is published and its manifest committed (D-065: the `ffmpeg-build` workflow, the GitHub release, `tools/ffmpeg-build/update-manifest.mjs` on its archives, `RELEASE_PUBLISHED` set to true), so `@motiojs/ffmpeg` works from its first version; `publish.ts` refuses to publish it before that.

1. Clone the commit to release into a new folder (so no stale `dist/` is packed) and run `pnpm install --frozen-lockfile`.
2. Create a short-lived granular npm token that can publish to the `@motiojs` scope and `create-motio`. Put it in the environment without writing it to the shell history: `read -rs NPM_TOKEN && export NPM_TOKEN`.
3. `node tools/release/publish.ts --expect-version 0.1.0`. The token is read from `NPM_TOKEN` only: npm gets it through a `${NPM_TOKEN}` reference in a temporary npmrc, so it is never written to disk or printed. Then `unset NPM_TOKEN` and revoke the token on npmjs.com.
4. With npm 11.15.0 or later, `npm login`, then `node tools/release/trust.ts`: it makes `release.yml` of `essedev/motio` the trusted publisher of every package (`npm trust github`; npm asks for two-factor authentication). A package added later needs the same: publish it once by hand, then run the script again (it skips the packages already set up).
5. Push the tag `v0.1.0`: the workflow finds every package on npm and skips them all.
