import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const VALID_CATEGORIES = new Set(['analytics', 'security', 'game', 'financial', 'auth']);
const VALID_SEVERITIES = new Set(['info', 'warning', 'critical']);

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            event_name,
            category = 'analytics',
            severity = 'info',
            properties = {},
            fingerprint_id = null,
            giveaway_id = null,
            page_url = null,
        } = body;

        if (!event_name || typeof event_name !== 'string') {
            return NextResponse.json({ error: 'Missing event_name' }, { status: 400 });
        }
        if (!VALID_CATEGORIES.has(category) || !VALID_SEVERITIES.has(severity)) {
            return NextResponse.json({ error: 'Invalid category or severity' }, { status: 400 });
        }

        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        const headersList = await headers();
        const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
            ?? headersList.get('x-real-ip')
            ?? null;
        const userAgent = headersList.get('user-agent') ?? null;

        const { error } = await supabaseAdmin.from('fps_events').insert({
            user_id: user?.id ?? null,
            fingerprint_id: fingerprint_id ?? null,
            event_name,
            category,
            severity,
            properties: typeof properties === 'object' ? properties : {},
            giveaway_id: giveaway_id ?? null,
            ip_address: ip,
            user_agent: userAgent,
            page_url: page_url ?? null,
        });

        if (error) {
            console.error('[FPS] Insert error:', error.message);
            return NextResponse.json({ error: 'Track failed' }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
