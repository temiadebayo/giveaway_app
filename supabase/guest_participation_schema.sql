-- =============================================
-- GUEST PARTICIPATION SCHEMA
-- Allows guests to participate in giveaways with fingerprint ID
-- Full account required to claim prizes
-- =============================================

-- =============================================
-- 1. GUEST PARTICIPANTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.guest_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    giveaway_id UUID REFERENCES public.giveaways(id) ON DELETE CASCADE,
    fingerprint_id TEXT NOT NULL,  -- Device fingerprint for guest
    guest_name TEXT,  -- Optional nickname
    score INTEGER DEFAULT 0,
    taps INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Link to user account when they sign up
    linked_user_id UUID REFERENCES public.profiles(id),
    linked_at TIMESTAMPTZ,
    
    UNIQUE(giveaway_id, fingerprint_id)
);

-- Enable RLS
ALTER TABLE public.guest_participants ENABLE ROW LEVEL SECURITY;

-- Anyone can read (for leaderboard)
DROP POLICY IF EXISTS "Guest participants are viewable" ON public.guest_participants;
CREATE POLICY "Guest participants are viewable" ON public.guest_participants
    FOR SELECT USING (true);

-- Anyone can insert (for joining)
DROP POLICY IF EXISTS "Anyone can join as guest" ON public.guest_participants;
CREATE POLICY "Anyone can join as guest" ON public.guest_participants
    FOR INSERT WITH CHECK (true);

-- Update by fingerprint match (unauthenticated) or linked user
DROP POLICY IF EXISTS "Guests can update own participation" ON public.guest_participants;
CREATE POLICY "Guests can update own participation" ON public.guest_participants
    FOR UPDATE USING (
        linked_user_id = auth.uid() OR
        auth.uid() IS NULL  -- Allow unauthenticated updates (controlled by app logic)
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guest_participants_giveaway ON public.guest_participants(giveaway_id);
CREATE INDEX IF NOT EXISTS idx_guest_participants_fingerprint ON public.guest_participants(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_guest_participants_linked_user ON public.guest_participants(linked_user_id);

-- =============================================
-- 2. FUNCTION: Link guest to user account
-- Called when guest signs up / logs in
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
    
    -- Link all guest participations with this fingerprint to the user
    UPDATE public.guest_participants
    SET 
        linked_user_id = v_user_id,
        linked_at = NOW()
    WHERE 
        fingerprint_id = p_fingerprint_id
        AND linked_user_id IS NULL;
    
    GET DIAGNOSTICS v_linked_count = ROW_COUNT;
    
    -- Also migrate guest participant entries to real participants table
    -- for any giveaways that are still active
    INSERT INTO public.giveaway_participants (
        giveaway_id, user_id, score, taps, best_streak, joined_at, completed_at, device_fingerprint_id
    )
    SELECT 
        gp.giveaway_id, v_user_id, gp.score, gp.taps, gp.best_streak, 
        gp.joined_at, gp.completed_at, gp.fingerprint_id
    FROM public.guest_participants gp
    JOIN public.giveaways g ON g.id = gp.giveaway_id
    WHERE 
        gp.fingerprint_id = p_fingerprint_id
        AND gp.linked_user_id = v_user_id
        AND g.status IN ('live', 'scheduled')
    ON CONFLICT (giveaway_id, user_id) DO UPDATE
    SET 
        score = EXCLUDED.score,
        taps = EXCLUDED.taps,
        best_streak = EXCLUDED.best_streak,
        completed_at = EXCLUDED.completed_at;
    
    RETURN jsonb_build_object(
        'success', true,
        'linked_count', v_linked_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. VIEW: Combined leaderboard (guests + users)
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
WHERE gp.linked_user_id IS NULL;  -- Only show unlinked guests

-- =============================================
-- 4. ADD SHARE URL TO GIVEAWAYS
-- =============================================
ALTER TABLE public.giveaways 
ADD COLUMN IF NOT EXISTS share_code TEXT UNIQUE;

-- Generate share code for new giveaways
CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS TRIGGER AS $$
BEGIN
    NEW.share_code := LOWER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT) FOR 8));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generate_giveaway_share_code ON public.giveaways;
CREATE TRIGGER generate_giveaway_share_code
    BEFORE INSERT ON public.giveaways
    FOR EACH ROW EXECUTE FUNCTION public.generate_share_code();

-- Update existing giveaways with share codes
UPDATE public.giveaways 
SET share_code = LOWER(SUBSTRING(MD5(id::TEXT || created_at::TEXT) FOR 8))
WHERE share_code IS NULL;

-- =============================================
-- Done!
-- =============================================
SELECT 'Guest participation schema created!' as result;
