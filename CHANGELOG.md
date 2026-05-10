# Changelog

All notable changes to Otterbot are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Security
- **`/movechannel` permission gate tightened from "any business member" to "Manager+ or sudo".** Previous gate accepted `resolved.length > 0` — meaning any employee of any business could move arbitrary channels, even ones for unrelated businesses. CLAUDE.md says this is Manager+; the implementation now matches.
- **`emp_*` action buttons verify `business.guildId === interaction.guild.id` before treating sudo as owner.** A sudo who clicked through a session referring to a business attached to a different guild would previously have its synthetic-owner ResolvedBusiness fabricated with the *caller's* `guild.id`, allowing role mutations against the wrong server. Now we look up the actual business record and bail with "this management session belongs to a different server" if the guild doesn't match.
- **MKE API error responses no longer logged or surfaced verbatim.** `MckenzieProvider.getNotes` and `createMarker`, plus `noteSubmit.ts`, used to write the MKE response body (sliced to 200–500 chars) into journald and back to callers. MKE error payloads can echo PII (CSN / phone / bank fields) for the affected character. Replaced with a status-derived `errorCategoryFromStatus()` (e.g. "rate-limited", "authentication / permission", "upstream error") that's safe to log and display.

### Performance
- **Schema indexes for hot lookup paths.** `notes(business_id, character_id, created_at desc)`, `audit_logs(business_id, created_at desc)`, `audit_logs(actor_discord_id, created_at desc)`, `business_owners(discord_user_id)`, `lookup_sessions(expires_at)`, and `standings(business_id, standing)`. These were all sequential scans before — `permissionService.isBusinessOwner` runs on every interaction; the lookup-session sweep on every store does `WHERE expires_at < now()`; note + audit reads scan-then-sort. Migration `0003_perf_indexes.sql`.
- **Cross-business `/employee` summary now batches DB queries.** Was N businesses × ~3 queries inside a `Promise.all` on every `/employee` open AND every action button click — scaled linearly with business count. New `getEmployeeBusinessConfigsForGuild()` (one query per table, regardless of business count) + new `ownedBusinessIds()` batch helper in `permissionService.ts`. Three call sites updated: `commands/employee.ts`, `interactions/buttons/employeeActionButton.ts`, `interactions/selects/employeeCustomRoleSelect.ts`. Also drops the `force: true` from post-action `members.fetch` — the role mutations already updated the cached member.

### Changed
- **Bot presence is now a Custom Status — no "Watching staff requests · " prefix, just the relative-time stamp.** Activity type flipped from `Watching` to `Custom` and the `staff requests · last used ` prefix dropped, so Discord renders the status as plain text (e.g. `12m ago` / `just now`). `_lastUsedAt` is now persisted to `.presence-state.json` (gitignored) and re-read on boot, so the stamp survives systemd restarts and deploys — the bot doesn't show up "fresh" right after a restart anymore. DND status text also uses Custom now for the same prefix-free look.

## [0.10.2] — 2026-05-08

Cumulative since 0.9.1 — the auto-ticket Account Made flow (silent message, 4-min cooldown, Website / Help / Retry fallback), portal status-flip toggles, presence "last used X ago", a security pass (default `allowedMentions: { parse: [] }`, OC URL protocol gating, `/artsize` accidental-ping fix), and a refactor pass that pulled the duplicated MKE lookup helpers into `services/ticketLookup.ts` + extracted `utils/cv2.ts`. Held back from 1.0 — that's a deliberate deferred milestone — but this is the most stable release we've cut.

