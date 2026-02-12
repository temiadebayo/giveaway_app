"use client";

import { useState, useEffect, useCallback } from 'react';
import { trustService, Profile, TrustEvent, UserDevice } from '@/lib/trust-service';
import { TrustScoreBreakdown, TrustTier } from '@/lib/trust-engine';

export interface UseTrustScoreReturn {
    profile: Profile | null;
    breakdown: TrustScoreBreakdown | null;
    history: TrustEvent[];
    devices: UserDevice[];
    tips: string[];
    nextTier: { nextTier: TrustTier | null; pointsNeeded: number } | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    storeFingerprint: (fingerprint: any) => Promise<boolean>;
    recalculate: () => Promise<void>;
}

export function useTrustScore(): UseTrustScoreReturn {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [breakdown, setBreakdown] = useState<TrustScoreBreakdown | null>(null);
    const [history, setHistory] = useState<TrustEvent[]>([]);
    const [devices, setDevices] = useState<UserDevice[]>([]);
    const [tips, setTips] = useState<string[]>([]);
    const [nextTier, setNextTier] = useState<{ nextTier: TrustTier | null; pointsNeeded: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [
                profileData,
                breakdownData,
                historyData,
                devicesData,
                tipsData,
                nextTierData,
            ] = await Promise.all([
                trustService.getProfile(),
                trustService.getTrustBreakdown(),
                trustService.getTrustHistory(),
                trustService.getUserDevices(),
                trustService.getImprovementTips(),
                trustService.getNextTierInfo(),
            ]);

            setProfile(profileData);
            setBreakdown(breakdownData);
            setHistory(historyData);
            setDevices(devicesData);
            setTips(tipsData);
            setNextTier(nextTierData);
        } catch (err) {
            console.error('Error fetching trust data:', err);
            setError('Failed to load trust score data');
        } finally {
            setLoading(false);
        }
    }, []);

    const storeFingerprint = useCallback(async (fingerprint: any): Promise<boolean> => {
        const result = await trustService.storeFingerprint(fingerprint);
        if (result) {
            await refresh();
        }
        return result;
    }, [refresh]);

    const recalculate = useCallback(async () => {
        await trustService.recalculateTrustScore();
        await refresh();
    }, [refresh]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        profile,
        breakdown,
        history,
        devices,
        tips,
        nextTier,
        loading,
        error,
        refresh,
        storeFingerprint,
        recalculate,
    };
}
