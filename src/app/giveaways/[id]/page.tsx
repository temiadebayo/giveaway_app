"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { generateRandomUsername } from "@/lib/username-generator";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { giveawayService, Giveaway, Participant, GuestParticipant } from "@/lib/giveaway-service";
import { walletService } from "@/lib/wallet-service";
import { TapGame } from "@/components/giveaway/tap-game";
import { Leaderboard } from "@/components/giveaway/giveaway-components";
import { createClient } from "@/lib/supabase";
import { TapGameState } from "@/lib/tap-game-engine";
import { TIER_BENEFITS, TrustTier } from "@/lib/trust-engine";
import { useFingerprint } from "@/hooks/use-fingerprint";
import { AppHeader } from "@/components/app-header";
import { Breadcrumbs } from "@/components/breadcrumbs";
import confetti from 'canvas-confetti';
import {
    ArrowLeft,
    Users,
    Clock,
    Trophy,
    Loader2,
    Play,
    Crown,
    Shield,
    Wallet,
    ChevronRight,
    Sparkles,
    Timer,
    Eye,
    Share2,
    Copy,
    Check,
    LogIn,
    User
} from "lucide-react";
import logoWhite from "@/assets/logo_white.png";

type GamePhase = 'loading' | 'lobby' | 'countdown' | 'playing' | 'submitted' | 'waiting' | 'ended';

interface GiveawayPageProps {
    params: Promise<{ id: string }>;
}

