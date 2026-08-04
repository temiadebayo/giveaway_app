# Database Migrations

**This directory is the schema.** Not a description of it, not a partial record of it —
the schema. A fresh Supabase project running these five files in order is identical to
production.

That was not true before 2026-08-03. The database had been built by pasting ~43 loose
`fix_*.sql` files into the SQL editor over several months, in an order nobody recorded.
The live schema had drifted so far from those files that `fps_events` did not exist,
`guest_participants.is_winner` did not exist, and `combined_leaderboard` had a different
shape than its source file claimed. Each gap only surfaced when a migration failed
against it. The database was dropped and rebuilt from these files to end that.

## Rules

1. **Never edit an applied migration.** Write a new one.
2. **Every migration is idempotent** (`if not exists`, `create or replace`, guarded
   `do $$` blocks) and wrapped in `begin`/`commit`, so a failure rolls back cleanly.
3. **Every `security definer` function pins `search_path`.** Without it, unqualified
   names resolve against the *caller's* search_path, which is a privilege escalation
   path. CI enforces this.
4. **Never grant a blanket privilege.** Grant the narrowest column/row/function
   privilege that works. `grant all on public.<table>` to a client role is what produced
   the original vulnerabilities; CI rejects it.
5. **Clients read, RPCs write.** No client role gets INSERT/UPDATE/DELETE on a money or
   gameplay table.
6. **A new function is `PUBLIC`-executable by default.** Postgres does that
   automatically. Any migration that creates one must revoke it — see the sweep at the
   end of `00000000000003_security.sql`.

## Applying

In the Supabase SQL Editor, in filename order, one file at a time, checking each result
before moving on:

```
00000000000000_reset.sql              ⚠️  DESTRUCTIVE — drops the whole public schema
00000000000001_schema.sql                 tables, indexes, views
00000000000002_functions.sql              functions and triggers
00000000000003_security.sql               RLS, grants, realtime, storage
00000000000004_seed.sql                   backfill + admin roster  (EDIT THE ADMIN EMAIL FIRST)
20260804090000_scheduled_finalization.sql pg_cron: end due rounds, expire dead lobbies
20260804100000_service_role_grants.sql    service_role table privileges
```

Then run `../checks/verify_security.sql`. Every row must say PASS.

**Note on `service_role`:** dropping the schema also drops Supabase's stored default
privileges, which is why `20260804100000` exists. `service_role` has BYPASSRLS, but that
skips row *policies* only — it does not skip GRANT. Privilege and row access are
independent gates, so the service key needs table grants like any other role. Any future
rebuild must run that file too.

`00000000000000_reset.sql` deletes all application data. Take a backup first:

```bash
pg_dump "postgres://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres" \
    --schema=public --file=pre_reset_backup.sql
```

It leaves the `auth` schema alone, so existing logins keep working — `00000000000004_seed.sql`
backfills their profiles and wallets, and contains a commented-out line for wiping
accounts too if you want a genuinely empty system.

## Layout

```
migrations/
  00000000000000_reset.sql … 00000000000004_seed.sql   the schema
  _superseded/                                          historical, do not run
checks/
  verify_security.sql                                   read-only assertions
audits/
  phase0_exposure_audit.sql                             read-only forensics
```

`_superseded/` holds the incremental Phase 0 and Phase 1 hardening migrations. Everything
in them is folded into the five baseline files. They are kept because their comments
record *why* each control exists — the specific vulnerability each one closed — which the
consolidated files reference but do not re-explain in full.

The loose `supabase/*.sql` files one level up are the original pre-rebuild scripts. They
are dead. Running any of them will re-open vulnerabilities the baseline closes.

## What the security model is

Two layers, and both are load-bearing:

- **GRANTs** decide which tables and *columns* a role may touch at all.
- **RLS** decides which *rows* within those.

The pre-rebuild database had reasonable RLS undermined by `grant all`. RLS cannot save
you once a role holds UPDATE on a column it should never write — which is how any user
could set their own `wallets.balance`, or set `profiles.is_host = true` and become an
admin.

Specific consequences worth knowing when debugging:

- `profiles` has permissive **row** visibility but restrictive **column** grants. Private
  fields (email, phone, bank details, trust score) come from `get_my_profile()`, which
  takes no argument so there is no user_id to tamper with.
- A guest is identified by `guest_sessions`, authenticated by a token whose SHA-256 hash
  is all the database stores. Device fingerprints are a fraud signal only — they are
  observable, so they can never authorise anything.
- Scores are computed by `score_tap_run()` from submitted tap timings. The client's own
  score is recorded as a claim and compared, never trusted.

**If something returns empty or 401 after a change, check the grant before the policy.**
That inversion is the most common source of confusion here.
