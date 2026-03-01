-- =============================================
-- KYC VERIFICATION SYSTEM - DB SETUP & STORAGE
-- Run this in Supabase SQL Editor
-- VERSION 2: Completely fresh file to avoid editor cache issues
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
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index for active requests (replaces complicated constrainst)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_kyc 
ON public.kyc_requests (user_id) 
WHERE status IN ('pending', 'approved');

-- 2. Enable RLS on kyc_requests
ALTER TABLE public.kyc_requests ENABLE ROW LEVEL SECURITY;

-- PostgREST role grants (No sequence grants needed for UUID!)
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
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Drop existing storage policies for this bucket to ensure clean state
DROP POLICY IF EXISTS "Users can upload their own KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete KYC docs" ON storage.objects;

-- Create Storage Policies
CREATE POLICY "Users can upload their own KYC docs" 
ON storage.objects FOR INSERT 
WITH CHECK (
    auth.uid() = owner AND bucket_id = 'kyc_documents' AND (select auth.uid()::text) = (string_to_array(name, '/'))[1]
);

CREATE POLICY "Users can view their own KYC docs" 
ON storage.objects FOR SELECT 
USING (
    bucket_id = 'kyc_documents' AND auth.uid() = owner
);

CREATE POLICY "Admins can view all KYC docs" 
ON storage.objects FOR SELECT 
USING (
    bucket_id = 'kyc_documents' AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_host = true
    )
);

CREATE POLICY "Admins can delete KYC docs" 
ON storage.objects FOR DELETE 
USING (
    bucket_id = 'kyc_documents' AND EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_host = true
    )
);

-- 4. Create Admin RPCs for Approval/Rejection

-- RPC: Approve KYC
CREATE OR REPLACE FUNCTION public.approve_kyc_request(p_request_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
    v_profile RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true) THEN
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
GRANT EXECUTE ON FUNCTION public.approve_kyc_request TO authenticated, service_role;


-- RPC: Reject KYC
CREATE OR REPLACE FUNCTION public.reject_kyc_request(p_request_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
    v_request RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_host = true) THEN
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
GRANT EXECUTE ON FUNCTION public.reject_kyc_request TO authenticated, service_role;

SELECT 'KYC setup complete' as result;
