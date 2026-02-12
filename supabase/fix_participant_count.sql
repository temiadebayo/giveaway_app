-- =============================================
-- FIX PARTICIPANT COUNT
-- Creates a computed column to count total participants (users + guests)
-- =============================================

-- computed column function: giveaways.participant_count
CREATE OR REPLACE FUNCTION public.participant_count(giveaway_row public.giveaways)
RETURNS bigint AS $$
  SELECT (
    -- Count registered participants
    (SELECT count(*) FROM public.giveaway_participants WHERE giveaway_id = giveaway_row.id) +
    -- Count UNLINKED guest participants (to avoid double counting linked users)
    (SELECT count(*) FROM public.guest_participants WHERE giveaway_id = giveaway_row.id AND linked_user_id IS NULL)
  );
$$ LANGUAGE sql STABLE;

-- Grant execute permission to everyone
GRANT EXECUTE ON FUNCTION public.participant_count(public.giveaways) TO postgres, anon, authenticated, service_role;

SELECT 'Participant count function created!' as result;
