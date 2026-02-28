-- Fix permissions for giveaway related tables and views
-- This ensures PostgREST can access these for both anon and authenticated users

-- Tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giveaway_participants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_participants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giveaways TO anon, authenticated;

-- Views
GRANT SELECT ON public.combined_leaderboard TO anon, authenticated;

-- In case functions also need to be accessible
GRANT EXECUTE ON FUNCTION public.link_guest_to_user(TEXT) TO anon, authenticated;

-- Ensure RLS is enabled on views to use the underlying table RLS if possible
-- (Views without security invoker run as definer, meaning they bypass underlying table RLS)
-- Since we want leaderboard visible to everyone, we can just grant SELECT.
