import { createClient } from "@supabase/supabase-js";

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
     * Check if a user is an admin.
     *
     * Reads public.admin_users — the single source of truth since Phase 0.
     * The previous implementation compared against a hardcoded email array that was
     * duplicated in the KYC route and disagreed with the profiles.is_host flag used
     * by the SQL functions. See src/lib/admin-auth.ts.
     */
    async checkIsAdmin(email: string | undefined): Promise<boolean> {
        if (!email) return false;

        const { data, error } = await supabaseAdmin
            .from('admin_users')
            .select('user_id')
            .ilike('email', email)
            .maybeSingle();

        if (error) {
            console.error('Admin check failed:', error.message);
            return false;
        }

        return Boolean(data);
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
    async rejectDeposit(transactionId: string, reason?: string) {
        const { data, error } = await supabaseAdmin
            .rpc('reject_deposit', { p_transaction_id: transactionId, p_reason: reason ?? null });

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
        if (data && typeof data === 'object' && data.success === false) {
            throw new Error(data.error || 'Failed to approve withdrawal');
        }
        return data;
    },

    /**
     * Reject Withdrawal (refunds balance)
     */
    async rejectWithdrawal(withdrawalId: string, reason?: string) {
        const { data, error } = await supabaseAdmin
            .rpc('reject_withdrawal', { p_withdrawal_id: withdrawalId, p_reason: reason ?? null });

        if (error) throw error;
        if (data && typeof data === 'object' && data.success === false) {
            throw new Error(data.error || 'Failed to reject withdrawal');
        }
        return data;
    },

    /**
     * Get giveaways with claimed prizes (for dispute management)
     */
    async getClaimedGiveaways() {
        const { data, error } = await supabaseAdmin
            .from('giveaways')
            .select(`
                id, title, prize_amount, prize_currency, status,
                prize_claimed_at, winner_id, host_id,
                winner:profiles!winner_id ( id, email, username, display_name ),
                host:profiles!host_id ( id, email, username, display_name )
            `)
            .eq('status', 'ended')
            .not('prize_claimed_at', 'is', null)
            .order('prize_claimed_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return data;
    },

    /**
     * Admin refund: reverse a claimed prize back to host's wallet.
     * Debits winner wallet, credits host wallet, clears prize claim state.
     */
    async refundPrizeClaim(giveawayId: string, reason: string) {
        const { data: giveaway, error: giveawayError } = await supabaseAdmin
            .from('giveaways')
            .select('id, title, prize_amount, prize_currency, winner_id, host_id, prize_claimed_at')
            .eq('id', giveawayId)
            .single();

        if (giveawayError || !giveaway) throw new Error('Giveaway not found');
        if (!giveaway.prize_claimed_at) throw new Error('Prize has not been claimed — nothing to refund');
        if (!giveaway.winner_id) throw new Error('No winner on record');

        const prizeAmount = Number(giveaway.prize_amount);

        // Fetch winner wallet
        const { data: winnerWallet, error: wwError } = await supabaseAdmin
            .from('wallets')
            .select('id, balance')
            .eq('user_id', giveaway.winner_id)
            .single();

        if (wwError || !winnerWallet) throw new Error('Winner wallet not found');
        if (Number(winnerWallet.balance) < prizeAmount) {
            throw new Error(`Insufficient winner balance: ₦${winnerWallet.balance} < ₦${prizeAmount}`);
        }

        // Debit winner
        const winnerBalanceBefore = Number(winnerWallet.balance);
        const winnerBalanceAfter = winnerBalanceBefore - prizeAmount;

        const { error: debitTxError } = await supabaseAdmin
            .from('wallet_transactions')
            .insert({
                wallet_id: winnerWallet.id,
                user_id: giveaway.winner_id,
                type: 'prize_refund',
                amount: prizeAmount,
                fee: 0,
                net_amount: prizeAmount,
                balance_before: winnerBalanceBefore,
                balance_after: winnerBalanceAfter,
                status: 'completed',
                reference_type: 'giveaway',
                reference_id: giveawayId,
                description: `Admin prize refund: ${reason}`,
            });
        if (debitTxError) throw debitTxError;

        const { error: debitWalletError } = await supabaseAdmin
            .from('wallets')
            .update({ balance: winnerBalanceAfter })
            .eq('id', winnerWallet.id);
        if (debitWalletError) throw debitWalletError;

        // Credit host wallet
        const { data: hostWallet, error: hwError } = await supabaseAdmin
            .from('wallets')
            .select('id, balance')
            .eq('user_id', giveaway.host_id)
            .single();

        if (!hwError && hostWallet) {
            const hostBalanceBefore = Number(hostWallet.balance);
            const hostBalanceAfter = hostBalanceBefore + prizeAmount;

            await supabaseAdmin.from('wallet_transactions').insert({
                wallet_id: hostWallet.id,
                user_id: giveaway.host_id,
                type: 'prize_release',
                amount: prizeAmount,
                fee: 0,
                net_amount: prizeAmount,
                balance_before: hostBalanceBefore,
                balance_after: hostBalanceAfter,
                status: 'completed',
                reference_type: 'giveaway',
                reference_id: giveawayId,
                description: `Prize refunded by admin: ${reason}`,
            });

            await supabaseAdmin
                .from('wallets')
                .update({ balance: hostBalanceAfter })
                .eq('id', hostWallet.id);
        }

        // Clear prize claim on giveaway
        const { error: clearError } = await supabaseAdmin
            .from('giveaways')
            .update({ prize_claimed_at: null })
            .eq('id', giveawayId);
        if (clearError) throw clearError;

        return { success: true, prizeAmount };
    },

};

