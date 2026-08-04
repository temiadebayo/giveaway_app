import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTapGame } from '../tap-game-engine';

/**
 * These bounds are duplicated in two server-side validators:
 *   - submit_score()          in 20260802120300_phase0_write_rpcs.sql (authenticated players)
 *   - PUT /api/giveaways/[id]/guest-join                              (guests)
 *
 * Both reject a submission where taps > duration * 20 + 10, or score > taps * 55 + 50.
 * Those numbers are derived from the engine constants below. If someone tunes the
 * scoring — raises MAX_MULTIPLIER, shortens MIN_TAP_INTERVAL_MS — the server will start
 * rejecting legitimate scores, and these tests are what should catch it first.
 *
 * The pre-Phase-0 validator allowed 25 taps/sec and 80 points/tap: a ceiling roughly 8x
 * what the engine can actually produce, which made it close to meaningless.
 */

const MAX_TAPS_PER_SECOND = 20;   // from MIN_TAP_INTERVAL_MS = 50
const MAX_POINTS_PER_TAP = 55;    // BASE_POINTS_PER_TAP(10) * MAX_MULTIPLIER(5) + PERFECT_TAP_BONUS(5)

describe('tap engine stays inside the bounds the server enforces', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('never awards more than 55 points for a single tap, even at perfect rhythm', () => {
        const game = createTapGame();
        game.setDuration(30);
        game.start();

        let maxPoints = 0;

        // 150ms is inside the "perfect rhythm" window (150-250ms), so this run earns the
        // streak bonus on every tap and drives the multiplier to its cap.
        for (let i = 0; i < 150; i++) {
            vi.advanceTimersByTime(150);
            const result = game.tap({ x: 10, y: 10 });
            if (result.valid) {
                maxPoints = Math.max(maxPoints, result.points);
            }
        }

        const state = game.getState();

        expect(maxPoints).toBeLessThanOrEqual(MAX_POINTS_PER_TAP);
        expect(state.score).toBeLessThanOrEqual(state.taps * MAX_POINTS_PER_TAP);

        game.destroy();
    });

    it('rejects taps faster than the minimum interval, capping the rate at 20/sec', () => {
        const game = createTapGame();
        game.setDuration(10);
        game.start();

        // Hammer at 10ms — well under MIN_TAP_INTERVAL_MS.
        for (let i = 0; i < 500; i++) {
            vi.advanceTimersByTime(10);
            game.tap({ x: 10, y: 10 });
        }

        const state = game.getState();
        const elapsedSeconds = 5; // 500 * 10ms

        expect(state.taps / elapsedSeconds).toBeLessThanOrEqual(MAX_TAPS_PER_SECOND);

        game.destroy();
    });

    it('a full-length round stays under the server tap ceiling', () => {
        const durationSeconds = 30;
        const serverTapCeiling = durationSeconds * MAX_TAPS_PER_SECOND + 10;

        const game = createTapGame();
        game.setDuration(durationSeconds);
        game.start();

        // Tap at exactly the minimum legal interval for the whole round.
        for (let i = 0; i < durationSeconds * 20; i++) {
            vi.advanceTimersByTime(50);
            game.tap({ x: 10, y: 10 });
        }

        const state = game.getState();

        expect(state.taps).toBeLessThanOrEqual(serverTapCeiling);
        expect(state.score).toBeLessThanOrEqual(state.taps * MAX_POINTS_PER_TAP + 50);

        game.destroy();
    });

    it('flags a bot-perfect tap pattern', () => {
        const game = createTapGame();
        game.setDuration(30);
        game.start();

        // Machine-exact intervals: zero variance is the signature validateTapPattern looks for.
        for (let i = 0; i < 60; i++) {
            vi.advanceTimersByTime(100);
            game.tap({ x: 10, y: 10 });
        }

        const validation = game.validateTapPattern();

        expect(validation.flags.length).toBeGreaterThan(0);
        expect(validation.confidence).toBeLessThan(100);

        game.destroy();
    });
});
