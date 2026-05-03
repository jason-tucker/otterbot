# Otterbot — AI Coding Instructions

These instructions apply to Claude Code and any other AI coding tool working in this repo.
Follow them exactly. They exist to keep the codebase consistent and the changelog accurate.

---

## Changelog rule (mandatory)

**Always update `CHANGELOG.md` when making any meaningful change.**

A meaningful change is anything a user or developer would care about:
- New command, feature, or interaction handler
- Changed behavior (even small UX tweaks)
- Bug fix
- New config option or script
- Removed or renamed anything

Not required for: fixing a typo in a comment, reformatting, or purely internal variable renames with no behavior change.

### How to update it

Add your entry under `## [Unreleased]` at the top of the file.
Use one of these section headers inside it:

- `### Added` — new feature or command
- `### Changed` — changed existing behavior
- `### Fixed` — bug fix
- `### Removed` — deleted something

Keep entries short — one line each. Examples:
```
### Added
- `/employee` slash command — hire, fire, promote, demote with ephemeral UI

### Fixed
- Business select no longer shows businesses where the user is only an employee
```

Do this **in the same response** as the code change, not as a follow-up.

---

## Memory and environment

- **Never run `pnpm typecheck`, `tsc`, `npx tsc`, `pnpm build`, or any other TypeScript compilation command automatically.** These OOM the VPS. Only run them if the user explicitly asks.
- If you suspect a type error, describe it in text — do not run a type check to confirm.

---

## Architecture rules

- Do not hardcode business-specific logic in commands — use `getProvider(business)` via `IBusinessProvider`.
- All staff-facing responses must be ephemeral unless explicitly posting to a channel.
- All staff actions must be audit-logged via `src/services/auditService.ts`.
- Interaction session keys are random hex, not raw Discord IDs — encode them in customIds as `action_name:{sessionKey}`.
- Re-validate permissions on every button/select click, not only when the command first opens.

## Adding a new business

1. Add it to `src/config/businesses.config.ts` (for `/lookup`, `/business`, standing, notes).
2. Add it to `src/config/employee-businesses.config.ts` (for `/employee` role management).
3. Run `pnpm db:seed` to sync to the database.
4. Run `NODE_ENV=production pnpm scan:roles` to verify all role names exist in the server.

## Adding a new command

1. Create `src/commands/yourCommand.ts` — export `data` (SlashCommandBuilder) and `execute`.
2. Register it in `src/bot/registerCommands.ts`.
3. Route it in `src/bot/events/interactionCreate.ts`.
4. Run `pnpm commands:deploy` to push to Discord.
5. Update `CHANGELOG.md`.
