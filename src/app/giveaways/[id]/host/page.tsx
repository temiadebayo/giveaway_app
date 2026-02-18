"use client";

import { useState, useEffect, use, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { giveawayService, Giveaway, Participant } from "@/lib/giveaway-service";
import { walletService } from "@/lib/wallet-service";
import { createClient } from "@/lib/supabase";
import {
    ArrowLeft,
    Users,
    Clock,
    Trophy,
    Loader2,
    Crown,
    Shield,
    Timer,
    Eye,
    RefreshCw,
    TrendingUp,
    User,
    X,
    Award,
    Zap,
    CheckCircle2
} from "lucide-react";
import logoWhite from "@/assets/logo_white.png";

interface HostPageProps {
    params: Promise<{ id: string }>;
}

export default function HostSpectatorPage({ params }: HostPageProps) {
    const { id } = use(params);
    const router = useRouter();
    const [giveaway, setGiveaway] = useState<Giveaway | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(true);
    const [isHost, setIsHost] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [selectedPlayer, setSelectedPlayer] = useState<Participant | null>(null);
    const [isEnding, setIsEnding] = useState(false);

    const loadData = useCallback(async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const giveawayData = await giveawayService.getGiveaway(id);
        setGiveaway(giveawayData);

        // Check if current user is host
        if (giveawayData?.host_id !== user?.id) {
            router.push(`/giveaways/${id}`);
            return;
        }
        setIsHost(true);

        const participantsData = await giveawayService.getLeaderboard(id);
        setParticipants(participantsData);
        setLoading(false);
    }, [id, router]);

    useEffect(() => {
        loadData();

        // Real-time updates
        const channel = giveawayService.subscribeToLeaderboard(id, (newParticipants) => {
            setParticipants(newParticipants);
        });

        // Subscribe to giveaway status updates
        const supabase = createClient();
        const statusChannel = supabase
            .channel(`host-giveaway:${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'giveaways',
                    filter: `id=eq.${id}`
                },
                (payload) => {
                    setGiveaway(prev => prev ? { ...prev, ...payload.new } : null);
                }
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
            statusChannel.unsubscribe();
        };
    }, [id, loadData]);

    // Countdown timer
    useEffect(() => {
        if (!giveaway?.ends_at || giveaway.status === 'ended') {
            setTimeLeft(null);
            return;
        }

        const updateTimer = () => {
            const now = new Date().getTime();
            const end = new Date(giveaway.ends_at!).getTime();
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setTimeLeft(diff);
        };

        updateTimer(); // Initial call
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [giveaway?.ends_at, giveaway?.status]);

    const handleEndGiveaway = async () => {
        if (!giveaway || isEnding) return;

        setIsEnding(true);
        const result = await walletService.completeGiveaway(id);

        if (result.success) {
            await loadData();
        }
        setIsEnding(false);
    };

    const formatPrize = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const completedCount = participants.filter(p => p.completed_at).length;
    const leader = participants[0];
    const winner = participants.find(p => p.is_winner);

    if (loading) {
        return (
            <main className="min-h-screen bg-aurora flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </main>
        );
    }

    if (!giveaway || !isHost) {
        return (
            <main className="min-h-screen bg-aurora flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                    <Link href="/giveaways">
                        <Button>Back to Giveaways</Button>
                    </Link>
                </div>
            </main>
        );
    }

    const isLive = giveaway.status === 'live';
    const isEnded = giveaway.status === 'ended';

    return (
        <main className="min-h-screen bg-aurora">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 px-6 py-4 glass">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/giveaways" className="flex items-center gap-3">
                        <Image src={logoWhite} alt="Giveaway" width={36} height={36} />
                        <span className="font-bold text-lg hidden sm:inline">GIVEAWAY</span>
                    </Link>
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-bold flex items-center gap-1">
                            <Eye className="w-4 h-4" /> Host View
                        </span>
                        {isLive && timeLeft !== null && (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${timeLeft < 30 ? 'bg-red-500/20' : 'bg-white/10'}`}>
                                <Timer className={`w-4 h-4 ${timeLeft < 30 ? 'text-red-400' : 'text-yellow-400'}`} />
                                <span className="font-mono font-bold text-lg">{formatTime(timeLeft)}</span>
                            </div>
                        )}
                        {isLive && (
                            <span className="px-3 py-1 rounded-full bg-red-500 text-sm font-bold animate-pulse">
                                🔴 LIVE
                            </span>
                        )}
                        {isEnded && (
                            <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> ENDED
                            </span>
                        )}
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto p-4 md:p-6">
                {/* Back */}
                <Link
                    href="/giveaways"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Giveaways
                </Link>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Main - Stats & Participants */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Header Stats */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="grid grid-cols-2 md:grid-cols-4 gap-4"
                        >
                            <div className="card-premium p-4 text-center">
                                <Trophy className="w-6 h-6 mx-auto mb-2 text-yellow-400" />
                                <p className="text-2xl font-black text-gradient-primary">
                                    {formatPrize(giveaway.prize_amount)}
                                </p>
                                <p className="text-xs text-white/40">Prize</p>
                            </div>
                            <div className="card-premium p-4 text-center">
                                <Users className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                                <p className="text-2xl font-black">{participants.length}</p>
                                <p className="text-xs text-white/40">Players</p>
                            </div>
                            <div className="card-premium p-4 text-center">
                                <Zap className="w-6 h-6 mx-auto mb-2 text-green-400" />
                                <p className="text-2xl font-black">{completedCount}</p>
                                <p className="text-xs text-white/40">Completed</p>
                            </div>
                            <div className="card-premium p-4 text-center">
                                <TrendingUp className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                                <p className="text-2xl font-black">{leader?.score?.toLocaleString() || 0}</p>
                                <p className="text-xs text-white/40">Top Score</p>
                            </div>
                        </motion.div>

                        {/* Winner Display */}
                        {isEnded && winner && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="card-premium p-6 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-500/30"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center">
                                        <Crown className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-yellow-400">WINNER</p>
                                        <p className="text-2xl font-black">
                                            {winner.user?.display_name || winner.user?.username}
                                        </p>
                                        <p className="text-white/60">
                                            {winner.score.toLocaleString()} points •
                                            Prize: {formatPrize(giveaway.prize_amount)}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Live Participant List */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="card-premium p-6"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Users className="w-5 h-5 text-primary" />
                                    Live Participants
                                </h3>
                                <button
                                    onClick={loadData}
                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4 text-white/60" />
                                </button>
                            </div>

                            {participants.length === 0 ? (
                                <div className="text-center py-12">
                                    <Users className="w-12 h-12 mx-auto mb-3 text-white/20" />
                                    <p className="text-white/40">No participants yet</p>
                                    <p className="text-sm text-white/20">Waiting for players to join...</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                    {participants.map((participant, index) => (
                                        <motion.button
                                            key={participant.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            onClick={() => setSelectedPlayer(participant)}
                                            className={`
                                                w-full p-3 rounded-xl flex items-center justify-between
                                                transition-all hover:bg-white/10
                                                ${participant.is_winner ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-white/5'}
                                            `}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Rank */}
                                                <div className={`
                                                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                                                    ${index === 0 ? 'bg-yellow-500 text-black' :
                                                        index === 1 ? 'bg-gray-300 text-black' :
                                                            index === 2 ? 'bg-orange-600 text-white' :
                                                                'bg-white/10 text-white/60'}
                                                `}>
                                                    {index + 1}
                                                </div>

                                                {/* Avatar */}
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
                                                    {participant.user?.avatar_url ? (
                                                        <Image
                                                            src={participant.user.avatar_url}
                                                            alt=""
                                                            width={40}
                                                            height={40}
                                                            className="rounded-full"
                                                        />
                                                    ) : (
                                                        <User className="w-5 h-5 text-white" />
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div className="text-left">
                                                    <p className="font-medium flex items-center gap-2">
                                                        {participant.user?.display_name || participant.user?.username || 'Player'}
                                                        {participant.is_winner && <Award className="w-4 h-4 text-yellow-400" />}
                                                    </p>
                                                    <p className="text-xs text-white/40">
                                                        {participant.completed_at ? (
                                                            <span className="text-green-400">✓ Completed</span>
                                                        ) : (
                                                            <span className="text-blue-400">● Playing...</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Score */}
                                            <div className="text-right">
                                                <p className="text-lg font-bold">{participant.score.toLocaleString()}</p>
                                                <p className="text-xs text-white/40">{participant.taps || 0} taps</p>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            )}
                        </motion.div>

                        {/* Actions */}
                        {isLive && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex justify-center"
                            >
                                <Button
                                    onClick={handleEndGiveaway}
                                    disabled={isEnding || participants.length === 0}
                                    variant="outline"
                                    className="text-red-400 border-red-400/50 hover:bg-red-500/10"
                                >
                                    {isEnding ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                    )}
                                    End Giveaway Now
                                </Button>
                            </motion.div>
                        )}
                    </div>

                    {/* Sidebar - Giveaway Info */}
                    <div className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="card-premium p-6"
                        >
                            <h3 className="text-lg font-bold mb-4">{giveaway.title}</h3>
                            {giveaway.description && (
                                <p className="text-white/60 text-sm mb-4">{giveaway.description}</p>
                            )}
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/60">Prize</span>
                                    <span className="font-bold">{formatPrize(giveaway.prize_amount)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/60">Game Duration</span>
                                    <span className="font-bold">{giveaway.game_duration_seconds}s</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/60">Min Trust</span>
                                    <span className="font-bold capitalize">{giveaway.min_trust_tier}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/60">Status</span>
                                    <span className={`font-bold ${isLive ? 'text-green-400' : 'text-white/60'}`}>
                                        {giveaway.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Quick Stats */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            className="card-premium p-4"
                        >
                            <div className="text-center">
                                <p className="text-white/40 text-sm">Completion Rate</p>
                                <p className="text-3xl font-black text-gradient-primary">
                                    {participants.length > 0
                                        ? Math.round((completedCount / participants.length) * 100)
                                        : 0}%
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Player Profile Modal */}
            <AnimatePresence>
                {selectedPlayer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
                        onClick={() => setSelectedPlayer(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md card-premium p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-bold">Player Profile</h3>
                                <button
                                    onClick={() => setSelectedPlayer(null)}
                                    className="p-1 rounded-lg hover:bg-white/10"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="text-center mb-6">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center mx-auto mb-3">
                                    {selectedPlayer.user?.avatar_url ? (
                                        <Image
                                            src={selectedPlayer.user.avatar_url}
                                            alt=""
                                            width={80}
                                            height={80}
                                            className="rounded-full"
                                        />
                                    ) : (
                                        <User className="w-10 h-10 text-white" />
                                    )}
                                </div>
                                <p className="text-xl font-bold">
                                    {selectedPlayer.user?.display_name || selectedPlayer.user?.username}
                                </p>
                                <p className="text-white/40 text-sm">@{selectedPlayer.user?.username}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="p-4 rounded-xl bg-white/5 text-center">
                                    <p className="text-2xl font-black text-primary">
                                        {selectedPlayer.score.toLocaleString()}
                                    </p>
                                    <p className="text-xs text-white/40">Score</p>
                                </div>
                                <div className="p-4 rounded-xl bg-white/5 text-center">
                                    <p className="text-2xl font-black">
                                        #{selectedPlayer.rank || participants.indexOf(selectedPlayer) + 1}
                                    </p>
                                    <p className="text-xs text-white/40">Rank</p>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-white/60">Taps</span>
                                    <span>{selectedPlayer.taps || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/60">Best Streak</span>
                                    <span>{selectedPlayer.best_streak || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-white/60">Status</span>
                                    <span className={selectedPlayer.completed_at ? 'text-green-400' : 'text-blue-400'}>
                                        {selectedPlayer.completed_at ? 'Completed' : 'Playing'}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
