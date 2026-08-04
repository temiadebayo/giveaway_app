-- =============================================================================
-- PHASE 0 / 5 of 5 — PRIVILEGE LOCKDOWN
--
-- MUST RUN LAST. It re-grants EXECUTE on the RPCs created in migrations 3 and 4;
-- run it before them and the grants silently target nothing.
--
-- Undoes the damage from:
--   fix_wallet_permissions.sql      grant all on wallets, wallet_transactions,
--                                   withdrawal_requests to anon, authenticated
--   fix_postgrest_permissions.sql   grant all on profiles, device_fingerprints,
--                                   user_devices, trust_events, fraud_alerts,
--                                   giveaways, giveaway_participants, escrow
--                                   to anon, authenticated
--   fix_permissions.sql             grant select,insert,update,delete on giveaways,
--                                   giveaway_participants, guest_participants to anon
--   setup_kyc*.sql                  grant all on kyc_requests to anon
--
-- Fixes P0-1 (self-credit wallet balance), P0-2 (self-promote to admin),
-- P0-3 (PUBLIC execute on every security definer function) and P0-4 (anon rewriting
-- any guest's score).
-- =============================================================================

begin;

-- =============================================================================
-- SECTION A — function privileges
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and nothing in the
-- legacy SQL ever revoked it. Every security definer function was therefore callable
-- by any anonymous visitor.
--
-- This does NOT use "revoke all on all functions in schema public from public":
-- uuid-ossp and pgcrypto are installed into public, and uuid_generate_v4() /
-- gen_random_uuid() are used as column DEFAULTs. Column defaults are evaluated with
-- the *inserting* user's privileges, so a blanket revoke would break every insert
-- performed by anon and authenticated. The loop below skips extension-owned functions.
-- =============================================================================

do $$
declare
    r record;
begin
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and not exists (
              select 1 from pg_depend d
              where d.objid = p.oid
                and d.classid = 'pg_proc'::regclass
                and d.deptype = 'e'          -- owned by an extension: leave alone
          )
    loop
        execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    end loop;
end $$;

-- Re-grant, explicitly, one at a time. Anything not listed here is unreachable
-- from the browser — which is the point.

-- Needed by anon: RLS policies on several tables call is_admin(), and policy
-- expressions are evaluated with the invoker's privileges, so the invoker needs
-- EXECUTE on it or the policy errors out.
grant execute on function public.is_admin(uuid)        to anon, authenticated;
grant execute on function public.get_fee_schedule()    to anon, authenticated;

-- complete_giveaway is reachable by anon because the end-of-round fallback fires from
-- whichever client has the tab open, including guests. It is safe now: migration 3
-- requires host/admin to end early, and lets anyone else end it only once ends_at
-- has genuinely passed.
grant execute on function public.complete_giveaway(uuid) to anon, authenticated;

grant execute on function public.ensure_wallet()                       to authenticated;
grant execute on function public.get_my_profile()                      to authenticated;
grant execute on function public.join_giveaway(uuid, text)             to authenticated;
grant execute on function public.submit_score(uuid, integer, integer, integer) to authenticated;
grant execute on function public.cancel_giveaway(uuid)                 to authenticated;
grant execute on function public.claim_prize(uuid)                     to authenticated;
grant execute on function public.start_giveaway_event(uuid)            to authenticated;
grant execute on function public.request_deposit(numeric)              to authenticated;
grant execute on function public.request_withdrawal(numeric, jsonb)    to authenticated;
grant execute on function public.link_guest_to_user(text)              to authenticated;
grant execute on function public.mark_all_notifications_read()         to authenticated;
grant execute on function public.recalculate_trust_score()             to authenticated;
grant execute on function public.sync_phone_verification()             to authenticated;
grant execute on function public.register_device(text, text, jsonb, text, text, integer) to authenticated;
grant execute on function public.create_giveaway_with_escrow(
    text, text, numeric, text, integer, text, integer, timestamptz, boolean, integer, integer
) to authenticated;

-- Admin RPCs: server-side only. The admin panel calls these through service_role,
-- never from the browser. They also check is_admin() internally — defence in depth.
grant execute on function public.approve_deposit(uuid)          to service_role;
grant execute on function public.reject_deposit(uuid, text)     to service_role;
grant execute on function public.approve_withdrawal(uuid)       to service_role;
grant execute on function public.reject_withdrawal(uuid, text)  to service_role;
grant execute on function public.approve_kyc_request(uuid)      to service_role;
grant execute on function public.reject_kyc_request(uuid, text) to service_role;
grant execute on function public.log_admin_action(text, text, uuid, numeric, text, jsonb) to service_role;

-- =============================================================================
-- SECTION B — money tables: read-only from the browser
--
-- P0-1. Every write here now goes through an RPC that locks rows and validates.
-- =============================================================================

revoke all on public.wallets              from anon, authenticated;
revoke all on public.wallet_transactions  from anon, authenticated;
revoke all on public.withdrawal_requests  from anon, authenticated;
revoke all on public.escrow               from anon, authenticated;

-- Row visibility is still restricted to the owner by the existing RLS policies.
grant select on public.wallets             to authenticated;
grant select on public.wallet_transactions to authenticated;
grant select on public.withdrawal_requests to authenticated;
grant select on public.escrow              to authenticated;

-- The legacy INSERT policy let a client forge a withdrawal_request directly, skipping
-- the balance deduction, the tier limit and the hold period entirely.
drop policy if exists "Users can create withdrawals" on public.withdrawal_requests;

-- Same for wallets: with a blanket INSERT grant, a new user could open their account
-- with a balance of their choosing.
drop policy if exists "Users can insert own wallet" on public.wallets;
drop policy if exists "Users can update own wallet" on public.wallets;

-- =============================================================================
-- SECTION C — profiles: column-level writes
--
-- P0-2. The blanket UPDATE grant let a user set is_host (which was the admin check),
-- trust_score, trust_tier, id_verified, withdrawal_limit and total_winnings on
-- themselves. SELECT privileges were already narrowed in migration 2.
-- =============================================================================

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;

grant insert (id, email, username, display_name, avatar_url) on public.profiles to authenticated;

-- The user-editable column set, matching what settings/, terms/ and the lobby rename
-- actually write. Everything else is server-owned.
do $$
declare
    v_cols text[] := array[
        'username', 'display_name', 'avatar_url', 'phone',
        'bank_name', 'account_name', 'account_number',
        'notification_preferences', 'privacy_settings',
        'accepted_tos', 'updated_at'
    ];
    v_present text[];
    c text;
begin
    -- bio is referenced by the trust engine but may not exist yet; grant only what is there.
    foreach c in array v_cols || array['bio'] loop
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'profiles' and column_name = c
        ) then
            v_present := v_present || c;
        end if;
    end loop;

    execute format(
        'grant update (%s) on public.profiles to authenticated',
        (select string_agg(quote_ident(x), ', ') from unnest(v_present) x)
    );
