-- =============================================================================
-- PHASE 0 — RETROSPECTIVE EXPOSURE AUDIT
--
-- Read-only. Makes no changes. Safe to run on production at any time.
--
-- Phase 0 closed the holes. This looks for evidence that any of them were used while
-- they were open. Every section returns rows only when something looks wrong — an empty
-- result is the good outcome.
--
-- Findings here are SIGNALS, not proof. The legacy code wrote the ledger inconsistently
-- (cancelGiveaway inserted type 'escrow_refund', which is not in the wallet_transactions
-- CHECK constraint, so that insert always failed silently — meaning some legitimate
-- refunds have no ledger row at all). Investigate what surfaces; don't assume fraud.
-- =============================================================================


-- =============================================================================
-- 1. CRITICAL — wallet balance does not match its own ledger
--
-- Every RPC that moves money writes a wallet_transactions row stamped with
-- balance_after. If the current balance disagrees with the most recent stamp, the
-- balance was changed by something that did not go through an RPC — which before
-- Phase 0 meant a direct PATCH on /rest/v1/wallets (P0-1).
--
-- Expect some drift on old rows from the silently-failing refund insert described
-- above. A LARGE positive discrepancy is the one that matters.
-- =============================================================================
select
    '1. BALANCE vs LEDGER' as check_name,
    p.username,
    p.email,
    w.balance                     as current_balance,
    t.balance_after               as last_ledger_balance,
    w.balance - t.balance_after   as discrepancy,
    t.created_at                  as last_transaction_at
from public.wallets w
join public.profiles p on p.id = w.user_id
join lateral (
    select balance_after, created_at
    from public.wallet_transactions
    where wallet_id = w.id and status = 'completed'
    order by created_at desc
    limit 1
) t on true
where abs(w.balance - t.balance_after) > 0.01
order by (w.balance - t.balance_after) desc;


-- =============================================================================
-- 2. CRITICAL — funds with no ledger history at all
--
-- A wallet holding money with zero completed transactions cannot have got there
-- through any sanctioned path.
-- =============================================================================
select
    '2. BALANCE WITH NO LEDGER' as check_name,
    p.username,
    p.email,
    w.balance,
    w.total_deposited,
    w.created_at
from public.wallets w
join public.profiles p on p.id = w.user_id
where w.balance > 0
  and not exists (
      select 1 from public.wallet_transactions t
      where t.wallet_id = w.id and t.status = 'completed'
  )
order by w.balance desc;


-- =============================================================================
-- 3. CRITICAL — withdrawals that bypassed the fee or the hold (P0-5)
--
-- request_withdrawal() used to accept p_fee_percentage and p_hold_hours from the
-- client. A withdrawal recorded with a fee percentage other than the schedule, or with
-- a hold window at or below zero, was requested with tampered arguments.
-- =============================================================================
select
    '3. TAMPERED WITHDRAWAL' as check_name,
    p.username,
    p.email,
    wr.amount,
    wr.fee,
    wr.fee_percentage,
    wr.status,
    wr.created_at,
    wr.hold_until,
    extract(epoch from (wr.hold_until - wr.created_at)) / 3600 as hold_hours
from public.withdrawal_requests wr
join public.profiles p on p.id = wr.user_id
where wr.fee_percentage is distinct from 5.0
   or wr.hold_until is null
   or wr.hold_until <= wr.created_at
order by wr.created_at desc;


-- =============================================================================
-- 4. HIGH — withdrawals approved before their hold expired
--
-- approve_withdrawal() had no admin check at all (P0-3). It did check the hold, so a
-- row completed before hold_until points at a direct table write instead.
-- =============================================================================
select
    '4. EARLY APPROVAL' as check_name,
    p.username,
    p.email,
    wr.amount,
    wr.net_amount,
    wr.created_at,
    wr.hold_until,
    wr.processed_at
from public.withdrawal_requests wr
join public.profiles p on p.id = wr.user_id
where wr.status = 'completed'
  and wr.processed_at is not null
  and wr.hold_until is not null
  and wr.processed_at < wr.hold_until
order by wr.processed_at desc;


-- =============================================================================
-- 5. HIGH — trust score inconsistent with what actually earns it (P0-2)
--
-- Users could write their own trust_score. Recomputing the maximum a profile could
-- legitimately hold: base 10 + email 10 + phone 20 + KYC 30 + age 20 + profile 5
-- + device 20 + wins (5 each, capped 25).
--
-- Anyone materially above their own ceiling set it by hand. Note that Phase 0 does not
-- retroactively correct scores — run recalculate_trust_score() for affected users, or
-- have them reload any page that triggers it.
-- =============================================================================
select
    '5. INFLATED TRUST SCORE' as check_name,
    p.username,
    p.email,
    p.trust_score,
    p.trust_tier,
    p.id_verified,
    p.phone_verified,
    p.total_wins,
    (
        10
        + case when u.email_confirmed_at is not null then 10 else 0 end
        + case when p.phone_verified then 20 else 0 end
        + case when p.id_verified    then 30 else 0 end
        + case
            when extract(epoch from (now() - u.created_at)) / 86400 >= 30 then 20
            when extract(epoch from (now() - u.created_at)) / 86400 >= 7  then 10
            else 0
          end
        + 5    -- assume full profile completeness
        + 20   -- assume a clean linked device
        + least(coalesce(p.total_wins, 0) * 5, 25)
    ) as max_legitimate_score
