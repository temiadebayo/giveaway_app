import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Server-side Supabase client with service role for guest operations
function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

/**
 * POST - Join giveaway as guest
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: giveawayId } = await params;
        const body = await request.json();
        const { fingerprintId, guestName, sessionToken } = body;

        if (!fingerprintId) {
            return NextResponse.json(
                { success: false, error: 'Fingerprint ID is required' },
                { status: 400 }
            );
        }

        const supabase = getAdminClient();

        // Verify giveaway exists and is active
        const { data: giveaway, error: giveawayError } = await supabase
            .from('giveaways')
            .select('id, status, host_id, prevent_previous_winners_hours')
            .eq('id', giveawayId)
            .single();

        if (giveawayError || !giveaway) {
            return NextResponse.json(
                { success: false, error: 'Giveaway not found' },
                { status: 404 }
            );
        }

        if (!['live', 'scheduled'].includes(giveaway.status)) {
            return NextResponse.json(
                { success: false, error: 'Giveaway is not accepting participants' },
                { status: 400 }
            );
        }

        // Resolve the caller's guest session, or mint one.
        //
        // The session token — not the fingerprint — is what authorises claiming a prize
        // later. A fingerprint is observable by anyone watching the leaderboard, so it can
        // never be the credential. See 20260803100000_phase1_guest_sessions.sql.
        let sessionId: string | null = null;
        let issuedToken: string | null = null;

        if (sessionToken) {
            const { data: resolved } = await supabase.rpc('resolve_guest_session', {
                p_token: sessionToken,
            });
            sessionId = (resolved as string) ?? null;
        }

        if (!sessionId) {
            const { data: minted, error: mintError } = await supabase.rpc('create_guest_session', {
                p_fingerprint: fingerprintId,
                p_user_agent: request.headers.get('user-agent'),
                p_ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
            });

            if (mintError || !minted?.session_id) {
                console.error('Guest session mint error:', mintError?.message);
                return NextResponse.json(
                    { success: false, error: 'Could not start guest session' },
                    { status: 500 }
                );
            }

            sessionId = minted.session_id as string;
            issuedToken = minted.token as string;
        }

        // Check if already joined
        const { data: existing } = await supabase
            .from('guest_participants')
            .select('id')
            .eq('giveaway_id', giveawayId)
            .eq('guest_session_id', sessionId)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({
                success: true,
                alreadyJoined: true,
                sessionId,
                ...(issuedToken ? { sessionToken: issuedToken } : {}),
            });
        }

        // COOLDOWN CHECK: Prevent recent winners of this host from joining.
        // Scoped by session and joined to giveaways properly — the previous version used
        // .filter('giveaways.host_id', ...) on a query with no embedded join, which
        // PostgREST does not evaluate as intended, so the check never actually fired.
        if (giveaway.prevent_previous_winners_hours && giveaway.prevent_previous_winners_hours > 0) {
            const timeThreshold = new Date(
                Date.now() - giveaway.prevent_previous_winners_hours * 60 * 60 * 1000
            ).toISOString();

            const { data: recentWins } = await supabase
                .from('guest_participants')
                .select('id, giveaways!inner(host_id)')
                .eq('guest_session_id', sessionId)
                .eq('is_winner', true)
                .gte('completed_at', timeThreshold)
                .eq('giveaways.host_id', giveaway.host_id)
                .limit(1);

            if (recentWins && recentWins.length > 0) {
                return NextResponse.json(
                    { success: false, error: `You recently won an event from this host. Please wait ${giveaway.prevent_previous_winners_hours} hours from your win before joining their new events.` },
                    { status: 403 }
                );
            }
        }

        // Insert guest participant
        const { error: insertError } = await supabase
            .from('guest_participants')
            .insert({
                giveaway_id: giveawayId,
                guest_session_id: sessionId,
                fingerprint_id: fingerprintId,
                guest_name: guestName || null,
            });

        if (insertError) {
            console.error('Guest join insert error:', insertError.message, insertError.code, insertError.details);
            return NextResponse.json(
                { success: false, error: insertError.message },
                { status: 500 }
            );
        }

        // Force a realtime broadcast to the lobby channel so the Host sees it immediately
        try {
            const channel = supabase.channel(`lobby:${giveawayId}`);
            await new Promise<void>((resolve) => {
                channel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.send({
                            type: 'broadcast',
                            event: 'join',
                            payload: { type: 'guest', fingerprintId, timestamp: Date.now() }
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

        // The raw token is returned exactly once, on the request that minted it. It is
        // never retrievable again — only its SHA-256 hash is stored.
        return NextResponse.json({
            success: true,
            sessionId,
            ...(issuedToken ? { sessionToken: issuedToken } : {}),
        });
    } catch (err) {
        console.error('Guest join error:', err);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET - Get guest participation status
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: giveawayId } = await params;
        const sessionToken = request.nextUrl.searchParams.get('sessionToken');

        if (!sessionToken) {
            return NextResponse.json({ participation: null });
        }

        const supabase = getAdminClient();

        const { data: sessionId } = await supabase.rpc('resolve_guest_session', {
            p_token: sessionToken,
        });

        if (!sessionId) {
            return NextResponse.json({ participation: null });
        }

        // fingerprint_id and linked_user_id are deliberately not selected — the client
        // has no use for them and they should not travel to the browser.
        const { data, error } = await supabase
            .from('guest_participants')
            .select('id, giveaway_id, guest_session_id, guest_name, score, taps, best_streak, joined_at, completed_at, is_winner')
            .eq('giveaway_id', giveawayId)
            .eq('guest_session_id', sessionId)
            .maybeSingle();

        if (error || !data) {
            return NextResponse.json({ participation: null });
        }

        return NextResponse.json({ participation: data });
    } catch (err) {
        console.error('Get guest participation error:', err);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PUT - Submit guest score
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: giveawayId } = await params;
        const body = await request.json();
        const { sessionToken, tapOffsets, clientScore } = body;

        if (!sessionToken) {
            return NextResponse.json(
                { success: false, error: 'Guest session required' },
                { status: 400 }
            );
        }

        if (!Array.isArray(tapOffsets)) {
            return NextResponse.json(
                { success: false, error: 'Tap timings required' },
                { status: 400 }
            );
        }

        const supabase = getAdminClient();

        // Scores are keyed on the session token, not the fingerprint. A fingerprint is
        // readable by anyone; submitting a score for someone else must not be possible.
        const { data: sessionId } = await supabase.rpc('resolve_guest_session', {
            p_token: sessionToken,
        });

        if (!sessionId) {
            return NextResponse.json(
                { success: false, error: 'Invalid guest session' },
                { status: 403 }
            );
        }

        // Scoring, validation, round-state checks, duplicate-submission checks and
        // security event logging all live in submit_guest_score(), which shares its
        // scoring core with the authenticated path. Keeping one implementation is the
        // point: the previous split let the guest route drift to looser bounds than
        // the RPC used for signed-in players.
        const { data: result, error: submitError } = await supabase.rpc('submit_guest_score', {
            p_giveaway_id: giveawayId,
            p_session_id: sessionId,
            p_tap_offsets: tapOffsets,
            p_client_score: typeof clientScore === 'number' ? clientScore : null,
        });

        if (submitError) {
            console.error('Guest score submit error:', submitError.message);
            return NextResponse.json(
                { success: false, error: 'Failed to submit score' },
                { status: 500 }
            );
        }

        if (!result?.success) {
            return NextResponse.json(
                { success: false, error: result?.error || 'Score rejected' },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            score: result.score,
            taps: result.taps,
            best_streak: result.best_streak,
        });
    } catch (err) {
        console.error('Guest score submit error:', err);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