end $$;

-- Changing a phone number must invalidate its verified status, otherwise a user can
-- verify one number, bank the +20 trust score, then swap in a different number.
create or replace function public.reset_phone_verification_on_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.phone is distinct from old.phone then
        new.phone_verified := false;
    end if;
    return new;
end;
$$;

-- Created after the revoke sweep in Section A, so it carries the default PUBLIC EXECUTE
-- grant that Postgres attaches to every new function. Revoke it explicitly.
-- (A trigger does not need EXECUTE on its function to fire — the grant is pure surface.)
revoke all on function public.reset_phone_verification_on_change() from public, anon, authenticated;

drop trigger if exists on_phone_change_reset_verification on public.profiles;
create trigger on_phone_change_reset_verification
    before update of phone on public.profiles
    for each row execute function public.reset_phone_verification_on_change();

-- =============================================================================
-- SECTION D — gameplay tables
--
-- P0-4. guest_participants had "for update using (linked_user_id = auth.uid()
-- or auth.uid() is null)" together with an UPDATE grant to anon — i.e. any anonymous
-- visitor could rewrite any guest's score on any giveaway, or zero out the leader.
-- =============================================================================

revoke all on public.giveaways             from anon, authenticated;
revoke all on public.giveaway_participants from anon, authenticated;
revoke all on public.guest_participants    from anon, authenticated;

grant select on public.giveaways             to anon, authenticated;
grant select on public.giveaway_participants to anon, authenticated;
grant select on public.guest_participants    to anon, authenticated;

-- Guest writes happen exclusively through the /api/giveaways/[id]/guest-join route,
-- which uses service_role. No client-side path remains.
drop policy if exists "Guests can update own participation" on public.guest_participants;
drop policy if exists "Anyone can join as guest"            on public.guest_participants;

-- Participant writes now go through join_giveaway() / submit_score().
drop policy if exists "Users can manage own participation"  on public.giveaway_participants;
drop policy if exists "Users can update own participation"  on public.giveaway_participants;

-- Giveaway writes go through create_giveaway_with_escrow() / start_giveaway_event() /
-- cancel_giveaway() / complete_giveaway(). Dropping these also closes a quieter hole:
-- a host could previously UPDATE prize_amount on a live giveaway after players joined.
drop policy if exists "Hosts can insert giveaways"     on public.giveaways;
drop policy if exists "Hosts can update own giveaways" on public.giveaways;
drop policy if exists "Hosts can delete own giveaways" on public.giveaways;
drop policy if exists "Hosts can manage own giveaways" on public.giveaways;

