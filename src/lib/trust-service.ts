/**
 * Trust Score Service
 * 
 * Handles all trust score operations with Supabase
 */

import { createClient } from '@/lib/supabase';
import {
    calculateTrustScore,
    TrustFactors,
    TrustScoreBreakdown,
    getTierFromScore,
    getImprovementTips,
    getScoreToNextTier,
    TrustTier
} from './trust-engine';

export interface Profile {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    email: string;
    phone: string | null;
    phone_verified: boolean;
    id_verified: boolean;
    trust_score: number;
    trust_tier: TrustTier;
    total_wins: number;
    total_winnings: number;
    withdrawal_limit: number;
    is_host: boolean;
    is_banned: boolean;
    created_at: string;
}

export interface TrustEvent {
    id: string;
    event_type: string;
    score_before: number;
    score_after: number;
    score_change: number;
    reason: string;
    created_at: string;
}

export interface UserDevice {
    id: string;
    fingerprint_hash: string;
    is_primary: boolean;
    trust_contribution: number;
    last_used_at: string;
}

export type KycStatus = 'pending' | 'approved' | 'rejected' | 'none';

export interface KycRequest {
    id: string;
    user_id: string;
    status: KycStatus;
    rejection_reason?: string;
    created_at: string;
}

class TrustService {
    private supabase = createClient();

