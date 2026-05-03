# Changelog

All notable changes to Otterbot are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Fixed
- `/employee` no longer shows duplicate owner buttons ("Add as Owner" + "Make Owner") for sudo users — sudo always uses "Make Owner" (DB-authoritative + best-effort Discord role sync)

---

## [0.6.0] — 2026-05-03

### Added
- **Make Owner / Revoke Owner** buttons in `/employee` — sudo-only; designates or removes a user as a DB-authoritative business owner and syncs the Discord owner role
- `/portal` slash command — sudo-only business management panel (create, edit, deactivate/reactivate businesses)
- Business role mapping management via `/portal` — add/remove Discord role → rank mappings per business
- Business owner management via `/portal` — add/remove designated owners stored in DB (`business_owners` table)
- Permission flags UI in `/portal` — toggle all six per-business flags with live buttons; set McKenzie API name
- `/employee` slash command — full employee management (hire, fire, promote, demote) with ephemeral UI
- Right-click → Apps → "Manage Employee" context menu command
- `src/services/employeeService.ts` — DB-backed config (`getEmployeeBusinessConfig`), role ID-first matching, typed `RoleMissingError` and `RoleHierarchyError`
- `src/embeds/employeeManageEmbed.ts` — dynamic embed + buttons/selects built from live role state on every render; cross-business employment summary
- `src/services/portalService.ts` — full CRUD for businesses, role mappings, and owners
- `src/services/sudoService.ts` — multi-role sudo support via `SUDO_ROLE_IDS` env var
- Business selector dropdown when manager belongs to multiple businesses
- Custom role select menu using role IDs as values (not names)
- Permission re-validation on every button/select click — stale sessions cannot execute actions
- All employee and portal actions audit-logged to database
- `pnpm scan:roles` script — scans the Discord server and reports found/missing roles for every configured business

### Changed
- Businesses are now DB-authoritative — all config (roles, owners, permissions) lives in PostgreSQL, not TypeScript files
- `DISCORD_PORTAL_ADMIN_ROLE_ID` superseded by `SUDO_ROLE_IDS` (comma-separated, multi-role support); old var still works as fallback
- `permissionService.resolveBusinesses()` now checks both Discord role mappings and `business_owners` table, keeping the highest rank per business
- `businesses` table gains: `createdBy`, `updatedAt`, `updatedBy`, `deactivatedAt`, `deactivatedBy`; soft-delete only
- `business_role_mappings` table gains: `roleName`, `label`, `isBase`, `autoGrantEmployee`, `minRankToAssign`
- New `business_owners` table for DB-authoritative ownership records

---

## [0.5.0] — 2026-05-03

### Changed
- `/help` command updated with current command list
- `/lookup` embed and flow refinements

---

## [0.4.0] — 2026-05-02

### Added
- "Send to Channel" button on `/lookup` and `/business` embeds — posts the result publicly to the current channel
- Right-click → Apps → "Lookup" user context menu command
- `/caked` command — Caked Up order and event info (ephemeral)
- `/artsize` command — art size reference
- `/tcsheet` command — TC sheet reference
- Reusable `sendable` utility (`src/utils/sendable.ts`) — registers any embed for channel posting with a single button

---

## [0.3.0] — 2026-05-02

### Added
- `/printinfo` command — McKenzie Enterprises printing reference with paginated button navigation

---

## [0.2.0] — 2026-05-02

### Added
- `/lookup` — Discord user character lookup with standing, notes count, and action buttons (Add Note, View Notes, Change Standing)
- `/business` — search business roster by name; staff of that business get a "Lookup Employee" button
- `/movechannel` — move a ticket channel (manager+ only)
- Multi-business support — commands show a dropdown when the user belongs to more than one business
- Interaction session cache with 1-hour TTL for multi-step flows
- Audit logging for all staff actions
- Standing and notes stored per-business per-character in PostgreSQL

---

## [0.1.0] — 2026-05-02

### Added
- Initial working bot — Discord.js v14, TypeScript, PostgreSQL + Drizzle ORM
- Business and role mapping seeded from `src/config/businesses.config.ts`
- Permission system based on Discord roles (`resolveBusinesses`, `hasMinRank`)
- Provider pattern for business data (`IBusinessProvider`, `MckenzieProvider`, `DiscordOnlyProvider`)
- McKenzie Enterprises API integration
