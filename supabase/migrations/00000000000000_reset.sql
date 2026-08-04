-- =============================================================================
-- 00 — RESET
--
-- ⚠️  DESTRUCTIVE AND IRREVERSIBLE. READ THIS BEFORE RUNNING.
--
-- Drops the entire `public` schema: every table, every row, every function, view,
-- trigger and policy. All wallet balances, transaction history, giveaways, KYC
-- submissions and guest records are permanently deleted.
--
-- TAKE A BACKUP FIRST:
--   Supabase Dashboard -> Database -> Backups -> and/or
--   pg_dump "postgres://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
--       --schema=public --file=pre_reset_backup.sql
--
-- WHY THIS EXISTS
--   The database was built by pasting ~43 loose fix_*.sql files into the SQL editor in
--   an unknown order over several months. The live schema no longer matches what any
--   file describes — fps_events was never created, guest_participants.is_winner was
--   never added, combined_leaderboard had a different shape than its source file. Each
--   mismatch only surfaced when a migration failed against it.
--
--   Rebuilding from a single known definition ends that entire class of problem. From
--   here, the migrations directory IS the schema, and a fresh environment can be stood
--   up from scratch and be identical to production.
--
-- WHAT THIS DOES *NOT* TOUCH
--   The `auth`, `storage`, `realtime` and `extensions` schemas are managed by Supabase
--   and are left alone. In particular auth.users survives, so existing logins keep
--   working — see 00000000000004_seed.sql, which backfills profiles and wallets for
--   them, and which also contains the option to wipe accounts too if you want a
--   genuinely empty system.
--
-- RUN ORDER
--   00000000000000_reset.sql        <-- you are here
--   00000000000001_schema.sql
--   00000000000002_functions.sql
--   00000000000003_security.sql
--   00000000000004_seed.sql
--   then supabase/migrations/20260802120500_phase0_verify.sql to confirm.
-- =============================================================================

-- Storage policies live in the `storage` schema but reference public.is_admin(), so they
-- are dropped explicitly here. They are recreated in 00000000000003_security.sql.
drop policy if exists "Users can upload their own KYC docs" on storage.objects;
drop policy if exists "Users can view their own KYC docs"   on storage.objects;
drop policy if exists "Admins can view all KYC docs"        on storage.objects;
drop policy if exists "Admins can delete KYC docs"          on storage.objects;

-- Realtime publication membership is dropped along with the tables, but the publication
-- itself is owned by Supabase and must survive.
drop schema if exists public cascade;

create schema public;
alter schema public owner to postgres;

comment on schema public is
    'Application schema. Defined entirely by supabase/migrations/ — do not create objects '
    'here by hand.';

-- USAGE only for the client roles. The Supabase default is `grant all on schema public`,
-- which includes CREATE — that would let any authenticated user create objects in the
-- schema. They only need to reach objects, not add them.
grant usage  on schema public to anon, authenticated;
grant all    on schema public to postgres, service_role;

-- Private by default. Any table or function created from here on is unreachable by the
-- client until explicitly granted, which is the opposite of the posture that produced
-- `grant all on public.wallets to anon`.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

select 'Reset complete. public schema is empty. Run 00000000000001_schema.sql next.' as result;
