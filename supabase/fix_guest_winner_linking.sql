-- =============================================
-- FIX GUEST WINNER LINKING
-- Run this in Supabase SQL Editor
-- =============================================

CREATE OR REPLACE FUNCTION public.link_guest_to_user(p_fingerprint_id TEXT)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_linked_count INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- 1. Link all guest participations with this fingerprint to the new user_id
    UPDATE public.guest_participants
    SET 
        linked_user_id = v_user_id,
        linked_at = NOW()
    WHERE 
        fingerprint_id = p_fingerprint_id
        AND linked_user_id IS NULL;
    
    GET DIAGNOSTICS v_linked_count = ROW_COUNT;
    
    -- 2. Migrate guest participant entries to the REAL giveaway_participants table
    -- This ensures both live AND ended giveaways have the real participant record
    INSERT INTO public.giveaway_participants (
        giveaway_id, user_id, score, taps, best_streak, joined_at, completed_at, device_fingerprint_id, is_winner
    )
    SELECT 
        gp.giveaway_id, v_user_id, gp.score, gp.taps, gp.best_streak, 
        gp.joined_at, gp.completed_at, gp.fingerprint_id, gp.is_winner
    FROM public.guest_participants gp
    WHERE 
        gp.fingerprint_id = p_fingerprint_id
        AND gp.linked_user_id = v_user_id
    ON CONFLICT (giveaway_id, user_id) DO UPDATE
    SET 
        score = EXCLUDED.score,
        taps = EXCLUDED.taps,
        best_streak = EXCLUDED.best_streak,
        completed_at = LEAST(public.giveaway_participants.completed_at, EXCLUDED.completed_at),
        is_winner = public.giveaway_participants.is_winner OR EXCLUDED.is_winner;

    -- 3. Update the global giveaway winner_id reference if they won
    UPDATE public.giveaways
    SET winner_id = v_user_id
    WHERE 
        winner_fingerprint_id = p_fingerprint_id 
        AND winner_id IS NULL;
        
    -- 4. Update the combined leaderboard view to ensure clean reads
    -- (This isn't strictly necessary but ensures no cache delays)
    
    -- 5. If this guest was a winner of an ended giveaway, increment their total_wins on their profile
    -- We do this by checking if any of the migrated records were winners
    UPDATE public.profiles
    SET total_wins = total_wins + (
        SELECT COUNT(*) FROM public.guest_participants
        WHERE fingerprint_id = p_fingerprint_id AND linked_user_id = v_user_id AND is_winner = true
    )
    WHERE id = v_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'linked_count', v_linked_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.link_guest_to_user(TEXT) TO anon, authenticated;

SELECT 'Guest-to-User linking fixed for prize claiming!' as result;
