-- =============================================================================
-- 03 — SECURITY: RLS, grants, realtime, storage
--
-- The whole authorization model in one file, so it can be reviewed as a unit rather
-- than reconstructed from a dozen scattered `grant` statements.
--
-- The rule that governs everything here: CLIENTS READ, RPCs WRITE. No client role has
-- INSERT/UPDATE/DELETE on any money or gameplay table. The only exceptions are a small
-- column-level UPDATE grant on profiles (a user editing their own display name) and
-- notifications.is_read.
--
-- Two layers, and both matter:
--   * GRANTs decide which tables and columns a role can touch at all.
--   * RLS decides which ROWS within those.
-- The pre-reset database had correct-ish RLS undermined by `grant all` — RLS cannot
-- save you once a role holds UPDATE on a column it should never write.
-- =============================================================================

begin;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles              enable row level security;
alter table public.admin_users           enable row level security;
alter table public.admin_audit_log       enable row level security;
alter table public.device_fingerprints   enable row level security;
alter table public.user_devices          enable row level security;
alter table public.trust_events          enable row level security;
alter table public.fraud_alerts          enable row level security;
alter table public.wallets               enable row level security;
alter table public.wallet_transactions   enable row level security;
alter table public.withdrawal_requests   enable row level security;
alter table public.escrow                enable row level security;
alter table public.giveaways             enable row level security;
alter table public.giveaway_participants enable row level security;
alter table public.guest_sessions        enable row level security;
alter table public.guest_participants    enable row level security;
alter table public.kyc_requests          enable row level security;
alter table public.notifications         enable row level security;
alter table public.fps_events            enable row level security;

-- --- profiles ---------------------------------------------------------------
-- Row visibility is intentionally open. Confidentiality is enforced by COLUMN grants
-- below, not here: PostgREST embeds (host:profiles!host_id(username, …)) and the
-- leaderboard join both need cross-user row access, and a restrictive row policy would
-- silently break every giveaway card.
create policy "Profiles are readable" on public.profiles
    for select using (true);

create policy "Users insert own profile" on public.profiles
    for insert with check (auth.uid() = id);

-- WITH CHECK is explicit. Postgres would fall back to reusing USING, but leaving that
-- implicit on the table that gates trust tier and payout details is not a good bet.
create policy "Users update own profile" on public.profiles
    for update using (auth.uid() = id) with check (auth.uid() = id);

-- --- admin ------------------------------------------------------------------
create policy "Admins read roster"    on public.admin_users     for select using (public.is_admin());
create policy "Admins read audit log" on public.admin_audit_log for select using (public.is_admin());
-- No write policies at all: membership and audit entries come from SQL / service_role.

-- --- devices ----------------------------------------------------------------
-- A user may see fingerprints belonging to their own devices, for the device list on
-- the trust page. Moderation columns are not granted (see below), so they cannot tell
-- whether a device has been flagged.
create policy "Users view own device fingerprints" on public.device_fingerprints
    for select using (
        exists (select 1 from public.user_devices ud
                where ud.fingerprint_id = device_fingerprints.id and ud.user_id = auth.uid()));

create policy "Users view own devices"      on public.user_devices for select using (auth.uid() = user_id);
create policy "Users view own trust events" on public.trust_events for select using (auth.uid() = user_id);
create policy "Admins view fraud alerts"    on public.fraud_alerts for select using (public.is_admin());

-- --- money ------------------------------------------------------------------
create policy "Users view own wallet"       on public.wallets             for select using (auth.uid() = user_id);
create policy "Users view own transactions" on public.wallet_transactions for select using (auth.uid() = user_id);
create policy "Users view own withdrawals"  on public.withdrawal_requests for select using (auth.uid() = user_id);
create policy "Parties view escrow"         on public.escrow              for select using (auth.uid() = host_id or auth.uid() = released_to);
-- No INSERT/UPDATE policies anywhere above. Every movement is an RPC.

-- --- giveaways --------------------------------------------------------------
create policy "View giveaways" on public.giveaways
    for select using (status in ('scheduled','live','ended','cancelled') or auth.uid() = host_id);

create policy "View participants" on public.giveaway_participants
    for select using (
        exists (select 1 from public.giveaways g
                where g.id = giveaway_id and g.status in ('scheduled','live','ended','cancelled')));

