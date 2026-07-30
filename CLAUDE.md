# Otterbot — AI Coding Instructions

These instructions apply to Claude Code and any AI coding tool working in this repo.
Follow them exactly. They exist to keep the codebase consistent and help future sessions start fast without re-reading every file.

---

## Agent usage

Always spawn agents to do work. Haiku for lookups. Sonnet for coding. Opus for planning.

Use agents proactively — delegation is the default, not a fallback. Match the model to the task:

- **Haiku** — file discovery, repository searches, quick lookups, lightweight analysis, and simple verification.
- **Sonnet** — coding, implementation, refactoring, debugging, writing tests, editing documentation, and normal technical work.
- **Opus** — architecture, complex planning, cross-repository strategy, high-risk changes, difficult debugging strategy, and final reconciliation.

How to delegate well:

- Run independent work in parallel; serialize only when there is a real dependency.
- Give every delegated task a precise scope and a concrete expected output.
- Require every agent to cite the paths, symbols, commands, or repository evidence behind its conclusions.
- Demand actionable results, not generic summaries.
- Never let two agents edit the same file at once — assign explicit file ownership and coordinate overlaps through the orchestrator.
- Resolve conflicting recommendations with repository evidence, not preference.
- Validate every agent's output before accepting it; re-run or re-scope on doubt.
- Use agents to improve speed or quality — not to create pointless duplication.
- The orchestrator reviews all delegated work and remains responsible for final correctness.

To validate without the compiler (rule 2 forbids `pnpm typecheck`/`pnpm build` on the VPS): run `pnpm test` (vitest).

---

## Mandatory rules

### 1. Always update CHANGELOG.md
Add entries under `## [Unreleased]` for any meaningful change: new feature, behavior change, bug fix, new config, removed anything. One line per entry. Do it in the same response as the code change, not as a follow-up. Skip only: comment typos, pure reformats, internal variable renames with no behavior change.

### 2. Never run TypeScript compilation
**Never run** `pnpm typecheck`, `tsc`, `npx tsc`, `pnpm build` automatically. These OOM the VPS. If you suspect a type error, describe it in text instead. Only run if the user explicitly asks.

### 3. Bot restart (production)
The bot runs as the docker compose service `otterbot-otterbot-1` (image `ghcr.io/jason-tucker/otterbot:latest`, auto-updated by watchtower on GHCR push). DB and Redis hostnames (`db`, `redis`) only resolve inside the docker network — never run the bot from the host (no systemd, no `tsx src/index.ts` directly), it will hijack interactions from the docker bot and fail every DB call.

After code changes, push to main → CI builds → watchtower pulls. To force-restart manually:
```bash
cd /home/botuser/projects/otterbot && docker compose restart otterbot
sleep 5 && docker logs otterbot-otterbot-1 --tail 20
```

### 4. Check logs for errors
```bash
docker logs otterbot-otterbot-1 --tail 30
```

### 5. Deploy slash commands after adding/removing commands
```bash
pnpm commands:deploy
```
Register in both `src/bot/registerCommands.ts` AND `src/bot/events/interactionCreate.ts`.

---

## What this bot does — full feature map

### Slash commands

| Command | File | Access | What it does |
|---|---|---|---|
| `/lookup` | `commands/lookup.ts` | McKenzie staff | Character lookup via MKE API. Shows CSN, DOB, phone, bank, standing (auto-derived from latest MKE Good/Bad Experience marker), notes count. Buttons: Add Note, View Notes, Send to Channel. Always uses McKenzie — no business selector. |
| `/business` | `commands/business.ts` | Any staff | Search business roster by name (MKE API). Staff of that business get a Lookup Employee button. |
| `/employee` | `commands/employee.ts` | Manager+ | Hire, fire, promote, demote. Custom roles. Business selector if managing multiple. McKenzie is read-only (external management). |
| `/portal` | `commands/portal.ts` | Sudo only | Create/edit/deactivate businesses. Manage role mappings, owners, and permission flags — all in DB. |
| `/oc` | `commands/oc.ts` | Anyone | OC stock view (🟢/🟠/🔴) with clickable product links. Buttons: Requirements (ephemeral), Send to Channel, Manage Stock (manager+). Ephemeral by default. |
| `/caked` | `commands/caked.ts` | Anyone | Caked Up info. Buttons: Contact Info form, Event Info form, Pricing. Color: `#BF889D`. |
| `/info` | `commands/info.ts` | Anyone | Generic per-business launcher (autocompleted `business` picker) for discord-only businesses without a dedicated command (Backside, EXTRA, …). Shows the business name + optional `settings.description` + its custom buttons. Send to Channel. |

