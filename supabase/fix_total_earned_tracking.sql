-- =============================================
-- UPDATE: TRACK TOTAL EARNED IN PROFILES
-- =============================================

CREATE OR REPLACE FUNCTION public.finalize_giveaway(giveaway_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    winner_record RECORD;
    v_prize_amount DECIMAL(10,2);
    result JSONB;
BEGIN
    -- Get the prize amount first
    SELECT prize_amount INTO v_prize_amount
    FROM public.giveaways
    WHERE id = giveaway_uuid;

    -- Get the top scorer
    SELECT p.user_id, p.score, pr.username, pr.display_name
    INTO winner_record
    FROM public.giveaway_participants p
    JOIN public.profiles pr ON p.user_id = pr.id
    WHERE p.giveaway_id = giveaway_uuid
    ORDER BY p.score DESC, p.completed_at ASC
    LIMIT 1;
    
    IF winner_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No participants');
    END IF;
    
    -- Update giveaway with winner
    UPDATE public.giveaways
    SET 
        status = 'ended',
        winner_id = winner_record.user_id,
        winning_score = winner_record.score,
        ends_at = NOW(),
        updated_at = NOW()
    WHERE id = giveaway_uuid;
    
    -- Mark winner in participants
    UPDATE public.giveaway_participants
    SET is_winner = true
    WHERE giveaway_id = giveaway_uuid AND user_id = winner_record.user_id;
    
    -- Update winner's profile (NOW INCLUDING TOTAL_WINNINGS)
    UPDATE public.profiles
    SET 
        total_wins = total_wins + 1,
        total_winnings = total_winnings + COALESCE(v_prize_amount, 0),
        updated_at = NOW()
    WHERE id = winner_record.user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'winner_id', winner_record.user_id,
        'winner_username', winner_record.username,
        'winning_score', winner_record.score,
        'prize_awarded', v_prize_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
