"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, UserPlus, Wallet, Gift, ShieldAlert, Gamepad2 } from "lucide-react";

/**
 * Admin live activity feed.
 *
 * Reads public.fps_events, which admins can select via its is_admin() RLS policy and
 * which is in the supabase_realtime publication.
 *
 * Two things were wrong here before:
 *
 *  1. It seeded itself with three invented events ("New user signed up: cryptoking",
 *     "Deposit request: ₦50,000", "Giveaway ended: Weekend Special") and rendered them
 *     under a "Connected to Realtime" label. On a financial admin panel, fabricated
 *     activity presented as real is not a placeholder — it is misinformation an operator
 *     could act on. An honest empty state is strictly better than a populated fake one.
 *
 *  2. It subscribed to `profiles` and `wallet_transactions` with the browser (anon) key.
 *     Realtime enforces RLS, and after the Phase 0 lockdown those tables are restricted
 *     to the owner's own rows — so it would have shown an admin only their own
 *     transactions, silently, while still claiming to be a platform-wide feed.
 */

interface FeedEvent {
    id: string;
    event_name: string;
    category: string;
    severity: string;
    properties: Record<string, unknown> | null;
    created_at: string;
}

const MAX_EVENTS = 12;

function iconFor(category: string, severity: string) {
    if (severity === "critical" || severity === "warning") {
        return <ShieldAlert className="w-4 h-4 text-red-400" />;
    }
    switch (category) {
        case "auth": return <UserPlus className="w-4 h-4 text-blue-400" />;
        case "financial": return <Wallet className="w-4 h-4 text-green-400" />;
        case "game": return <Gamepad2 className="w-4 h-4 text-purple-400" />;
        case "analytics": return <Gift className="w-4 h-4 text-brand-400" />;
        default: return <Activity className="w-4 h-4 text-slate-400" />;
    }
}

function styleFor(category: string, severity: string) {
    if (severity === "critical") return "bg-red-500/10 border-red-500/30";
    if (severity === "warning") return "bg-orange-500/10 border-orange-500/25";
    switch (category) {
        case "auth": return "bg-blue-500/10 border-blue-500/20";
        case "financial": return "bg-green-500/10 border-green-500/20";
        case "game": return "bg-purple-500/10 border-purple-500/20";
        default: return "bg-slate-800/50 border-slate-700/50";
    }
}

/** Turn an event_name like `giveaway_joined` into `Giveaway joined`. */
function labelFor(event: FeedEvent): string {
    const base = event.event_name.replace(/_/g, " ");
    const label = base.charAt(0).toUpperCase() + base.slice(1);

    const props = event.properties ?? {};
    const amount = props.amount ?? props.prize_amount;

    if (typeof amount === "number") {
        return `${label} — ₦${amount.toLocaleString()}`;
    }
    if (typeof props.score === "number") {
        return `${label} — score ${props.score.toLocaleString()}`;
    }
    return label;
}

function relativeTime(iso: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function AdminLiveFeed() {
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);

    // Re-render periodically so the relative timestamps stay honest without
    // recomputing Date.now() during render.
    const [, setTick] = useState(0);

    const addEvent = useCallback((event: FeedEvent) => {
        setEvents(prev => {
            if (prev.some(e => e.id === event.id)) return prev;
            return [event, ...prev].slice(0, MAX_EVENTS);
        });
    }, []);

    useEffect(() => {
        const supabase = createClient();
        let cancelled = false;

        const loadRecent = async () => {
            const { data } = await supabase
                .from("fps_events")
                .select("id, event_name, category, severity, properties, created_at")
                .order("created_at", { ascending: false })
                .limit(MAX_EVENTS);

            if (!cancelled) {
                setEvents((data as FeedEvent[]) ?? []);
                setLoading(false);
            }
        };

        loadRecent();

        const channel = supabase
            .channel("admin-activity")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "fps_events" },
                payload => addEvent(payload.new as FeedEvent)
            )
            .subscribe(status => {
                if (!cancelled) setConnected(status === "SUBSCRIBED");
            });

        const ticker = setInterval(() => setTick(t => t + 1), 30_000);

        return () => {
            cancelled = true;
            clearInterval(ticker);
            supabase.removeChannel(channel);
        };
    }, [addEvent]);

    return (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/60 backdrop-blur-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Activity className="w-4 h-4 text-brand-400" />
                        {connected && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                    </div>
                    <h2 className="text-base font-bold text-white">Live Activity</h2>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="space-y-3">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="h-14 rounded-xl bg-slate-800/40 animate-pulse" />
                            ))}
                        </div>
                    ) : events.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8">
                            <Activity className="w-8 h-8 text-slate-700 mb-3" />
                            <p className="text-sm text-slate-500">No activity yet</p>
                            <p className="text-xs text-slate-600 mt-1">
                                Events appear here as users join, play and transact.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <AnimatePresence initial={false}>
                                {events.map(event => (
                                    <motion.div
                                        key={event.id}
                                        initial={{ opacity: 0, height: 0, x: -20 }}
                                        animate={{ opacity: 1, height: "auto", x: 0 }}
                                        exit={{ opacity: 0, height: 0, scale: 0.9 }}
                                        transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                                        className={`p-3 rounded-xl border ${styleFor(event.category, event.severity)} flex gap-3 group`}
                                    >
                                        <div className="mt-0.5">{iconFor(event.category, event.severity)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">
                                                {labelFor(event)}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                {relativeTime(event.created_at)}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/60 text-center">
                <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                    <span
                        className={`w-1.5 h-1.5 rounded-full ${
                            connected ? "bg-green-500/70 animate-pulse" : "bg-slate-600"
                        }`}
                    />
                    {connected ? "Connected to Realtime" : "Connecting…"}
                </p>
            </div>
        </div>
    );
}
