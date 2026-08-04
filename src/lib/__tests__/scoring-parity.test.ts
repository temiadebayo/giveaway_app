import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTapGame } from '../tap-game-engine';

/**
 * Parity between the client engine and score_tap_run() in SQL.
 *
 * Scores are computed server-side from tap timings
 * (supabase/migrations/20260803110000_phase1_server_side_scoring.sql). That means the
 * same scoring rules now exist in two languages, and if they drift the player sees one
 * number during the round and a different one on the leaderboard.
 *
 * `referenceScore` below is a line-by-line transcription of the PL/pgSQL. The tests
 * assert it agrees with the real engine. So:
 *
 *   - change tap-game-engine.ts  -> these fail -> update the SQL and this reference
 *   - change score_tap_run()     -> update this reference -> these fail if the engine
 *                                   was not updated too
 *
 * Either way the mismatch surfaces here rather than in production.
 */

const MIN_TAP_INTERVAL_MS = 50;
const STREAK_TIMEOUT_MS = 500;
const BASE_POINTS_PER_TAP = 10;
const STREAK_MULTIPLIER_INCREMENT = 0.1;
const MAX_MULTIPLIER = 5;
const PERFECT_TAP_BONUS = 5;

interface ScoredRun {
    score: number;
    taps: number;
    bestStreak: number;
    rejected: number;
}

/** Transcription of public.score_tap_run(integer[], integer). */
function referenceScore(offsets: number[]): ScoredRun {
    let score = 0;
    let taps = 0;
    let streak = 0;
    let bestStreak = 0;
    let multiplier = 1;
    let last = -1;
    let rejected = 0;

    for (const offset of offsets) {
        let interval: number;

        if (last >= 0) {
            interval = offset - last;
            if (interval < MIN_TAP_INTERVAL_MS) {
                rejected++;
                continue;
            }
        } else {
            interval = 0;
        }

        if (interval > STREAK_TIMEOUT_MS) {
            streak = 0;
            multiplier = 1;
        } else if (interval > 0) {
            streak++;
            multiplier = Math.min(MAX_MULTIPLIER, 1 + streak * STREAK_MULTIPLIER_INCREMENT);
        }

        if (streak > bestStreak) bestStreak = streak;

        let points = Math.floor(BASE_POINTS_PER_TAP * multiplier);
        if (interval >= 150 && interval <= 250) points += PERFECT_TAP_BONUS;

        score += points;
        taps++;
        last = offset;
    }

    return { score, taps, bestStreak, rejected };
}

/** Drive the real engine over a set of intervals and return its state + offsets. */
function playRun(intervalsMs: number[], duration = 30) {
    const game = createTapGame();
    game.setDuration(duration);
    game.start();

    for (const gap of intervalsMs) {
        vi.advanceTimersByTime(gap);
        game.tap({ x: 1, y: 1 });
    }

    const state = game.getState();
    const offsets = game.getTapOffsets();
    game.destroy();

    return { state, offsets };
}

describe('client engine and server scoring agree', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('perfect rhythm — 180ms taps', () => {
        const { state, offsets } = playRun(Array(80).fill(180));
        const ref = referenceScore(offsets);

        expect(ref.score).toBe(state.score);
        expect(ref.taps).toBe(state.taps);
        expect(ref.bestStreak).toBe(state.bestStreak);
    });

    it('maximum legal rate — 50ms taps', () => {
        const { state, offsets } = playRun(Array(200).fill(50));
        const ref = referenceScore(offsets);

        expect(ref.score).toBe(state.score);
        expect(ref.taps).toBe(state.taps);
    });

    it('streak-breaking gaps reset the multiplier identically', () => {
        const intervals = [180, 180, 180, 900, 180, 180, 700, 200, 200, 200];
        const { state, offsets } = playRun(intervals);
        const ref = referenceScore(offsets);

        expect(ref.score).toBe(state.score);
        expect(ref.bestStreak).toBe(state.bestStreak);
    });

    it('irregular human-like timing', () => {
        const intervals = [143, 201, 178, 96, 312, 165, 187, 155, 620, 149, 233, 178, 190, 205, 168];
        const { state, offsets } = playRun(intervals);
        const ref = referenceScore(offsets);

        expect(ref.score).toBe(state.score);
        expect(ref.taps).toBe(state.taps);
        expect(ref.bestStreak).toBe(state.bestStreak);
    });

    it('a single tap scores the base value with no multiplier or bonus', () => {
        const { state, offsets } = playRun([200]);
        const ref = referenceScore(offsets);

        expect(offsets).toHaveLength(1);
        expect(ref.score).toBe(BASE_POINTS_PER_TAP);
        expect(ref.score).toBe(state.score);
    });

    it('emits offsets relative to the start of the round, in order', () => {
        const { offsets } = playRun([200, 200, 200]);

        expect(offsets).toEqual([200, 400, 600]);
        expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    });

    it('taps under the minimum interval never reach the submitted timings', () => {
        // The engine refuses them, so they are never recorded and the server never
        // sees them — hence rejected === 0 when replaying what was actually submitted.
        const { offsets } = playRun(Array(100).fill(10));
        const ref = referenceScore(offsets);

        expect(ref.rejected).toBe(0);
        expect(offsets.length).toBeLessThan(100);
    });
});

describe('reference scorer rejects what the server rejects', () => {
    it('caps the multiplier at 5x', () => {
        // 100 consecutive in-streak taps would reach 11x uncapped.
        const offsets = Array.from({ length: 100 }, (_, i) => (i + 1) * 100);
        const ref = referenceScore(offsets);

        // Ceiling is 10 * 5 = 50, plus no rhythm bonus at a 100ms interval.
        expect(ref.score).toBeLessThanOrEqual(ref.taps * 50);
    });

    it('a fabricated burst is throttled to the rate limit', () => {
        // What a naive cheat looks like: 500 taps crammed into 500ms.
        //
        // A rejected tap does NOT advance the last-tap marker — in the engine or in
        // score_tap_run — so one tap becomes legal again every 50ms rather than the
        // whole burst collapsing to a single tap. 500 offsets spanning 0..499ms
        // therefore yield exactly 10 scoring taps, at 0, 50, 100 … 450.
        const offsets = Array.from({ length: 500 }, (_, i) => i);
        const ref = referenceScore(offsets);

        expect(ref.taps).toBe(10);
        expect(ref.rejected).toBe(490);

        // 10 + 11 + 12 … + 19 as the streak multiplier climbs, with no rhythm bonus
        // (a 50ms interval is outside the 150–250ms window).
        expect(ref.score).toBe(145);

        // The point of the exercise: 500 fabricated taps are worth less than a
        // 30-second run played honestly at a good rhythm.
        expect(ref.score).toBeLessThan(1000);
    });
});
