"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, X } from "lucide-react";

interface LobbyToast {
    id: string;
    name: string;
    timestamp: number;
}

interface LobbyJoinToastProps {
    giveawayId: string;
    participants: Array<{
        user?: { username?: string; display_name?: string };
        joined_at: string;
    }>;
}

export function LobbyJoinToast({ giveawayId, participants }: LobbyJoinToastProps) {
    const [toasts, setToasts] = useState<LobbyToast[]>([]);
    const prevCountRef = useRef(participants.length);
    const seenIdsRef = useRef(new Set<number>());

    useEffect(() => {
        const currentCount = participants.length;
        if (currentCount > prevCountRef.current) {
            // New participants joined
            const newJoiners = participants.slice(prevCountRef.current);
            const newToasts: LobbyToast[] = newJoiners.map((p, i) => ({
                id: `${giveawayId}-${Date.now()}-${i}`,
                name: p.user?.display_name || p.user?.username || "Someone",
                timestamp: Date.now(),
            }));

            setToasts(prev => [...prev, ...newToasts].slice(-3)); // Keep max 3
        }
        prevCountRef.current = currentCount;
    }, [participants, giveawayId]);

    // Auto-dismiss after 4 seconds
    useEffect(() => {
        if (toasts.length === 0) return;
        const timer = setTimeout(() => {
            setToasts(prev => prev.slice(1));
        }, 4000);
        return () => clearTimeout(timer);
    }, [toasts]);

    const dismiss = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 100, scale: 0.8 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 100, scale: 0.8 }}
                        transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
                        className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/95 border border-green-500/30 shadow-lg shadow-green-500/10 backdrop-blur-sm max-w-[280px]"
                    >
                        <div className="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center flex-shrink-0">
                            <UserPlus className="w-3.5 h-3.5 text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                                {toast.name}
                            </p>
                            <p className="text-[10px] text-green-400">joined the lobby</p>
                        </div>
                        <button
                            onClick={() => dismiss(toast.id)}
                            className="p-0.5 rounded text-slate-500 hover:text-white transition-colors flex-shrink-0"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
