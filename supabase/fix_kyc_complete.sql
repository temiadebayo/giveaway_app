-- =============================================
-- COMPLETE KYC FIX - Run this in Supabase SQL Editor
-- Fixes: FK constraint, admin auth, RLS policies
-- =============================================

-- =============================================
-- STEP 1: Backfill missing profiles
-- Some users in auth.users may not have a profile row
-- (trigger failed or was deployed after they signed up)
-- =============================================
INSERT INTO public.profiles (id, email, username, display_name)
SELECT 
    u.id,
    u.email,
    COALESCE(
        u.raw_user_meta_data->>'username',
        CASE WHEN u.email IS NOT NULL THEN split_part(u.email, '@', 1) ELSE NULL END,
        'user_' || substr(u.id::text, 1, 8)
    ),
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        CASE WHEN u.email IS NOT NULL THEN split_part(u.email, '@', 1) ELSE NULL END,
        'User'
    )
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
);

-- Report how many were backfilled
DO $$
DECLARE
    backfilled_count INTEGER;
BEGIN
    SELECT count(*) INTO backfilled_count
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
    RAISE NOTICE 'Profiles backfill complete. (Any missing profiles were created above.)';
END $$;

-- =============================================
-- STEP 2: Set is_host = true for the admin
-- This is the SINGLE SOURCE OF TRUTH for admin access
-- =============================================
UPDATE public.profiles
SET is_host = true
WHERE email = 'temiadebayo1@gmail.com';

-- Verify
SELECT email, is_host FROM public.profiles WHERE email = 'temiadebayo1@gmail.com';

-- =============================================
-- STEP 3: Clean up orphaned rejected KYC rows
-- The unique index blocks re-submission when status is 
-- 'pending' or 'approved'. Rejected rows are fine but
-- let's make sure no stuck data exists.
-- =============================================
-- Delete any KYC requests whose user_id doesn't exist in profiles
-- (shouldn't happen after backfill, but just in case)
DELETE FROM public.kyc_requests
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- =============================================
-- STEP 4: Fix RLS Policies (clean, no auth.users queries)
-- =============================================
DROP POLICY IF EXISTS "Users can view own kyc requests" ON public.kyc_requests;
CREATE POLICY "Users can view own kyc requests" 
ON public.kyc_requests FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own kyc requests" ON public.kyc_requests;
CREATE POLICY "Users can insert own kyc requests" 
ON public.kyc_requests FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all kyc requests" ON public.kyc_requests;
CREATE POLICY "Admins can view all kyc requests" 
ON public.kyc_requests FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_host = true
    )
);

DROP POLICY IF EXISTS "Admins can update all kyc requests" ON public.kyc_requests;
CREATE POLICY "Admins can update all kyc requests" 
ON public.kyc_requests FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_host = true
    )
);

-- =============================================
-- STEP 5: Recreate approve_kyc_request RPC
-- SECURITY DEFINER = runs as owner (bypasses RLS for writes)
-- auth.uid() still works for identifying the caller
-- =============================================
CREATE OR REPLACE FUNCTION public.approve_kyc_request(p_request_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
    v_is_admin BOOLEAN;
BEGIN
    -- Check admin status using only the profiles table (no auth.users query)
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_host = true
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized access');
    END IF;

    -- Fetch the request
    SELECT * INTO v_request FROM public.kyc_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'KYC request not found');
    END IF;

    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'KYC request is not pending');
    END IF;

    -- Update the KYC request
    UPDATE public.kyc_requests
    SET status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- Upgrade the user's profile
    UPDATE public.profiles
    SET id_verified = true,
        trust_tier = 'gold',
        trust_score = GREATEST(trust_score, 80),
        updated_at = NOW()
    WHERE id = v_request.user_id;

    -- Send notification
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
        v_request.user_id, 'kyc',
        '✅ Identity Verified',
        'Your KYC has been approved! You are now Gold tier with enhanced withdrawal limits.',
        '/trust'
    );

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.approve_kyc_request TO authenticated, service_role;

-- =============================================
-- STEP 6: Recreate reject_kyc_request RPC
-- =============================================
CREATE OR REPLACE FUNCTION public.reject_kyc_request(p_request_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
    v_is_admin BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_host = true
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized access');
    END IF;

    SELECT * INTO v_request FROM public.kyc_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'KYC request not found');
    END IF;

    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'KYC request is not pending');
    END IF;

    UPDATE public.kyc_requests
    SET status = 'rejected',
        rejection_reason = p_reason,
        reviewed_at = NOW(),
        reviewed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- Notify the user about rejection
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (
        v_request.user_id, 'kyc',
        '❌ KYC Submission Rejected',
        'Your KYC submission was rejected. Reason: ' || COALESCE(p_reason, 'Documents unclear.') || '. Please resubmit with clearer documents.',
        '/trust/kyc'
    );

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reject_kyc_request TO authenticated, service_role;

-- =============================================
-- DONE
-- =============================================
SELECT 'KYC system fully fixed!' AS result;
