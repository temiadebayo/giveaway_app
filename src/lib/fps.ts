/**
 * FairPlay System — client-side event tracking.
 * All calls are fire-and-forget. Never blocks the UI.
 */

type FPSCategory = 'analytics' | 'security' | 'game' | 'financial' | 'auth';
type FPSSeverity = 'info' | 'warning' | 'critical';

interface TrackPayload {
    event_name: string;
    category: FPSCategory;
    severity?: FPSSeverity;
    properties?: Record<string, unknown>;
    fingerprint_id?: string | null;
    giveaway_id?: string | null;
    page_url?: string | null;
}

function track(payload: TrackPayload): void {
    if (typeof window === 'undefined') return;
    fetch('/api/fps/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...payload,
            page_url: payload.page_url ?? window.location.href,
        }),
    }).catch(() => {});
}

export const fps = {
    track,

    // ── Analytics ──────────────────────────────────────────────────
    giveawayViewed: (giveawayId: string, prizeAmount: number, fingerprintId?: string | null) =>
        track({ event_name: 'giveaway_viewed', category: 'analytics', giveaway_id: giveawayId, fingerprint_id: fingerprintId, properties: { prize_amount: prizeAmount } }),

    giveawayJoined: (giveawayId: string, isGuest: boolean, fingerprintId?: string | null) =>
        track({ event_name: 'giveaway_joined', category: 'analytics', giveaway_id: giveawayId, fingerprint_id: fingerprintId, properties: { is_guest: isGuest } }),

    gameCompleted: (giveawayId: string, score: number, isGuest: boolean, fingerprintId?: string | null) =>
        track({ event_name: 'game_completed', category: 'game', giveaway_id: giveawayId, fingerprint_id: fingerprintId, properties: { score, is_guest: isGuest } }),

    prizeWon: (giveawayId: string, prizeAmount: number, isGuest: boolean, fingerprintId?: string | null) =>
        track({ event_name: 'prize_won', category: 'analytics', giveaway_id: giveawayId, fingerprint_id: fingerprintId, properties: { prize_amount: prizeAmount, is_guest: isGuest } }),

    prizeClaimed: (giveawayId: string, prizeAmount: number) =>
        track({ event_name: 'prize_claimed', category: 'analytics', giveaway_id: giveawayId, properties: { prize_amount: prizeAmount } }),

    guestSignupPrompted: (trigger: 'waiting' | 'win' | 'lobby', fingerprintId?: string | null) =>
        track({ event_name: 'guest_signup_prompted', category: 'analytics', fingerprint_id: fingerprintId, properties: { trigger } }),

    guestEmailCaptured: (fingerprintId?: string | null) =>
        track({ event_name: 'guest_email_captured', category: 'analytics', fingerprint_id: fingerprintId }),

    giveawayCreated: (giveawayId: string, prizeAmount: number, gameType: string) =>
        track({ event_name: 'giveaway_created', category: 'analytics', giveaway_id: giveawayId, properties: { prize_amount: prizeAmount, game_type: gameType } }),

    // ── Financial ──────────────────────────────────────────────────
    depositInitiated: (amount: number) =>
        track({ event_name: 'deposit_initiated', category: 'financial', properties: { amount } }),

    withdrawalRequested: (amount: number) =>
        track({ event_name: 'withdrawal_requested', category: 'financial', properties: { amount } }),

    // ── Security / Game Integrity ──────────────────────────────────
    cheatDetected: (giveawayId: string, flags: string[], confidence: number, fingerprintId?: string | null) =>
        track({
            event_name: 'cheat_detected',
            category: 'security',
            severity: 'warning',
            giveaway_id: giveawayId,
            fingerprint_id: fingerprintId,
            properties: { flags, confidence },
        }),

    scoreSubmitted: (giveawayId: string, score: number, taps: number, isGuest: boolean, fingerprintId?: string | null) =>
        track({
            event_name: 'score_submitted',
            category: 'game',
            giveaway_id: giveawayId,
            fingerprint_id: fingerprintId,
            properties: { score, taps, is_guest: isGuest },
        }),

    // ── Auth ───────────────────────────────────────────────────────
    signupCompleted: () =>
        track({ event_name: 'signup_completed', category: 'auth' }),

    loginSuccess: () =>
        track({ event_name: 'login_success', category: 'auth' }),
};
