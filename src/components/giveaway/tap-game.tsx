"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createTapGame, TapGameState } from "@/lib/tap-game-engine";
import { fps } from "@/lib/fps";
import { Trophy, Zap, Timer, Target, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

interface TapGameProps {
    duration?: number;
    /**
     * `tapOffsets` are millisecond offsets from the start of the round. They are what
     * gets submitted — the server recomputes the score from them. `state.score` is
     * display-only and is sent alongside purely so a mismatch can be detected.
     */
    onGameEnd?: (state: TapGameState, tapOffsets: number[]) => void;
    onScoreUpdate?: (score: number) => void;
    disabled?: boolean;
    autoStart?: boolean;
    giveawayId?: string;
    fingerprintId?: string | null;
}

interface FloatingScore {
    id: number;
    points: number;
    x: number;
    y: number;
}

export function TapGame({
    duration = 30,
    onGameEnd,
    onScoreUpdate,
    disabled = false,
    autoStart = false,
    giveawayId,
    fingerprintId,
}: TapGameProps) {
    const [gameState, setGameState] = useState<TapGameState | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [countdown, setCountdown] = useState(3);
    const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([]);
    const gameRef = useRef<ReturnType<typeof createTapGame> | null>(null);
    const tapAreaRef = useRef<HTMLDivElement>(null);
    const floatingIdRef = useRef(0);

    // Initialize game
    useEffect(() => {
        gameRef.current = createTapGame();
        gameRef.current.setDuration(duration);
        gameRef.current.onUpdate(setGameState);
        gameRef.current.onEnd((state) => {
            // Client-side pattern analysis is a UX signal only — it reports, it does not
            // gate. The authoritative check is score_tap_run() in SQL, which re-derives
            // the score and its own bot flags from the same timings.
            const validation = gameRef.current?.validateTapPattern();
            if (validation && !validation.valid && validation.flags.length > 0 && giveawayId) {
                fps.cheatDetected(giveawayId, validation.flags, validation.confidence, fingerprintId);
            }
            onGameEnd?.(state, gameRef.current?.getTapOffsets() ?? []);
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#9506FA', '#5708EF', '#00D4FF'],
            });
        });

        return () => {
            gameRef.current?.destroy();
        };
    }, [duration, onGameEnd]);

    // Start countdown then game
    const startGame = useCallback(() => {
        if (autoStart) {
            // Skip countdown, start immediately
            setIsReady(true);
            setCountdown(0);
            gameRef.current?.start();
            return;
        }

        setIsReady(true);
        setCountdown(3);

        const countdownInterval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(countdownInterval);
                    gameRef.current?.start();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [autoStart]);

    // Auto-start on mount when autoStart is true
    useEffect(() => {
        if (autoStart && gameRef.current) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            startGame();
        }
    }, [autoStart, startGame]);

    // Handle tap
    const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
        if (!gameState?.isPlaying || disabled) return;

        const rect = tapAreaRef.current?.getBoundingClientRect();
        let x = 0, y = 0;

        if ('touches' in e) {
            x = e.touches[0].clientX - (rect?.left || 0);
            y = e.touches[0].clientY - (rect?.top || 0);
        } else {
            x = e.clientX - (rect?.left || 0);
            y = e.clientY - (rect?.top || 0);
        }

        const result = gameRef.current?.tap({ x, y });

        if (result?.valid && result.points > 0) {
            // Add floating score
            const id = floatingIdRef.current++;
            setFloatingScores((prev) => [...prev, { id, points: result.points, x, y }]);

            // Remove after animation
            setTimeout(() => {
                setFloatingScores((prev) => prev.filter((s) => s.id !== id));
            }, 1000);

            onScoreUpdate?.(gameState.score + result.points);
        }
    };

    // Format time
    const formatTime = (seconds: number) => {
        const s = Math.ceil(seconds);
        return `${s}s`;
    };

    // Multiplier color
    const getMultiplierColor = (multiplier: number) => {
        if (multiplier >= 4) return 'text-purple-400';
        if (multiplier >= 3) return 'text-yellow-400';
        if (multiplier >= 2) return 'text-green-400';
        return 'text-white';
    };

    return (
        <div className="w-full max-w-md mx-auto">
            {/* Stats Bar */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <Trophy className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
                    <p className="text-2xl font-black">{gameState?.score || 0}</p>
                    <p className="text-xs text-white/40">Score</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <Zap className={`w-5 h-5 mx-auto mb-1 ${getMultiplierColor(gameState?.multiplier || 1)}`} />
                    <p className={`text-2xl font-black ${getMultiplierColor(gameState?.multiplier || 1)}`}>
                        {(gameState?.multiplier || 1).toFixed(1)}x
                    </p>
                    <p className="text-xs text-white/40">Multi</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                    <Timer className={`w-5 h-5 mx-auto mb-1 ${(gameState?.timeRemaining || 0) <= 5 ? 'text-red-400' : 'text-cyan-400'}`} />
                    <p className={`text-2xl font-black ${(gameState?.timeRemaining || 0) <= 5 ? 'text-red-400' : ''}`}>
                        {formatTime(gameState?.timeRemaining || duration)}
                    </p>
                    <p className="text-xs text-white/40">Time</p>
                </div>
            </div>

            {/* Streak Indicator */}
            {gameState?.isPlaying && gameState.streak > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-4"
                >
                    <span className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-sm font-bold">
                        🔥 {gameState.streak} Streak! Best: {gameState.bestStreak}
                    </span>
                </motion.div>
            )}

            {/* Tap Area */}
            <div
                ref={tapAreaRef}
                onClick={handleTap}
                onTouchStart={handleTap}
                className={`
          relative aspect-square rounded-3xl overflow-hidden
          transition-all duration-200 select-none
          ${gameState?.isPlaying
                        ? 'cursor-pointer bg-gradient-to-br from-purple-600/20 to-pink-600/20 border-2 border-purple-500/50 active:scale-95'
                        : 'bg-white/5 border border-white/10'
                    }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
            >
                {/* Floating Scores */}
                <AnimatePresence>
                    {floatingScores.map((score) => (
                        <motion.div
                            key={score.id}
                            initial={{ opacity: 1, y: 0, scale: 1 }}
                            animate={{ opacity: 0, y: -50, scale: 1.5 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute text-2xl font-black text-yellow-400 pointer-events-none"
                            style={{ left: score.x - 20, top: score.y - 20 }}
                        >
                            +{score.points}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Not Started State */}
                {!isReady && !gameState?.isFinished && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!disabled) startGame();
                            }}
                            className="cursor-pointer"
                        >
                            <div className="w-32 h-32 rounded-full bg-brand-gradient flex items-center justify-center glow-primary mb-4">
                                <Target className="w-16 h-16 text-white" />
                            </div>
                            <p className="text-xl font-bold text-center">Tap to Start</p>
                            <p className="text-white/40 text-center">{duration} seconds</p>
                        </motion.div>
                    </div>
                )}

                {/* Countdown */}
                {isReady && countdown > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <motion.div
                            key={countdown}
                            initial={{ scale: 2, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            className="text-8xl font-black text-primary"
                        >
                            {countdown}
                        </motion.div>
                    </div>
                )}

                {/* Playing State */}
                {gameState?.isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ repeat: Infinity, duration: 0.3 }}
                            className="text-center"
                        >
                            <Target className="w-24 h-24 mx-auto mb-4 text-white/20" />
                            <p className="text-2xl font-bold text-white/40">TAP!</p>
                        </motion.div>
                    </div>
                )}

                {/* Finished State */}
                {gameState?.isFinished && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-purple-600/30 to-pink-600/30">
                        <Sparkles className="w-16 h-16 mb-4 text-yellow-400" />
                        <p className="text-4xl font-black mb-2">{gameState.score}</p>
                        <p className="text-white/60">Final Score</p>
                        <div className="flex gap-4 mt-4 text-sm">
                            <span className="text-white/40">{gameState.taps} taps</span>
                            <span className="text-white/40">🔥 {gameState.bestStreak} best streak</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Tips */}
            {!gameState?.isPlaying && !gameState?.isFinished && (
                <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-sm text-white/60 text-center">
                        💡 <span className="font-medium">Pro tip:</span> Keep a steady rhythm for streak bonuses!
                    </p>
                </div>
            )}
        </div>
    );
}