**Custom command buttons:** `/oc`, `/caked`, and `/info` all render manager-configurable custom buttons (`business_buttons` table) below their built-in buttons — **Link** (open a URL) or **Info** (reveal an editable card). Managers (+ sudo) get a **Manage Buttons** panel (`bizbtn:*`) mirroring `/oc` Manage Stock; also editable from botpanel `/otter/businesses/[slug]` via the `business_buttons.*` RPC verbs. See `services/businessButtonsService.ts` + `embeds/businessButtons.ts`.
| `/printinfo` | `commands/printInfo.ts` | Anyone | MKE printing reference with pricing. Button navigation. |
| `/artsize` | `commands/artSize.ts` | Anyone | Art size reference. |
| `/tcsheet` | `commands/tcSheet.ts` | Anyone | Trading card sheet reference. |
| `/movechannel` | `commands/moveChannel.ts` | Manager+ | Move ticket channels to different categories. |
| `/help` | `commands/help.ts` | All | Dynamic command list based on user's roles. |
| `/report` | `commands/report.ts` | All | Modal (Title/Type/Description/Steps) → DMs the owner with Approve+Notify / Approve Silent / Reject+Notify / Reject Silent buttons → on approve, files a GitHub issue to `GITHUB_REPO`. |

### Context menu commands (right-click user → Apps)

| Command | File | Access | What it does |
|---|---|---|---|
| **Lookup** | `commands/userLookup.ts` | McKenzie staff | Same as `/lookup` |
| **Manage Employee** | `commands/employeeContextMenu.ts` | Manager+ / Sudo | Same as `/employee` |

### Automatic events

| Event | File | What it does |
|---|---|---|
| Ticket auto-lookup | `bot/events/ticketChannelCreate.ts` | When Ticket Tool bot (ID `722196398635745312`) creates a channel in category `1101739267908177991` and mentions a user, bot looks up their MKE characters and posts the result. Single char → embed. Multiple → select menu. None → sign-up link. |

---

## Businesses

Defined in `src/config/businesses.config.ts` (seed template) — live config in DB, managed via `/portal`.

| Business | Slug | Provider | Notes |
|---|---|---|---|
| McKenzie Enterprises | `mckenzie` | `mckenzie` | Real API via MckenzieProvider. Read-only in `/employee`. |
| Original Clothing | `original-clothing` | `discord-only` | Has `/oc` command + `oc_stock` DB table. Manager = "Original Clothing Manager" role. |
| Backside Skateboards | `backside-skateboards` | `discord-only` | |
| EXTRA Event Decor | `extra-event-decor` | `discord-only` | |
| Caked Up | `caked-up` | `discord-only` | Has `/caked` command. |

**To check if a user has OC manager access:**
```typescript
const resolved = await resolveBusinesses(member)
const oc = resolved.find(r => r.business.slug === 'original-clothing')
const isManager = oc ? hasMinRank(oc.rank, 'manager') : false
```

---

## Database tables

