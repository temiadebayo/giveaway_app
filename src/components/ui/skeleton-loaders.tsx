"use client";

import { motion } from "framer-motion";

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
    return (
        <motion.div
            className={`bg-slate-800/60 rounded-lg ${className}`}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
    );
}

/** Skeleton for a stat card (used in dashboard, admin) */
export function SkeletonStatCard() {
    return (
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/40">
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="w-16 h-5 rounded-full" />
            </div>
            <Skeleton className="w-24 h-7 mb-2" />
            <Skeleton className="w-20 h-4" />
        </div>
    );
}

/** Skeleton for a giveaway card */
export function SkeletonGiveawayCard() {
    return (
        <div className="card-premium p-5">
            <div className="flex items-start justify-between mb-3">
                <Skeleton className="w-32 h-5" />
                <Skeleton className="w-16 h-5 rounded-full" />
            </div>
            <Skeleton className="w-full h-4 mb-2" />
            <Skeleton className="w-3/4 h-4 mb-4" />
            <div className="flex items-center gap-4">
                <Skeleton className="w-20 h-8 rounded-xl" />
                <Skeleton className="w-20 h-8 rounded-xl" />
                <Skeleton className="w-20 h-8 rounded-xl" />
            </div>
        </div>
    );
}

/** Skeleton for a transaction row */
export function SkeletonTransactionRow() {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800/30">
            <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <Skeleton className="w-24 h-4 mb-1.5" />
                <Skeleton className="w-16 h-3" />
            </div>
            <div className="text-right">
                <Skeleton className="w-16 h-4 mb-1.5 ml-auto" />
                <Skeleton className="w-12 h-3 ml-auto" />
            </div>
        </div>
    );
}

/** Skeleton for a leaderboard row */
export function SkeletonLeaderboardRow() {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800/30">
            <Skeleton className="w-6 h-6 rounded-lg flex-shrink-0" />
            <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <Skeleton className="w-20 h-4 mb-1" />
                <Skeleton className="w-14 h-3" />
            </div>
            <Skeleton className="w-12 h-5 rounded-full" />
        </div>
    );
}

/** Full page loading skeleton with multiple cards */
export function SkeletonPageLoader({ cards = 4 }: { cards?: number }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
                <Skeleton className="w-8 h-8 rounded-xl" />
                <Skeleton className="w-40 h-7" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: cards }).map((_, i) => (
                    <SkeletonStatCard key={i} />
                ))}
            </div>
        </div>
    );
}
