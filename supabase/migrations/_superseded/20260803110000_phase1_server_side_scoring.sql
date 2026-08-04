-- =============================================================================
-- PHASE 1 / 2 — SERVER-SIDE SCORING
--
-- Phase 0 made submit_score() the only write path and bounded it at 55 points per tap
-- and 20 taps/second. That closed the "set score to 999999" hole, but `taps` was still
-- self-reported — so a run that legitimately earned 400 points could be submitted as
-- 600 taps x 55 = 33,000 and pass every check.
--
-- The bound was never the real fix. The real fix is to stop accepting a score.
--
-- The client now submits the TAP TIMINGS — millisecond offsets from the start of the
-- round — and the server derives the score from them using the same rules the game
-- engine uses. A cheater can still fabricate timings, but fabricated timings have to be
-- a physically plausible run: inside the round's duration, at least 50ms apart, and
-- without the machine-perfect regularity that a human hand does not produce. That is a
-- far harder thing to forge than an integer, and every attempt is now measurable.
--
-- The client's own score is still sent, but only as a CLAIM. It is compared against the
-- authoritative figure and any mismatch is recorded as a security event — a tampered
-- client now announces itself instead of succeeding quietly.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. score_tap_run — the single scoring implementation
--
-- Mirrors src/lib/tap-game-engine.ts exactly:
--   MIN_TAP_INTERVAL_MS      50    taps closer together are rejected outright
--   STREAK_TIMEOUT_MS       500    a longer gap resets the streak and multiplier
--   BASE_POINTS_PER_TAP      10
--   STREAK_MULTIPLIER_INCREMENT 0.1  per consecutive tap
--   MAX_MULTIPLIER            5
--   PERFECT_TAP_BONUS         5    for intervals in [150, 250] ms
--
-- Deliberately `immutable` and side-effect free: it is pure arithmetic over the input,
-- which makes it trivially testable and safe to call from both the authenticated and
-- guest paths.
--
-- Note on arithmetic: the engine computes the multiplier in IEEE-754 floats, this uses
-- numeric. In rare cases the two disagree by a single point on a tap. The server value
-- is authoritative and is what gets displayed after submission, so the discrepancy is
-- invisible rather than something the player can notice as a "lost" point.
-- -----------------------------------------------------------------------------
create or replace function public.score_tap_run(
    p_offsets          integer[],
    p_duration_seconds integer
)
returns jsonb
language plpgsql
immutable
as $$
declare
    v_score       integer := 0;
    v_taps        integer := 0;
    v_streak      integer := 0;
    v_best_streak integer := 0;
    v_multiplier  numeric := 1;
    v_last        integer := -1;
    v_offset      integer;
    v_interval    integer;
    v_points      integer;
    v_rejected    integer := 0;
    v_intervals   integer[] := '{}';
    v_max_ms      integer;
    v_stddev      numeric;
    v_mean        numeric;
    v_flags       text[] := '{}';