from public.profiles p
join auth.users u on u.id = p.id
where p.trust_score > (
        10
        + case when u.email_confirmed_at is not null then 10 else 0 end
        + case when p.phone_verified then 20 else 0 end
        + case when p.id_verified    then 30 else 0 end
        + case
            when extract(epoch from (now() - u.created_at)) / 86400 >= 30 then 20
            when extract(epoch from (now() - u.created_at)) / 86400 >= 7  then 10
            else 0
          end
        + 5 + 20
        + least(coalesce(p.total_wins, 0) * 5, 25)
    )
order by p.trust_score desc;


-- =============================================================================
-- 6. HIGH — scores beyond what the game engine can produce (P0-4, P0-7)
--
-- Ceiling is 55 points per tap (10 base x 5 max multiplier + 5 rhythm bonus) and
-- 20 taps/second. The old validator allowed 80 points/tap and 25 taps/sec, and guest
-- rows could be PATCHed directly by anyone at all.
-- =============================================================================
select
    '6. IMPOSSIBLE SCORE (user)' as check_name,
    p.username,
    p.email,
    g.title             as giveaway,
    g.prize_amount,
    gp.score,
    gp.taps,
    gp.score::numeric / nullif(gp.taps, 0) as points_per_tap,
    gp.is_winner,
    gp.completed_at
from public.giveaway_participants gp
join public.giveaways g on g.id = gp.giveaway_id
join public.profiles  p on p.id = gp.user_id
where gp.completed_at is not null
  and (
        gp.score > gp.taps * 55 + 50
     or gp.taps  > coalesce(g.game_duration_seconds, 30) * 20 + 10
  )
order by gp.score desc;

select
    '6. IMPOSSIBLE SCORE (guest)' as check_name,
    coalesce(gp.guest_name, 'Guest') as guest,
    gp.fingerprint_id,
    g.title          as giveaway,
    g.prize_amount,
    gp.score,
    gp.taps,
    gp.score::numeric / nullif(gp.taps, 0) as points_per_tap,
    gp.completed_at
from public.guest_participants gp
join public.giveaways g on g.id = gp.giveaway_id
where gp.completed_at is not null
  and (
        gp.score > gp.taps * 55 + 50
     or gp.taps  > coalesce(g.game_duration_seconds, 30) * 20 + 10
  )
order by gp.score desc;


-- =============================================================================
-- 7. MEDIUM — giveaways ended suspiciously early (P0-9)
--
-- complete_giveaway() was callable by anyone at any moment. A giveaway whose ends_at
-- is well before starts_at + duration was ended before the round was over — plausibly
-- by whoever was leading at that instant.
-- =============================================================================
select
    '7. ENDED EARLY' as check_name,
    g.title,
    g.prize_amount,
    g.status,
    g.starts_at,
    g.ends_at,
    g.game_duration_seconds,
    extract(epoch from (g.ends_at - g.starts_at)) as actual_seconds,
    winner.username as winner,
    host.username   as host
from public.giveaways g
left join public.profiles winner on winner.id = g.winner_id
left join public.profiles host   on host.id   = g.host_id
where g.starts_at is not null
  and g.ends_at is not null
  and extract(epoch from (g.ends_at - g.starts_at)) < coalesce(g.game_duration_seconds, 30) - 2
order by g.ends_at desc;


-- =============================================================================
-- 8. MEDIUM — self-promoted admins
--
-- Migration 120000 already reset is_host on anyone not in admin_users, so this should
-- be empty. It is here to confirm the roster itself is what you expect.
-- =============================================================================
select
    '8. ADMIN ROSTER' as check_name,
    a.email,
    a.role,
    a.created_at,
    a.notes
from public.admin_users a
order by a.created_at;


-- =============================================================================
-- 9. MEDIUM — escrow that does not balance
--
-- Escrow released or refunded more than once, or still held on a giveaway that ended
-- long ago (prize never claimed — the host's money is stranded).
-- =============================================================================
select
    '9. STRANDED ESCROW' as check_name,
    g.title,
    g.status                as giveaway_status,
    e.status                as escrow_status,
    e.amount,
    g.ends_at,
    g.prize_claimed_at,
    winner.username         as winner,
    g.winner_fingerprint_id as unlinked_guest_winner
from public.escrow e
join public.giveaways g on g.id = e.giveaway_id
left join public.profiles winner on winner.id = g.winner_id
where e.status = 'held'
  and g.status in ('ended', 'cancelled')
  and g.ends_at < now() - interval '48 hours'
order by e.amount desc;


-- =============================================================================
-- 10. INFO — sum of all wallet balances vs sum of all escrow
--
-- The platform-level figure. Track it over time: total liability to users should only
-- move when money genuinely enters or leaves.
-- =============================================================================
select
    '10. PLATFORM TOTALS' as check_name,
    (select coalesce(sum(balance), 0)        from public.wallets)                          as total_user_balances,
    (select coalesce(sum(escrow_balance), 0) from public.wallets)                          as total_escrow_balances,
    (select coalesce(sum(amount), 0)         from public.escrow where status = 'held')     as escrow_held,
    (select coalesce(sum(total_deposited), 0) from public.wallets)                         as lifetime_deposited,
    (select coalesce(sum(total_withdrawn), 0) from public.wallets)                         as lifetime_withdrawn,
    (select count(*) from public.profiles)                                                 as user_count;
