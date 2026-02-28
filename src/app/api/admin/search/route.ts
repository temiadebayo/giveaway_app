import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
        return NextResponse.json({ users: [], giveaways: [], transactions: [] });
    }

    const [usersRes, giveawaysRes, transactionsRes] = await Promise.all([
        supabaseAdmin
            .from('profiles')
            .select('id, username, display_name, email, trust_tier, avatar_url')
            .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,email.ilike.%${q}%`)
            .limit(5),
        supabaseAdmin
            .from('giveaways')
            .select('id, title, status, prize_amount, host_id, profiles(username)')
            .or(`title.ilike.%${q}%`)
            .order('created_at', { ascending: false })
            .limit(5),
        supabaseAdmin
            .from('wallet_transactions')
            .select('id, type, amount, status, reference_code, user_id, profiles(username, email)')
            .or(`reference_code.ilike.%${q}%`)
            .order('created_at', { ascending: false })
            .limit(5),
    ]);

    return NextResponse.json({
        users: usersRes.data || [],
        giveaways: giveawaysRes.data || [],
        transactions: transactionsRes.data || [],
    });
}
