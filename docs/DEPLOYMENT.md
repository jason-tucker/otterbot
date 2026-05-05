# Otterbot — Deployment Guide

## Overview

| Environment | How to run |
|---|---|
| **Local dev** | `pnpm dev` (tsx, hot reload, local Postgres) |
| **Any server** | `docker compose up -d` (one command, pulls from GHCR) |
| **CI/CD** | Push to `main` → GitHub Actions builds image → pushes to GHCR → VPS pulls |

> **Why Docker?** The VPS has ~900 MB free RAM and cannot compile TypeScript.
> The GitHub Actions runner has 7 GB RAM and builds the image there.
> The VPS only pulls and runs a pre-built image — zero compilation on the server.

---

## One-Command Deployment (any server with Docker)

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/otterbot.git
cd otterbot

# 2. Configure
cp .env.example .env
nano .env    # fill in all required values

# 3. Start
BOT_IMAGE=ghcr.io/YOUR_GITHUB_USERNAME/otterbot:latest docker compose up -d
```

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
