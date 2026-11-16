#!/usr/bin/env bash
# OB-D3 schema drift check. drizzle-kit 0.31 `generate` exits 0 even when it
# fails (and a rename/ambiguous-column prompt is rejected without a TTY, writing
# nothing), so the exit code is useless. Instead require the exact "nothing to
# migrate" message and a clean git tree.
set -euo pipefail

export DATABASE_URL="${DATABASE_URL:-postgresql://placeholder:placeholder@localhost:5432/placeholder}"

out="$(pnpm db:generate --name ci_drift 2>&1 < /dev/null || true)"
printf '%s\n' "$out"

if ! printf '%s\n' "$out" | grep -qF 'No schema changes, nothing to migrate'; then
  echo "::error::Schema drift check failed: drizzle-kit did not report 'No schema changes, nothing to migrate'. src/db/schema changed without a migration (or drizzle-kit needs an interactive answer, e.g. a rename). Run 'pnpm db:generate --name <short_name>' locally, review the SQL, and commit it."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "::error::Working tree is dirty after the drift check:"
  git status --porcelain
  exit 1
fi
echo "No schema drift."
