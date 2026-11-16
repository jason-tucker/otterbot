-- Marks 0000_baseline.sql as already applied on a database that was built by
-- `drizzle-kit push` (all 11 application tables exist). It changes NOTHING in
-- the public schema: it only creates the drizzle bookkeeping table (if missing)
-- and inserts one row. Idempotent: running it again is a no-op.
--
--   psql -v ON_ERROR_STOP=1 -X -f scripts/db/baseline-mark-applied.sql
--
-- hash  = sha256 of src/db/migrations/0000_baseline.sql
-- when  = meta/_journal.json entries[0].when
-- Both are verified against the real files by src/db/migrations.test.ts.
BEGIN;

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY[
    'audit_logs', 'business_buttons', 'business_messages', 'business_owners',
    'business_role_mappings', 'businesses', 'lookup_sessions', 'notes',
    'oc_stock', 'report_sessions', 'standings'
  ]) AS t
  WHERE to_regclass('public.' || t) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing to mark baseline applied: missing tables: %', missing;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '023328590e41d9fbfcb35d593db815fe17b8905ac132da15c113d141c07b7a32', 1794789505531
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at >= 1794789505531
);

COMMIT;
