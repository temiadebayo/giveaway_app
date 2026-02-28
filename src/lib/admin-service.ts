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
        const { data, error } = await supabaseAdmin
            .rpc('complete_giveaway', { p_giveaway_id: giveawayId });
        if (error) throw error;
        return data;
    },

    /**
     * Get Pending Withdrawals
     */
    async getPendingWithdrawals() {
        const { data, error } = await supabaseAdmin
            .from('withdrawal_requests')
            .select(`
                *,
                profiles (*)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Get Processing Withdrawals
     */
    async getProcessingWithdrawals() {
        const { data, error } = await supabaseAdmin
            .from('withdrawal_requests')
            .select(`
                *,
                profiles (*)
            `)
            .eq('status', 'processing')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Mark Withdrawal as Processing
     */
    async processWithdrawal(withdrawalId: string) {
        const { data, error } = await supabaseAdmin
            .from('withdrawal_requests')
            .update({ status: 'processing', processed_at: new Date().toISOString() })
            .eq('id', withdrawalId)
            .eq('status', 'pending')
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Approve Withdrawal
     */
    async approveWithdrawal(withdrawalId: string) {
        const { data, error } = await supabaseAdmin
            .rpc('approve_withdrawal', { p_withdrawal_id: withdrawalId });

        if (error) throw error;
        return data;
    },

    /**
     * Reject Withdrawal (refunds balance)
     */
    async rejectWithdrawal(withdrawalId: string) {
        const { data, error } = await supabaseAdmin
            .rpc('reject_withdrawal', { p_withdrawal_id: withdrawalId });

        if (error) throw error;
        return data;
    }

};
