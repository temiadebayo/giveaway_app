/**
 * Giveaway Service
 * 
 * Handles all giveaway operations with Supabase
 */

import { createClient } from '@/lib/supabase';
import { TrustTier } from '@/lib/trust-engine';
import { getGuestToken, persistGuestSession, clearGuestSession } from '@/lib/guest-session';

export interface Giveaway {
    id: string;
    host_id: string;
    title: string;
    description: string | null;
    prize_amount: number;
    prize_currency: string;
    game_type: 'tap' | 'quiz' | 'spin';
    game_duration_seconds: number;
    min_trust_tier: TrustTier;
    max_participants: number;
    entry_fee: number;
    status: 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled';
    number_of_winners: number;
    prevent_previous_winners_hours: number;
    starts_at: string | null;
    ends_at: string | null;
    scheduled_start_at: string | null;
    allow_sharing: boolean;
    winner_id: string | null;
    winner_guest_session_id: string | null;
    winning_score: number | null;
    prize_claimed_at: string | null;
    created_at: string;
    // Joined fields
    host?: {
        username: string;
        display_name: string;
        avatar_url: string | null;
    };
    participant_count?: number;
}

export interface Participant {
    id: string;
    giveaway_id: string;
    user_id: string;
    score: number;
    taps: number;
    best_streak: number;
    rank: number | null;
    joined_at: string;
    completed_at: string | null;
    is_winner: boolean;
    guest_session_id?: string;
    // Joined fields
    user?: {
        username: string;
        display_name: string;
        avatar_url: string | null;
        trust_tier: TrustTier;
    };
}

// Score validation lives in the submit_score() RPC now. It used to be enforced here,
// in the browser, which meant it was enforced only against people who ran our code.

class GiveawayService {
    private supabase = createClient();

    /**
     * Get all active giveaways
     */
    async getActiveGiveaways(): Promise<Giveaway[]> {
        const { data, error } = await this.supabase
            .from('giveaways')
            .select(`
                *,
                host:profiles!host_id(username, display_name, avatar_url),
                participant_count:giveaway_participants(count)
            `)
            .in('status', ['scheduled', 'live'])
            .order('starts_at', { ascending: true });

        if (error) {
            console.error('Error fetching giveaways:', error);
            return [];
        }

        return (data || []).map((g: any) => ({
            ...g,
            host: g.host,
            participant_count: g.participant_count?.[0]?.count || 0,
        }));
    }

