-- =============================================
-- GRANT ADMIN/HOST PRIVILEGES
-- Run this in Supabase SQL Editor
-- =============================================

-- It appears you were testing submitting the KYC request and approving it on the same account!
-- Because you created the request, the database let you see it. 
-- However, the database blocked the approval because your account did not have the "host" flag enabled.

-- This script will permanently grant your admin account the required database privileges.

UPDATE public.profiles
SET is_host = true
WHERE email = 'temiadebayo1@gmail.com' OR email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1);

SELECT 'Admin privileges granted to your account successfully!' as result;
