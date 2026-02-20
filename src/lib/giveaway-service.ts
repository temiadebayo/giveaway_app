/**
 * Giveaway Service
 * 
 * Handles all giveaway operations with Supabase
 */

import { createClient } from '@/lib/supabase';
import { TrustTier } from '@/lib/trust-engine';

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
    starts_at: string | null;
    ends_at: string | null;
    scheduled_start_at: string | null;
    allow_sharing: boolean;
    winner_id: string | null;
    winning_score: number | null;
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
    fingerprint_id?: string;
    // Joined fields
    user?: {
        username: string;
        display_name: string;
        avatar_url: string | null;
        trust_tier: TrustTier;
    };
}

// Security constants
const MAX_TAPS_PER_SECOND = 25; // Humanly impossible to exceed
const SCORE_MULTIPLIER_TOLERANCE = 8.0; // Allow significant variance for 5x multipliers + bonuses

class GiveawayService {
    private supabase = createClient();

    /**
     * Validate if score is humanly possible
     */
    private validateScore(score: number, taps: number, durationSeconds: number): { valid: boolean; reason?: string } {
        // Max possible taps
        const maxPossibleTaps = durationSeconds * MAX_TAPS_PER_SECOND;
        if (taps > maxPossibleTaps) {
            return { valid: false, reason: `Tap count ${taps} exceeds maximum possible (${maxPossibleTaps})` };
        }

        // Check if score is reasonable for tap count (with tolerance)
        const maxPossibleScore = taps * 10 * SCORE_MULTIPLIER_TOLERANCE; // Assuming max 10 points per tap with bonuses
        if (score > maxPossibleScore) {
            return { valid: false, reason: `Score ${score} is too high for ${taps} taps` };
        }

        return { valid: true };
    }

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
     * Join a giveaway
     */
    async joinGiveaway(giveawayId: string, fingerprintId?: string): Promise<{ success: boolean; error?: string }> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // SECURITY FIX #1: Host cannot join their own giveaway
        const { data: giveaway } = await this.supabase
            .from('giveaways')
            .select('host_id')
            .eq('id', giveawayId)
            .single();

        if (giveaway?.host_id === user.id) {
            return { success: false, error: 'Hosts cannot participate in their own giveaways' };
        }

        // Check if already joined
        const { data: existing } = await this.supabase
            .from('giveaway_participants')
            .select('id')
            .eq('giveaway_id', giveawayId)
            .eq('user_id', user.id)
            .single();

        if (existing) {
            return { success: true }; // Already joined
        }

        // Join the giveaway
        const { error } = await this.supabase
            .from('giveaway_participants')
            .insert({
                giveaway_id: giveawayId,
                user_id: user.id,
                device_fingerprint_id: fingerprintId || null,
            });

        if (error) {
            console.error('Error joining giveaway:', error);
            return { success: false, error: error.message };
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
    async submitScore(
        giveawayId: string,
        score: number,
        taps: number,
        bestStreak: number
    ): Promise<{ success: boolean; rank?: number; error?: string }> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // SECURITY FIX #3: Check if already submitted
        const { data: existing } = await this.supabase
            .from('giveaway_participants')
            .select('completed_at')
            .eq('giveaway_id', giveawayId)
            .eq('user_id', user.id)
            .single();

        if (existing?.completed_at) {
            return { success: false, error: 'Score already submitted' };
        }

        // SECURITY FIX #2: Validate score is humanly possible
        const { data: giveaway } = await this.supabase
            .from('giveaways')
            .select('game_duration_seconds')
            .eq('id', giveawayId)
            .single();

        const validation = this.validateScore(score, taps, giveaway?.game_duration_seconds || 30);
        if (!validation.valid) {
            console.warn(`Suspicious score rejected: ${validation.reason}`);
            return { success: false, error: 'Invalid score detected' };
        }

        const { data, error } = await this.supabase
            .from('giveaway_participants')
            .update({
                score,
                taps,
                best_streak: bestStreak,
                completed_at: new Date().toISOString(),
            })
            .eq('giveaway_id', giveawayId)
            .eq('user_id', user.id)
            .select('rank')
            .single();

        if (error) {
            console.error('Error submitting score:', error);
            return { success: false, error: error.message };
        }

        return { success: true, rank: data?.rank };
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
                prize_currency: giveaway.prize_currency || 'USD',
                game_type: giveaway.game_type || 'tap',
                game_duration_seconds: giveaway.game_duration_seconds || 30,
                min_trust_tier: giveaway.min_trust_tier || 'bronze',
                max_participants: giveaway.max_participants || 100,
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
     * End a giveaway and pick winner
     */
    async endGiveaway(giveawayId: string): Promise<{ success: boolean; winner?: any; error?: string }> {
        const { data, error } = await this.supabase
            .rpc('finalize_giveaway', { giveaway_uuid: giveawayId });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: data.success, winner: data };
    }

    /**
     * SECURITY FIX #4: Cancel a giveaway and refund escrow
     */
    async cancelGiveaway(giveawayId: string): Promise<{ success: boolean; error?: string }> {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) {
            return { success: false, error: 'Not authenticated' };
        }

