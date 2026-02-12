/**
 * Tap Game Engine
 * 
 * Handles the core tap game mechanics:
 * - Score calculation with streak multipliers
 * - Timing bonuses
 * - Anti-cheat validation
 */

export interface TapGameState {
    score: number;
    taps: number;
    streak: number;
    bestStreak: number;
    multiplier: number;
    timeRemaining: number;
    isPlaying: boolean;
    isFinished: boolean;
    lastTapTime: number;
}

export interface TapEvent {
    timestamp: number;
    x: number;
    y: number;
    velocity?: number;
}

// Anti-cheat constants
const MIN_TAP_INTERVAL_MS = 50; // Minimum 50ms between taps (max 20 taps/sec)
const MAX_TAP_VELOCITY = 1000; // Maximum reasonable tap velocity
const STREAK_TIMEOUT_MS = 500; // Streak breaks after 500ms of no taps

// Scoring constants
const BASE_POINTS_PER_TAP = 10;
const STREAK_MULTIPLIER_INCREMENT = 0.1; // Each streak tap adds 10% multiplier
const MAX_MULTIPLIER = 5; // Max 5x multiplier
const PERFECT_TAP_BONUS = 5; // Bonus for consistent rhythm

class TapGameEngine {
    private state: TapGameState;
    private tapHistory: TapEvent[] = [];
    private gameStartTime: number = 0;
    private gameDuration: number = 30; // seconds
    private timerInterval: NodeJS.Timeout | null = null;
    private onStateChange: ((state: TapGameState) => void) | null = null;
    private onGameEnd: ((finalState: TapGameState) => void) | null = null;

    constructor() {
        this.state = this.getInitialState();
    }

    private getInitialState(): TapGameState {
        return {
            score: 0,
            taps: 0,
            streak: 0,
            bestStreak: 0,
            multiplier: 1,
            timeRemaining: this.gameDuration,
            isPlaying: false,
            isFinished: false,
            lastTapTime: 0,
        };
    }

    /**
     * Set game duration in seconds
     */
    setDuration(seconds: number) {
        this.gameDuration = seconds;
        this.state.timeRemaining = seconds;
    }

    /**
     * Register state change callback
     */
    onUpdate(callback: (state: TapGameState) => void) {
        this.onStateChange = callback;
    }

    /**
     * Register game end callback
     */
    onEnd(callback: (finalState: TapGameState) => void) {
        this.onGameEnd = callback;
    }

    /**
     * Start the game
     */
    start(): TapGameState {
        this.state = this.getInitialState();
        this.state.isPlaying = true;
        this.state.timeRemaining = this.gameDuration;
        this.gameStartTime = Date.now();
        this.tapHistory = [];

        // Start countdown timer
        this.timerInterval = setInterval(() => {
            const elapsed = (Date.now() - this.gameStartTime) / 1000;
            this.state.timeRemaining = Math.max(0, this.gameDuration - elapsed);

            if (this.state.timeRemaining <= 0) {
                this.end();
            } else {
                this.notifyStateChange();
            }
        }, 100); // Update every 100ms for smooth countdown

        this.notifyStateChange();
        return this.state;
    }

    /**
     * End the game
     */
    end(): TapGameState {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        this.state.isPlaying = false;
        this.state.isFinished = true;
        this.state.timeRemaining = 0;

        this.notifyStateChange();
        this.onGameEnd?.(this.state);

        return this.state;
    }

    /**
     * Register a tap
     */
    tap(event: Partial<TapEvent> = {}): { valid: boolean; points: number; reason?: string } {
        if (!this.state.isPlaying) {
            return { valid: false, points: 0, reason: 'Game not active' };
        }

        const now = Date.now();
        const tapEvent: TapEvent = {
            timestamp: now,
            x: event.x || 0,
            y: event.y || 0,
            velocity: event.velocity,
        };

        // Anti-cheat: Check tap interval
        if (this.state.lastTapTime > 0) {
            const interval = now - this.state.lastTapTime;
            if (interval < MIN_TAP_INTERVAL_MS) {
                // Too fast - likely automated
                return { valid: false, points: 0, reason: 'Tap too fast' };
            }
        }

        // Anti-cheat: Check tap velocity
        if (event.velocity && event.velocity > MAX_TAP_VELOCITY) {
            return { valid: false, points: 0, reason: 'Invalid tap velocity' };
        }

        // Check streak continuation
        const timeSinceLastTap = this.state.lastTapTime > 0
            ? now - this.state.lastTapTime
            : 0;

        if (timeSinceLastTap > STREAK_TIMEOUT_MS) {
            // Streak broken
            this.state.streak = 0;
            this.state.multiplier = 1;
        } else if (timeSinceLastTap > 0) {
            // Continue streak
            this.state.streak++;
            this.state.multiplier = Math.min(
                MAX_MULTIPLIER,
                1 + (this.state.streak * STREAK_MULTIPLIER_INCREMENT)
            );
        }

        // Update best streak
        if (this.state.streak > this.state.bestStreak) {
            this.state.bestStreak = this.state.streak;
        }

        // Calculate points
        let points = Math.floor(BASE_POINTS_PER_TAP * this.state.multiplier);

        // Perfect rhythm bonus (taps between 150-250ms apart)
        if (timeSinceLastTap >= 150 && timeSinceLastTap <= 250) {
            points += PERFECT_TAP_BONUS;
        }

        // Update state
        this.state.score += points;
        this.state.taps++;
        this.state.lastTapTime = now;

        // Record tap for analysis
        this.tapHistory.push(tapEvent);

        this.notifyStateChange();

        return { valid: true, points };
    }

    /**
     * Get current state
     */
    getState(): TapGameState {
        return { ...this.state };
    }

    /**
     * Get tap history for anti-cheat analysis
     */
    getTapHistory(): TapEvent[] {
        return [...this.tapHistory];
    }

    /**
     * Validate tap pattern (anti-cheat)
     */
    validateTapPattern(): { valid: boolean; confidence: number; flags: string[] } {
        const flags: string[] = [];
        let confidence = 100;

        if (this.tapHistory.length < 2) {
            return { valid: true, confidence: 100, flags: [] };
        }

        // Calculate tap intervals
        const intervals: number[] = [];
        for (let i = 1; i < this.tapHistory.length; i++) {
            intervals.push(this.tapHistory[i].timestamp - this.tapHistory[i - 1].timestamp);
        }

        // Check for suspiciously consistent intervals (bot behavior)
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);

        // Very low standard deviation = likely bot
        if (stdDev < 10 && intervals.length > 10) {
            flags.push('Suspiciously consistent tap timing');
            confidence -= 30;
        }

        // Check for impossible speeds
        const tooFastTaps = intervals.filter(i => i < MIN_TAP_INTERVAL_MS).length;
        if (tooFastTaps > 0) {
            flags.push(`${tooFastTaps} taps exceeded speed limit`);
            confidence -= tooFastTaps * 5;
        }

        // Check TPS (taps per second)
        const gameDuration = (this.tapHistory[this.tapHistory.length - 1].timestamp - this.tapHistory[0].timestamp) / 1000;
        const tps = this.tapHistory.length / gameDuration;
        if (tps > 15) {
            flags.push(`Very high TPS: ${tps.toFixed(1)}`);
            confidence -= 20;
        }

        return {
            valid: confidence >= 50,
            confidence: Math.max(0, confidence),
            flags,
        };
    }

    private notifyStateChange() {
        this.onStateChange?.({ ...this.state });
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }
}

// Export singleton factory
export function createTapGame(): TapGameEngine {
    return new TapGameEngine();
}

export type { TapGameEngine };
