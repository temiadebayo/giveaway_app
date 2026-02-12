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
        const { fingerprintId, guestName } = body;

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
            .select('id, status')
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

        // Check if already joined
        const { data: existing } = await supabase
            .from('guest_participants')
            .select('id')
            .eq('giveaway_id', giveawayId)
            .eq('fingerprint_id', fingerprintId)
            .single();

        if (existing) {
            return NextResponse.json({ success: true, alreadyJoined: true });
        }

        // Insert guest participant
        const { error: insertError } = await supabase
            .from('guest_participants')
            .insert({
                giveaway_id: giveawayId,
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

        return NextResponse.json({ success: true });
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
        const fingerprintId = request.nextUrl.searchParams.get('fingerprintId');

        if (!fingerprintId) {
            return NextResponse.json(
                { success: false, error: 'Fingerprint ID is required' },
                { status: 400 }
            );
        }

        const supabase = getAdminClient();

        const { data, error } = await supabase
            .from('guest_participants')
            .select('*')
            .eq('giveaway_id', giveawayId)
            .eq('fingerprint_id', fingerprintId)
            .single();

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
        const { fingerprintId, score, taps, bestStreak } = body;

        if (!fingerprintId) {
            return NextResponse.json(
                { success: false, error: 'Fingerprint ID is required' },
                { status: 400 }
            );
        }

        const supabase = getAdminClient();

        // Check if already submitted
        const { data: existing } = await supabase
            .from('guest_participants')
            .select('completed_at')
            .eq('giveaway_id', giveawayId)
            .eq('fingerprint_id', fingerprintId)
            .single();

        if (existing?.completed_at) {
            return NextResponse.json(
                { success: false, error: 'Score already submitted' },
                { status: 400 }
            );
        }

        // Validate score is humanly possible
        const { data: giveaway } = await supabase
            .from('giveaways')
            .select('game_duration_seconds')
            .eq('id', giveawayId)
            .single();

        const duration = giveaway?.game_duration_seconds || 30;
        const maxTapsPerSecond = 15;
        const SCORE_MULTIPLIER_TOLERANCE = 1.5;

        const maxPossibleTaps = duration * maxTapsPerSecond;
        const maxPossibleScore = taps * 10 * SCORE_MULTIPLIER_TOLERANCE;

        if (taps > maxPossibleTaps || score > maxPossibleScore) {
            return NextResponse.json(
                { success: false, error: 'Invalid score detected' },
                { status: 400 }
            );
        }

        // Update score
        const { error: updateError } = await supabase
            .from('guest_participants')
            .update({
                score,
                taps,
                best_streak: bestStreak,
                completed_at: new Date().toISOString(),
            })
            .eq('giveaway_id', giveawayId)
            .eq('fingerprint_id', fingerprintId);

        if (updateError) {
            console.error('Guest score update error:', updateError.message);
            return NextResponse.json(
                { success: false, error: updateError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Guest score submit error:', err);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
