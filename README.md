# Otterbot

A Discord staff-management bot for multi-business roleplay communities. Handles employee management, customer/character lookups, standing records, staff notes, business rosters, and public business info — all scoped per-business with role-based permissions.

## Overview

Otterbot runs as a single Discord bot serving several "businesses" across two hardcoded guilds — the production RP guild and a dev/test guild (`src/config/guilds.config.ts`); slash commands are deployed and role mappings are seeded to both. Each business is a row in the database with a provider type, a set of Discord role → rank mappings, and optional designated owners. Staff interact through slash commands, context-menu actions, and an auto-lookup that fires when a support ticket opens. A companion web panel (botpanel) drives the bot over a Redis command bus for the same operations.

Highlights:

- **Per-business permissions** — every command and every button click re-resolves the caller's rank (`employee` < `manager` < `owner`) from their Discord roles + the DB owner list. Sudo roles bypass business limits.
- **Provider model** — McKenzie Enterprises reads from the external Euphoric REST API; every other business is "discord-only" (Discord roles + local Postgres). Commands never touch the API or DB directly; they go through `IBusinessProvider`.
- **Ticket auto-lookup** — when Ticket Tool opens a channel and pings a customer, the bot posts that customer's McKenzie character(s) automatically.
- **Manager-editable surfaces** — `/oc`, `/caked`, and `/info` cards are editable in-Discord and from the panel (`business_messages`), and managers can add custom Link/Info buttons (`business_buttons`) to those commands.
- **Panel deep-links** — `/lookup`, `/business`, `/employee`, `/portal`, `/oc`, `/caked`, and `/info` all append a "Do this on the website" link to the matching botpanel page (base URL from `PANEL_BASE_URL`, defaults to the production panel domain).