| Table | Key columns | Purpose |
|---|---|---|
| `businesses` | id, name, slug, providerType, guildId, active, settings | Business records |
| `business_role_mappings` | businessId, guildId, roleId, roleName, rank, isBase, autoGrantEmployee, minRankToAssign | Discord role → rank mappings |
| `business_owners` | businessId, discordUserId | DB-authoritative owner records |
| `standings` | businessId, characterId, standing (good/neutral/bad/blacklisted), reason | Per-business character standings |
| `notes` | businessId, characterId, content, visibility (staff/manager/owner) | Per-business character notes |
| `audit_logs` | actorDiscordId, businessId, action, targetType, targetId, success, details | All staff action logs |
| `oc_stock` | name, status (in_stock/low_stock/out_of_stock), sortOrder, url, updatedByDiscordId | OC clothing items with product links |
| `lookup_sessions` | key (random hex), characterId, characterName, characterCsn, businessId, targetDiscordId, rank, expiresAt | DB-backed `/lookup` sessions so Add Note / View Notes buttons survive bot restarts. 24 h TTL, swept on insert. |
| `business_buttons` | businessId, type (link/info), label, emoji, style, url, body, sortOrder, enabled | Manager-configurable custom buttons on `/oc` `/caked` `/info`. 30 s read cache; cap 10/business. UUIDs encoded directly in customIds (OC exception). |
| `business_messages` | businessId, key, body | Per-business overridable card body copy. Used by `/caked` (Contact/Event/Pricing sections) and `/oc` (Requirements). Renderers call `getBusinessMessageOverrides()` and fall back to built-in defaults. 60 s in-process LRU cache; invalidated on update/reset. |

**Schema application:** The container ENTRYPOINT (`scripts/docker-entrypoint.sh`) runs `drizzle-kit push --force` against the compiled schema on every container start — this is the single authoritative mechanism for production schema changes. `src/db/migrations/*.sql` and `src/db/migrations/meta/_journal.json` are kept for local/manual use (`pnpm db:migrate`) but are NOT run in the container. The journal currently references `idx: 3` (`0003_perf_indexes`) whose `.sql` file is absent on disk — this is a known gap tracked as **OB-D3** in `REMEDIATION_PLAN.md`. Do NOT renumber existing entries; the next migration is `idx 6`.

---

## Architecture rules

- **No hardcoded business logic in commands** — use `getProvider(business)` via `IBusinessProvider` for data access.
- **All staff responses must be ephemeral** unless explicitly posting to a channel via Send to Channel.
- **All staff actions must be audit-logged** via `src/services/auditService.ts`.
- **Re-validate permissions on every button/select click** — never trust the session alone; always call `resolveBusinesses` again.
- **Interaction session keys are random hex** stored in `interactionCache.ts` (1-hour TTL). Encode as `action_name:{sessionKey}` in customIds. Do NOT encode raw Discord IDs in customIds.
- **Exception for OC:** OC stock item IDs (UUIDs from DB) are encoded directly in customIds — they're not sensitive.

---

## Interaction customId reference

All routing is in `src/bot/events/interactionCreate.ts`.

### Buttons
| CustomId prefix | Handler | Notes |
|---|---|---|
| `note_add:{sessionKey}` | `buttons/noteAdd.ts` | Open add-note modal |
| `note_view:{sessionKey}` | `buttons/noteView.ts` | View notes list |
| `print_info:{section}:{sessionKey}` | `buttons/printInfoButton.ts` | Navigate printinfo sections |
| `send_to_channel:{key}` | `utils/sendable.ts` | Post registered payload publicly |
| `caked:{action}` | `buttons/cakedButton.ts` | contact/event → modal; pricing → reply |
| `business_lookup:{sessionKey}` | `buttons/businessLookupButton.ts` | Lookup employee from roster |
| `business_search:{sessionKey}` | `buttons/businessSearchButton.ts` | Navigate to the business search result panel |
| `ticket_account_made:{targetDiscordId}` | `buttons/ticketAccountMade.ts` | Ticket channel: opener confirms their account exists — triggers character lookup |
| `ticket_account_help:{targetDiscordId}` | `buttons/ticketAccountMade.ts` | Ticket channel: opener says account not yet made — shows sign-up link card |
| `help:back` | `commands/help.ts` (`executeFromBackButton`) | Return to the `/help` main menu from a section page — `deferUpdate()` |
| `emp_{action}` | `buttons/employeeActionButton.ts` | hire/fire/promote/demote/etc |
| `portal_{action}` | `buttons/portalButton.ts` | Portal navigation and actions |
| `oc_requirements` | `buttons/ocButton.ts` | Show requirements — `deferReply({ ephemeral: true })` |
| `oc_manage_open` | `buttons/ocButton.ts` | Open manage panel from public embed — `deferReply({ ephemeral: true })` |
| `oc_manage` | `buttons/ocButton.ts` | Back to list inside ephemeral — `deferUpdate()` |
| `oc_status:{itemId}:{status}` | `buttons/ocButton.ts` | Update item status — `deferUpdate()` |
| `oc_remove:{itemId}` | `buttons/ocButton.ts` | Delete item — `deferUpdate()` |
| `oc_add_modal` | `buttons/ocButton.ts` | Show add-item modal — `showModal()`, no defer |
| `bizbtn:{action}:{...}` | `buttons/businessButtonsButton.ts` | Custom buttons. `show:{id}` public reveal; `manage_open:{businessId}` / `manage:{businessId}` panel; `add:{businessId}:{type}`, `edit:{id}` → modal; `style`/`toggle`/`up`/`down`/`remove:{id}`. Re-validates manager+ on every click. |
| `oc_url:{itemId}` | `buttons/ocButton.ts` | Show set-URL modal — `showModal()`, no defer |

