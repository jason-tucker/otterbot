# Otterbot — Remediation Plan

Two parts:
1. **Fixed in this branch** — summary table (full detail + diffs are the commits themselves).
2. **Document-only** — the three behavior-sensitive items the operator chose to defer, with exact recommended diffs and the verification each needs before applying.

---

## 1. Fixed in this branch (`claude/clever-fermi-5nxy2j`)

| Commit | Area | Findings |
|--------|------|----------|
| `e07b1c6` | Escape MKE-API strings in lookup/ticket/business embeds | OB-01, OB-02, OB-18 |
| `6667171` | Authorize ticket character selector before revealing PII | OB-03 |
| `f74eb72` | RPC input/abuse hardening (no authz change) | OB-04, OB-05, OB-06, OB-18 |
| `239cd49` | fetch timeouts + close event-bus publisher on shutdown | OB-07, OB-08 |
| `b2dbbd0` | Scope portal role-mapping removal + least-privilege roster fallback | OB-09, OB-10 |
| `9acfa23` | Validate `REDIS_URL`, clamp marker type, document secrets | OB-11 |
| `aa3ff98` | Pin CI actions to SHAs, deny-all perms, fix script-injection | OB-12, OB-13 |
| `9529dc6` | Run the bot container as non-root | OB-14 |
| `3055ccc` | Add Security Scan workflow (gitleaks + dependency-review) | OB-15 |
| `17d2c63` | Bump vitest to ^3.2.6 | OB-16 |
| `7013a33` | Add cooldown to `/business` | OB-17 |
| `7c13cab` | HMAC trust-boundary regression test | OB-18 |

All of the above preserve existing behavior of the live botpanel integration and the deploy path. The suite is green (71 tests).

---

## 2. Document-only items (deferred — require human review + a DB backup)

These three were **intentionally not changed in code** because applying them blindly could break the live web-panel integration or the deploy-time DB step. Each is presented with an exact recommended diff. **Apply them in a follow-up PR, after confirming the preconditions noted.**

---

### OB-D1 — Require per-actor authorization on the `employee.*` RPC verbs  *(High)*

**Problem.** `src/services/rpc/handlers/employee.ts` hire/fire/promote/demote authorise on HMAC validity alone (`employee.ts:17-21` states this explicitly). Anyone able to publish a valid envelope on `cmd.otter.employee.promote` can promote any guild member to `owner` — including `addBusinessOwner(businessId, member.id, 'panel-rpc')` (`:165, :228`), a DB-authoritative owner row that grants `owner` rank everywhere via `resolveBusinesses`. There is also **no bot-side audit log** on this path. Contrast `business_messages.ts` / `business_buttons.ts`, which re-verify the actor's rank with `actorRankForBusiness(...)` and honour the `BOT_OWNER_ID` super-admin bypass.