begin
    if p_offsets is null or array_length(p_offsets, 1) is null then
        return jsonb_build_object(
            'valid', true, 'score', 0, 'taps', 0, 'best_streak', 0,
            'rejected_taps', 0, 'flags', '[]'::jsonb
        );
    end if;

    -- Hard cap on input size. 20 taps/sec over a 300s maximum round is 6000; anything
    -- beyond that is not a game run, it is a payload.
    if array_length(p_offsets, 1) > 6000 then
        return jsonb_build_object('valid', false, 'error', 'Too many tap events');
    end if;

    v_max_ms := (coalesce(p_duration_seconds, 30) * 1000) + 1500;  -- grace for latency

    foreach v_offset in array p_offsets
    loop
        -- Offsets must be inside the round and non-decreasing. A rewound clock or an
        -- offset past the end means the sequence was assembled, not recorded.
        if v_offset is null or v_offset < 0 or v_offset > v_max_ms then
            return jsonb_build_object('valid', false, 'error', 'Tap timing outside the round');
        end if;

        if v_offset < v_last then
            return jsonb_build_object('valid', false, 'error', 'Tap timings are not in order');
        end if;

        if v_last >= 0 then
            v_interval := v_offset - v_last;

            -- The engine refuses taps under the minimum interval and does not advance
            -- its last-tap marker, so they score nothing and do not break the streak.
            if v_interval < 50 then
                v_rejected := v_rejected + 1;
                continue;
            end if;
        else
            v_interval := 0;
        end if;

        if v_interval > 500 then
            v_streak := 0;
            v_multiplier := 1;
        elsif v_interval > 0 then
            v_streak := v_streak + 1;
            v_multiplier := least(5, 1 + (v_streak * 0.1));
        end if;

        if v_streak > v_best_streak then
            v_best_streak := v_streak;
        end if;

        v_points := floor(10 * v_multiplier);

        if v_interval between 150 and 250 then
            v_points := v_points + 5;
        end if;

        v_score := v_score + v_points;
        v_taps  := v_taps + 1;

        if v_interval > 0 then
            v_intervals := array_append(v_intervals, v_interval);
        end if;

        v_last := v_offset;
    end loop;

    -- Bot signature: a human cannot hold a tap interval to within a few milliseconds
    -- over dozens of taps. Low dispersion with a meaningful sample is the tell.
    if array_length(v_intervals, 1) >= 15 then
        select stddev_samp(i), avg(i) into v_stddev, v_mean from unnest(v_intervals) i;

        if v_stddev is not null and v_stddev < 8 then
            v_flags := array_append(v_flags, 'mechanical_timing');
        end if;

        -- Sustained near-maximum rate for a whole round is likewise not hand-driven.
        if v_mean is not null and v_mean < 60 and array_length(v_intervals, 1) >= 100 then
            v_flags := array_append(v_flags, 'sustained_max_rate');
        end if;
    end if;

    if v_rejected > 20 then
        v_flags := array_append(v_flags, 'excessive_rejected_taps');
    end if;

    return jsonb_build_object(
        'valid',         true,
        'score',         v_score,
        'taps',          v_taps,
        'best_streak',   v_best_streak,
        'rejected_taps', v_rejected,
        'interval_stddev', round(coalesce(v_stddev, 0), 2),
        'flags',         to_jsonb(v_flags)
    );
end;
$$;

comment on function public.score_tap_run(integer[], integer) is
    'Authoritative tap-game scoring. Mirrors src/lib/tap-game-engine.ts. Pure function — '
    'no side effects, no table access. Change this and the TypeScript engine together, '
    'and update src/lib/__tests__/anti-cheat-bounds.test.ts.';

-- -----------------------------------------------------------------------------
-- 2. submit_score — authenticated path
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
    for r in
        select oid::regprocedure as sig from pg_proc
        where pronamespace = 'public'::regnamespace and proname = 'submit_score'
    loop
        execute format('drop function if exists %s', r.sig);
    end loop;
end $$;

