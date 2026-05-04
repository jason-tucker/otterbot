# Changelog

All notable changes to Otterbot are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

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