        // Verify ownership and status
        const { data: giveaway } = await this.supabase
            .from('giveaways')
            .select('host_id, status, prize_amount')
            .eq('id', giveawayId)
            .single();

        if (!giveaway) {
            return { success: false, error: 'Giveaway not found' };
        }

        if (giveaway.host_id !== user.id) {
            return { success: false, error: 'Only the host can cancel a giveaway' };
        }

        if (giveaway.status === 'ended') {
            return { success: false, error: 'Cannot cancel an ended giveaway' };
        }

        // Refund escrow to wallet
        const { data: escrow } = await this.supabase
            .from('escrow')
            .select('id, amount')
            .eq('giveaway_id', giveawayId)
            .eq('status', 'held')
            .single();

        if (escrow) {
            // Release escrow back to host wallet
            const { data: wallet } = await this.supabase
                .from('wallets')
                .select('id, balance')
                .eq('user_id', user.id)
                .single();

            if (wallet) {
                await this.supabase
                    .from('wallets')
                    .update({ balance: wallet.balance + escrow.amount })
                    .eq('id', wallet.id);

                await this.supabase
                    .from('escrow')
                    .update({ status: 'refunded', released_at: new Date().toISOString() })
                    .eq('id', escrow.id);

                // Record refund transaction
                await this.supabase
                    .from('wallet_transactions')
                    .insert({
                        wallet_id: wallet.id,
                        type: 'escrow_refund',
                        amount: escrow.amount,
                        description: 'Giveaway cancelled - escrow refund',
                        status: 'completed',
                        reference_id: giveawayId,
                    });
            }
        }

        // Update giveaway status
        const { error } = await this.supabase
            .from('giveaways')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', giveawayId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
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
                body: JSON.stringify({ fingerprintId, guestName: guestName || null }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Error joining as guest:', data.error);
                return { success: false, error: data.error };
            }

            return { success: true };
        } catch (err) {
            console.error('Error joining as guest:', err);
            return { success: false, error: 'Failed to join giveaway' };
        }
    }

    /**
     * Submit score as a guest (via server API)
     */
    async submitGuestScore(
        giveawayId: string,
        fingerprintId: string,
        score: number,
        taps: number,
        bestStreak: number
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const response = await fetch(`/api/giveaways/${giveawayId}/guest-join`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fingerprintId, score, taps, bestStreak }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Error submitting guest score:', data.error);
                return { success: false, error: data.error };
            }

            return { success: true };
        } catch (err) {
            console.error('Error submitting guest score:', err);
            return { success: false, error: 'Failed to submit score' };
        }
    }

    /**
     * Get guest participation by fingerprint (via server API)
     */
    async getGuestParticipation(giveawayId: string, fingerprintId: string): Promise<GuestParticipant | null> {
        try {
            const response = await fetch(
                `/api/giveaways/${giveawayId}/guest-join?fingerprintId=${encodeURIComponent(fingerprintId)}`
            );
            const data = await response.json();
            return data.participation || null;
        } catch (err) {
            console.error('Error getting guest participation:', err);
            return null;
        }
    }

    /**
     * Link guest participations to user account
     */
    async linkGuestToUser(fingerprintId: string): Promise<{ success: boolean; linkedCount?: number; error?: string }> {
        const { data, error } = await this.supabase
            .rpc('link_guest_to_user', { p_fingerprint_id: fingerprintId });

        if (error) {
            console.error('Error linking guest to user:', error);
            return { success: false, error: error.message };
        }

        return { success: data.success, linkedCount: data.linked_count };
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
            // Map flat view structure to nested Participant structure
            return combined.map((row: any) => ({
                id: row.participation_id,
                giveaway_id: row.giveaway_id,
                user_id: row.user_id || row.fingerprint_id, // Use fingerprint as fallback ID
                score: row.score,
                taps: row.taps,
                best_streak: row.best_streak,
                rank: null, // UI calculates rank
                joined_at: row.joined_at,
                completed_at: row.completed_at,
                is_winner: row.is_winner,
                user: {
                    id: row.user_id || row.fingerprint_id,
                    username: row.username,
                    display_name: row.display_name,
                    avatar_url: row.avatar_url,
                    trust_tier: row.trust_tier || 'bronze'
                },
                fingerprint_id: row.fingerprint_id // Keep for reference
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

        // 2. Fetch guest participants
        const { data: guestData, error: guestError } = await this.supabase
            .from('guest_participants')
            .select('*')
            .eq('giveaway_id', giveawayId)
            .order('joined_at', { ascending: true });

        if (guestError) {
            console.error('Error fetching guest lobby participants:', guestError);
        }

        const guestParticipants = (guestData || []).map((g: any) => ({
            id: g.id,
            giveaway_id: g.giveaway_id,
            user_id: g.fingerprint_id,
            score: g.score || 0,
            taps: g.taps || 0,
            best_streak: g.best_streak || 0,
            rank: null,
            joined_at: g.joined_at,
            completed_at: g.completed_at,
            is_winner: g.is_winner || false,
            user: {
                id: g.fingerprint_id,
                username: g.guest_name || 'Guest',
                display_name: g.guest_name || 'Guest',
                avatar_url: null,
                trust_tier: 'bronze'
            },
            fingerprint_id: g.fingerprint_id,
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
    fingerprint_id: string;
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

