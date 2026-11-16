#!/bin/sh
set -e

echo "Applying database migrations..."
# Tracked, reviewed SQL migrations only (src/db/migrations). Exits non-zero on any
# failure, and `set -e` then stops the container before the bot starts.
node dist/db/migrate.js

echo "Starting Otterbot..."
exec node dist/index.js
