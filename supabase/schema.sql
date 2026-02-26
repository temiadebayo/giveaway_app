-- =============================================
-- GIVEAWAY APP - TRUST SCORE SYSTEM SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. PROFILES TABLE (extends Supabase auth.users)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    email TEXT,
    phone TEXT,
    phone_verified BOOLEAN DEFAULT false,
    id_verified BOOLEAN DEFAULT false,
    trust_score INTEGER DEFAULT 20 CHECK (trust_score >= 0 AND trust_score <= 100),
    trust_tier TEXT DEFAULT 'bronze' CHECK (trust_tier IN ('bronze', 'silver', 'gold', 'diamond')),
    total_wins INTEGER DEFAULT 0,
    total_winnings DECIMAL(10,2) DEFAULT 0,
    withdrawal_limit DECIMAL(10,2) DEFAULT 50,
    is_host BOOLEAN DEFAULT false,
    is_banned BOOLEAN DEFAULT false,
    ban_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- =============================================
-- 2. DEVICE FINGERPRINTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fingerprint_hash TEXT UNIQUE NOT NULL,
    canvas_hash TEXT,
    webgl_info JSONB,
    audio_hash TEXT,
    screen_info TEXT,
    confidence INTEGER DEFAULT 0,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    times_seen INTEGER DEFAULT 1,
    is_flagged BOOLEAN DEFAULT false,
    flag_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage fingerprints
DROP POLICY IF EXISTS "Service role can manage fingerprints" ON public.device_fingerprints;
CREATE POLICY "Service role can manage fingerprints" ON public.device_fingerprints
    FOR ALL USING (true);

-- =============================================
-- 3. USER DEVICES TABLE (links users to devices)
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    fingerprint_id UUID REFERENCES public.device_fingerprints(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    is_primary BOOLEAN DEFAULT false,
    trust_contribution INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fingerprint_id)
);

-- Enable RLS
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own devices" ON public.user_devices;
CREATE POLICY "Users can view own devices" ON public.user_devices
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- 4. TRUST EVENTS TABLE (score changelog)
-- =============================================
CREATE TABLE IF NOT EXISTS public.trust_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    score_before INTEGER NOT NULL,
    score_after INTEGER NOT NULL,
    score_change INTEGER NOT NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.trust_events ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view own trust events" ON public.trust_events;
CREATE POLICY "Users can view own trust events" ON public.trust_events
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- 5. FRAUD ALERTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.fraud_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id),
    device_id UUID REFERENCES public.device_fingerprints(id),
    alert_type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT,
    evidence JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'false_positive')),
    reviewed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. FUNCTION: Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, username, display_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 7. FUNCTION: Update trust tier based on score
-- =============================================
CREATE OR REPLACE FUNCTION public.update_trust_tier()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate tier based on score
    NEW.trust_tier := CASE
        WHEN NEW.trust_score >= 86 THEN 'diamond'
        WHEN NEW.trust_score >= 61 THEN 'gold'
        WHEN NEW.trust_score >= 31 THEN 'silver'
        ELSE 'bronze'
    END;
    
    -- Update withdrawal limits based on tier
    NEW.withdrawal_limit := CASE
        WHEN NEW.trust_tier = 'diamond' THEN 10000
        WHEN NEW.trust_tier = 'gold' THEN 2000
        WHEN NEW.trust_tier = 'silver' THEN 500
        ELSE 50
    END;
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto tier update
DROP TRIGGER IF EXISTS on_trust_score_change ON public.profiles;
CREATE TRIGGER on_trust_score_change
    BEFORE UPDATE OF trust_score ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_trust_tier();

-- =============================================
-- 8. FUNCTION: Log trust score changes
-- =============================================
CREATE OR REPLACE FUNCTION public.log_trust_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.trust_score IS DISTINCT FROM NEW.trust_score THEN
        INSERT INTO public.trust_events (
            user_id,
            event_type,
            score_before,
            score_after,
            score_change,
            reason
        ) VALUES (
            NEW.id,
            'score_update',
            OLD.trust_score,
            NEW.trust_score,
            NEW.trust_score - OLD.trust_score,
            'Trust score updated'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for logging
DROP TRIGGER IF EXISTS on_trust_score_log ON public.profiles;
CREATE TRIGGER on_trust_score_log
    AFTER UPDATE OF trust_score ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.log_trust_change();

-- =============================================
-- 9. INDEXES for performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_profiles_trust_tier ON public.profiles(trust_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_trust_score ON public.profiles(trust_score);
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_hash ON public.device_fingerprints(fingerprint_hash);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fingerprint_id ON public.user_devices(fingerprint_id);
CREATE INDEX IF NOT EXISTS idx_trust_events_user_id ON public.trust_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user_id ON public.fraud_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status ON public.fraud_alerts(status);

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

-- Policies
DROP POLICY IF EXISTS "Anyone can view active giveaways" ON public.giveaways;
CREATE POLICY "Anyone can view active giveaways" ON public.giveaways
    FOR SELECT USING (status IN ('scheduled', 'live', 'ended'));

DROP POLICY IF EXISTS "Hosts can manage own giveaways" ON public.giveaways;
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

-- Policies
DROP POLICY IF EXISTS "Users can view participants in their giveaways" ON public.giveaway_participants;
CREATE POLICY "Users can view participants in their giveaways" ON public.giveaway_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.giveaways 
            WHERE id = giveaway_id AND status IN ('live', 'ended')
        )
    );

DROP POLICY IF EXISTS "Users can manage own participation" ON public.giveaway_participants;
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
