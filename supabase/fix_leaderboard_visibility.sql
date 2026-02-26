-- FIX LEADERBOARD VISIBILITY
-- Run this in the Supabase SQL Editor

-- 1. Enable Realtime for guest_participants (CRITICAL for live updates)
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
END
$$;

-- 2. Update the combined_leaderboard view to include 'trust_tier'
-- This fixes the issue where the code expects a 'trust_tier' column but the view didn't have it
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
    pr.trust_tier,  -- Added this column
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
    'new'::TEXT as trust_tier, -- Added this column (default for guests)
    gp.score,
    gp.taps,
    gp.best_streak,
    gp.joined_at,
    gp.completed_at,
    false as is_winner
FROM public.guest_participants gp
WHERE gp.linked_user_id IS NULL;

-- 3. Verify permissions (Ensure the API can read this view)
GRANT SELECT ON public.combined_leaderboard TO anon, authenticated, service_role;

SELECT 'Leaderboard view updated and Realtime enabled!' as result;  