create policy "Guest participants are viewable" on public.guest_participants
    for select using (true);

-- guest_sessions has NO policy by design: clients never read it. It holds token hashes
-- and fingerprints, and is reachable only through security definer functions.

-- --- kyc / notifications / fps ----------------------------------------------
create policy "Users view own kyc"    on public.kyc_requests for select using (auth.uid() = user_id);
create policy "Admins view all kyc"   on public.kyc_requests for select using (public.is_admin());
create policy "Users submit own kyc"  on public.kyc_requests for insert with check (auth.uid() = user_id);
create policy "Admins update kyc"     on public.kyc_requests for update using (public.is_admin());

create policy "Users read own notifications"   on public.notifications for select using (auth.uid() = user_id);
create policy "Users update own notifications" on public.notifications for update using (auth.uid() = user_id);
-- No INSERT policy: the previous "with check (true)" let any user write a notification
-- into any other user's feed, which is a ready-made phishing surface.

create policy "Admins read fps_events" on public.fps_events for select using (public.is_admin());

-- =============================================================================
-- GRANTS
-- =============================================================================

-- --- profiles: column-level ---------------------------------------------------
-- Readable by anyone: the seven columns a leaderboard, giveaway card or lobby needs.
grant select (id, username, display_name, avatar_url, trust_tier, total_wins, created_at)
    on public.profiles to anon, authenticated;

-- Not granted, and reachable only via get_my_profile(): email, phone, bank_name,
-- account_name, account_number, is_banned, ban_reason, trust_score, total_winnings,
-- withdrawal_limit, id_verified, phone_verified, accepted_tos, bio,
-- notification_preferences, privacy_settings.

grant insert (id, email, username, display_name, avatar_url) on public.profiles to authenticated;

-- The user-editable set. Everything omitted here is server-owned — notably trust_score,
-- trust_tier, id_verified, phone_verified and withdrawal_limit, each of which was
-- freely self-assignable before.
grant update (
    username, display_name, avatar_url, bio, phone,
    bank_name, account_name, account_number,
    notification_preferences, privacy_settings, accepted_tos, updated_at
) on public.profiles to authenticated;

-- --- read-only tables ---------------------------------------------------------
grant select on public.wallets               to authenticated;
grant select on public.wallet_transactions   to authenticated;
grant select on public.withdrawal_requests   to authenticated;
grant select on public.escrow                to authenticated;
grant select on public.giveaways             to anon, authenticated;
grant select on public.giveaway_participants to anon, authenticated;
grant select on public.user_devices          to authenticated;
grant select on public.trust_events          to authenticated;
grant select on public.admin_users           to authenticated;  -- RLS: admins only
grant select on public.admin_audit_log       to authenticated;  -- RLS: admins only
grant select on public.fps_events            to authenticated;  -- RLS: admins only
grant select on public.notifications         to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant select, insert on public.kyc_requests  to authenticated;

-- guest_participants: fingerprint_id and linked_user_id are withheld. A fingerprint is
-- no longer a credential, but it is still a tracking identifier and clients have no use
-- for it.
grant select (id, giveaway_id, guest_session_id, guest_name, score, taps,
              best_streak, joined_at, completed_at, is_winner)
    on public.guest_participants to anon, authenticated;

-- device_fingerprints: is_flagged and flag_reason withheld.
grant select (id, fingerprint_hash, confidence, first_seen_at, last_seen_at, times_seen)
    on public.device_fingerprints to authenticated;

grant select on public.combined_leaderboard to anon, authenticated;
grant select on public.public_profiles      to anon, authenticated;

-- Nothing is granted on guest_sessions, fraud_alerts or admin write paths to any
-- client role.

