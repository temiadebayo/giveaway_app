-- =============================================================================
-- PHASE 0 / 5.5 of 5 — SWEEP: legacy security definer functions
--
-- Fixes the two checks that failed in 20260802120500_phase0_verify.sql.
--
-- 1. "every security definer function pins search_path" — FAIL
--    Migrations 120200/120300 pinned search_path on the functions they rewrote, but the
--    database also holds trigger functions inherited from the legacy scripts that were
--    never touched: handle_new_user, log_trust_change, update_participant_rank,
--    create_wallet_for_user, handle_phone_verification_trust_score,
--    update_giveaway_participant_count, get_total_participant_count, participant_count.
--    All are SECURITY DEFINER, none pin search_path.
--
--    An unpinned SECURITY DEFINER function resolves unqualified names using the
--    *caller's* search_path. A caller who can create objects in a schema earlier in that
--    path can shadow a table the function reads and have it operate on their object
--    while running with the owner's privileges.
--
--    ALTER FUNCTION ... SET search_path pins it without touching the body, so this is
--    safe to apply to functions we did not write.
--
-- 2. "no application function is executable by PUBLIC" — FAIL
--    The revoke sweep in 120400 Section A runs before Section C creates
--    reset_phone_verification_on_change(). Postgres grants EXECUTE to PUBLIC on every
--    newly created function, so that one was created after the sweep had passed it.
--
--    Rather than reorder 120400 (its grants have to come after its revokes), this file
--    re-sweeps at the very end of the Phase 0 set, when every function exists.
--
--    Note it revokes from PUBLIC only. PUBLIC is a distinct grantee from anon and
--    authenticated, so the explicit grants made in 120400 are untouched.
--
-- Idempotent. Safe to re-run at any time, and worth re-running after any future
-- migration that creates a function.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Pin search_path on every SECURITY DEFINER function that lacks it
-- -----------------------------------------------------------------------------
do $$
declare
    r record;
    v_count integer := 0;
begin
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.prosecdef
          and not exists (
              select 1 from pg_depend d
              where d.objid = p.oid
                and d.classid = 'pg_proc'::regclass
                and d.deptype = 'e'          -- extension-owned: not ours to alter
          )
          and (
              p.proconfig is null
              or not exists (
                  select 1 from unnest(p.proconfig) cfg where cfg like 'search\_path=%'
              )
          )
    loop
        execute format('alter function %s set search_path = public, pg_temp', r.sig);
        raise notice 'pinned search_path: %', r.sig;
        v_count := v_count + 1;
    end loop;

    raise notice 'search_path pinned on % legacy function(s)', v_count;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Revoke EXECUTE from PUBLIC on every application function
--
--    Unconditional rather than conditional: revoking a privilege that was not granted
--    is a no-op, and this way the sweep does not depend on has_function_privilege()
--    resolving the PUBLIC pseudo-role correctly.
-- -----------------------------------------------------------------------------
do $$
declare
    r record;
    v_count integer := 0;
begin
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and not exists (
              select 1 from pg_depend d
              where d.objid = p.oid
                and d.classid = 'pg_proc'::regclass
                and d.deptype = 'e'
          )
    loop
        execute format('revoke all on function %s from public', r.sig);
        v_count := v_count + 1;
    end loop;

    raise notice 'PUBLIC execute revoked on % function(s)', v_count;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Re-assert the grants the client genuinely needs
--
--    Step 2 only revokes from PUBLIC, so these should already be intact. Re-stating
--    them makes this file safe to run standalone, and makes the allowlist visible in
--    one place rather than only in 120400.
-- -----------------------------------------------------------------------------
grant execute on function public.is_admin(uuid)          to anon, authenticated;
grant execute on function public.get_fee_schedule()      to anon, authenticated;
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

grant execute on function public.approve_deposit(uuid)          to service_role;
grant execute on function public.reject_deposit(uuid, text)     to service_role;
grant execute on function public.approve_withdrawal(uuid)       to service_role;
grant execute on function public.reject_withdrawal(uuid, text)  to service_role;
grant execute on function public.approve_kyc_request(uuid)      to service_role;
grant execute on function public.reject_kyc_request(uuid, text) to service_role;
grant execute on function public.log_admin_action(text, text, uuid, numeric, text, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;

select 'Phase 0 / 5.5 of 5 — legacy functions hardened. Re-run 120500_verify.' as result;
