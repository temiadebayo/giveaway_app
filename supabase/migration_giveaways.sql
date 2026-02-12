-- =============================================
-- GIVEAWAY APP - MIGRATION: Add Giveaway Tables
-- Run this if you already have profiles/trust tables
-- =============================================

-- =============================================
-- 10. GIVEAWAYS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.giveaways (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    prize_amount DECIMAL(10,2) NOT NULL,
    prize_currency TEXT DEFAULT 'USD',
    game_type TEXT DEFAULT 'tap' CHECK (game_type IN ('tap', 'quiz', 'spin')),
    game_duration_seconds INTEGER DEFAULT 30,
    min_trust_tier TEXT DEFAULT 'bronze' CHECK (min_trust_tier IN ('bronze', 'silver', 'gold', 'diamond')),
    max_participants INTEGER DEFAULT 100,
    entry_fee DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'live', 'ended', 'cancelled')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    winner_id UUID REFERENCES public.profiles(id),
    winning_score INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view active giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Hosts can manage own giveaways" ON public.giveaways;

-- Policies
CREATE POLICY "Anyone can view active giveaways" ON public.giveaways
    FOR SELECT USING (status IN ('scheduled', 'live', 'ended'));

CREATE POLICY "Hosts can manage own giveaways" ON public.giveaways
    FOR ALL USING (auth.uid() = host_id);

-- =============================================
-- 11. GIVEAWAY PARTICIPANTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.giveaway_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    giveaway_id UUID REFERENCES public.giveaways(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_fingerprint_id UUID REFERENCES public.device_fingerprints(id),
    score INTEGER DEFAULT 0,
    taps INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    rank INTEGER,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    is_winner BOOLEAN DEFAULT false,
    UNIQUE(giveaway_id, user_id)
);

-- Enable RLS
ALTER TABLE public.giveaway_participants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view participants in their giveaways" ON public.giveaway_participants;
DROP POLICY IF EXISTS "Users can manage own participation" ON public.giveaway_participants;

-- Policies
CREATE POLICY "Users can view participants in their giveaways" ON public.giveaway_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.giveaways 
            WHERE id = giveaway_id AND status IN ('live', 'ended')
        )
    );

CREATE POLICY "Users can manage own participation" ON public.giveaway_participants
    FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- 12. FUNCTION: Update participant rank
-- =============================================
CREATE OR REPLACE FUNCTION public.update_participant_rank()
RETURNS TRIGGER AS $$
BEGIN
    -- Update ranks for all participants in this giveaway
    WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC, completed_at ASC) as new_rank
        FROM public.giveaway_participants
        WHERE giveaway_id = NEW.giveaway_id
    )
    UPDATE public.giveaway_participants p
    SET rank = r.new_rank
    FROM ranked r
    WHERE p.id = r.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for rank updates
DROP TRIGGER IF EXISTS on_score_update ON public.giveaway_participants;
CREATE TRIGGER on_score_update
    AFTER UPDATE OF score ON public.giveaway_participants
    FOR EACH ROW EXECUTE FUNCTION public.update_participant_rank();

-- =============================================
-- 13. FUNCTION: Finalize giveaway and pick winner
-- =============================================
CREATE OR REPLACE FUNCTION public.finalize_giveaway(giveaway_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    winner_record RECORD;
    result JSONB;
BEGIN
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
    
    -- Update winner's profile
    UPDATE public.profiles
    SET 
        total_wins = total_wins + 1,
        updated_at = NOW()
    WHERE id = winner_record.user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'winner_id', winner_record.user_id,
        'winner_username', winner_record.username,
        'winning_score', winner_record.score
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 14. INDEXES for giveaways
-- =============================================
CREATE INDEX IF NOT EXISTS idx_giveaways_status ON public.giveaways(status);
CREATE INDEX IF NOT EXISTS idx_giveaways_host_id ON public.giveaways(host_id);
CREATE INDEX IF NOT EXISTS idx_giveaways_starts_at ON public.giveaways(starts_at);
CREATE INDEX IF NOT EXISTS idx_participants_giveaway_id ON public.giveaway_participants(giveaway_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON public.giveaway_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_score ON public.giveaway_participants(score DESC);

-- =============================================
-- 15. ENABLE REALTIME for leaderboards
-- =============================================
DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.giveaway_participants;
EXCEPTION WHEN duplicate_object THEN
    -- Already added
END $$;

DO $$ 
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.giveaways;
EXCEPTION WHEN duplicate_object THEN
    -- Already added
END $$;

-- Done!
SELECT 'Migration complete! Giveaway tables created.' as result;