Roadmap, completed work, and open action items are tracked on the [Bot Development project board](https://github.com/users/jason-tucker/projects/3). Items use these statuses: **Todo**, **In Progress**, **Done**, **Tucker Action** (waiting on the owner), **Blocked** (with a Blocker note).

## Architecture

### Provider model

All business data access goes through the `IBusinessProvider` interface (`src/services/providers/IBusinessProvider.ts`). Commands resolve a business, then call `getProvider(business)` (`src/services/businessService.ts`) to get the right implementation:

```
command / interaction
  └─ resolveBusinesses(member)      ← which businesses can this member act on, and at what rank?
       └─ getProvider(business)     ← pick a provider by business.providerType
            ├─ MckenzieProvider     ← Euphoric REST API  (providerType 'mckenzie')
            └─ DiscordOnlyProvider  ← Discord roles + local DB (providerType 'discord-only')
```

`MckenzieProvider` implements character lookups, markers (notes), and rosters against the Euphoric API. `DiscordOnlyProvider` serves businesses whose "data" is just Discord roles plus local tables (e.g. OC stock, custom buttons).

### Permission resolution

`resolveBusinesses(member)` (`src/services/permissionService.ts`) returns `{ business, rank }[]` by merging two sources, highest rank winning per business:

1. **Discord roles** → `business_role_mappings` (role ID → rank, scoped to the guild, active businesses only).
2. **DB owners** → `business_owners` (DB-authoritative ownership; always resolves to `owner`).

`hasMinRank(rank, minimum)` compares against `RANK_ORDER` (`employee` < `manager` < `owner`). `isSudoUser(member)` (`src/services/sudoService.ts`) checks the `SUDO_ROLE_IDS` env list — sudo bypasses business limits and unlocks `/portal`.

The botpanel web UI drives the same operations over a Redis command bus: an HMAC-verified subscriber (`src/services/rpcServer.ts`) dispatches `cmd.otter.*` envelopes to a verb registry, and a cache-invalidate subscriber (`src/services/cacheInvalidator.ts`) drops business/McKenzie caches when the panel edits data — no bot restart needed. Both are optional and disable themselves with a single warning if `BOTPANEL_RPC_SECRET` is unset.

## Stack

- [discord.js](https://discord.js.org/) v14 with **Components V2** for all embeds
- TypeScript (compiled in CI only — never on the VPS, it OOMs)
- PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/), schema applied with **`drizzle-kit push`** at container start
- [ioredis](https://github.com/redis/ioredis) — event bus + command bus to the botpanel web UI
- [Zod](https://zod.dev/) for env validation
- [pnpm](https://pnpm.io/) for package management
- Docker Compose in production; image built in GitHub Actions, pushed to GHCR, auto-pulled on the VPS by Watchtower
- Euphoric / McKenzie API at `mke.api.euphoric.gg`, plus profile links on `mke.euphoric.gg`

## Quick start

Requirements for local dev: Node.js 20+, a PostgreSQL database, and a Discord application with a bot token.

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment (see Configuration below)
cp .env.example .env
# edit .env — fill in Discord + Euphoric API credentials and DATABASE_URL

# 3. Apply the database schema (drizzle-kit push — no SQL migration step)
pnpm drizzle-kit push

# 4. Seed the starter businesses (then manage everything via /portal)
pnpm db:seed

# 5. Deploy slash commands to your guild(s)
pnpm commands:deploy

# 6. Start the bot
pnpm dev            # local dev: tsx watch, hot reload
# production runs in Docker — see Deployment
```

**One-command VPS install** (Docker required) is also available via the bootstrap script:

```bash
GITHUB_OWNER=YOURUSER bash <(curl -fsSL https://raw.githubusercontent.com/YOURUSER/otterbot/main/scripts/install.sh)
```

It verifies Docker, clones the repo, generates a strong Postgres password, opens `.env` for your credentials, pulls the GHCR image, and starts the bot. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full guide.

## Configuration

Copy `.env.example` to `.env` and fill in the values below. Env vars are validated by Zod at startup (`src/config/env.ts`) — a malformed snowflake or repo slug aborts the boot rather than failing silently.

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Yes | Bot token |
| `DISCORD_CLIENT_ID` | Yes | Application ID (Discord snowflake) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EUPHORIC_API_KEY` | Yes | Euphoric/McKenzie API key (sent as the `EUPHORIC-API-KEY` header) |
| `EUPHORIC_API_BASE_URL` | No | Base URL for the McKenzie API (default `https://mke.api.euphoric.gg`) |
| `SUDO_ROLE_IDS` | No | Comma-separated Discord role IDs that grant full sudo access |
| `DISCORD_PORTAL_ADMIN_ROLE_ID` | No | Legacy single-role sudo fallback — prefer `SUDO_ROLE_IDS` |
| `BOTPANEL_RPC_SECRET` | No | Shared HMAC secret for the botpanel command bus. Unset → RPC + cache-invalidate subscribers stay off (bot still runs as a publish-only client). |
| `REDIS_URL` | No | Redis connection string for the event bus + command bus. Default `redis://redis:6379` (the docker-network hostname botpanel's Redis is reachable at over `botpanel-net`) — override for local/non-docker runs. Validated by Zod, not read raw. |
| `PANEL_BASE_URL` | No | Base URL of the botpanel website for the "do this on the website" links appended to slash command replies. Defaults to `https://bots.tucker.host`. |
| `BOT_OWNER_ID` | No¹ | Receives a DM to approve every `/report`, plus silent startup pings |
| `GITHUB_TOKEN` | No¹ | Fine-grained PAT with **Issues: Read & Write** on `GITHUB_REPO` (for `/report`) |
| `GITHUB_REPO` | No¹ | `owner/name`, e.g. `jason-tucker/otterbot` (for `/report`) |
| `UPTIME_KUMA_PUSH_URL` | No | Push-monitor URL; the bot pings it every 60 s after `clientReady` |
| `LOG_CHANNEL_ID` | No | Discord channel the bot posts redacted error summaries to (`src/utils/errorReport.ts`). Unset → errors only reach `console.error`/journald. |
| `NODE_ENV` | No | `development` (default), `production`, or `test` |

¹ Required only for `/report` to file GitHub issues; without them `/report` replies with a friendly "not configured" message.

Deployment-only variables (read by `docker-compose.yml`, not by the app) include `BOT_IMAGE` (GHCR image tag) and `POSTGRES_PASSWORD` (compose-managed Postgres password). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Usage

All staff responses are **ephemeral**. Public reference cards (`/oc`, `/caked`, `/info`, print refs) expose a **Send to Channel** button to post them publicly.

### Slash commands

| Command | Who | What it does |
|---|---|---|
| `/lookup` | McKenzie staff | Look up a Discord user's characters, MKE markers, and auto-derived standing. The character-name header links to the customer's profile on `mke.euphoric.gg`. Multi-character picker shows CSN / phone / bank. Buttons: **Add Note** (Note / Good Experience / Bad Experience — posts to MKE), **View Notes** (filtered to those three marker types), **Send to Channel**. Sessions are DB-backed (`lookup_sessions`, 24 h TTL) so buttons survive restarts. Owners can `/lookup` themselves without staff rank for an info-only view. |
| `/business` | Any staff | Search a business roster by name. Staff of that business get a **Lookup Employee** button. Roster lines show CSN, phone, and bank inline. |
| `/employee` | Manager+ | Hire, fire, promote, and demote employees, with custom-role support. Business selector when you manage more than one. McKenzie is read-only (staffing lives on the external site). Also available via right-click → **Manage Employee**. |
| `/portal` | Sudo only | Full business management — create/edit/deactivate businesses, manage role mappings, designated owners, and permission flags. All DB-backed. |
| `/oc` | Anyone | Original Clothing stock (🟢/🟠/🔴) with clickable product links. OC managers get an inline **Manage Stock** editor. Card text editable via `business_messages`; supports manager custom buttons. |
| `/caked` | Anyone | Caked Up order info, pricing, and intake forms. Card text editable via `business_messages`; supports manager custom buttons. |
| `/info` | Anyone | Generic per-business launcher (autocompleted business picker) for discord-only businesses without a dedicated command (e.g. Backside, EXTRA). Shows the business name + optional description + its custom buttons, with Send to Channel. |
| `/printinfo` | Anyone | McKenzie Enterprises printing reference with pricing; button navigation between sections. |
| `/artsize` | Anyone | Art / print size reference guide. |
| `/tcsheet` | Anyone | Trading card order sheet reference. |
| `/movechannel` | Manager+ | Move a (ticket) channel to a different category. |
| `/help` | All | Dynamic command list built from your roles, with a section drill-down select. |
| `/report` | All | File a bug report or feature request. The bot owner reviews each one via DM and, on approve, files a GitHub issue to `GITHUB_REPO`. |

### Context-menu commands (right-click a user → Apps)

| Command | Who | What it does |
|---|---|---|
| **Lookup** | McKenzie staff | Same as `/lookup` for the right-clicked user |
| **Manage Employee** | Manager+ / Sudo | Same as `/employee` for the right-clicked user |

### Automatic events

| Event | What happens |
|---|---|
| Ticket auto-lookup | When Ticket Tool (bot ID `722196398635745312`) opens a channel in the configured ticket category and pings a user, the bot looks up that user's MKE characters and posts the result. 0 chars → sign-up prompt with an **Account Made** retry flow; 1 → character embed; 2+ → select menu. See the [Auto-Ticket wiki page](https://github.com/jason-tucker/otterbot/wiki/Auto-Ticket). |

### Role / permission model

| Level | Can do |
|---|---|
| **Employee** | `/lookup`, `/business`, reference commands. Add markers (Note / Good Experience / Bad Experience) — they post to the MKE portal. |
| **Manager** | All of the above + hire/fire/promote/demote, manage OC stock, manage custom buttons and editable card text |
| **Owner** | All of the above + promote/demote managers, manage owner roles |
| **Sudo** | Everything + `/portal`, Make/Revoke Owner, and visibility into every business |

> **Standing** is read-only: it auto-derives from the customer's most-recent MKE Good/Bad Experience marker. The old Change Standing button (Manager+) was removed in [0.9.1](CHANGELOG.md) because the website's standing lives in `profile.securityRiskLevel`, which the bot can't write.

### Managing businesses (`/portal`, sudo only)

All business configuration lives in the database and is managed through `/portal` — no config-file edits in production.

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

#### Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start in watch mode (tsx) |
| `pnpm commands:deploy` | Push slash commands to Discord |
| `pnpm commands:clear` | Remove all slash commands from Discord |
| `pnpm drizzle-kit push` | Apply the schema to the DB |
| `pnpm db:seed` | Sync `businesses.config.ts` to the database |
| `pnpm db:studio` | Open Drizzle Studio (database UI) |
| `pnpm scan:roles` | Verify configured role names exist in the server |
| `pnpm test` | Run the Vitest suite |

> **Never run** `pnpm typecheck`, `pnpm build`, or `tsc` on the VPS — they OOM the server. CI compiles the image instead.

## Deployment

Production runs the bot as the Docker Compose service `otterbot` (container `otterbot-otterbot-1`, image `ghcr.io/jason-tucker/otterbot:latest`) alongside its own Postgres. Schema is applied via `drizzle-kit push` from the entrypoint on every start — there is no separate migration step in the deploy path.

Two delivery mechanisms keep the VPS current after a push to `main`:

1. **CI** (`.github/workflows/deploy.yml`) builds the image on a GitHub runner (the VPS can't compile TS), pushes `sha-<sha>` + `latest` to GHCR, registers slash commands using the built image, then SSHes to the VPS to `docker compose pull` + `docker compose up -d` and verify health.
2. **Watchtower** polls GHCR (~30 s) and restarts the container when the `latest` digest changes — a fallback/redundant path to the CI SSH deploy.

```bash
# Status / logs
docker compose ps
docker logs otterbot-otterbot-1 --tail 30
docker compose logs otterbot -f

# Manual restart (after editing .env, use `up -d`, not `restart`, so it re-reads env)
cd /home/botuser/projects/otterbot && docker compose up -d
```

The `otterbot` management CLI (`scripts/otterbot`) wraps Compose:

```bash
otterbot start | stop | restart | logs | tail [N] | update | rebuild | deploy | env | db:shell
```

Full setup, GitHub secrets, rollback, and secret-rotation steps are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Conventions

- **CHANGELOG** — every meaningful change gets a one-line entry under the current dated, semver-stamped section in [CHANGELOG.md](CHANGELOG.md), added in the same commit as the change. The repo footer/version reflects the released version.
- **Project board** — every PR / unit of work has an item on the [Bot Development board](https://github.com/users/jason-tucker/projects/3).
- **AI coding instructions** live in [CLAUDE.md](CLAUDE.md): full feature map, interaction `customId` reference, Components V2 patterns, and the architecture rules below.
- **Architecture rules:** staff responses are ephemeral unless explicitly sent to a channel; every staff action is audit-logged (`auditService`); permissions are re-validated on every button/select click (never trust the session alone); interaction session keys are random hex in `customId`s (raw Discord IDs are never encoded — OC stock UUIDs are the one safe exception).
- **More docs** — see the [project wiki](https://github.com/jason-tucker/otterbot/wiki) (Architecture, Commands, Businesses, Database Schema, McKenzie API, Auto-Ticket, OC Stock, Deployment).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
