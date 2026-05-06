# Changelog

All notable changes to Otterbot are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [0.9.1] — 2026-05-05

### Removed
- **Change Standing button** — replaced by an auto-derived standing from the most-recent MKE Good/Bad Experience marker. Managers can no longer flip standing manually because the underlying truth lives in the McKenzie portal markers (which the bot can't write to via API — POST is gated by employee context). Local-DB precedence and the `standings` read on every `/lookup` are gone too. The `standings` schema/table is left in place but unused; will be dropped in a later release.
- `src/interactions/buttons/standingChange.ts`, `src/interactions/selects/standingSelect.ts`, `src/interactions/modals/standingSubmit.ts` and the three matching routing branches in `interactionCreate.ts`.
- `Change Standing` mentions in `/help`, `helpSelect`, README, and CLAUDE.md.

### Added
- **Business Accounts on `/lookup`** — character card now shows the businesses on file for the customer (resolved from `__businessAccounts__` on the MKE profile). Names are resolved via a fresh-every-run cache that calls `business-accounts/find?name={name}` for every active McKenzie business in our local DB. Displays as e.g. `Business Accounts · 2 on file — McKenzie Enterprises · 1 other`. When at least one UUID can't be resolved to a known business, a 🔎 **Search Business** button appears alongside Add Note / View Notes; clicking it opens a modal so staff can lookup any business by name (same flow as `/business`).
- New `MckenzieProvider.getCharacterByCsn(csn)` returning extended profile (incl. `businessAccountIds`) — added to `IBusinessProvider` interface.
- New service `mckenzieBusinessCache.ts` — `refreshKnownMckenzieBusinesses()` returns `Map<uuid, KnownBusiness>` rebuilt on every call.
- **Add Note posts to MKE** — Add Note now calls `POST /character-profiles/csn/{csn}/markers` with `{ employeeDiscordId, type, content }` (the staff member's Discord ID is what the API uses to resolve the note's author). Notes land in the McKenzie portal alongside ones created from the website. New `IBusinessProvider.createMarker(csn, type, content, employeeDiscordId)` + `MckenzieProvider` implementation. Falls back to a local-DB-only save with a warning if the API ever rejects.
- **Three-type Add Note flow** — Add Note button → ephemeral select (📝 Note · ✅ Good Experience · ❌ Bad Experience) → modal. Type maps to MKE marker type 0/1/2 and is included in the POST body.
- **Lookup Method** field on the ticket character card (currently always "Discord link" — wired so future CSN/phone lookup paths can label themselves).
- **Staff-only View Notes / Add Note buttons on the ticket card** — created through the existing `lookup_sessions` table so the buttons survive bot restarts. Non-staff who click get "You must be McKenzie staff to …".
- **Owner self-lookup** — non-staff can now run `/lookup user:@themselves` and see their own MKE character info ephemerally (info-only, no Add Note / View Notes / Change Standing buttons). Running `/lookup` on anyone else still requires McKenzie staff.
- **Send to Channel hides notes count** — public broadcasts from `/lookup` no longer include the "Notes on Record" line. Contact info (DOB, phone, bank) still posts; notes-derived info stays internal.
- New `note_type_select:{sessionKey}` select-menu handler (`src/interactions/selects/noteTypeSelect.ts`) routed in `interactionCreate.ts`.
- README link to the [Bot Development project board](https://github.com/users/jason-tucker/projects/3) — full roadmap, completed work, and open action items tracked there with `Tucker Action` and `Blocked` statuses.
- `/business` roster and `/lookup` multi-character picker now show **CSN, phone number, and bank number inline** for each character, so staff can see the key identifiers without drilling into a single profile.
- `/lookup` character-name header now links straight to the customer's profile page on `mke.euphoric.gg` (`/employee/portal/customers/view/{id}`) when the character is sourced from the MKE API. Discord-only characters render the name as plain text.
- New `lookup_sessions` DB table (key, characterId, characterName, businessId, targetDiscordId, rank, expiresAt) — created automatically by `drizzle-kit push` on first boot.

### Changed
- **Standing no longer derived from MKE markers.** Previously the lookup card auto-flipped to "Bad" or "Good" based on the most-recent Bad/Good Experience marker. Now standing comes only from the local DB row (set via Change Standing). Defaults to `neutral` when nothing is stored. Markers still display in View Notes; they just don't drive the standing field anymore.
- **Ticket character card** drops Date of Birth and adds a Lookup Method line. Field set is now Name · CSN · Phone · Bank · Lookup Method.
- **Note submit modal customId** now carries the type: `note_submit:{sessionKey}:{type}` (was `note_submit:{sessionKey}`). Routing prefix unchanged.
- `/lookup` sessions are now **DB-backed** instead of in-memory, so Add Note / View Notes / Change Standing buttons keep working after a bot restart. TTL bumped from 1 hour → 24 hours since the data is stable.
- `storeLookupSession` / `getLookupSession` are now async; all 6 button/modal/select callers (noteAdd, noteView, noteSubmit, standingChange, standingSelect, standingSubmit) plus `/lookup` updated to await.

### Fixed
- Notes silently failed for many users because the in-memory session cache was wiped on every bot restart — clicking Add Note 5+ minutes after `/lookup` (or after any deploy) returned "expired" without persisting anything. Persistent sessions resolve this.

---

## [0.9.0] — 2026-05-05

### Added
- `/report` slash command — opens a modal (Title / Type / Description / Steps to reproduce); on submit, the bot DMs the owner (`BOT_OWNER_ID`) with the contents and four review buttons: ✅ Approve + Notify, ✅ Approve Silent, ❌ Reject + Notify, ❌ Reject Silent. Approve files a GitHub issue to `GITHUB_REPO` via the GitHub REST API.
- New env vars: `GITHUB_TOKEN`, `GITHUB_REPO` (both optional — `/report` no-ops with a friendly error if either is missing).
- Uptime Kuma push monitor — bot pings `UPTIME_KUMA_PUSH_URL` every 60 s after `clientReady`; Kuma marks the service down if pushes stop arriving

### Security
- Bump interaction session-key entropy from 32-bit to 128-bit (`randomBytes(4)` → `randomBytes(16)`) to eliminate birthday-collision risk

---

## [0.8.0] — 2026-05-03

### Added
- `/oc` command — public stock display (🟢 In Stock / 🟠 Low Stock / 🔴 Out of Stock) with clickable product links to the OC Wix shop; OC Managers and above get a **Manage Stock** button
- OC stock manager — inline Discord editor (select item → change status / set product URL / remove); Add Item via modal; all changes persisted to `oc_stock` DB table
- OC **Requirements** button on `/oc` — ephemeral panel covering eligibility, item limits, activity checks, removal policy, and licensing terms
- Per-item product URLs on OC stock — managers set via **Set Product Link** modal; items without a URL show as plain text
- Ticket auto-lookup — when a new channel is created in the ticket category the bot looks up the opener in the MKE API and posts their character info, a character selector if multiple, or a sign-up link if none found

### Changed
- All embeds migrated to Discord Components V2 (`ContainerBuilder`, `TextDisplayBuilder`, `SeparatorBuilder`) across `/lookup`, `/business`, `/portal`, and `/employee`
- `/help` rebuilt with Components V2 — sections shown conditionally based on role (Public, Staff, Manager, Admin, Your Access)
- `/lookup` customer embed now shows bank number alongside CSN, DOB, and phone
- `/lookup` no longer prompts to choose a business — always uses McKenzie Enterprises directly
- `/oc` reply is ephemeral with a **Send to Channel** button; public post has no management controls
- `/caked` accent color updated to `#BF889D` across all views (main, pricing, modals)

### Fixed
- `/help` now shows public commands (artsize, tcsheet, printinfo, caked) to all users — previously blocked anyone without a staff role
- `/caked` no longer references the non-existent `/cakedpricing` command — pricing is accessed via the **Pricing** button
- `/employee` custom role select now shows role names instead of raw role IDs — `role_name` column was null for all existing mappings (seeded before the column was added); backfilled from Discord

---

## [0.7.0] — 2026-05-03

### Added
- `/portal`, `/employee`, "Manage Employee" context menu, and `/movechannel` now set `defaultMemberPermissions(0)` — hidden from @everyone; visible after granting in Server Settings → Integrations

### Changed
- `/employee` UI rebuilt with Discord Components V2
- `/printinfo` and `/caked` initial replies are now ephemeral with a **Send to Channel** button, matching `/artsize` and `/tcsheet`
- McKenzie Enterprises is read-only in `/employee` — roles managed externally by the MKE website

### Fixed
- Business managers/owners no longer shown as having no staff access — `resolveBusinesses` was filtering on the wrong `guildId` column
- "Manage Employee" right-click context menu now respects sudo — sudo users were incorrectly blocked
- `/employee` no longer shows duplicate owner buttons for sudo users

---

## [0.6.0] — 2026-05-03

### Added
- **Make Owner / Revoke Owner** buttons in `/employee` — sudo-only
- `/portal` — sudo-only business management panel (create, edit, deactivate/reactivate businesses; manage role mappings, owners, and permission flags)
- `/employee` — full hire/fire/promote/demote with ephemeral UI; right-click → **Manage Employee** context menu
- `src/services/employeeService.ts` — DB-backed role config, typed `RoleMissingError` / `RoleHierarchyError`
- `src/embeds/employeeManageEmbed.ts` — dynamic embed rebuilt from live role state on every render
- `src/services/portalService.ts` — full CRUD for businesses, role mappings, and owners
- `src/services/sudoService.ts` — multi-role sudo via `SUDO_ROLE_IDS` env var
- `pnpm scan:roles` — reports found/missing Discord roles for all configured businesses

### Changed
- Businesses are now DB-authoritative — all config lives in PostgreSQL, managed via `/portal`
- `DISCORD_PORTAL_ADMIN_ROLE_ID` superseded by `SUDO_ROLE_IDS` (still works as fallback)
- `permissionService.resolveBusinesses()` now checks role mappings and `business_owners` table, keeping highest rank per business
- `businesses` and `business_role_mappings` tables extended with audit and config columns
- New `business_owners` table for DB-authoritative ownership records

---

## [0.5.0] — 2026-05-03

### Changed
- `/help` command updated with current command list
- `/lookup` embed and flow refinements

---

## [0.4.0] — 2026-05-02

### Added
- **Send to Channel** button on `/lookup` and `/business` — posts result publicly
- Right-click → **Lookup** user context menu (McKenzie staff only)
- `/caked` — Caked Up order and event info
- `/artsize` — art size reference
- `/tcsheet` — TC sheet reference
- Reusable `sendable` utility — registers any embed for channel posting

---

## [0.3.0] — 2026-05-02

### Added
- `/printinfo` — McKenzie Enterprises printing reference with paginated button navigation

---

## [0.2.0] — 2026-05-02

### Added
- `/lookup` — Discord user character lookup with standing, notes count, and action buttons (Add Note, View Notes, Change Standing)
- `/business` — search business roster by name; staff get a **Lookup Employee** button
- `/movechannel` — move ticket channels (manager+)
- Multi-business support with dropdown when user belongs to more than one business
- Interaction session cache (1-hour TTL) for multi-step flows
- Audit logging for all staff actions
- Standing and notes stored per-business per-character in PostgreSQL

---

## [0.1.0] — 2026-05-02

### Added
- Initial bot — Discord.js v14, TypeScript, PostgreSQL + Drizzle ORM
- Business and role mapping seeded from `src/config/businesses.config.ts`
- Role-based permission system (`resolveBusinesses`, `hasMinRank`)
- Provider pattern (`IBusinessProvider`, `MckenzieProvider`, `DiscordOnlyProvider`)
- McKenzie Enterprises API integration
