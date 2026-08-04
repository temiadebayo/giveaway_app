-- =============================================================================
-- SCHEDULED FINALIZATION
--
-- Closes the last correctness gap in the money lifecycle.
--
-- THE PROBLEM
--   A giveaway only ended because a client-side setInterval noticed ends_at had passed
--   and called complete_giveaway(). If the last player closed their tab — or everyone
--   lost signal, or the round ended while nobody was watching — the giveaway stayed
--   'live' forever and the host's escrow stayed locked. Nobody could claim, nobody got
--   refunded, and the money simply sat there.
--
--   Worse for lobbies: a host could fund a giveaway, never press start, and the escrow
--   would be locked indefinitely with no path to recovery.
--
-- THE FIX
--   pg_cron runs run_giveaway_maintenance() every minute. It finalises rounds whose
--   time is up and refunds lobbies that were abandoned. The client-side call is kept as
--   a fast path — it ends the round in the same second for people who are watching —
--   but it is no longer what the system depends on.
--
-- Also extracts refund_escrow_to_host(). Returning escrow to a host now happens in
-- three situations (cancelled, no participants, abandoned) and three copies of a money
-- movement is how this codebase previously ended up with four different, drifting
-- implementations of complete_giveaway.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Shared refund path
--
-- Locks the escrow row and the host wallet, moves the money back, marks the escrow
-- refunded and writes the ledger entry. Returns the amount returned, or 0 if there was
-- no held escrow (which is not an error — a giveaway may legitimately have none).
--
-- Internal: never granted to a client role. Callers do their own authorization.
-- -----------------------------------------------------------------------------
create or replace function public.refund_escrow_to_host(
    p_giveaway_id uuid,
    p_description text
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_escrow  record;
    v_wallet  record;
    v_balance numeric;
    v_host    uuid;
begin
    select host_id into v_host from public.giveaways where id = p_giveaway_id;
    if v_host is null then
        return 0;
    end if;

    select * into v_escrow
    from public.escrow
    where giveaway_id = p_giveaway_id and status = 'held'
    for update;

    if v_escrow is null then
        return 0;
    end if;

    select * into v_wallet from public.wallets where user_id = v_host for update;
    if v_wallet is null then
        -- Escrow with no host wallet should be impossible; leave it held rather than
        -- silently discarding the record, so it surfaces in the stranded-escrow audit.
        return 0;
    end if;

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
        balance_before, balance_after, status, reference_type, reference_id, description)
    values (
        v_wallet.id, v_host, 'prize_refund', v_escrow.amount, 0, v_escrow.amount,
        v_balance - v_escrow.amount, v_balance, 'completed', 'giveaway', p_giveaway_id,
        p_description);

    return v_escrow.amount;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. complete_giveaway — no-participants branch now uses the shared refund
