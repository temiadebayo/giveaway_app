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
    CheckCircle2,
    Rocket,
    Share2,
    Copy,
    Check,
    Link as LinkIcon
} from "lucide-react";
import logoWhite from "@/assets/logo_white.png";
import { LobbyJoinToast } from "@/components/giveaway/lobby-join-toast";

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
    const [isStarting, setIsStarting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [scheduledCountdown, setScheduledCountdown] = useState<number | null>(null);
    const [showQR, setShowQR] = useState(false);

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

        // During lobby, get lobby participants; during live/ended, get leaderboard
        if (giveawayData?.status === 'scheduled') {
            const lobbyData = await giveawayService.getLobbyParticipants(id);
            setParticipants(lobbyData);
        } else {
            const leaderboardData = await giveawayService.getCombinedLeaderboard(id);
            setParticipants(leaderboardData);
        }
        setLoading(false);
    }, [id, router]);

    useEffect(() => {
        loadData();

        // Subscribe to lobby participants (for scheduled/lobby phase)
        const lobbyChannel = giveawayService.subscribeToLobby(id, (newParticipants) => {
            setParticipants(newParticipants);
        });

        // Subscribe to leaderboard updates (for live phase)
        const leaderboardChannel = giveawayService.subscribeToLeaderboard(id, (newParticipants) => {
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
            lobbyChannel.unsubscribe();
            leaderboardChannel.unsubscribe();
            statusChannel.unsubscribe();
        };
    }, [id, loadData]);

    // Countdown timer for live giveaway end
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

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [giveaway?.ends_at, giveaway?.status]);

    // Countdown timer for scheduled auto-start
    useEffect(() => {
        if (!giveaway?.scheduled_start_at || giveaway.status !== 'scheduled') {
            setScheduledCountdown(null);
            return;
        }

        const updateTimer = () => {
            const now = new Date().getTime();
            const start = new Date(giveaway.scheduled_start_at!).getTime();
            const diff = Math.max(0, Math.floor((start - now) / 1000));
            setScheduledCountdown(diff);

            // Auto-start when countdown reaches 0
            if (diff <= 0) {
                handleStartEvent();
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [giveaway?.scheduled_start_at, giveaway?.status]);

    const handleStartEvent = async () => {
        if (!giveaway || isStarting) return;
        setIsStarting(true);
        const result = await giveawayService.startGiveaway(id);
        if (result.success) {
            await loadData();
        }
        setIsStarting(false);
    };

    const handleEndGiveaway = async () => {
        if (!giveaway || isEnding) return;
        setIsEnding(true);
        const result = await walletService.completeGiveaway(id);
        if (result.success) {
            await loadData();
        }
        setIsEnding(false);
    };

    const handleCopyLink = () => {
        const url = giveawayService.getShareUrl(id);
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const formatPrize = (amount: number, currency: string = 'NGN') => {
        return new Intl.NumberFormat('en-NG', {
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

    const formatScheduledCountdown = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
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

    const isLobby = giveaway.status === 'scheduled';
    const isLive = giveaway.status === 'live';
    const isEnded = giveaway.status === 'ended';

    return (
        <main className="min-h-screen bg-aurora overflow-x-hidden">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 px-3 sm:px-6 py-3 sm:py-4 glass">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <Link href="/giveaways" className="flex items-center gap-2 shrink-0">
                        <Image src={logoWhite} alt="Giveaway" width={28} height={28} className="sm:w-9 sm:h-9" />
                        <span className="font-bold text-lg hidden sm:inline">GIVEAWAY</span>
                    </Link>
                    <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap justify-end">
                        <span className="px-2 sm:px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs sm:text-sm font-bold flex items-center gap-1">
                            <Eye className="w-3 h-3 sm:w-4 sm:h-4" /> Host
                        </span>
                        {isLobby && (
                            <span className="px-2 sm:px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs sm:text-sm font-bold animate-pulse">
                                🔵 LOBBY
                            </span>
                        )}
                        {isLive && timeLeft !== null && (
                            <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-2 rounded-lg ${timeLeft < 30 ? 'bg-red-500/20' : 'bg-white/10'}`}>
                                <Timer className={`w-3 h-3 sm:w-4 sm:h-4 ${timeLeft < 30 ? 'text-red-400' : 'text-yellow-400'}`} />
                                <span className="font-mono font-bold text-sm sm:text-lg">{formatTime(timeLeft)}</span>
                            </div>
                        )}
                        {isLive && (
                            <span className="px-2 sm:px-3 py-1 rounded-full bg-red-500 text-xs sm:text-sm font-bold animate-pulse">
                                🔴 LIVE
                            </span>
                        )}
                        {isEnded && (
                            <span className="px-2 sm:px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs sm:text-sm font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" /> ENDED
                            </span>
                        )}
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6">
                {/* Back */}
                <Link
                    href="/giveaways"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-4 sm:mb-6 transition-colors text-sm"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Giveaways
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-4 sm:space-y-6 min-w-0 flex flex-col">
                        {/* Header Stats */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4"
                        >
                            <div className="card-premium p-3 sm:p-4 text-center">
                                <Trophy className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-yellow-400" />
                                <p className="text-lg sm:text-2xl font-black text-gradient-primary">
                                    {formatPrize(giveaway.prize_amount)}
                                </p>
                                <p className="text-[10px] sm:text-xs text-white/40">Prize</p>
                            </div>
                            <div className="card-premium p-3 sm:p-4 text-center">
                                <Users className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-blue-400" />
                                <p className="text-lg sm:text-2xl font-black">{participants.length}</p>
                                <p className="text-[10px] sm:text-xs text-white/40">{isLobby ? 'In Lobby' : 'Players'}</p>
                            </div>
                            <div className="card-premium p-3 sm:p-4 text-center">
                                <Clock className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-cyan-400" />
                                <p className="text-lg sm:text-2xl font-black">{giveaway.game_duration_seconds}s</p>
                                <p className="text-[10px] sm:text-xs text-white/40">Duration</p>
                            </div>
                            <div className="card-premium p-3 sm:p-4 text-center">
                                {isLobby ? (
                                    <>
                                        <Shield className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-purple-400" />
                                        <p className="text-lg sm:text-2xl font-black capitalize">{giveaway.min_trust_tier}</p>
                                        <p className="text-[10px] sm:text-xs text-white/40">Min Trust</p>
                                    </>
                                ) : (
                                    <>
                                        <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-purple-400" />
                                        <p className="text-lg sm:text-2xl font-black">{leader?.score?.toLocaleString() || 0}</p>
                                        <p className="text-[10px] sm:text-xs text-white/40">Top Score</p>
                                    </>
                                )}
                            </div>
                        </motion.div>

                        {/* LOBBY: START EVENT Section */}
                        {isLobby && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="card-premium p-5 sm:p-8 text-center bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-2 border-blue-500/20"
                            >
                                <Rocket className="w-10 h-10 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-blue-400" />
                                <h2 className="text-xl sm:text-2xl font-black mb-2">Event Lobby</h2>
                                <p className="text-white/60 text-sm sm:text-base mb-4 sm:mb-6">
                                    {participants.length === 0
                                        ? 'Share the event link and wait for players to join'
                                        : `${participants.length} player${participants.length !== 1 ? 's' : ''} waiting in the lobby`
                                    }
                                </p>

                                {scheduledCountdown !== null && scheduledCountdown > 0 && (
                                    <div className="mb-4 sm:mb-6">
                                        <p className="text-white/40 text-xs sm:text-sm mb-1">Auto-starts in</p>
                                        <p className="text-2xl sm:text-3xl font-mono font-black text-blue-400">
                                            {formatScheduledCountdown(scheduledCountdown)}
                                        </p>
                                    </div>
                                )}

                                {/* Mobile Share Quick Action */}
                                <div className="lg:hidden mb-6 mt-2 max-w-sm mx-auto">
                                    <div className="flex gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5 shadow-inner">
                                        <div className="flex-1 min-w-0 px-3 py-2 rounded-lg text-white/80 text-sm truncate bg-transparent flex items-center">
                                            {giveawayService.getShareUrl(id)}
                                        </div>
                                        <Button
                                            onClick={handleCopyLink}
                                            variant="outline"
                                            className="shrink-0 font-bold px-4"
                                        >
                                            {copied ? <Check className="w-4 h-4 text-green-400 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                                            {copied ? 'Copied' : 'Copy'}
                                        </Button>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleStartEvent}
                                    disabled={isStarting || participants.length === 0}
                                    className="w-full sm:w-auto bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-base sm:text-lg px-6 sm:px-12 py-4 sm:py-6 rounded-xl shadow-lg shadow-green-500/20"
                                >
                                    {isStarting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin mr-2 sm:mr-3" />
                                            Starting...
                                        </>
                                    ) : (
                                        <>
                                            <Rocket className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3" />
                                            🚀 START EVENT
                                        </>
                                    )}
                                </Button>

                                {participants.length === 0 && (
                                    <p className="text-white/30 text-xs sm:text-sm mt-3">
                                        Need at least 1 player to start
                                    </p>
                                )}
                            </motion.div>
                        )}

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

                        {/* Participant List */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="card-premium p-4 sm:p-6"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Users className="w-5 h-5 text-primary" />
                                    {isLobby ? 'Lobby Participants' : 'Live Participants'}
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
                                    <p className="text-sm text-white/20">Share the link to invite players</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[300px] sm:max-h-[400px] overflow-y-auto pr-1 sm:pr-2">
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
                                                {/* Rank / Number */}
                                                <div className={`
                                                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                                                    ${isLobby ? 'bg-blue-500/20 text-blue-400' :
                                                        index === 0 ? 'bg-yellow-500 text-black' :
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
                                                <div className="text-left flex-1 min-w-0">
                                                    <p className="font-medium flex items-center gap-2 truncate">
                                                        <span className="truncate">{participant.user?.display_name || participant.user?.username || 'Player'}</span>
                                                        {participant.is_winner && <Award className="w-4 h-4 text-yellow-400 shrink-0" />}
                                                    </p>
                                                    <p className="text-xs text-white/40">
                                                        {isLobby ? (
                                                            <span className="text-blue-400">● In lobby</span>
                                                        ) : participant.completed_at ? (
                                                            <span className="text-green-400">✓ Completed</span>
                                                        ) : (
                                                            <span className="text-blue-400">● Playing...</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Score (only during live/ended) */}
                                            {!isLobby && (
                                                <div className="text-right">
                                                    <p className="text-lg font-bold">{participant.score.toLocaleString()}</p>
                                                    <p className="text-xs text-white/40">{participant.taps || 0} taps</p>
                                                </div>
                                            )}
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

                    {/* Sidebar */}
                    <div className="space-y-4 sm:space-y-6 min-w-0">
                        {/* Giveaway Info */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="card-premium p-4 sm:p-6"
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
                                    <span className={`font-bold ${isLobby ? 'text-blue-400' :
                                        isLive ? 'text-green-400' :
                                            'text-white/60'
                                        }`}>
                                        {giveaway.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-white/60">Sharing</span>
                                    <span className={`font-bold ${giveaway.allow_sharing ? 'text-green-400' : 'text-red-400'}`}>
                                        {giveaway.allow_sharing ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                        </motion.div>

                        {/* Share Link */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 }}
                            className="card-premium p-4 sm:p-6"
                        >
                            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                                <LinkIcon className="w-4 h-4 text-primary" />
                                Event Link
                            </h3>
                            <div className="flex gap-2">
                                <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/5 text-white/60 text-sm truncate">
                                    {giveawayService.getShareUrl(id)}
                                </div>
                                <Button
                                    onClick={handleCopyLink}
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0"
                                >
                                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                </Button>
                            </div>
                        </motion.div>

                        {/* QR Code */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 }}
                            className="card-premium p-4"
                        >
                            <button
                                onClick={() => setShowQR(true)}
                                className="w-full bg-white p-4 rounded-xl flex flex-col items-center justify-center text-center hover:opacity-90 transition-opacity cursor-pointer"
                            >
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(giveawayService.getShareUrl(id))}&bgcolor=ffffff`}
                                    alt="Giveaway QR Code"
                                    className="w-28 h-28 mb-2"
                                />
                                <p className="text-black/60 text-xs font-medium">Tap to enlarge</p>
                            </button>
                        </motion.div>

                        {/* Stats */}
                        {!isLobby && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
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
                        )}
                    </div>
                </div>
            </div>

            {/* Fullscreen QR Modal */}
            <AnimatePresence>
                {showQR && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90"
                        onClick={() => setShowQR(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.7, opacity: 0 }}
                            className="flex flex-col items-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-white p-8 rounded-3xl shadow-2xl">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(giveawayService.getShareUrl(id))}&bgcolor=ffffff`}
                                    alt="Giveaway QR Code"
                                    className="w-72 h-72 sm:w-96 sm:h-96"
                                />
                            </div>
                            <p className="text-white text-lg font-bold mt-6">Scan to Join</p>
                            <p className="text-white/40 text-sm mt-1">Tap anywhere to close</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                        {isLobby ? 'In Lobby' : selectedPlayer.completed_at ? 'Completed' : 'Playing'}
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lobby Join Toast Notifications */}
            <LobbyJoinToast
                giveawayId={id}
                participants={participants.map(p => ({
                    user: { 
                        username: p.user?.username || 'Guest', 
                        display_name: p.user?.display_name || 'Guest' 
                    },
                    joined_at: p.joined_at
                }))}
            />
        </main>
    );
}
