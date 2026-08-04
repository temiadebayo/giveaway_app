import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface FPSEvent {
    id: string;
    user_id: string | null;
    fingerprint_id: string | null;
    event_name: string;
    category: string;
    severity: string;
    properties: Record<string, unknown>;
    giveaway_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    page_url: string | null;
    created_at: string;
    profiles?: { username: string; display_name: string; email: string } | null;
    giveaways?: { title: string } | null;
}

export interface FPSFunnelStep {
    event: string;
    label: string;
    count: number;
    rate: number;
}

const FUNNEL_STEPS = [
    { event: 'giveaway_viewed',  label: 'Viewed'   },
    { event: 'giveaway_joined',  label: 'Joined'   },
    { event: 'game_completed',   label: 'Played'   },
    { event: 'prize_won',        label: 'Won'      },
    { event: 'prize_claimed',    label: 'Claimed'  },
];

export const fpsService = {
    async getStats(hours = 24) {
        const since = new Date(Date.now() - hours * 3_600_000).toISOString();

        const [total, alerts, viewed, joined, cheats] = await Promise.all([
            supabaseAdmin.from('fps_events').select('*', { count: 'exact', head: true }).gte('created_at', since),
            supabaseAdmin.from('fps_events').select('*', { count: 'exact', head: true }).gte('created_at', since).in('severity', ['warning', 'critical']),
            supabaseAdmin.from('fps_events').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('event_name', 'giveaway_viewed'),
            supabaseAdmin.from('fps_events').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('event_name', 'giveaway_joined'),
            supabaseAdmin.from('fps_events').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('event_name', 'cheat_detected'),
        ]);

        const viewCount = viewed.count || 0;
        const joinCount = joined.count || 0;
        const conversionRate = viewCount > 0 ? Math.round((joinCount / viewCount) * 100) : 0;

        return {
            totalEvents:    total.count   || 0,
            securityAlerts: alerts.count  || 0,
            conversionRate,
            cheatsDetected: cheats.count  || 0,
        };
    },

    async getFunnel(hours = 24 * 7): Promise<FPSFunnelStep[]> {
        const since = new Date(Date.now() - hours * 3_600_000).toISOString();

        const counts = await Promise.all(
            FUNNEL_STEPS.map(s =>
                supabaseAdmin
                    .from('fps_events')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', since)
                    .eq('event_name', s.event)
            )
        );

        const raw = FUNNEL_STEPS.map((s, i) => ({ ...s, count: counts[i].count || 0 }));
        const top = raw[0].count;

        return raw.map(s => ({
            ...s,
            rate: top > 0 ? Math.round((s.count / top) * 100) : 0,
        }));
    },

    async getSecurityEvents(limit = 50): Promise<FPSEvent[]> {
        const { data, error } = await supabaseAdmin
            .from('fps_events')
            .select('*, profiles!user_id(username, display_name, email)')
            .in('severity', ['warning', 'critical'])
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data as FPSEvent[];
    },

    async getRecentEvents(limit = 100, category?: string): Promise<FPSEvent[]> {
        let query = supabaseAdmin
            .from('fps_events')
            .select('*, profiles!user_id(username, display_name), giveaways!giveaway_id(title)')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (category) query = query.eq('category', category);

        const { data, error } = await query;
        if (error) throw error;
        return data as FPSEvent[];
    },

    async getCategoryBreakdown(hours = 24) {
        const since = new Date(Date.now() - hours * 3_600_000).toISOString();
        const categories = ['analytics', 'security', 'game', 'financial', 'auth'] as const;

        const counts = await Promise.all(
            categories.map(cat =>
                supabaseAdmin.from('fps_events').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('category', cat)
            )
        );

        return categories.map((cat, i) => ({ category: cat, count: counts[i].count || 0 }));
    },

    async getGameIntegrityEvents(limit = 30): Promise<FPSEvent[]> {
        const { data, error } = await supabaseAdmin
            .from('fps_events')
            .select('*, profiles!user_id(username, display_name, email), giveaways!giveaway_id(title)')
            .eq('event_name', 'cheat_detected')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data as FPSEvent[];
    },

    async logEvent(params: {
        event_name: string;
        category: 'analytics' | 'security' | 'game' | 'financial' | 'auth';
        severity?: 'info' | 'warning' | 'critical';
        user_id?: string | null;
        fingerprint_id?: string | null;
        giveaway_id?: string | null;
        properties?: Record<string, unknown>;
    }) {
        const { error } = await supabaseAdmin.from('fps_events').insert({
            user_id: params.user_id ?? null,
            fingerprint_id: params.fingerprint_id ?? null,
            event_name: params.event_name,
            category: params.category,
            severity: params.severity ?? 'info',
            properties: params.properties ?? {},
            giveaway_id: params.giveaway_id ?? null,
        });
        if (error) console.error('[FPS] Server log error:', error.message);
    },
};