**Precondition before applying:** confirm the botpanel sends an `actorUserId` (the acting panel-user's Discord ID) on these verbs — it already does for `business_messages.*` / `business_buttons.*`, so the field almost certainly exists, but verify in `jason-tucker/botpanel` first. To roll out safely, gate enforcement behind an env flag that defaults to *warn-only*, then flip to *enforce* once the panel is confirmed conformant.

**Recommended diff (sketch, mirrors the existing `actorRankForBusiness` pattern):**

```ts
// employee.ts — add near the top
import { env } from '../../../config/env'
import { businessOwners, businessRoleMappings } from '../../../db/schema'
import { and } from 'drizzle-orm'
import { createLogger } from '../../../utils/logger'
const log = createLogger('rpc:employee')

// When false (default), missing/insufficient actor rank only WARNS — preserves
// current behavior. Set RPC_ENFORCE_ACTOR=true once botpanel is confirmed to
// send actorUserId on employee.* verbs.
const ENFORCE = process.env.RPC_ENFORCE_ACTOR === 'true'

/** Effective rank of the acting panel user for this business (owner bypass via BOT_OWNER_ID). */
async function actorRank(ctx, businessId: string, guildId: string, actorUserId?: string): Promise<Rank | null> {
  if (!actorUserId) return null
  if (env.BOT_OWNER_ID && actorUserId === env.BOT_OWNER_ID) return 'owner'
  const owner = await db.select({ id: businessOwners.id }).from(businessOwners)
    .where(and(eq(businessOwners.businessId, businessId), eq(businessOwners.discordUserId, actorUserId))).limit(1)
  if (owner.length) return 'owner'
  const guild = ctx.client.guilds.cache.get(guildId)
  const m = guild && (guild.members.cache.get(actorUserId) ?? await guild.members.fetch(actorUserId).catch(() => null))
  if (!m) return null
  const rows = await db.select({ rank: businessRoleMappings.rank }).from(businessRoleMappings)
    .where(and(eq(businessRoleMappings.businessId, businessId), eq(businessRoleMappings.guildId, guildId)))
  let best: Rank | null = null
  for (const r of rows) if (m.roles.cache.has(/* roleId */ '' as string) /* join in real impl */) best = r.rank
  return best
}

// in validateCommon(): also read actorUserId
//   const { businessSlug, userId, actorUserId } = obj
//   if (actorUserId !== undefined && (typeof actorUserId !== 'string' || !SNOWFLAKE_RE.test(actorUserId)))
//     return { ok: false, error: 'invalid-actor-id' }

// in each verb, after resolveContext():
//   const aRank = await actorRank(ctx, businessId, guild.id, common.actorUserId)
//   const need: Rank = (rank === 'owner' || before === 'manager' /*promote→owner*/) ? 'owner' : 'manager'
//   if (!aRank || RANK_ORDER[aRank] < RANK_ORDER[need]) {
//     log.warn('actor lacks rank', { verb: 'employee.hire', actor: common.actorUserId, need })
//     if (ENFORCE) return { ok: false, error: 'forbidden' }
//   }
//   // also: write an audit row here (auditService.audit({...})) — this path currently never audits.
```

Also add `actorUserId` gating + `auditService.audit(...)` to the `before/after` snapshots so the bot has its own record, not just the panel's.

**Residual if not applied:** full staff-management takeover is reachable by anyone who learns `BOTPANEL_RPC_SECRET` or finds a panel auth gap. Compensating controls today: the secret, the private `botpanel-net`, and same-owner trust.

---

### OB-D2 — Per-actor authorization / channel allowlist on the other privileged verbs  *(Medium)*

**Problem.** `oc.stock_post` / `caked.message_post` send to **any** channel id the bot can reach (no guild/allowlist check); `business.sync_roles` does a guild-wide role reconcile; `meta.list_*` / `users.resolve` enumerate roles/channels/members — all with HMAC only.

**Recommended approach (same `actorRank` helper as OB-D1):**
- `oc.stock_post` / `caked.message_post`: require `actorUserId` to be manager+ of the business whose card is being posted, and restrict the target channel to the business's guild (reject DMs / cross-guild channels).
- `business.sync_roles`: require `actorUserId` owner/sudo.
- `meta.*` / `users.resolve`: gate behind an actor check if the panel exposes them to non-admins.

Roll out behind the same `RPC_ENFORCE_ACTOR` flag (warn-only first).

---

### OB-D3 — Migration drift + `drizzle-kit push --force` at boot  *(High, operational)*

**Problem.**
- `src/db/migrations/meta/_journal.json` references `0003_perf_indexes` but **no `0003_perf_indexes.sql` exists on disk**, and **`lookup_sessions` has no CREATE TABLE migration at all** (it exists only in `src/db/schema/lookupSessions.ts`). On a clean DB, `pnpm db:migrate` will not create `lookup_sessions`, so `/lookup`'s Add-Note / View-Notes buttons 500.
- `scripts/docker-entrypoint.sh:7-9` runs `drizzle-kit push --force` on every container start, which auto-approves destructive changes (column drops) against the production DB with no migration gate.

**Precondition before applying:** take a DB backup (`pg_dump`) and run against a **copy** first. This touches the migration baseline and the deploy-time DB step.

**Recommended steps:**

1. Author the missing migrations. Run `pnpm db:generate` (drizzle-kit generate) against the current schema to emit a real `00NN_lookup_sessions_and_indexes.sql` plus the matching snapshot, and reconcile `_journal.json` so on-disk SQL ⇄ journal ⇄ snapshots agree (`drizzle-kit check`). At minimum, hand-author:

   ```sql
   -- src/db/migrations/00NN_lookup_sessions.sql
   CREATE TABLE IF NOT EXISTS "lookup_sessions" (
     "key" text PRIMARY KEY NOT NULL,
     "character_id" text NOT NULL,
     "character_name" text NOT NULL,
     "character_csn" text,
     "business_id" uuid NOT NULL,
     "target_discord_id" text NOT NULL,
     "rank" text NOT NULL,
     "expires_at" timestamptz NOT NULL
   );
   CREATE INDEX IF NOT EXISTS "idx_lookup_sessions_expires" ON "lookup_sessions" ("expires_at");
   -- (regenerate the exact column set from src/db/schema/lookupSessions.ts)
   ```
   (Add the `when` timestamp in `_journal.json` higher than all existing entries, per CLAUDE.md.)

2. Stop auto-dropping columns at boot. Switch the entrypoint from `push --force` to applying tracked migrations:

   ```diff
   # scripts/docker-entrypoint.sh
   -echo "▶ Applying database schema (drizzle-kit push)..."
   -node_modules/.bin/drizzle-kit push \
   -  --config=drizzle.docker.config.cjs \
   -  --force
   +echo "▶ Applying database migrations..."
   +node dist/db/migrate.js   # runs the tracked, reviewed migrations only
   ```
   (Confirm `dist/db/migrate.js` is built and that the migration baseline matches the live DB before flipping this — otherwise keep `push` WITHOUT `--force` so a destructive diff requires manual approval.)

**Residual if not applied:** clean/disaster-recovery deploys are broken for `/lookup` notes, and a schema/DB drift on boot can silently drop production columns.

---

## Rollback

Every fixed commit is independent and revertible (`git revert <sha>`). None changes the DB schema or the panel's RPC contract, so reverting any one is safe and requires only a redeploy. See `DEPLOYMENT_AND_ROLLBACK.md`.
