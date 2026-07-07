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

## Schema Management (no migration files)

Otterbot uses `drizzle-kit push` at container startup. No SQL migration files are committed to git or included in the image.

- Schema lives in `src/db/schema/*.ts`
- On every start, schema is compared to the live DB and applied automatically
- `--force` is set in the entrypoint — destructive changes auto-apply (be careful)

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