create or replace function public.submit_score(
    p_giveaway_id  uuid,
    p_tap_offsets  integer[],
    p_client_score integer default null
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
    v_result      jsonb;
    v_score       integer;
    v_flags       jsonb;
    v_rank        integer;
begin
    if v_uid is null then
        return jsonb_build_object('success', false, 'error', 'Not authenticated');
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
    if v_giveaway.ends_at is not null and now() > v_giveaway.ends_at + interval '10 seconds' then
        return jsonb_build_object('success', false, 'error', 'The round has already closed');
    end if;

    v_result := public.score_tap_run(p_tap_offsets, v_giveaway.game_duration_seconds);

    if not (v_result ->> 'valid')::boolean then
        insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
        values (v_uid, 'score_rejected', 'security', 'critical', p_giveaway_id,
                jsonb_build_object('reason', v_result ->> 'error', 'claimed_score', p_client_score));

        return jsonb_build_object('success', false, 'error', 'Invalid score detected');
    end if;

    v_score := (v_result ->> 'score')::integer;
    v_flags := v_result -> 'flags';

    -- The client's figure is a claim, not an input. A mismatch means the page was
    -- modified; record it, but keep the authoritative score rather than failing the
    -- player — a genuine off-by-one from float arithmetic must not cost someone a round.
    if p_client_score is not null and abs(p_client_score - v_score) > 5 then
        insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
        values (v_uid, 'score_mismatch', 'security', 'warning', p_giveaway_id,
                jsonb_build_object('claimed', p_client_score, 'computed', v_score,
                                   'delta', p_client_score - v_score));
    end if;

    if jsonb_array_length(v_flags) > 0 then
        insert into public.fps_events (user_id, event_name, category, severity, giveaway_id, properties)
        values (v_uid, 'cheat_detected', 'security', 'warning', p_giveaway_id,
                jsonb_build_object('flags', v_flags, 'score', v_score,
                                   'interval_stddev', v_result -> 'interval_stddev'));
    end if;

    update public.giveaway_participants
    set score        = v_score,
        taps         = (v_result ->> 'taps')::integer,
        best_streak  = (v_result ->> 'best_streak')::integer,
        completed_at = now()
    where id = v_participant.id
    returning rank into v_rank;

    return jsonb_build_object(
        'success',     true,
        'score',       v_score,
        'taps',        (v_result ->> 'taps')::integer,
        'best_streak', (v_result ->> 'best_streak')::integer,
        'rank',        v_rank
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. submit_guest_score — guest path, called by the API route with service_role
--
-- Same scoring core. The route resolves the session token to a session id first;
-- this function never sees the token.
-- -----------------------------------------------------------------------------
create or replace function public.submit_guest_score(
    p_giveaway_id  uuid,
    p_session_id   uuid,
    p_tap_offsets  integer[],
    p_client_score integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_giveaway    record;
    v_participant record;
    v_result      jsonb;
    v_score       integer;
    v_flags       jsonb;
begin
    if p_session_id is null then
        return jsonb_build_object('success', false, 'error', 'Invalid guest session');
    end if;

    select * into v_giveaway from public.giveaways where id = p_giveaway_id;
    if v_giveaway is null then
        return jsonb_build_object('success', false, 'error', 'Giveaway not found');
    end if;
    if v_giveaway.status <> 'live' then
        return jsonb_build_object('success', false, 'error', 'This giveaway is not currently live');
    end if;

    select * into v_participant
    from public.guest_participants
    where giveaway_id = p_giveaway_id and guest_session_id = p_session_id
    for update;

    if v_participant is null then
        return jsonb_build_object('success', false, 'error', 'You have not joined this giveaway');
    end if;
    if v_participant.completed_at is not null then
        return jsonb_build_object('success', false, 'error', 'Score already submitted');
    end if;
    if v_giveaway.ends_at is not null and now() > v_giveaway.ends_at + interval '10 seconds' then
        return jsonb_build_object('success', false, 'error', 'The round has already closed');
    end if;

    v_result := public.score_tap_run(p_tap_offsets, v_giveaway.game_duration_seconds);

    if not (v_result ->> 'valid')::boolean then
        insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
        values ('score_rejected', 'security', 'critical', p_giveaway_id,
                jsonb_build_object('reason', v_result ->> 'error', 'claimed_score', p_client_score,
                                   'is_guest', true, 'guest_session_id', p_session_id));

        return jsonb_build_object('success', false, 'error', 'Invalid score detected');
    end if;

    v_score := (v_result ->> 'score')::integer;
    v_flags := v_result -> 'flags';

    if p_client_score is not null and abs(p_client_score - v_score) > 5 then
        insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
        values ('score_mismatch', 'security', 'warning', p_giveaway_id,
                jsonb_build_object('claimed', p_client_score, 'computed', v_score,
                                   'is_guest', true, 'guest_session_id', p_session_id));
    end if;

    if jsonb_array_length(v_flags) > 0 then
        insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
        values ('cheat_detected', 'security', 'warning', p_giveaway_id,
                jsonb_build_object('flags', v_flags, 'score', v_score, 'is_guest', true,
                                   'guest_session_id', p_session_id));
    end if;

    update public.guest_participants
    set score        = v_score,
        taps         = (v_result ->> 'taps')::integer,
        best_streak  = (v_result ->> 'best_streak')::integer,
        completed_at = now()
    where id = v_participant.id;

    return jsonb_build_object(
        'success',     true,
        'score',       v_score,
        'taps',        (v_result ->> 'taps')::integer,
        'best_streak', (v_result ->> 'best_streak')::integer
    );
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Privileges
-- -----------------------------------------------------------------------------
revoke all on function public.score_tap_run(integer[], integer)                       from public, anon, authenticated;
revoke all on function public.submit_score(uuid, integer[], integer)                  from public, anon, authenticated;
revoke all on function public.submit_guest_score(uuid, uuid, integer[], integer)      from public, anon, authenticated;

grant execute on function public.submit_score(uuid, integer[], integer)             to authenticated;
grant execute on function public.submit_guest_score(uuid, uuid, integer[], integer) to service_role;
grant execute on function public.score_tap_run(integer[], integer)                  to service_role;

notify pgrst, 'reload schema';

commit;

select 'Phase 1 / 2 — scores are now computed server-side from tap timings' as result;
