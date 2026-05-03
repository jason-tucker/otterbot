# Otterbot

A Discord staff management bot for multi-business roleplay communities. Handles employee management, customer lookups, standing records, staff notes, and business rosters — all scoped per-business with role-based permissions.

## Features

- **`/lookup`** — Look up a Discord user's characters, standing, and notes. Add notes or change standing directly from the embed.
- **`/employee`** — Hire, fire, promote, and demote employees. Supports custom roles (e.g. MKE Assistant, Printing Press Operator). Right-click any user → Apps → **Manage Employee** for quick access.
- **`/business`** — Search a business roster by name. Staff of that business can look up any employee from the result.
- **`/caked`** — Caked Up order and event info.
- **`/printinfo`** — McKenzie Enterprises printing reference.
- **`/artsize`** — Art size reference sheet.
- **`/tcsheet`** — TC sheet reference.
- **`/movechannel`** — Move a ticket channel to a different category (manager+).
- **`/help`** — Command list.

All staff responses are ephemeral. Every action is audit-logged to the database.

## Tech Stack

- [Discord.js](https://discord.js.org/) v14
- TypeScript + [tsx](https://github.com/privatenumber/tsx)
- PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/)
- [pnpm](https://pnpm.io/)

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

# Optional — grants full portal access to holders of this role ID
DISCORD_PORTAL_ADMIN_ROLE_ID=

# development | production
NODE_ENV=development
```

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Seed businesses and role mappings

Edit `src/config/businesses.config.ts` to match your server's roles, then run:

```bash
pnpm db:seed
```

### 5. Deploy slash commands to Discord

```bash
pnpm commands:deploy
```

### 6. Start the bot

```bash
# Development (auto-restarts on file changes)
pnpm dev

# Production
pnpm build && pnpm start
```

## Configuration

### Adding or editing businesses

Two config files need to stay in sync:

| File | Used by |
|---|---|
| `src/config/businesses.config.ts` | `/lookup`, `/business`, standing, notes |
| `src/config/employee-businesses.config.ts` | `/employee` role management |

After editing either file, run `pnpm db:seed` and then verify role names with:

```bash
NODE_ENV=production pnpm scan:roles
```

This connects to your Discord server and reports whether every configured role name exists. Fix any `❌` entries before deploying.

### Role permissions

Staff access is derived entirely from Discord roles — no per-user configuration needed.

| Role level | Can do |
|---|---|
| **Employee** | Use `/lookup`, `/business`, `/printinfo`, and reference commands |
| **Manager** | All of the above + hire/fire employees, add notes, change standing |
| **Owner** | All of the above + promote/demote managers, manage owner roles |

Managers can only promote to manager if `managersCanPromote: true` is set for that business in `employee-businesses.config.ts` (default: `false`).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start in watch mode |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run compiled output |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm commands:deploy` | Push slash commands to Discord |
| `pnpm commands:clear` | Remove all slash commands from Discord |
| `pnpm db:migrate` | Run pending database migrations |
| `pnpm db:seed` | Sync business and role config to database |
| `pnpm db:studio` | Open Drizzle Studio (database UI) |
| `pnpm scan:roles` | Verify all configured role names exist in the server |

> **Note:** Always use `pnpm typecheck` — never run `tsc` directly.

## Project Structure

```
src/
├── bot/
│   ├── client.ts                  # Discord client setup
│   ├── registerCommands.ts        # Deploy commands to Discord
│   └── events/
│       └── interactionCreate.ts   # Central interaction router
├── commands/                      # Slash commands and context menus
├── config/
│   ├── businesses.config.ts       # Business + role → rank mappings
│   ├── employee-businesses.config.ts  # /employee role config
│   ├── guilds.config.ts           # Guild IDs (prod + dev)
│   └── env.ts                     # Validated environment variables
├── db/
│   ├── client.ts                  # Drizzle instance
│   ├── migrate.ts                 # Run migrations on startup
│   └── schema/                    # Table definitions
├── embeds/                        # Embed builders
├── interactions/
│   ├── buttons/                   # Button handlers
│   ├── modals/                    # Modal handlers
│   └── selects/                   # Select menu handlers
├── services/
│   ├── auditService.ts            # Log all staff actions
│   ├── businessService.ts         # Provider factory
│   ├── employeeService.ts         # Role add/remove logic
│   ├── interactionCache.ts        # Session storage (1-hour TTL)
│   ├── permissionService.ts       # Role-based access checks
│   └── providers/                 # IBusinessProvider implementations
├── types/
│   └── domain.ts                  # Shared TypeScript types
└── utils/
    └── sendable.ts                # "Send to Channel" button utility
scripts/
├── seed.ts                        # Database seeder
├── scanRoles.ts                   # Discord role name verifier
└── clearCommands.ts               # Remove deployed commands
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
