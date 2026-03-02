"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useTrustScore } from "@/hooks/use-trust-score";
import {
    TrustTierBadge,
    TrustScoreBar,
    TrustBreakdownCard,
    TierBenefitsCard,
    ImprovementTips
} from "@/components/trust/trust-components";
import { TrustScoreDial } from "@/components/trust/trust-score-dial";
import {
    ArrowLeft,
    RefreshCw,
    Shield,
    Loader2,
    History,
    TrendingUp,
    TrendingDown,
    Minus
} from "lucide-react";
import logoWhite from "@/assets/logo_white.png";
import ZackMascot from "@/assets/Zack_GA_Mascot_1.svg";

export default function TrustScorePage() {
    const {
        profile,
        breakdown,
        history,
        tips,
        nextTier,
        loading,
        error,
        refresh,
        recalculate
    } = useTrustScore();

    if (loading) {
        return (
            <main className="min-h-screen bg-[#06060c] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
                    <p className="text-white/60">Loading trust data...</p>
                </div>
            </main>
        );
    }

    if (error || !profile || !breakdown) {
        return (
            <main className="min-h-screen bg-[#06060c] flex items-center justify-center">
                <div className="text-center bg-slate-900/50 border border-slate-800 p-8 max-w-md rounded-2xl">
                    <Shield className="w-12 h-12 mx-auto mb-4 text-red-400" />
                    <h2 className="text-xl font-bold mb-2">Unable to Load</h2>
                    <p className="text-white/60 mb-4">{error || "Please sign in to view your trust score"}</p>
                    <Link href="/login">
                        <Button className="bg-brand-gradient">Sign In</Button>
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#06060c] overflow-x-hidden text-slate-200">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 px-3 sm:px-6 py-3 sm:py-4 glass">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/dashboard" className="flex items-center gap-3">
                        <Image src={logoWhite} alt="Giveaway" width={36} height={36} />
                        <span className="font-bold text-lg hidden sm:inline">GIVEAWAY</span>
                    </Link>
                    <Button
                        variant="ghost"
                        onClick={recalculate}
                        className="text-white/60 hover:text-white hover:bg-white/5"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-3 py-4 sm:p-6 pb-20">
                {/* Back button */}
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard
                </Link>

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
                >
                    <div className="relative">
                        <h1 className="text-3xl md:text-5xl font-black mb-2 flex items-center gap-3">
                            <Shield className="w-10 h-10 text-primary" />
                            Trust Score<span className="text-primary">™</span>
                        </h1>
                        <p className="text-white/60 text-lg">Your Reputation & Platform Perks</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="hidden lg:block mr-4"
                        >
                            <Image src={ZackMascot} alt="Zack" width={120} height={120} className="drop-shadow-2xl" />
                        </motion.div>
                        <TrustTierBadge tier={breakdown.tier} size="lg" />
                    </div>
                </motion.div>

                {/* Main Score */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="card-premium p-6 mb-6"
                >
                    {/* Radial Dial */}
                    <div className="flex justify-center mb-4">
                        <TrustScoreDial score={breakdown.total} tier={breakdown.tier} />
                    </div>

                    {/* Linear Bar (detail view) */}
                    <TrustScoreBar score={breakdown.total} animated />

                    {nextTier?.nextTier && (
                        <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-xl text-center">
                            <p className="text-sm">
                                <span className="text-white/60">Need </span>
                                <span className="font-bold text-primary">{nextTier.pointsNeeded} more points</span>
                                <span className="text-white/60"> to reach </span>
                                <span className="font-bold">{nextTier.nextTier.charAt(0).toUpperCase() + nextTier.nextTier.slice(1)}</span>
                            </p>
                        </div>
                    )}
                </motion.div>

                {/* Grid */}
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Left column */}
                    <div className="lg:col-span-2 space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <TrustBreakdownCard breakdown={breakdown} />
                        </motion.div>

                        {/* History */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="card-premium p-6"
                        >
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <History className="w-5 h-5 text-primary" />
                                Score History
                            </h3>

                            {history.length === 0 ? (
                                <p className="text-white/40 text-center py-4">No score changes yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {history.map((event, i) => (
                                        <div
                                            key={event.id}
                                            className="flex items-center justify-between p-3 bg-white/5 rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                {event.score_change > 0 ? (
                                                    <TrendingUp className="w-4 h-4 text-green-400" />
                                                ) : event.score_change < 0 ? (
                                                    <TrendingDown className="w-4 h-4 text-red-400" />
                                                ) : (
                                                    <Minus className="w-4 h-4 text-white/40" />
                                                )}
                                                <div>
                                                    <p className="text-sm font-medium">{event.reason}</p>
                                                    <p className="text-xs text-white/40">
                                                        {new Date(event.created_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`font-bold ${event.score_change > 0 ? 'text-green-400' :
                                                event.score_change < 0 ? 'text-red-400' : 'text-white/40'
                                                }`}>
                                                {event.score_change > 0 ? '+' : ''}{event.score_change}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* Right column */}
                    <div className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                        >
                            <TierBenefitsCard tier={breakdown.tier} />
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                        >
                            <ImprovementTips tips={tips} />
                        </motion.div>
                    </div>
                </div>
            </div>
        </main>
    );
}
