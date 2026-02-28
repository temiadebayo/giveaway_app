-- =============================================
-- COMPREHENSIVE FIX: 403 Forbidden for Guest Participants & Leaderboard
-- Run this in the Supabase SQL Editor
-- This single file consolidates all permission fixes.
-- =============================================

-- =============================================
-- 1. PostgREST-Level Table Grants
-- Without these, the API returns 403 even if RLS would allow access.
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giveaways TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giveaway_participants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_participants TO anon, authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO authenticated, service_role;

-- Views
GRANT SELECT ON public.combined_leaderboard TO anon, authenticated, service_role;

-- Functions
GRANT EXECUTE ON FUNCTION public.link_guest_to_user(TEXT) TO anon, authenticated;

-- =============================================
-- 2. RLS Policies for PROFILES (critical for leaderboard joins)
-- The original schema only lets you view YOUR OWN profile (auth.uid() = id).
-- Guests (anon) have auth.uid() = NULL, so they can't see any profiles,
-- which breaks the leaderboard join on profiles.
-- =============================================
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles
    FOR SELECT USING (true);

-- Keep the existing write policies (users can insert/update own profile)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- 3. RLS Policies for GIVEAWAYS
-- Allow anon users to view scheduled/live/ended giveaways.
-- Hosts can always see their own (including drafts).
-- =============================================
DROP POLICY IF EXISTS "View giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Anyone can view active giveaways" ON public.giveaways;
CREATE POLICY "View giveaways" ON public.giveaways
    FOR SELECT USING (
        status IN ('scheduled', 'live', 'ended')
        OR auth.uid() = host_id
    );

-- Host write policies
DROP POLICY IF EXISTS "Hosts can manage own giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Hosts can insert giveaways" ON public.giveaways;
CREATE POLICY "Hosts can insert giveaways" ON public.giveaways
    FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts can update own giveaways" ON public.giveaways;
CREATE POLICY "Hosts can update own giveaways" ON public.giveaways
    FOR UPDATE USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts can delete own giveaways" ON public.giveaways;
CREATE POLICY "Hosts can delete own giveaways" ON public.giveaways
    FOR DELETE USING (auth.uid() = host_id);

-- =============================================
-- 4. RLS Policies for GIVEAWAY_PARTICIPANTS
-- Anyone (including anon) can view participants in active giveaways.
-- Only authenticated users can write their own participation.
-- =============================================
DROP POLICY IF EXISTS "Users can view participants in their giveaways" ON public.giveaway_participants;
CREATE POLICY "Users can view participants in their giveaways" ON public.giveaway_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.giveaways
            WHERE id = giveaway_id AND status IN ('scheduled', 'live', 'ended')
        )
    );

DROP POLICY IF EXISTS "Users can manage own participation" ON public.giveaway_participants;
CREATE POLICY "Users can manage own participation" ON public.giveaway_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own participation" ON public.giveaway_participants;
CREATE POLICY "Users can update own participation" ON public.giveaway_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- 5. RLS Policies for GUEST_PARTICIPANTS
-- Anyone can read (for leaderboard), anyone can insert (for joining).
-- =============================================
DROP POLICY IF EXISTS "Guest participants are viewable" ON public.guest_participants;
CREATE POLICY "Guest participants are viewable" ON public.guest_participants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can join as guest" ON public.guest_participants;
CREATE POLICY "Anyone can join as guest" ON public.guest_participants
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Guests can update own participation" ON public.guest_participants;
CREATE POLICY "Guests can update own participation" ON public.guest_participants
    FOR UPDATE USING (
        linked_user_id = auth.uid()
        OR auth.uid() IS NULL  -- Allow unauthenticated updates (controlled by app logic)
    );

-- =============================================
-- 6. COMBINED LEADERBOARD VIEW
-- Re-create the view and grant access to everyone.
-- =============================================
CREATE OR REPLACE VIEW public.combined_leaderboard AS
SELECT
    p.giveaway_id,
    p.id as participation_id,
    'user' as participant_type,
    p.user_id,
    NULL::TEXT as fingerprint_id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.trust_tier,
    p.score,
    p.taps,
    p.best_streak,
    p.joined_at,
    p.completed_at,
    p.is_winner
FROM public.giveaway_participants p
JOIN public.profiles pr ON pr.id = p.user_id

UNION ALL

SELECT
    gp.giveaway_id,
    gp.id as participation_id,
    'guest' as participant_type,
    gp.linked_user_id as user_id,
    gp.fingerprint_id,
    COALESCE(gp.guest_name, 'Guest ' || SUBSTRING(gp.fingerprint_id, 1, 6)) as username,
    gp.guest_name as display_name,
    NULL::TEXT as avatar_url,
    'new'::TEXT as trust_tier,
    gp.score,
    gp.taps,
    gp.best_streak,
    gp.joined_at,
    gp.completed_at,
    false as is_winner
FROM public.guest_participants gp
WHERE gp.linked_user_id IS NULL;

GRANT SELECT ON public.combined_leaderboard TO anon, authenticated, service_role;

-- =============================================
-- 7. Ensure Realtime is enabled for participant tables
-- CRITICAL: Both tables must be in the publication for
-- the host lobby to receive INSERT events when users join.
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'guest_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_participants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'giveaway_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.giveaway_participants;
  END IF;
END
$$;

-- =============================================
-- Done!
-- =============================================
SELECT 'All guest/leaderboard permissions fixed!' as result;
