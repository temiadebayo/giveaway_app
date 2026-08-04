-- =============================================================================
-- PHASE 0 / 4 of 5 — GATED WRITE PATHS
--
-- The next migration revokes INSERT/UPDATE/DELETE on the money and gameplay tables.
-- Everything the client legitimately needs to write therefore has to have a gated
-- equivalent first, or features break. This file provides them.
--
-- Replaces (direct table write -> RPC):
--   wallets.insert                    -> ensure_wallet()
--   giveaway_participants.insert      -> join_giveaway()          [P0: adds the checks that
--                                                                  were client-side and skippable]
--   giveaway_participants.update      -> submit_score()           [P0-7]
--   wallets/escrow/giveaways multi-   -> cancel_giveaway()        [P0-8: one transaction,
--     step update from the browser                                 with row locks]
--   profiles.trust_score.update       -> recalculate_trust_score() [was client-computed]
--   profiles.phone_verified.update    -> sync_phone_verification() [was client-asserted, +20 trust]
--   device_fingerprints insert/update -> register_device()        [was client-writable, incl. is_flagged]
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- ensure_wallet — idempotent wallet creation
--
-- Replaces wallet-service.ts createWallet(), which INSERTed into wallets directly.
-- With a blanket INSERT grant a new user could have supplied their own opening balance.
-- -----------------------------------------------------------------------------
create or replace function public.ensure_wallet()
returns public.wallets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid    uuid := auth.uid();
    v_wallet public.wallets;
    v_user   record;
begin
    if v_uid is null then
        raise exception 'Not authenticated' using errcode = '28000';
    end if;

    select * into v_wallet from public.wallets where user_id = v_uid;
    if found then
        return v_wallet;
    end if;

    -- The profile row may be missing if the on_auth_user_created trigger did not fire.
    if not exists (select 1 from public.profiles where id = v_uid) then
        select id, email, raw_user_meta_data into v_user from auth.users where id = v_uid;

        insert into public.profiles (id, email, username, display_name, avatar_url)
        values (
            v_uid,
            v_user.email,
            coalesce(v_user.raw_user_meta_data ->> 'username', split_part(v_user.email, '@', 1)),
            coalesce(v_user.raw_user_meta_data ->> 'full_name',
                     v_user.raw_user_meta_data ->> 'name',
                     split_part(v_user.email, '@', 1)),
            v_user.raw_user_meta_data ->> 'avatar_url'
        )
        on conflict (id) do nothing;
    end if;

    insert into public.wallets (user_id) values (v_uid)
    on conflict (user_id) do nothing;

    select * into v_wallet from public.wallets where user_id = v_uid;
    return v_wallet;
end;
$$;

