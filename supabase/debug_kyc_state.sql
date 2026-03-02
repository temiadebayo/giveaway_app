-- =============================================
-- DEBUG KYC ISSUES
-- Run this in Supabase SQL Editor
-- =============================================

-- This script will show us the exact state of the pending/approved KYC requests
-- and the corresponding user's profile to see if the "Approve" action actually worked.

SELECT 
    k.id AS kyc_request_id,
    k.status AS kyc_status,
    k.created_at AS kyc_submitted_at,
    p.email AS user_email,
    p.id_verified AS profile_verified_flag,
    p.trust_tier,
    p.trust_score
FROM 
    public.kyc_requests k
JOIN 
    public.profiles p ON k.user_id = p.id
ORDER BY 
    k.created_at DESC
LIMIT 10;