### Select menus
| CustomId | Handler | Notes |
|---|---|---|
| `lookup_business_select:{targetDiscordId}` | `selects/businessSelect.ts` | |
| `lookup_char_select:{businessId}:{targetDiscordId}` | `selects/characterSelect.ts` | |
| `note_type_select:{sessionKey}` | `selects/noteTypeSelect.ts` | Pick note visibility tier when adding a note |
| `help:section` | `selects/helpSelect.ts` | Navigate to a section of the `/help` menu |
| `business_employee_select:{sessionKey}` | `selects/businessEmployeeSelect.ts` | |
| `emp_business_select:{sessionKey}` | `selects/employeeBusinessSelect.ts` | |
| `emp_custom_role:{sessionKey}` | `selects/employeeCustomRoleSelect.ts` | |
| `portal_biz_select:{sessionKey}` | `selects/portalSelect.ts` | |
| `portal_rm_role:{sessionKey}` | `selects/portalSelect.ts` | |
| `portal_rm_owner:{sessionKey}` | `selects/portalSelect.ts` | |
| `ticket_char_select:{targetDiscordId}` | `selects/ticketCharSelect.ts` | |
| `oc_item_select` | `selects/ocItemSelect.ts` | `deferUpdate()` — edits existing ephemeral |
| `bizbtn_select:{businessId}` | `selects/businessButtonSelect.ts` | Pick a custom button to edit — `deferUpdate()` |

### Modals
| CustomId | Handler | Notes |
|---|---|---|
| `note_submit:{sessionKey}` | `modals/noteSubmit.ts` | |
| `business_search_submit:{sessionKey}` | `modals/businessSearchSubmit.ts` | Submit the business-name search query |
| `report:submit` | `modals/reportSubmit.ts` | Submit the `/report` modal (Title / Type / Description / Steps) — DMs the bot owner for review |
| `caked_contact_submit` | `modals/cakedContactSubmit.ts` | |
| `caked_event_submit` | `modals/cakedEventSubmit.ts` | |
| `portal_{type}_modal:{sessionKey}` | `modals/portalModal.ts` | |
| `oc_add_submit` | `modals/ocAddModal.ts` | Uses `isFromMessage()` → `deferUpdate()` to edit triggering message |
| `oc_url_submit:{itemId}` | `modals/ocUrlModal.ts` | Uses `isFromMessage()` → `update()` |
| `bizbtn_add_submit:{businessId}:{type}` / `bizbtn_edit_submit:{id}` | `modals/businessButtonModal.ts` | Create / edit a custom button; `isFromMessage()` → `deferUpdate()` back to the manage list |

---

## Components V2 — patterns used in this codebase

All embeds use Discord Components V2.

```typescript
// Required flag
flags: MessageFlags.IsComponentsV2  // = 32768

// NEVER mix content field with IsComponentsV2 — Discord returns error 50035
await interaction.editReply({ ...embed, content: null })  // always null

// Standard separator
new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)

// Standard container
new ContainerBuilder().setAccentColor(0x1a1a2e)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('text'))
  .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

// Top-level components: only ContainerBuilder and ActionRowBuilder at root level
{ flags: MessageFlags.IsComponentsV2, components: [container, actionRow] }
```

