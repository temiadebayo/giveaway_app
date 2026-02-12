"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { useFingerprint } from "@/hooks/use-fingerprint";
import type { Provider } from "@supabase/supabase-js";

export function useAuth() {
    const supabase = createClient();
    const router = useRouter();
    const { fingerprint } = useFingerprint();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sign in with social provider
    const signInWithProvider = useCallback(async (provider: Provider) => {
        setLoading(true);
        setError(null);

        try {
            // Include fingerprint in redirect URL for guest account linking
            const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
            if (fingerprint?.hash) {
                callbackUrl.searchParams.set('fingerprint', fingerprint.hash);
            }

            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: callbackUrl.toString(),
                },
            });

            if (error) throw error;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to sign in");
            setLoading(false);
        }
    }, [supabase, fingerprint]);

    // Sign in with email (magic link)
    const signInWithEmail = useCallback(async (email: string) => {
        setLoading(true);
        setError(null);

        try {
            // Include fingerprint in redirect URL for guest account linking
            const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
            if (fingerprint?.hash) {
                callbackUrl.searchParams.set('fingerprint', fingerprint.hash);
            }

            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: callbackUrl.toString(),
                },
            });

            if (error) throw error;
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to send magic link");
            return false;
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    // Sign in with email and password
    const signInWithPassword = useCallback(async (email: string, password: string) => {
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            router.push("/dashboard");
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to sign in");
        } finally {
            setLoading(false);
        }
    }, [supabase, router]);

    // Sign up with email and password
    const signUp = useCallback(async (email: string, password: string, username?: string) => {
        setLoading(true);
        setError(null);

        try {
            // Include fingerprint in redirect URL for guest account linking
            const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
            if (fingerprint?.hash) {
                callbackUrl.searchParams.set('fingerprint', fingerprint.hash);
            }

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: callbackUrl.toString(),
                    data: {
                        username,
                        fingerprint_hash: fingerprint?.hash,
                    },
                },
            });

            if (error) throw error;

            // If email confirmation is required
            if (data.user && !data.session) {
                return { needsConfirmation: true };
            }

            router.push("/dashboard");
            router.refresh();
            return { needsConfirmation: false };
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to sign up");
            return null;
        } finally {
            setLoading(false);
        }
    }, [supabase, router, fingerprint]);

    // Sign out
    const signOut = useCallback(async () => {
        setLoading(true);
        try {
            await supabase.auth.signOut();
            router.push("/");
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to sign out");
        } finally {
            setLoading(false);
        }
    }, [supabase, router]);

    // Get current user
    const getUser = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    }, [supabase]);

    return {
        signInWithProvider,
        signInWithEmail,
        signInWithPassword,
        signUp,
        signOut,
        getUser,
        loading,
        error,
        setError,
    };
}
