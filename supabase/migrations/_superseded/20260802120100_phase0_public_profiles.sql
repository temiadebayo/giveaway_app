-- =============================================================================
-- PHASE 0 / 2 of 5 — PII CONTAINMENT ON public.profiles
--
-- Problem this fixes (P0-6):
--   fix_permissions.sql created:  create policy "Anyone can view profiles" using (true)
--   fix_postgrest_permissions.sql created:  grant all on profiles to anon, authenticated
--   public.profiles holds email, phone, bank_name, account_name, account_number,
--   is_banned, ban_reason, trust_score, total_winnings.
--   => any anonymous visitor could enumerate the entire user base, with bank details,
--      straight off the PostgREST endpoint.
--
-- Approach:
--   The row-level policy stays permissive. That is deliberate — PostgREST embeds
--   (`host:profiles!host_id(username, display_name, avatar_url)`) and the
--   combined_leaderboard join both depend on cross-user row visibility, and a
--   restrictive row policy would silently break every giveaway card.
--
--   Instead the protection is COLUMN-level. anon/authenticated may read only the
--   seven columns that are genuinely public. Everything else is reachable only
--   through get_my_profile(), which returns the caller's own row and nothing else.
--
--   Verified against the client before writing: every cross-user read in the app
--   selects only from the public set. The three call sites that need the private
--   columns (settings, wallet, trust-service) all read the *caller's own* row and
--   are migrated to the RPC.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Reset column privileges on profiles
--
--    Revoke wholesale, then re-grant the public column set. Any column added to
--    profiles in future is therefore private by default, which is the behaviour we want.
-- -----------------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;

-- Public identity surface. Everything a leaderboard, giveaway card or lobby needs.
grant select (
    id,
    username,
    display_name,
    avatar_url,
    trust_tier,
    total_wins,
    created_at
) on public.profiles to anon, authenticated;

-- Deliberately NOT granted to anon/authenticated:
--   email, phone, bank_name, account_name, account_number  (direct PII / payout data)
--   is_banned, ban_reason                                  (moderation state)
--   trust_score, total_winnings, withdrawal_limit          (enables targeting high-value users)
--   id_verified, phone_verified, accepted_tos, is_host     (account state)
--   notification_preferences, privacy_settings             (personal settings)

-- -----------------------------------------------------------------------------
-- 2. get_my_profile() — the caller's own complete row
--
--    security definer so it can read the columns revoked above, but it can only
--    ever return the row belonging to auth.uid(). There is no parameter, by design:
--    a function that takes a user_id is a function someone will eventually pass
--    someone else's user_id to.
-- -----------------------------------------------------------------------------
create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.* from public.profiles p where p.id = auth.uid();
$$;

comment on function public.get_my_profile() is
    'Returns the calling user''s own profile row in full, including columns that are '
    'column-revoked from anon/authenticated. Takes no arguments on purpose.';

-- -----------------------------------------------------------------------------
-- 3. Row policies — tidy up the duplicates left by the legacy fix_* scripts
--
--    Three different files each created their own "view profiles" policy. RLS ORs
--    all permissive policies together, so the loosest one wins; collapse to one.
-- -----------------------------------------------------------------------------
drop policy if exists "Anyone can view profiles"   on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;

create policy "Profiles are readable" on public.profiles
    for select using (true);

comment on policy "Profiles are readable" on public.profiles is
    'Row visibility is intentionally open; confidentiality is enforced by column-level '
    'GRANTs, not by this policy. Do not add sensitive columns to the public grant list.';

-- Write policy: self only, and with an explicit WITH CHECK.
-- The legacy policy had USING but no WITH CHECK. Postgres then reuses USING for the
-- check, which happened to be safe here, but relying on that is not something to leave
-- implicit on a table that gates trust tier and payout details.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles
    for insert with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 4. public_profiles view
--
--    Not used by the current client (the column grants already make plain
--    `profiles` safe to embed), but it gives future code — and the Phase 2 social
--    features — an unambiguous "this is the public shape of a user" contract to
--    build against, instead of hand-picking columns at each call site.
-- -----------------------------------------------------------------------------
create or replace view public.public_profiles as
select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.trust_tier,
    p.total_wins,
    p.created_at
from public.profiles p;

grant select on public.public_profiles to anon, authenticated;

commit;

select 'Phase 0 / 2 of 5 — profiles PII contained behind column grants + get_my_profile()' as result;
