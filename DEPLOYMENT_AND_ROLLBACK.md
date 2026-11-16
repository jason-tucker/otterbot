# Otterbot — Deployment & Rollback

## Deployment status: NOT deployed (by design)

No production or staging deploy was performed. Reasons:
- Production deploy was not authorised, and the prompt's safety rules forbid it without explicit approval + passing gates + a confirmed target.
- There is **no staging environment**, and the bot has no HTTP surface, so DAST/smoke against a running target was not possible.
- The fixes live on branch `claude/clever-fermi-5nxy2j` as atomic, reviewable commits, to be delivered as a single PR.

## How production deploy actually works (for context)

`CLAUDE.md` + `deploy.yml`: push to `main` → CI builds `ghcr.io/jason-tucker/otterbot:<sha>` and `:latest` → the VPS runs watchtower (polls GHCR every ~30 s) **and** the deploy job SSHes in to `git reset --hard origin/main` + `docker compose pull && up -d`. The bot runs as docker compose service `otterbot-otterbot-1`. There is no blue/green or staging stage.

## Safe rollout of THIS branch

1. Open a PR from `claude/clever-fermi-5nxy2j` → `main`. The `Deploy Otterbot` workflow runs **build + validate on the PR** (no push, no VPS touch) and the new `Security Scan` workflow runs gitleaks + dependency-review.
2. Review the diff. None of the committed changes alter the DB schema or the panel's RPC contract, so they are safe to merge without coordinating a botpanel release.
3. Merge → CI builds → watchtower/SSH deploy → the container now runs as `USER node`.
4. Post-deploy checks:
   - `docker logs otterbot-otterbot-1 --tail 30` — confirm clean boot, no permission errors from the non-root switch, RPC subscriber connected.
   - Confirm the Uptime Kuma monitor is still green (60 s heartbeat).
   - Smoke: run `/lookup`, `/business`, and a Send-to-Channel; confirm embeds render and the `/business` cooldown message appears on rapid re-run.

## Rollback

All fixes are independent commits with no migration or contract change:

- **Whole branch:** don't merge / revert the merge commit; watchtower redeploys the previous `:latest`.
- **Single fix:** `git revert <sha>` (e.g. revert `9529dc6` to go back to a root container) and redeploy. No DB or data implications.
- **Image-level:** re-pull a previous `ghcr.io/jason-tucker/otterbot:sha-<prev>` digest and `docker compose up -d` (save the current digest before deploying: `docker compose images otterbot`).

The only change with any runtime-environment implication is OB-14 (`USER node`). If the non-root switch ever surfaces a file-permission issue, revert `9529dc6`; the rest are pure code/CI/test changes.

## Before applying the document-only items (OB-D1/D2/D3)

These are **separate, follow-up** work (see `REMEDIATION_PLAN.md`) and must not be deployed casually:

- **OB-D1/OB-D2 (RPC actor authz):** verify botpanel sends `actorUserId` on the affected verbs; roll out behind `RPC_ENFORCE_ACTOR` warn-only first, watch logs, then enforce. Rollback = unset the flag.
- **OB-D3 (migration drift / `push --force`):** addressed on branch `fix/schema-migrations`. **Before the first deploy of it, run the one-time production steps P0-P5 in `docs/DEPLOYMENT.md`** (backup, read-only checks, baseline marker). Without the marker the new entrypoint refuses to start the bot. Rollback = pin the previous image (`BOT_IMAGE=...:sha-<prev>`); the marker row is harmless to the old image. **A pre-OB-D3 image is a safe rollback target only while the migration journal holds just the baseline**: its boot-time `push --force` would treat any later migration's changes as drift and may drop them. **A pre-OB-D3 image is a safe rollback target only while the migration journal holds just the baseline**: its boot-time `push --force` would treat any later migration's changes as drift and may drop them.
