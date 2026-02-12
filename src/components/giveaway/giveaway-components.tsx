"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Giveaway } from "@/lib/giveaway-service";
import { TrustTier, TIER_BENEFITS } from "@/lib/trust-engine";
import {
    Trophy,
    Users,
    Clock,
    DollarSign,
    ChevronRight,
    Gamepad2,
    Crown,
    Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface GiveawayCardProps {
    giveaway: Giveaway;
    index?: number;
}

export function GiveawayCard({ giveaway, index = 0 }: GiveawayCardProps) {
    const tierEmoji = TIER_BENEFITS[giveaway.min_trust_tier as TrustTier]?.emoji || '🥉';
    const isLive = giveaway.status === 'live';
    const isEnded = giveaway.status === 'ended';

    const formatPrize = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -4 }}
            className={`
        relative overflow-hidden rounded-2xl border backdrop-blur-xl
        ${isLive
                    ? 'bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-purple-500/50'
                    : 'bg-white/5 border-white/10'
                }
      `}
        >
            {/* Live Badge */}
            {isLive && (
                <div className="absolute top-3 right-3">
                    <span className="px-3 py-1 rounded-full bg-red-500 text-xs font-bold animate-pulse">
                        🔴 LIVE
                    </span>
                </div>
            )}

            {/* Ended Badge */}
            {isEnded && (
                <div className="absolute top-3 right-3">
                    <span className="px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-white/60">
                        ENDED
                    </span>
                </div>
            )}

            <div className="p-6">
                {/* Prize */}
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <p className="text-3xl font-black text-gradient-primary">
                            {formatPrize(giveaway.prize_amount, giveaway.prize_currency)}
                        </p>
                        <h3 className="text-lg font-bold mt-1">{giveaway.title}</h3>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-brand-gradient flex items-center justify-center">
                        <Gamepad2 className="w-6 h-6 text-white" />
                    </div>
                </div>

                {/* Host */}
                {giveaway.host && (
                    <div className="flex items-center gap-2 mb-4">
                        <Crown className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm text-white/60">
                            Hosted by <span className="font-medium text-white">{giveaway.host.display_name || giveaway.host.username}</span>
                        </span>
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-white/5 text-center">
                        <Users className="w-4 h-4 mx-auto mb-1 text-white/40" />
                        <p className="text-sm font-bold">{giveaway.participant_count || 0}</p>
                        <p className="text-xs text-white/40">Players</p>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5 text-center">
                        <Clock className="w-4 h-4 mx-auto mb-1 text-white/40" />
                        <p className="text-sm font-bold">{giveaway.game_duration_seconds}s</p>
                        <p className="text-xs text-white/40">Duration</p>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5 text-center">
                        <span className="text-lg">{tierEmoji}</span>
                        <p className="text-sm font-bold capitalize">{giveaway.min_trust_tier}</p>
                        <p className="text-xs text-white/40">Min Tier</p>
                    </div>
                </div>

                {/* Entry Fee */}
                {giveaway.entry_fee > 0 && (
                    <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <DollarSign className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm">
                            Entry: <span className="font-bold text-yellow-400">${giveaway.entry_fee}</span>
                        </span>
                    </div>
                )}

                {/* Starts At */}
                {giveaway.starts_at && !isLive && !isEnded && (
                    <p className="text-sm text-white/40 mb-4">
                        Starts: {formatDate(giveaway.starts_at)}
                    </p>
                )}

                {/* CTA */}
                <Link href={`/giveaways/${giveaway.id}`}>
                    <Button
                        className={`w-full ${isLive ? 'bg-brand-gradient' : ''}`}
                        variant={isLive ? 'default' : 'outline'}
                    >
                        {isLive ? (
                            <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Play Now
                            </>
                        ) : isEnded ? (
                            'View Results'
                        ) : (
                            <>
                                Join Giveaway
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </>
                        )}
                    </Button>
                </Link>
            </div>
        </motion.div>
    );
}

interface LeaderboardProps {
    participants: Array<{
        user_id: string;
        score: number;
        rank?: number | null;
        user?: {
            username: string;
            display_name: string;
            avatar_url: string | null;
            trust_tier: TrustTier;
        };
    }>;
    currentUserId?: string;
    maxDisplay?: number;
}

export function Leaderboard({ participants, currentUserId, maxDisplay = 10 }: LeaderboardProps) {
    const displayed = participants.slice(0, maxDisplay);

    const getRankStyle = (rank: number) => {
        switch (rank) {
            case 1: return 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white';
            case 2: return 'bg-gradient-to-r from-gray-400 to-gray-500 text-white';
            case 3: return 'bg-gradient-to-r from-amber-700 to-amber-800 text-white';
            default: return 'bg-white/10 text-white/60';
        }
    };

    const getRankIcon = (rank: number) => {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return `#${rank}`;
        }
    };

    const tierEmoji = (tier: TrustTier) => {
        return TIER_BENEFITS[tier]?.emoji || '🥉';
    };

    return (
        <div className="card-premium p-4">
            <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <h3 className="font-bold">Leaderboard</h3>
            </div>

            {displayed.length === 0 ? (
                <p className="text-white/40 text-center py-4">No scores yet</p>
            ) : (
                <div className="space-y-2">
                    {displayed.map((p, i) => {
                        const rank = p.rank || i + 1;
                        const isCurrentUser = p.user_id === currentUserId;

                        return (
                            <motion.div
                                key={p.user_id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`
                  flex items-center gap-3 p-3 rounded-xl
                  ${isCurrentUser ? 'bg-primary/20 border border-primary/30' : 'bg-white/5'}
                `}
                            >
                                {/* Rank */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getRankStyle(rank)}`}>
                                    {rank <= 3 ? getRankIcon(rank) : rank}
                                </div>

                                {/* User */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium truncate">
                                            {p.user?.display_name || p.user?.username || 'Player'}
                                        </p>
                                        {p.user?.trust_tier && (
                                            <span className="text-sm">{tierEmoji(p.user.trust_tier)}</span>
                                        )}
                                        {isCurrentUser && (
                                            <span className="text-xs text-primary">(You)</span>
                                        )}
                                    </div>
                                </div>

                                {/* Score */}
                                <p className="text-lg font-black">{p.score}</p>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

interface WinnerCelebrationProps {
    winner: {
        username: string;
        display_name?: string;
        avatar_url?: string | null;
    };
    prize: {
        amount: number;
        currency: string;
    };
    isCurrentUser?: boolean;
}

export function WinnerCelebration({ winner, prize, isCurrentUser }: WinnerCelebrationProps) {
    const formatPrize = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8 px-4"
        >
            <motion.div
                animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
            >
                <Trophy className="w-20 h-20 mx-auto mb-4 text-yellow-400" />
            </motion.div>

            <h2 className="text-3xl font-black mb-2">
                {isCurrentUser ? '🎉 YOU WON! 🎉' : 'Winner!'}
            </h2>

            <p className="text-2xl font-bold text-gradient-primary mb-4">
                {winner.display_name || winner.username}
            </p>

            <div className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500">
                <p className="text-3xl font-black text-white">
                    {formatPrize(prize.amount, prize.currency)}
                </p>
            </div>

            {isCurrentUser && (
                <p className="mt-4 text-white/60">
                    The prize has been added to your wallet!
                </p>
            )}
        </motion.div>
    );
}