    /**
     * Get the user's current KYC Request status
     */
    async getKycStatus(): Promise<KycRequest | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await this.supabase
            .from('kyc_requests')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching KYC status:', error);
            return null;
        }

        return data as KycRequest | null;
    }

    /**
     * Submit a new KYC Request (Uploads files to storage bucket, creates DB row, and updates bank details)
     */
    async submitKycRequest(
        idCardFile: File,
        selfieFile: File,
        bankDetails: { bank_name: string; account_name: string; account_number: string }
    ): Promise<{ success: boolean; error?: string }> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return { success: false, error: 'User not authenticated' };

        try {
            const timestamp = Date.now();

            // 1. Upload ID Card
            const idPath = `${user.id}/id_card_${timestamp}.jpg`;
            const { error: idUploadError } = await this.supabase.storage
                .from('kyc_documents')
                .upload(idPath, idCardFile, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (idUploadError) throw new Error(`ID Upload failed: ${idUploadError.message}`);

            // 2. Upload Selfie
            const selfiePath = `${user.id}/selfie_${timestamp}.jpg`;
            const { error: selfieUploadError } = await this.supabase.storage
                .from('kyc_documents')
                .upload(selfiePath, selfieFile, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (selfieUploadError) throw new Error(`Selfie Upload failed: ${selfieUploadError.message}`);

            // 3. Create KYC Request Row
            const { error: dbError } = await this.supabase
                .from('kyc_requests')
                .insert({
                    user_id: user.id,
                    id_card_url: idPath,
                    selfie_url: selfiePath,
                    status: 'pending'
                });

            if (dbError) throw new Error(`Database insertion failed: ${dbError.message}`);

            // 4. Update Profile with Bank Details
            const { error: profileError } = await this.supabase
                .from('profiles')
                .update({
                    bank_name: bankDetails.bank_name,
                    account_name: bankDetails.account_name,
                    account_number: bankDetails.account_number
                })
                .eq('id', user.id);

            if (profileError) throw new Error(`Failed to update bank details: ${profileError.message}`);

            return { success: true };
        } catch (error: any) {
            console.error('KYC Submission Error:', error);
            return { success: false, error: error.message || 'An unexpected error occurred' };
        }
    }

    /**
     * Get current user's profile
     */
    async getProfile(): Promise<Profile | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }

        return data as Profile;
    }

    /**
     * Get full trust score breakdown
     */
    async getTrustBreakdown(): Promise<TrustScoreBreakdown | null> {
        const profile = await this.getProfile();
        if (!profile) return null;

        // Calculate days since account creation
        const accountAgeDays = Math.floor(
            (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Get social connections count
        const { data: identities } = await this.supabase.auth.getUserIdentities();
        const socialConnections = identities?.identities?.length || 0;

        // Get device info
        const devices = await this.getUserDevices();
        const hasUniqueDevice = devices.length > 0;
        const hasKnownGoodDevice = devices.some(d => d.trust_contribution > 0);

        // Build factors
        const factors: TrustFactors = {
            emailVerified: !!profile.email, // Supabase requires verified email
            phoneVerified: profile.phone_verified,
            idVerified: profile.id_verified,
            socialConnections: socialConnections,
            accountAgeDays: accountAgeDays,
            hasAvatar: !!profile.avatar_url,
            hasBio: !!profile.display_name && profile.display_name.length > 10,
            hasUsername: !!profile.username,
            uniqueDevice: hasUniqueDevice,
            knownGoodDevice: hasKnownGoodDevice,
            fairWins: profile.total_wins,
        };

        return calculateTrustScore(factors);
    }

    /**
     * Get improvement tips for the user
     */
    async getImprovementTips(): Promise<string[]> {
        const profile = await this.getProfile();
        if (!profile) return [];

        const { data: identities } = await this.supabase.auth.getUserIdentities();
        const socialConnections = identities?.identities?.length || 0;

        const accountAgeDays = Math.floor(
            (Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        const factors: TrustFactors = {
            emailVerified: !!profile.email,
            phoneVerified: profile.phone_verified,
            idVerified: profile.id_verified,
            socialConnections,
            accountAgeDays,
            hasAvatar: !!profile.avatar_url,
            hasBio: !!profile.display_name && profile.display_name.length > 10,
        };

        return getImprovementTips(factors);
    }

    /**
     * Get next tier info
     */
    async getNextTierInfo() {
        const profile = await this.getProfile();
        if (!profile) return null;

        return getScoreToNextTier(profile.trust_score);
    }

    /**
     * Get user's devices
     */
    async getUserDevices(): Promise<UserDevice[]> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await this.supabase
            .from('user_devices')
            .select(`
        id,
        is_primary,
        trust_contribution,
        last_used_at,
        device_fingerprints (
          fingerprint_hash
        )
      `)
            .eq('user_id', user.id)
            .order('last_used_at', { ascending: false });

        if (error) {
            console.error('Error fetching devices:', error);
            return [];
        }

        return (data || []).map((d: any) => ({
            id: d.id,
            fingerprint_hash: d.device_fingerprints?.fingerprint_hash || 'Unknown',
            is_primary: d.is_primary,
            trust_contribution: d.trust_contribution,
            last_used_at: d.last_used_at,
        }));
    }

    /**
     * Get trust history (score changes)
     */
    async getTrustHistory(limit = 10): Promise<TrustEvent[]> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await this.supabase
            .from('trust_events')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching trust history:', error);
            return [];
        }

        return data as TrustEvent[];
    }

    /**
     * Store device fingerprint for current user
     */
    async storeFingerprint(fingerprint: {
        hash: string;
        canvas?: string;
        webgl?: any;
        audio?: string;
        screen?: string;
        confidence: number;
    }): Promise<boolean> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return false;

        try {
            // Check if fingerprint already exists
            let { data: existingFp } = await this.supabase
                .from('device_fingerprints')
                .select('id, times_seen')
                .eq('fingerprint_hash', fingerprint.hash)
                .single();

            let fingerprintId: string;

            if (existingFp) {
                // Update existing fingerprint
                fingerprintId = existingFp.id;
                await this.supabase
                    .from('device_fingerprints')
                    .update({
                        times_seen: existingFp.times_seen + 1,
                        last_seen_at: new Date().toISOString(),
                        confidence: fingerprint.confidence,
                    })
                    .eq('id', fingerprintId);
            } else {
                // Create new fingerprint
                const { data: newFp, error } = await this.supabase
                    .from('device_fingerprints')
                    .insert({
                        fingerprint_hash: fingerprint.hash,
                        canvas_hash: fingerprint.canvas,
                        webgl_info: fingerprint.webgl,
                        audio_hash: fingerprint.audio,
                        screen_info: fingerprint.screen,
                        confidence: fingerprint.confidence,
                    })
                    .select('id')
                    .single();

                if (error || !newFp) {
                    console.error('Error creating fingerprint:', error);
                    return false;
                }
                fingerprintId = newFp.id;
            }

            // Link user to device
            const { error: linkError } = await this.supabase
                .from('user_devices')
                .upsert({
                    user_id: user.id,
                    fingerprint_id: fingerprintId,
                    last_used_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id,fingerprint_id',
                });

            if (linkError) {
                console.error('Error linking device:', linkError);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error storing fingerprint:', error);
            return false;
        }
    }

    /**
     * Update trust score
     */
    async updateTrustScore(newScore: number, reason: string): Promise<boolean> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return false;

        const clampedScore = Math.max(0, Math.min(100, newScore));

        const { error } = await this.supabase
            .from('profiles')
            .update({ trust_score: clampedScore })
            .eq('id', user.id);

        if (error) {
            console.error('Error updating trust score:', error);
            return false;
        }

        return true;
    }

    /**
     * Recalculate and sync trust score
     */
    async recalculateTrustScore(): Promise<number | null> {
        const breakdown = await this.getTrustBreakdown();
        if (!breakdown) return null;

        await this.updateTrustScore(breakdown.total, 'Score recalculated');
        return breakdown.total;
    }
}

export const trustService = new TrustService();
