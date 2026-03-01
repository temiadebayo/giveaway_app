-- =============================================
-- KYC VERIFICATION SYSTEM - DB SETUP & STORAGE
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Create KYC Requests Table
CREATE TABLE IF NOT EXISTS public.kyc_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    id_card_url TEXT NOT NULL,
    selfie_url TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Only one active or approved request per user allowed
    CONSTRAINT unique_pending_or_approved_kyc UNIQUE (user_id, status)
);

-- Note: The constraints approach above works, but to make it simpler to manage, 
-- we'll rely on an index for only active requests instead of a strict multi-column constraint.
ALTER TABLE public.kyc_requests DROP CONSTRAINT IF EXISTS unique_pending_or_approved_kyc;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_kyc 
ON public.kyc_requests (user_id) 
WHERE status IN ('pending', 'approved');

-- 2. Enable RLS on kyc_requests
ALTER TABLE public.kyc_requests ENABLE ROW LEVEL SECURITY;

-- PostgREST role grants
GRANT ALL ON TABLE public.kyc_requests TO anon, authenticated, service_role;

-- Policies for kyc_requests table
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
USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_host = true
));

DROP POLICY IF EXISTS "Admins can update all kyc requests" ON public.kyc_requests;
CREATE POLICY "Admins can update all kyc requests" 
ON public.kyc_requests FOR UPDATE 
USING (EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_host = true
));

-- 3. Create Support for the Storage Bucket
-- Ensure storage schema extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Attempt to insert the bucket (ignores if it already exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'kyc_documents', 
    'kyc_documents', 
    false, -- MUST BE PRIVATE!
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- =============================================
-- INSTRUCTION: The storage bucket is created, but policies must be set via Dashboard.
-- Go to Supabase Dashboard -> Storage -> Policies -> 'kyc_documents'
-- 1. Create Policy: "Users can upload their own KYC docs" (INSERT, FOR AUTHENTICATED)
-- 2. Create Policy: "Users can view their own KYC docs" (SELECT, FOR AUTHENTICATED)
-- 3. Create Policy: "Admins can view all KYC docs" (SELECT, FOR AUTHENTICATED)
-- =============================================

-- 4. Create Admin RPCs for Approval/Rejection

-- RPC: Approve KYC
CREATE OR REPLACE FUNCTION public.approve_kyc_request(p_request_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
    v_profile RECORD;
BEGIN
    -- Only allow admins (hosts) to execute this function
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true) THEN
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

    -- Fetch the profile info to decide the new tier
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_request.user_id;

    -- Update the request status
    UPDATE public.kyc_requests
    SET status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- Update the user profile
    UPDATE public.profiles
    SET id_verified = true,
        trust_tier = 'gold',     -- Default newly verified users to Gold
        trust_score = GREATEST(trust_score, 80), -- Boost their trust score implicitly
        updated_at = NOW()
    WHERE id = v_request.user_id;

    -- Optional: Consider recording an event in trust_events table here if needed

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.approve_kyc_request TO authenticated, service_role;


-- RPC: Reject KYC
CREATE OR REPLACE FUNCTION public.reject_kyc_request(p_request_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
BEGIN
    -- Only allow admins (hosts) to execute
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true) THEN
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

    -- Update the request status
    UPDATE public.kyc_requests
    SET status = 'rejected',
        rejection_reason = p_reason,
        reviewed_at = NOW(),
        reviewed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- We intentionally do not downgrade a user's existing trust_tier upon a single KYC rejection 
    -- to prevent accidental punishment. They simply fail to reach the next tier.

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.reject_kyc_request TO authenticated, service_role;

SELECT 'KYC setup complete' as result;
