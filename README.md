# Otterbot

A Discord staff management bot for multi-business roleplay communities. Handles employee management, customer lookups, standing records, staff notes, business rosters, and public business info — all scoped per-business with role-based permissions.

## Quick install (any VPS with Docker)

```bash
# 1. Install Docker (skip if already installed)
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER && newgrp docker

# 2. Install Otterbot (replace YOURUSER with your GitHub username)
GITHUB_OWNER=YOURUSER bash <(curl -fsSL https://raw.githubusercontent.com/YOURUSER/otterbot/main/scripts/install.sh)
```

The installer verifies Docker, clones the repo, generates a strong Postgres password, opens `.env` so you can paste your Discord + Euphoric API credentials, pulls the GHCR image, and starts the bot.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full setup guide and CI/CD configuration.

Roadmap, completed work, and open action items are tracked in the [Bot Development project board](https://github.com/users/jason-tucker/projects/3). Items use these statuses: **Todo**, **In Progress**, **Done**, **Tucker Action** (waiting on me), **Blocked** (with a Blocker note explaining why).

## Commands

### Staff Commands
| Command | Who | Description |
|---|---|---|
| `/lookup` | McKenzie staff | Look up a Discord user's characters, MKE notes, and auto-derived standing. The character-name header links to the customer's profile on `mke.euphoric.gg`. Multi-character picker shows CSN / 📞 phone / 🏦 bank in each option. Buttons: **Add Note** (📝 Note / ✅ Good Experience / ❌ Bad Experience — posts to MKE), **View Notes** (filtered to those 3 types). Sessions are DB-backed so the buttons survive bot restarts (24 h TTL). Owners can also `/lookup` themselves without staff rank for an info-only ephemeral view. |
| `/business` | Any staff | Search a business roster by name. Staff of that business get a **Lookup Employee** button. Each roster line shows CSN, phone, and bank inline. |
| `/employee` | Manager+ | Hire, fire, promote, and demote employees. Custom role support. Right-click any user → Apps → **Manage Employee**. |
| `/movechannel` | Manager+ | Move a ticket channel to a different category. |
| `/portal` | Sudo only | Full business management — create/edit businesses, manage role mappings, designated owners, and permission flags. |
| `/help` | All | Dynamic command list built from your roles. |

### Public / Reference Commands
| Command | Who | Description |
|---|---|---|
| `/oc` | Anyone | Original Clothing stock, requirements, and website. OC Managers get an inline stock editor. |
| `/caked` | Anyone | Caked Up order info, pricing, and intake forms. |
| `/printinfo` | Anyone | McKenzie Enterprises printing reference with pricing. |
| `/artsize` | Anyone | Art size reference sheet. |
| `/tcsheet` | Anyone | Trading card sheet reference. |
| `/report` | Anyone | File a bug report or feature request. Bot owner reviews each one via DM and (on approve) files a GitHub issue. |

### Context Menu Commands (right-click a user → Apps)
| Command | Who | Description |
|---|---|---|
| **Lookup** | McKenzie staff | Same as `/lookup` for the right-clicked user. |
| **Manage Employee** | Manager+ / Sudo | Same as `/employee` for the right-clicked user. |

## Tech Stack

- [Discord.js](https://discord.js.org/) v14 with Components V2
- TypeScript compiled in CI (`tsc` — never on the VPS, OOMs)
- PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/) using **`drizzle-kit push`** (no committed SQL migrations)
- [pnpm](https://pnpm.io/)
- Docker Compose in production — image built in GitHub Actions, pushed to GHCR, pulled on the VPS
- McKenzie API at `mke.api.euphoric.gg`, plus the website at `mke.euphoric.gg/employee/portal/customers/view/{id}` for direct profile links

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database
- A Discord application with a bot token

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Yes | Bot token |
| `DISCORD_CLIENT_ID` | Yes | Application ID |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EUPHORIC_API_BASE_URL` | Yes | Base URL for the McKenzie API (default: `https://mke.api.euphoric.gg`) |
| `EUPHORIC_API_KEY` | Yes | API key (sent as `EUPHORIC-API-KEY` header) |
| `SUDO_ROLE_IDS` | No | Comma-separated Discord role IDs that grant full sudo access |
| `DISCORD_PORTAL_ADMIN_ROLE_ID` | No | Legacy fallback — use `SUDO_ROLE_IDS` instead |
| `NODE_ENV` | No | `development` or `production` |
| `UPTIME_KUMA_PUSH_URL` | No | Push monitor URL — bot pings every 60 s after `clientReady` |
| `BOT_OWNER_ID` | Yes for `/report` | Receives DM on every `/report` for review approval, plus startup pings (silent) |
| `GITHUB_TOKEN` | Yes for `/report` | Fine-grained PAT with **Issues: Read & Write** on `GITHUB_REPO` |
| `GITHUB_REPO` | Yes for `/report` | `owner/name`, e.g. `jason-tucker/otterbot` |

### 3. Apply database schema

Otterbot uses `drizzle-kit push` — schema lives only in `src/db/schema/*.ts`, no SQL migration files in git. The Docker entrypoint runs the push automatically on every start. For local non-Docker dev:

```bash
pnpm drizzle-kit push
```

### 4. Seed initial businesses

```bash
pnpm db:seed
```

After that, manage everything through `/portal` — no config file edits needed.

### 5. Deploy slash commands to Discord

```bash
pnpm commands:deploy
```

### 6. Start the bot

```bash
# Development (auto-restarts on file changes)
pnpm dev

# Production: Docker Compose (image built in CI, pulled from GHCR)
docker compose up -d
```

The `otterbot` management CLI (installed via `scripts/otterbot`) wraps Docker Compose:
```bash
otterbot start | stop | restart | logs | tail [N] | update | rebuild | deploy | env | db:shell
```

## Managing Businesses

All business configuration lives in the database, managed via `/portal` (sudo users only):

| Task | How |
|---|---|
| Create a business | `/portal` → Create Business |
| Edit name / slug / provider | `/portal` → select business → Edit Info |
| Add/remove role mappings | `/portal` → select business → Manage Roles |
| Add/remove designated owners | `/portal` → select business → Manage Owners |
| Toggle permission flags | `/portal` → select business → Permission Flags |
| Deactivate / reactivate | `/portal` → select business → Deactivate/Reactivate |

After adding roles, verify they exist in the server:

```bash
NODE_ENV=production pnpm scan:roles
```

## Role Permissions

| Level | Can do |
|---|---|
| **Employee** | `/lookup`, `/business`, reference commands. Add notes (Note / Good Experience / Bad Experience) — they post to the MKE portal as markers. |
| **Manager** | All above + hire/fire/promote/demote, manage OC stock |
| **Owner** | All above + promote/demote managers, manage owner roles |
| **Sudo** | Everything + `/portal`, Make/Revoke Owner, see all businesses |

> **Standing** is no longer a role-gated action — it's read-only and auto-derives from the customer's most-recent MKE Good/Bad Experience marker. Was previously a Change Standing button gated to Manager+; that was removed in [0.9.1](CHANGELOG.md) since the website's standing actually lives in `profile.securityRiskLevel` and the bot can't write to that field.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start in watch mode |
| `pnpm commands:deploy` | Push slash commands to Discord |
| `pnpm commands:clear` | Remove all slash commands from Discord |
| `pnpm drizzle-kit push` | Apply schema to the DB (replaces the old `db:migrate`) |
| `pnpm db:seed` | Sync businesses.config.ts to database |
| `pnpm db:studio` | Open Drizzle Studio (database UI) |
| `pnpm scan:roles` | Verify all configured role names exist in the server |

> **Never run** `pnpm typecheck`, `pnpm build`, or `tsc` on the VPS — these OOM the server.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
