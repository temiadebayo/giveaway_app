"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import type { FPSEvent } from "@/lib/fps-service";

const SEVERITY_STYLES: Record<string, string> = {
    info:     "bg-slate-800/60 border-slate-700/40 text-slate-300",
    warning:  "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
    critical: "bg-red-500/10 border-red-500/40 text-red-300",
};

const CATEGORY_COLORS: Record<string, string> = {
    analytics: "text-blue-400",
    security:  "text-red-400",
    game:      "text-purple-400",
    financial: "text-green-400",
    auth:      "text-cyan-400",
};

const CATEGORY_DOT: Record<string, string> = {
    analytics: "bg-blue-500",
    security:  "bg-red-500",
    game:      "bg-purple-500",
    financial: "bg-green-500",
    auth:      "bg-cyan-500",
};

interface FPSLiveFeedProps {
    initialEvents: FPSEvent[];
}

export function FPSLiveFeed({ initialEvents }: FPSLiveFeedProps) {
    const [events, setEvents] = useState<FPSEvent[]>(initialEvents.slice(0, 40));

    useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel('fps-live')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'fps_events' },
                (payload) => {
                    const newEvent = payload.new as FPSEvent;
                    setEvents(prev => [newEvent, ...prev].slice(0, 40));
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <h3 className="text-sm font-bold text-white">Live Event Feed</h3>
                <span className="ml-auto text-xs text-slate-500">{events.length} events</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                <AnimatePresence initial={false}>
                    {events.map(e => (
                        <motion.div
                            key={e.id}
                            initial={{ opacity: 0, x: -10, height: 0 }}
                            animate={{ opacity: 1, x: 0, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className={`px-3 py-2 rounded-lg border text-xs ${SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.info}`}
                        >
                            <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CATEGORY_DOT[e.category] || 'bg-slate-500'}`} />
                                <span className="font-mono font-semibold truncate flex-1">{e.event_name}</span>
                                <span className={`text-[10px] font-medium uppercase tracking-wide flex-shrink-0 ${CATEGORY_COLORS[e.category]}`}>
                                    {e.category}
                                </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                                <span>{new Date(e.created_at).toLocaleTimeString()}</span>
                                {e.fingerprint_id && <span className="font-mono">fp:{e.fingerprint_id.slice(0, 8)}</span>}
                                {e.giveaway_id && <span>gvwy:{e.giveaway_id.slice(0, 8)}</span>}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}