**Public embeds with Send to Channel:**
```typescript
import { registerSendable, withSendButtonV2 } from '../utils/sendable'

const container = buildMyContainer(data)
const sendKey = `my_feature:${interaction.id}`
registerSendable(sendKey, () => ({ components: [container], flags: 32768 }))
// withSendButtonV2 automatically sets Ephemeral flag
await interaction.editReply({ ...withSendButtonV2(sendKey, container, extraButtons), content: null })
```

**Deferring in button/select handlers:**
- `deferUpdate()` — edits the existing message (use inside an ephemeral manage panel)
- `deferReply({ ephemeral: true })` — creates a new ephemeral reply (use when opening a panel from a public message)
- `showModal()` — no defer allowed before this

**ModalSubmitInteraction:** If triggered from a message component, `interaction.isFromMessage()` returns true and you can use `interaction.update()` / `interaction.deferUpdate()` to edit the triggering message instead of creating a new reply.

---

## Services — quick reference

| Service | Key exports | Notes |
|---|---|---|
| `permissionService.ts` | `resolveBusinesses(member)`, `hasMinRank(rank, min)`, `isSudoUser` | Core permission check — call on every interaction |
| `businessService.ts` | `getProvider(business)` | Returns `IBusinessProvider` — use for all data access |
| `auditService.ts` | `audit({actorDiscordId, businessId, action, ...})` | Call on every meaningful staff action |
| `interactionCache.ts` | `storeLookupSession()`, `getLookupSession()`, `storePortalSession()`, etc. | 1-hour in-memory TTL sessions |
| `ocStockService.ts` | `getAllStock()`, `getStockById()`, `updateStockStatus()`, `updateStockUrl()`, `addStockItem()`, `removeStockItem()` | OC stock DB operations |
| `businessButtonsService.ts` | `listButtons()`, `listEnabledButtons()`, `getButton()`, `addButton()`, `updateButton()`, `removeButton()`, `moveButton()`, `reorderButtons()` | Custom command buttons (`business_buttons`). 30 s cache, cap 10/business. |
| `businessMessagesService.ts` | `getBusinessMessageOverrides()`, `upsertBusinessMessage()`, `resetBusinessMessage()`, `getAllEditableKeys()`, `getDefaultBody()`, `invalidateBusinessMessageCache()` | Per-business editable card copy (`business_messages`). Called by `/caked` (Contact/Event/Pricing) and `/oc` (Requirements) renderers. 60 s LRU cache. |
| `sudoService.ts` | `isSudoUser(member)` | Checks `SUDO_ROLE_IDS` env var |
| `employeeService.ts` | `getEmployeeBusinessConfig()`, role add/remove | DB-backed employee role management |
| `portalService.ts` | Business CRUD, role mappings, owners | Used only by `/portal` and its handlers |

---

## Adding new things — checklists

### New slash command
1. Create `src/commands/yourCommand.ts` — export `data` (SlashCommandBuilder) and `execute`
2. Import and add to `commandHandlers` map in `src/bot/events/interactionCreate.ts`
3. Import and add `.toJSON()` to commands array in `src/bot/registerCommands.ts`
4. Run `pnpm commands:deploy`
5. Update `CHANGELOG.md`

### New button/select/modal handler
1. Create or add to the relevant file in `src/interactions/{buttons,selects,modals}/`
2. Import and add routing in `src/bot/events/interactionCreate.ts` under the correct `isButton()` / `isStringSelectMenu()` / `isModalSubmit()` block
3. Update `CHANGELOG.md` if user-facing

### New database table
1. Create `src/db/schema/yourTable.ts`
2. Export from `src/db/schema/index.ts`
3. **Production schema is applied by `drizzle-kit push --force`** at container start (`scripts/docker-entrypoint.sh`) — no migration runner. The schema files are the single authoritative source; any new table or column lands on the next container restart automatically.
4. For local/manual use only: create `src/db/migrations/XXXX_tag.sql` and add an entry to `src/db/migrations/meta/_journal.json` with `idx` = next number and `when` > all existing timestamps, then run `pnpm db:migrate`. **Note:** `_journal.json` currently references `idx: 3` (`0003_perf_indexes`) whose `.sql` file is absent on disk — this is a known gap tracked as **OB-D3** in `REMEDIATION_PLAN.md`. Do NOT renumber; the next migration is `idx 6`.
5. If a local migration doesn't apply (already tracked as done in `__drizzle_migrations`), run the SQL via a temp `scripts/yourScript.ts`, then delete it.

