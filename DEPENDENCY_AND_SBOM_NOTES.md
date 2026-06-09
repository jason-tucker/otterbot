# Otterbot — Dependency & Supply-Chain Notes

No SBOM/SCA tooling (`syft`, `trivy`, `osv-scanner`, `grype`, `semgrep`, `gitleaks`)
is installed in the review environment, so this is a manual inventory plus
`pnpm audit`. Lockfile: `pnpm-lock.yaml` v9 (319 entries), all resolved from the
default npm registry — no git/tarball/alternate-registry sources, no `.npmrc`.

## Direct dependencies

| Package | Spec | Resolved | Notes |
|---|---|---|---|
| discord.js | ^14.26.3 | 14.26.x | legit |
| dotenv | ^17.4.2 | 17.4.2 | legit |
| drizzle-orm | ^0.45.2 | 0.45.2 | legit |
| ioredis | ^5.10.1 | 5.10.1 | legit |
| postgres | ^3.4.9 | 3.4.9 | legit |
| zod | ^4.4.1 | 4.4.x | legit |

### Dev dependencies (not in the runtime image except drizzle-kit)

`@types/node`, `@vitest/coverage-v8` (**bumped → ^3.2.6**), `drizzle-kit ^0.31.10`,
`eslint ^10.2.1`, `prettier ^3.8.3`, `tsx ^4.21.0`, `typescript ^6.0.3`,
`vitest` (**bumped → ^3.2.6**).

## Audit results

`pnpm audit --prod`: **no known vulnerabilities** in the production runtime.

`pnpm audit` (incl. dev), at review start — two dev-only transitive advisories:

| Advisory | Pkg | Severity | Path | Reaches running bot? | Action |
|---|---|---|---|---|---|
| GHSA-5xrq-8626-4rwp | vitest `<3.2.6` | Critical (advisory) | dev test runner | No | **Fixed** — bumped to `^3.2.6` (`17d2c63`) |
| GHSA-67mh-4wv8-2f99 | esbuild `<=0.24.2` | Moderate | `drizzle-kit > @esbuild-kit > esbuild` | Present in image (drizzle-kit), but the CVE affects esbuild's *dev server*, never invoked by `drizzle-kit push` | **Deferred** to Dependabot — a forced esbuild major bump risks the startup `push` path; CVE is dev-server-only |

Both advisories require a local attacker on the dev machine (Vitest UI / esbuild
dev-server); neither is reachable in the deployed bot.

## Supply-chain posture

- **No `preinstall`/`postinstall`/`install`/`prepare` lifecycle scripts** in `package.json` or the lockfile. pnpm 10 additionally blocks dependency build scripts by default (the `esbuild` build script was ignored on install — confirmed).
- **No typosquat-looking packages.**
- Versions are caret-ranged in `package.json` but pinned in the lockfile; `--frozen-lockfile` is used in CI and the Docker build.
- Dependabot is configured (`.github/dependabot.yml`: weekly npm + docker + github-actions) — it will continue to PR the deferred esbuild bump and the GitHub Action SHA bumps.

## Added scanning

`.github/workflows/security-scan.yml` (new, `3055ccc`) adds **gitleaks** (full-history
secret scan) and **`dependency-review`** on PRs (`fail-on-severity: high`). Combined
with Dependabot this covers secret-introduction, new-dependency vulnerabilities, and
routine version drift. Recommend also enabling GitHub's native Dependabot alerts +
secret scanning in repo settings (see "Remaining manual actions" in the final report).

## Recommended (not blocking)

- Add `trivy image` (SARIF upload) to the build job and consider `cosign` signing /
  build provenance via `docker/build-push-action`'s `provenance:`/`sbom:` options.
- Pin the `node:24-alpine` base image by digest (Dependabot docker updates help).
