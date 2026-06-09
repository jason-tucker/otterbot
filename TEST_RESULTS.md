# Otterbot — Test Results

## Environment & constraints

- `node_modules` was absent at review start; `pnpm install --frozen-lockfile` succeeded.
- Per `CLAUDE.md`, **TypeScript compilation was NOT run** (`tsc`/`pnpm typecheck`/`pnpm build` OOM the VPS). Type correctness was assessed by code review and by matching existing patterns; the runtime tests below were executed.
- **No live end-to-end run**: the bot requires a live Discord gateway + Postgres + Redis, none available in the sandbox, and it has no HTTP surface to DAST. Per the operator's decision, verification is unit + regression tests plus code review. Interaction-coupled handlers (ticket select, portal, roster) were verified by code review against the already-tested permission predicates they reuse.

## Commands run

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ pass | deps installed |
| `pnpm install` (after vitest bump) | ✅ pass | lockfile updated to vitest 3.2.6; pnpm blocked esbuild build scripts (expected) |
| `pnpm test` (`vitest run`) | ✅ **71 passed (7 files)** | full suite, final |
| `pnpm exec vitest run src/embeds/embedEscaping.test.ts src/utils/escape.test.ts` | ✅ 13 passed | OB-01/02 regression |
| `pnpm exec vitest run src/utils/validators.test.ts` | ✅ 7 passed | OB-06/URL-scheme |
| `pnpm exec vitest run src/utils/hmac.test.ts` | ✅ 6 passed | OB-18 trust boundary |
| `tsc` / `pnpm build` | ⛔ not run | project rule (OOM); not run |

## Final suite output

```
 RUN  v3.2.6
 ✓ src/utils/hmac.test.ts (6 tests)
 ✓ src/utils/validators.test.ts (7 tests)
 ✓ src/embeds/embedEscaping.test.ts (4 tests)
 ✓ src/services/employeeService.test.ts (28 tests)
 ✓ src/utils/escape.test.ts (9 tests)
 ✓ src/services/providers/IBusinessProvider.test.ts (8 tests)
 ✓ src/services/permissionService.test.ts (9 tests)

 Test Files  7 passed (7)
      Tests  71 passed (71)
```

## Test inventory & verdict

| File | Tests | What it covers | Verdict |
|---|---|---|---|
| `services/permissionService.test.ts` | 9 | `hasMinRank` full rank matrix | pre-existing, real |
| `services/employeeService.test.ts` | 28 | hire/fire/promote/demote authorization predicates incl. sudo bypass | pre-existing, real (strongest) |
| `utils/escape.test.ts` | 9 | `safeInlineCode` / `safeMarkdown` / `safeMarkdownLinkLabel` | pre-existing, real |
| `services/providers/IBusinessProvider.test.ts` | 8 | marker label/emoji mapping | pre-existing, weak (display only) |
| `embeds/embedEscaping.test.ts` | 4 | **new** — builders actually apply the escapers (OB-01/02) | added |
| `utils/validators.test.ts` | 7 | **new** — `javascript:`/`data:` rejection, snowflake bounds (OB-06) | added |
| `utils/hmac.test.ts` | 6 | **new** — RPC HMAC sign/verify, constant-time compare, tamper detection (OB-18) | added |

**No fake/trivial tests found** (no `expect(true).toBe(true)`, no tests-of-mocks). The two `vi.mock` calls in the pre-existing tests only stub `db/client` + `config/env` so the pure predicates can be imported.

## Coverage gaps that remain (verified by review, not automated tests)

- `resolveBusinesses` (DB-coupled) — the core auth function; exercised indirectly by the predicate tests.
- Interaction-coupled handlers (`ticketCharSelect` OB-03, `portalSelect` OB-09, `businessEmployeeSelect` OB-10) — logic mirrors the already-tested `/lookup` gate and `hasMinRank`; verified by code review.
- RPC replay-window / dedupe in `rpcServer.ts` — the HMAC primitive it relies on is now tested; the surrounding timing logic is review-only.