export default function GiveawayDetailPage({ params }: GiveawayPageProps) {
    const { id } = use(params);
    const router = useRouter();
    const { fingerprint } = useFingerprint();
    const fingerprintId = fingerprint?.hash;

    const [giveaway, setGiveaway] = useState<Giveaway | null>(null);
    const [participation, setParticipation] = useState<Participant | null>(null);
    const [guestParticipation, setGuestParticipation] = useState<GuestParticipant | null>(null);
    const [leaderboard, setLeaderboard] = useState<Participant[]>([]);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [isGuest, setIsGuest] = useState(false);

    // Prevent double submission
    const submittingRef = useRef(false);

    // Guest name input
    const [guestName, setGuestName] = useState("");
    const [showNameInput, setShowNameInput] = useState(false);

    // Initialize random guest name
    useEffect(() => {
        setGuestName(generateRandomUsername());
    }, []);

    // Share functionality
    const [showShare, setShowShare] = useState(false);
    const [copied, setCopied] = useState(false);

    // Game phase management
    const [phase, setPhase] = useState<GamePhase>('loading');
    const [countdown, setCountdown] = useState(3);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [finalScore, setFinalScore] = useState<number | null>(null);

    // Auto-join for scheduled giveaways
    const [isReady, setIsReady] = useState(false);
    const [startCountdown, setStartCountdown] = useState<number | null>(null);

    // Load giveaway data
    const loadData = useCallback(async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
        setIsGuest(!user);

        const giveawayData = await giveawayService.getGiveaway(id);
        setGiveaway(giveawayData);
        setIsHost(giveawayData?.host_id === user?.id);

        if (giveawayData) {
            if (user) {
                // Authenticated user - check regular participation
                const participationData = await giveawayService.getParticipation(id);
                setParticipation(participationData);

                if (giveawayData.status === 'ended') {
                    setPhase('ended');
                } else if (participationData?.completed_at) {
                    setPhase('waiting');
                } else if (participationData) {
                    setPhase('lobby');
                } else {
                    setPhase('lobby');
                }
            } else if (fingerprintId) {
                // Guest - check guest participation
                const guestData = await giveawayService.getGuestParticipation(id, fingerprintId);
                setGuestParticipation(guestData);

                if (giveawayData.status === 'ended') {
                    setPhase('ended');
                } else if (guestData?.completed_at) {
                    setPhase('waiting');
                } else if (guestData) {
                    setPhase('lobby');
                } else {
                    setPhase('lobby');
                }
            } else {
                setPhase('lobby');
            }
        }

        const leaderboardData = await giveawayService.getCombinedLeaderboard(id);
        setLeaderboard(leaderboardData);
        setLoading(false);
    }, [id, fingerprintId]);

    useEffect(() => {
        loadData();

        const channel = giveawayService.subscribeToLeaderboard(id, (participants) => {
            setLeaderboard(participants);
        });

        const supabase = createClient();
        const statusChannel = supabase
            .channel(`giveaway:${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'giveaways',
                    filter: `id=eq.${id}`
                },
                async (payload) => {
                    const updated = payload.new as Giveaway;
                    const prevStatus = giveaway?.status;
                    setGiveaway(prev => prev ? { ...prev, ...updated } : null);

                    // Auto-join when giveaway goes live (if user is ready)
                    if (prevStatus === 'scheduled' && updated.status === 'live' && isReady) {
                        // Auto-join for ready users
                        if (isGuest && fingerprintId) {
                            await giveawayService.joinAsGuest(id, fingerprintId, guestName || generateRandomUsername());
                            const guestData = await giveawayService.getGuestParticipation(id, fingerprintId);
                            setGuestParticipation(guestData);
                        } else if (currentUserId) {
                            await giveawayService.joinGiveaway(id);
                            const participationData = await giveawayService.getParticipation(id);
                            setParticipation(participationData);
                        }
                        // Auto-start game after brief delay
                        setPhase('countdown');
                        setCountdown(3);
                    }

                    if (updated.status === 'ended') {
                        setPhase('ended');
                        loadData();
                    }
                }
            )
            .subscribe();

        return () => {
            channel.unsubscribe();
            statusChannel.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, loadData, isReady, isGuest, fingerprintId, currentUserId, guestName]);

    // Countdown timer for giveaway end
    useEffect(() => {
        if (!giveaway?.ends_at || phase === 'ended') {
            setTimeLeft(null);
            return;
        }

        const updateTimer = () => {
            const now = new Date().getTime();
            const end = new Date(giveaway.ends_at!).getTime();
            const diff = Math.max(0, Math.floor((end - now) / 1000));
            setTimeLeft(diff);

            if (diff <= 0 && giveaway.status !== 'ended') {
                checkCompletion();
            }
        };

        updateTimer(); // Initial call
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [giveaway?.ends_at, phase]);

    // Countdown timer for scheduled giveaway start
    useEffect(() => {
        if (!giveaway?.starts_at || giveaway.status !== 'scheduled') {
            setStartCountdown(null);
            return;
        }

        const updateStartTimer = () => {
            const now = new Date().getTime();
            const start = new Date(giveaway.starts_at!).getTime();
            const diff = Math.max(0, Math.floor((start - now) / 1000));
            setStartCountdown(diff);
        };

        updateStartTimer(); // Initial call
        const interval = setInterval(updateStartTimer, 1000);
        return () => clearInterval(interval);
    }, [giveaway?.starts_at, giveaway?.status]);

    // AUTO-JOIN: Guests automatically join live giveaways on page load
    useEffect(() => {
        if (!giveaway || !fingerprintId || !isGuest) return;
        if (giveaway.status !== 'live') return;
        if (guestParticipation) return; // Already joined
        if (joining) return; // Already joining

        const autoJoin = async () => {
            setJoining(true);
            const nameToUse = guestName || generateRandomUsername();
            if (!guestName) setGuestName(nameToUse);

            const result = await giveawayService.joinAsGuest(id, fingerprintId, nameToUse);
            if (result.success) {
                const guestData = await giveawayService.getGuestParticipation(id, fingerprintId);
                setGuestParticipation(guestData);
            }
            setJoining(false);
        };
        autoJoin();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [giveaway?.status, fingerprintId, isGuest, guestParticipation, guestName]);

    const checkCompletion = async () => {
        if (!giveaway || giveaway.status === 'ended') return;
        const result = await walletService.completeGiveaway(id);
        if (result.success) {
            setPhase('ended');
            await loadData();
        }
    };

    // Join as authenticated user
    const handleJoin = async () => {
        setJoining(true);
        const result = await giveawayService.joinGiveaway(id);
        if (result.success) {
            const participationData = await giveawayService.getParticipation(id);
            setParticipation(participationData);
        }
        setJoining(false);
    };

    // Join as guest
    const handleGuestJoin = async () => {
        if (!fingerprintId) return;

        setJoining(true);
        const nameToUse = guestName || generateRandomUsername();
        const result = await giveawayService.joinAsGuest(id, fingerprintId, nameToUse);
        if (result.success) {
            const guestData = await giveawayService.getGuestParticipation(id, fingerprintId);
            setGuestParticipation(guestData);
            setShowNameInput(false);
        }
        setJoining(false);
    };

    const handleStartGame = () => {
        setPhase('countdown');
        setCountdown(3);

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setPhase('playing');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleGameEnd = useCallback(async (state: TapGameState) => {
        if (submittingRef.current) return;
        submittingRef.current = true;

        setPhase('submitted');
        setFinalScore(state.score);

        try {
            if (isGuest && fingerprintId) {
                // Submit as guest
                await giveawayService.submitGuestScore(id, fingerprintId, state.score, state.taps, state.bestStreak);
                const guestData = await giveawayService.getGuestParticipation(id, fingerprintId);
                setGuestParticipation(guestData);
            } else {
                // Submit as authenticated user
                await giveawayService.submitScore(id, state.score, state.taps, state.bestStreak);
                const participationData = await giveawayService.getParticipation(id);
                setParticipation(participationData);
            }

            const leaderboardData = await giveawayService.getLeaderboard(id);
            setLeaderboard(leaderboardData);
        } catch (error) {
            console.error("Error in game submission:", error);
        }

        setTimeout(() => setPhase('waiting'), 2000);
    }, [id, fingerprintId, isGuest]);

    // Share functionality
    const handleShare = async () => {
        const url = giveawayService.getShareUrl(id);

        if (navigator.share) {
            try {
                await navigator.share({
                    title: giveaway?.title || 'Join this Giveaway!',
                    text: `Win ${formatPrize(giveaway?.prize_amount || 0, giveaway?.prize_currency || 'USD')}! 🎉`,
                    url
                });
            } catch {
                setShowShare(true);
            }
        } else {
            setShowShare(true);
        }
    };

    const handleCopyLink = async () => {
        const url = giveawayService.getShareUrl(id);
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
        return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    };

    const formatStartCountdown = (seconds: number) => {
        if (seconds >= 3600) {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${mins}m`;
        }
        if (seconds >= 60) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}m ${secs}s`;
        }
        return `${seconds}s`;
    };

    const isScheduled = giveaway?.status === 'scheduled';

    // Check participation state
    const hasJoined = participation || guestParticipation;
    const hasCompleted = participation?.completed_at || guestParticipation?.completed_at;
    const currentScore = participation?.score || guestParticipation?.score || 0;

    // Winner check
    const winner = leaderboard.find(p => p.is_winner);
    const isWinner = giveaway?.winner_id === currentUserId;
    const myRank = leaderboard.findIndex(p =>
        (currentUserId && p.user_id === currentUserId) ||
        (fingerprintId && p.fingerprint_id === fingerprintId)
    ) + 1;

    // Confetti for winners
    useEffect(() => {
        if (phase === 'ended' && isWinner) {
            const duration = 3000;
            const end = Date.now() + duration;
            const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6bd6'];

            (function frame() {
                confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors });
                confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors });
                if (Date.now() < end) requestAnimationFrame(frame);
            })();
        }
    }, [phase, isWinner]);

    if (loading) {
        return (
            <main className="min-h-screen bg-aurora flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </main>
        );
    }

    if (!giveaway) {
        return (
            <main className="min-h-screen bg-aurora flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-bold mb-2">Giveaway Not Found</h2>
                    <Link href="/giveaways">
                        <Button>Back to Giveaways</Button>
                    </Link>
                </div>
            </main>
        );
    }

    const isLive = giveaway.status === 'live';
    const isEnded = giveaway.status === 'ended';
    const tierBenefits = TIER_BENEFITS[giveaway.min_trust_tier as TrustTier];

    return (
        <main className="min-h-screen bg-aurora">
            {/* App Header */}
            <AppHeader
                rightContent={
                    <div className="flex items-center gap-2">
                        {/* Share Button */}
                        <button
                            onClick={handleShare}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                        >
                            <Share2 className="w-5 h-5" />
                        </button>

                        {isLive && timeLeft !== null && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10">
                                <Timer className="w-4 h-4 text-yellow-400" />
                                <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                            </div>
                        )}
                        {isLive && (
                            <span className="px-3 py-1 rounded-full bg-red-500 text-sm font-bold animate-pulse">
                                🔴 LIVE
                            </span>
                        )}
                        {isEnded && (
                            <span className="px-3 py-1 rounded-full bg-white/20 text-sm font-bold">
                                ENDED
                            </span>
                        )}

                        {/* Guest indicator */}
                        {isGuest && (
                            <Link href="/auth">
                                <Button variant="outline" size="sm" className="gap-2">
                                    <LogIn className="w-4 h-4" />
                                    Sign In
                                </Button>
                            </Link>
                        )}
                    </div>
                }
            />

            <div className="max-w-4xl mx-auto p-4 sm:p-6">
                {/* Breadcrumbs */}
                <Breadcrumbs items={[
                    { label: 'Giveaways', href: '/giveaways' },
                    { label: giveaway.title || 'Event' }
                ]} />
                {/* Back Link */}
                <Link
                    href="/giveaways"
                    className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Giveaways
                </Link>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Header */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="card-premium p-6"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <p className="text-4xl font-black text-gradient-primary mb-2">
                                        {formatPrize(giveaway.prize_amount, giveaway.prize_currency)}
                                    </p>
                                    <h1 className="text-2xl font-bold">{giveaway.title}</h1>
                                </div>
                                {isHost && (
                                    <Link href={`/giveaways/${id}/host`}>
                                        <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-bold flex items-center gap-1 hover:bg-yellow-500/30 transition-colors cursor-pointer">
                                            <Eye className="w-4 h-4" /> Host View
                                        </span>
                                    </Link>
                                )}
                            </div>

                            {giveaway.description && (
                                <p className="text-white/60 mb-4">{giveaway.description}</p>
                            )}

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 rounded-xl bg-white/5 text-center">
                                    <Users className="w-5 h-5 mx-auto mb-1 text-white/40" />
                                    <p className="text-xl font-bold">{leaderboard.length}</p>
                                    <p className="text-xs text-white/40">Players</p>
                                </div>
                                <div className="p-3 rounded-xl bg-white/5 text-center">
                                    <Clock className="w-5 h-5 mx-auto mb-1 text-white/40" />
                                    <p className="text-xl font-bold">{giveaway.game_duration_seconds}s</p>
                                    <p className="text-xs text-white/40">Game Time</p>
                                </div>
                                <div className="p-3 rounded-xl bg-white/5 text-center">
                                    <Shield className="w-5 h-5 mx-auto mb-1 text-white/40" />
                                    <p className="text-xl font-bold">{tierBenefits.emoji}</p>
                                    <p className="text-xs text-white/40">Min {giveaway.min_trust_tier}</p>
                                </div>
                            </div>
                        </motion.div>

                        {/* Guest Notice */}
                        {isGuest && phase !== 'ended' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30"
                            >
                                <div className="flex items-start gap-3">
                                    <User className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-blue-400">Playing as Guest</p>
                                        <p className="text-sm text-white/60">
                                            You can play, but you'll need to sign up to claim any winnings!
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Game Area - Phase-based rendering */}
                        <AnimatePresence mode="wait">
                            {/* ENDED */}
                            {phase === 'ended' && (
                                <motion.div
                                    key="ended"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    className="card-premium p-8 text-center"
                                >
                                    {isWinner ? (
                                        <>
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: "spring", delay: 0.2 }}
                                                className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center glow-primary"
                                            >
                                                <Trophy className="w-12 h-12 text-white" />
                                            </motion.div>
                                            <h2 className="text-3xl font-black mb-2">YOU WON! 🎉</h2>
                                            <p className="text-5xl font-black text-gradient-primary mb-4">
                                                {formatPrize(giveaway.prize_amount, giveaway.prize_currency)}
                                            </p>
                                            <p className="text-white/60 mb-6">
                                                Prize has been added to your wallet!
                                            </p>
                                            <Link href="/wallet">
                                                <Button className="bg-brand-gradient">
                                                    <Wallet className="w-4 h-4 mr-2" />
                                                    View Wallet
                                                    <ChevronRight className="w-4 h-4 ml-2" />
                                                </Button>
                                            </Link>
                                        </>
                                    ) : winner ? (
                                        <>
                                            <Crown className="w-16 h-16 mx-auto mb-4 text-yellow-400" />
                                            <h2 className="text-2xl font-bold mb-2">Giveaway Ended!</h2>
                                            <p className="text-white/60 mb-2">Winner:</p>
                                            <p className="text-3xl font-black text-gradient-primary mb-2">
                                                {winner.user?.display_name || winner.user?.username || 'Unknown'}
                                            </p>
                                            <p className="text-white/40 mb-4">
                                                with {winner.score.toLocaleString()} score
                                            </p>
                                            {myRank > 0 && (
                                                <p className="text-sm text-white/60">
                                                    You placed #{myRank} with {currentScore} score
                                                </p>
                                            )}

                                            {/* Guest CTA */}
                                            {isGuest && guestParticipation && (
                                                <div className="mt-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                                                    <p className="text-yellow-400 font-medium mb-2">Create an account to track your stats!</p>
                                                    <Link href="/auth">
                                                        <Button className="bg-yellow-500 hover:bg-yellow-600 text-black">
                                                            <LogIn className="w-4 h-4 mr-2" />
                                                            Sign Up Now
                                                        </Button>
                                                    </Link>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Trophy className="w-16 h-16 mx-auto mb-4 text-white/20" />
                                            <h2 className="text-2xl font-bold mb-2">Giveaway Ended</h2>
                                            <p className="text-white/60">No winner</p>
                                        </>
                                    )}
                                </motion.div>
                            )}

                            {/* SCHEDULED LOBBY - Waiting for giveaway to start */}
                            {phase === 'lobby' && isScheduled && (
                                <motion.div
                                    key="lobby-scheduled"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="card-premium p-8 text-center"
                                >
                                    {/* Animated waiting indicator */}
                                    <div className="relative w-24 h-24 mx-auto mb-6">
                                        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 animate-pulse" />
                                        <div className="absolute inset-2 rounded-full bg-gray-900 flex items-center justify-center">
                                            <Clock className="w-10 h-10 text-blue-400" />
                                        </div>
                                    </div>

                                    <h3 className="text-2xl font-bold mb-2">Giveaway Starting Soon!</h3>

                                    {/* Countdown display */}
                                    {startCountdown !== null && (
                                        <div className="mb-6">
                                            <p className="text-white/60 mb-2">Starts in</p>
                                            <div className="text-4xl font-black text-gradient-primary">
                                                {formatStartCountdown(startCountdown)}
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-white/60 mb-6">
                                        Get ready to tap as fast as you can for {formatPrize(giveaway.prize_amount, giveaway.prize_currency)}!
                                    </p>

                                    {/* Get Ready / Already Ready state */}
                                    {isReady ? (
                                        <div className="space-y-4">
                                            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-500/20 border border-green-500/50">
                                                <Sparkles className="w-5 h-5 text-green-400 animate-pulse" />
                                                <span className="font-bold text-green-400">You're Ready!</span>
                                            </div>
                                            <p className="text-sm text-white/40">
                                                You'll automatically join when the giveaway starts
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {isGuest ? (
                                                <div className="space-y-3">
                                                    <Input
                                                        value={guestName}
                                                        onChange={(e) => setGuestName(e.target.value)}
                                                        placeholder="Your nickname (optional)"
                                                        className="max-w-xs mx-auto text-center"
                                                    />
                                                    <Button
                                                        size="lg"
                                                        className="bg-brand-gradient px-8"
                                                        onClick={() => setIsReady(true)}
                                                    >
                                                        <Sparkles className="w-5 h-5 mr-2" />
                                                        Get Ready!
                                                    </Button>
                                                    <p className="text-sm text-white/40">
                                                        or{' '}
                                                        <Link href="/auth" className="text-primary underline">
                                                            sign in
                                                        </Link>
                                                        {' '}to claim prizes
                                                    </p>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="lg"
                                                    className="bg-brand-gradient px-8"
                                                    onClick={() => setIsReady(true)}
                                                >
                                                    <Sparkles className="w-5 h-5 mr-2" />
                                                    Get Ready!
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* LOBBY - Not joined yet (LIVE giveaway) - HOST VIEW */}
                            {phase === 'lobby' && !hasJoined && isLive && isHost && (
                                <motion.div
                                    key="host-cta"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="card-premium p-6"
                                >
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                        <Crown className="w-5 h-5 text-yellow-400" />
                                        Host Controls
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="bg-white/5 p-4 rounded-xl">
                                                <p className="text-sm text-white/40 mb-2">Share Link</p>
                                                <div className="flex gap-2">
                                                    <Input
                                                        value={giveawayService.getShareUrl(id)}
                                                        readOnly
                                                        className="bg-black/20 border-white/10"
                                                    />
                                                    <Button onClick={handleCopyLink} size="icon" variant="outline">
                                                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            <Button className="w-full bg-brand-gradient gap-2" size="lg" onClick={handleShare}>
                                                <Share2 className="w-4 h-4" />
                                                Share to Socials
                                            </Button>

                                            <Button variant="outline" className="w-full gap-2" onClick={() => {
                                                navigator.clipboard.writeText(`Join my giveaway: ${giveaway.title}! 🎁\n${giveawayService.getShareUrl(id)}`);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            }}>
                                                <Users className="w-4 h-4" />
                                                Invite Circle
                                            </Button>
                                        </div>

                                        <div className="bg-white p-4 rounded-xl flex flex-col items-center justify-center text-center">
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(giveawayService.getShareUrl(id))}&bgcolor=ffffff`}
                                                alt="Giveaway QR Code"
                                                className="w-32 h-32 mb-2"
                                            />
                                            <p className="text-black/60 text-xs font-medium">Scan to Join</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* LOBBY - Not joined yet (LIVE giveaway) - GUEST/USER VIEW */}
                            {phase === 'lobby' && !hasJoined && isLive && !isHost && (
                                <motion.div
                                    key="lobby-join"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="card-premium p-8 text-center"
                                >
                                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
                                    <h3 className="text-2xl font-bold mb-2">Join the Action!</h3>
                                    <p className="text-white/60 mb-6">
                                        Compete for {formatPrize(giveaway.prize_amount, giveaway.prize_currency)} in this skill-based challenge.
                                    </p>

                                    {!currentUserId ? (
                                        isGuest ? (
                                            showNameInput ? (
                                                <div className="max-w-xs mx-auto space-y-4">
                                                    <Input
                                                        value={guestName}
                                                        onChange={(e) => setGuestName(e.target.value)}
                                                        placeholder="Your nickname (optional)"
                                                        className="text-center"
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => setShowNameInput(false)}
                                                            className="flex-1"
                                                        >
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            onClick={handleGuestJoin}
                                                            disabled={joining}
                                                            className="flex-1 bg-brand-gradient"
                                                        >
                                                            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join!'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <Button
                                                        size="lg"
                                                        className="bg-brand-gradient px-8"
                                                        onClick={() => setShowNameInput(true)}
                                                    >
                                                        <Play className="w-5 h-5 mr-2" />
                                                        Join as Guest
                                                    </Button>
                                                    <p className="text-sm text-white/40">
                                                        or{' '}
                                                        <Link href="/auth" className="text-primary underline">
                                                            sign in
                                                        </Link>
                                                        {' '}to claim prizes
                                                    </p>
                                                </div>
                                            )
                                        ) : (
                                            <div className="space-y-3">
                                                <Button
                                                    size="lg"
                                                    className="bg-brand-gradient px-8"
                                                    onClick={() => setShowNameInput(true)}
                                                >
                                                    <Play className="w-5 h-5 mr-2" />
                                                    Join as Guest
                                                </Button>
                                                <p className="text-sm text-white/40">
                                                    or{' '}
                                                    <Link href="/auth" className="text-primary underline">
                                                        sign in
                                                    </Link>
                                                    {' '}to claim prizes
                                                </p>
                                            </div>
                                        )
                                    ) : (
                                        <Button
                                            size="lg"
                                            className="bg-brand-gradient px-8"
                                            onClick={handleJoin}
                                            disabled={joining}
                                        >
                                            {joining ? (
                                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                            ) : (
                                                <Play className="w-5 h-5 mr-2" />
                                            )}
                                            Join Giveaway
                                        </Button>
                                    )}
                                </motion.div>
                            )}

                            {/* LOBBY - Joined, ready to play */}
                            {phase === 'lobby' && hasJoined && !hasCompleted && isLive && (
                                <motion.div
                                    key="lobby-play"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="card-premium p-8 text-center"
                                >
                                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center">
                                        <Sparkles className="w-10 h-10 text-white" />
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2">You're In! 🎮</h3>
                                    <p className="text-white/60 mb-6">
                                        {giveaway.game_duration_seconds} seconds to tap as fast as you can!
                                    </p>
                                    <Button
                                        size="lg"
                                        className="bg-brand-gradient px-8"
                                        onClick={handleStartGame}
                                    >
                                        <Play className="w-5 h-5 mr-2" />
                                        Start Game
                                    </Button>
                                </motion.div>
                            )}

                            {/* COUNTDOWN */}
                            {phase === 'countdown' && (
                                <motion.div
                                    key="countdown"
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 1.5 }}
                                    className="card-premium p-8 text-center"
                                >
                                    <motion.p
                                        key={countdown}
                                        initial={{ scale: 0.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 1.5, opacity: 0 }}
                                        className="text-9xl font-black text-gradient-primary"
                                    >
                                        {countdown}
                                    </motion.p>
                                    <p className="text-white/60 mt-4">Get ready to tap!</p>
                                </motion.div>
                            )}

                            {/* PLAYING */}
                            {phase === 'playing' && (
                                <motion.div
                                    key="playing"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="card-premium p-6"
                                >
                                    <TapGame
                                        duration={giveaway.game_duration_seconds}
                                        onGameEnd={handleGameEnd}
                                    />
                                </motion.div>
                            )}

                            {/* SUBMITTED */}
                            {phase === 'submitted' && (
                                <motion.div
                                    key="submitted"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="card-premium p-8 text-center"
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring" }}
                                        className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500 flex items-center justify-center"
                                    >
                                        <Trophy className="w-10 h-10 text-white" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold mb-2">Score Submitted!</h3>
                                    <p className="text-5xl font-black text-gradient-primary mb-4">
                                        {finalScore?.toLocaleString() || 0}
                                    </p>
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-white/40" />
                                </motion.div>
                            )}

                            {/* WAITING */}
                            {phase === 'waiting' && (
                                <motion.div
                                    key="waiting"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="card-premium p-8 text-center"
                                >
                                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                                        <Eye className="w-10 h-10 text-white" />
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2">You're Done!</h3>
                                    <p className="text-4xl font-black text-primary mb-2">
                                        {currentScore.toLocaleString()} score
                                    </p>
                                    <p className="text-white/60 mb-4">
                                        Current rank: #{myRank || '-'}
                                    </p>
                                    {timeLeft !== null && timeLeft > 0 && (
                                        <p className="text-sm text-white/40">
                                            Waiting for giveaway to end... ({formatTime(timeLeft)} remaining)
                                        </p>
                                    )}

                                    {/* Guest signup reminder */}
                                    {isGuest && (
                                        <div className="mt-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                                            <p className="text-yellow-400 font-medium mb-2">
                                                Sign up to claim your prize if you win! 🏆
                                            </p>
                                            <Link href="/auth">
                                                <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-black">
                                                    <LogIn className="w-4 h-4 mr-2" />
                                                    Create Account
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Host Info */}
                        {giveaway.host && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="card-premium p-4"
                            >
                                <div className="flex items-center gap-3">
                                    <Crown className="w-5 h-5 text-yellow-400" />
                                    <span className="text-white/60">Hosted by</span>
                                    <span className="font-bold">
                                        {giveaway.host.display_name || giveaway.host.username}
                                    </span>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Sidebar - Leaderboard */}
                    <div className="space-y-6">
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <Leaderboard
                                participants={leaderboard}
                                currentUserId={currentUserId || undefined}
                                maxDisplay={15}
                            />
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Share Modal */}
            <AnimatePresence>
                {showShare && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
                        onClick={() => setShowShare(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-md card-premium p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <Share2 className="w-5 h-5 text-primary" />
                                Share Giveaway
                            </h3>

                            <p className="text-white/60 text-sm mb-4">
                                Share this link with friends to invite them!
                            </p>

                            <div className="flex gap-2">
                                <Input
                                    value={giveawayService.getShareUrl(id)}
                                    readOnly
                                    className="flex-1"
                                />
                                <Button onClick={handleCopyLink} className="px-4">
                                    {copied ? (
                                        <Check className="w-4 h-4 text-green-400" />
                                    ) : (
                                        <Copy className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>

                            {copied && (
                                <p className="text-green-400 text-sm mt-2">Link copied!</p>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
