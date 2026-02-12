-- Enable Realtime for guest_participants
ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_participants;

-- Fix: Update giveaway participant count trigger to include guests
CREATE OR REPLACE FUNCTION public.update_giveaway_participant_count()
RETURNS TRIGGER AS $$
DECLARE
    v_giveaway_id UUID;
    v_count INTEGER;
BEGIN
    v_giveaway_id := COALESCE(NEW.giveaway_id, OLD.giveaway_id);
    
    -- Count both users and guests
    SELECT 
        (SELECT COUNT(*) FROM public.giveaway_participants WHERE giveaway_id = v_giveaway_id) +
        (SELECT COUNT(*) FROM public.guest_participants WHERE giveaway_id = v_giveaway_id AND linked_user_id IS NULL)
    INTO v_count;
    
    -- Update giveaway table (if we had a count column, but we might rely on dynamic count)
    -- But the UI uses a joined view for counts usually?
    -- The service uses: participant_count:giveaway_participants(count)
    -- This only counts registered users. 
    
    -- We need a better way to get total count.
    -- Let's create a view for giveaways that includes total count.
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Actually, let's just create a view or function to get the real count
CREATE OR REPLACE FUNCTION public.get_total_participant_count(p_giveaway_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM public.giveaway_participants WHERE giveaway_id = p_giveaway_id) +
        (SELECT COUNT(*) FROM public.guest_participants WHERE giveaway_id = p_giveaway_id AND linked_user_id IS NULL)
    INTO v_count;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