### Added
- **`Account Made` button on auto-ticket no-character message.** Posted silently; clicking re-runs the MKE character lookup. If a character is now linked, the original message is replaced in-channel with the proper character embed/selector. If still nothing, an ephemeral reply offers three buttons: 🌐 **Website** (link to https://mke.euphoric.gg/account), 🆘 **Ask for Help** (posts a silent message in the ticket pinging the Printing Press Operator role `1308966159516827688`), and 🔁 **Retry** (re-runs the lookup, rate-limited per user to once every 4 minutes). Restricted to the ticket creator unless the clicker has `ManageChannels`.

### Changed
- **Portal permission-flag buttons now show current state, not just color.** Labels become `<flag name>: ON` (green) / `<flag name>: OFF` (red) with a 🟢/🔴 emoji, instead of the bare flag name in green/gray. Clicking still toggles. Matches the convention adopted today across squishybot's profile/voice/game-prefs panels.
- **`/help` Staff section now documents the Auto-Ticket helper.** Both the inline overview and the drill-down ("👔 Staff commands") list the 1-character / 2+ character / 0-character outcomes and the **Account Made → Website / Ask for Help / Retry** flow.

### Refactor
- **Removed duplicated `fetchCharacters` + `getMckenzieBusinessId` + `MkCharacterProfile`.** Both `bot/events/ticketChannelCreate.ts` and `interactions/buttons/ticketAccountMade.ts` had verbatim copies (~40 lines each) of the MKE Discord-id lookup and the local-business-id query. Extracted to `src/services/ticketLookup.ts` along with the `TICKET_CATEGORY_ID` and `TICKET_BOT_USER_ID` constants. Both call sites now import from there.
- **Extracted `src/utils/cv2.ts` (`sep` / `sepLarge` / `sepBlank`).** Replaced ~20 inlined `new SeparatorBuilder().setDivider(...).setSpacing(...)` calls across embed / command / button / modal modules with a single import per file. Helpers mirror the pattern squishybot already uses.
- **Capped the `lastRetry` Map in `ticketAccountMade.ts` at 1000 entries.** The map keys are user IDs that were never evicted, so on a busy server it grew unbounded over the bot's lifetime. New `rememberRetry()` helper drops the oldest entry on overflow (Map iteration is insertion-ordered).
- **Fixed `function sep() { return sep() }` infinite-recursion stubs** that an editor auto-replace had left behind in `commands/help.ts` and `interactions/selects/helpSelect.ts` after pulling the local `sep()` defs out — both now import from the shared `utils/cv2.ts` instead.

### Changed
- **Bot presence now shows "last used X ago" — refreshed every 5 min, idles after 60 min.** Status text becomes `Watching staff requests · last used 12m ago`. Throttled to 5-minute push intervals; back-to-back interactions coalesce. Idle threshold bumped from 15 min to 60 min, and idle status carries the same "last used X ago" string instead of going blank.

### Security
- **Client-wide default `allowedMentions: { parse: [] }`.** Set on the discord.js Client constructor so every reply / send / followUp defaults to "no mentions resolve". Defends every code path that interpolates user-supplied text (portal modal fields, note content, /report description, etc.) against accidental `@everyone` / `@user` resolution. Legitimate ping call sites (the auto-ticket help-role ping) already pass explicit overrides.
- **OC product URL hardening.** The `oc_url_submit` modal's `item_url` field is now parsed as a `URL` and gated to `http:` / `https:` before being saved + rendered as a markdown link in the public OC stock embed. Rejects `javascript:` / `data:` and any other scheme up front so a manager (or compromised manager account) can't drop a click-through-to-arbitrary-content link into the channel.

### Fixed
- **Reference commands no longer ping the users they mention.** `/artsize` (and any other command using the shared `withSendButton` / `withSendButtonV2` Send-to-Channel helper, e.g. `/caked`, `/printinfo`, `/oc`) was rendering `<@id>` mentions in the body text as real Discord pings every time someone ran the command — the named users got a notification on every invocation. The sendable helper now defaults `allowedMentions: { parse: [] }` on both the ephemeral reply and the Send-to-Channel public follow-up, so `<@id>` and `<@&id>` still render as clickable links but don't notify. Same fix applied to the `/caked` Contact and Event submit replies (`Submitted by <@user>` line was pinging the submitter on each form post).

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
