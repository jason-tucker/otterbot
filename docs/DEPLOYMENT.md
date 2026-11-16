# Otterbot — Deployment Guide

## Overview

| Environment | How to run |
|---|---|
| **Local dev** | `pnpm dev` (tsx, hot reload, local Postgres) |
| **Any server** | `docker compose up -d` (one command, pulls from GHCR) |
| **CI/CD** | Push to `main` → GitHub Actions builds image → pushes to GHCR → VPS pulls |
| **Watchtower** | Polls GHCR (~30 s) and restarts the container when `:latest` changes — a redundant path to the CI SSH deploy |

> **Why Docker?** The VPS has ~900 MB free RAM and cannot compile TypeScript.
> The GitHub Actions runner has 7 GB RAM and builds the image there.
> The VPS only pulls and runs a pre-built image — zero compilation on the server.

> **Two delivery paths.** A push to `main` triggers the CI SSH deploy below.
> Independently, Watchtower (label `com.centurylinklabs.watchtower.enable=true`
> on the `otterbot` service) watches the `ghcr.io/jason-tucker/otterbot:latest`
> digest and restarts the container when CI pushes a new one. Either one alone
> keeps the VPS current.

---

## One-Command Deployment (any server with Docker)

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/otterbot.git
cd otterbot

# 2. Configure
cp .env.example .env
nano .env    # fill in all required values

# 3. Create the shared external network (once per host; no-op if it already
#    exists — e.g. because the botpanel stack created it first)
docker network create botpanel-net || true

# 4. Start
BOT_IMAGE=ghcr.io/YOUR_GITHUB_USERNAME/otterbot:latest docker compose up -d
```

> `docker-compose.yml` declares `botpanel-net` as `external: true` — both the
> `otterbot` and `db` services join it so botpanel (and its Redis) can reach
> them without a host port. `docker compose up` fails immediately if the
> network doesn't exist yet, so create it before the first start on any
> given host.

**Works on:** Ubuntu, Debian, any Linux with Docker, Unraid (Docker Compose Manager plugin)

---

## GitHub Secrets (required once per repo)

**GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | `botuser` |
| `VPS_SSH_KEY` | Private SSH key contents |
| `PROJECT_DIR` | `/home/botuser/projects/otterbot` |
| `DISCORD_DEPLOY_WEBHOOK` | Discord webhook URL for deploy notifications |
| `DISCORD_BOT_TOKEN` | Bot token |
| `DISCORD_CLIENT_ID` | Application ID |

> Note: `EUPHORIC_API_KEY` and `DATABASE_URL` are only needed on the VPS (in `.env`), not as GitHub secrets. The workflow passes placeholder values during command registration since the actual API is not called at that stage.

---

## One-Time VPS Setup

```bash
# Install Docker (if needed)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker botuser

# Clone
cd /home/botuser/projects
git clone https://github.com/YOUR_USERNAME/otterbot.git

# Configure
cp otterbot/.env.example otterbot/.env
nano otterbot/.env
# Required: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, EUPHORIC_API_KEY
# Required: POSTGRES_PASSWORD (anything strong)
# Required: BOT_IMAGE=ghcr.io/YOUR_USERNAME/otterbot:latest

# Create the shared external network (skip if another stack, e.g. botpanel,
# already created it)
docker network create botpanel-net || true