-- --- functions ----------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function. Revoke across the board,
-- then re-grant deliberately. Extension-owned functions are skipped — uuid/crypto
-- helpers are used in column DEFAULTs, which are evaluated as the INSERTING role, so
-- revoking them would break every client insert.
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and not exists (select 1 from pg_depend d
                          where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
    loop
        execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    end loop;
end $$;

-- RLS policies call is_admin(); policy expressions run with the invoker's privileges,
-- so the invoker needs EXECUTE on it.
grant execute on function public.is_admin(uuid)          to anon, authenticated;
grant execute on function public.get_fee_schedule()      to anon, authenticated;
-- Reachable by anon because the end-of-round fallback fires from whichever client has
-- the tab open, including guests. Safe: non-host callers can only end a round whose
-- ends_at has already passed.
grant execute on function public.complete_giveaway(uuid) to anon, authenticated;

grant execute on function public.ensure_wallet()                                to authenticated;
grant execute on function public.get_my_profile()                               to authenticated;
grant execute on function public.join_giveaway(uuid, text)                      to authenticated;
grant execute on function public.submit_score(uuid, integer[], integer)         to authenticated;
grant execute on function public.cancel_giveaway(uuid)                          to authenticated;
grant execute on function public.claim_prize(uuid)                              to authenticated;
grant execute on function public.start_giveaway_event(uuid)                     to authenticated;
grant execute on function public.request_deposit(numeric)                       to authenticated;
grant execute on function public.request_withdrawal(numeric, jsonb)             to authenticated;
grant execute on function public.claim_guest_session(text)                      to authenticated;
grant execute on function public.mark_all_notifications_read()                  to authenticated;
grant execute on function public.recalculate_trust_score()                      to authenticated;
grant execute on function public.sync_phone_verification()                      to authenticated;
grant execute on function public.register_device(text, text, jsonb, text, text, integer) to authenticated;
grant execute on function public.create_giveaway_with_escrow(
    text, text, numeric, text, integer, text, integer, timestamptz, boolean, integer, integer) to authenticated;

-- Server-side only. These also check is_admin_or_service() internally — defence in depth,
-- because holding the service role key is what the application's requireAdmin() gate
-- turns into an identified operator.
grant execute on function public.create_guest_session(text, text, text)              to service_role;
grant execute on function public.resolve_guest_session(text)                         to service_role;
grant execute on function public.submit_guest_score(uuid, uuid, integer[], integer)  to service_role;
grant execute on function public.score_tap_run(integer[], integer)                   to service_role;
grant execute on function public.approve_deposit(uuid)                               to service_role;
grant execute on function public.reject_deposit(uuid, text)                          to service_role;
grant execute on function public.approve_withdrawal(uuid)                            to service_role;
grant execute on function public.reject_withdrawal(uuid, text)                       to service_role;
grant execute on function public.approve_kyc_request(uuid)                           to service_role;
grant execute on function public.reject_kyc_request(uuid, text)                      to service_role;
grant execute on function public.log_admin_action(text, text, uuid, numeric, text, jsonb) to service_role;

-- =============================================================================
-- REALTIME
-- =============================================================================
-- Realtime enforces RLS, so subscribers see only rows their policies permit.
do $$
declare t text;
begin
    foreach t in array array['giveaways','giveaway_participants','guest_participants',
                             'wallets','notifications','fps_events']
    loop
        if not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end $$;

-- =============================================================================
-- STORAGE — KYC documents
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc_documents', 'kyc_documents', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
    set public = false,
        file_size_limit = 5242880,
        allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users can upload their own KYC docs" on storage.objects;
create policy "Users can upload their own KYC docs" on storage.objects
    for insert with check (
        bucket_id = 'kyc_documents'
        and auth.uid() = owner
        -- Path must start with the uploader's own id, so nobody can write into
        -- another user's folder.
        and (select auth.uid()::text) = (string_to_array(name, '/'))[1]);

drop policy if exists "Users can view their own KYC docs" on storage.objects;
create policy "Users can view their own KYC docs" on storage.objects
    for select using (bucket_id = 'kyc_documents' and auth.uid() = owner);

drop policy if exists "Admins can view all KYC docs" on storage.objects;
create policy "Admins can view all KYC docs" on storage.objects
    for select using (bucket_id = 'kyc_documents' and public.is_admin());

drop policy if exists "Admins can delete KYC docs" on storage.objects;
create policy "Admins can delete KYC docs" on storage.objects
    for delete using (bucket_id = 'kyc_documents' and public.is_admin());

notify pgrst, 'reload schema';

commit;

select 'Security applied. Run 00000000000004_seed.sql next.' as result;
