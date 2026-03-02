-- =============================================
-- DEEP AUDIT: KYC & IDENTITY STATUS
-- Run this in Supabase SQL Editor
-- =============================================

-- This will show us every user, their email, and their identity status 
-- alongside their most recent KYC request status.

SELECT 
    p.email,
    p.id_verified AS profile_is_verified,
    p.trust_tier,
    (
        SELECT status 
        FROM public.kyc_requests 
        WHERE user_id = p.id 
        ORDER BY created_at DESC 
        LIMIT 1
    ) AS latest_kyc_request_status,
    (
        SELECT count(*) 
        FROM public.kyc_requests 
        WHERE user_id = p.id
    ) AS total_requests_submitted
FROM 
    public.profiles p
WHERE 
    p.email IS NOT NULL
ORDER BY 
    p.updated_at DESC;
