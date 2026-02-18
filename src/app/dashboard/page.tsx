"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useFingerprint } from "@/hooks/use-fingerprint";
import {
    LogOut,
    Shield,
    Trophy,
    Wallet,
    Gamepad2,
    Settings,
    User as UserIcon,
    ChevronRight,
    Star,
    Zap,
    TrendingUp,
    Sparkles
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import logoWhite from "@/assets/logo_white.png";

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
        <main className="min-h-screen bg-aurora">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 px-6 py-4 glass">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <Image src={logoWhite} alt="Giveaway" width={36} height={36} />
                        <span className="font-bold text-lg hidden sm:inline">GIVEAWAY</span>
                    </Link>
                    <Button variant="ghost" onClick={signOut} disabled={loading} className="text-white/60 hover:text-white">
                        <LogOut className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Sign Out</span>
                    </Button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto p-4 md:p-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-6"
                >
                    <h1 className="text-3xl md:text-4xl font-black mb-2">
                        Welcome back<span className="text-primary">!</span>
                    </h1>
                    <p className="text-white/60">Ready to compete? Let&apos;s get those W&apos;s 🔥</p>
                </motion.div>

                {/* Featured Host Giveaway CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.3 }}
                    className="mb-6"
                >
                    <Link href="/giveaways/create">
                        <motion.div
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            className="relative overflow-hidden p-6 rounded-2xl bg-gradient-to-r from-pink-600 to-purple-600 cursor-pointer glow-primary"
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

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Profile Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.3 }}
                        className="lg:col-span-1 card-premium p-6"
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
                                <div className="w-24 h-24 rounded-2xl bg-brand-gradient flex items-center justify-center mb-4 glow-primary">
                                    <UserIcon className="w-12 h-12 text-white" />
                                </div>

                                {/* Username */}
                                <h2 className="text-xl font-bold mb-1">
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
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-white/5 rounded-xl p-4 text-center border border-white/5">
                                <Trophy className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
                                <p className="text-2xl font-bold">0</p>
                                <p className="text-xs text-white/40">Wins</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 text-center border border-white/5">
                                <TrendingUp className="w-5 h-5 mx-auto mb-1 text-green-400" />
                                <p className="text-2xl font-bold">$0</p>
                                <p className="text-xs text-white/40">Earned</p>
                            </div>
                        </div>

                        {/* Trust Score */}
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-primary" />
                                    <span className="text-sm text-white/60">Trust Score</span>
                                </div>
                                <span className="text-sm font-bold">20/100</span>
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
                        className="lg:col-span-2 space-y-6"
                    >
                        {/* Quick Actions */}
                        <div className="card-premium p-6">
                            <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {quickActions.map((action, i) => (
                                    <motion.div
                                        key={action.label}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.2 + i * 0.05, duration: 0.2 }}
                                    >
                                        <Link href={action.href}>
                                            <motion.div
                                                whileHover={{ scale: 1.05, y: -2 }}
                                                whileTap={{ scale: 0.95 }}
                                                className="flex flex-col items-center p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 cursor-pointer"
                                            >
                                                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-3 shadow-lg`}>
                                                    <action.icon className="w-7 h-7 text-white" />
                                                </div>
                                                <span className="text-sm font-medium">{action.label}</span>
                                            </motion.div>
                                        </Link>
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Device Security */}
                        <div className="card-premium p-6">
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
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                                        <p className="text-xs text-white/40 mb-1">Device Fingerprint</p>
                                        <p className="text-xs font-mono text-white/60 truncate">
                                            {fingerprint.hash}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-white/5 rounded-xl text-center">
                                    <p className="text-white/40">Loading device security...</p>
                                </div>
                            )}
                        </div>

                        {/* Active Giveaways */}
                        <div className="card-premium p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold">Active Giveaways</h3>
                                <Link href="/giveaways">
                                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                                        View All <ChevronRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </Link>
                            </div>

                            <div className="text-center py-12">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                                    <Star className="w-8 h-8 text-white/20" />
                                </div>
                                <p className="text-white/40 mb-1">No active giveaways</p>
                                <p className="text-sm text-white/20">Check back soon for new contests!</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </main>
    );
}
