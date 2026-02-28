"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { useAuth } from "@/hooks/use-auth";
import { useFingerprint } from "@/hooks/use-fingerprint";
import {
    Shield,
    Trophy,
    Wallet,
    Gamepad2,
    User as UserIcon,
    ChevronRight,
    Star,
    Zap,
    TrendingUp,
    Sparkles
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

export default function DashboardPage() {
    const { signOut, getUser, loading } = useAuth();
    const { fingerprint } = useFingerprint();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        getUser().then(setUser);
    }, [getUser]);

    const quickActions = [
        { icon: Sparkles, label: "Host Giveaway", href: "/giveaways/create", color: "from-pink-500 to-rose-500", featured: true },
        { icon: Gamepad2, label: "Join Giveaway", href: "/giveaways", color: "from-purple-500 to-pink-500" },
        { icon: Trophy, label: "My Wins", href: "/wins", color: "from-yellow-500 to-orange-500" },
        { icon: Wallet, label: "Wallet", href: "/wallet", color: "from-green-500 to-emerald-500" },
    ];

    return (
        <div className="min-h-screen bg-[#06060c] text-slate-200 font-sans selection:bg-primary/30">
            <AppHeader />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16 w-full box-border">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-8"
                >
                    <h1 className="text-3xl md:text-4xl font-black text-white mb-2">
                        Welcome back<span className="text-primary">!</span>
                    </h1>
                    <p className="text-slate-400">Ready to compete? Let&apos;s get those W&apos;s 🔥</p>
                </motion.div>

                {/* Featured Host Giveaway CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.3 }}
                    className="mb-8"
                >
                    <Link href="/giveaways/create">
                        <motion.div
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            className="relative overflow-hidden p-6 rounded-2xl bg-gradient-to-r from-primary to-secondary cursor-pointer shadow-lg shadow-primary/20 border border-primary/20"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                            <div className="relative flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
                                        <Sparkles className="w-7 h-7 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-white">Host a Giveaway</h3>
                                        <p className="text-white/80 text-sm">One tap to go live! 🚀</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-6 h-6 text-white/60" />
                            </div>
                        </motion.div>
                    </Link>
                </motion.div>

                <div className="grid lg:grid-cols-3 gap-4 md:gap-6 min-w-0">
                    {/* Profile Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                        className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 min-w-0"
                    >
                        {loading ? (
                            <div className="animate-pulse flex flex-col items-center">
                                <div className="w-24 h-24 rounded-2xl bg-white/10 mb-4" />
                                <div className="h-6 w-32 bg-white/10 rounded mb-2" />
                                <div className="h-4 w-48 bg-white/5 rounded" />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-center mb-6">
                                {/* Avatar */}
                                <div className="w-24 h-24 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                                    <UserIcon className="w-12 h-12 text-slate-400" />
                                </div>

                                {/* Username */}
                                <h2 className="text-xl font-bold mb-1 text-white">
                                    {user?.user_metadata?.username || user?.email?.split('@')[0] || 'Player'}
                                </h2>
                                <p className="text-white/40 text-sm truncate max-w-full">
                                    {user?.email}
                                </p>

                                {/* Trust Tier Badge */}
                                <div className="mt-4 px-5 py-2 rounded-full tier-bronze text-sm font-bold flex items-center gap-2">
                                    🥉 Bronze Tier
                                </div>
                            </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="bg-slate-950/50 rounded-xl p-4 text-center border border-slate-800/50">
                                <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
                                <p className="text-2xl font-bold text-white">0</p>
                                <p className="text-xs text-slate-400">Wins</p>
                            </div>
                            <div className="bg-slate-950/50 rounded-xl p-4 text-center border border-slate-800/50">
                                <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
                                <p className="text-2xl font-bold text-white">₦0</p>
                                <p className="text-xs text-slate-400">Earned</p>
                            </div>
                        </div>

                        {/* Trust Score */}
                        <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800/50">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-primary" />
                                    <span className="text-sm text-slate-300">Trust Score</span>
                                </div>
                                <span className="text-sm font-bold text-white">20/100</span>
                            </div>
                            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '20%' }}
                                    transition={{ duration: 1, delay: 0.5 }}
                                    className="h-full bg-brand-gradient"
                                />
                            </div>
                            <p className="text-xs text-white/40 mt-2">
                                <Zap className="w-3 h-3 inline mr-1" />
                                Verify phone to boost +20 points
                            </p>
                        </div>
                    </motion.div>

                    {/* Main Content */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.3 }}
                        className="lg:col-span-2 space-y-6 min-w-0"
                    >
                        {/* Quick Actions */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                                {quickActions.map((action, i) => (
                                    <motion.div
                                        key={action.label}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.2 + i * 0.05, duration: 0.2 }}
                                    >
                                        <Link href={action.href}>
                                            <motion.div
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="flex flex-col items-center p-4 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors border border-slate-700/50 cursor-pointer h-full"
                                            >
                                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-3 shadow-md opacity-90`}>
                                                    <action.icon className="w-6 h-6 text-white" />
                                                </div>
                                                <span className="text-sm font-medium text-slate-200 text-center">{action.label}</span>
                                            </motion.div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Device Security */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                                    <Shield className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-bold">Fair Play System™</h3>
                                    <p className="text-xs text-white/40">Your device is secured</p>
                                </div>
                            </div>

                            {fingerprint ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                                        <span className="text-green-400 font-medium">✓ Device Verified</span>
                                        <span className="text-xs text-white/40">
                                            Confidence: {fingerprint.confidence}%
                                        </span>
                                    </div>
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                                        <p className="text-xs text-white/40 mb-1">Device Fingerprint</p>
                                        <p className="text-xs font-mono text-white/60 truncate max-w-full">
                                            {fingerprint.hash}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-950/50 rounded-xl text-center border border-slate-800/50">
                                    <p className="text-slate-400">Loading device security...</p>
                                </div>
                            )}
                        </div>

                        {/* Active Giveaways */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">Active Giveaways</h3>
                                <Link href="/giveaways">
                                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10">
                                        View All <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </Link>
                            </div>

                            <div className="text-center py-10 bg-slate-950/50 rounded-xl border border-slate-800/50">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
                                    <Star className="w-8 h-8 text-slate-500" />
                                </div>
                                <p className="text-slate-300 font-medium mb-1">No active giveaways</p>
                                <p className="text-sm text-slate-500">Check back soon for new contests!</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
