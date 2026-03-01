-- =============================================
-- PHONE VERIFICATION TRUST SCORE INTEGRATION
-- Run this in Supabase SQL Editor
-- =============================================

-- This trigger ensures that when a user verifies their phone number, 
-- they automatically receive the 20 Trust Score points promised by the UI.

CREATE OR REPLACE FUNCTION public.handle_phone_verification_trust_score()
RETURNS TRIGGER AS $$
BEGIN
    -- Only act if phone_verified changed from FALSE to TRUE
    IF OLD.phone_verified IS NOT TRUE AND NEW.phone_verified IS TRUE THEN
        
        -- Add 20 points, cap at 100
        NEW.trust_score := LEAST(100, COALESCE(NEW.trust_score, 20) + 20);
        
        -- Upgrade Trust Tier based on new score
        IF NEW.trust_score >= 80 THEN
            NEW.trust_tier := 'diamond';
            NEW.withdrawal_limit := 500000;
        ELSIF NEW.trust_score >= 60 THEN
            NEW.trust_tier := 'gold';
            NEW.withdrawal_limit := 100000;
        ELSIF NEW.trust_score >= 40 THEN
            NEW.trust_tier := 'silver';
            NEW.withdrawal_limit := 50000;
        ELSE
            NEW.trust_tier := 'bronze';
            NEW.withdrawal_limit := 10000;
        END IF;

        -- Log the Trust Event
        INSERT INTO public.trust_events (
            user_id, event_type, points_change, previous_score, new_score, previous_tier, new_tier, description
        ) VALUES (
            NEW.id,
            'phone_verified',
            20,
            OLD.trust_score,
            NEW.trust_score,
            OLD.trust_tier,
            NEW.trust_tier,
            'Verified phone number (+234...)'
        );
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_phone_verified_trust_increase ON public.profiles;

-- Create the trigger
CREATE TRIGGER on_phone_verified_trust_increase
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    WHEN (OLD.phone_verified IS DISTINCT FROM NEW.phone_verified)
    EXECUTE FUNCTION public.handle_phone_verification_trust_score();

SELECT 'Phone Verification Trust Score trigger created successfully!' as result;
