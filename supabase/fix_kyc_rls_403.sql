-- =============================================
-- FIX RLS PERMISSION DENIED (ERROR 42501)
-- Run this in Supabase SQL Editor
-- =============================================

-- In the previous step, we updated the RLS policies to check the admin's email.
-- However, we queried `auth.users` directly inside the policy.
-- The API role `authenticated` does not have permission to read `auth.users`, 
-- which caused the query to crash with "permission denied for table users" (403 Forbidden).

-- The correct way to get the current user's email inside an RLS policy 
-- without querying restricted tables is to read it from their JWT token using `auth.jwt()`.

DROP POLICY IF EXISTS "Admins can view all kyc requests" ON public.kyc_requests;
CREATE POLICY "Admins can view all kyc requests" 
ON public.kyc_requests FOR SELECT 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true)
    OR 
    (auth.jwt() ->> 'email') IN ('temiadebayo1@gmail.com')
);

DROP POLICY IF EXISTS "Admins can update all kyc requests" ON public.kyc_requests;
CREATE POLICY "Admins can update all kyc requests" 
ON public.kyc_requests FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true)
    OR 
    (auth.jwt() ->> 'email') IN ('temiadebayo1@gmail.com')
);

SELECT 'KYC RLS policies fixed successfully using auth.jwt()!' as result;