-- -----------------------------------------------------------------------------
-- join_giveaway
--
-- The client previously INSERTed into giveaway_participants directly, doing the host
-- check and winner-cooldown check in TypeScript first. Anyone calling PostgREST straight
-- skipped all of it. Two of those checks were also broken as written:
--   * the cooldown query used .filter('giveaways.host_id', 'eq', ...) on a table with no
--     embedded join, which PostgREST does not evaluate as intended
--   * min_trust_tier and max_participants were never enforced anywhere at all
-- -----------------------------------------------------------------------------
create or replace function public.join_giveaway(
    p_giveaway_id uuid,
    p_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid       uuid := auth.uid();
    v_giveaway  record;
    v_profile   record;
    v_count     integer;
    v_recent    integer;
    v_device_id uuid;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    select * into v_giveaway from public.giveaways where id = p_giveaway_id;
    if v_giveaway is null then
        return jsonb_build_object('success', false, 'error', 'Giveaway not found');
    end if;

    if v_giveaway.status not in ('scheduled', 'live') then
        return jsonb_build_object('success', false, 'error', 'This giveaway is not accepting participants');
    end if;

    if v_giveaway.host_id = v_uid then
        return jsonb_build_object('success', false, 'error', 'Hosts cannot participate in their own giveaways');
    end if;

    select * into v_profile from public.profiles where id = v_uid;
    if coalesce(v_profile.is_banned, false) then
        return jsonb_build_object('success', false, 'error', 'Account is suspended');
    end if;

    -- Already joined: idempotent success, matching the previous client behaviour.
    if exists (
        select 1 from public.giveaway_participants
        where giveaway_id = p_giveaway_id and user_id = v_uid
    ) then
        return jsonb_build_object('success', true, 'already_joined', true);
    end if;

    -- Minimum trust tier (previously stored but never enforced).
    if public.tier_rank(v_profile.trust_tier) < public.tier_rank(v_giveaway.min_trust_tier) then
        return jsonb_build_object('success', false,
            'error', 'This giveaway requires ' || v_giveaway.min_trust_tier ||
                     ' tier or above. Your tier is ' || v_profile.trust_tier || '.');
    end if;

    -- Capacity (previously stored but never enforced).
    if v_giveaway.max_participants is not null then
        select count(*) into v_count
        from public.combined_leaderboard
        where giveaway_id = p_giveaway_id;

        if v_count >= v_giveaway.max_participants then
            return jsonb_build_object('success', false, 'error', 'This giveaway is full');
        end if;
    end if;

    -- Previous-winner cooldown, scoped to this host — the check the TypeScript intended.
    if coalesce(v_giveaway.prevent_previous_winners_hours, 0) > 0 then
        select count(*) into v_recent
        from public.giveaway_participants gp
        join public.giveaways g on g.id = gp.giveaway_id
        where gp.user_id = v_uid
          and gp.is_winner = true
          and g.host_id = v_giveaway.host_id
          and gp.completed_at >= now() - (v_giveaway.prevent_previous_winners_hours || ' hours')::interval;

        if v_recent > 0 then
            return jsonb_build_object('success', false,
                'error', 'You recently won an event from this host. Please wait ' ||
                         v_giveaway.prevent_previous_winners_hours ||
                         ' hours from your win before joining their new events.');
        end if;
    end if;

    -- Resolve the fingerprint hash to a device row if we already know it.
    if p_fingerprint is not null then
        select id into v_device_id
        from public.device_fingerprints
        where fingerprint_hash = p_fingerprint;
    end if;

    insert into public.giveaway_participants (giveaway_id, user_id, device_fingerprint_id)
    values (p_giveaway_id, v_uid, v_device_id)
    on conflict (giveaway_id, user_id) do nothing;

    return jsonb_build_object('success', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- submit_score
--
-- P0-7. Previously an unguarded UPDATE on giveaway_participants: the client sent
-- whatever score it liked and the only validation lived in TypeScript that an attacker
-- simply did not run.
--
-- Bounds are derived from the actual game engine constants in tap-game-engine.ts:
--   MIN_TAP_INTERVAL_MS = 50   -> at most 20 taps/second
--   BASE_POINTS_PER_TAP = 10, MAX_MULTIPLIER = 5, PERFECT_TAP_BONUS = 5
--                              -> at most 55 points per tap
-- The legacy check allowed 25 taps/s and 80 points/tap, i.e. a ceiling of 60,000 for a
-- 30-second round, which is roughly 8x what the engine can actually produce.
--
-- KNOWN GAP (Phase 1): taps is still self-reported, so score can be inflated up to the
-- 55x ceiling. The real fix is submitting the tap timestamp array and scoring server-side.
-- This is the gate that makes that change possible without another permissions rewrite.
-- -----------------------------------------------------------------------------
create or replace function public.submit_score(
    p_giveaway_id uuid,
    p_score       integer,
    p_taps        integer,
    p_best_streak integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid         uuid := auth.uid();
    v_giveaway    record;
    v_participant record;
    v_duration    integer;
    v_max_taps    integer;
    v_max_score   integer;
    v_rank        integer;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    if p_score is null or p_taps is null or p_score < 0 or p_taps < 0 then
        return jsonb_build_object('success', false, 'error', 'Invalid score');
    end if;

    select * into v_giveaway from public.giveaways where id = p_giveaway_id;
    if v_giveaway is null then
        return jsonb_build_object('success', false, 'error', 'Giveaway not found');
    end if;

    if v_giveaway.status <> 'live' then
        return jsonb_build_object('success', false, 'error', 'This giveaway is not currently live');
    end if;

    select * into v_participant
    from public.giveaway_participants
    where giveaway_id = p_giveaway_id and user_id = v_uid
    for update;

    if v_participant is null then
        return jsonb_build_object('success', false, 'error', 'You have not joined this giveaway');
    end if;

    if v_participant.completed_at is not null then
        return jsonb_build_object('success', false, 'error', 'Score already submitted');
    end if;

    -- Submissions must land inside the round, plus a small grace for network latency.
    if v_giveaway.ends_at is not null and now() > v_giveaway.ends_at + interval '10 seconds' then
        return jsonb_build_object('success', false, 'error', 'The round has already closed');
    end if;

    v_duration  := coalesce(v_giveaway.game_duration_seconds, 30);
    v_max_taps  := (v_duration * 20) + 10;
    v_max_score := (p_taps * 55) + 50;

    if p_taps > v_max_taps then
        insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
        values (v_uid, 'score_rejected', 'security', 'critical', p_giveaway_id,
                jsonb_build_object('reason', 'tap_count_impossible', 'taps', p_taps, 'max', v_max_taps));
        return jsonb_build_object('success', false, 'error', 'Invalid score detected');
    end if;

    if p_score > v_max_score then
        insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
        values (v_uid, 'score_rejected', 'security', 'critical', p_giveaway_id,
                jsonb_build_object('reason', 'score_exceeds_taps', 'score', p_score,
                                   'taps', p_taps, 'max', v_max_score));
        return jsonb_build_object('success', false, 'error', 'Invalid score detected');
    end if;

    update public.giveaway_participants
    set score        = p_score,
        taps         = p_taps,
        best_streak  = greatest(0, coalesce(p_best_streak, 0)),
        completed_at = now()
    where id = v_participant.id
    returning rank into v_rank;

    return jsonb_build_object('success', true, 'rank', v_rank);
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_giveaway
--
-- P0-8. giveaway-service.ts did this as five separate round-trips from the browser:
-- read wallet, read escrow, write wallet balance (read-modify-write), write escrow,
-- write transaction, write giveaway. Any failure part-way left escrow and wallet
-- disagreeing, and two concurrent calls could double-refund.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_giveaway(p_giveaway_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid      uuid := auth.uid();
    v_giveaway record;
    v_escrow   record;
    v_wallet   record;
    v_balance  numeric;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;
    if v_giveaway is null then
        return jsonb_build_object('success', false, 'error', 'Giveaway not found');
    end if;

    if v_giveaway.host_id <> v_uid and not public.is_admin() then
        return jsonb_build_object('success', false, 'error', 'Only the host can cancel this giveaway');
    end if;

    if v_giveaway.status in ('ended', 'cancelled') then
        return jsonb_build_object('success', false, 'error', 'This giveaway can no longer be cancelled');
    end if;

    -- Refuse to cancel a live round that people are already playing.
    if v_giveaway.status = 'live' and not public.is_admin() then
        return jsonb_build_object('success', false,
            'error', 'Cannot cancel a giveaway that is already live');
    end if;

    select * into v_escrow
    from public.escrow
    where giveaway_id = p_giveaway_id and status = 'held'
    for update;

    if v_escrow is not null then
        select * into v_wallet from public.wallets where user_id = v_giveaway.host_id for update;

        if v_wallet is not null then
            update public.wallets
            set balance        = balance + v_escrow.amount,
                escrow_balance = greatest(0, escrow_balance - v_escrow.amount),
                updated_at     = now()
            where id = v_wallet.id
            returning balance into v_balance;

            update public.escrow
            set status = 'refunded', released_at = now()
            where id = v_escrow.id;

            insert into public.wallet_transactions (
                wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, status, reference_type, reference_id, description
            )
            values (
                v_wallet.id, v_giveaway.host_id, 'prize_refund', v_escrow.amount, 0, v_escrow.amount,
                v_balance - v_escrow.amount, v_balance, 'completed', 'giveaway', p_giveaway_id,
                'Giveaway cancelled - escrow refunded'
            );
        end if;
    end if;

    update public.giveaways
    set status = 'cancelled', updated_at = now()
    where id = p_giveaway_id;

    if public.is_admin() and v_giveaway.host_id <> v_uid then
        perform public.log_admin_action(
            'giveaway.cancel', 'giveaway', p_giveaway_id,
            coalesce(v_escrow.amount, 0), null,
            jsonb_build_object('host_id', v_giveaway.host_id)
        );
    end if;

    return jsonb_build_object('success', true, 'refunded', coalesce(v_escrow.amount, 0));
end;
$$;

-- -----------------------------------------------------------------------------
-- sync_phone_verification
--
-- phone-verification-modal.tsx set profiles.phone_verified = true from the browser.
-- A trigger then granted +20 trust score. The OTP itself was genuinely checked by
-- Supabase Auth, but the profile flag was a separate, forgeable write — so the trust
-- points were self-service.
--
-- This reads the verification state from auth.users, which the client cannot forge.
-- -----------------------------------------------------------------------------
create or replace function public.sync_phone_verification()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid   uuid := auth.uid();
    v_user  record;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    select phone, phone_confirmed_at into v_user from auth.users where id = v_uid;

    if v_user.phone_confirmed_at is null then
        return jsonb_build_object('success', false, 'error', 'Phone number is not verified');
    end if;

    update public.profiles
    set phone          = coalesce(v_user.phone, phone),
        phone_verified = true,
        updated_at     = now()
    where id = v_uid and phone_verified is distinct from true;

    return jsonb_build_object('success', true, 'phone_verified', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- register_device
--
-- trust-service.ts wrote device_fingerprints and user_devices directly. The table had
-- `for all using (true)` plus a blanket grant, so any client could also clear is_flagged
-- on a device the fraud system had marked.
--
-- This never touches is_flagged / flag_reason.
-- -----------------------------------------------------------------------------
create or replace function public.register_device(
    p_hash        text,
    p_canvas      text default null,
    p_webgl       jsonb default null,
    p_audio       text default null,
    p_screen      text default null,
    p_confidence  integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid    uuid := auth.uid();
    v_fp_id  uuid;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;
    if coalesce(trim(p_hash), '') = '' then
        return jsonb_build_object('success', false, 'error', 'Fingerprint hash required');
    end if;

    insert into public.device_fingerprints (
        fingerprint_hash, canvas_hash, webgl_info, audio_hash, screen_info, confidence
    )
    values (p_hash, p_canvas, p_webgl, p_audio, p_screen, greatest(0, least(100, coalesce(p_confidence, 0))))
    on conflict (fingerprint_hash) do update
    set times_seen   = public.device_fingerprints.times_seen + 1,
        last_seen_at = now(),
        confidence   = greatest(0, least(100, coalesce(excluded.confidence, 0)))
    returning id into v_fp_id;

    insert into public.user_devices (user_id, fingerprint_id, last_used_at)
    values (v_uid, v_fp_id, now())
    on conflict (user_id, fingerprint_id) do update
    set last_used_at = now();

    return jsonb_build_object('success', true, 'fingerprint_id', v_fp_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- recalculate_trust_score
--
-- trust-service.ts computed the score in the browser and wrote profiles.trust_score.
-- Mirrors the weights in src/lib/trust-engine.ts, but every input is read from the
-- database rather than accepted from the caller.
-- -----------------------------------------------------------------------------
create or replace function public.recalculate_trust_score()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid            uuid := auth.uid();
    v_profile        public.profiles;
    v_auth           record;
    v_age_days       numeric;
    v_score          integer := 10;   -- base
    v_before         integer;
    v_devices        integer;
    v_flagged        integer;
    v_shared         integer;
    v_profile_points integer := 0;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
    end if;

    select * into v_profile from public.profiles where id = v_uid;
    if v_profile is null then
        return jsonb_build_object('success', false, 'error', 'Profile not found');
    end if;

    v_before := coalesce(v_profile.trust_score, 0);

    select email_confirmed_at, created_at into v_auth from auth.users where id = v_uid;

    if v_auth.email_confirmed_at is not null then v_score := v_score + 10; end if;
    if coalesce(v_profile.phone_verified, false) then v_score := v_score + 20; end if;
    if coalesce(v_profile.id_verified, false)    then v_score := v_score + 30; end if;

    v_age_days := extract(epoch from (now() - v_auth.created_at)) / 86400;
    if v_age_days >= 30 then
        v_score := v_score + 20;
    elsif v_age_days >= 7 then
        v_score := v_score + 10;
    end if;

    -- Profile completeness. bio is read dynamically so this works whether or not the
    -- column has been added to profiles yet.
    if v_profile.avatar_url is not null                          then v_profile_points := v_profile_points + 2; end if;
    if coalesce(to_jsonb(v_profile) ->> 'bio', '') <> ''         then v_profile_points := v_profile_points + 2; end if;
    if coalesce(v_profile.username, '') <> ''                    then v_profile_points := v_profile_points + 1; end if;
    v_score := v_score + least(v_profile_points, 5);

    -- Device trust
    select count(*) into v_devices from public.user_devices where user_id = v_uid;
    select count(*) into v_flagged
    from public.user_devices ud
    join public.device_fingerprints df on df.id = ud.fingerprint_id
    where ud.user_id = v_uid and df.is_flagged = true;

    if v_devices > 0 and v_flagged = 0 then v_score := v_score + 20; end if;

    -- Fair wins, capped
    v_score := v_score + least(coalesce(v_profile.total_wins, 0) * 5, 25);

    -- Penalties
    if v_flagged > 0 then v_score := v_score - 50; end if;

    select count(distinct ud2.user_id) into v_shared
    from public.user_devices ud1
    join public.user_devices ud2 on ud2.fingerprint_id = ud1.fingerprint_id
    where ud1.user_id = v_uid and ud2.user_id <> v_uid;

    if v_shared > 0 then v_score := v_score - 40; end if;

    v_score := greatest(0, least(100, v_score));

    -- The on_trust_score_change trigger derives trust_tier and withdrawal_limit,
    -- and on_trust_score_log records the delta in trust_events.
    update public.profiles
    set trust_score = v_score, updated_at = now()
    where id = v_uid;

    return jsonb_build_object(
        'success', true,
        'score_before', v_before,
        'score', v_score,
        'tier', public.tier_for_score(v_score)
    );
end;
$$;

commit;

select 'Phase 0 / 4 of 5 — gated write RPCs created' as result;
