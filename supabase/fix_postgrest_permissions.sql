-- =============================================
-- FIX 403 FORBIDDEN AND 42501 WALLET INSERT ERRORS
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Grant PostgREST essential table access for all remaining MVP tables
-- (Without these, you get 403 Forbidden in Next.js browser console)
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.device_fingerprints TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_devices TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.trust_events TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.fraud_alerts TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.giveaways TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.giveaway_participants TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.escrow TO anon, authenticated, service_role;

-- 2. Add Missing RLS INSERT Policy for Wallets 
-- (Frontend wallet-service.ts needs to create a wallet if the trigger missed it)
DROP POLICY IF EXISTS "Users can insert own wallet" ON public.wallets;
CREATE POLICY "Users can insert own wallet" ON public.wallets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Add Missing RLS Policies for Profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles
    FOR SELECT USING (true);

-- Done!
SELECT 'PostgREST permissions and RLS policies updated!' as result;
