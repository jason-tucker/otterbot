# Otterbot — AI Coding Instructions

These instructions apply to Claude Code and any AI coding tool working in this repo.
Follow them exactly. They exist to keep the codebase consistent and help future sessions start fast without re-reading every file.

---

## Mandatory rules

### 1. Always update CHANGELOG.md
Add entries under `## [Unreleased]` for any meaningful change: new feature, behavior change, bug fix, new config, removed anything. One line per entry. Do it in the same response as the code change, not as a follow-up. Skip only: comment typos, pure reformats, internal variable renames with no behavior change.

### 2. Never run TypeScript compilation
**Never run** `pnpm typecheck`, `tsc`, `npx tsc`, `pnpm build` automatically. These OOM the VPS. If you suspect a type error, describe it in text instead. Only run if the user explicitly asks.

### 3. Bot restart (production)
The bot runs as systemd service `otterbot.service`. It has no watch mode. After code changes:
```bash
kill -TERM $(ps aux | grep "tsx.*src/index.ts" | grep -v grep | awk '{print $2}' | head -1)
# systemd auto-restarts it via Restart=on-failure
sleep 5 && journalctl -u otterbot -n 10 --no-pager
```

### 4. Check logs for errors
```bash
journalctl -u otterbot -n 30 --no-pager
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
| `/lookup` | `commands/lookup.ts` | McKenzie staff | Character lookup via MKE API. Shows CSN, DOB, phone, bank, standing, notes count. Buttons: Add Note, View Notes, Change Standing, Send to Channel. Always uses McKenzie — no business selector. |
| `/business` | `commands/business.ts` | Any staff | Search business roster by name (MKE API). Staff of that business get a Lookup Employee button. |
| `/employee` | `commands/employee.ts` | Manager+ | Hire, fire, promote, demote. Custom roles. Business selector if managing multiple. McKenzie is read-only (external management). |
| `/portal` | `commands/portal.ts` | Sudo only | Create/edit/deactivate businesses. Manage role mappings, owners, and permission flags — all in DB. |
| `/oc` | `commands/oc.ts` | Anyone | OC stock view (🟢/🟠/🔴) with clickable product links. Buttons: Requirements (ephemeral), Send to Channel, Manage Stock (manager+). Ephemeral by default. |
| `/caked` | `commands/caked.ts` | Anyone | Caked Up info. Buttons: Contact Info form, Event Info form, Pricing. Color: `#BF889D`. |
| `/printinfo` | `commands/printInfo.ts` | Anyone | MKE printing reference with pricing. Button navigation. |
| `/artsize` | `commands/artSize.ts` | Anyone | Art size reference. |
| `/tcsheet` | `commands/tcSheet.ts` | Anyone | Trading card sheet reference. |
| `/movechannel` | `commands/moveChannel.ts` | Manager+ | Move ticket channels to different categories. |
| `/help` | `commands/help.ts` | All | Dynamic command list based on user's roles. |

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

**Migrations:** `src/db/migrations/*.sql` + `src/db/migrations/meta/_journal.json`
When adding a migration manually, the `when` timestamp must be higher than all existing entries. Run `pnpm db:migrate` to apply. If it doesn't apply (already marked done in `__drizzle_migrations` table), run the SQL directly via a temp `tsx` script in `scripts/`, then delete the script.

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
| `standing_change:{sessionKey}` | `buttons/standingChange.ts` | Open standing select |
| `print_info:{section}:{sessionKey}` | `buttons/printInfoButton.ts` | Navigate printinfo sections |
| `send_to_channel:{key}` | `utils/sendable.ts` | Post registered payload publicly |
| `caked:{action}` | `buttons/cakedButton.ts` | contact/event → modal; pricing → reply |
| `business_lookup:{sessionKey}` | `buttons/businessLookupButton.ts` | Lookup employee from roster |
| `emp_{action}` | `buttons/employeeActionButton.ts` | hire/fire/promote/demote/etc |
| `portal_{action}` | `buttons/portalButton.ts` | Portal navigation and actions |
| `oc_requirements` | `buttons/ocButton.ts` | Show requirements — `deferReply({ ephemeral: true })` |
| `oc_manage_open` | `buttons/ocButton.ts` | Open manage panel from public embed — `deferReply({ ephemeral: true })` |
| `oc_manage` | `buttons/ocButton.ts` | Back to list inside ephemeral — `deferUpdate()` |
| `oc_status:{itemId}:{status}` | `buttons/ocButton.ts` | Update item status — `deferUpdate()` |
| `oc_remove:{itemId}` | `buttons/ocButton.ts` | Delete item — `deferUpdate()` |
| `oc_add_modal` | `buttons/ocButton.ts` | Show add-item modal — `showModal()`, no defer |
| `oc_url:{itemId}` | `buttons/ocButton.ts` | Show set-URL modal — `showModal()`, no defer |

### Select menus
| CustomId | Handler | Notes |
|---|---|---|
| `lookup_business_select:{targetDiscordId}` | `selects/businessSelect.ts` | |
| `lookup_char_select:{businessId}:{targetDiscordId}` | `selects/characterSelect.ts` | |
| `standing_select:{sessionKey}` | `selects/standingSelect.ts` | |
| `business_employee_select:{sessionKey}` | `selects/businessEmployeeSelect.ts` | |
| `emp_business_select:{sessionKey}` | `selects/employeeBusinessSelect.ts` | |
| `emp_custom_role:{sessionKey}` | `selects/employeeCustomRoleSelect.ts` | |
| `portal_biz_select:{sessionKey}` | `selects/portalSelect.ts` | |
| `portal_rm_role:{sessionKey}` | `selects/portalSelect.ts` | |
| `portal_rm_owner:{sessionKey}` | `selects/portalSelect.ts` | |
| `ticket_char_select:{targetDiscordId}` | `selects/ticketCharSelect.ts` | |
| `oc_item_select` | `selects/ocItemSelect.ts` | `deferUpdate()` — edits existing ephemeral |

### Modals
| CustomId | Handler | Notes |
|---|---|---|
| `note_submit:{sessionKey}` | `modals/noteSubmit.ts` | |
| `standing_submit:{sessionKey}` | `modals/standingSubmit.ts` | |
| `caked_contact_submit` | `modals/cakedContactSubmit.ts` | |
| `caked_event_submit` | `modals/cakedEventSubmit.ts` | |
| `portal_{type}_modal:{sessionKey}` | `modals/portalModal.ts` | |
| `oc_add_submit` | `modals/ocAddModal.ts` | Uses `isFromMessage()` → `deferUpdate()` to edit triggering message |
| `oc_url_submit:{itemId}` | `modals/ocUrlModal.ts` | Uses `isFromMessage()` → `update()` |

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
3. Create `src/db/migrations/XXXX_tag.sql`
4. Add entry to `src/db/migrations/meta/_journal.json` with `idx` = next number and `when` > all existing timestamps
5. Run `pnpm db:migrate`
6. If migration doesn't apply (already tracked as done), run SQL via a temp `scripts/yourScript.ts`, then delete it

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
