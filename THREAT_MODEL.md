# Otterbot — Threat Model

Modelled as if internet-adjacent and hostile-user-exposed (untrusted Discord users,
a shared Redis bus, an external PII API). Discord authenticates user identity, but
any user in a guild can attempt to click components and run commands.

## Assets

| Asset | Sensitivity | Where |
|---|---|---|
| Customer/character PII (CSN, DOB, phone, bank) | High | MKE/Euphoric API; rendered into Discord embeds |
| Staff authority (hire/fire/promote, DB ownership) | High | `business_owners`, `business_role_mappings`, Discord roles |
| `BOTPANEL_RPC_SECRET` (RPC HMAC key) | Critical | bot env; shared with botpanel |
| `EUPHORIC_API_KEY`, `GITHUB_TOKEN`, `DISCORD_BOT_TOKEN` | Critical | bot env |
| Postgres data (standings, notes, audit logs) | Medium-High | `db-otter` on `botpanel-net` |
| VPS SSH key | Critical | GitHub Actions secret |

## Trust boundaries

1. **Discord ↔ bot** — every interaction is untrusted input from an authenticated-but-untrusted user. Public (non-ephemeral) messages can be clicked by *anyone* who can see them (the OB-03 vector).
2. **Redis `cmd.otter.*` ↔ bot** — any process on `botpanel-net` holding `BOTPANEL_RPC_SECRET` can drive privileged verbs. HMAC + replay window authenticate "from the panel"; per-actor authorization is inconsistent (OB-D1/OB-D2).
3. **Bot ↔ MKE API** — responses are untrusted (player-controlled names) and PII-bearing.
4. **Bot ↔ GitHub** — `/report` writes untrusted modal text into issues (safely, via JSON body).
5. **CI ↔ VPS** — the deploy job holds the SSH key and pushes to prod (now SHA-pinned, deny-all default perms).

## Attackers & abuse cases

| Attacker | Capability | Relevant finding |
|---|---|---|
| Low-priv staff / guild member | Click any public component; run "any-staff" commands | OB-03 (ticket PII), OB-10 (roster bleed), OB-17 (`/business` spam) |
| Malicious in-game name | Control `character.name` returned by MKE | OB-01/OB-02 (markdown/link injection → phishing in public posts) |
| Holder of `BOTPANEL_RPC_SECRET` / panel auth gap / compromised container on `botpanel-net` | Publish valid HMAC envelopes | **OB-D1** (promote self/anyone to owner), OB-D2 (post to any channel, enumerate guild, mass role reconcile), OB-05 (report flooding) |
| Replay attacker on Redis | Capture + replay envelopes | Mitigated for `cmd.otter.*` (30 s window + dedupe); invalidate bus has no replay window (cache-clear only) |
| Sudo user with stale/forged select | Tamper portal select values | OB-09 (cross-business mapping delete) |
| Supply-chain (moved action tag / compromised dep) | Run code in CI with secrets | OB-12 (SHA-pinning), OB-13 (script-injection), OB-15 (secret scan), OB-16 (dep CVE) |
| Operator error / schema drift | Clean deploy or bad diff | OB-D3 (broken `/lookup`, `push --force` data drop) |

## Attack paths (highest blast radius first)

1. **RPC privilege escalation (OB-D1).** `cmd.otter.employee.promote` with a valid HMAC → `addBusinessOwner(...)` → effective `owner` everywhere. Blast radius: full staff-management takeover of any business. Gate: secret secrecy + private network only.
2. **Public PII disclosure (OB-03, fixed).** Ticket channel viewer → public select → CSN/phone/bank embed. Blast radius: per-customer PII to non-staff in the ticket.
3. **Staff phishing (OB-01, fixed).** Crafted character name → attacker link in a Send-to-Channel broadcast → staff/channel click. Blast radius: credential phishing of staff.
4. **Arbitrary channel spoofing / enumeration (OB-D2).** `oc.stock_post`/`caked.message_post`/`meta.*` with valid HMAC. Blast radius: spoofed official cards, guild enumeration, role-reconcile DoS.
5. **CI → VPS (mitigated).** Moved third-party action tag → code exec with the VPS SSH key. Now SHA-pinned.

## High-risk components

- `src/services/rpc/handlers/employee.ts` (OB-D1) — privileged, HMAC-only.
- `src/services/rpcServer.ts` / `src/utils/hmac.ts` — the trust-boundary verifier (sound; now tested).
- `src/interactions/selects/ticketCharSelect.ts` (OB-03, fixed) — public PII surface.
- `src/embeds/customerEmbed.ts` (OB-01, fixed) — public broadcast of API strings.
- `scripts/docker-entrypoint.sh` (OB-D3) — runs `push --force` against prod DB at boot.

## Controls that held up (do not regress)

Global `allowedMentions:{parse:[]}`; CSPRNG session keys with TTL + read-time expiry; HMAC constant-time compare + 30 s replay window + request-id dedupe; parameterised Drizzle (no SQLi); `http(s)`-only URL validation; audit-log + logger PII redaction; per-click `resolveBusinesses` re-validation on the in-Discord handlers.