### New business
1. Add to `src/config/businesses.config.ts`
2. Run `pnpm db:seed`
3. Run `NODE_ENV=production pnpm scan:roles`

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Yes | Bot token |
| `DISCORD_CLIENT_ID` | Yes | Application ID |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EUPHORIC_API_BASE_URL` | Yes | Base URL for McKenzie/Euphoric API |
| `EUPHORIC_API_KEY` | Yes | API key (sent as `EUPHORIC-API-KEY` header) |
| `SUDO_ROLE_IDS` | No | Comma-separated Discord role IDs for sudo access |
| `NODE_ENV` | No | `development` or `production` |
| `DISCORD_PORTAL_ADMIN_ROLE_ID` | No | Legacy sudo fallback — use `SUDO_ROLE_IDS` instead |
| `BOT_OWNER_ID` | No (Yes for `/report`) | Receives DM on every `/report` for review approval, plus startup pings |
| `GITHUB_TOKEN` | No | Fine-grained PAT with `Issues: Read & Write` on `GITHUB_REPO`; required for `/report` |
| `GITHUB_REPO` | No | `owner/name` of the repo issues land in (e.g. `jason-tucker/otterbot`); required for `/report` |
| `UPTIME_KUMA_PUSH_URL` | No | Kuma push URL — bot pings every 60 s after `clientReady` |
| `LOG_CHANNEL_ID` | No | Discord channel the bot posts redacted error summaries to (`src/utils/errorReport.ts`). Unset → errors only reach `console.error`/journald. |
| `BOTPANEL_RPC_SECRET` | No | HMAC-SHA256 secret shared with botpanel. Must match the value in the botpanel stack. If unset, the RPC subscriber and cache-invalidate subscriber log a warning at startup and never connect — the bot still runs as a publish-only client. The command bus fails closed on a mismatch (envelope dropped with a warn, no information leak). |
| `REDIS_URL` | No | Redis connection string for the pub/sub command bus and cache invalidation. Validated at startup via the env schema (not read raw). Default: `redis://redis:6379` (the docker-network hostname). Override for local or non-docker runs. |
| `PANEL_BASE_URL` | No | Base URL of the botpanel website for the "do this on the website" links appended to slash command replies. Defaults to `https://bots.tucker.host`. |

---

## Bot ↔ Botpanel integration

The bot and botpanel communicate exclusively over Redis pub/sub — no HTTP between them.

**Inbound commands (panel → bot):** botpanel publishes on `cmd.otter.<verb>`. The bot's subscriber (`src/services/rpcServer.ts`) `psubscribe`s `cmd.otter.*`, HMAC-verifies every envelope (`{requestId, ts, hmac, params}` where `hmac = HMAC-SHA256(BOTPANEL_RPC_SECRET, "${channel}|${requestId}|${ts}|${JSON.stringify(params)}")`), replay-checks against a 30-second window + an in-memory LRU `Map` of 5000 `requestId`s, then dispatches to a verb registry (`src/services/rpc/registry.ts`). Verb handlers live under `src/services/rpc/handlers/`. Replies publish on `res.<requestId>` via the existing event-bus publisher.

**Outbound events (bot → panel):** the bot publishes on `bot.otter.<domain>.<event>` via `src/services/eventBus.ts`. Channel helpers: `businessCh`, `ocStockCh`, `employeeCh`, `auditCh`, `notesCh`, `botCh`, etc.

**Cache-invalidation subscriber:** `src/services/cacheInvalidator.ts` subscribes to `bot.otter.settings.invalidate`. HMAC-verified events from botpanel dispatch cache clears by `params.table` (`business_messages`, `mckenzie_businesses`, etc.) without requiring a bot restart.

**Schema-change notifications:** `.github/workflows/notify-panel-schema-change.yml` fires a `repository_dispatch` (`bot-schema-changed`) at `jason-tucker/botpanel` whenever a push to `main` touches `src/db/schema/**`. Botpanel's companion `sync-bot-schema` workflow opens or updates a PR re-vendoring the Drizzle schemas. Review and merge that auto-PR before any panel operations depend on the new columns.