# Start
cd otterbot && docker compose up -d
```

---

## Schema Management (tracked migrations)

Otterbot applies **tracked SQL migrations** at container start. `scripts/docker-entrypoint.sh` runs `node dist/db/migrate.js`; if it exits non-zero the container stops and the bot does not start.

- Schema lives in `src/db/schema/*.ts`; every schema change ships with a generated migration in `src/db/migrations/` (`pnpm db:generate --name <short_name>`, review the SQL, commit both).
- The migrator takes a Postgres advisory lock (waits up to 60 s), runs all pending migrations in one transaction, and records them in `drizzle.__drizzle_migrations`.
- There is no `drizzle-kit push` at boot any more. Nothing drops or truncates data unless a reviewed migration says so. Destructive SQL (DROP, TRUNCATE, ALTER COLUMN TYPE, RENAME, DELETE FROM) must carry a `-- obd3:allow-destructive <reason>` comment inside the statement, or `src/db/migrations.test.ts` fails. Avoid `CREATE INDEX CONCURRENTLY` (migrations run in a transaction).
- CI (`.github/workflows/db-check.yml`, pull requests) fails when `src/db/schema` changed without a migration.
- Safety guards in the migrator (exit 1, nothing changed): public tables exist but no baseline marker; baseline marker exists but the public tables are gone; lock not obtained within 60 s.
- Fresh databases no longer receive the 22 `oc_stock` seed rows; run `scripts/seedOcStock.ts` if you need them.
- Local dev databases built earlier with `drizzle-kit push` need the marker SQL below (or recreate the database).

### One-time production steps (OB-D3) — do these BEFORE merging the PR

The production database was built by `drizzle-kit push`, so it has the tables but no migration record. The marker adopts it without running any DDL in `public`. Each step needs the operator's approval; P0-P3 change nothing. Container names below assume the compose project `otterbot` (`otterbot-db-1`, `otterbot-otterbot-1`).

**P0. Confirm push has kept production equal to the schema.** Push swallows errors, so the log is the only signal:
`docker logs otterbot-otterbot-1 2>&1 | grep -A3 "Applying database schema" | tail -8` — the last start should say "No changes detected" and show no error.

**P1. Read-only inspection.** Open a read-only session:
`docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' otterbot-db-1 psql -U otterbot -d otterbot -v ON_ERROR_STOP=1 -X`
and run:
```sql
SELECT version();
SELECT current_user, rolsuper, has_database_privilege(current_user, current_database(), 'CREATE') AS can_create
  FROM pg_roles WHERE rolname = current_user;
SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema' ORDER BY 1;
SELECT to_regclass('drizzle.__drizzle_migrations') AS drizzle_tbl, to_regclass('public.__drizzle_migrations') AS public_tbl;
-- only if drizzle_tbl is not null:
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2;
SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2;
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY 1;
```
It must show exactly these 11 public tables: `audit_logs, business_buttons, business_messages, business_owners, business_role_mappings, businesses, lookup_sessions, notes, oc_stock, report_sessions, standings`; a user that can CREATE; PostgreSQL 16. Note whether a `drizzle` schema already exists and its newest `created_at` (it must be smaller than the baseline `when` in `src/db/migrations/meta/_journal.json`).

**P2. Schema-only dump (no row data)** to compare with a database built from the migrations:
`docker exec otterbot-db-1 pg_dump -U otterbot -d otterbot --schema-only --no-owner > otterbot-schema.sql`
Do not continue if it differs from a fresh migrated database (apart from the `drizzle` schema); reconcile first.

**P3. Full backup, then a restore test:**
```bash
mkdir -p ~/backups && chmod 700 ~/backups
docker exec otterbot-db-1 pg_dump -U otterbot -d otterbot -Fc -f /tmp/otterbot-pre-obd3.dump
docker cp otterbot-db-1:/tmp/otterbot-pre-obd3.dump ~/backups/
chmod 600 ~/backups/otterbot-pre-obd3.dump
docker exec otterbot-db-1 rm -f /tmp/otterbot-pre-obd3.dump   # do not leave the dump inside the container
```
Check it with `pg_restore --list`, restore it into a throwaway `postgres:16-alpine` container, then remove that container. Keep the dump on the VPS.

**P4. Write the baseline marker (quiet window).** It only creates the `drizzle` bookkeeping table and inserts one row; it changes nothing in `public` and is harmless to the old image (push ignores the `drizzle` schema). It is idempotent and refuses to run unless all 11 tables exist:
The VPS checkout tracks `origin/main`, so the file does not exist there before the merge. Pipe it from the exact commit that will be merged (`<final PR head sha>`):
```bash
git fetch origin fix/schema-migrations
git show <final PR head sha>:scripts/db/baseline-mark-applied.sql | docker exec -i otterbot-db-1 psql -U otterbot -d otterbot -v ON_ERROR_STOP=1 -X
```
**P4 must use the same commit that gets merged.** The marker embeds the hash of `0000_baseline.sql`; if the baseline or marker changes after P4, redo P4 from the new head before merging.
Then check `SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1` shows the baseline `when`.

**P5. Merge the PR.** CI builds the image and watchtower/the deploy job rolls it out. Watch `docker logs otterbot-otterbot-1 --tail 30` for "Migrations complete." and the bot becoming ready. Re-run the table/index queries from P1 (expect no difference) and smoke-test `/oc`, `/lookup` Add Note, and the botpanel otter pages.

**Order matters:** P4 before P5. If the marker is missing at deploy the migrator exits 1 and the container crash-loops (no data changes) until P4 is run or the previous image is pinned.

**Rollback.** Code: revert the merge, or set `BOT_IMAGE=ghcr.io/jason-tucker/otterbot:sha-<previous>` and run `docker compose up -d otterbot`; the old push sees no changes and the marker may stay. To remove the marker only if no `drizzle` schema existed in P1: `DROP TABLE drizzle.__drizzle_migrations; DROP SCHEMA drizzle;` — otherwise delete just the baseline row by `created_at`. Restore the P3 dump with `pg_restore --clean` only if data was damaged (nothing here runs DDL in `public`).

**Warning: image rollback is only safe while the journal holds just the baseline migration.** A pre-OB-D3 image runs `drizzle-kit push --force` at boot; once a later migration has been applied, that push sees the new tables/columns as drift and can drop them (data loss). After the first post-baseline migration ships, roll back by reverting forward (a new migration) or restoring a backup, not by pinning a pre-OB-D3 image.

---

## Checking Status

```bash
docker compose ps
docker compose logs otterbot -f
docker compose logs otterbot --tail=50
```

## Rollback

```bash
# Run a specific previous image by SHA (find in GitHub Actions logs)
BOT_IMAGE=ghcr.io/YOUR_USERNAME/otterbot:sha-<previous_sha> docker compose up -d
```

## Rotating Secrets

- **Discord webhook**: Update `DISCORD_DEPLOY_WEBHOOK` GitHub secret — no code changes
- **Bot token**: Update `DISCORD_BOT_TOKEN` GitHub secret AND the VPS `.env`, then `docker compose up -d`
- **Euphoric API key**: Update VPS `.env`, then `docker compose up -d`

> After editing `.env`, always run `docker compose up -d` — **not**
> `docker compose restart`. A plain `restart` does not re-read `.env`, so the
> container keeps the old values.

---

## Database Access

The Postgres container deliberately has **no host port mapping** (security). To
get a `psql` shell from the VPS host:

```bash
docker exec -it otterbot-db-1 psql -U otterbot
# or via the management CLI:
otterbot db:shell
```

The bot reaches its own DB at `db-otter:5432` over the compose network (the
unqualified `db` alias is avoided because multiple stacks on the shared
`botpanel-net` network claim it and docker round-robins between them). botpanel
reaches the same DB at `db-otter:5432` over `botpanel-net`.
