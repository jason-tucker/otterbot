# Changelog

All notable changes to Otterbot are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- `/employee` slash command — full employee management (hire, fire, promote, demote) with ephemeral UI
- Right-click → Apps → "Manage Employee" context menu command
- `src/config/employee-businesses.config.ts` — standalone config for employee management (roles, custom roles, permissions per business)
- `src/services/employeeService.ts` — role add/remove logic with typed `RoleMissingError` and `RoleHierarchyError`
- `src/embeds/employeeManageEmbed.ts` — dynamic embed + buttons/selects built from live role state on every render
- Business selector dropdown when manager belongs to multiple businesses
- Custom role select menu (MKE Assistant, Printing Press Operator, OC Supervisor, OC Admin Assistant)
- Permission re-validation on every button/select click — stale sessions cannot execute actions
- All employee actions audit-logged to database
- `pnpm scan:roles` script — scans the Discord server and reports found/missing roles for every configured business

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
