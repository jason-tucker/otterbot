# Security Changelog

Security-relevant changes from the 2026-06-09 review, branch
`claude/clever-fermi-5nxy2j`. Mirrors the `### Security` / `### Reliability` /
`### CI / Infra` / `### Hardening` / `### Tests` entries in `CHANGELOG.md`.

## Fixed

| ID | Severity | Change | Commit |
|----|----------|--------|--------|
| OB-03 | High | Authorize the ticket character selector (self / McKenzie staff / ManageChannels) before revealing CSN/phone/bank on the public ticket message | `6667171` |
| OB-01 | Medium | Escape MKE-API character name (link-label) in the `/lookup` embed — closes phishing via Send-to-Channel; escape standing/risk reasons | `e07b1c6` |
| OB-02 | Low | Escape API names / code-span fields in `ticketCharacterEmbed` + `businessEmbed` | `e07b1c6` |
| OB-08 | Medium | `closeEventBus()` on graceful shutdown — stop leaking the Redis publisher socket | `239cd49` |
| OB-07 | Low | `AbortSignal.timeout` on the Kuma health push + `/report` GitHub POST; rate-limited failure log | `239cd49` |
| OB-04 | Low | Explicit `allowedMentions:{parse:[]}` on `oc.stock_post` | `f74eb72` |
| OB-05 | Low | Snowflake-validate + 5 min cooldown on the `report.submit` RPC verb | `f74eb72` |
| OB-06 | Low | Canonical `\d{17,20}` snowflake validation across RPC handlers | `f74eb72` |
| OB-09 | Low | Scope `/portal` role-mapping removal to its business | `b2dbbd0` |
| OB-10 | Low | Least-privilege (`employee`) fallback for cross-business roster lookups | `b2dbbd0` |
| OB-11 | Low | `REDIS_URL` validated in env schema; note marker type clamped; secrets documented in `.env.example` | `9acfa23` |
| OB-12 | Medium | Pin all GitHub Actions to commit SHAs; top-level deny-all `permissions:{}` | `aa3ff98` |
| OB-13 | Low | Fix GHA script-injection (`head_commit.message` via `env:`) | `aa3ff98` |
| OB-14 | Medium | Run the bot container as non-root (`USER node`) | `9529dc6` |
| OB-15 | Low | New `Security Scan` workflow: gitleaks + dependency-review | `3055ccc` |
| OB-16 | Low | Bump `vitest` → `^3.2.6` (dev-only CVE) | `17d2c63` |
| OB-17 | Low | 30 s per-user cooldown on `/business` | `7013a33` |
| OB-18 | Info | Regression tests for HMAC, URL validators, embed escaping (54 → 71) | `e07b1c6`,`f74eb72`,`7c13cab` |

## Documented (deferred — see `REMEDIATION_PLAN.md`)

| ID | Severity | Item |
|----|----------|------|
| OB-D1 | High | Per-actor authorization on `employee.*` RPC verbs (privilege escalation to owner) |
| OB-D2 | Medium | Per-actor authorization / channel allowlist on `oc.stock_post` / `caked.message_post` / `business.sync_roles` / `meta.*` |
| OB-D3 | High | Migration drift (`lookup_sessions` + perf indexes have no migration) and `drizzle-kit push --force` at boot |

## Rotation / secrets

No exposed secrets were found in the working tree or git history — **no rotation required**. If `BOTPANEL_RPC_SECRET` is ever suspected leaked, rotate it on both otterbot and botpanel simultaneously (the bus fails closed when secrets disagree).
