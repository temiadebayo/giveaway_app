"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, X } from "lucide-react";
import { giveawayService } from "@/lib/giveaway-service";
import { getGuestToken } from "@/lib/guest-session";

/**
 * Claims this browser's guest history into the account that just signed in.
 *
 * Runs once on mount wherever it is placed (currently the dashboard, which every auth
 * path lands on). It is a no-op when there is no guest token, so it costs nothing for
 * users who never played as a guest.
 *
 * Why client-side: the session token is a credential. It lives in localStorage and is
 * only ever sent in a request body. The previous implementation passed a device
 * fingerprint through the OAuth redirect URL, which both authorised nothing (fingerprints
 * are public) and exposed the value to browser history, Referer headers and access logs.
 */
export function GuestSessionClaimer() {
    const [linkedCount, setLinkedCount] = useState<number | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!getGuestToken()) return;

        let cancelled = false;

        (async () => {
            const result = await giveawayService.claimGuestSession();

            if (cancelled) return;

            if (result.success && (result.linkedCount ?? 0) > 0) {
                setLinkedCount(result.linkedCount ?? 0);
            }
            // A failed claim is deliberately silent. The common cause is a session already
            // claimed by another account, and there is nothing useful the user can do
            // about it here — it is recorded server-side either way.
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const show = linkedCount !== null && linkedCount > 0 && !dismissed;

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    role="status"
                    className="mb-6 flex items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4"
                >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/20">
                        <Trophy className="h-4 w-4 text-brand-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">
                            Welcome back — we found your guest games
                        </p>
                        <p className="text-xs text-white/60">
                            {linkedCount} {linkedCount === 1 ? "entry has" : "entries have"} been
                            added to your account, including any prizes you won.
                        </p>
                    </div>
                    <button
                        onClick={() => setDismissed(true)}
                        aria-label="Dismiss"
                        className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