-- -----------------------------------------------------------------------------
create or replace function public.complete_giveaway(p_giveaway_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_giveaway record; v_escrow record; v_winner record; v_count integer; v_refunded numeric;
begin
    select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;
    if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
    if v_giveaway.status = 'ended' then return jsonb_build_object('success', false, 'error', 'Giveaway already ended'); end if;
    if v_giveaway.status = 'cancelled' then return jsonb_build_object('success', false, 'error', 'Giveaway was cancelled'); end if;

    -- Host or admin may end early. Anyone else — including the scheduled job, which runs
    -- with no JWT — only once ends_at has genuinely passed. The maintenance function
    -- selects strictly on ends_at < now(), so it always satisfies this.
    if v_giveaway.host_id <> auth.uid()
       and not public.is_admin()
       and (v_giveaway.ends_at is null or v_giveaway.ends_at > now()) then
        return jsonb_build_object('success', false, 'error', 'This giveaway has not finished yet');
    end if;

    select * into v_escrow from public.escrow where giveaway_id = p_giveaway_id and status = 'held' for update;
    if v_escrow is null then return jsonb_build_object('success', false, 'error', 'Escrow funds not found'); end if;

    select count(*) into v_count from public.combined_leaderboard
    where giveaway_id = p_giveaway_id and completed_at is not null;

    if v_count = 0 then
        update public.giveaways set status = 'cancelled', ends_at = now(), updated_at = now()
        where id = p_giveaway_id;

        v_refunded := public.refund_escrow_to_host(
            p_giveaway_id, 'Giveaway ended with no participants - escrow refunded');

        return jsonb_build_object('success', true, 'status', 'cancelled',
                                  'reason', 'No participants', 'refunded', v_refunded);
    end if;

    select * into v_winner from public.combined_leaderboard
    where giveaway_id = p_giveaway_id and completed_at is not null
    order by score desc, completed_at asc limit 1;

    update public.giveaways
    set status = 'ended', winner_id = v_winner.user_id,
        winner_guest_session_id = v_winner.guest_session_id,
        winning_score = v_winner.score,
        ends_at = least(coalesce(ends_at, now()), now()), updated_at = now()
    where id = p_giveaway_id;

    if v_winner.user_id is not null then
        update public.giveaway_participants set is_winner = true
        where giveaway_id = p_giveaway_id and user_id = v_winner.user_id;
        update public.profiles set total_wins = total_wins + 1, updated_at = now()
        where id = v_winner.user_id;

        insert into public.notifications (user_id, type, title, message, link)
        values (v_winner.user_id, 'win', '🏆 You won!',
                'You won ' || v_giveaway.title || '. Claim your prize now.',
                '/giveaways/' || p_giveaway_id);
    else
        update public.guest_participants set is_winner = true where id = v_winner.participation_id;
    end if;

    return jsonb_build_object('success', true, 'status', 'ended',
        'winner_id', v_winner.user_id, 'winner_guest_session_id', v_winner.guest_session_id,
        'winner_username', v_winner.username, 'winning_score', v_winner.score,
        'prize_amount', v_escrow.amount, 'is_guest', v_winner.participant_type = 'guest');
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. cancel_giveaway — same shared refund
-- -----------------------------------------------------------------------------
create or replace function public.cancel_giveaway(p_giveaway_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_giveaway record; v_refunded numeric;
begin
    if v_uid is null then return jsonb_build_object('success', false, 'error', 'Not authenticated'); end if;

    select * into v_giveaway from public.giveaways where id = p_giveaway_id for update;
    if v_giveaway is null then return jsonb_build_object('success', false, 'error', 'Giveaway not found'); end if;
    if v_giveaway.host_id <> v_uid and not public.is_admin() then
        return jsonb_build_object('success', false, 'error', 'Only the host can cancel this giveaway');
    end if;
    if v_giveaway.status in ('ended','cancelled') then
        return jsonb_build_object('success', false, 'error', 'This giveaway can no longer be cancelled');
    end if;
    if v_giveaway.status = 'live' and not public.is_admin() then
        return jsonb_build_object('success', false, 'error', 'Cannot cancel a giveaway that is already live');
    end if;

    update public.giveaways set status = 'cancelled', updated_at = now() where id = p_giveaway_id;

    v_refunded := public.refund_escrow_to_host(p_giveaway_id, 'Giveaway cancelled - escrow refunded');

    if public.is_admin() and v_giveaway.host_id <> v_uid then
        perform public.log_admin_action('giveaway.cancel', 'giveaway', p_giveaway_id, v_refunded, null,
                                        jsonb_build_object('host_id', v_giveaway.host_id));
    end if;

    return jsonb_build_object('success', true, 'refunded', v_refunded);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. run_giveaway_maintenance — the scheduled job
--
-- Idempotent and safe to run at any frequency: everything it touches is selected on a
-- state that its own action changes, so a second pass finds nothing.
-- -----------------------------------------------------------------------------
create or replace function public.run_giveaway_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_row       record;
    v_result    jsonb;
    v_finalized integer := 0;
    v_expired   integer := 0;
    v_refunded  numeric := 0;
    v_amount    numeric;
begin
    -- (a) Rounds whose time is up.
    --
    -- The 15s grace is deliberate: submit_score() accepts submissions up to 10s past
    -- ends_at for network latency, so finalising earlier could drop a score that was
    -- legitimately in flight.
    for v_row in
        select id from public.giveaways
        where status = 'live'
          and ends_at is not null
          and ends_at < now() - interval '15 seconds'
        order by ends_at
        limit 100
    loop
        begin
            v_result := public.complete_giveaway(v_row.id);
            if (v_result ->> 'success')::boolean then
                v_finalized := v_finalized + 1;
                v_refunded  := v_refunded + coalesce((v_result ->> 'refunded')::numeric, 0);
            end if;
        exception when others then
            -- One bad giveaway must not stop the rest of the batch.
            insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
            values ('maintenance_error', 'security', 'critical', v_row.id,
                    jsonb_build_object('stage', 'finalize', 'error', sqlerrm));
        end;
    end loop;

    -- (b) Lobbies that were funded and then abandoned.
    --
    -- Without this the host's escrow is locked forever: a 'scheduled' giveaway that is
    -- never started has no path to 'ended' or 'cancelled' at all.
    for v_row in
        select id from public.giveaways
        where status = 'scheduled'
          and starts_at is null
          and created_at < now() - interval '24 hours'
        order by created_at
        limit 100
    loop
        begin
            update public.giveaways
            set status = 'cancelled', ends_at = now(), updated_at = now()
            where id = v_row.id;

            v_amount := public.refund_escrow_to_host(
                v_row.id, 'Lobby expired after 24 hours without starting - escrow refunded');

            v_expired  := v_expired + 1;
            v_refunded := v_refunded + v_amount;
        exception when others then
            insert into public.fps_events (event_name, category, severity, giveaway_id, properties)
            values ('maintenance_error', 'security', 'critical', v_row.id,
                    jsonb_build_object('stage', 'expire_lobby', 'error', sqlerrm));
        end;
    end loop;

    -- Only record a run that did something, so the event log stays signal.
    if v_finalized > 0 or v_expired > 0 then
        insert into public.fps_events (event_name, category, severity, properties)
        values ('giveaway_maintenance', 'game', 'info',
                jsonb_build_object('finalized', v_finalized, 'expired_lobbies', v_expired,
                                   'total_refunded', v_refunded));
    end if;

    return jsonb_build_object('finalized', v_finalized, 'expired_lobbies', v_expired,
                              'total_refunded', v_refunded);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Privileges — internal only
-- -----------------------------------------------------------------------------
revoke all on function public.refund_escrow_to_host(uuid, text)  from public, anon, authenticated;
revoke all on function public.run_giveaway_maintenance()         from public, anon, authenticated;
revoke all on function public.complete_giveaway(uuid)            from public;
revoke all on function public.cancel_giveaway(uuid)              from public;

grant execute on function public.run_giveaway_maintenance() to service_role;
-- complete_giveaway stays reachable by anon: the client fast path ends a round in the
-- same second for anyone watching, and it can only act once ends_at has passed.
grant execute on function public.complete_giveaway(uuid) to anon, authenticated;
grant execute on function public.cancel_giveaway(uuid)   to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Schedule
--
-- pg_cron may need enabling first: Dashboard -> Database -> Extensions -> pg_cron.
-- This block does not fail the migration if it is unavailable — the functions above are
-- still correct and can be driven by an external scheduler instead.
-- -----------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_extension where extname = 'pg_cron') then
        raise notice '---------------------------------------------------------------';
        raise notice 'pg_cron is NOT enabled. Functions created but NOTHING IS SCHEDULED.';
        raise notice 'Enable it: Dashboard -> Database -> Extensions -> pg_cron,';
        raise notice 'then re-run just section 6 of this file.';
        raise notice '---------------------------------------------------------------';
        return;
    end if;

    -- Replace any previous schedule so re-running does not stack duplicates.
    perform cron.unschedule('giveaway-maintenance')
    where exists (select 1 from cron.job where jobname = 'giveaway-maintenance');

    perform cron.schedule(
        'giveaway-maintenance',
        '* * * * *',
        $job$ select public.run_giveaway_maintenance(); $job$
    );

    raise notice 'Scheduled: giveaway-maintenance, every minute.';
end $$;

commit;

-- Useful afterwards:
--   select * from cron.job where jobname = 'giveaway-maintenance';
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select public.run_giveaway_maintenance();   -- run it by hand

select 'Scheduled finalization installed.' as result;