-- =============================================================================
-- SECTION E — fraud / trust tables
-- =============================================================================

revoke all on public.device_fingerprints from anon, authenticated;
revoke all on public.user_devices        from anon, authenticated;
revoke all on public.trust_events        from anon, authenticated;
revoke all on public.fraud_alerts        from anon, authenticated;

-- Writes go through register_device().
grant select on public.user_devices to authenticated;
grant select on public.trust_events to authenticated;

-- This policy allowed anyone to modify any fingerprint record, including clearing
-- is_flagged on a device the fraud system had marked.
drop policy if exists "Service role can manage fingerprints" on public.device_fingerprints;

-- trustService.getUserDevices() embeds device_fingerprints(fingerprint_hash) to render
-- the user's device list, so a narrow read path is needed. Rows are limited to devices
-- linked to the caller, and the moderation columns (is_flagged, flag_reason) are not
-- granted — a user must not be able to tell whether their device has been flagged, and
-- must not be able to enumerate other people's fingerprint hashes.
create policy "Users can view fingerprints of their own devices" on public.device_fingerprints
    for select using (
        exists (
            select 1 from public.user_devices ud
            where ud.fingerprint_id = device_fingerprints.id
              and ud.user_id = auth.uid()
        )
    );

grant select (
    id,
    fingerprint_hash,
    confidence,
    first_seen_at,
    last_seen_at,
    times_seen
) on public.device_fingerprints to authenticated;

-- =============================================================================
-- SECTIONS F/G/H — optional tables
--
-- These three come from feature migrations that may not have been applied yet on a
-- given environment. A bare `revoke ... on public.fps_events` aborts the whole
-- transaction with 42P01 when the table is missing, which is exactly what happened on
-- the first run of this migration: fps_events.sql had been written but never applied.
--
-- Each block is therefore guarded on existence. A missing optional table is skipped
-- with a notice rather than taking the entire lockdown down with it — the money-table
-- revokes above are what must not be silently skipped, and those are unguarded on purpose.
-- =============================================================================

-- SECTION F — KYC
do $$
begin
    if to_regclass('public.kyc_requests') is null then
        raise notice 'SKIPPED: public.kyc_requests does not exist';
    else
        revoke all on public.kyc_requests from anon, authenticated;
        grant select, insert on public.kyc_requests to authenticated;
    end if;
end $$;

-- SECTION G — notifications
--
-- The INSERT policy was "with check (true)" with an INSERT grant to authenticated,
-- so any user could write a notification into any other user's feed — a ready-made
-- phishing surface ("Your withdrawal failed, click here").
--
-- Notifications are written by security definer functions (which run as the owner)
-- and by service_role. No client-side insert path remains.
do $$
begin
    if to_regclass('public.notifications') is null then
        raise notice 'SKIPPED: public.notifications does not exist';
    else
        revoke all on public.notifications from anon, authenticated;
        grant select on public.notifications to authenticated;
        grant update (is_read) on public.notifications to authenticated;

        drop policy if exists "System insert notifications" on public.notifications;
    end if;
end $$;

-- SECTION H — FPS event log
--
-- Created by 20260802120350_phase0_fps_events.sql. Admins read the dashboard through
-- service_role, but the SELECT grant is kept so the is_admin() RLS policy remains
-- usable from an authenticated session too.
do $$
begin
    if to_regclass('public.fps_events') is null then
        raise notice 'SKIPPED: public.fps_events does not exist — run 20260802120350 first';
    else
        revoke all on public.fps_events from anon, authenticated;
        grant select on public.fps_events to authenticated;
    end if;
end $$;

-- =============================================================================
-- SECTION I — admin tables and public views
-- =============================================================================

revoke all on public.admin_users     from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_users     to authenticated;  -- RLS: admins only
grant select on public.admin_audit_log to authenticated;  -- RLS: admins only

grant select on public.combined_leaderboard to anon, authenticated;
grant select on public.public_profiles      to anon, authenticated;

-- =============================================================================
-- SECTION J — private by default from here on
--
-- Supabase's default privileges grant new tables to anon and authenticated
-- automatically. That default is how this codebase ended up with `grant all` on its
-- money tables in the first place.
--
-- NOTE FOR FUTURE MIGRATIONS: a table you create from now on will NOT be readable by
-- the client until you grant it explicitly. That is intentional. If a new feature
-- returns an empty result or a 401, check the grant before checking the RLS policy.
-- =============================================================================

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- Tell PostgREST to pick up the new privilege set immediately.
notify pgrst, 'reload schema';

commit;

select 'Phase 0 / 5 of 5 — privileges locked down. Run the verify migration next.' as result;
