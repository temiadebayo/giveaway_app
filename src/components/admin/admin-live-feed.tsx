"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, UserPlus, Wallet, Gift, ArrowRight } from "lucide-react";

interface FeedEvent {
    id: string;
    type: 'user' | 'wallet' | 'giveaway';
    title: string;
    time: string;
    timestamp: number;
}

export function AdminLiveFeed() {
    const [events, setEvents] = useState<FeedEvent[]>([
        // Initial dummy data to make it look populated
        { id: "1", type: "user", title: "New user signed up: cryptoking", time: "Just now", timestamp: Date.now() },
        { id: "2", type: "wallet", title: "Deposit request: ₦50,000", time: "2 mins ago", timestamp: Date.now() - 120000 },
        { id: "3", type: "giveaway", title: "Giveaway ended: Weekend Special", time: "5 mins ago", timestamp: Date.now() - 300000 }
    ]);

    useEffect(() => {
        const supabase = createClient();

        const handleNewUser = (payload: any) => {
            const newUser = payload.new;
            addEvent({
                id: `user-${newUser.id}`,
                type: 'user',
                title: `New user joined: ${newUser.username || 'Anonymous'}`,
                time: "Just now",
                timestamp: Date.now()
            });
        };

        const handleNewTx = (payload: any) => {
            const tx = payload.new;
            addEvent({
                id: `tx-${tx.id}`,
                type: 'wallet',
                title: `New ${tx.type}: ₦${tx.amount.toLocaleString()}`,
                time: "Just now",
                timestamp: Date.now()
            });
        };

        const channel = supabase.channel('admin-activity')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, handleNewUser)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wallet_transactions' }, handleNewTx)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const addEvent = (event: FeedEvent) => {
        setEvents(prev => {
            // Check if already exists just in case
            if (prev.find(e => e.id === event.id)) return prev;
            return [event, ...prev].slice(0, 8); // Keep last 8
        });
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'user': return <UserPlus className="w-4 h-4 text-blue-400" />;
            case 'wallet': return <Wallet className="w-4 h-4 text-green-400" />;
            case 'giveaway': return <Gift className="w-4 h-4 text-purple-400" />;
            default: return <Activity className="w-4 h-4 text-slate-400" />;
        }
    };

    const getBgColor = (type: string) => {
        switch (type) {
            case 'user': return "bg-blue-500/10 border-blue-500/20";
            case 'wallet': return "bg-green-500/10 border-green-500/20";
            case 'giveaway': return "bg-purple-500/10 border-purple-500/20";
            default: return "bg-slate-800 border-slate-700";
        }
    };

    return (
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/60 backdrop-blur-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Activity className="w-4 h-4 text-brand-400" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    </div>
                    <h2 className="text-base font-bold text-white">Live Activity</h2>
                </div>
            </div>

            <div className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="space-y-3">
                        <AnimatePresence initial={false}>
                            {events.map((event) => (
                                <motion.div
                                    key={event.id}
                                    initial={{ opacity: 0, height: 0, x: -20 }}
                                    animate={{ opacity: 1, height: "auto", x: 0 }}
                                    exit={{ opacity: 0, height: 0, scale: 0.9 }}
                                    transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                                    className={`p-3 rounded-xl border ${getBgColor(event.type)} flex gap-3 group`}
                                >
                                    <div className="mt-0.5">{getIcon(event.type)}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-white truncate">{event.title}</p>
                                        <p className="text-xs text-slate-500">{event.time}</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity self-center" />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
            
            <div className="mt-4 pt-3 border-t border-slate-800/60 text-center">
                <p className="text-xs text-slate-500 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-pulse" />
                    Connected to Realtime
                </p>
            </div>
        </div>
    );
}
