/**
 * useFingerprint Hook
 * 
 * React hook for device fingerprinting.
 * Automatically captures fingerprint on mount and provides utilities.
 * 
 * Usage:
 *   const { fingerprint, isLoading, error, refresh } = useFingerprint();
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    generateFingerprint,
    getDeviceInfo,
    DeviceFingerprint
} from '@/lib/fingerprint';

interface UseFingerprintResult {
    fingerprint: DeviceFingerprint | null;
    deviceInfo: ReturnType<typeof getDeviceInfo> | null;
    isLoading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

export function useFingerprint(
    autoCapture: boolean = true
): UseFingerprintResult {
    const [fingerprint, setFingerprint] = useState<DeviceFingerprint | null>(null);
    const [deviceInfo, setDeviceInfo] = useState<ReturnType<typeof getDeviceInfo> | null>(null);
    const [isLoading, setIsLoading] = useState(autoCapture);
    const [error, setError] = useState<Error | null>(null);

    const capture = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const [fp, info] = await Promise.all([
                generateFingerprint(),
                Promise.resolve(getDeviceInfo()),
            ]);

            setFingerprint(fp);
            setDeviceInfo(info);
        } catch (e) {
            setError(e instanceof Error ? e : new Error('Failed to capture fingerprint'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (autoCapture) {
            capture();
        }
    }, [autoCapture, capture]);

    return {
        fingerprint,
        deviceInfo,
        isLoading,
        error,
        refresh: capture,
    };
}

/**
 * useFingerprintSubmit Hook
 * 
 * Extended hook that also submits fingerprint to API on capture.
 */

interface UseFingerprintSubmitOptions {
    endpoint?: string;
    onSuccess?: (response: any) => void;
    onError?: (error: Error) => void;
}

interface UseFingerprintSubmitResult extends UseFingerprintResult {
    submitted: boolean;
    submitting: boolean;
    submit: () => Promise<void>;
}

export function useFingerprintSubmit(
    options: UseFingerprintSubmitOptions = {}
): UseFingerprintSubmitResult {
    const {
        endpoint = '/api/fingerprint/capture',
        onSuccess,
        onError
    } = options;

    const base = useFingerprint(true);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const submit = useCallback(async () => {
        if (!base.fingerprint) return;

        setSubmitting(true);
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fingerprint: base.fingerprint,
                    deviceInfo: base.deviceInfo,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to submit fingerprint');
            }

            setSubmitted(true);
            onSuccess?.(data);
        } catch (e) {
            const error = e instanceof Error ? e : new Error('Failed to submit');
            onError?.(error);
        } finally {
            setSubmitting(false);
        }
    }, [base.fingerprint, base.deviceInfo, endpoint, onSuccess, onError]);

    return {
        ...base,
        submitted,
        submitting,
        submit,
    };
}
