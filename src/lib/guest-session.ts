/**
 * Guest session token — client-side storage.
 *
 * A guest's identity used to be their device fingerprint, which is a problem because a
 * fingerprint is *observable*: it appeared on the public leaderboard and on the giveaway
 * row of any guest who won. Anyone could read a winner's fingerprint, sign up, and claim
 * their prize.
 *
 * The token here is the credential instead. It is minted server-side on first guest join,
 * returned exactly once, and only its SHA-256 hash is stored in the database. Losing this
 * token means losing access to the guest history it represents — which is the correct
 * trade for making it unforgeable.
 *
 * Scope: one token per browser, not per giveaway, so a guest who plays several events and
 * then signs up carries all of them across in one claim.
 */

const STORAGE_KEY = 'ga.guest_session_token';
const SESSION_ID_KEY = 'ga.guest_session_id';

function safeStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        // Access throws in some privacy modes rather than returning null.
        return window.localStorage;
    } catch {
        return null;
    }
}

export function getGuestToken(): string | null {
    return safeStorage()?.getItem(STORAGE_KEY) ?? null;
}

export function setGuestToken(token: string): void {
    safeStorage()?.setItem(STORAGE_KEY, token);
}

export function getGuestSessionId(): string | null {
    return safeStorage()?.getItem(SESSION_ID_KEY) ?? null;
}

export function setGuestSessionId(id: string): void {
    safeStorage()?.setItem(SESSION_ID_KEY, id);
}

/**
 * Store whatever the guest-join endpoint returned.
 * `sessionToken` is present only on the response that minted it.
 */
export function persistGuestSession(res: { sessionId?: string; sessionToken?: string }): void {
    if (res.sessionToken) setGuestToken(res.sessionToken);
    if (res.sessionId) setGuestSessionId(res.sessionId);
}

/**
 * Called after a guest signs up. Clearing on success prevents a second account from
 * attempting to claim the same session — the database rejects it anyway, but there is no
 * reason to keep a spent credential in storage.
 */
export function clearGuestSession(): void {
    const storage = safeStorage();
    storage?.removeItem(STORAGE_KEY);
    storage?.removeItem(SESSION_ID_KEY);
}