    /**
     * Get current user's giveaways (including drafts)
     */
    async getMyGiveaways(): Promise<Giveaway[]> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await this.supabase
            .from('giveaways')
            .select(`
                *,
                host:profiles!host_id(username, display_name, avatar_url),
                participant_count:giveaway_participants(count)
            `)
            .eq('host_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching my giveaways:', error);
            return [];
        }

        return (data || []).map((g: any) => ({
            ...g,
            host: g.host,
            participant_count: g.participant_count?.[0]?.count || 0,
        }));
    }

    /**
     * Get giveaways won by the current user
     */
    async getUserWins(): Promise<any[]> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await this.supabase
            .from('giveaway_participants')
            .select(`
                score,
                rank,
                giveaway:giveaways!giveaway_id(
                    id,
                    title,
                    prize_amount,
                    prize_currency,
                    ends_at,
                    host:profiles!host_id(username, display_name, avatar_url)
                )
            `)
            .eq('user_id', user.id)
            .eq('is_winner', true)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('Error fetching user wins:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Get a single giveaway by ID
     */
    async getGiveaway(id: string): Promise<Giveaway | null> {
        const { data, error } = await this.supabase
            .from('giveaways')
            .select(`
        *,
        host:profiles!host_id(username, display_name, avatar_url),
        participant_count:giveaway_participants(count)
      `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching giveaway:', error);
            return null;
        }

        return {
            ...data,
            host: data.host,
            participant_count: data.participant_count?.[0]?.count || 0,
        };
    }

    async getGiveawayByShareCode(shareCode: string): Promise<Giveaway | null> {
        const { data, error } = await this.supabase
            .from('giveaways')
            .select(`
                *,
                host:profiles!host_id(username, display_name, avatar_url),
                participant_count:giveaway_participants(count)
            `)
            .eq('share_code', shareCode)
            .single();

        if (error) return null;

        return {
            ...data,
            host: data.host,
            participant_count: data.participant_count?.[0]?.count || 0,
        };
    }

    /**
     * Join a giveaway.
     *
     * All eligibility rules now live in the join_giveaway() RPC. They used to be run
     * here in TypeScript and then written with a plain INSERT, so calling PostgREST
     * directly skipped every one of them. Two were also broken as written:
     *   - the previous-winner cooldown used .filter('giveaways.host_id', ...) against a
     *     query with no embedded join, which PostgREST does not evaluate as intended
     *   - min_trust_tier and max_participants were stored but never checked anywhere
     */
    async joinGiveaway(giveawayId: string, fingerprintId?: string): Promise<{ success: boolean; error?: string }> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await this.supabase.rpc('join_giveaway', {
            p_giveaway_id: giveawayId,
            p_fingerprint: fingerprintId ?? null,
        });

        if (error) {
            console.error('Error joining giveaway:', error);
            return { success: false, error: error.message };
        }

        if (!data?.success) {
            return { success: false, error: data?.error || 'Unable to join this giveaway' };
        }

        // Force a realtime broadcast to the lobby channel so the Host sees it immediately
        try {
            const channel = this.supabase.channel(`lobby:${giveawayId}`);
            await new Promise<void>((resolve) => {
                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.send({
                            type: 'broadcast',
                            event: 'join',
                            payload: { type: 'user', userId: user.id, timestamp: Date.now() }
                        });
                        channel.unsubscribe();
                        resolve();
                    }
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        resolve(); // Resolve anyway so we don't break the join
                    }
                });
            });
        } catch (broadcastErr) {
            console.error('Broadcast error (non-fatal):', broadcastErr);
        }

        return { success: true };
    }

    /**
     * Get user's participation in a giveaway
     */
    async getParticipation(giveawayId: string): Promise<Participant | null> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await this.supabase
            .from('giveaway_participants')
            .select('*')
            .eq('giveaway_id', giveawayId)
            .eq('user_id', user.id)
            .single();

        if (error) return null;
        return data as Participant;
    }

    /**
     * Submit game score
     */
    /**
     * Submit a completed round.
     *
     * Sends the tap TIMINGS, not a score. The server replays them through the same
     * scoring rules as the client engine and returns the authoritative figure, which is
     * what gets stored and displayed.
     *
     * `clientScore` is sent only so the server can compare and flag a discrepancy — a
     * tampered page now announces itself rather than succeeding quietly.
     */
    async submitScore(
        giveawayId: string,
        tapOffsets: number[],
        clientScore?: number
    ): Promise<{ success: boolean; score?: number; taps?: number; bestStreak?: number; rank?: number; error?: string }> {
        const { data, error } = await this.supabase.rpc('submit_score', {
            p_giveaway_id: giveawayId,
            p_tap_offsets: tapOffsets,
            p_client_score: clientScore ?? null,
        });

        if (error) {
            console.error('Error submitting score:', error);
            return { success: false, error: error.message };
        }

        if (!data?.success) {
            return { success: false, error: data?.error || 'Score rejected' };
        }

        return {
            success: true,
            score: data.score,
            taps: data.taps,
            bestStreak: data.best_streak,
            rank: data.rank,
        };
    }

    /**
     * Get leaderboard for a giveaway (includes users and guests)
     */
    async getLeaderboard(giveawayId: string, limit = 50): Promise<Participant[]> {
        return this.getCombinedLeaderboard(giveawayId, limit);
    }

    /**
     * Subscribe to leaderboard updates (both users and guests)
     */
    subscribeToLeaderboard(
        giveawayId: string,
        callback: (participants: Participant[]) => void
    ) {
        return this.supabase
            .channel(`leaderboard:${giveawayId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'giveaway_participants',
                    filter: `giveaway_id=eq.${giveawayId}`,
                },
                async () => {
                    const leaderboard = await this.getCombinedLeaderboard(giveawayId);
                    callback(leaderboard);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'guest_participants',
                    filter: `giveaway_id=eq.${giveawayId}`,
                },
                async () => {
                    const leaderboard = await this.getCombinedLeaderboard(giveawayId);
                    callback(leaderboard);
                }
            )
            .subscribe();
    }

    /**
     * Ensure user profile exists (create if not)
     */
    private async ensureProfileExists(user: { id: string; email?: string; user_metadata?: any }): Promise<boolean> {
        // Check if profile exists
        const { data: existingProfile } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();

        if (existingProfile) {
            return true;
        }

        // Create profile
        const { error } = await this.supabase
            .from('profiles')
            .insert({
                id: user.id,
                email: user.email,
                username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
                display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0],
                avatar_url: user.user_metadata?.avatar_url || null,
            });

        if (error) {
            console.error('Error creating profile:', error);
            return false;
        }

        return true;
    }

    /**
     * Create a new giveaway (for hosts)
     */
    async createGiveaway(giveaway: Partial<Giveaway>): Promise<{ success: boolean; id?: string; error?: string }> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Ensure profile exists before creating giveaway
        const profileExists = await this.ensureProfileExists(user);
        if (!profileExists) {
            return { success: false, error: 'Failed to create user profile' };
        }

        const { data, error } = await this.supabase
            .from('giveaways')
            .insert({
                host_id: user.id,
                title: giveaway.title,
                description: giveaway.description,
                prize_amount: giveaway.prize_amount,
                prize_currency: giveaway.prize_currency || 'NGN',
                game_type: giveaway.game_type || 'tap',
                game_duration_seconds: giveaway.game_duration_seconds || 30,
                min_trust_tier: giveaway.min_trust_tier || 'bronze',
                max_participants: giveaway.max_participants || 100,
                number_of_winners: giveaway.number_of_winners || 1,
                prevent_previous_winners_hours: giveaway.prevent_previous_winners_hours || 0,
                entry_fee: giveaway.entry_fee || 0,
                status: 'draft',
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error creating giveaway:', error);
            return { success: false, error: error.message };
        }

        return { success: true, id: data.id };
    }

    /**
     * Start a giveaway event (for hosts) — triggers lobby → live transition
     */
    async startGiveaway(giveawayId: string): Promise<{ success: boolean; error?: string }> {
        const { data, error } = await this.supabase
            .rpc('start_giveaway_event', { p_giveaway_id: giveawayId });

        if (error) {
            return { success: false, error: error.message };
        }

        if (data && !data.success) {
            return { success: false, error: data.error };
        }

        return { success: true };
    }

    /**
     * End a giveaway and pick the winner.
     *
     * Repointed from finalize_giveaway() to complete_giveaway(). The two were duplicate
     * implementations of the same operation that had drifted apart — finalize_giveaway
     * ignored guest participants entirely, so a guest could win a round and the winner
     * would still be recorded as the top authenticated player. finalize_giveaway is
     * dropped in the Phase 0 migrations.
     */
    async endGiveaway(giveawayId: string): Promise<{ success: boolean; winner?: any; error?: string }> {
        const { data, error } = await this.supabase
            .rpc('complete_giveaway', { p_giveaway_id: giveawayId });

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data?.success) {
            return { success: false, error: data?.error };
        }

        return { success: true, winner: data };
    }

    /**
     * Cancel a giveaway and refund the escrow to the host.
     *
     * This used to be six sequential round-trips from the browser, including a
     * read-modify-write on the wallet balance. A failure part-way through left the
     * escrow released but the giveaway still open, and two concurrent calls could
     * refund twice. cancel_giveaway() does the whole thing in one transaction with
     * row locks. It also refuses to cancel a giveaway that is already live.
     */
    async cancelGiveaway(giveawayId: string): Promise<{ success: boolean; refunded?: number; error?: string }> {
        const { data, error } = await this.supabase.rpc('cancel_giveaway', {
            p_giveaway_id: giveawayId,
        });

        if (error) {
            console.error('Error cancelling giveaway:', error);
            return { success: false, error: error.message };
        }

        if (!data?.success) {
            return { success: false, error: data?.error || 'Unable to cancel this giveaway' };
        }

        return { success: true, refunded: data.refunded };
    }

    // ============================================
    // GUEST PARTICIPATION METHODS
    // ============================================

    /**
     * Join a giveaway as a guest (no account required)
     */
    async joinAsGuest(giveawayId: string, fingerprintId: string, guestName?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch(`/api/giveaways/${giveawayId}/guest-join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fingerprintId,
                    guestName: guestName || null,
                    // Sent so an existing guest keeps one session across multiple events.
                    sessionToken: getGuestToken(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Error joining as guest:', data.error);
                return { success: false, error: data.error };
            }

            // The raw token comes back only on the response that minted it.
            persistGuestSession(data);

            return { success: true };
        } catch (err) {
            console.error('Error joining as guest:', err);
            return { success: false, error: 'Failed to join giveaway' };
        }
    }

    /**
     * Claim prize for a won giveaway
     */
    async claimPrize(giveawayId: string): Promise<{ success: boolean; error?: string; prize_amount?: number }> {
        const { data, error } = await this.supabase
            .rpc('claim_prize', { p_giveaway_id: giveawayId });

        if (error) {
            console.error('Error claiming prize:', error);
            return { success: false, error: error.message };
        }

        return data;
    }

    /**
     * Submit score as a guest (via server API)
     */
    async submitGuestScore(
        giveawayId: string,
        tapOffsets: number[],
        clientScore?: number
    ): Promise<{ success: boolean; score?: number; error?: string }> {
        try {
            // Keyed on the session token, not the fingerprint: a fingerprint is public,
            // so it must not be able to write anyone's score. Timings, not a score —
            // the server derives the figure.
            const response = await fetch(`/api/giveaways/${giveawayId}/guest-join`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionToken: getGuestToken(),
                    tapOffsets,
                    clientScore: clientScore ?? null,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Error submitting guest score:', data.error);
                return { success: false, error: data.error };
            }

            return { success: true, score: data.score };
        } catch (err) {
            console.error('Error submitting guest score:', err);
            return { success: false, error: 'Failed to submit score' };
        }
    }

    /**
     * Get guest participation by fingerprint (via server API)
     */
    async getGuestParticipation(giveawayId: string, _fingerprintId?: string): Promise<GuestParticipant | null> {
        const token = getGuestToken();
        if (!token) return null;

        try {
            const response = await fetch(
                `/api/giveaways/${giveawayId}/guest-join?sessionToken=${encodeURIComponent(token)}`
            );
            const data = await response.json();
            return data.participation || null;
        } catch (err) {
            console.error('Error getting guest participation:', err);
            return null;
        }
    }

    /**
     * Claim this browser's guest history into the signed-in account.
     *
     * Replaces linkGuestToUser(fingerprintId). The old RPC authorised on a fingerprint,
     * which was published on the leaderboard — so anyone could claim a guest winner's
     * prize by reading it. Authorisation is now the session token, which only ever
     * existed in the guest's own browser.
     */
    async claimGuestSession(): Promise<{ success: boolean; linkedCount?: number; error?: string }> {
        const token = getGuestToken();
        if (!token) {
            return { success: false, error: 'No guest session on this device' };
        }

        const { data, error } = await this.supabase
            .rpc('claim_guest_session', { p_token: token });

        if (error) {
            console.error('Error claiming guest session:', error);
            return { success: false, error: error.message };
        }

        if (!data?.success) {
            return { success: false, error: data?.error };
        }

        // The credential is spent; there is no reason to keep it around.
        clearGuestSession();

        return { success: true, linkedCount: data.linked_count };
    }

    /**
     * Get combined leaderboard (users + guests)
     */
    /**
     * Get combined leaderboard (users + guests)
     */
    async getCombinedLeaderboard(giveawayId: string, limit = 50): Promise<Participant[]> {
        // First try the view
        const { data: combined, error: viewError } = await this.supabase
            .from('combined_leaderboard')
            .select('*')
            .eq('giveaway_id', giveawayId)
            .order('score', { ascending: false })
            .limit(limit);

        if (!viewError && combined) {
            // Map flat view structure to nested Participant structure.
            // Guests are keyed on guest_session_id — the view no longer exposes
            // fingerprint_id, since publishing it is what allowed guest prize hijacking.
            return combined.map((row: any) => ({
                id: row.participation_id,
                giveaway_id: row.giveaway_id,
                user_id: row.user_id || row.guest_session_id,
                score: row.score,
                taps: row.taps,
                best_streak: row.best_streak,
                rank: null, // UI calculates rank
                joined_at: row.joined_at,
                completed_at: row.completed_at,
                is_winner: row.is_winner,
                user: {
                    id: row.user_id || row.guest_session_id,
                    username: row.username,
                    display_name: row.display_name,
                    avatar_url: row.avatar_url,
                    trust_tier: row.trust_tier || 'bronze'
                },
                guest_session_id: row.guest_session_id
            })) as Participant[];
        }

        // Fallback to regular leaderboard
        return this.getLeaderboard(giveawayId, limit);
    }

    /**
     * Get shareable URL for a giveaway
     */
    getShareUrl(giveawayId: string): string {
        // Use the base URL from environment or window
        const baseUrl = typeof window !== 'undefined'
            ? window.location.origin
            : process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com';
        return `${baseUrl}/giveaways/${giveawayId}`;
    }

    /**
     * Get giveaway by share code
     */

    /**
     * Get all participants in the lobby (for lobby view)
     * Includes both authenticated users and guest participants
     */
    async getLobbyParticipants(giveawayId: string): Promise<Participant[]> {
        // 1. Fetch authenticated participants
        const { data: authData, error: authError } = await this.supabase
            .from('giveaway_participants')
            .select(`
                *,
                user:profiles!user_id(username, display_name, avatar_url, trust_tier)
            `)
            .eq('giveaway_id', giveawayId)
            .order('joined_at', { ascending: true });

        if (authError) {
            console.error('Error fetching lobby participants:', authError);
        }

        const authParticipants = (authData || []).map((p: any) => ({
            ...p,
            user: p.user,
        }));

        // 2. Fetch guest participants.
        // Explicit column list: fingerprint_id and linked_user_id are column-revoked from
        // clients, so select('*') would now fail.
        const { data: guestData, error: guestError } = await this.supabase
            .from('guest_participants')
            .select('id, giveaway_id, guest_session_id, guest_name, score, taps, best_streak, joined_at, completed_at, is_winner')
            .eq('giveaway_id', giveawayId)
            .order('joined_at', { ascending: true });

        if (guestError) {
            console.error('Error fetching guest lobby participants:', guestError);
        }

        const guestParticipants = (guestData || []).map((g: any) => ({
            id: g.id,
            giveaway_id: g.giveaway_id,
            user_id: g.guest_session_id,
            score: g.score || 0,
            taps: g.taps || 0,
            best_streak: g.best_streak || 0,
            rank: null,
            joined_at: g.joined_at,
            completed_at: g.completed_at,
            is_winner: g.is_winner || false,
            user: {
                id: g.guest_session_id,
                username: g.guest_name || 'Guest',
                display_name: g.guest_name || 'Guest',
                avatar_url: null,
                trust_tier: 'bronze'
            },
            guest_session_id: g.guest_session_id,
        }));

        // 3. Combine and sort by joined_at
        return [...authParticipants, ...guestParticipants].sort(
            (a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
        ) as Participant[];
    }


    /**
     * Subscribe to lobby participant changes (joins)
     * Watches both authenticated and guest participant tables
     */
    subscribeToLobby(
        giveawayId: string,
        callback: (participants: Participant[]) => void
    ) {
        const channel = this.supabase
            .channel(`lobby:${giveawayId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'giveaway_participants',
                    filter: `giveaway_id=eq.${giveawayId}`
                },
                async () => {
                    const participants = await this.getLobbyParticipants(giveawayId);
                    callback(participants);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'guest_participants',
                    filter: `giveaway_id=eq.${giveawayId}`
                },
                async () => {
                    const participants = await this.getLobbyParticipants(giveawayId);
                    callback(participants);
                }
            )
            .on(
                'broadcast',
                { event: 'join' },
                async () => {
                    // Fallback explicit broadcast catch to ensure UI updates instantly
                    const participants = await this.getLobbyParticipants(giveawayId);
                    callback(participants);
                }
            )
            .subscribe();

        return channel;
    }

    /**
     * Send an emote to the lobby via Supabase Realtime broadcast
     */
    async sendLobbyEmote(giveawayId: string, emote: string, username: string) {
        const channel = this.supabase.channel(`lobby-emotes:${giveawayId}`);
        await channel.subscribe();
        await channel.send({
            type: 'broadcast',
            event: 'emote',
            payload: { emote, username, timestamp: Date.now() }
        });
        // Unsubscribe after sending
        setTimeout(() => channel.unsubscribe(), 1000);
    }

    /**
     * Subscribe to lobby emotes
     */
    subscribeToLobbyEmotes(
        giveawayId: string,
        callback: (emote: { emote: string; username: string; timestamp: number }) => void
    ) {
        const channel = this.supabase
            .channel(`lobby-emotes:${giveawayId}`)
            .on('broadcast', { event: 'emote' }, (payload) => {
                callback(payload.payload as any);
            })
            .subscribe();

        return channel;
    }
}

export interface GuestParticipant {
    id: string;
    giveaway_id: string;
    guest_session_id: string;
    guest_name?: string;
    score: number;
    taps: number;
    best_streak: number;
    joined_at: string;
    completed_at?: string;
    linked_user_id?: string;
    linked_at?: string;
}

export const giveawayService = new GiveawayService();

