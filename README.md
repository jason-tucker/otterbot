# Otterbot

A Discord staff management bot for multi-business roleplay communities. Handles employee management, customer lookups, standing records, staff notes, and business rosters — all scoped per-business with role-based permissions.

## Features

- **`/portal`** — Sudo-only business management panel. Create, edit, and deactivate businesses. Manage role mappings, designated owners, and permission flags — all without touching config files.
- **`/lookup`** — Look up a Discord user's characters, standing, and notes. Add notes or change standing directly from the embed.
- **`/employee`** — Hire, fire, promote, and demote employees. Supports custom roles. Right-click any user → Apps → **Manage Employee** for quick access.
- **`/business`** — Search a business roster by name. Staff of that business can look up any employee from the result.
- **`/caked`** — Caked Up order and event info.
- **`/printinfo`** — McKenzie Enterprises printing reference.
- **`/artsize`** — Art size reference sheet.
- **`/tcsheet`** — TC sheet reference.
- **`/movechannel`** — Move a ticket channel to a different category (manager+).
- **`/help`** — Command list, dynamically built from your roles.

All staff responses are ephemeral. Every action is audit-logged to the database. Slash commands in bot messages are clickable links.

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

# Comma-separated Discord role IDs that grant full sudo access (e.g. portal admin, bot manager)
SUDO_ROLE_IDS=111111111111111111,222222222222222222

# development | production
NODE_ENV=development
```

> `DISCORD_PORTAL_ADMIN_ROLE_ID` is still supported as a fallback for backwards compatibility but `SUDO_ROLE_IDS` is preferred.

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Seed initial businesses (optional)

If you have existing businesses in `src/config/businesses.config.ts`, seed them to the database:

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

# Production
pnpm build && pnpm start
```

## Managing Businesses

All business configuration is done through `/portal` (sudo users only):

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

Staff access is derived from Discord role mappings configured in `/portal`.

| Role level | Can do |
|---|---|
| **Employee** | `/lookup`, `/business`, `/printinfo`, reference commands |
| **Manager** | All of the above + hire/fire employees, add notes, change standing |
| **Owner** | All of the above + promote/demote managers, manage owner roles |

**Per-business permission flags** (set via `/portal` → Permission Flags):

| Flag | Effect |
|---|---|
| `managersCanPromote` | Managers can promote employees to manager rank |
| `managersCanAssignCustomRoles` | Managers can assign custom roles |
| `ownersCanManageOwners` | Owners can add/remove other designated owners |
| `higherRolesAutoGrantEmployee` | Having manager/owner role auto-grants the employee role |
| `allowOwnerRoleFallback` | Discord owner role counts as DB ownership |
| `apiEnabled` | Enable McKenzie API integration for this business |

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
| `pnpm db:seed` | Sync legacy config to database (non-destructive) |
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
│       ├── ready.ts               # Startup: load command IDs for clickable mentions
│       └── interactionCreate.ts   # Central interaction router
├── commands/                      # Slash commands and context menus
│   ├── portal.ts                  # /portal — sudo business management
│   ├── employee.ts                # /employee — hire/fire/promote/demote
│   ├── lookup.ts                  # /lookup — character/standing lookup
│   ├── business.ts                # /business — roster search
│   └── ...
├── config/
│   ├── businesses.config.ts       # Seed template for /lookup, /business, standing, notes
│   ├── guilds.config.ts           # Guild IDs (prod + dev)
│   └── env.ts                     # Validated environment variables
├── db/
│   ├── client.ts                  # Drizzle instance
│   ├── migrate.ts                 # Run migrations on startup
│   └── schema/                    # Table definitions
├── embeds/                        # Embed builders
│   ├── portalEmbed.ts             # /portal views (main menu, detail, roles, owners, flags)
│   └── employeeManageEmbed.ts     # /employee management embed
├── interactions/
│   ├── buttons/                   # Button handlers
│   ├── modals/                    # Modal handlers
│   └── selects/                   # Select menu handlers
├── services/
│   ├── auditService.ts            # Log all staff actions
│   ├── employeeService.ts         # Role add/remove, DB-backed config
│   ├── interactionCache.ts        # Session storage (1-hour TTL)
│   ├── permissionService.ts       # Role-based access checks + owner table
│   ├── portalService.ts           # Business CRUD (create, edit, owners, role mappings)
│   ├── sudoService.ts             # Multi-role sudo check (SUDO_ROLE_IDS)
│   └── providers/                 # IBusinessProvider implementations
├── types/
│   └── domain.ts                  # Shared TypeScript types
└── utils/
    ├── cmdMention.ts              # Clickable slash command mention helper
    └── sendable.ts                # "Send to Channel" button utility
scripts/
├── seed.ts                        # Database seeder
├── scanRoles.ts                   # Discord role name verifier
└── clearCommands.ts               # Remove deployed commands
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
