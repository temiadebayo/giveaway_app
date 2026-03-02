-- =============================================
-- FIX KYC ADMIN AUTHORIZATION
-- Run this in Supabase SQL Editor
-- =============================================

-- The frontend hardcodes admins by email (admin-service.ts), 
-- but the backend was checking for `is_host = true`.
-- This caused new admins to see the KYC page but get "Unauthorized access" when clicking approve.

-- We update the RPCs to check if the user is a host OR if their email matches the known admins.

CREATE OR REPLACE FUNCTION public.approve_kyc_request(p_request_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
    v_profile RECORD;
    v_admin_email TEXT;
BEGIN
    -- Get the email of the person calling this function
    SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();

    -- Check if they have the database flag OR their email is on the master list
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND (is_host = true OR v_admin_email IN ('temiadebayo1@gmail.com'))
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized access');
    END IF;

    SELECT * INTO v_request FROM public.kyc_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'KYC request not found');
    END IF;

    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'KYC request is not pending');
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = v_request.user_id;

    UPDATE public.kyc_requests
    SET status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_request_id;

    UPDATE public.profiles
    SET id_verified = true,
        trust_tier = 'gold',     
        trust_score = GREATEST(trust_score, 80), 
        updated_at = NOW()
    WHERE id = v_request.user_id;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.reject_kyc_request(p_request_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
    v_admin_email TEXT;
BEGIN
    SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();

    -- Check if they have the database flag OR their email is on the master list
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND (is_host = true OR v_admin_email IN ('temiadebayo1@gmail.com'))
    ) THEN
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

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to allow the master admin email to view requests as well
DROP POLICY IF EXISTS "Admins can view all kyc requests" ON public.kyc_requests;
CREATE POLICY "Admins can view all kyc requests" 
ON public.kyc_requests FOR SELECT 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true)
    OR 
    (SELECT email FROM auth.users WHERE id = auth.uid()) IN ('temiadebayo1@gmail.com')
);

DROP POLICY IF EXISTS "Admins can update all kyc requests" ON public.kyc_requests;
CREATE POLICY "Admins can update all kyc requests" 
ON public.kyc_requests FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true)
    OR 
    (SELECT email FROM auth.users WHERE id = auth.uid()) IN ('temiadebayo1@gmail.com')
);

SELECT 'KYC admin authorization logic updated!' as result;
