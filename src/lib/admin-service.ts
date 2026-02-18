import { createClient } from "@supabase/supabase-js";

// Admin Whitelist
const ADMIN_EMAILS = [
    "temiadebayo1@gmail.com",
    // Add other admins here
];

// Service Role Client (Bypasses RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export const adminService = {
    /**
     * Check if user is admin based on email
     */
    async checkIsAdmin(email: string | undefined): Promise<boolean> {
        if (!email) return false;
        return ADMIN_EMAILS.includes(email);
    },

    /**
     * Get Overall Stats
     */
    async getStats() {
        const [
            { count: userCount },
            { count: giveawayCount },
            { count: activeGiveawayCount },
            { data: depositSum },
            { data: withdrawnSum }
        ] = await Promise.all([
            supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('giveaways').select('*', { count: 'exact', head: true }),
            supabaseAdmin.from('giveaways').select('*', { count: 'exact', head: true }).eq('status', 'live'),
            supabaseAdmin.from('wallets').select('total_deposited'),
            supabaseAdmin.from('wallets').select('total_withdrawn')
        ]);

        // Calculate totals manually since sum() isn't direct in SDK without RPC usually
        const totalDeposited = depositSum?.reduce((sum, w) => sum + (Number(w.total_deposited) || 0), 0) || 0;
        const totalWithdrawn = withdrawnSum?.reduce((sum, w) => sum + (Number(w.total_withdrawn) || 0), 0) || 0;

        return {
            userCount: userCount || 0,
            giveawayCount: giveawayCount || 0,
            activeGiveawayCount: activeGiveawayCount || 0,
            totalDeposited,
            totalWithdrawn
        };
    },

    /**
     * Get All Users
     */
    async getUsers(page = 1, limit = 50, search = '') {
        let query = supabaseAdmin
            .from('profiles')
            .select(`
                *,
                wallets ( balance, total_earned, total_deposited )
            `)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (search) {
            query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%`);
        }

        const { data, error, count } = await query;
        if (error) throw error;
        return { data, count };
    },

    /**
     * Get Pending Deposits
     */
    async getPendingDeposits() {
        const { data, error } = await supabaseAdmin
            .from('wallet_transactions')
            .select(`
                *,
                profiles ( email, username )
            `)
            .eq('type', 'deposit')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Approve Deposit
     */
    async approveDeposit(transactionId: string) {
        const { data, error } = await supabaseAdmin
            .rpc('approve_deposit', { p_transaction_id: transactionId });

        if (error) throw error;
        return data;
    },

    /**
     * Reject Deposit
     */
    async rejectDeposit(transactionId: string) {
        const { data, error } = await supabaseAdmin
            .rpc('reject_deposit', { p_transaction_id: transactionId });

        if (error) throw error;
        return data;
    },

    /**
     * Get All Giveaways (Admin View)
     */
    async getGiveaways(status?: string) {
        let query = supabaseAdmin
            .from('giveaways')
            .select(`
                *,
                profiles ( username, email )
            `)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    /**
     * Force End / Delete Giveaway
     */
    async endGiveaway(giveawayId: string) {
        // This relies on the complete_giveaway RPC but calling it as admin
        // Note: complete_giveaway checks RLS usually, but RPCs are SECURITY DEFINER so they execute with owner privs.
        // However, we want to call it from here.
        // Since we are checking isAdmin in the server action, we can just call the RPC.
        const { data, error } = await supabaseAdmin
            .rpc('complete_giveaway', { p_giveaway_id: giveawayId });
        if (error) throw error;
        return data;
    }

};
