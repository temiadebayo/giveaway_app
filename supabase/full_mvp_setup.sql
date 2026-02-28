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
            bank_name TEXT,
            account_name TEXT,
            account_number TEXT,
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
            number_of_winners INTEGER DEFAULT 1 CHECK (number_of_winners >= 1),
            prevent_previous_winners_hours INTEGER DEFAULT 0 CHECK (prevent_previous_winners_hours >= 0),
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
        -- =============================================
        -- GIVEAWAY APP - WALLET SYSTEM SCHEMA
        -- Run this in Supabase SQL Editor
        -- =============================================

        -- =============================================
        -- 1. WALLETS TABLE
        -- =============================================
        CREATE TABLE IF NOT EXISTS public.wallets (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
            balance DECIMAL(12,2) DEFAULT 0 CHECK (balance >= 0),
            escrow_balance DECIMAL(12,2) DEFAULT 0 CHECK (escrow_balance >= 0),  -- Funds held for active giveaways
            total_earned DECIMAL(12,2) DEFAULT 0,
            total_withdrawn DECIMAL(12,2) DEFAULT 0,
            total_deposited DECIMAL(12,2) DEFAULT 0,
            currency TEXT DEFAULT 'USD',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Enable RLS
        ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

        -- Policies
        DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
        CREATE POLICY "Users can view own wallet" ON public.wallets
            FOR SELECT USING (auth.uid() = user_id);

        DROP POLICY IF EXISTS "Users can update own wallet" ON public.wallets;
        CREATE POLICY "Users can update own wallet" ON public.wallets
            FOR UPDATE USING (auth.uid() = user_id);

        -- =============================================
        -- 2. WALLET TRANSACTIONS TABLE
        -- =============================================
        CREATE TABLE IF NOT EXISTS public.wallet_transactions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
            user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK (type IN (
                'deposit',           -- Adding funds
                'withdrawal',        -- Cashing out
                'withdrawal_fee',    -- Platform fee on withdrawal
                'prize_escrow',      -- Host funds held for giveaway
                'prize_release',     -- Prize given to winner
                'prize_refund',      -- Prize returned (cancelled giveaway)
                'entry_fee',         -- Participant entry fee
                'platform_fee'       -- Platform cut
            )),
            amount DECIMAL(12,2) NOT NULL,
            fee DECIMAL(12,2) DEFAULT 0,
            net_amount DECIMAL(12,2) NOT NULL,  -- Amount after fees
            balance_before DECIMAL(12,2) NOT NULL,
            balance_after DECIMAL(12,2) NOT NULL,
            status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
            reference_type TEXT,  -- 'giveaway', 'withdrawal', etc.
            reference_id UUID,    -- ID of related entity
            description TEXT,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Enable RLS
        ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

        -- Policies
        DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
        CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
            FOR SELECT USING (auth.uid() = user_id);

        -- Indexes for performance
        CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
        CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(type);
        CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);

        -- =============================================
        -- 3. WITHDRAWAL REQUESTS TABLE
        -- =============================================
        CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
            wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE,
            amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
            fee DECIMAL(12,2) NOT NULL,
            net_amount DECIMAL(12,2) NOT NULL,  -- Amount after fee
            fee_percentage DECIMAL(5,2) NOT NULL,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
            payout_method TEXT,  -- 'bank_transfer', 'paypal', etc.
            payout_details JSONB,  -- Account info (encrypted)
            hold_until TIMESTAMPTZ,  -- Anti-fraud hold period
            processed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Enable RLS
        ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.withdrawal_requests;
        CREATE POLICY "Users can view own withdrawals" ON public.withdrawal_requests
            FOR SELECT USING (auth.uid() = user_id);

        DROP POLICY IF EXISTS "Users can create withdrawals" ON public.withdrawal_requests;
        CREATE POLICY "Users can create withdrawals" ON public.withdrawal_requests
            FOR INSERT WITH CHECK (auth.uid() = user_id);

        -- =============================================
        -- 4. ESCROW TABLE (For giveaway prizes)
        -- =============================================
        CREATE TABLE IF NOT EXISTS public.escrow (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            giveaway_id UUID REFERENCES public.giveaways(id) ON DELETE CASCADE UNIQUE,
            host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
            amount DECIMAL(12,2) NOT NULL,
            status TEXT DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded')),
            released_to UUID REFERENCES public.profiles(id),  -- Winner
            released_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Enable RLS
        ALTER TABLE public.escrow ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Users can view own escrow" ON public.escrow;
        CREATE POLICY "Users can view own escrow" ON public.escrow
            FOR SELECT USING (auth.uid() = host_id OR auth.uid() = released_to);

        -- =============================================
        -- 5. FUNCTION: Create wallet on user signup
        -- =============================================
        CREATE OR REPLACE FUNCTION public.create_wallet_for_user()
        RETURNS TRIGGER AS $$
        BEGIN
            INSERT INTO public.wallets (user_id)
            VALUES (NEW.id)
            ON CONFLICT (user_id) DO NOTHING;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- Trigger for new profiles
        DROP TRIGGER IF EXISTS on_profile_created_create_wallet ON public.profiles;
        CREATE TRIGGER on_profile_created_create_wallet
            AFTER INSERT ON public.profiles
            FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_user();

        -- =============================================
        -- 6. FUNCTION: Process withdrawal request
        -- =============================================
        CREATE OR REPLACE FUNCTION public.request_withdrawal(
            p_amount DECIMAL,
            p_fee_percentage DECIMAL DEFAULT 3.0,
            p_hold_hours INTEGER DEFAULT 48
        )
        RETURNS JSONB AS $$
        DECLARE
            v_wallet RECORD;
            v_fee DECIMAL;
            v_net_amount DECIMAL;
            v_withdrawal_id UUID;
        BEGIN
            -- Get user's wallet
            SELECT * INTO v_wallet
            FROM public.wallets
            WHERE user_id = auth.uid();
            
            IF v_wallet IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
            END IF;
            
            -- Check balance
            IF v_wallet.balance < p_amount THEN
                RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
            END IF;
            
            -- Calculate fee
            v_fee := ROUND(p_amount * (p_fee_percentage / 100), 2);
            v_net_amount := p_amount - v_fee;
            
            -- Deduct from wallet
            UPDATE public.wallets
            SET 
                balance = balance - p_amount,
                updated_at = NOW()
            WHERE id = v_wallet.id;
            
            -- Create withdrawal request
            INSERT INTO public.withdrawal_requests (
                user_id, wallet_id, amount, fee, net_amount, fee_percentage, 
                hold_until, status
            )
            VALUES (
                auth.uid(), v_wallet.id, p_amount, v_fee, v_net_amount, p_fee_percentage,
                NOW() + (p_hold_hours || ' hours')::INTERVAL, 'pending'
            )
            RETURNING id INTO v_withdrawal_id;
            
            -- Record transaction
            INSERT INTO public.wallet_transactions (
                wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, reference_type, reference_id,
                description
            )
            VALUES (
                v_wallet.id, auth.uid(), 'withdrawal', p_amount, v_fee, v_net_amount,
                v_wallet.balance, v_wallet.balance - p_amount, 'withdrawal', v_withdrawal_id,
                'Withdrawal request - ' || v_hold_hours || 'h hold'
            );
            
            RETURN jsonb_build_object(
                'success', true,
                'withdrawal_id', v_withdrawal_id,
                'amount', p_amount,
                'fee', v_fee,
                'net_amount', v_net_amount,
                'hold_until', NOW() + (p_hold_hours || ' hours')::INTERVAL
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- =============================================
        -- 7. FUNCTION: Create giveaway with escrow
        -- =============================================
        CREATE OR REPLACE FUNCTION public.create_giveaway_with_escrow(
            p_title TEXT,
            p_description TEXT,
            p_prize_amount DECIMAL,
            p_game_type TEXT DEFAULT 'tap',
            p_duration_seconds INTEGER DEFAULT 30,
            p_min_trust_tier TEXT DEFAULT 'bronze',
            p_max_participants INTEGER DEFAULT 1000,
            p_scheduled_start TIMESTAMPTZ DEFAULT NULL,
            p_number_of_winners INTEGER DEFAULT 1,
            p_prevent_previous_winners_hours INTEGER DEFAULT 0
        )
        RETURNS JSONB AS $$
        DECLARE
            v_wallet RECORD;
            v_giveaway_id UUID;
            v_start_time TIMESTAMPTZ;
            v_end_time TIMESTAMPTZ;
        BEGIN
            -- Get user's wallet
            SELECT * INTO v_wallet
            FROM public.wallets
            WHERE user_id = auth.uid();
            
            IF v_wallet IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
            END IF;
            
            -- Check balance
            IF v_wallet.balance < p_prize_amount THEN
                RETURN jsonb_build_object(
                    'success', false, 
                    'error', 'Insufficient balance',
                    'balance', v_wallet.balance,
                    'required', p_prize_amount
                );
            END IF;
            
            -- Calculate times
            v_start_time := COALESCE(p_scheduled_start, NOW());
            v_end_time := v_start_time + (p_duration_seconds || ' seconds')::INTERVAL + INTERVAL '5 minutes';  -- 5 min grace
            
            -- Create giveaway
            INSERT INTO public.giveaways (
                host_id, title, description, prize_amount, prize_currency,
                game_type, game_duration_seconds, min_trust_tier, max_participants,
                number_of_winners, prevent_previous_winners_hours,
                status, starts_at, ends_at
            )
            VALUES (
                auth.uid(), p_title, p_description, p_prize_amount, 'USD',
                p_game_type, p_duration_seconds, p_min_trust_tier, p_max_participants,
                p_number_of_winners, p_prevent_previous_winners_hours,
                CASE WHEN p_scheduled_start IS NULL THEN 'live' ELSE 'scheduled' END,
                v_start_time, v_end_time
            )
            RETURNING id INTO v_giveaway_id;
            
            -- Deduct from wallet and add to escrow
            UPDATE public.wallets
            SET 
                balance = balance - p_prize_amount,
                escrow_balance = escrow_balance + p_prize_amount,
                updated_at = NOW()
            WHERE id = v_wallet.id;
            
            -- Create escrow record
            INSERT INTO public.escrow (giveaway_id, host_id, amount, status)
            VALUES (v_giveaway_id, auth.uid(), p_prize_amount, 'held');
            
            -- Record transaction
            INSERT INTO public.wallet_transactions (
                wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, reference_type, reference_id,
                description
            )
            VALUES (
                v_wallet.id, auth.uid(), 'prize_escrow', p_prize_amount, 0, p_prize_amount,
                v_wallet.balance, v_wallet.balance - p_prize_amount, 'giveaway', v_giveaway_id,
                'Prize held for giveaway: ' || p_title
            );
            
            RETURN jsonb_build_object(
                'success', true,
                'giveaway_id', v_giveaway_id,
                'prize_amount', p_prize_amount,
                'starts_at', v_start_time,
                'ends_at', v_end_time
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- =============================================
        -- 8. FUNCTION: Complete giveaway and pay winner
        -- =============================================
        CREATE OR REPLACE FUNCTION public.complete_giveaway(p_giveaway_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_giveaway RECORD;
            v_escrow RECORD;
            v_participant_count INTEGER;
            v_winners RECORD;  -- Cursor/iterator for loops
            v_winner_count INTEGER := 0;
            v_individual_prize DECIMAL(12,2);
            v_winner_list JSONB := '[]'::JSONB;
        BEGIN
            -- Get giveaway
            SELECT * INTO v_giveaway
            FROM public.giveaways
            WHERE id = p_giveaway_id;
            
            IF v_giveaway IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Giveaway not found');
            END IF;
            
            IF v_giveaway.status = 'ended' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Giveaway already ended');
            END IF;
            
            -- Get escrow
            SELECT * INTO v_escrow
            FROM public.escrow
            WHERE giveaway_id = p_giveaway_id AND status = 'held';
            
            -- Count participants
            SELECT COUNT(*) INTO v_participant_count
            FROM public.giveaway_participants
            WHERE giveaway_id = p_giveaway_id;
            
            -- 0 participants = cancel and refund
            IF v_participant_count = 0 THEN
                -- Refund to host
                UPDATE public.wallets
                SET 
                    balance = balance + v_escrow.amount,
                    escrow_balance = escrow_balance - v_escrow.amount,
                    updated_at = NOW()
                WHERE user_id = v_giveaway.host_id;
                
                -- Update escrow
                UPDATE public.escrow
                SET status = 'refunded', released_at = NOW()
                WHERE id = v_escrow.id;
                
                -- Update giveaway
                UPDATE public.giveaways
                SET status = 'cancelled', ends_at = NOW(), updated_at = NOW()
                WHERE id = p_giveaway_id;
                
                -- Record refund transaction
                INSERT INTO public.wallet_transactions (
                    wallet_id, user_id, type, amount, fee, net_amount,
                    balance_before, balance_after, reference_type, reference_id,
                    description
                )
                SELECT 
                    w.id, v_giveaway.host_id, 'prize_refund', v_escrow.amount, 0, v_escrow.amount,
                    w.balance - v_escrow.amount, w.balance, 'giveaway', p_giveaway_id,
                    'Giveaway cancelled - no participants'
                FROM public.wallets w WHERE w.user_id = v_giveaway.host_id;
                
                RETURN jsonb_build_object(
                    'success', true,
                    'status', 'cancelled',
                    'reason', 'No participants',
                    'refunded', v_escrow.amount
                );
            END IF;
            
            -- Find actual number of winners to reward (capped by participant count and requested number)
            SELECT COUNT(*) INTO v_winner_count FROM (
                SELECT id FROM public.giveaway_participants
                WHERE giveaway_id = p_giveaway_id
                ORDER BY score DESC, completed_at ASC
                LIMIT v_giveaway.number_of_winners
            ) AS win_query;

            v_individual_prize := ROUND(v_escrow.amount / GREATEST(v_winner_count, 1), 2);

            -- Loop through the winners and distribute individual prizes
            FOR v_winners IN 
                SELECT p.*, pr.username, pr.display_name
                FROM public.giveaway_participants p
                JOIN public.profiles pr ON p.user_id = pr.id
                WHERE p.giveaway_id = p_giveaway_id
                ORDER BY p.score DESC, p.completed_at ASC
                LIMIT v_giveaway.number_of_winners
            LOOP
                -- Ensure winner has a wallet
                INSERT INTO public.wallets (user_id)
                VALUES (v_winners.user_id)
                ON CONFLICT (user_id) DO NOTHING;

                -- Transfer individual prize to winner
                UPDATE public.wallets
                SET 
                    balance = balance + v_individual_prize,
                    total_earned = total_earned + v_individual_prize,
                    updated_at = NOW()
                WHERE user_id = v_winners.user_id;

                -- Record individual winner transaction
                INSERT INTO public.wallet_transactions (
                    wallet_id, user_id, type, amount, fee, net_amount,
                    balance_before, balance_after, reference_type, reference_id,
                    description
                )
                SELECT 
                    w.id, v_winners.user_id, 'prize_release', v_individual_prize, 0, v_individual_prize,
                    w.balance - v_individual_prize, w.balance, 'giveaway', p_giveaway_id,
                    'Prize won: ' || v_giveaway.title
                FROM public.wallets w WHERE w.user_id = v_winners.user_id;

                -- Update winner's profile stats
                UPDATE public.profiles
                SET 
                    total_wins = total_wins + 1,
                    total_earnings = total_earnings + v_individual_prize,
                    updated_at = NOW()
                WHERE id = v_winners.user_id;

                -- Build winner list JSON array for return
                v_winner_list := v_winner_list || jsonb_build_object(
                    'user_id', v_winners.user_id,
                    'username', v_winners.username,
                    'score', v_winners.score,
                    'prize', v_individual_prize
                );
            END LOOP;
            
            -- Mark all chosen top ranks as winners
            UPDATE public.giveaway_participants
            SET is_winner = true
            WHERE giveaway_id = p_giveaway_id AND user_id IN (
                SELECT user_id FROM public.giveaway_participants
                WHERE giveaway_id = p_giveaway_id
                ORDER BY score DESC, completed_at ASC
                LIMIT v_giveaway.number_of_winners
            );

            -- Reduce host's escrow balance by full amount
            UPDATE public.wallets
            SET 
                escrow_balance = escrow_balance - v_escrow.amount,
                updated_at = NOW()
            WHERE user_id = v_giveaway.host_id;
            
            -- Update escrow
            UPDATE public.escrow
            SET status = 'released', released_at = NOW()
            WHERE id = v_escrow.id;
            
            -- Escrow `released_to` historically stored 1 winner, skip this or keep null for multi-winner

            -- Update giveaway (Set primary winner_id as the 1st place for legacy UI compatibility)
            UPDATE public.giveaways
            SET 
                status = 'ended', 
                winner_id = (v_winner_list->0->>'user_id')::UUID,
                winning_score = (v_winner_list->0->>'score')::INTEGER,
                ends_at = NOW(),
                updated_at = NOW()
            WHERE id = p_giveaway_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'status', 'ended',
                'winners', v_winner_list,
                'total_prize_amount', v_escrow.amount,
                'participant_count', v_participant_count
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- =============================================
        -- Done!
        -- =============================================
        SELECT 'Wallet system schema created!' as result;
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
            
            -- 3. Also migrate guest participant entries to real participants table
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

            -- 4. Update winners in giveaways table
            -- If this guest was a winner of an ended giveaway, link the user_id now
            UPDATE public.giveaways
            SET winner_id = v_user_id
            WHERE 
                winner_fingerprint_id = p_fingerprint_id 
                AND winner_id IS NULL;
            
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
        -- =============================================
        -- MANUAL DEPOSIT SYSTEM
        -- =============================================

        -- 1. Function to REQUEST a deposit
        CREATE OR REPLACE FUNCTION public.request_deposit(p_amount DECIMAL)
        RETURNS JSONB AS $$
        DECLARE
            v_wallet RECORD;
            v_reference_code TEXT;
            v_transaction_id UUID;
        BEGIN
            -- Get user's wallet
            SELECT * INTO v_wallet
            FROM public.wallets
            WHERE user_id = auth.uid();
            
            IF v_wallet IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
            END IF;

            -- Generate Ref Code
            v_reference_code := 'DEP-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));

            -- Stage the funds in Escrow immediately
            UPDATE public.wallets
            SET 
                escrow_balance = escrow_balance + p_amount,
                updated_at = NOW()
            WHERE id = v_wallet.id;

            -- Insert Pending Transaction
            INSERT INTO public.wallet_transactions (
                wallet_id, 
                user_id, 
                type, 
                amount, 
                fee, 
                net_amount, 
                balance_before, 
                balance_after, 
                status, 
                reference_type,
                description,
                metadata
            )
            VALUES (
                v_wallet.id,
                auth.uid(),
                'deposit',
                p_amount,
                0,
                p_amount,
                v_wallet.balance,   -- Balance BEFORE is current balance
                v_wallet.balance,   -- Balance AFTER is ALSO current balance (until approved)
                'pending',
                'manual_deposit',
                'Pending Deposit: ' || v_reference_code,
                jsonb_build_object('reference_code', v_reference_code)
            )
            RETURNING id INTO v_transaction_id;

            RETURN jsonb_build_object(
                'success', true,
                'reference_code', v_reference_code,
                'amount', p_amount,
                'transaction_id', v_transaction_id
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;


        -- 2. Function to APPROVE a deposit (Admin Only via RLS or App Logic)
        CREATE OR REPLACE FUNCTION public.approve_deposit(p_transaction_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_tx RECORD;
            v_wallet RECORD;
        BEGIN
            -- Get pending transaction
            SELECT * INTO v_tx
            FROM public.wallet_transactions
            WHERE id = p_transaction_id AND status = 'pending' AND type = 'deposit';
            
            IF v_tx IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed');
            END IF;

            -- Get wallet
            SELECT * INTO v_wallet
            FROM public.wallets
            WHERE id = v_tx.wallet_id;
            
            IF v_wallet IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
            END IF;

            -- Update Wallet Balance (Move from escrow to main balance)
            UPDATE public.wallets
            SET 
                escrow_balance = escrow_balance - v_tx.amount,
                balance = balance + v_tx.amount,
                total_deposited = total_deposited + v_tx.amount,
                updated_at = NOW()
            WHERE id = v_tx.wallet_id;

            -- Update Transaction Status & Balances
            -- We record the balance snapshot at the time of approval
            UPDATE public.wallet_transactions
            SET 
                status = 'completed', 
                balance_before = v_wallet.balance,              -- Old balance
                balance_after = v_wallet.balance + v_tx.amount, -- New balance
                updated_at = NOW()
            WHERE id = p_transaction_id;

            RETURN jsonb_build_object('success', true);
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;


        -- 3. Function to REJECT a deposit
        CREATE OR REPLACE FUNCTION public.reject_deposit(p_transaction_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_tx RECORD;
        BEGIN
            -- Get pending transaction
            SELECT * INTO v_tx
            FROM public.wallet_transactions
            WHERE id = p_transaction_id AND status = 'pending' AND type = 'deposit';
            
            IF v_tx IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed');
            END IF;

            -- Update Wallet Balance (Remove from escrow_balance since it was denied)
            UPDATE public.wallets
            SET 
                escrow_balance = escrow_balance - v_tx.amount,
                updated_at = NOW()
            WHERE id = v_tx.wallet_id;

            -- Cancel the transaction
            UPDATE public.wallet_transactions
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = p_transaction_id;
            
            RETURN jsonb_build_object('success', true);
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- =============================================
        -- ADMIN WITHDRAWAL PROCESSING
        -- =============================================

        -- 1. APPROVE a withdrawal (Admin marks as processed/completed)
        CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_withdrawal_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_withdrawal RECORD;
        BEGIN
            -- Get pending or processing withdrawal
            SELECT * INTO v_withdrawal
            FROM public.withdrawal_requests
            WHERE id = p_withdrawal_id AND status IN ('pending', 'processing');
            
            IF v_withdrawal IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed');
            END IF;

            -- Check hold period
            IF v_withdrawal.hold_until > NOW() THEN
                RETURN jsonb_build_object('success', false, 'error', 'Hold period has not expired yet');
            END IF;

            -- Update withdrawal status to completed
            UPDATE public.withdrawal_requests
            SET 
                status = 'completed',
                processed_at = NOW()
            WHERE id = p_withdrawal_id;

            -- Update wallet totals
            UPDATE public.wallets
            SET 
                total_withdrawn = total_withdrawn + v_withdrawal.amount,
                updated_at = NOW()
            WHERE id = v_withdrawal.wallet_id;

            -- Update the corresponding transaction status
            UPDATE public.wallet_transactions
            SET 
                status = 'completed',
                updated_at = NOW()
            WHERE reference_id = p_withdrawal_id AND type = 'withdrawal';

            RETURN jsonb_build_object(
                'success', true,
                'net_amount', v_withdrawal.net_amount,
                'fee', v_withdrawal.fee
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;


        -- 2. REJECT a withdrawal (Admin rejects, refund balance)
        CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_withdrawal_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_withdrawal RECORD;
        BEGIN
            -- Get pending withdrawal
            SELECT * INTO v_withdrawal
            FROM public.withdrawal_requests
            WHERE id = p_withdrawal_id AND status = 'pending';
            
            IF v_withdrawal IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Pending withdrawal not found or already processed');
            END IF;

            -- Update withdrawal status to cancelled
            UPDATE public.withdrawal_requests
            SET 
                status = 'cancelled',
                processed_at = NOW()
            WHERE id = p_withdrawal_id;

            -- Refund the full amount (including fee) back to wallet
            UPDATE public.wallets
            SET 
                balance = balance + v_withdrawal.amount,
                updated_at = NOW()
            WHERE id = v_withdrawal.wallet_id;

            -- Update the corresponding transaction status
            UPDATE public.wallet_transactions
            SET 
                status = 'cancelled',
                description = 'Withdrawal rejected - refunded',
                updated_at = NOW()
            WHERE reference_id = p_withdrawal_id AND type = 'withdrawal';

            -- Record refund transaction
            INSERT INTO public.wallet_transactions (
                wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, reference_type, reference_id,
                description
            )
            SELECT
                w.id, v_withdrawal.user_id, 'deposit', v_withdrawal.amount, 0, v_withdrawal.amount,
                w.balance - v_withdrawal.amount, w.balance, 'withdrawal_refund', p_withdrawal_id,
                'Withdrawal rejected - amount refunded'
            FROM public.wallets w WHERE w.id = v_withdrawal.wallet_id;

            RETURN jsonb_build_object(
                'success', true,
                'refunded', v_withdrawal.amount
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        -- =============================================
        -- LOBBY SYSTEM MIGRATION
        -- Adds lobby-based giveaway flow
        -- =============================================

        -- 1. Add allow_sharing column to giveaways
        ALTER TABLE public.giveaways 
        ADD COLUMN IF NOT EXISTS allow_sharing BOOLEAN DEFAULT true;

        -- 2. Add scheduled_start_at for auto-start countdown (separate from starts_at which is the actual start)
        ALTER TABLE public.giveaways 
        ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

        -- 3. Update RLS on giveaway_participants to allow viewing during 'scheduled' (lobby)
        DROP POLICY IF EXISTS "Users can view participants in their giveaways" ON public.giveaway_participants;
        CREATE POLICY "Users can view participants in their giveaways" ON public.giveaway_participants
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.giveaways 
                    WHERE id = giveaway_id AND status IN ('scheduled', 'live', 'ended')
                )
            );

        -- 4. Update create_giveaway_with_escrow to always create as 'scheduled' (lobby)
        CREATE OR REPLACE FUNCTION public.create_giveaway_with_escrow(
            p_title TEXT,
            p_description TEXT,
            p_prize_amount DECIMAL,
            p_game_type TEXT DEFAULT 'tap',
            p_duration_seconds INTEGER DEFAULT 30,
            p_min_trust_tier TEXT DEFAULT 'bronze',
            p_max_participants INTEGER DEFAULT 1000,
            p_scheduled_start TIMESTAMPTZ DEFAULT NULL,
            p_allow_sharing BOOLEAN DEFAULT true,
            p_number_of_winners INTEGER DEFAULT 1,
            p_prevent_previous_winners_hours INTEGER DEFAULT 0
        )
        RETURNS JSONB AS $$
        DECLARE
            v_wallet RECORD;
            v_giveaway_id UUID;
        BEGIN
            -- Get user's wallet
            SELECT * INTO v_wallet
            FROM public.wallets
            WHERE user_id = auth.uid();
            
            IF v_wallet IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
            END IF;
            
            -- Check balance
            IF v_wallet.balance < p_prize_amount THEN
                RETURN jsonb_build_object(
                    'success', false, 
                    'error', 'Insufficient balance',
                    'balance', v_wallet.balance,
                    'required', p_prize_amount
                );
            END IF;
            
            -- Create giveaway in 'scheduled' status (lobby open)
            -- starts_at and ends_at are set when host triggers START
            INSERT INTO public.giveaways (
                host_id, title, description, prize_amount, prize_currency,
                game_type, game_duration_seconds, min_trust_tier, max_participants,
                status, scheduled_start_at, allow_sharing,
                number_of_winners, prevent_previous_winners_hours
            )
            VALUES (
                auth.uid(), p_title, p_description, p_prize_amount, 'USD',
                p_game_type, p_duration_seconds, p_min_trust_tier, p_max_participants,
                'scheduled', p_scheduled_start, p_allow_sharing,
                p_number_of_winners, p_prevent_previous_winners_hours
            )
            RETURNING id INTO v_giveaway_id;
            
            -- Deduct from wallet and add to escrow
            UPDATE public.wallets
            SET 
                balance = balance - p_prize_amount,
                escrow_balance = escrow_balance + p_prize_amount,
                updated_at = NOW()
            WHERE id = v_wallet.id;
            
            -- Create escrow record
            INSERT INTO public.escrow (giveaway_id, host_id, amount, status)
            VALUES (v_giveaway_id, auth.uid(), p_prize_amount, 'held');
            
            -- Record transaction
            INSERT INTO public.wallet_transactions (
                wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, reference_type, reference_id,
                description
            )
            VALUES (
                v_wallet.id, auth.uid(), 'prize_escrow', p_prize_amount, 0, p_prize_amount,
                v_wallet.balance, v_wallet.balance - p_prize_amount, 'giveaway', v_giveaway_id,
                'Prize held for giveaway: ' || p_title
            );
            
            RETURN jsonb_build_object(
                'success', true,
                'giveaway_id', v_giveaway_id,
                'prize_amount', p_prize_amount
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- 5. Create start_giveaway_event RPC
        -- Host calls this to start the event. Sets status to 'live' and calculates end time.
        CREATE OR REPLACE FUNCTION public.start_giveaway_event(p_giveaway_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_giveaway RECORD;
        BEGIN
            -- Get giveaway
            SELECT * INTO v_giveaway
            FROM public.giveaways
            WHERE id = p_giveaway_id;
            
            IF v_giveaway IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Giveaway not found');
            END IF;
            
            -- Only the host can start
            IF v_giveaway.host_id != auth.uid() THEN
                RETURN jsonb_build_object('success', false, 'error', 'Only the host can start this event');
            END IF;
            
            -- Must be in scheduled status (lobby)
            IF v_giveaway.status != 'scheduled' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Event is not in lobby state');
            END IF;
            
            -- Set live, calculate actual start and end times
            UPDATE public.giveaways
            SET 
                status = 'live',
                starts_at = NOW(),
                ends_at = NOW() + (v_giveaway.game_duration_seconds || ' seconds')::INTERVAL + INTERVAL '5 seconds',
                updated_at = NOW()
            WHERE id = p_giveaway_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'starts_at', NOW(),
                'ends_at', NOW() + (v_giveaway.game_duration_seconds || ' seconds')::INTERVAL + INTERVAL '5 seconds'
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- 6. Allow joining giveaways in 'scheduled' status
        -- Update the join_giveaway check (if RPC exists) or rely on service-layer check
        -- The giveaway_participants INSERT policy already allows users to manage own participation
        -- =============================================
        -- PRIZE CLAIM SYSTEM
        -- Adds manual prize claim functionality and guest winner support
        -- =============================================

        -- 1. Add columns to giveaways table
        ALTER TABLE public.giveaways 
        ADD COLUMN IF NOT EXISTS winner_fingerprint_id TEXT,
        ADD COLUMN IF NOT EXISTS prize_claimed_at TIMESTAMPTZ;

        -- 2. Update complete_giveaway RPC
        -- Now only picks winner and ends giveaway, does NOT release funds
        CREATE OR REPLACE FUNCTION public.complete_giveaway(p_giveaway_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_giveaway RECORD;
            v_escrow RECORD;
            v_winner_data RECORD;
            v_participant_count INTEGER;
        BEGIN
            -- Get giveaway
            SELECT * INTO v_giveaway
            FROM public.giveaways
            WHERE id = p_giveaway_id;
            
            IF v_giveaway IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Giveaway not found');
            END IF;
            
            IF v_giveaway.status = 'ended' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Giveaway already ended');
            END IF;
            
            -- Get escrow
            SELECT * INTO v_escrow
            FROM public.escrow
            WHERE giveaway_id = p_giveaway_id AND status = 'held';
            
            IF v_escrow IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Escrow funds not found');
            END IF;

            -- Count participants in combined leaderboard
            SELECT COUNT(*) INTO v_participant_count
            FROM public.combined_leaderboard
            WHERE giveaway_id = p_giveaway_id;
            
            -- 0 participants = cancel and refund
            IF v_participant_count = 0 THEN
                -- Refund to host
                UPDATE public.wallets
                SET 
                    balance = balance + v_escrow.amount,
                    escrow_balance = escrow_balance - v_escrow.amount,
                    updated_at = NOW()
                WHERE user_id = v_giveaway.host_id;
                
                -- Update escrow
                UPDATE public.escrow
                SET status = 'refunded', released_at = NOW()
                WHERE id = v_escrow.id;
                
                -- Update giveaway
                UPDATE public.giveaways
                SET status = 'cancelled', ends_at = NOW(), updated_at = NOW()
                WHERE id = p_giveaway_id;
                
                RETURN jsonb_build_object(
                    'success', true,
                    'status', 'cancelled',
                    'reason', 'No participants',
                    'refunded', v_escrow.amount
                );
            END IF;
            
            -- Get winner from combined leaderboard (highest score)
            -- This handles both authenticated users and guests
            SELECT *
            INTO v_winner_data
            FROM public.combined_leaderboard
            WHERE giveaway_id = p_giveaway_id
            ORDER BY score DESC, completed_at ASC
            LIMIT 1;
            
            -- Update giveaway with winner info but don't release funds yet
            UPDATE public.giveaways
            SET 
                status = 'ended', 
                winner_id = v_winner_data.user_id, -- NULL for unlinked guests
                winner_fingerprint_id = v_winner_data.fingerprint_id,
                winning_score = v_winner_data.score,
                ends_at = NOW(),
                updated_at = NOW()
            WHERE id = p_giveaway_id;
            
            -- If it's a real user, mark them as winner in participants table
            IF v_winner_data.user_id IS NOT NULL THEN
                UPDATE public.giveaway_participants
                SET is_winner = true
                WHERE giveaway_id = p_giveaway_id AND user_id = v_winner_data.user_id;
                
                -- Update winner's profile stats (counts as a win even if not yet claimed)
                UPDATE public.profiles
                SET total_wins = total_wins + 1, updated_at = NOW()
                WHERE id = v_winner_data.user_id;
            END IF;
            
            RETURN jsonb_build_object(
                'success', true,
                'status', 'ended',
                'winner_id', v_winner_data.user_id,
                'winner_fingerprint_id', v_winner_data.fingerprint_id,
                'winner_username', v_winner_data.username,
                'winning_score', v_winner_data.score,
                'prize_amount', v_escrow.amount,
                'is_guest', v_winner_data.participant_type = 'guest'
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;

        -- 3. Add claim_prize RPC
        -- Allows winner to manually claim their prize
        CREATE OR REPLACE FUNCTION public.claim_prize(p_giveaway_id UUID)
        RETURNS JSONB AS $$
        DECLARE
            v_giveaway RECORD;
            v_escrow RECORD;
            v_user_id UUID;
            v_wallet RECORD;
        BEGIN
            v_user_id := auth.uid();
            IF v_user_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
            END IF;

            -- Get giveaway
            SELECT * INTO v_giveaway
            FROM public.giveaways
            WHERE id = p_giveaway_id;
            
            IF v_giveaway IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Giveaway not found');
            END IF;
            
            -- Security checks
            IF v_giveaway.status != 'ended' THEN
                RETURN jsonb_build_object('success', false, 'error', 'Giveaway has not ended');
            END IF;
            
            IF v_giveaway.winner_id IS DISTINCT FROM v_user_id THEN
                RETURN jsonb_build_object('success', false, 'error', 'You are not the winner of this giveaway');
            END IF;
            
            IF v_giveaway.prize_claimed_at IS NOT NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Prize already claimed');
            END IF;
            
            -- Get escrow
            SELECT * INTO v_escrow
            FROM public.escrow
            WHERE giveaway_id = p_giveaway_id AND status = 'held';
            
            IF v_escrow IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Prize funds unavailable');
            END IF;

            -- Get user's wallet
            SELECT * INTO v_wallet
            FROM public.wallets
            WHERE user_id = v_user_id;
            
            IF v_wallet IS NULL THEN
                -- Create wallet if missing
                INSERT INTO public.wallets (user_id)
                VALUES (v_user_id)
                RETURNING * INTO v_wallet;
            END IF;
            
            -- 1. Transfer prize to winner's balance
            UPDATE public.wallets
            SET 
                balance = balance + v_escrow.amount,
                total_earned = total_earned + v_escrow.amount,
                updated_at = NOW()
            WHERE id = v_wallet.id;
            
            -- 2. Deduct from host's escrow balance
            UPDATE public.wallets
            SET 
                escrow_balance = escrow_balance - v_escrow.amount,
                updated_at = NOW()
            WHERE user_id = v_giveaway.host_id;
            
            -- 3. Update escrow status
            UPDATE public.escrow
            SET 
                status = 'released', 
                released_to = v_user_id, 
                released_at = NOW()
            WHERE id = v_escrow.id;
            
            -- 4. Mark giveaway as claimed
            UPDATE public.giveaways
            SET 
                prize_claimed_at = NOW(), 
                updated_at = NOW()
            WHERE id = p_giveaway_id;
            
            -- 5. Record winner transaction
            INSERT INTO public.wallet_transactions (
                wallet_id, user_id, type, amount, fee, net_amount,
                balance_before, balance_after, reference_type, reference_id,
                description
            )
            VALUES (
                v_wallet.id, v_user_id, 'prize_release', v_escrow.amount, 0, v_escrow.amount,
                v_wallet.balance - v_escrow.amount, v_wallet.balance, 'giveaway', p_giveaway_id,
                'Prize claimed: ' || v_giveaway.title
            );
            
            -- 6. Update winner profile earnings stat
            UPDATE public.profiles
            SET 
                total_earnings = total_earnings + v_escrow.amount,
                updated_at = NOW()
            WHERE id = v_user_id;

            RETURN jsonb_build_object(
                'success', true,
                'prize_amount', v_escrow.amount,
                'claimed_at', NOW()
            );
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
