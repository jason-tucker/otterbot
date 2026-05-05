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

## Commands

### Staff Commands
| Command | Who | Description |
|---|---|---|
| `/lookup` | McKenzie staff | Look up a Discord user's characters, standing, and notes. Add notes or change standing from the embed. |
| `/business` | Any staff | Search a business roster by name. Staff of that business get a **Lookup Employee** button. |
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

### Context Menu Commands (right-click a user → Apps)
| Command | Who | Description |
|---|---|---|
| **Lookup** | McKenzie staff | Same as `/lookup` for the right-clicked user. |
| **Manage Employee** | Manager+ / Sudo | Same as `/employee` for the right-clicked user. |

## Tech Stack

- [Discord.js](https://discord.js.org/) v14 with Components V2
- TypeScript + [tsx](https://github.com/privatenumber/tsx) (no compile step)
- PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)
- [pnpm](https://pnpm.io/)
- Runs as a systemd service in production

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

Create a `.env` file in the project root:

```env
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_client_id
DATABASE_URL=postgresql://user:password@host:5432/dbname
EUPHORIC_API_BASE_URL=https://mke.api.euphoric.gg
EUPHORIC_API_KEY=your_api_key

# Comma-separated Discord role IDs that grant full sudo access
SUDO_ROLE_IDS=111111111111111111,222222222222222222

# development | production
NODE_ENV=development
```

> `DISCORD_PORTAL_ADMIN_ROLE_ID` still works as a fallback but `SUDO_ROLE_IDS` is preferred.

### 3. Run database migrations

```bash
pnpm db:migrate
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

# Production (systemd manages the process)
node_modules/.bin/tsx src/index.ts
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
| **Employee** | `/lookup`, `/business`, reference commands |
| **Manager** | All above + hire/fire, add notes, change standing, manage OC stock |
| **Owner** | All above + promote/demote managers, manage owner roles |
| **Sudo** | Everything + `/portal`, Make/Revoke Owner, see all businesses |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start in watch mode |
| `pnpm commands:deploy` | Push slash commands to Discord |
| `pnpm commands:clear` | Remove all slash commands from Discord |
| `pnpm db:migrate` | Run pending database migrations |
| `pnpm db:seed` | Sync businesses.config.ts to database |
| `pnpm db:studio` | Open Drizzle Studio (database UI) |
| `pnpm scan:roles` | Verify all configured role names exist in the server |

> **Never run** `pnpm typecheck`, `pnpm build`, or `tsc` on the VPS — these OOM the server.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
